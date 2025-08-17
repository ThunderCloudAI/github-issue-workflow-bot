export interface GitHubWebhook {
  action: string;
  issue: GitHubIssue;
  repository: GitHubRepository;
  sender: GitHubUser;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
  default_branch: string;
  clone_url: string;
  html_url: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface WorkflowContext {
  issueId: number;
  issueNumber: number;
  repository: string;
  owner: string;
  title: string;
  body: string;
  labels: string[];
  branchName?: string;
  agentType?: AgentType;
  status: WorkflowStatus;
  retryCount: number;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum WorkflowStatus {
  PENDING = 'pending',
  PARSING = 'parsing',
  BRANCH_CREATING = 'branch_creating',
  AGENT_ASSIGNED = 'agent_assigned',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum AgentType {
  TECH_LEAD = 'tech_lead',
  WORKER = 'worker',
  QA = 'qa',
}

export interface AgentResult {
  success: boolean;
  output: string;
  branchName?: string;
  pullRequestUrl?: string;
  error?: string;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface WorkflowConfig {
  github: {
    token: string;
    webhookSecret: string;
  };
  retry: RetryConfig;
  agents: {
    [key in AgentType]: {
      enabled: boolean;
      timeout: number;
    };
  };
}

export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = true,
    public readonly context?: any
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}
