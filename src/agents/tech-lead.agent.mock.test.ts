import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentType, WorkflowError } from '../types';
import { MockClaudeRunner } from '../claude';
import { mockWorkflowContext } from '../test/fixtures';

// Import TechLeadAgent without mocking to test actual dependency injection
vi.doUnmock('./tech-lead.agent');
import { TechLeadAgent } from './tech-lead.agent';

describe('TechLeadAgent (Mocked)', () => {
  let techLeadAgent: TechLeadAgent;
  let mockClaudeRunner: MockClaudeRunner;

  beforeEach(() => {
    mockClaudeRunner = new MockClaudeRunner();
    mockClaudeRunner.setResponse('Default mock response');
    techLeadAgent = new TechLeadAgent(mockClaudeRunner);
  });

  describe('constructor', () => {
    it('should initialize with correct agent type', () => {
      expect((techLeadAgent as any).type).toBe(AgentType.TECH_LEAD);
      expect((techLeadAgent as any).claudeRunner).toBe(mockClaudeRunner);
    });

    it('should use default timeout when not specified', () => {
      expect((techLeadAgent as any).timeout).toBe(30000);
    });

    it('should use custom timeout when specified', () => {
      const customAgent = new TechLeadAgent(mockClaudeRunner, 60000);
      expect((customAgent as any).timeout).toBe(60000);
    });
  });

  describe('processIssue with mocked Claude', () => {
    it('should successfully process issue with mocked Claude response', async () => {
      const mockClaudeResponse = `## Technical Analysis

### Complexity Assessment
**Medium** - Standard feature development with moderate complexity

### Recommended Technologies
- JWT for token-based authentication
- bcrypt for password hashing
- Passport.js for authentication middleware

### Implementation Approach
1. **Create authentication middleware**
   - Implement JWT token validation
   - Add error handling for invalid tokens

2. **Set up user authentication service**
   - Password hashing and validation
   - Token generation and refresh logic

### Testing Strategy
- Unit Tests for authentication middleware
- Integration Tests for login flow
- Security Tests for token validation

### Estimated Timeline
2-3 business days

### Dependencies
- User management system
- Database schema for users

### Acceptance Criteria
- [ ] Users can log in with valid credentials
- [ ] Invalid login attempts are rejected
- [ ] JWT tokens are generated and validated`;

      // Set up mock Claude runner response
      mockClaudeRunner.setResponse(mockClaudeResponse);

      const result = await techLeadAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe(mockClaudeResponse);
      expect(result.error).toBeUndefined();
    });

    it('should handle Claude errors and return failed result', async () => {
      const claudeError = new Error('Claude process failed');
      mockClaudeRunner.setError(claudeError);

      const result = await techLeadAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toContain('Tech lead analysis failed');
      expect(result.error).toContain('Claude process failed');
    });

    it('should validate context before processing', async () => {
      const invalidContext = { ...mockWorkflowContext, title: '' };

      const result = await techLeadAgent.execute(invalidContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toContain('Invalid workflow context: missing required fields');
    });

    it('should build correct prompt with all context fields', async () => {
      const mockResponse = 'Mock Claude response';

      // Spy on the Claude runner to capture the prompt
      const runPromptSpy = vi.spyOn(mockClaudeRunner, 'runPrompt').mockResolvedValue(mockResponse);

      const customContext = {
        ...mockWorkflowContext,
        title: 'Custom Issue Title',
        body: 'Custom issue description',
        labels: ['bug', 'priority-high'],
        owner: 'custom-owner',
        repository: 'custom-repo',
      };

      await techLeadAgent.execute(customContext);

      expect(runPromptSpy).toHaveBeenCalledOnce();
      const calledPrompt = runPromptSpy.mock.calls[0][0];
      expect(calledPrompt).toContain('Custom Issue Title');
      expect(calledPrompt).toContain('Custom issue description');
      expect(calledPrompt).toContain('bug, priority-high');
      expect(calledPrompt).toContain('custom-owner/custom-repo');
      expect(calledPrompt).toContain('## Technical Analysis');
      expect(calledPrompt).toContain('### Complexity Assessment');
      expect(calledPrompt).toContain('### Recommended Technologies');
      expect(calledPrompt).toContain('### Implementation Approach');
      expect(calledPrompt).toContain('### Testing Strategy');
      expect(calledPrompt).toContain('### Estimated Timeline');
      expect(calledPrompt).toContain('### Dependencies');
      expect(calledPrompt).toContain('### Acceptance Criteria');
    });
  });

  describe('prompt building', () => {
    it('should build comprehensive analysis prompt', async () => {
      const mockResponse = 'Mock response';
      const runPromptSpy = vi.spyOn(mockClaudeRunner, 'runPrompt').mockResolvedValue(mockResponse);

      await techLeadAgent.execute(mockWorkflowContext);

      const prompt = runPromptSpy.mock.calls[0][0];

      // Check prompt structure
      expect(prompt).toContain('You are an expert tech lead reviewing a GitHub issue');
      expect(prompt).toContain('**Issue Details:**');
      expect(prompt).toContain('**Please provide a detailed analysis in the following format:**');

      // Check all required sections are included
      expect(prompt).toContain('## Technical Analysis');
      expect(prompt).toContain('### Complexity Assessment');
      expect(prompt).toContain('[Assess if this is Low/Medium/High complexity and explain why]');
      expect(prompt).toContain('### Recommended Technologies');
      expect(prompt).toContain(
        '[List specific technologies, libraries, or frameworks that should be used]'
      );
      expect(prompt).toContain('### Implementation Approach');
      expect(prompt).toContain('[Provide a step-by-step implementation plan with numbered steps]');
      expect(prompt).toContain('### Testing Strategy');
      expect(prompt).toContain('[Outline what types of tests should be written]');
      expect(prompt).toContain('### Estimated Timeline');
      expect(prompt).toContain('[Provide time estimate in business days]');
      expect(prompt).toContain('### Dependencies');
      expect(prompt).toContain('[List any external dependencies or prerequisites]');
      expect(prompt).toContain('### Acceptance Criteria');
      expect(prompt).toContain('[Create a checklist of requirements that must be met]');

      // Check guidance text
      expect(prompt).toContain('Please be specific and actionable in your recommendations');
      expect(prompt).toContain(
        'Focus on practical implementation details that a developer can follow'
      );
    });

    it('should handle empty labels array', async () => {
      const mockResponse = 'Mock response';
      const runPromptSpy = vi.spyOn(mockClaudeRunner, 'runPrompt').mockResolvedValue(mockResponse);

      const contextWithNoLabels = {
        ...mockWorkflowContext,
        labels: [],
      };

      await techLeadAgent.execute(contextWithNoLabels);

      const prompt = runPromptSpy.mock.calls[0][0];
      expect(prompt).toContain('- Labels: ');
    });

    it('should handle null or empty body', async () => {
      const mockResponse = 'Mock response';
      const runPromptSpy = vi.spyOn(mockClaudeRunner, 'runPrompt').mockResolvedValue(mockResponse);

      const contextWithEmptyBody = {
        ...mockWorkflowContext,
        body: '',
      };

      await techLeadAgent.execute(contextWithEmptyBody);

      const prompt = runPromptSpy.mock.calls[0][0];
      expect(prompt).toContain('- Description: ');
    });
  });

  describe('error scenarios', () => {
    it('should handle timeout errors from Claude', async () => {
      const timeoutError = new Error('Claude process timed out');
      timeoutError.name = 'TimeoutError';
      mockClaudeRunner.setError(timeoutError);

      const result = await techLeadAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toContain('Tech lead analysis failed');
      expect(result.error).toContain('Claude process timed out');
    });

    it('should handle Claude process errors', async () => {
      const processError = new Error('Failed to start Claude process');
      mockClaudeRunner.setError(processError);

      const result = await techLeadAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toContain('Tech lead analysis failed');
      expect(result.error).toContain('Failed to start Claude process');
    });

    it('should handle empty Claude response', async () => {
      mockClaudeRunner.setResponse('');

      const result = await techLeadAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe('');
    });

    it('should handle Claude response with only whitespace', async () => {
      mockClaudeRunner.setResponse('   \n\t   ');

      const result = await techLeadAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe('   \n\t   '); // Should preserve the original response
    });
  });

  describe('context validation', () => {
    it('should reject context with missing title', async () => {
      const invalidContext = { ...mockWorkflowContext, title: '' };

      const result = await techLeadAgent.execute(invalidContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toContain('Invalid workflow context: missing required fields');
    });

    it('should reject context with missing repository', async () => {
      const invalidContext = { ...mockWorkflowContext, repository: '' };

      const result = await techLeadAgent.execute(invalidContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toContain('Invalid workflow context: missing required fields');
    });

    it('should reject context with missing owner', async () => {
      const invalidContext = { ...mockWorkflowContext, owner: '' };

      const result = await techLeadAgent.execute(invalidContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toContain('Invalid workflow context: missing required fields');
    });

    it('should accept context with valid required fields', async () => {
      const mockResponse = 'Valid response';
      mockClaudeRunner.setResponse(mockResponse);

      const validContext = {
        ...mockWorkflowContext,
        title: 'Valid Title',
        repository: 'valid-repo',
        owner: 'valid-owner',
      };

      const result = await techLeadAgent.execute(validContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe(mockResponse);
    });
  });
});
