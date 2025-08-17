import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { WorkflowProcessor } from '../workflow-processor';
import { WebhookHandler } from '../webhook-handler';
import { SQSConsumer } from '../queue/sqs-consumer';
import { GitHubService } from '../services/github.service';
import { TechLeadAgent } from '../agents/tech-lead.agent';
import { WorkflowConfig } from '../types';
import { mockGitHubWebhook, mockOctokitResponse, mockAgentResult } from './fixtures';
import { MockSQSClient } from '../aws/sqs-client.mock';

// Mock AWS SDK and Octokit
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn(),
  SendMessageCommand: vi.fn((input) => ({ input })),
  ReceiveMessageCommand: vi.fn((input) => ({ input })),
  DeleteMessageCommand: vi.fn((input) => ({ input })),
}));

const mockOctokit = {
  repos: {
    getBranch: vi.fn(),
    get: vi.fn(),
  },
  git: {
    createRef: vi.fn(),
  },
  issues: {
    createComment: vi.fn(),
    addLabels: vi.fn(),
  },
  pulls: {
    create: vi.fn(),
  },
};

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => mockOctokit),
}));

// Mock Claude runner for integration tests
vi.mock('../claude', () => ({
  MockClaudeRunner: vi.fn(() => ({
    runPrompt: vi.fn().mockResolvedValue('Mock tech lead analysis'),
    setResponse: vi.fn(),
    setError: vi.fn(),
    setDelay: vi.fn(),
  })),
  RealClaudeRunner: vi.fn(() => ({
    runPrompt: vi.fn().mockResolvedValue('Mock tech lead analysis'),
  })),
}));

const testConfig: WorkflowConfig = {
  github: {
    token: 'test-token',
    webhookSecret: 'test-secret',
  },
  retry: {
    maxRetries: 2,
    initialDelayMs: 100,
    maxDelayMs: 500,
    backoffMultiplier: 2,
  },
  agents: {
    tech_lead: {
      enabled: true,
      timeout: 10000,
    },
    worker: {
      enabled: true,
      timeout: 10000,
    },
    qa: {
      enabled: true,
      timeout: 10000,
    },
  },
};

const webhookConfig = {
  port: 3001,
  secret: testConfig.github.webhookSecret,
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/integration-test-queue',
  awsRegion: 'us-east-1',
};

const sqsConfig = {
  region: 'us-east-1',
  queueUrl: webhookConfig.queueUrl,
  maxMessages: 1,
  waitTimeSeconds: 1,
  visibilityTimeoutSeconds: 30,
};

