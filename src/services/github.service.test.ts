import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubService } from './github.service';
import { WorkflowError, AgentResult } from '../types';
import { mockWorkflowContext, mockOctokitResponse, mockAgentResult } from '../test/fixtures';

// Mock the @octokit/rest module
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    repos: {
      getBranch: vi.fn(),
      get: vi.fn(),
    },
    git: {
      createRef: vi.fn(),
    },
    issues: {
      createComment: vi.fn(),
      addLabels: vi.fn(),
    },
    pulls: {
      create: vi.fn(),
    },
  })),
}));

describe('GitHubService', () => {
  let githubService: GitHubService;
  let mockOctokit: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    githubService = new GitHubService('test-token');
    // Access the mocked octokit instance
    mockOctokit = (githubService as any).octokit;
  });

  describe('createBranch', () => {
    it('should successfully create a branch', async () => {
      mockOctokit.repos.getBranch.mockResolvedValue(mockOctokitResponse.repos.getBranch);
      mockOctokit.git.createRef.mockResolvedValue(mockOctokitResponse.git.createRef);

      const result = await githubService.createBranch(mockWorkflowContext);

      expect(result).toMatch(/^feature\/issue-123-\d+$/);
      expect(mockOctokit.repos.getBranch).toHaveBeenCalledWith({
        owner: mockWorkflowContext.owner,
        repo: mockWorkflowContext.repository,
        branch: 'main',
      });
      expect(mockOctokit.git.createRef).toHaveBeenCalledWith({
        owner: mockWorkflowContext.owner,
        repo: mockWorkflowContext.repository,
        ref: expect.stringMatching(/^refs\/heads\/feature\/issue-123-\d+$/),
        sha: 'abc123def456',
      });
    });

    it('should throw WorkflowError when branch already exists', async () => {
      mockOctokit.repos.getBranch.mockResolvedValue(mockOctokitResponse.repos.getBranch);
      mockOctokit.git.createRef.mockRejectedValue({ status: 422 });

      await expect(githubService.createBranch(mockWorkflowContext))
        .rejects.toThrow(WorkflowError);
      
      await expect(githubService.createBranch(mockWorkflowContext))
        .rejects.toThrow('Branch already exists or invalid branch name');
    });

    it('should throw WorkflowError when repository not found', async () => {
      mockOctokit.repos.getBranch.mockRejectedValue({ status: 404 });

      await expect(githubService.createBranch(mockWorkflowContext))
        .rejects.toThrow(WorkflowError);
      
      await expect(githubService.createBranch(mockWorkflowContext))
        .rejects.toThrow('Repository not found or insufficient permissions');
    });

    it('should throw retryable WorkflowError for other errors', async () => {
      mockOctokit.repos.getBranch.mockRejectedValue(new Error('Network error'));

      try {
        await githubService.createBranch(mockWorkflowContext);
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowError);
        expect((error as WorkflowError).retryable).toBe(true);
        expect((error as WorkflowError).code).toBe('BRANCH_CREATION_FAILED');
      }
    });
  });

  describe('updateIssueStatus', () => {
    it('should successfully update issue status', async () => {
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);
      mockOctokit.issues.addLabels.mockResolvedValue(mockOctokitResponse.issues.addLabels);

      await githubService.updateIssueStatus(mockWorkflowContext, 'processing', 'Test details');

      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: mockWorkflowContext.owner,
        repo: mockWorkflowContext.repository,
        issue_number: mockWorkflowContext.issueNumber,
        body: expect.stringContaining('## 🔄 Workflow Status Update'),
      });
      expect(mockOctokit.issues.addLabels).toHaveBeenCalledWith({
        owner: mockWorkflowContext.owner,
        repo: mockWorkflowContext.repository,
        issue_number: mockWorkflowContext.issueNumber,
        labels: ['workflow:processing'],
      });
    });

    it('should throw non-retryable error when issue not found', async () => {
      mockOctokit.issues.createComment.mockRejectedValue({ status: 404 });

      try {
        await githubService.updateIssueStatus(mockWorkflowContext, 'processing');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowError);
        expect((error as WorkflowError).retryable).toBe(false);
        expect((error as WorkflowError).code).toBe('ISSUE_NOT_FOUND');
      }
    });

    it('should format status comment correctly', async () => {
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);
      mockOctokit.issues.addLabels.mockResolvedValue(mockOctokitResponse.issues.addLabels);

      await githubService.updateIssueStatus(mockWorkflowContext, 'processing', 'Test details');

      const commentCall = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(commentCall.body).toContain('**Status:** processing');
      expect(commentCall.body).toContain('**Details:**\nTest details');
      expect(commentCall.body).toContain('*Automated workflow system*');
    });
  });

  describe('addTechLeadAnalysis', () => {
    it('should successfully add tech lead analysis', async () => {
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);

      await githubService.addTechLeadAnalysis(mockWorkflowContext, 'Test analysis');

      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: mockWorkflowContext.owner,
        repo: mockWorkflowContext.repository,
        issue_number: mockWorkflowContext.issueNumber,
        body: expect.stringContaining('## 🤖 Tech Lead Analysis'),
      });
    });

    it('should format analysis comment correctly', async () => {
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);

      await githubService.addTechLeadAnalysis(mockWorkflowContext, 'Test analysis content');

      const commentCall = mockOctokit.issues.createComment.mock.calls[0][0];
      expect(commentCall.body).toContain('## 🤖 Tech Lead Analysis');
      expect(commentCall.body).toContain('Test analysis content');
      expect(commentCall.body).toContain('*Generated automatically by workflow system*');
    });
  });

  describe('createPullRequest', () => {
    it('should successfully create a pull request', async () => {
      const contextWithBranch = { ...mockWorkflowContext, branchName: 'feature/test-branch' };
      mockOctokit.pulls.create.mockResolvedValue(mockOctokitResponse.pulls.create);
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);

      const result = await githubService.createPullRequest(contextWithBranch, mockAgentResult);

      expect(result).toBe('https://github.com/testuser/test-repo/pull/456');
      expect(mockOctokit.pulls.create).toHaveBeenCalledWith({
        owner: contextWithBranch.owner,
        repo: contextWithBranch.repository,
        title: `Fix: ${contextWithBranch.title}`,
        head: contextWithBranch.branchName,
        base: 'main',
        body: expect.stringContaining('## Summary'),
      });
    });

    it('should throw error when branch name is missing', async () => {
      const contextWithoutBranch = { ...mockWorkflowContext, branchName: undefined };

      await expect(githubService.createPullRequest(contextWithoutBranch, mockAgentResult))
        .rejects.toThrow(WorkflowError);
      
      await expect(githubService.createPullRequest(contextWithoutBranch, mockAgentResult))
        .rejects.toThrow('Branch name is required for PR creation');
    });

    it('should handle PR already exists error', async () => {
      const contextWithBranch = { ...mockWorkflowContext, branchName: 'feature/test-branch' };
      mockOctokit.pulls.create.mockRejectedValue({ status: 422 });

      try {
        await githubService.createPullRequest(contextWithBranch, mockAgentResult);
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowError);
        expect((error as WorkflowError).retryable).toBe(false);
        expect((error as WorkflowError).code).toBe('PR_EXISTS');
      }
    });

    it('should format PR body correctly', async () => {
      const contextWithBranch = { ...mockWorkflowContext, branchName: 'feature/test-branch' };
      mockOctokit.pulls.create.mockResolvedValue(mockOctokitResponse.pulls.create);
      mockOctokit.issues.createComment.mockResolvedValue(mockOctokitResponse.issues.createComment);

      await githubService.createPullRequest(contextWithBranch, mockAgentResult);

      const prCall = mockOctokit.pulls.create.mock.calls[0][0];
      expect(prCall.body).toContain('## Summary');
      expect(prCall.body).toContain(`issue #${contextWithBranch.issueNumber}`);
      expect(prCall.body).toContain('## Changes Made');
      expect(prCall.body).toContain(mockAgentResult.output);
      expect(prCall.body).toContain(`Closes #${contextWithBranch.issueNumber}`);
    });
  });

  describe('validateRepository', () => {
    it('should return true for valid repository', async () => {
      mockOctokit.repos.get.mockResolvedValue(mockOctokitResponse.repos.get);

      const result = await githubService.validateRepository('testuser', 'test-repo');

      expect(result).toBe(true);
      expect(mockOctokit.repos.get).toHaveBeenCalledWith({
        owner: 'testuser',
        repo: 'test-repo',
      });
    });

    it('should return false for invalid repository', async () => {
      mockOctokit.repos.get.mockRejectedValue(new Error('Not found'));

      const result = await githubService.validateRepository('testuser', 'invalid-repo');

      expect(result).toBe(false);
    });
  });
});