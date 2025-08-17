import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SQSConsumer, SQSConfig } from './sqs-consumer';
import { ISQSClient } from '../aws/sqs-client.interface';

// Test utilities following DRY principle
const createMockSQSClient = (): ISQSClient => ({
  send: vi.fn().mockResolvedValue({}),
});

const createSQSConfig = (): SQSConfig => ({
  region: 'us-east-1',
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue',
  maxMessages: 10,
  waitTimeSeconds: 20,
  visibilityTimeoutSeconds: 300,
});

const createMockProcessor = () => ({
  processWorkflow: vi.fn().mockResolvedValue({}),
  healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
});

describe('SQSConsumer', () => {
  let mockSqsClient: ISQSClient;
  let mockProcessor: any;
  let config: SQSConfig;
  let consumer: SQSConsumer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSqsClient = createMockSQSClient();
    mockProcessor = createMockProcessor();
    config = createSQSConfig();
    consumer = new SQSConsumer(mockProcessor, config, mockSqsClient);
  });

  describe('constructor', () => {
    it('should create instance with provided dependencies', () => {
      expect(consumer).toBeInstanceOf(SQSConsumer);
    });

    it('should create instance without SQS client (uses factory)', () => {
      const consumerWithoutClient = new SQSConsumer(mockProcessor, config);
      expect(consumerWithoutClient).toBeInstanceOf(SQSConsumer);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status when configured correctly', async () => {
      const health = await consumer.healthCheck();

      expect(health).toEqual({
        status: 'healthy',
        timestamp: expect.any(String),
        queueUrl: config.queueUrl,
      });
    });

    it('should handle SQS client errors gracefully', async () => {
      const errorClient = createMockSQSClient();
      errorClient.send = vi.fn().mockRejectedValue(new Error('SQS connection failed'));
      
      const errorConsumer = new SQSConsumer(mockProcessor, config, errorClient);
      const health = await errorConsumer.healthCheck();

      expect(health.status).toBe('unhealthy');
    });
  });

  describe('configuration validation', () => {
    it('should handle valid configuration', () => {
      expect((consumer as any).config).toEqual(config);
      expect((consumer as any).sqsClient).toBe(mockSqsClient);
    });
  });
});