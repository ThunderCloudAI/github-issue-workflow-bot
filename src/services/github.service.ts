import { Octokit } from '@octokit/rest';
import { WorkflowError, WorkflowContext, AgentResult } from '../types';

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  async createBranch(context: WorkflowContext): Promise<string> {
    try {
      const { owner, repository } = context;
      const branchName = `feature/issue-${context.issueNumber}-${Date.now()}`;

      // Get the default branch's latest commit SHA
      const { data: defaultBranch } = await this.octokit.repos.getBranch({
        owner,
        repo: repository,
        branch: 'main',
      });

      // Create new branch
      await this.octokit.git.createRef({
        owner,
        repo: repository,
        ref: `refs/heads/${branchName}`,
        sha: defaultBranch.commit.sha,
      });

      return branchName;
    } catch (error: any) {
      if (error.status === 422) {
        throw new WorkflowError(
          'Branch already exists or invalid branch name',
          'BRANCH_EXISTS',
          false,
          { branchName: context.branchName }
        );
      }
      if (error.status === 404) {
        throw new WorkflowError(
          'Repository not found or insufficient permissions',
          'REPO_NOT_FOUND',
          false,
          { owner: context.owner, repo: context.repository }
        );
      }
      throw new WorkflowError(
        `Failed to create branch: ${error.message}`,
        'BRANCH_CREATION_FAILED',
        true,
        error
      );
    }
  }

  async updateIssueStatus(
    context: WorkflowContext,
    status: string,
    details?: string
  ): Promise<void> {
    try {
      const { owner, repository, issueNumber } = context;

      const comment = this.formatStatusComment(status, details);

      await this.octokit.issues.createComment({
        owner,
        repo: repository,
        issue_number: issueNumber,
        body: comment,
      });

      // Add labels to track workflow status
      await this.octokit.issues.addLabels({
        owner,
        repo: repository,
        issue_number: issueNumber,
        labels: [`workflow:${status}`],
      });
    } catch (error: any) {
      if (error.status === 404) {
        throw new WorkflowError('Issue not found', 'ISSUE_NOT_FOUND', false, {
          issueNumber: context.issueNumber,
        });
      }
      throw new WorkflowError(
        `Failed to update issue status: ${error.message}`,
        'STATUS_UPDATE_FAILED',
        true,
        error
      );
    }
  }

  async addTechLeadAnalysis(context: WorkflowContext, analysis: string): Promise<void> {
    try {
      const { owner, repository, issueNumber } = context;

      const comment = `## 🤖 Tech Lead Analysis\n\n${analysis}\n\n---\n*Generated automatically by workflow system*`;

      await this.octokit.issues.createComment({
        owner,
        repo: repository,
        issue_number: issueNumber,
        body: comment,
      });
    } catch (error: any) {
      throw new WorkflowError(
        `Failed to add tech lead analysis: ${error.message}`,
        'ANALYSIS_UPDATE_FAILED',
        true,
        error
      );
    }
  }

  async createPullRequest(context: WorkflowContext, result: AgentResult): Promise<string> {
    try {
      const { owner, repository, issueNumber, branchName, title } = context;

      if (!branchName) {
        throw new WorkflowError('Branch name is required for PR creation', 'MISSING_BRANCH', false);
      }

      const { data: pr } = await this.octokit.pulls.create({
        owner,
        repo: repository,
        title: `Fix: ${title}`,
        head: branchName,
        base: 'main',
        body: this.formatPullRequestBody(context, result),
      });

      // Link the PR to the issue
      await this.octokit.issues.createComment({
        owner,
        repo: repository,
        issue_number: issueNumber,
        body: `🎉 Pull request created: ${pr.html_url}`,
      });

      return pr.html_url;
    } catch (error: any) {
      if (error.status === 422) {
        throw new WorkflowError(
          'Pull request already exists or invalid parameters',
          'PR_EXISTS',
          false,
          { branchName: context.branchName }
        );
      }
      throw new WorkflowError(
        `Failed to create pull request: ${error.message}`,
        'PR_CREATION_FAILED',
        true,
        error
      );
    }
  }

  private formatStatusComment(status: string, details?: string): string {
    const timestamp = new Date().toISOString();
    let comment = `## 🔄 Workflow Status Update\n\n**Status:** ${status}\n**Timestamp:** ${timestamp}\n`;

    if (details) {
      comment += `\n**Details:**\n${details}\n`;
    }

    comment += '\n---\n*Automated workflow system*';
    return comment;
  }

  private formatPullRequestBody(context: WorkflowContext, result: AgentResult): string {
    return `## Summary

This PR addresses issue #${context.issueNumber}: ${context.title}

## Changes Made

${result.output}

## Testing

- [ ] Unit tests added/updated
- [ ] Manual testing completed
- [ ] All existing tests pass

## Related Issue

Closes #${context.issueNumber}

---
*Generated automatically by workflow system*`;
  }

  async validateRepository(owner: string, repository: string): Promise<boolean> {
    try {
      await this.octokit.repos.get({
        owner,
        repo: repository,
      });
      return true;
    } catch {
      return false;
    }
  }
}
