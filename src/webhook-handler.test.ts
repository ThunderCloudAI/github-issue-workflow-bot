import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebhookHandler, WebhookConfig } from './webhook-handler';
import { ISQSClient } from './aws/sqs-client.interface';

// Test utilities following DRY principle
const createMockSqsClient = (): ISQSClient => ({
  send: vi.fn().mockResolvedValue({}),
});

const createWebhookConfig = (): WebhookConfig => ({
  port: 3000,
  secret: 'test-webhook-secret',
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue',
  awsRegion: 'us-east-1',
});

describe('WebhookHandler', () => {
  let mockSqsClient: ISQSClient;
  let config: WebhookConfig;
  let handler: WebhookHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSqsClient = createMockSqsClient();
    config = createWebhookConfig();
    handler = new WebhookHandler(config, mockSqsClient);
  });

  describe('constructor', () => {
    it('should create instance with provided dependencies', () => {
      expect(handler).toBeInstanceOf(WebhookHandler);
    });

    it('should create instance without SQS client (uses factory)', () => {
      const handlerWithoutClient = new WebhookHandler(config);
      expect(handlerWithoutClient).toBeInstanceOf(WebhookHandler);
    });
  });

  describe('configuration', () => {
    it('should store configuration correctly', () => {
      expect((handler as any).config).toEqual(config);
    });

    it('should use provided SQS client', () => {
      expect((handler as any).sqsClient).toBe(mockSqsClient);
    });
  });

  describe('application setup', () => {
    it('should have Express application instance', () => {
      const app = (handler as any).app;
      expect(app).toBeDefined();
      expect(typeof app.listen).toBe('function');
    });
  });

  describe('start method', () => {
    it('should return Promise for server startup', () => {
      // Mock the Express listen method to avoid actual server startup
      const mockListen = vi.fn((port, callback) => {
        callback(); // Call the callback immediately
        return { close: vi.fn() };
      });
      
      (handler as any).app.listen = mockListen;
      
      const startPromise = handler.start();
      expect(startPromise).toBeInstanceOf(Promise);
    });
  });

  describe('private methods access', () => {
    it('should have signature verification method', () => {
      expect(typeof (handler as any).verifySignature).toBe('function');
    });

    it('should have webhook filtering method', () => {
      expect(typeof (handler as any).shouldProcessWebhook).toBe('function');
    });

    it('should have enqueue method', () => {
      expect(typeof (handler as any).enqueueWebhook).toBe('function');
    });
  });
});