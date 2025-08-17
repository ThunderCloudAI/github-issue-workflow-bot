import { GitHubService } from './services/github.service';
import { TechLeadAgent } from './agents/tech-lead.agent';
import { RealClaudeRunner } from './claude';
import { 
  GitHubWebhook, 
  WorkflowContext, 
  WorkflowStatus, 
  AgentType, 
  WorkflowError, 
  RetryConfig,
  WorkflowConfig 
} from './types';

export class WorkflowProcessor {
  private githubService: GitHubService;
  private techLeadAgent: TechLeadAgent;
  private config: WorkflowConfig;

  constructor(config: WorkflowConfig) {
    this.config = config;
    this.githubService = new GitHubService(config.github.token);
    
    // Create Claude runner with agent timeout
    const claudeRunner = new RealClaudeRunner(config.agents.tech_lead.timeout);
    this.techLeadAgent = new TechLeadAgent(claudeRunner, config.agents.tech_lead.timeout);
  }

  async processIssue(webhookPayload: GitHubWebhook): Promise<void> {
    let context: WorkflowContext | null = null;
    
    try {
      // Step 1: Parse and validate webhook
      context = await this.retryWithBackoff(
        () => this.parseWebhook(webhookPayload),
        this.config.retry,
        'PARSE_WEBHOOK'
      );

      console.log(`Processing issue ${context.issueNumber}: ${context.title}`);

      // Step 2: Create feature branch
      context = await this.retryWithBackoff(
        () => this.createBranch(context!),
        this.config.retry,
        'CREATE_BRANCH'
      );

      // Step 3: Assign and execute tech lead agent
      context = await this.retryWithBackoff(
        () => this.assignAgent(context!),
        this.config.retry,
        'ASSIGN_AGENT'
      );

      // Step 4: Update status
      await this.retryWithBackoff(
        () => this.updateStatus(context!, WorkflowStatus.COMPLETED),
        this.config.retry,
        'UPDATE_STATUS'
      );

      console.log(`Successfully processed issue ${context.issueNumber}`);

    } catch (error: any) {
      const errorMessage = error instanceof WorkflowError ? error.message : `Unexpected error: ${error.message}`;
      console.error(`Workflow failed for issue ${context?.issueNumber || 'unknown'}:`, errorMessage);
      
      if (context) {
        try {
          await this.updateStatus(context, WorkflowStatus.FAILED, errorMessage);
        } catch (statusError) {
          console.error('Failed to update error status:', statusError);
        }
      }
      
      throw error;
    }
  }

  private async parseWebhook(webhookPayload: GitHubWebhook): Promise<WorkflowContext> {
    if (!this.isValidIssueEvent(webhookPayload)) {
      throw new WorkflowError(
        'Invalid webhook payload or unsupported event',
        'INVALID_WEBHOOK',
        false
      );
    }

    const { issue, repository } = webhookPayload;
    
    const context: WorkflowContext = {
      issueId: issue.id,
      issueNumber: issue.number,
      repository: repository.name,
      owner: repository.owner.login,
      title: issue.title,
      body: issue.body || '',
      labels: issue.labels.map(label => label.name),
      status: WorkflowStatus.PARSING,
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Validate repository access
    const hasAccess = await this.githubService.validateRepository(context.owner, context.repository);
    if (!hasAccess) {
      throw new WorkflowError(
        'No access to repository or repository not found',
        'REPO_ACCESS_DENIED',
        false
      );
    }

    console.log(`Parsed webhook for issue ${context.issueNumber} in ${context.owner}/${context.repository}`);
    return context;
  }

  private async createBranch(context: WorkflowContext): Promise<WorkflowContext> {
    context.status = WorkflowStatus.BRANCH_CREATING;
    context.updatedAt = new Date();

    try {
      await this.githubService.updateIssueStatus(context, 'branch-creating', 'Creating feature branch...');
      
      const branchName = await this.githubService.createBranch(context);
      
      context.branchName = branchName;
      console.log(`Created branch ${branchName} for issue ${context.issueNumber}`);
      
      return context;
    } catch (error) {
      if (error instanceof WorkflowError && !error.retryable) {
        throw error;
      }
      throw new WorkflowError(
        `Branch creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'BRANCH_CREATION_FAILED',
        true,
        error
      );
    }
  }

  private async assignAgent(context: WorkflowContext): Promise<WorkflowContext> {
    context.status = WorkflowStatus.AGENT_ASSIGNED;
    context.agentType = AgentType.TECH_LEAD;
    context.updatedAt = new Date();

    try {
      await this.githubService.updateIssueStatus(context, 'processing', 'Tech lead analyzing requirements...');
      
      if (!this.config.agents.tech_lead.enabled) {
        throw new WorkflowError(
          'Tech lead agent is disabled',
          'AGENT_DISABLED',
          false
        );
      }

      context.status = WorkflowStatus.PROCESSING;
      const result = await this.techLeadAgent.execute(context);
      
      if (!result.success) {
        throw new WorkflowError(
          `Agent execution failed: ${result.error}`,
          'AGENT_EXECUTION_FAILED',
          true,
          result
        );
      }

      // Add tech lead analysis to the issue
      await this.githubService.addTechLeadAnalysis(context, result.output);
      
      console.log(`Tech lead agent completed analysis for issue ${context.issueNumber}`);
      return context;
    } catch (error) {
      if (error instanceof WorkflowError) {
        throw error;
      }
      throw new WorkflowError(
        `Agent assignment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'AGENT_ASSIGNMENT_FAILED',
        true,
        error
      );
    }
  }

  private async updateStatus(context: WorkflowContext, status: WorkflowStatus, details?: string): Promise<void> {
    context.status = status;
    context.updatedAt = new Date();

    try {
      await this.githubService.updateIssueStatus(context, status, details);
      console.log(`Updated status to ${status} for issue ${context.issueNumber}`);
    } catch (error) {
      throw new WorkflowError(
        `Status update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'STATUS_UPDATE_FAILED',
        true,
        error
      );
    }
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    retryConfig: RetryConfig,
    operationType: string
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = retryConfig.initialDelayMs;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 0) {
          console.log(`${operationType} succeeded on attempt ${attempt + 1}`);
        }
        return result;
      } catch (error: any) {
        lastError = error;
        
        // Don't retry if the error is not retryable
        if (error instanceof WorkflowError && !error.retryable) {
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === retryConfig.maxRetries) {
          break;
        }

        console.warn(`${operationType} failed on attempt ${attempt + 1}, retrying in ${delay}ms:`, error.message);
        
        await this.sleep(delay);
        delay = Math.min(delay * retryConfig.backoffMultiplier, retryConfig.maxDelayMs);
      }
    }

    throw new WorkflowError(
      `${operationType} failed after ${retryConfig.maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`,
      'MAX_RETRIES_EXCEEDED',
      false,
      lastError
    );
  }

  private isValidIssueEvent(webhook: GitHubWebhook): boolean {
    return (
      webhook.action === 'opened' &&
      !!webhook.issue &&
      !!webhook.repository &&
      webhook.issue?.state === 'open'
    );
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      // Test GitHub API connectivity
      await this.githubService.validateRepository('octocat', 'Hello-World');
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString()
      };
    }
  }
}