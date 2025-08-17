import { WorkflowContext, AgentResult, AgentType, WorkflowError } from '../types';
import { IClaudeRunner } from '../claude';

export abstract class BaseAgent {
  protected readonly type: AgentType;
  protected readonly timeout: number;
  protected readonly claudeRunner: IClaudeRunner;

  constructor(type: AgentType, claudeRunner: IClaudeRunner, timeout: number = 30000) {
    this.type = type;
    this.claudeRunner = claudeRunner;
    this.timeout = timeout;
  }

  async execute(context: WorkflowContext): Promise<AgentResult> {
    const startTime = Date.now();
    
    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new WorkflowError(
            `Agent ${this.type} timed out after ${this.timeout}ms`,
            'AGENT_TIMEOUT',
            true
          ));
        }, this.timeout);
      });

      // Execute agent logic
      const resultPromise = this.processIssue(context);
      
      const result = await Promise.race([resultPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      console.log(`Agent ${this.type} completed in ${duration}ms`);
      
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`Agent ${this.type} failed after ${duration}ms:`, error);
      
      return {
        success: false,
        output: '',
        error: error?.message || 'Unknown agent error'
      };
    }
  }

  /**
   * Children classes should implement this method to do the actual work.
   * This method will do the agent specific work by leveraging the Claude runner.
   * The child class should be responsible for any artifacts that are created by the agent.
   */
  protected abstract processIssue(context: WorkflowContext): Promise<AgentResult>;

  /**
   * Executes a prompt using the injected Claude runner.
   * This method now delegates to the Claude runner implementation.
   */
  protected async runClaude(prompt: string): Promise<string> {
    return this.claudeRunner.runPrompt(prompt, this.timeout);
  }

  protected validateContext(context: WorkflowContext): void {
    if (!context.title || !context.repository || !context.owner) {
      throw new WorkflowError(
        'Invalid workflow context: missing required fields',
        'INVALID_CONTEXT',
        false
      );
    }
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}