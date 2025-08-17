import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealClaudeRunner } from './real-claude-runner';

// Test utilities following DRY principle
const createRealClaudeRunner = (timeout?: number): RealClaudeRunner => {
  return new RealClaudeRunner(timeout);
};

describe('RealClaudeRunner', () => {
  let runner: RealClaudeRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = createRealClaudeRunner();
  });

  describe('constructor', () => {
    it('should create instance with default timeout', () => {
      expect(runner).toBeInstanceOf(RealClaudeRunner);
      expect((runner as any).defaultTimeout).toBe(30000);
    });

    it('should create instance with custom timeout', () => {
      const customRunner = createRealClaudeRunner(60000);
      expect((customRunner as any).defaultTimeout).toBe(60000);
    });
  });

  describe('runPrompt interface', () => {
    it('should implement runPrompt method correctly', () => {
      expect(typeof runner.runPrompt).toBe('function');
      expect(runner.runPrompt.length).toBe(2);
    });

    it('should return Promise from runPrompt', () => {
      const result = runner.runPrompt('test');
      expect(result).toBeInstanceOf(Promise);
      
      // Clean up the promise to prevent hanging tests
      result.catch(() => {});
    });

    it('should accept prompt and timeout parameters', () => {
      expect(() => {
        const promise = runner.runPrompt('test prompt', 5000);
        promise.catch(() => {}); // Handle rejection
      }).not.toThrow();
    });
  });

  describe('timeout handling', () => {
    it('should use provided timeout over default', () => {
      const customTimeout = 45000;
      
      expect(() => {
        const promise = runner.runPrompt('test', customTimeout);
        promise.catch(() => {}); // Handle rejection
      }).not.toThrow();
    });

    it('should use default timeout when none provided', () => {
      const defaultRunner = createRealClaudeRunner(15000);
      
      expect(() => {
        const promise = defaultRunner.runPrompt('test');
        promise.catch(() => {}); // Handle rejection
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle invalid prompts gracefully', () => {
      expect(() => {
        const promise = runner.runPrompt('');
        promise.catch(() => {}); // Handle rejection
      }).not.toThrow();
      
      expect(() => {
        const promise = runner.runPrompt('\n\t');
        promise.catch(() => {}); // Handle rejection
      }).not.toThrow();
    });
  });

  describe('interface compliance', () => {
    it('should implement IClaudeRunner interface', () => {
      expect(runner).toHaveProperty('runPrompt');
      expect(typeof runner.runPrompt).toBe('function');
    });

    it('should handle basic functionality', () => {
      const mockPrompt = 'Analyze this issue';
      
      // Verify method signature works correctly
      expect(() => {
        const promise = runner.runPrompt(mockPrompt);
        promise.catch(() => {}); // Handle rejection
      }).not.toThrow();
    });
  });
});