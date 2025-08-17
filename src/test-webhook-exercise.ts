#!/usr/bin/env node

import { TechLeadAgent } from './agents/tech-lead.agent';
import { RealClaudeRunner } from './claude';
import { WorkflowContext, WorkflowStatus } from './types';

// Create a mock GitHub webhook event
function createMockWebhookEvent() {
  return {
    action: 'opened',
    issue: {
      id: 123456789,
      number: 42,
      title: 'Add user authentication system',
      body: `## Description
We need to implement a secure user authentication system with the following features:

### Requirements
- User registration with email verification
- Login with email/password
- JWT token-based authentication
- Password reset functionality
- Rate limiting for login attempts

### Acceptance Criteria
- [ ] Users can register with email and password
- [ ] Email verification is sent and required
- [ ] Users can login with verified credentials
- [ ] JWT tokens are issued and validated
- [ ] Password reset flow works via email
- [ ] Login attempts are rate limited (5 attempts per 15 minutes)
- [ ] All endpoints are properly secured

### Technical Notes
- Use bcrypt for password hashing
- Implement proper input validation
- Add comprehensive error handling
- Include unit and integration tests`,
      user: {
        login: 'developer123',
        id: 987654321
      },
      labels: [
        { name: 'feature' },
        { name: 'backend' },
        { name: 'high-priority' }
      ],
      assignee: null,
      state: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    repository: {
      id: 456789123,
      name: 'webapp-backend',
      full_name: 'company/webapp-backend',
      owner: {
        login: 'company',
        id: 111222333
      },
      private: false,
      default_branch: 'main'
    },
    sender: {
      login: 'developer123',
      id: 987654321
    }
  };
}

// Convert webhook event to WorkflowContext
function createWorkflowContext(webhookEvent: any): WorkflowContext {
  return {
    issueId: webhookEvent.issue.id,
    issueNumber: webhookEvent.issue.number,
    title: webhookEvent.issue.title,
    body: webhookEvent.issue.body || '',
    labels: webhookEvent.issue.labels.map((label: any) => label.name),
    repository: webhookEvent.repository.name,
    owner: webhookEvent.repository.owner.login,
    branchName: `feature/issue-${webhookEvent.issue.number}-auth-system`,
    status: WorkflowStatus.PENDING,
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

async function exerciseTechLeadAgent() {
  console.log('🚀 Starting TechLeadAgent Exercise Script');
  console.log('=====================================\n');

  // Display environment information
  console.log('📋 Environment Information:');
  console.log(`- Node.js version: ${process.version}`);
  console.log(`- Platform: ${process.platform}`);
  console.log(`- Architecture: ${process.arch}`);
  console.log(`- Working directory: ${process.cwd()}`);
  console.log(`- Claude permission bypass: not needed`);
  console.log('');

  try {
    // Step 1: Create mock webhook event
    console.log('📦 Step 1: Creating mock GitHub webhook event...');
    const webhookEvent = createMockWebhookEvent();
    console.log(`✅ Created webhook event for issue #${webhookEvent.issue.number}: "${webhookEvent.issue.title}"`);
    console.log('');

    // Step 2: Convert to workflow context
    console.log('🔄 Step 2: Converting to workflow context...');
    const context = createWorkflowContext(webhookEvent);
    console.log(`✅ Created workflow context:`);
    console.log(`   - Issue ID: ${context.issueId}`);
    console.log(`   - Repository: ${context.owner}/${context.repository}`);
    console.log(`   - Branch: ${context.branchName}`);
    console.log(`   - Labels: ${context.labels.join(', ')}`);
    console.log(`   - Status: ${context.status}`);
    console.log('');

    // Step 3: Initialize TechLeadAgent
    console.log('🤖 Step 3: Initializing TechLeadAgent...');
    const claudeRunner = new RealClaudeRunner(60000); // 60 second timeout
    const techLeadAgent = new TechLeadAgent(claudeRunner, 60000);
    console.log('✅ TechLeadAgent initialized successfully');
    console.log('');

    // Step 4: Execute tech lead analysis
    console.log('🔍 Step 4: Executing tech lead analysis...');
    console.log('⏳ This may take a moment as Claude analyzes the issue...');
    console.log('');

    const startTime = Date.now();
    const result = await techLeadAgent.execute(context);
    const duration = Date.now() - startTime;

    // Step 5: Display results
    console.log('📊 Step 5: Analysis Results');
    console.log('==========================');
    console.log(`⏱️  Execution time: ${duration}ms`);
    console.log(`✅ Success: ${result.success}`);
    console.log('');

    if (result.success) {
      console.log('📝 Tech Lead Analysis Output:');
      console.log('─'.repeat(60));
      console.log(result.output);
      console.log('─'.repeat(60));
    } else {
      console.log('❌ Analysis failed:');
      console.log(`   Error: ${result.error}`);
      if (result.output) {
        console.log('   Partial output:');
        console.log('   ' + result.output.split('\n').join('\n   '));
      }
    }

    console.log('');
    console.log('🎉 TechLeadAgent exercise completed successfully!');

  } catch (error: any) {
    console.error('💥 Exercise failed with error:');
    console.error(`   Type: ${error.constructor.name}`);
    console.error(`   Message: ${error.message}`);
    
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    
    if (error.stack) {
      console.error('\n📚 Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

// Add some diagnostic information
console.log('🔧 Diagnostic Information:');
console.log(`- Script path: ${__filename}`);
console.log(`- Arguments: ${process.argv.slice(2).join(' ') || 'none'}`);
console.log('');

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the exercise
if (require.main === module) {
  exerciseTechLeadAgent();
}

export { exerciseTechLeadAgent, createMockWebhookEvent, createWorkflowContext };