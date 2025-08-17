import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SQSConsumer, SQSConfig } from './sqs-consumer';
import { WorkflowProcessor } from '../workflow-processor';
import { WorkflowError } from '../types';
import { mockGitHubWebhook, mockSQSMessage } from '../test/fixtures';
import { MockSQSClient } from '../aws/sqs-client.mock';

// Mock AWS SDK commands for actual SQS client wrapper
vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn(),
  ReceiveMessageCommand: vi.fn(input => ({ input })),
  DeleteMessageCommand: vi.fn(input => ({ input })),
}));

const mockSQSConfig: SQSConfig = {
  region: 'us-east-1',
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue',
  maxMessages: 10,
  waitTimeSeconds: 20,
  visibilityTimeoutSeconds: 300,
};

describe('SQSConsumer', () => {
  let consumer: SQSConsumer;
  let mockProcessor: any;
  let mockSQSClient: MockSQSClient;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockProcessor = {
      processIssue: vi.fn(),
    };

    // Create mock SQS client and inject it
    mockSQSClient = new MockSQSClient();
    consumer = new SQSConsumer(mockProcessor, mockSQSConfig, mockSQSClient);
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(consumer).toBeDefined();
      expect((consumer as any).processor).toBe(mockProcessor);
      expect((consumer as any).config).toEqual(mockSQSConfig);
      expect((consumer as any).sqsClient).toBe(mockSQSClient);
    });
  });

  describe('start and stop', () => {
    it('should start polling when not already running', async () => {
      const pollSpy = vi.spyOn(consumer as any, 'pollMessages').mockResolvedValue(undefined);

      // Mock to run only once to avoid infinite loop in test
      let callCount = 0;
      (consumer as any).isRunning = false;
      pollSpy.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          (consumer as any).isRunning = false; // Stop after first call
        }
        return Promise.resolve();
      });

      await consumer.start();

      expect(pollSpy).toHaveBeenCalled();
    });

    it('should not start if already running', async () => {
      (consumer as any).isRunning = true;
      const consoleSpy = vi.spyOn(console, 'log');

      await consumer.start();

      expect(consoleSpy).toHaveBeenCalledWith('Consumer is already running');
    });

    it('should stop polling', () => {
      (consumer as any).isRunning = true;
      const consoleSpy = vi.spyOn(console, 'log');

      consumer.stop();

      expect((consumer as any).isRunning).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('Stopping SQS consumer...');
    });

    it('should handle polling errors with retry delay', async () => {
      const sleepSpy = vi.spyOn(consumer as any, 'sleep').mockResolvedValue(undefined);
      const pollSpy = vi.spyOn(consumer as any, 'pollMessages');

      let callCount = 0;
      pollSpy.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Polling error');
        }
        // Stop after second call
        (consumer as any).isRunning = false;
        return Promise.resolve();
      });

      const consoleSpy = vi.spyOn(console, 'error');

      await consumer.start();

      expect(consoleSpy).toHaveBeenCalledWith('Error in message polling loop:', expect.any(Error));
      expect(sleepSpy).toHaveBeenCalledWith(5000);
    });
  });

  describe('pollMessages', () => {
    beforeEach(async () => {
      const { ReceiveMessageCommand } = await import('@aws-sdk/client-sqs');
      (ReceiveMessageCommand as any).mockClear();
    });

    it('should poll messages from SQS', async () => {
      const { ReceiveMessageCommand } = await import('@aws-sdk/client-sqs');

      mockSQSClient.setResponse('ReceiveMessageCommand', {
        Messages: [mockSQSMessage],
      });

      const processMessageSpy = vi
        .spyOn(consumer as any, 'processMessage')
        .mockResolvedValue(undefined);

      await (consumer as any).pollMessages();

      expect(ReceiveMessageCommand).toHaveBeenCalledWith({
        QueueUrl: mockSQSConfig.queueUrl,
        MaxNumberOfMessages: mockSQSConfig.maxMessages,
        WaitTimeSeconds: mockSQSConfig.waitTimeSeconds,
        VisibilityTimeout: mockSQSConfig.visibilityTimeoutSeconds,
      });
      expect(processMessageSpy).toHaveBeenCalledWith(mockSQSMessage);
    });

    it('should handle empty message response', async () => {
      mockSQSClient.setResponse('ReceiveMessageCommand', { Messages: [] });

      const processMessageSpy = vi
        .spyOn(consumer as any, 'processMessage')
        .mockResolvedValue(undefined);

      await (consumer as any).pollMessages();

      expect(processMessageSpy).not.toHaveBeenCalled();
    });

    it('should handle no messages response', async () => {
      mockSQSClient.setResponse('ReceiveMessageCommand', {});

      const processMessageSpy = vi
        .spyOn(consumer as any, 'processMessage')
        .mockResolvedValue(undefined);

      await (consumer as any).pollMessages();

      expect(processMessageSpy).not.toHaveBeenCalled();
    });

    it('should handle SQS polling errors', async () => {
      mockSQSClient.setError('ReceiveMessageCommand', new Error('SQS error'));

      await expect((consumer as any).pollMessages()).rejects.toThrow('SQS error');
    });

    it('should process multiple messages in parallel', async () => {
      const message2 = { ...mockSQSMessage, MessageId: 'message-2' };
      mockSQSClient.setResponse('ReceiveMessageCommand', {
        Messages: [mockSQSMessage, message2],
      });

      const processMessageSpy = vi
        .spyOn(consumer as any, 'processMessage')
        .mockResolvedValue(undefined);

      await (consumer as any).pollMessages();

      expect(processMessageSpy).toHaveBeenCalledTimes(2);
      expect(processMessageSpy).toHaveBeenCalledWith(mockSQSMessage);
      expect(processMessageSpy).toHaveBeenCalledWith(message2);
    });
  });

  describe('processMessage', () => {
    it('should successfully process a valid message', async () => {
      mockProcessor.processIssue.mockResolvedValue(undefined);
      const deleteMessageSpy = vi
        .spyOn(consumer as any, 'deleteMessage')
        .mockResolvedValue(undefined);

      await (consumer as any).processMessage(mockSQSMessage);

      expect(mockProcessor.processIssue).toHaveBeenCalledWith(mockGitHubWebhook);
      expect(deleteMessageSpy).toHaveBeenCalledWith(mockSQSMessage.ReceiptHandle);
    });

    it('should skip messages without body or receipt handle', async () => {
      const invalidMessage = { MessageId: 'test' };
      const consoleSpy = vi.spyOn(console, 'warn');

      await (consumer as any).processMessage(invalidMessage);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Received message without body or receipt handle, skipping'
      );
      expect(mockProcessor.processIssue).not.toHaveBeenCalled();
    });

    it('should handle processor errors', async () => {
      mockProcessor.processIssue.mockRejectedValue(new Error('Processing error'));
      const consoleSpy = vi.spyOn(console, 'error');

      await (consumer as any).processMessage(mockSQSMessage);

      expect(consoleSpy).toHaveBeenCalledWith(
        `Failed to process message ${mockSQSMessage.MessageId}:`,
        expect.any(Error)
      );
    });

    it('should handle non-retryable errors', async () => {
      const nonRetryableError = new WorkflowError('Non-retryable', 'NON_RETRYABLE', false);
      mockProcessor.processIssue.mockRejectedValue(nonRetryableError);
      const consoleSpy = vi.spyOn(console, 'error');

      await (consumer as any).processMessage(mockSQSMessage);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Non-retryable error, message will be moved to DLQ: Non-retryable'
      );
    });

    it('should log successful processing', async () => {
      mockProcessor.processIssue.mockResolvedValue(undefined);
      vi.spyOn(consumer as any, 'deleteMessage').mockResolvedValue(undefined);
      const consoleSpy = vi.spyOn(console, 'log');

      await (consumer as any).processMessage(mockSQSMessage);

      expect(consoleSpy).toHaveBeenCalledWith(`Processing message: ${mockSQSMessage.MessageId}`);
      expect(consoleSpy).toHaveBeenCalledWith(
        `Successfully processed message: ${mockSQSMessage.MessageId}`
      );
    });
  });

  describe('parseWebhookPayload', () => {
    it('should parse direct webhook payload', () => {
      const directPayload = JSON.stringify(mockGitHubWebhook);

      const result = (consumer as any).parseWebhookPayload(directPayload);

      expect(result).toEqual(mockGitHubWebhook);
    });

    it('should parse SNS wrapped payload', () => {
      const snsPayload = {
        Records: [
          {
            Sns: {
              Message: JSON.stringify(mockGitHubWebhook),
            },
          },
        ],
      };

      const result = (consumer as any).parseWebhookPayload(JSON.stringify(snsPayload));

      expect(result).toEqual(mockGitHubWebhook);
    });

    it('should parse SQS wrapped payload', () => {
      const sqsPayload = {
        Records: [
          {
            body: JSON.stringify(mockGitHubWebhook),
          },
        ],
      };

      const result = (consumer as any).parseWebhookPayload(JSON.stringify(sqsPayload));

      expect(result).toEqual(mockGitHubWebhook);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => {
        (consumer as any).parseWebhookPayload('invalid json');
      }).toThrow(WorkflowError);
    });

    it('should throw error for payload missing required fields', () => {
      const invalidPayload = { action: 'opened' }; // Missing issue and repository

      expect(() => {
        (consumer as any).parseWebhookPayload(JSON.stringify(invalidPayload));
      }).toThrow(WorkflowError);
    });

    it('should include original message body in error context', () => {
      try {
        (consumer as any).parseWebhookPayload('invalid json');
      } catch (error) {
        expect((error as WorkflowError).context).toEqual({ messageBody: 'invalid json' });
      }
    });
  });

  describe('deleteMessage', () => {
    it('should delete message from SQS', async () => {
      const { DeleteMessageCommand } = await import('@aws-sdk/client-sqs');
      mockSQSClient.setResponse('DeleteMessageCommand', {});

      await (consumer as any).deleteMessage('test-receipt-handle');

      expect(DeleteMessageCommand).toHaveBeenCalledWith({
        QueueUrl: mockSQSConfig.queueUrl,
        ReceiptHandle: 'test-receipt-handle',
      });
      expect(mockSQSClient.send).toHaveBeenCalled();
    });

    it('should handle delete errors gracefully', async () => {
      mockSQSClient.setError('DeleteMessageCommand', new Error('Delete failed'));
      const consoleSpy = vi.spyOn(console, 'error');

      await (consumer as any).deleteMessage('test-receipt-handle');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to delete message from SQS:',
        expect.any(Error)
      );
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when SQS is accessible', async () => {
      mockSQSClient.setResponse('ReceiveMessageCommand', {});

      const health = await consumer.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.queueUrl).toBe(mockSQSConfig.queueUrl);
      expect(health.timestamp).toBeDefined();
    });

    it('should return unhealthy status when SQS is not accessible', async () => {
      mockSQSClient.setError('ReceiveMessageCommand', new Error('SQS error'));

      const health = await consumer.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.queueUrl).toBe(mockSQSConfig.queueUrl);
      expect(health.timestamp).toBeDefined();
    });
  });

  describe('sleep utility', () => {
    it('should delay for specified duration', async () => {
      const startTime = Date.now();
      await (consumer as any).sleep(100);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(90);
      expect(endTime - startTime).toBeLessThan(200);
    });
  });
});
