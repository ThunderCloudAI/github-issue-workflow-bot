import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseAgent } from './base.agent';
import { WorkflowContext, AgentResult, AgentType } from '../types';
import { IClaudeRunner } from '../claude';

// Test utilities following DRY principle
const createMockClaudeRunner = (): IClaudeRunner => ({
  runPrompt: vi.fn().mockResolvedValue('Mock Claude response'),
});

const createValidContext = (): WorkflowContext => ({
  title: 'Test Issue',
  body: 'Test description',
  repository: 'test-repo',
  owner: 'test-owner',
  labels: [],
  assignees: [],
  issueNumber: 1,
  timestamp: '2024-01-01T00:00:00Z',
});

// Simple test agent implementation
class TestAgent extends BaseAgent {
  constructor(claudeRunner: IClaudeRunner, timeout?: number) {
    super(AgentType.TECH_LEAD, claudeRunner, timeout);
  }

  protected async processIssue(context: WorkflowContext): Promise<AgentResult> {
    this.validateContext(context);
    return {
      success: true,
      output: 'Test completed successfully',
    };
  }
}

describe('BaseAgent', () => {
  let mockClaudeRunner: IClaudeRunner;
  let validContext: WorkflowContext;
  let agent: TestAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClaudeRunner = createMockClaudeRunner();
    validContext = createValidContext();
    agent = new TestAgent(mockClaudeRunner);
  });

  describe('constructor', () => {
    it('should create instance with provided dependencies', () => {
      expect(agent).toBeInstanceOf(BaseAgent);
      expect((agent as any).type).toBe(AgentType.TECH_LEAD);
      expect((agent as any).timeout).toBe(30000);
    });

    it('should use custom timeout when provided', () => {
      const customAgent = new TestAgent(mockClaudeRunner, 60000);
      expect((customAgent as any).timeout).toBe(60000);
    });
  });

  describe('execute', () => {
    it('should successfully execute with valid context', async () => {
      const result = await agent.execute(validContext);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('Test completed successfully');
      expect(result.error).toBeUndefined();
    });

    it('should handle execution errors gracefully', async () => {
      class ErrorAgent extends BaseAgent {
        constructor(claudeRunner: IClaudeRunner) {
          super(AgentType.TECH_LEAD, claudeRunner);
        }
        
        protected async processIssue(): Promise<AgentResult> {
          throw new Error('Test error');
        }
      }

      const errorAgent = new ErrorAgent(mockClaudeRunner);
      const result = await errorAgent.execute(validContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
    });
  });

  describe('validateContext', () => {
    it('should validate valid context without errors', () => {
      expect(() => {
        (agent as any).validateContext(validContext);
      }).not.toThrow();
    });

    it('should reject context with missing title', () => {
      const invalidContext = { ...validContext, title: '' };
      
      expect(() => {
        (agent as any).validateContext(invalidContext);
      }).toThrow('Invalid workflow context');
    });

    it('should reject context with missing repository', () => {
      const invalidContext = { ...validContext, repository: '' };
      
      expect(() => {
        (agent as any).validateContext(invalidContext);
      }).toThrow('Invalid workflow context');
    });

    it('should reject context with missing owner', () => {
      const invalidContext = { ...validContext, owner: '' };
      
      expect(() => {
        (agent as any).validateContext(invalidContext);
      }).toThrow('Invalid workflow context');
    });
  });

  describe('utility methods', () => {
    it('should provide delay functionality', async () => {
      const startTime = Date.now();
      await (agent as any).delay(50);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeGreaterThanOrEqual(45);
    });

    it('should delegate to Claude runner', async () => {
      const testPrompt = 'Test prompt';
      await (agent as any).runClaude(testPrompt);
      
      expect(mockClaudeRunner.runPrompt).toHaveBeenCalledWith(testPrompt, 30000);
    });
  });
});
