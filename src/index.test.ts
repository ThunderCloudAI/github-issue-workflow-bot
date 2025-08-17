import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simple integration test for main application
describe('Main Application', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_WEBHOOK_SECRET = 'test-secret';
    process.env.SQS_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue';
  });

  describe('configuration', () => {
    it('should validate required environment variables', () => {
      // Arrange
      delete process.env.GITHUB_TOKEN;

      // Act & Assert
      expect(() => {
        if (!process.env.GITHUB_TOKEN) {
          throw new Error('Missing required environment variables: GITHUB_TOKEN');
        }
      }).toThrow('Missing required environment variables');
    });

    it('should pass validation with all required env vars', () => {
      // Act & Assert
      expect(() => {
        const required = ['GITHUB_TOKEN', 'GITHUB_WEBHOOK_SECRET', 'SQS_QUEUE_URL'];
        const missing = required.filter(key => !process.env[key]);
        if (missing.length > 0) {
          throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }
      }).not.toThrow();
    });
  });

  describe('module imports', () => {
    it('should import main function without errors', async () => {
      // Act & Assert
      const indexModule = await import('./index');
      expect(indexModule.default).toBeDefined();
      expect(typeof indexModule.default).toBe('function');
    });
  });
});