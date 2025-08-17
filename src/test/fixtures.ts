import {
  GitHubWebhook,
  GitHubIssue,
  GitHubRepository,
  GitHubUser,
  WorkflowContext,
  WorkflowStatus,
  AgentType,
} from '../types';

export const mockGitHubUser: GitHubUser = {
  id: 12345,
  login: 'testuser',
  avatar_url: 'https://github.com/images/error/testuser_happy.gif',
  html_url: 'https://github.com/testuser',
};

export const mockGitHubRepository: GitHubRepository = {
  id: 67890,
  name: 'test-repo',
  full_name: 'testuser/test-repo',
  owner: mockGitHubUser,
  default_branch: 'main',
  clone_url: 'https://github.com/testuser/test-repo.git',
  html_url: 'https://github.com/testuser/test-repo',
};

export const mockGitHubIssue: GitHubIssue = {
  id: 111222,
  number: 123,
  title: 'Add user authentication',
  body: 'We need to add login functionality to the app',
  state: 'open',
  labels: [
    { id: 1, name: 'enhancement', color: 'a2eeef', description: 'New feature or request' },
    { id: 2, name: 'backend', color: 'd73a4a', description: 'Backend related' },
  ],
  assignees: [],
  user: mockGitHubUser,
  created_at: '2023-01-01T12:00:00Z',
  updated_at: '2023-01-01T12:00:00Z',
  html_url: 'https://github.com/testuser/test-repo/issues/123',
};

export const mockGitHubWebhook: GitHubWebhook = {
  action: 'opened',
  issue: mockGitHubIssue,
  repository: mockGitHubRepository,
  sender: mockGitHubUser,
};

export const mockWorkflowContext: WorkflowContext = {
  issueId: mockGitHubIssue.id,
  issueNumber: mockGitHubIssue.number,
  repository: mockGitHubRepository.name,
  owner: mockGitHubRepository.owner.login,
  title: mockGitHubIssue.title,
  body: mockGitHubIssue.body || '',
  labels: mockGitHubIssue.labels.map(label => label.name),
  branchName: 'feature/issue-123-1234567890',
  agentType: AgentType.TECH_LEAD,
  status: WorkflowStatus.PENDING,
  retryCount: 0,
  createdAt: new Date('2023-01-01T12:00:00Z'),
  updatedAt: new Date('2023-01-01T12:00:00Z'),
};

export const mockOctokitResponse = {
  repos: {
    getBranch: {
      data: {
        commit: {
          sha: 'abc123def456',
        },
      },
    },
    get: {
      data: {
        id: 67890,
        name: 'test-repo',
        full_name: 'testuser/test-repo',
      },
    },
  },
  git: {
    createRef: {
      data: {
        ref: 'refs/heads/feature/issue-123-1234567890',
        object: {
          sha: 'abc123def456',
        },
      },
    },
  },
  issues: {
    createComment: {
      data: {
        id: 999,
        body: 'Test comment',
        html_url: 'https://github.com/testuser/test-repo/issues/123#issuecomment-999',
      },
    },
    addLabels: {
      data: [{ id: 3, name: 'workflow:processing', color: 'f9d71c' }],
    },
  },
  pulls: {
    create: {
      data: {
        id: 555,
        number: 456,
        title: 'Fix: Add user authentication',
        html_url: 'https://github.com/testuser/test-repo/pull/456',
      },
    },
  },
};

export const mockSQSMessage = {
  MessageId: 'test-message-id',
  ReceiptHandle: 'test-receipt-handle',
  Body: JSON.stringify(mockGitHubWebhook),
  Attributes: {},
  MessageAttributes: {
    'event-type': {
      DataType: 'String',
      StringValue: 'github-issue-opened',
    },
  },
};

export const mockAgentResult = {
  success: true,
  output: `## Technical Analysis

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
   - Token generation and refresh logic`,
};
