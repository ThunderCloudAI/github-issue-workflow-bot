import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TechLeadAgent } from './tech-lead.agent';
import { WorkflowError } from '../types';
import { MockClaudeRunner } from '../claude';
import { mockWorkflowContext } from '../test/fixtures';

describe('TechLeadAgent (Simplified Architecture)', () => {
  let techLeadAgent: TechLeadAgent;
  let mockClaudeRunner: MockClaudeRunner;

  beforeEach(() => {
    mockClaudeRunner = new MockClaudeRunner();
    techLeadAgent = new TechLeadAgent(mockClaudeRunner);
  });

  describe('constructor', () => {
    it('should initialize with correct agent type', () => {
      expect((techLeadAgent as any).type).toBe('tech_lead');
    });

    it('should use default timeout when not specified', () => {
      expect((techLeadAgent as any).timeout).toBe(30000);
    });

    it('should use custom timeout when specified', () => {
      const customAgent = new TechLeadAgent(mockClaudeRunner, 60000);
      expect((customAgent as any).timeout).toBe(60000);
    });
  });

  describe('processIssue', () => {
    it('should use Claude runner to generate technical analysis', async () => {
      const mockAnalysis = `## Technical Analysis

### Complexity Assessment
**Medium** - This is a standard feature implementation that requires moderate development effort.

### Recommended Technologies
- JWT for token-based authentication
- bcrypt for password hashing
- Express.js middleware for route protection

### Implementation Approach
1. **Create authentication middleware**
   - Implement JWT token validation
   - Add error handling for invalid tokens

2. **Set up user authentication service**
   - Password hashing and validation
   - Token generation and refresh logic

### Testing Strategy
- Unit tests for authentication functions
- Integration tests for protected endpoints
- Security tests for token validation

### Estimated Timeline
2-3 business days

### Dependencies
- User management system
- Database schema for users

### Acceptance Criteria
- [ ] Users can log in with valid credentials
- [ ] Invalid login attempts are rejected
- [ ] JWT tokens are generated and validated correctly`;

      mockClaudeRunner.setResponse(mockAnalysis);

      const result = await techLeadAgent.execute(mockWorkflowContext);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe(mockAnalysis);
      expect(result.error).toBeUndefined();
    });

    it('should build comprehensive analysis prompt', async () => {
      const runPromptSpy = vi.spyOn(mockClaudeRunner, 'runPrompt');
      mockClaudeRunner.setResponse('Analysis result');

      await techLeadAgent.execute(mockWorkflowContext);
      
      expect(runPromptSpy).toHaveBeenCalledOnce();
      const prompt = runPromptSpy.mock.calls[0][0];
      
      // Check that prompt includes all required elements
      expect(prompt).toContain('expert tech lead');
      expect(prompt).toContain('Title: Add user authentication');
      expect(prompt).toContain('Description: We need to add login functionality');
      expect(prompt).toContain('Labels: enhancement, backend');
      expect(prompt).toContain('Repository: testuser/test-repo');
      
      // Check that prompt asks for all required sections
      expect(prompt).toContain('Complexity Assessment');
      expect(prompt).toContain('Recommended Technologies');
      expect(prompt).toContain('Implementation Approach');
      expect(prompt).toContain('Testing Strategy');
      expect(prompt).toContain('Estimated Timeline');
      expect(prompt).toContain('Dependencies');
      expect(prompt).toContain('Acceptance Criteria');
    });

    it('should handle context validation errors', async () => {
      const invalidContext = { ...mockWorkflowContext, title: '' };

      const result = await techLeadAgent.execute(invalidContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid workflow context');
    });

    it('should handle Claude runner failures', async () => {
      mockClaudeRunner.setError(new Error('Claude not available'));

      const result = await techLeadAgent.execute(mockWorkflowContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude not available');
    });

    it('should handle Claude timeout', async () => {
      const shortTimeoutAgent = new TechLeadAgent(mockClaudeRunner, 100); // 100ms timeout
      
      // Mock a slow response that exceeds timeout
      mockClaudeRunner.setDelay(200);
      mockClaudeRunner.setResponse('Slow response');

      const result = await shortTimeoutAgent.execute(mockWorkflowContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('should handle empty Claude response', async () => {
      mockClaudeRunner.setResponse('');

      const result = await techLeadAgent.execute(mockWorkflowContext);
      
      expect(result.success).toBe(true);
      expect(result.output).toBe('');
    });

    it('should handle multiple prompts correctly', async () => {
      const responses = ['First analysis', 'Second analysis', 'Third analysis'];
      mockClaudeRunner.setResponses(responses);

      const results = await Promise.all([
        techLeadAgent.execute(mockWorkflowContext),
        techLeadAgent.execute(mockWorkflowContext),
        techLeadAgent.execute(mockWorkflowContext)
      ]);

      expect(results[0].output).toBe('First analysis');
      expect(results[1].output).toBe('Second analysis');
      expect(results[2].output).toBe('Third analysis');
    });
  });

  describe('error handling', () => {
    it('should wrap Claude runner errors in agent errors', async () => {
      const originalError = new Error('Specific Claude error');
      mockClaudeRunner.setError(originalError);

      const result = await techLeadAgent.execute(mockWorkflowContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Specific Claude error');
    });

    it('should preserve original error information in result', async () => {
      const originalError = new Error('Original Claude error');
      mockClaudeRunner.setError(originalError);

      const result = await techLeadAgent.execute(mockWorkflowContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Original Claude error');
      expect(result.output).toBe('');
    });

    it('should handle timeout gracefully', async () => {
      const timeoutAgent = new TechLeadAgent(mockClaudeRunner, 50);
      mockClaudeRunner.setDelay(100); // Longer than timeout

      const result = await timeoutAgent.execute(mockWorkflowContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });

  describe('prompt building', () => {
    it('should include all context fields in prompt', async () => {
      const runPromptSpy = vi.spyOn(mockClaudeRunner, 'runPrompt');
      mockClaudeRunner.setResponse('Test response');

      const contextWithAllFields = {
        ...mockWorkflowContext,
        title: 'Custom Title',
        body: 'Custom description with details',
        labels: ['custom', 'test', 'labels'],
        owner: 'customowner',
        repository: 'customrepo'
      };

      await techLeadAgent.execute(contextWithAllFields);
      
      const prompt = runPromptSpy.mock.calls[0][0];
      expect(prompt).toContain('Custom Title');
      expect(prompt).toContain('Custom description with details');
      expect(prompt).toContain('custom, test, labels');
      expect(prompt).toContain('customowner/customrepo');
    });

    it('should handle empty labels gracefully', async () => {
      const runPromptSpy = vi.spyOn(mockClaudeRunner, 'runPrompt');
      mockClaudeRunner.setResponse('Test response');

      const contextWithEmptyLabels = {
        ...mockWorkflowContext,
        labels: []
      };

      await techLeadAgent.execute(contextWithEmptyLabels);
      
      const prompt = runPromptSpy.mock.calls[0][0];
      expect(prompt).toContain('Labels: '); // Should still include the labels section
    });

    it('should format prompt sections correctly', async () => {
      const runPromptSpy = vi.spyOn(mockClaudeRunner, 'runPrompt');
      mockClaudeRunner.setResponse('Test response');

      await techLeadAgent.execute(mockWorkflowContext);
      
      const prompt = runPromptSpy.mock.calls[0][0];
      
      // Check that all required sections are present and formatted
      expect(prompt).toMatch(/## Technical Analysis/);
      expect(prompt).toMatch(/### Complexity Assessment/);
      expect(prompt).toMatch(/### Recommended Technologies/);
      expect(prompt).toMatch(/### Implementation Approach/);
      expect(prompt).toMatch(/### Testing Strategy/);
      expect(prompt).toMatch(/### Estimated Timeline/);
      expect(prompt).toMatch(/### Dependencies/);
      expect(prompt).toMatch(/### Acceptance Criteria/);
    });
  });

  describe('Claude runner integration', () => {
    it('should pass timeout to Claude runner', async () => {
      const runPromptSpy = vi.spyOn(mockClaudeRunner, 'runPrompt');
      mockClaudeRunner.setResponse('Test response');

      const customTimeoutAgent = new TechLeadAgent(mockClaudeRunner, 15000);
      await customTimeoutAgent.execute(mockWorkflowContext);
      
      expect(runPromptSpy).toHaveBeenCalledWith(
        expect.any(String),
        15000
      );
    });

    it('should work with different Claude runner implementations', async () => {
      // Test that the agent works with any IClaudeRunner implementation
      const customRunner = {
        runPrompt: vi.fn().mockResolvedValue('Custom runner response')
      };

      const agentWithCustomRunner = new TechLeadAgent(customRunner as any);
      const result = await agentWithCustomRunner.execute(mockWorkflowContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Custom runner response');
      expect(customRunner.runPrompt).toHaveBeenCalledOnce();
    });
  });
});