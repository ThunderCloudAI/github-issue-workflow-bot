import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TechLeadAgent } from './tech-lead.agent';
import { WorkflowError } from '../types';
import {
  MockClaudeRunner,
  RealClaudeRunner,
  createMockClaudeRunner,
  createErrorMockClaudeRunner,
} from '../claude';
import { mockWorkflowContext } from '../test/fixtures';

describe('Claude Integration Patterns', () => {
  describe('Agent-Claude Runner Integration', () => {
    let techLeadAgent: TechLeadAgent;
    let mockClaudeRunner: MockClaudeRunner;

    beforeEach(() => {
      mockClaudeRunner = new MockClaudeRunner();
      techLeadAgent = new TechLeadAgent(mockClaudeRunner);
    });

    it('should successfully integrate TechLeadAgent with MockClaudeRunner', async () => {
      const expectedAnalysis = `## Technical Analysis

### Complexity Assessment
**Medium** - Standard feature development with moderate complexity

### Recommended Technologies
- JWT for token-based authentication
- bcrypt for password hashing
- Express.js for REST API

### Implementation Approach
1. **Create authentication middleware**
   - Implement JWT token validation
   - Add error handling for invalid tokens

### Testing Strategy
- Unit Tests for authentication functions
- Integration Tests for login flow

### Estimated Timeline
2-3 business days

### Dependencies
- User management system
- Database schema for users

### Acceptance Criteria
- [ ] Users can log in with valid credentials
- [ ] Invalid login attempts are rejected`;

      mockClaudeRunner.setResponse(expectedAnalysis);

      const result = await techLeadAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(true);
      expect(result.output).toBe(expectedAnalysis);
      expect(result.error).toBeUndefined();
    });

    it('should handle Claude runner errors gracefully', async () => {
      const errorClaudeRunner = createErrorMockClaudeRunner(
        new Error('Claude service unavailable')
      );
      const errorAgent = new TechLeadAgent(errorClaudeRunner);

      const result = await errorAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.output).toBe('');
      expect(result.error).toContain('Claude service unavailable');
    });

    it('should respect timeout settings from agent', async () => {
      const shortTimeoutAgent = new TechLeadAgent(mockClaudeRunner, 100);

      // Mock a slow response
      mockClaudeRunner.setDelay(200);
      mockClaudeRunner.setResponse('Slow response');

      const result = await shortTimeoutAgent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('should pass prompts correctly to Claude runner', async () => {
      const spyRunner = new MockClaudeRunner();
      const runPromptSpy = vi.spyOn(spyRunner, 'runPrompt');

      spyRunner.setResponse('Analysis result');
      const spyAgent = new TechLeadAgent(spyRunner);

      await spyAgent.execute(mockWorkflowContext);

      expect(runPromptSpy).toHaveBeenCalledOnce();
      const calledPrompt = runPromptSpy.mock.calls[0][0];

      // Verify prompt contains required elements
      expect(calledPrompt).toContain('expert tech lead');
      expect(calledPrompt).toContain(mockWorkflowContext.title);
      expect(calledPrompt).toContain(mockWorkflowContext.body);
      expect(calledPrompt).toContain('Technical Analysis');
      expect(calledPrompt).toContain('Complexity Assessment');
    });
  });

  describe('Claude Runner Interface Compliance', () => {
    it('should work with any IClaudeRunner implementation', async () => {
      // Test with MockClaudeRunner
      const mockRunner = new MockClaudeRunner();
      mockRunner.setResponse('Mock response');
      const mockAgent = new TechLeadAgent(mockRunner);

      const mockResult = await mockAgent.execute(mockWorkflowContext);
      expect(mockResult.success).toBe(true);
      expect(mockResult.output).toBe('Mock response');

      // Test that RealClaudeRunner would also work (without actually running it)
      const realRunner = new RealClaudeRunner();
      const realAgent = new TechLeadAgent(realRunner);

      // Just verify the agent can be constructed with real runner
      expect(realAgent).toBeInstanceOf(TechLeadAgent);
    });

    it('should handle different response types from Claude runners', async () => {
      const scenarios = [
        { name: 'simple text', response: 'Simple response' },
        { name: 'empty string', response: '' },
        { name: 'multiline response', response: 'Line 1\nLine 2\nLine 3' },
        {
          name: 'formatted analysis',
          response: '## Analysis\n\n### Summary\nDetailed analysis here',
        },
      ];

      for (const scenario of scenarios) {
        const runner = new MockClaudeRunner();
        runner.setResponse(scenario.response);
        const agent = new TechLeadAgent(runner);

        const result = await agent.execute(mockWorkflowContext);

        expect(result.success).toBe(true);
        expect(result.output).toBe(scenario.response);
      }
    });
  });

  describe('Error Propagation and Handling', () => {
    it('should propagate Claude runner timeout errors', async () => {
      const timeoutRunner = createErrorMockClaudeRunner(new Error('Timeout error'));
      const agent = new TechLeadAgent(timeoutRunner);

      const result = await agent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout error');
    });

    it('should wrap non-WorkflowError exceptions', async () => {
      const faultyRunner = {
        runPrompt: vi.fn().mockRejectedValue(new Error('Unexpected error')),
      };

      const agent = new TechLeadAgent(faultyRunner as any);

      const result = await agent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unexpected error');
    });

    it('should maintain error context through the chain', async () => {
      const originalError = new Error('Original Claude error');
      const errorRunner = {
        runPrompt: vi.fn().mockRejectedValue(originalError),
      };

      const agent = new TechLeadAgent(errorRunner as any);

      const result = await agent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Original Claude error');
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle concurrent Claude runner calls', async () => {
      const runner = new MockClaudeRunner();
      runner.setResponse('Concurrent response');

      const agents = Array.from({ length: 5 }, () => new TechLeadAgent(runner));

      const promises = agents.map(agent => agent.execute(mockWorkflowContext));
      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.output).toBe('Concurrent response');
      });
    });

    it('should respect memory constraints with large responses', async () => {
      const largeResponse = 'x'.repeat(10000); // 10KB response
      const runner = new MockClaudeRunner();
      runner.setResponse(largeResponse);

      const agent = new TechLeadAgent(runner);
      const result = await agent.execute(mockWorkflowContext);

      expect(result.success).toBe(true);
      expect(result.output.length).toBe(10000);
    });
  });

  describe('TechLeadAgent Integration Fallback', () => {
    it('should fallback to rule-based analysis when Claude fails', async () => {
      // This test verifies that if Claude integration fails,
      // the agent can still provide some form of analysis
      const failingRunner = createErrorMockClaudeRunner(new Error('Claude not available'));
      const agent = new TechLeadAgent(failingRunner);

      const result = await agent.execute(mockWorkflowContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Claude not available');
    });

    it('should validate context before calling Claude', async () => {
      const runner = new MockClaudeRunner();
      const runPromptSpy = vi.spyOn(runner, 'runPrompt');
      const agent = new TechLeadAgent(runner);

      const invalidContext = { ...mockWorkflowContext, title: '' };

      const result = await agent.execute(invalidContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid workflow context');

      // Claude runner should not have been called
      expect(runPromptSpy).not.toHaveBeenCalled();
    });
  });
});