describe('Integration Tests', () => {
  let processor: WorkflowProcessor;
  let webhookHandler: WebhookHandler;
  let sqsConsumer: SQSConsumer;
  let mockSQSClient: MockSQSClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock SQS client
    mockSQSClient = new MockSQSClient();

    // Reset mocks
    mockSQSClient.reset();
    Object.values(mockOctokit.repos).forEach(fn => (fn as any).mockClear());
    Object.values(mockOctokit.git).forEach(fn => (fn as any).mockClear());
    Object.values(mockOctokit.issues).forEach(fn => (fn as any).mockClear());
    Object.values(mockOctokit.pulls).forEach(fn => (fn as any).mockClear());

    // Initialize components with injected mock SQS client
    processor = new WorkflowProcessor(testConfig);
    webhookHandler = new WebhookHandler(webhookConfig, mockSQSClient);
    sqsConsumer = new SQSConsumer(processor, sqsConfig, mockSQSClient);
  });

  describe('End-to-End Workflow', () => {
    it('should process a complete workflow from webhook to completion', async () => {
      // Setup successful mocks
      mockOctokit.repos.getBranch.mockResolvedValue(mockOctokitResponse.repos.getBranch);
      mockOctokit.git.createRef.mockResolvedValue(mockOctokitResponse.git.createRef);
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);
      mockOctokit.issues.addLabels.mockResolvedValue(mockOctokitResponse.issues.addLabels);
      mockOctokit.repos.get.mockResolvedValue(mockOctokitResponse.repos.get);

      // Configure mock SQS responses
      mockSQSClient.setResponse('SendMessageCommand', {});
      mockSQSClient.setResponse('ReceiveMessageCommand', {
        Messages: [{
          MessageId: 'test-message-id',
          ReceiptHandle: 'test-receipt-handle',
          Body: JSON.stringify(mockGitHubWebhook),
        }],
      });
      mockSQSClient.setResponse('DeleteMessageCommand', {});

      // 1. Simulate webhook receipt
      const payload = JSON.stringify(mockGitHubWebhook);
      const signature = `sha256=${crypto.createHmac('sha256', testConfig.github.webhookSecret)
        .update(payload).digest('hex')}`;

      const app = (webhookHandler as any).app;
      const webhookResponse = await request(app)
        .post('/webhook')
        .set('x-hub-signature-256', signature)
        .set('content-type', 'application/json')
        .send(payload)
        .expect(200);

      expect(webhookResponse.body).toEqual({
        message: 'Webhook received and queued for processing',
        issueNumber: mockGitHubWebhook.issue.number,
      });

      // Verify message was sent to SQS
      expect(mockSQSClient.getCallCount()).toBe(1);
      
      // Debug: Check what was actually called
      const calls = mockSQSClient.getCalls();
      console.log('SQS Calls:', JSON.stringify(calls, null, 2));
      
      // More lenient check for now
      expect(mockSQSClient.getCallCountForCommand('SendMessageCommand')).toBe(1);

      // 2. Simulate SQS message processing
      await (sqsConsumer as any).processMessage({
        MessageId: 'test-message-id',
        ReceiptHandle: 'test-receipt-handle',
        Body: payload,
      });

      // Verify the complete workflow was executed
      expect(mockOctokit.repos.get).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
      });

      expect(mockOctokit.repos.getBranch).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
        branch: 'main',
      });

      expect(mockOctokit.git.createRef).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
        ref: expect.stringMatching(/^refs\/heads\/feature\/issue-123-\d+$/),
        sha: 'abc123def456',
      });

      // Verify tech lead analysis was added
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'testuser',
          repo: 'test-repo',
          issue_number: 123,
          body: expect.stringContaining('## 🤖 Tech Lead Analysis'),
        })
      );

      // Verify status updates
      expect(mockOctokit.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'testuser',
          repo: 'test-repo',
          issue_number: 123,
          labels: expect.arrayContaining([expect.stringMatching(/^workflow:/)])
        })
      );

      // Verify message was deleted from SQS
      expect(mockSQSClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            QueueUrl: webhookConfig.queueUrl,
            ReceiptHandle: 'test-receipt-handle',
          }),
        })
      );
    });

    it('should handle workflow failures gracefully', async () => {
      // Setup failure scenario - repository access denied
      mockOctokit.repos.get.mockRejectedValue(new Error('Repository not found'));

      const payload = JSON.stringify(mockGitHubWebhook);
      
      // Simulate message processing with failure
      const consoleSpy = vi.spyOn(console, 'error');

      await (sqsConsumer as any).processMessage({
        MessageId: 'test-message-id',
        ReceiptHandle: 'test-receipt-handle',
        Body: payload,
      });

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to process message test-message-id:',
        expect.any(Error)
      );

      // Verify that failure status was attempted to be updated
      // (this might fail too, but the attempt should be made)
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('## 🔄 Workflow Status Update'),
        })
      );
    });
  });

  describe('Component Integration', () => {
    it('should integrate GitHubService with TechLeadAgent', async () => {
      // Setup successful GitHub API responses
      mockOctokit.repos.get.mockResolvedValue(mockOctokitResponse.repos.get);
      mockOctokit.repos.getBranch.mockResolvedValue(mockOctokitResponse.repos.getBranch);
      mockOctokit.git.createRef.mockResolvedValue(mockOctokitResponse.git.createRef);
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);
      mockOctokit.issues.addLabels.mockResolvedValue(mockOctokitResponse.issues.addLabels);

      // Process the webhook directly through the processor
      await processor.processIssue(mockGitHubWebhook);

      // Verify integration between components
      expect(mockOctokit.repos.get).toHaveBeenCalled(); // Repository validation
      expect(mockOctokit.git.createRef).toHaveBeenCalled(); // Branch creation
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('## 🤖 Tech Lead Analysis'),
        })
      ); // Tech lead analysis
    });

    it('should handle agent failures with proper error reporting', async () => {
      // Setup GitHub API to succeed but simulate agent timeout
      mockOctokit.repos.get.mockResolvedValue(mockOctokitResponse.repos.get);
      mockOctokit.repos.getBranch.mockResolvedValue(mockOctokitResponse.repos.getBranch);
      mockOctokit.git.createRef.mockResolvedValue(mockOctokitResponse.git.createRef);
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);
      mockOctokit.issues.addLabels.mockResolvedValue(mockOctokitResponse.issues.addLabels);

      // Create a processor with very short timeout to trigger timeout
      const shortTimeoutConfig = {
        ...testConfig,
        agents: {
          ...testConfig.agents,
          tech_lead: { enabled: true, timeout: 1 }, // 1ms timeout
        },
      };
      const timeoutProcessor = new WorkflowProcessor(shortTimeoutConfig);

      try {
        await timeoutProcessor.processIssue(mockGitHubWebhook);
      } catch (error) {
        // Error is expected
      }

      // Verify error status was reported to GitHub
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('**Status:** failed'),
        })
      );
    });
  });

  describe('Retry Mechanism Integration', () => {
    it('should retry transient failures and eventually succeed', async () => {
      // Setup branch creation to fail twice then succeed
      let branchCallCount = 0;
      mockOctokit.repos.get.mockResolvedValue(mockOctokitResponse.repos.get);
      mockOctokit.repos.getBranch.mockResolvedValue(mockOctokitResponse.repos.getBranch);
      mockOctokit.git.createRef.mockImplementation(() => {
        branchCallCount++;
        if (branchCallCount < 3) {
          throw new Error('Transient network error');
        }
        return mockOctokitResponse.git.createRef;
      });
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);
      mockOctokit.issues.addLabels.mockResolvedValue(mockOctokitResponse.issues.addLabels);

      await processor.processIssue(mockGitHubWebhook);

      // Verify branch creation was retried
      expect(mockOctokit.git.createRef).toHaveBeenCalledTimes(3);
      
      // Verify workflow completed successfully
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('## 🤖 Tech Lead Analysis'),
        })
      );
    });

    it('should fail after exhausting retries', async () => {
      // Setup branch creation to always fail
      mockOctokit.repos.get.mockResolvedValue(mockOctokitResponse.repos.get);
      mockOctokit.repos.getBranch.mockResolvedValue(mockOctokitResponse.repos.getBranch);
      mockOctokit.git.createRef.mockRejectedValue(new Error('Persistent failure'));
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);
      mockOctokit.issues.addLabels.mockResolvedValue(mockOctokitResponse.issues.addLabels);

      await expect(processor.processIssue(mockGitHubWebhook))
        .rejects.toThrow();

      // Verify all retries were attempted (initial + 2 retries = 3 total)
      expect(mockOctokit.git.createRef).toHaveBeenCalledTimes(3);
      
      // Verify failure status was reported
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('**Status:** failed'),
        })
      );
    });
  });

  describe('Health Check Integration', () => {
    it('should perform health checks across all components', async () => {
      // Setup successful GitHub API response for health check
      mockOctokit.repos.get.mockResolvedValue(mockOctokitResponse.repos.get);
      
      // Setup successful SQS response for health check
      mockSQSClient.setResponse('ReceiveMessageCommand', {});

      const processorHealth = await processor.healthCheck();
      const consumerHealth = await sqsConsumer.healthCheck();

      expect(processorHealth.status).toBe('healthy');
      expect(consumerHealth.status).toBe('healthy');
      
      expect(mockOctokit.repos.get).toHaveBeenCalledWith({
        owner: 'octocat',
        repo: 'Hello-World',
      });
    });

    it('should detect unhealthy components', async () => {
      // Setup GitHub API to fail
      mockOctokit.repos.get.mockRejectedValue(new Error('GitHub API down'));
      
      // Setup SQS to fail
      mockSQSClient.setError('ReceiveMessageCommand', new Error('SQS unavailable'));

      const processorHealth = await processor.healthCheck();
      const consumerHealth = await sqsConsumer.healthCheck();

      expect(processorHealth.status).toBe('unhealthy');
      expect(consumerHealth.status).toBe('unhealthy');
    });
  });

  describe('Configuration Integration', () => {
    it('should apply configuration across all components', () => {
      expect((processor as any).config).toEqual(testConfig);
      expect((webhookHandler as any).config).toEqual(webhookConfig);
      expect((sqsConsumer as any).config).toEqual(sqsConfig);
    });

    it('should respect agent enablement configuration', async () => {
      // Create processor with disabled tech lead agent
      const disabledConfig = {
        ...testConfig,
        agents: {
          ...testConfig.agents,
          tech_lead: { enabled: false, timeout: 10000 },
        },
      };
      
      const disabledProcessor = new WorkflowProcessor(disabledConfig);
      
      mockOctokit.repos.get.mockResolvedValue(mockOctokitResponse.repos.get);
      mockOctokit.repos.getBranch.mockResolvedValue(mockOctokitResponse.repos.getBranch);
      mockOctokit.git.createRef.mockResolvedValue(mockOctokitResponse.git.createRef);
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);
      mockOctokit.issues.addLabels.mockResolvedValue(mockOctokitResponse.issues.addLabels);

      await expect(disabledProcessor.processIssue(mockGitHubWebhook))
        .rejects.toThrow('Tech lead agent is disabled');
    });
  });
});