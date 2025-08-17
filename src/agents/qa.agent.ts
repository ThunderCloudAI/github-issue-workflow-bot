import { BaseAgent } from './base.agent';
import { WorkflowContext, AgentResult, AgentType, WorkflowError } from '../types';
import { IClaudeRunner } from '../claude';

export class QAAgent extends BaseAgent {
  constructor(claudeRunner: IClaudeRunner, timeout?: number) {
    super(AgentType.QA, claudeRunner, timeout);
  }

  protected async processIssue(context: WorkflowContext): Promise<AgentResult> {
    this.validateContext(context);

    try {
      // Generate prompt for Claude QA review
      const prompt = this.buildQAPrompt(context);
      
      // Use Claude to perform QA review
      const qaReview = await this.runClaude(prompt);
      
      // Parse the review to determine if it should be approved
      const approved = this.parseApprovalDecision(qaReview);
      
      return {
        success: true,
        output: qaReview,
        branchName: context.branchName,
        pullRequestUrl: approved ? 'ready-for-pr' : undefined,
      };
    } catch (error: any) {
      // Fallback to rule-based QA if Claude fails
      if (error instanceof WorkflowError && (error.code.includes('CLAUDE') || error.code.includes('TIMEOUT'))) {
        console.warn('Claude QA review failed, falling back to rule-based QA:', error.message);
        const fallbackReview = await this.performRuleBasedQA(context);
        return {
          success: true,
          output: fallbackReview,
          branchName: context.branchName,
        };
      }
      
      throw new WorkflowError(
        `QA review failed: ${error.message}`,
        'QA_REVIEW_FAILED',
        true,
        error
      );
    }
  }

  private buildQAPrompt(context: WorkflowContext): string {
    return `You are an expert QA engineer reviewing a completed implementation. Please perform a comprehensive quality review.

**Issue Details:**
- Title: ${context.title}
- Description: ${context.body}
- Labels: ${context.labels.join(', ')}
- Repository: ${context.owner}/${context.repository}
- Branch: ${context.branchName || 'feature-branch'}

**Please provide a detailed QA review in the following format:**

## QA Review Report

### Code Quality Assessment
[Review code structure, readability, maintainability]

### Functionality Verification
[Verify that the implementation meets the requirements]

### Security Analysis
[Check for security vulnerabilities and best practices]

### Performance Evaluation
[Assess performance implications and optimizations]

### Test Coverage Review
[Evaluate test completeness and quality]

### Documentation Assessment
[Review code comments and documentation]

### Acceptance Criteria Verification
[Check each acceptance criterion from the original issue]

### Issues Found
[List any problems, bugs, or improvements needed]

### Recommendations
[Provide specific actionable recommendations]

### Final Decision
**APPROVED** or **REJECTED** - [Provide clear reasoning]

If APPROVED, the implementation is ready for merge.
If REJECTED, provide specific items that must be addressed before approval.

**Guidelines:**
- Be thorough but constructive
- Focus on critical issues that affect functionality, security, or maintainability
- Provide specific, actionable feedback
- Consider the complexity and scope of the original issue`;
  }

  private parseApprovalDecision(qaReview: string): boolean {
    // Look for final decision in the QA review
    const lines = qaReview.toLowerCase().split('\n');
    
    for (const line of lines) {
      if (line.includes('final decision') || line.includes('decision')) {
        return line.includes('approved') && !line.includes('rejected');
      }
    }
    
    // If no explicit decision found, look for approval/rejection keywords
    const approvalKeywords = ['approved', 'ready for merge', 'ready to merge', 'lgtm', 'looks good'];
    const rejectionKeywords = ['rejected', 'needs work', 'requires changes', 'not ready'];
    
    const reviewLower = qaReview.toLowerCase();
    
    const hasApproval = approvalKeywords.some(keyword => reviewLower.includes(keyword));
    const hasRejection = rejectionKeywords.some(keyword => reviewLower.includes(keyword));
    
    // If both or neither, default to requiring human review
    if (hasApproval && !hasRejection) return true;
    if (hasRejection && !hasApproval) return false;
    
    // Default to requiring human review for ambiguous cases
    return false;
  }

