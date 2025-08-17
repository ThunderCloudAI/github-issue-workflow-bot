import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TechLeadAgent } from './tech-lead.agent';
import { WorkflowContext, AgentType, WorkflowStatus, WorkflowError } from '../types';
import { IClaudeRunner } from '../claude';

// Mock Claude runner
const createMockClaudeRunner = (overrides?: Partial<IClaudeRunner>): IClaudeRunner => ({
  runPrompt: vi.fn().mockResolvedValue('Mock Claude response'),
  ...overrides,
});

// Test data factory
const createWorkflowContext = (overrides?: Partial<WorkflowContext>): WorkflowContext => ({
  issueId: 123,
  issueNumber: 456,
  repository: 'test-repo',
  owner: 'test-owner',
  title: 'Test Issue Title',
  body: 'Test issue description with details',
  labels: ['bug', 'enhancement'],
  status: WorkflowStatus.PENDING,
  retryCount: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('TechLeadAgent', () => {
  let mockClaudeRunner: IClaudeRunner;
  let techLeadAgent: TechLeadAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClaudeRunner = createMockClaudeRunner();
    techLeadAgent = new TechLeadAgent(mockClaudeRunner);
  });

  describe('constructor', () => {
    it('should create instance with default timeout', () => {
      const agent = new TechLeadAgent(mockClaudeRunner);
      expect(agent).toBeInstanceOf(TechLeadAgent);
    });

    it('should create instance with custom timeout', () => {
      const customTimeout = 60000;
      const agent = new TechLeadAgent(mockClaudeRunner, customTimeout);
      expect(agent).toBeInstanceOf(TechLeadAgent);
    });
  });

  describe('execute', () => {
    it('should successfully process a valid issue', async () => {
      const context = createWorkflowContext();
      const expectedResponse = 'Detailed technical analysis...';
      
      mockClaudeRunner.runPrompt = vi.fn().mockResolvedValue(expectedResponse);

      const result = await techLeadAgent.execute(context);

      expect(result.success).toBe(true);
      expect(result.output).toBe(expectedResponse);
      expect(result.error).toBeUndefined();
      expect(mockClaudeRunner.runPrompt).toHaveBeenCalledOnce();
    });

    it('should handle Claude runner errors', async () => {
      const context = createWorkflowContext();
      const claudeError = new Error('Claude API failed');
      
      mockClaudeRunner.runPrompt = vi.fn().mockRejectedValue(claudeError);

      const result = await techLeadAgent.execute(context);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toBe('Tech lead analysis failed: Claude API failed');
    });

    it('should handle timeout errors', async () => {
      const context = createWorkflowContext();
      const shortTimeout = 10; // Very short timeout
      
      mockClaudeRunner.runPrompt = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve('response'), 100))
      );

      const agent = new TechLeadAgent(mockClaudeRunner, shortTimeout);
      const result = await agent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('should validate context before processing', async () => {
      const invalidContext = createWorkflowContext({
        title: '', // Invalid: empty title
      });

      const result = await techLeadAgent.execute(invalidContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid workflow context');
      expect(mockClaudeRunner.runPrompt).not.toHaveBeenCalled();
    });

    it('should validate context with missing repository', async () => {
      const invalidContext = createWorkflowContext({
        repository: '', // Invalid: empty repository
      });

      const result = await techLeadAgent.execute(invalidContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid workflow context');
    });

    it('should validate context with missing owner', async () => {
      const invalidContext = createWorkflowContext({
        owner: '', // Invalid: empty owner
      });

      const result = await techLeadAgent.execute(invalidContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid workflow context');
    });
  });

  describe('buildAnalysisPrompt', () => {
    it('should build comprehensive analysis prompt with all context fields', async () => {
      const context = createWorkflowContext({
        title: 'Add user authentication',
        body: 'We need to implement OAuth2 authentication for our API',
        labels: ['enhancement', 'security', 'api'],
        owner: 'acme-corp',
        repository: 'api-service',
      });

      // We need to trigger prompt building by executing the agent
      await techLeadAgent.execute(context);

      const calledPrompt = (mockClaudeRunner.runPrompt as any).mock.calls[0][0];
      
      // Verify prompt contains all expected elements
      expect(calledPrompt).toContain('You are an expert tech lead');
      expect(calledPrompt).toContain('Title: Add user authentication');
      expect(calledPrompt).toContain('Description: We need to implement OAuth2 authentication for our API');
      expect(calledPrompt).toContain('Labels: enhancement, security, api');
      expect(calledPrompt).toContain('Repository: acme-corp/api-service');
      expect(calledPrompt).toContain('## Technical Analysis');
      expect(calledPrompt).toContain('### Complexity Assessment');
      expect(calledPrompt).toContain('### Recommended Technologies');
      expect(calledPrompt).toContain('### Implementation Approach');
      expect(calledPrompt).toContain('### Testing Strategy');
      expect(calledPrompt).toContain('### Estimated Timeline');
      expect(calledPrompt).toContain('### Dependencies');
      expect(calledPrompt).toContain('### Acceptance Criteria');
    });

    it('should handle empty labels in prompt', async () => {
      const context = createWorkflowContext({
        labels: [], // Empty labels array
      });

      await techLeadAgent.execute(context);

      const calledPrompt = (mockClaudeRunner.runPrompt as any).mock.calls[0][0];
      expect(calledPrompt).toContain('Labels: '); // Should handle empty gracefully
    });

    it('should handle single label in prompt', async () => {
      const context = createWorkflowContext({
        labels: ['bug'],
      });

      await techLeadAgent.execute(context);

      const calledPrompt = (mockClaudeRunner.runPrompt as any).mock.calls[0][0];
      expect(calledPrompt).toContain('Labels: bug');
    });
  });

  describe('processIssue', () => {
    it('should throw WorkflowError with correct properties on failure', async () => {
      const context = createWorkflowContext();
      const originalError = new Error('API connection failed');
      
      mockClaudeRunner.runPrompt = vi.fn().mockRejectedValue(originalError);

      const result = await techLeadAgent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tech lead analysis failed: API connection failed');
    });

    it('should pass timeout to Claude runner', async () => {
      const context = createWorkflowContext();
      const customTimeout = 45000;
      const agent = new TechLeadAgent(mockClaudeRunner, customTimeout);

      await agent.execute(context);

      expect(mockClaudeRunner.runPrompt).toHaveBeenCalledWith(
        expect.any(String),
        customTimeout
      );
    });
  });

  describe('error handling edge cases', () => {
    it('should handle undefined error message', async () => {
      const context = createWorkflowContext();
      const errorWithoutMessage = { someProperty: 'value' };
      
      mockClaudeRunner.runPrompt = vi.fn().mockRejectedValue(errorWithoutMessage);

      const result = await techLeadAgent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tech lead analysis failed');
    });

    it('should handle null error', async () => {
      const context = createWorkflowContext();
      
      mockClaudeRunner.runPrompt = vi.fn().mockRejectedValue(null);

      const result = await techLeadAgent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot read properties of null');
    });
  });

  describe('inherited functionality', () => {
    it('should measure execution duration on success', async () => {
      const context = createWorkflowContext();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await techLeadAgent.execute(context);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Agent tech_lead completed in')
      );
      
      consoleSpy.mockRestore();
    });

    it('should measure execution duration on failure', async () => {
      const context = createWorkflowContext();
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockClaudeRunner.runPrompt = vi.fn().mockRejectedValue(new Error('Test error'));

      await techLeadAgent.execute(context);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Agent tech_lead failed after'),
        expect.any(Object)
      );
      
      consoleErrorSpy.mockRestore();
    });

    it('should use tech_lead agent type', async () => {
      const context = createWorkflowContext();
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await techLeadAgent.execute(context);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Agent tech_lead completed')
      );
      
      consoleSpy.mockRestore();
    });
  });
});