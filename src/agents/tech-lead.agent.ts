import { BaseAgent } from './base.agent';
import { WorkflowContext, AgentResult, AgentType, WorkflowError } from '../types';
import { IClaudeRunner } from '../claude';

export class TechLeadAgent extends BaseAgent {
  constructor(claudeRunner: IClaudeRunner, timeout?: number) {
    super(AgentType.TECH_LEAD, claudeRunner, timeout ?? 30000);
  }

  protected async processIssue(context: WorkflowContext): Promise<AgentResult> {
    this.validateContext(context);

    try {
      // Generate prompt for Claude analysis
      const prompt = this.buildAnalysisPrompt(context);

      // Use Claude to analyze the issue
      const analysis = await this.runClaude(prompt);

      return {
        success: true,
        output: analysis,
      };
    } catch (error: any) {
      throw new WorkflowError(
        `Tech lead analysis failed: ${error.message}`,
        'TECH_LEAD_ANALYSIS_FAILED',
        true,
        error
      );
    }
  }

  private buildAnalysisPrompt(context: WorkflowContext): string {
    return `You are an expert tech lead reviewing a GitHub issue. Please provide a comprehensive technical analysis and recommendations.

**Issue Details:**
- Title: ${context.title}
- Description: ${context.body}
- Labels: ${context.labels.join(', ')}
- Repository: ${context.owner}/${context.repository}

**Please provide a detailed analysis in the following format:**

## Technical Analysis

### Complexity Assessment
[Assess if this is Low/Medium/High complexity and explain why]

### Recommended Technologies
[List specific technologies, libraries, or frameworks that should be used]

### Implementation Approach
[Provide a step-by-step implementation plan with numbered steps]

### Testing Strategy
[Outline what types of tests should be written]

### Estimated Timeline
[Provide time estimate in business days]

### Dependencies
[List any external dependencies or prerequisites]

### Acceptance Criteria
[Create a checklist of requirements that must be met]

Please be specific and actionable in your recommendations. Focus on practical implementation details that a developer can follow.`;
  }
}
