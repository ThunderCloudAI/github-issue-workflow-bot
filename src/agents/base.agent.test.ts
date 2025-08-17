import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from './base.agent';
import { WorkflowContext, AgentResult, AgentType, WorkflowError } from '../types';
import { MockClaudeRunner } from '../claude';
import { mockWorkflowContext } from '../test/fixtures';

// Test implementation of BaseAgent
class TestAgent extends BaseAgent {
  constructor(claudeRunner: MockClaudeRunner, timeout?: number) {
    super(AgentType.TECH_LEAD, claudeRunner, timeout);
  }

  protected async processIssue(context: WorkflowContext): Promise<AgentResult> {
    this.validateContext(context);

    // Simulate some processing
    await this.delay(100);

    return {
      success: true,
      output: 'Test agent output',
    };
  }
}

class TimeoutTestAgent extends BaseAgent {
  constructor(claudeRunner: MockClaudeRunner, timeout?: number) {
    super(AgentType.TECH_LEAD, claudeRunner, timeout);
  }

  protected async processIssue(context: WorkflowContext): Promise<AgentResult> {
    // Simulate long-running process
    await this.delay(50000);

    return {
      success: true,
      output: 'Should not reach here',
    };
  }
}

class ErrorTestAgent extends BaseAgent {
  constructor(claudeRunner: MockClaudeRunner, timeout?: number) {
    super(AgentType.TECH_LEAD, claudeRunner, timeout);
  }

  protected async processIssue(context: WorkflowContext): Promise<AgentResult> {
    throw new WorkflowError('Test agent error', 'TEST_ERROR');
  }
}

describe('BaseAgent', () => {
  let testAgent: TestAgent;
  let mockClaudeRunner: MockClaudeRunner;

  beforeEach(() => {
    mockClaudeRunner = new MockClaudeRunner();
    mockClaudeRunner.setResponse('Mock Claude response');
    testAgent = new TestAgent(mockClaudeRunner);
  });

  describe('constructor', () => {
    it('should set agent type and default timeout', () => {
      expect((testAgent as any).type).toBe(AgentType.TECH_LEAD);
      expect((testAgent as any).timeout).toBe(30000);
      expect((testAgent as any).claudeRunner).toBe(mockClaudeRunner);
    });

    it('should set custom timeout when provided', () => {
      const customAgent = new TestAgent(mockClaudeRunner, 60000);
      expect((customAgent as any).timeout).toBe(60000);
    });
  });

  describe('execute', () => {
    it('should successfully execute agent logic', async () => {
      const result = await testAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Test agent output');
      expect(result.error).toBeUndefined();
    });

    it('should handle agent timeouts', async () => {
      const timeoutAgent = new TimeoutTestAgent(mockClaudeRunner, 1000); // 1 second timeout

      const result = await timeoutAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toContain('timed out after 1000ms');
    });

    it('should handle agent errors', async () => {
      const errorAgent = new ErrorTestAgent(mockClaudeRunner);

      const result = await errorAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toBe('Test agent error');
    });

    it('should handle unexpected errors', async () => {
      class UnexpectedErrorAgent extends BaseAgent {
        constructor() {
          super(AgentType.TECH_LEAD, mockClaudeRunner);
        }

        protected async processIssue(): Promise<AgentResult> {
          throw new Error('Unexpected error');
        }
      }

      const errorAgent = new UnexpectedErrorAgent();
      const result = await errorAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toBe('Unexpected error');
    });

    it('should handle unknown errors', async () => {
      class UnknownErrorAgent extends BaseAgent {
        constructor() {
          super(AgentType.TECH_LEAD, mockClaudeRunner);
        }

        protected async processIssue(): Promise<AgentResult> {
          throw null; // Throw null to simulate unknown error
        }
      }

      const errorAgent = new UnknownErrorAgent();
      const result = await errorAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toBe('Unknown agent error');
    });

    it('should log execution duration', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      await testAgent.execute(mockWorkflowContext);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Agent tech_lead completed in \d+ms/)
      );
    });

    it('should log error duration', async () => {
      const consoleSpy = vi.spyOn(console, 'error');
      const errorAgent = new ErrorTestAgent(mockClaudeRunner);

      await errorAgent.execute(mockWorkflowContext);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Agent tech_lead failed after \d+ms:/),
        expect.any(Error)
      );
    });
  });

  describe('validateContext', () => {
    it('should pass validation for valid context', () => {
      expect(() => {
        (testAgent as any).validateContext(mockWorkflowContext);
      }).not.toThrow();
    });

    it('should throw error for missing title', () => {
      const invalidContext = { ...mockWorkflowContext, title: '' };

      expect(() => {
        (testAgent as any).validateContext(invalidContext);
      }).toThrow(WorkflowError);
    });

    it('should throw error for missing repository', () => {
      const invalidContext = { ...mockWorkflowContext, repository: '' };

      expect(() => {
        (testAgent as any).validateContext(invalidContext);
      }).toThrow(WorkflowError);
    });

    it('should throw error for missing owner', () => {
      const invalidContext = { ...mockWorkflowContext, owner: '' };

      expect(() => {
        (testAgent as any).validateContext(invalidContext);
      }).toThrow(WorkflowError);
    });

    it('should create non-retryable WorkflowError', () => {
      const invalidContext = { ...mockWorkflowContext, title: '' };

      try {
        (testAgent as any).validateContext(invalidContext);
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowError);
        expect((error as WorkflowError).retryable).toBe(false);
        expect((error as WorkflowError).code).toBe('INVALID_CONTEXT');
      }
    });
  });

  describe('delay', () => {
    it('should delay for specified duration', async () => {
      const startTime = Date.now();
      await (testAgent as any).delay(100);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(90); // Allow some variance
      expect(endTime - startTime).toBeLessThan(200);
    });

    it('should resolve after delay', async () => {
      const promise = (testAgent as any).delay(50);
      expect(promise).toBeInstanceOf(Promise);

      const result = await promise;
      expect(result).toBeUndefined();
    });
  });
});
