import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowProcessor } from './workflow-processor';
import { SQSConsumer } from './queue/sqs-consumer';
import { WebhookHandler } from './webhook-handler';

// Mock all the main components
vi.mock('./workflow-processor');
vi.mock('./queue/sqs-consumer');
vi.mock('./webhook-handler');

describe('Main Application', () => {
  let mockProcessor: any;
  let mockConsumer: any;
  let mockWebhookHandler: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment variables
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
    process.env.SQS_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue';
    process.env.AWS_REGION = 'us-east-1';

    // Setup mocks
    mockProcessor = {
      healthCheck: vi.fn(),
    };

    mockConsumer = {
      healthCheck: vi.fn(),
      start: vi.fn(),
    };

    mockWebhookHandler = {
      start: vi.fn(),
    };

    // Mock constructors
    (WorkflowProcessor as any).mockImplementation(() => mockProcessor);
    (SQSConsumer as any).mockImplementation(() => mockConsumer);
    (WebhookHandler as any).mockImplementation(() => mockWebhookHandler);
  });

  describe('configuration validation', () => {
    it('should validate required environment variables', async () => {
      // Import main function
      const { default: main } = await import('./index');

      // Missing required env var
      delete process.env.GITHUB_TOKEN;

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const consoleSpy = vi.spyOn(console, 'error');

      await main();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to start application:',
        expect.objectContaining({
          message: expect.stringContaining('Missing required environment variables: GITHUB_TOKEN'),
        })
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should pass validation with all required env vars', async () => {
      mockProcessor.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.start.mockResolvedValue(undefined);
      mockWebhookHandler.start.mockResolvedValue(undefined);

      // Import and run main
      const { default: main } = await import('./index');

      // Mock console.log to capture output
      const consoleSpy = vi.spyOn(console, 'log');

      await main();

      expect(consoleSpy).toHaveBeenCalledWith('Starting GitHub Issue Workflow System...');
    });
  });

  describe('health checks', () => {
    it('should perform health checks on all services', async () => {
      mockProcessor.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.start.mockResolvedValue(undefined);
      mockWebhookHandler.start.mockResolvedValue(undefined);

      const { default: main } = await import('./index');

      await main();

      expect(mockProcessor.healthCheck).toHaveBeenCalled();
      expect(mockConsumer.healthCheck).toHaveBeenCalled();
    });

    it('should exit if health checks fail', async () => {
      mockProcessor.healthCheck.mockResolvedValue({ status: 'unhealthy' });
      mockConsumer.healthCheck.mockResolvedValue({ status: 'healthy' });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const consoleSpy = vi.spyOn(console, 'error');

      const { default: main } = await import('./index');

      await main();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to start application:',
        expect.objectContaining({
          message: 'Health checks failed',
        })
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('service startup', () => {
    it('should start all services successfully', async () => {
      mockProcessor.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.start.mockResolvedValue(undefined);
      mockWebhookHandler.start.mockResolvedValue(undefined);

      const consoleSpy = vi.spyOn(console, 'log');

      const { default: main } = await import('./index');

      await main();

      expect(mockWebhookHandler.start).toHaveBeenCalled();
      expect(mockConsumer.start).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('All services started successfully');
    });

    it('should handle service startup failures', async () => {
      mockProcessor.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.start.mockRejectedValue(new Error('Consumer startup failed'));
      mockWebhookHandler.start.mockResolvedValue(undefined);

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const consoleSpy = vi.spyOn(console, 'error');

      const { default: main } = await import('./index');

      await main();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to start application:',
        expect.objectContaining({
          message: 'Consumer startup failed',
        })
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('configuration parsing', () => {
    it('should parse configuration from environment variables', async () => {
      process.env.MAX_RETRIES = '5';
      process.env.INITIAL_DELAY_MS = '2000';
      process.env.TECH_LEAD_ENABLED = 'false';
      process.env.PORT = '4000';

      mockProcessor.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.start.mockResolvedValue(undefined);
      mockWebhookHandler.start.mockResolvedValue(undefined);

      // Clear module cache to ensure fresh import with new env vars
      vi.resetModules();
      const { default: main } = await import('./index');

      await main();

      // Verify WorkflowProcessor was called with correct config
      expect(WorkflowProcessor).toHaveBeenCalledWith(
        expect.objectContaining({
          retry: expect.objectContaining({
            maxRetries: 5,
            initialDelayMs: 2000,
          }),
          agents: expect.objectContaining({
            tech_lead: expect.objectContaining({
              enabled: false,
            }),
          }),
        })
      );

      // Verify WebhookHandler was called with correct config
      expect(WebhookHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 4000,
        })
      );
    });

    it('should use default values when env vars not set', async () => {
      // Clear optional env vars
      delete process.env.MAX_RETRIES;
      delete process.env.TECH_LEAD_ENABLED;
      delete process.env.PORT;

      mockProcessor.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.healthCheck.mockResolvedValue({ status: 'healthy' });
      mockConsumer.start.mockResolvedValue(undefined);
      mockWebhookHandler.start.mockResolvedValue(undefined);

      // Clear module cache to ensure fresh import with new env vars
      vi.resetModules();
      const { default: main } = await import('./index');

      await main();

      // Verify defaults were used
      expect(WorkflowProcessor).toHaveBeenCalledWith(
        expect.objectContaining({
          retry: expect.objectContaining({
            maxRetries: 3, // default
          }),
          agents: expect.objectContaining({
            tech_lead: expect.objectContaining({
              enabled: true, // default (anything other than 'false')
            }),
          }),
        })
      );

      expect(WebhookHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 3000, // default
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle uncaught exceptions', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const consoleSpy = vi.spyOn(console, 'error');

      // Trigger uncaught exception handler
      const error = new Error('Uncaught error');
      process.emit('uncaughtException', error);

      expect(consoleSpy).toHaveBeenCalledWith('Uncaught exception:', error);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle unhandled rejections', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const consoleSpy = vi.spyOn(console, 'error');

      // Trigger unhandled rejection handler
      const reason = new Error('Unhandled rejection');
      const promise = Promise.reject(reason);
      process.emit('unhandledRejection', reason, promise);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unhandled rejection at:',
        promise,
        'reason:',
        reason
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('exports', () => {
    it('should export all main components', async () => {
      const module = await import('./index');

      expect(module.WorkflowProcessor).toBeDefined();
      expect(module.SQSConsumer).toBeDefined();
      expect(module.WebhookHandler).toBeDefined();
      expect(module.config).toBeDefined();
    });
  });
});