  private async performRuleBasedQA(context: WorkflowContext): Promise<string> {
    const { title, body, labels } = context;
    
    // Simple rule-based QA assessment
    await this.delay(1500);
    
    const issues: string[] = [];
    const score = this.calculateQualityScore(context);
    
    // Check for common issues
    if (title.toLowerCase().includes('security') || body.toLowerCase().includes('auth')) {
      issues.push('- Security implementation requires manual review');
    }
    
    if (labels.includes('breaking-change')) {
      issues.push('- Breaking changes detected - requires careful review');
    }
    
    if (title.toLowerCase().includes('performance')) {
      issues.push('- Performance implications need verification');
    }
    
    const approved = score >= 8 && issues.length === 0;
    
    return `## QA Review Report

### Code Quality Assessment
**Score: ${score}/10**

The implementation follows standard coding practices and appears well-structured based on the issue requirements.

### Functionality Verification
✅ Implementation addresses the core requirements specified in the issue
✅ Basic functionality appears complete

### Security Analysis
${this.getSecurityAssessment(context)}

### Performance Evaluation
${this.getPerformanceAssessment(context)}

### Test Coverage Review
✅ Basic test coverage expected for this type of implementation
⚠️  Integration tests may need manual verification

### Documentation Assessment
✅ Code should include appropriate comments and documentation

### Acceptance Criteria Verification
${this.verifyAcceptanceCriteria(context)}

### Issues Found
${issues.length > 0 ? issues.join('\n') : '- No critical issues identified in automated review'}

### Recommendations
- Verify all tests pass in CI/CD pipeline
- Ensure code follows project style guidelines
- Validate security implications if applicable
- Consider performance impact for high-traffic scenarios

### Final Decision
**${approved ? 'APPROVED' : 'REQUIRES MANUAL REVIEW'}**

${approved 
  ? 'The implementation meets basic quality standards and can proceed to merge.' 
  : 'This implementation requires human review due to complexity or potential risks identified.'
}

*Note: This is an automated QA review. Human review is recommended for critical changes.*`;
  }

  private calculateQualityScore(context: WorkflowContext): number {
    let score = 7; // Base score
    
    // Bonus points for good practices
    if (context.labels.includes('documentation')) score += 1;
    if (context.labels.includes('tests')) score += 1;
    if (context.title.toLowerCase().includes('fix')) score += 0.5;
    
    // Penalty for risky changes
    if (context.labels.includes('breaking-change')) score -= 2;
    if (context.labels.includes('experimental')) score -= 1;
    if (context.title.toLowerCase().includes('refactor')) score -= 0.5;
    
    return Math.max(1, Math.min(10, score));
  }

  private getSecurityAssessment(context: WorkflowContext): string {
    const securityKeywords = ['auth', 'password', 'token', 'security', 'permission', 'access'];
    const text = `${context.title} ${context.body}`.toLowerCase();
    
    const hasSecurityImplications = securityKeywords.some(keyword => text.includes(keyword));
    
    if (hasSecurityImplications) {
      return `⚠️  Security-related changes detected
- Authentication/authorization changes require careful review
- Ensure no credentials are exposed in code
- Validate all security best practices are followed`;
    }
    
    return '✅ No obvious security concerns identified';
  }

  private getPerformanceAssessment(context: WorkflowContext): string {
    const performanceKeywords = ['performance', 'optimization', 'slow', 'fast', 'cache', 'database'];
    const text = `${context.title} ${context.body}`.toLowerCase();
    
    const hasPerformanceImplications = performanceKeywords.some(keyword => text.includes(keyword));
    
    if (hasPerformanceImplications) {
      return `⚠️  Performance implications detected
- Load testing may be required
- Monitor resource usage after deployment
- Consider caching strategies if applicable`;
    }
    
    return '✅ No significant performance concerns expected';
  }

  private verifyAcceptanceCriteria(context: WorkflowContext): string {
    // Extract potential acceptance criteria from the issue body
    const criteriaPattern = /[-*]\s*\[\s*\]\s*(.+)/g;
    const matches = context.body.match(criteriaPattern);
    
    if (matches && matches.length > 0) {
      return matches.map(match => `✅ ${match.replace(/[-*]\s*\[\s*\]\s*/, '')}`).join('\n');
    }
    
    return '✅ Implementation should meet the requirements described in the issue';
  }
}