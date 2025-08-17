import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { WebhookHandler, WebhookConfig } from './webhook-handler';
import { WorkflowError } from './types';
import { mockGitHubWebhook } from './test/fixtures';
import { MockSQSClient } from './aws/sqs-client.mock';

// Mock AWS SDK commands for actual SQS client wrapper
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn(),
  SendMessageCommand: vi.fn(input => ({ input })),
}));

const mockWebhookConfig: WebhookConfig = {
  port: 3000,
  secret: 'test-secret',
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue',
  awsRegion: 'us-east-1',
};

describe('WebhookHandler', () => {
  let webhookHandler: WebhookHandler;
  let app: express.Application;
  let mockSQSClient: MockSQSClient;

  const generateSignature = (payload: string, secret: string): string => {
    return `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock SQS client and inject it
    mockSQSClient = new MockSQSClient();
    webhookHandler = new WebhookHandler(mockWebhookConfig, mockSQSClient);
    app = (webhookHandler as any).app;
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect((webhookHandler as any).config).toEqual(mockWebhookConfig);
      expect((webhookHandler as any).sqsClient).toBe(mockSQSClient);
    });
  });

  describe('health endpoint', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        service: 'github-webhook-handler',
      });
    });
  });

  describe('webhook endpoint', () => {
    it('should successfully process valid webhook', async () => {
      const payload = JSON.stringify(mockGitHubWebhook);
      const signature = generateSignature(payload, mockWebhookConfig.secret);

      mockSQSClient.setResponse('SendMessageCommand', {});

      const response = await request(app)
        .post('/webhook')
        .set('x-hub-signature-256', signature)
        .set('content-type', 'application/json')
        .send(payload)
        .expect(200);

      expect(response.body).toEqual({
        message: 'Webhook received and queued for processing',
        issueNumber: mockGitHubWebhook.issue.number,
      });
      expect(mockSQSClient.getCalls()).toHaveLength(1);
    });

    it('should reject webhook with invalid signature', async () => {
      const payload = JSON.stringify(mockGitHubWebhook);
      const invalidSignature = 'sha256=invalid';

      const response = await request(app)
        .post('/webhook')
        .set('x-hub-signature-256', invalidSignature)
        .set('content-type', 'application/json')
        .send(payload)
        .expect(401);

      expect(response.body).toEqual({ error: 'Invalid signature' });
      expect(mockSQSClient.getCalls()).toHaveLength(0);
    });

    it('should reject webhook without signature', async () => {
      const payload = JSON.stringify(mockGitHubWebhook);

      const response = await request(app)
        .post('/webhook')
        .set('content-type', 'application/json')
        .send(payload)
        .expect(401);

      expect(response.body).toEqual({ error: 'Invalid signature' });
      expect(mockSQSClient.getCalls()).toHaveLength(0);
    });

    it('should ignore non-opened issue events', async () => {
      const closedIssueWebhook = { ...mockGitHubWebhook, action: 'closed' };
      const payload = JSON.stringify(closedIssueWebhook);
      const signature = generateSignature(payload, mockWebhookConfig.secret);

      const response = await request(app)
        .post('/webhook')
        .set('x-hub-signature-256', signature)
        .set('content-type', 'application/json')
        .send(payload)
        .expect(200);

      expect(response.body).toEqual({ message: 'Event ignored' });
      expect(mockSQSClient.getCalls()).toHaveLength(0);
    });

    it('should ignore issues with ignored labels', async () => {
      const ignoredWebhook = {
        ...mockGitHubWebhook,
        issue: {
          ...mockGitHubWebhook.issue,
          labels: [{ id: 1, name: 'wontfix', color: 'red', description: null }],
        },
      };
      const payload = JSON.stringify(ignoredWebhook);
      const signature = generateSignature(payload, mockWebhookConfig.secret);

      const response = await request(app)
        .post('/webhook')
        .set('content-type', 'application/json')
        .set('x-hub-signature-256', signature)
        .send(payload)
        .expect(200);

      expect(response.body).toEqual({ message: 'Event ignored' });
      expect(mockSQSClient.getCalls()).toHaveLength(0);
    });

    it('should ignore issues with workflow labels', async () => {
      const workflowWebhook = {
        ...mockGitHubWebhook,
        issue: {
          ...mockGitHubWebhook.issue,
          labels: [{ id: 1, name: 'workflow:processing', color: 'blue', description: null }],
        },
      };
      const payload = JSON.stringify(workflowWebhook);
      const signature = generateSignature(payload, mockWebhookConfig.secret);

      const response = await request(app)
        .post('/webhook')
        .set('content-type', 'application/json')
        .set('x-hub-signature-256', signature)
        .send(payload)
        .expect(200);

      expect(response.body).toEqual({ message: 'Event ignored' });
      expect(mockSQSClient.getCalls()).toHaveLength(0);
    });

    it('should handle SQS enqueue errors', async () => {
      const payload = JSON.stringify(mockGitHubWebhook);
      const signature = generateSignature(payload, mockWebhookConfig.secret);

      mockSQSClient.setError('SendMessageCommand', new Error('SQS error'));

      const response = await request(app)
        .post('/webhook')
        .set('x-hub-signature-256', signature)
        .set('content-type', 'application/json')
        .send(payload)
        .expect(400);

      expect(response.body).toEqual({ error: 'Failed to enqueue webhook: SQS error' });
    });

    it('should handle invalid JSON payload', async () => {
      const invalidPayload = 'invalid json';
      const signature = generateSignature(invalidPayload, mockWebhookConfig.secret);

      const response = await request(app)
        .post('/webhook')
        .set('x-hub-signature-256', signature)
        .set('content-type', 'application/json')
        .send(invalidPayload)
        .expect(500);

      expect(response.body).toEqual({ error: 'Failed to process webhook' });
    });

    it('should handle WorkflowError appropriately', async () => {
      const payload = JSON.stringify(mockGitHubWebhook);
      const signature = generateSignature(payload, mockWebhookConfig.secret);

      // Mock enqueueWebhook to throw WorkflowError
      const enqueueWebhookSpy = vi
        .spyOn(webhookHandler as any, 'enqueueWebhook')
        .mockRejectedValue(new WorkflowError('Test workflow error', 'TEST_ERROR'));

      const response = await request(app)
        .post('/webhook')
        .set('x-hub-signature-256', signature)
        .set('content-type', 'application/json')
        .send(payload)
        .expect(400);

      expect(response.body).toEqual({ error: 'Test workflow error' });
    });
  });

  describe('signature verification', () => {
    it('should verify valid signatures correctly', () => {
      const payload = Buffer.from('test payload');
      const validSignature = `sha256=${crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex')}`;

      const isValid = (webhookHandler as any).verifySignature(validSignature, payload);

      expect(isValid).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const payload = Buffer.from('test payload');
      const invalidSignature = 'sha256=invalid';

      const isValid = (webhookHandler as any).verifySignature(invalidSignature, payload);

      expect(isValid).toBe(false);
    });

    it('should handle missing signatures', () => {
      const payload = Buffer.from('test payload');

      const isValid = (webhookHandler as any).verifySignature('', payload);

      expect(isValid).toBe(false);
    });

    it('should handle signature verification errors', () => {
      const payload = Buffer.from('test payload');
      const consoleSpy = vi.spyOn(console, 'error');

      // Spy on crypto.timingSafeEqual and make it throw
      const timingSafeEqualSpy = vi.spyOn(crypto, 'timingSafeEqual').mockImplementation(() => {
        throw new Error('Crypto error');
      });

      const isValid = (webhookHandler as any).verifySignature('sha256=test', payload);

      expect(isValid).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Signature verification failed:', expect.any(Error));

      timingSafeEqualSpy.mockRestore();
    });
  });

  describe('shouldProcessWebhook', () => {
    it('should process opened issues', () => {
      const shouldProcess = (webhookHandler as any).shouldProcessWebhook(mockGitHubWebhook);
      expect(shouldProcess).toBe(true);
    });

    it('should not process closed issues', () => {
      const closedWebhook = { ...mockGitHubWebhook, action: 'closed' };
      const shouldProcess = (webhookHandler as any).shouldProcessWebhook(closedWebhook);
      expect(shouldProcess).toBe(false);
    });

    it('should not process issues that are not open', () => {
      const closedIssueWebhook = {
        ...mockGitHubWebhook,
        issue: { ...mockGitHubWebhook.issue, state: 'closed' as const },
      };
      const shouldProcess = (webhookHandler as any).shouldProcessWebhook(closedIssueWebhook);
      expect(shouldProcess).toBe(false);
    });

    it('should not process issues without issue object', () => {
      const noIssueWebhook = { ...mockGitHubWebhook, issue: null };
      const shouldProcess = (webhookHandler as any).shouldProcessWebhook(noIssueWebhook);
      expect(shouldProcess).toBe(false);
    });

    it('should not process issues with ignored labels', () => {
      const ignoredLabels = ['wontfix', 'duplicate', 'invalid', 'question'];

      for (const labelName of ignoredLabels) {
        const webhook = {
          ...mockGitHubWebhook,
          issue: {
            ...mockGitHubWebhook.issue,
            labels: [{ id: 1, name: labelName, color: 'red', description: null }],
          },
        };
        const shouldProcess = (webhookHandler as any).shouldProcessWebhook(webhook);
        expect(shouldProcess).toBe(false);
      }
    });

    it('should not process issues with workflow labels', () => {
      const workflowWebhook = {
        ...mockGitHubWebhook,
        issue: {
          ...mockGitHubWebhook.issue,
          labels: [{ id: 1, name: 'workflow:processing', color: 'blue', description: null }],
        },
      };
      const shouldProcess = (webhookHandler as any).shouldProcessWebhook(workflowWebhook);
      expect(shouldProcess).toBe(false);
    });

    it('should handle case-insensitive label matching', () => {
      const uppercaseWebhook = {
        ...mockGitHubWebhook,
        issue: {
          ...mockGitHubWebhook.issue,
          labels: [{ id: 1, name: 'WONTFIX', color: 'red', description: null }],
        },
      };
      const shouldProcess = (webhookHandler as any).shouldProcessWebhook(uppercaseWebhook);
      expect(shouldProcess).toBe(false);
    });
  });

  describe('enqueueWebhook', () => {
    it('should send message to SQS with correct attributes', async () => {
      await (webhookHandler as any).enqueueWebhook(mockGitHubWebhook);

      // Verify the mock SQS client was called
      expect(mockSQSClient.getCallCount()).toBe(1);

      // Check if the correct command was sent with proper input
      const expectedInput = {
        QueueUrl: mockWebhookConfig.queueUrl,
        MessageBody: JSON.stringify(mockGitHubWebhook),
        MessageAttributes: {
          'event-type': {
            DataType: 'String',
            StringValue: 'github-issue-opened',
          },
          repository: {
            DataType: 'String',
            StringValue: mockGitHubWebhook.repository.full_name,
          },
          'issue-number': {
            DataType: 'Number',
            StringValue: mockGitHubWebhook.issue.number.toString(),
          },
        },
      };

      expect(mockSQSClient.wasCalledWith('SendMessageCommand', expectedInput)).toBe(true);
    });

    it('should throw WorkflowError on SQS failure', async () => {
      mockSQSClient.setError('SendMessageCommand', new Error('SQS send failed'));

      await expect((webhookHandler as any).enqueueWebhook(mockGitHubWebhook)).rejects.toThrow(
        WorkflowError
      );

      try {
        await (webhookHandler as any).enqueueWebhook(mockGitHubWebhook);
      } catch (error) {
        expect((error as WorkflowError).code).toBe('ENQUEUE_FAILED');
        expect((error as WorkflowError).retryable).toBe(true);
      }
    });
  });

  describe('start method', () => {
    it('should start the server on configured port', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      // Mock express app.listen to immediately call callback
      const mockListen = vi.fn((port, callback) => {
        callback();
        return { close: vi.fn() };
      });
      (webhookHandler as any).app.listen = mockListen;

      await webhookHandler.start();

      expect(mockListen).toHaveBeenCalledWith(mockWebhookConfig.port, expect.any(Function));
      expect(consoleSpy).toHaveBeenCalledWith(
        `Webhook handler listening on port ${mockWebhookConfig.port}`
      );
    });
  });
});
