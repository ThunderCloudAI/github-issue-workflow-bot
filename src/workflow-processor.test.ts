import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowProcessor } from './workflow-processor';
import { GitHubService } from './services/github.service';
import { TechLeadAgent } from './agents/tech-lead.agent';
import { WorkflowConfig, WorkflowError, WorkflowStatus, AgentType } from './types';
import { mockGitHubWebhook, mockWorkflowContext, mockAgentResult } from './test/fixtures';

// Mock dependencies
vi.mock('./services/github.service');
vi.mock('./agents/tech-lead.agent');

const mockConfig: WorkflowConfig = {
  github: {
    token: 'test-token',
    webhookSecret: 'test-secret',
  },
  retry: {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
  },
  agents: {
    tech_lead: {
      enabled: true,
      timeout: 30000,
    },
    worker: {
      enabled: true,
      timeout: 300000,
    },
    qa: {
      enabled: true,
      timeout: 60000,
    },
  },
};

describe('WorkflowProcessor', () => {
  let processor: WorkflowProcessor;
  let mockGitHubService: any;
  let mockTechLeadAgent: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks
    mockGitHubService = {
      validateRepository: vi.fn(),
      createBranch: vi.fn(),
      updateIssueStatus: vi.fn(),
      addTechLeadAnalysis: vi.fn(),
    };
    
    mockTechLeadAgent = {
      execute: vi.fn(),
    };

    // Mock constructors
    (GitHubService as any).mockImplementation(() => mockGitHubService);
    (TechLeadAgent as any).mockImplementation(() => mockTechLeadAgent);

    processor = new WorkflowProcessor(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(GitHubService).toHaveBeenCalledWith('test-token');
      expect(TechLeadAgent).toHaveBeenCalledWith(expect.any(Object), 30000);
    });
  });

  describe('processIssue', () => {
    beforeEach(() => {
      mockGitHubService.validateRepository.mockResolvedValue(true);
      mockGitHubService.createBranch.mockResolvedValue('feature/issue-123-1234567890');
      mockGitHubService.updateIssueStatus.mockResolvedValue(undefined);
      mockGitHubService.addTechLeadAnalysis.mockResolvedValue(undefined);
      mockTechLeadAgent.execute.mockResolvedValue(mockAgentResult);
    });

    it('should successfully process a complete workflow', async () => {
      await processor.processIssue(mockGitHubWebhook);

      expect(mockGitHubService.validateRepository).toHaveBeenCalledWith('testuser', 'test-repo');
      expect(mockGitHubService.createBranch).toHaveBeenCalled();
      expect(mockTechLeadAgent.execute).toHaveBeenCalled();
      expect(mockGitHubService.addTechLeadAnalysis).toHaveBeenCalledWith(
        expect.any(Object),
        mockAgentResult.output
      );
      expect(mockGitHubService.updateIssueStatus).toHaveBeenCalledWith(
        expect.any(Object),
        WorkflowStatus.COMPLETED,
        undefined
      );
    });

    it('should handle invalid webhook payload', async () => {
      const invalidWebhook = { ...mockGitHubWebhook, action: 'closed' };

      await expect(processor.processIssue(invalidWebhook))
        .rejects.toThrow(WorkflowError);
    });

    it('should handle repository access denied', async () => {
      mockGitHubService.validateRepository.mockResolvedValue(false);

      await expect(processor.processIssue(mockGitHubWebhook))
        .rejects.toThrow(WorkflowError);
      
      try {
        await processor.processIssue(mockGitHubWebhook);
      } catch (error) {
        expect((error as WorkflowError).code).toBe('REPO_ACCESS_DENIED');
        expect((error as WorkflowError).retryable).toBe(false);
      }
    });

    it('should handle branch creation failure', async () => {
      mockGitHubService.createBranch.mockRejectedValue(
        new WorkflowError('Branch creation failed', 'BRANCH_CREATION_FAILED')
      );

      await expect(processor.processIssue(mockGitHubWebhook))
        .rejects.toThrow(WorkflowError);
    });

    it('should handle disabled tech lead agent', async () => {
      const disabledConfig = {
        ...mockConfig,
        agents: {
          ...mockConfig.agents,
          tech_lead: { enabled: false, timeout: 30000 },
        },
      };
      
      const disabledProcessor = new WorkflowProcessor(disabledConfig);

      await expect(disabledProcessor.processIssue(mockGitHubWebhook))
        .rejects.toThrow(WorkflowError);
    });

    it('should handle agent execution failure', async () => {
      mockTechLeadAgent.execute.mockResolvedValue({
        success: false,
        error: 'Agent failed',
        output: '',
      });

      await expect(processor.processIssue(mockGitHubWebhook))
        .rejects.toThrow(WorkflowError);
    });

    it('should update issue status to failed on error', async () => {
      mockGitHubService.createBranch.mockRejectedValue(new Error('Test error'));

      try {
        await processor.processIssue(mockGitHubWebhook);
      } catch {
        // Error is expected
      }

      expect(mockGitHubService.updateIssueStatus).toHaveBeenCalledWith(
        expect.any(Object),
        WorkflowStatus.FAILED,
        expect.stringContaining('Test error')
      );
    });

    it('should handle status update failure during error handling', async () => {
      mockGitHubService.createBranch.mockRejectedValue(new Error('Test error'));
      mockGitHubService.updateIssueStatus.mockRejectedValue(new Error('Status update failed'));

      const consoleSpy = vi.spyOn(console, 'error');

      try {
        await processor.processIssue(mockGitHubWebhook);
      } catch {
        // Error is expected
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to update error status:',
        expect.any(Error)
      );
    });
  });

  describe('retry logic', () => {
    beforeEach(() => {
      mockGitHubService.validateRepository.mockResolvedValue(true);
      mockGitHubService.updateIssueStatus.mockResolvedValue(undefined);
      mockGitHubService.addTechLeadAnalysis.mockResolvedValue(undefined);
      mockTechLeadAgent.execute.mockResolvedValue(mockAgentResult);
    });

    it('should retry transient errors', async () => {
      let callCount = 0;
      mockGitHubService.createBranch.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new WorkflowError('Transient error', 'TRANSIENT', true);
        }
        return 'feature/issue-123-1234567890';
      });

      await processor.processIssue(mockGitHubWebhook);

      expect(mockGitHubService.createBranch).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      mockGitHubService.createBranch.mockRejectedValue(
        new WorkflowError('Non-retryable error', 'NON_RETRYABLE', false)
      );

      await expect(processor.processIssue(mockGitHubWebhook))
        .rejects.toThrow(WorkflowError);

      expect(mockGitHubService.createBranch).toHaveBeenCalledTimes(1);
    });

    it('should fail after max retries', async () => {
      mockGitHubService.createBranch.mockRejectedValue(
        new WorkflowError('Always fails', 'ALWAYS_FAILS', true)
      );

      await expect(processor.processIssue(mockGitHubWebhook))
        .rejects.toThrow(WorkflowError);

      expect(mockGitHubService.createBranch).toHaveBeenCalledTimes(4); // Initial + 3 retries
    });

    it('should apply exponential backoff', async () => {
      const delays: number[] = [];
      const originalSleep = (processor as any).sleep;
      (processor as any).sleep = vi.fn((ms: number) => {
        delays.push(ms);
        return Promise.resolve();
      });

      let callCount = 0;
      mockGitHubService.createBranch.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          throw new WorkflowError('Retry error', 'RETRY', true);
        }
        return 'feature/issue-123-1234567890';
      });

      await processor.processIssue(mockGitHubWebhook);

      expect(delays).toHaveLength(2);
      expect(delays[0]).toBe(100); // Initial delay
      expect(delays[1]).toBe(200); // Doubled delay
    });

    it('should cap delay at maximum', async () => {
      const delays: number[] = [];
      
      // Set a config with small max delay to test capping
      const cappedConfig = {
        ...mockConfig,
        retry: {
          ...mockConfig.retry,
          maxDelayMs: 150,
        },
      };
      const cappedProcessor = new WorkflowProcessor(cappedConfig);
      
      (cappedProcessor as any).sleep = vi.fn((ms: number) => {
        delays.push(ms);
        return Promise.resolve();
      });

      let callCount = 0;
      mockGitHubService.createBranch.mockImplementation(() => {
        callCount++;
        if (callCount < 4) {
          throw new WorkflowError('Retry error', 'RETRY', true);
        }
        return 'feature/issue-123-1234567890';
      });

      await cappedProcessor.processIssue(mockGitHubWebhook);

      expect(delays).toHaveLength(3);
      expect(delays[0]).toBe(100); // Initial delay
      expect(delays[1]).toBe(150); // Capped at max
      expect(delays[2]).toBe(150); // Still capped at max
    });
  });

  describe('webhook validation', () => {
    it('should accept valid issue opened webhook', () => {
      const isValid = (processor as any).isValidIssueEvent(mockGitHubWebhook);
      expect(isValid).toBe(true);
    });

    it('should reject closed issues', () => {
      const closedWebhook = { ...mockGitHubWebhook, action: 'closed' };
      const isValid = (processor as any).isValidIssueEvent(closedWebhook);
      expect(isValid).toBe(false);
    });

    it('should reject webhooks without issue', () => {
      const noIssueWebhook = { ...mockGitHubWebhook, issue: undefined };
      const isValid = (processor as any).isValidIssueEvent(noIssueWebhook);
      expect(isValid).toBe(false);
    });

    it('should reject webhooks without repository', () => {
      const noRepoWebhook = { ...mockGitHubWebhook, repository: undefined };
      const isValid = (processor as any).isValidIssueEvent(noRepoWebhook);
      expect(isValid).toBe(false);
    });

    it('should reject issues that are not open', () => {
      const closedIssueWebhook = {
        ...mockGitHubWebhook,
        issue: { ...mockGitHubWebhook.issue, state: 'closed' as const },
      };
      const isValid = (processor as any).isValidIssueEvent(closedIssueWebhook);
      expect(isValid).toBe(false);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when GitHub API is accessible', async () => {
      mockGitHubService.validateRepository.mockResolvedValue(true);

      const health = await processor.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeDefined();
      expect(mockGitHubService.validateRepository).toHaveBeenCalledWith('octocat', 'Hello-World');
    });

    it('should return unhealthy status when GitHub API is not accessible', async () => {
      mockGitHubService.validateRepository.mockRejectedValue(new Error('API error'));

      const health = await processor.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('context building', () => {
    it('should build correct workflow context from webhook', async () => {
      mockGitHubService.validateRepository.mockResolvedValue(true);
      mockGitHubService.createBranch.mockResolvedValue('test-branch');
      mockGitHubService.updateIssueStatus.mockResolvedValue(undefined);
      mockGitHubService.addTechLeadAnalysis.mockResolvedValue(undefined);
      mockTechLeadAgent.execute.mockResolvedValue(mockAgentResult);

      await processor.processIssue(mockGitHubWebhook);

      const techLeadCall = mockTechLeadAgent.execute.mock.calls[0][0];
      expect(techLeadCall.issueId).toBe(mockGitHubWebhook.issue.id);
      expect(techLeadCall.issueNumber).toBe(mockGitHubWebhook.issue.number);
      expect(techLeadCall.repository).toBe(mockGitHubWebhook.repository.name);
      expect(techLeadCall.owner).toBe(mockGitHubWebhook.repository.owner.login);
      expect(techLeadCall.title).toBe(mockGitHubWebhook.issue.title);
      expect(techLeadCall.body).toBe(mockGitHubWebhook.issue.body);
      expect(techLeadCall.labels).toEqual(['enhancement', 'backend']);
      expect(techLeadCall.branchName).toBe('test-branch');
      expect(techLeadCall.agentType).toBe(AgentType.TECH_LEAD);
    });

    it('should handle null issue body', async () => {
      const webhookWithNullBody = {
        ...mockGitHubWebhook,
        issue: { ...mockGitHubWebhook.issue, body: null },
      };

      mockGitHubService.validateRepository.mockResolvedValue(true);
      mockGitHubService.createBranch.mockResolvedValue('test-branch');
      mockGitHubService.updateIssueStatus.mockResolvedValue(undefined);
      mockGitHubService.addTechLeadAnalysis.mockResolvedValue(undefined);
      mockTechLeadAgent.execute.mockResolvedValue(mockAgentResult);

      await processor.processIssue(webhookWithNullBody);

      const techLeadCall = mockTechLeadAgent.execute.mock.calls[0][0];
      expect(techLeadCall.body).toBe('');
    });
  });

  describe('logging', () => {
    beforeEach(() => {
      mockGitHubService.validateRepository.mockResolvedValue(true);
      mockGitHubService.createBranch.mockResolvedValue('test-branch');
      mockGitHubService.updateIssueStatus.mockResolvedValue(undefined);
      mockGitHubService.addTechLeadAnalysis.mockResolvedValue(undefined);
      mockTechLeadAgent.execute.mockResolvedValue(mockAgentResult);
    });

    it('should log successful processing', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      await processor.processIssue(mockGitHubWebhook);

      expect(consoleSpy).toHaveBeenCalledWith('Processing issue 123: Add user authentication');
      expect(consoleSpy).toHaveBeenCalledWith('Successfully processed issue 123');
    });

    it('should log errors during processing', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      mockGitHubService.createBranch.mockRejectedValue(new Error('Test error'));

      try {
        await processor.processIssue(mockGitHubWebhook);
      } catch {
        // Error is expected
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        'Workflow failed for issue 123:',
        expect.stringContaining('Test error')
      );
    });
  });
});