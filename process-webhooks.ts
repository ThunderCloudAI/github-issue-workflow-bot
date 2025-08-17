#!/usr/bin/env node

/**
 * Simple GitHub Webhook Processor (TypeScript)
 *
 * This script polls the SQS queue for GitHub webhook messages and processes them.
 * It demonstrates how to handle different types of GitHub events with proper typing.
 */

import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';

// Configuration
const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/036670977009/github-webhook-events';
const REGION = 'us-east-1';
const MAX_MESSAGES = 10;
const WAIT_TIME_SECONDS = 20; // Long polling

// Initialize SQS client
const sqsClient = new SQSClient({ region: REGION });

// GitHub Webhook Types
interface BaseWebhookData {
  githubEvent: string;
  githubDelivery: string;
  timestamp: string;
  payload: any;
}

interface GitHubUser {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  type: string;
  site_admin: boolean;
  name?: string;
  email?: string;
}

interface GitHubRepository {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  owner: GitHubUser;
  html_url: string;
  description: string | null;
  fork: boolean;
  url: string;
  default_branch: string;
}

interface GitHubCommit {
  id: string;
  tree_id: string;
  distinct: boolean;
  message: string;
  timestamp: string;
  url: string;
  author: {
    name: string;
    email: string;
    username?: string;
  };
  committer: {
    name: string;
    email: string;
    username?: string;
  };
  added: string[];
  removed: string[];
  modified: string[];
}

interface GitHubLabel {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  default: boolean;
  description: string | null;
}

interface GitHubIssue {
  url: string;
  repository_url: string;
  labels_url: string;
  comments_url: string;
  events_url: string;
  html_url: string;
  id: number;
  node_id: string;
  number: number;
  title: string;
  user: GitHubUser;
  labels: GitHubLabel[];
  state: 'open' | 'closed';
  locked: boolean;
  assignee: GitHubUser | null;
  assignees: GitHubUser[];
  milestone: any | null;
  comments: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  author_association: string;
  active_lock_reason: string | null;
  body: string | null;
}

interface GitHubPullRequest {
  url: string;
  id: number;
  node_id: string;
  html_url: string;
  diff_url: string;
  patch_url: string;
  issue_url: string;
  number: number;
  state: 'open' | 'closed';
  locked: boolean;
  title: string;
  user: GitHubUser;
  body: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  merge_commit_sha: string | null;
  assignee: GitHubUser | null;
  assignees: GitHubUser[];
  requested_reviewers: GitHubUser[];
  requested_teams: any[];
  labels: GitHubLabel[];
  milestone: any | null;
  draft: boolean;
  commits_url: string;
  review_comments_url: string;
  review_comment_url: string;
  comments_url: string;
  statuses_url: string;
  head: {
    label: string;
    ref: string;
    sha: string;
    user: GitHubUser;
    repo: GitHubRepository;
  };
  base: {
    label: string;
    ref: string;
    sha: string;
    user: GitHubUser;
    repo: GitHubRepository;
  };
  author_association: string;
  auto_merge: any | null;
  active_lock_reason: string | null;
  merged: boolean;
  mergeable: boolean | null;
  rebaseable: boolean | null;
  mergeable_state: string;
  merged_by: GitHubUser | null;
  comments: number;
  review_comments: number;
  maintainer_can_modify: boolean;
  commits: number;
  additions: number;
  deletions: number;
  changed_files: number;
}

interface GitHubComment {
  url: string;
  html_url: string;
  issue_url: string;
  id: number;
  node_id: string;
  user: GitHubUser;
  created_at: string;
  updated_at: string;
  author_association: string;
  body: string;
  reactions: {
    url: string;
    total_count: number;
    '+1': number;
    '-1': number;
    laugh: number;
    hooray: number;
    confused: number;
    heart: number;
    rocket: number;
    eyes: number;
  };
}

// Event Payload Types
interface PingEventPayload {
  zen: string;
  hook_id: number;
  hook: {
    type: string;
    id: number;
    name: string;
    active: boolean;
    events: string[];
    config: {
      content_type: string;
      insecure_ssl: string;
      url: string;
    };
    updated_at: string;
    created_at: string;
    url: string;
    test_url: string;
    ping_url: string;
    last_response: {
      code: number | null;
      status: string;
      message: string | null;
    };
  };
  repository: GitHubRepository;
  sender: GitHubUser;
}

interface PushEventPayload {
  ref: string;
  before: string;
  after: string;
  repository: GitHubRepository;
  pusher: {
    name: string;
    email: string;
  };
  sender: GitHubUser;
  created: boolean;
  deleted: boolean;
  forced: boolean;
  base_ref: string | null;
  compare: string;
  commits: GitHubCommit[];
  head_commit: GitHubCommit | null;
}

interface PullRequestEventPayload {
  action:
    | 'opened'
    | 'edited'
    | 'closed'
    | 'reopened'
    | 'assigned'
    | 'unassigned'
    | 'review_requested'
    | 'review_request_removed'
    | 'labeled'
    | 'unlabeled'
    | 'synchronize';
  number: number;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
}

interface IssueEventPayload {
  action:
    | 'opened'
    | 'edited'
    | 'deleted'
    | 'pinned'
    | 'unpinned'
    | 'closed'
    | 'reopened'
    | 'assigned'
    | 'unassigned'
    | 'labeled'
    | 'unlabeled';
  issue: GitHubIssue;
  repository: GitHubRepository;
  sender: GitHubUser;
}

interface IssueCommentEventPayload {
  action: 'created' | 'edited' | 'deleted';
  issue: GitHubIssue;
  comment: GitHubComment;
  repository: GitHubRepository;
  sender: GitHubUser;
}

/**
 * Process a GitHub webhook message
 */
function processWebhookMessage(message: Message): boolean {
  try {
    if (!message.Body) {
      console.error('❌ Message body is empty');
      return false;
    }

    const webhookData: BaseWebhookData = JSON.parse(message.Body);
    const { githubEvent, githubDelivery, timestamp, payload } = webhookData;

    console.log('\n🔔 GitHub Webhook Received');
    console.log('─'.repeat(50));
    console.log(`📅 Timestamp: ${timestamp}`);
    console.log(`🏷️  Event Type: ${githubEvent}`);
    console.log(`📦 Delivery ID: ${githubDelivery}`);

    // Process different event types with proper typing
    switch (githubEvent) {
      case 'ping':
        processPingEvent(payload as PingEventPayload);
        break;

      case 'push':
        processPushEvent(payload as PushEventPayload);
        break;

      case 'pull_request':
        processPullRequestEvent(payload as PullRequestEventPayload);
        break;

      case 'issues':
        processIssueEvent(payload as IssueEventPayload);
        break;

      case 'issue_comment':
        processIssueCommentEvent(payload as IssueCommentEventPayload);
        break;

      default:
        console.log(`ℹ️  Unhandled event type: ${githubEvent}`);
        console.log(`📄 Payload keys: ${Object.keys(payload).join(', ')}`);
    }

    return true;
  } catch (error) {
    console.error('❌ Error processing webhook message:', error);
    console.error('📄 Message body:', message.Body?.substring(0, 500) + '...');
    return false;
  }
}

/**
 * Process ping event (webhook test)
 */
function processPingEvent(payload: PingEventPayload): void {
  console.log('🏓 Webhook Ping Event');
  console.log(`📁 Repository: ${payload.repository?.full_name || 'Unknown'}`);
  console.log(`🔗 Hook ID: ${payload.hook?.id || 'Unknown'}`);
  console.log(`🎯 Zen: ${payload.zen}`);
  console.log('✅ Webhook is configured correctly!');
}

/**
 * Process push event
 */
function processPushEvent(payload: PushEventPayload): void {
  const { repository, ref, commits, pusher } = payload;

  console.log('🚀 Push Event');
  console.log(`📁 Repository: ${repository.full_name}`);
  console.log(`🌿 Branch: ${ref.replace('refs/heads/', '')}`);
  console.log(`👤 Pusher: ${pusher.name} (${pusher.email})`);
  console.log(`📊 Commits: ${commits.length}`);

  // Show recent commits
  if (commits.length > 0) {
    console.log('\n📝 Recent Commits:');
    commits.slice(0, 3).forEach((commit: GitHubCommit, index: number) => {
      const firstLine = commit.message.split('\n')[0];
      console.log(`  ${index + 1}. ${firstLine} - ${commit.author.name}`);
      console.log(`     SHA: ${commit.id.substring(0, 8)}`);
      console.log(
        `     Files: +${commit.added.length} ~${commit.modified.length} -${commit.removed.length}`
      );
    });
  }

  // Show before/after info
  console.log(`\n🔄 Changes: ${payload.before.substring(0, 8)} → ${payload.after.substring(0, 8)}`);
}

/**
 * Process pull request event
 */
function processPullRequestEvent(payload: PullRequestEventPayload): void {
  const { action, pull_request, repository } = payload;

  console.log('🔀 Pull Request Event');
  console.log(`📁 Repository: ${repository.full_name}`);
  console.log(`🎬 Action: ${action}`);
  console.log(`#️⃣  PR #${pull_request.number}: ${pull_request.title}`);
  console.log(`👤 Author: ${pull_request.user.login}`);
  console.log(`🌿 Branch: ${pull_request.head.ref} → ${pull_request.base.ref}`);
  console.log(`📄 State: ${pull_request.state}`);

  if (pull_request.draft) {
    console.log('📝 Status: Draft');
  }

  if (pull_request.labels.length > 0) {
    console.log(`🏷️  Labels: ${pull_request.labels.map(l => l.name).join(', ')}`);
  }

  if (pull_request.assignees.length > 0) {
    console.log(`👥 Assignees: ${pull_request.assignees.map(a => a.login).join(', ')}`);
  }
}

/**
 * Process issue event
 */
function processIssueEvent(payload: IssueEventPayload): void {
  const { action, issue, repository } = payload;

  console.log('🐛 Issue Event');
  console.log(`📁 Repository: ${repository.full_name}`);
  console.log(`🎬 Action: ${action}`);
  console.log(`#️⃣  Issue #${issue.number}: ${issue.title}`);
  console.log(`👤 Author: ${issue.user.login}`);
  console.log(`📄 State: ${issue.state}`);

  if (issue.labels.length > 0) {
    console.log(`🏷️  Labels: ${issue.labels.map(l => l.name).join(', ')}`);
  }

  if (issue.assignees.length > 0) {
    console.log(`👥 Assignees: ${issue.assignees.map(a => a.login).join(', ')}`);
  }

  if (issue.body) {
    const preview = issue.body.substring(0, 100);
    console.log(`💭 Body: ${preview}${issue.body.length > 100 ? '...' : ''}`);
  }
}

/**
 * Process issue comment event
 */
function processIssueCommentEvent(payload: IssueCommentEventPayload): void {
  const { action, comment, issue, repository } = payload;

  console.log('💬 Issue Comment Event');
  console.log(`📁 Repository: ${repository.full_name}`);
  console.log(`🎬 Action: ${action}`);
  console.log(`#️⃣  Issue #${issue.number}: ${issue.title}`);
  console.log(`👤 Commenter: ${comment.user.login}`);

  const commentPreview = comment.body.substring(0, 100);
  console.log(`💭 Comment: ${commentPreview}${comment.body.length > 100 ? '...' : ''}`);

  const { reactions } = comment;
  const totalReactions = reactions.total_count;
  if (totalReactions > 0) {
    console.log(
      `👍 Reactions: ${totalReactions} (👍 ${reactions['+1']} 👎 ${reactions['-1']} ❤️ ${reactions.heart})`
    );
  }
}

/**
 * Poll SQS queue for messages
 */
async function pollQueue(): Promise<void> {
  console.log(`🔍 Polling SQS queue for GitHub webhook messages...`);
  console.log(`📍 Queue: ${QUEUE_URL}`);
  console.log(`⏱️  Long polling: ${WAIT_TIME_SECONDS}s`);
  console.log('Press Ctrl+C to stop\n');

  while (true) {
    try {
      // Receive messages from SQS
      const command = new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: MAX_MESSAGES,
        WaitTimeSeconds: WAIT_TIME_SECONDS,
        MessageAttributeNames: ['All'],
      });

      const response = await sqsClient.send(command);

      if (response.Messages && response.Messages.length > 0) {
        console.log(`📨 Received ${response.Messages.length} message(s)`);

        // Process each message
        for (const message of response.Messages) {
          const processed = processWebhookMessage(message);

          if (processed) {
            // Delete message from queue after successful processing
            if (message.ReceiptHandle) {
              await sqsClient.send(
                new DeleteMessageCommand({
                  QueueUrl: QUEUE_URL,
                  ReceiptHandle: message.ReceiptHandle,
                })
              );

              console.log('✅ Message processed and deleted from queue');
            }
          } else {
            console.log('⚠️  Message processing failed, leaving in queue');
          }
        }
      } else {
        process.stdout.write('⏳ Waiting for messages...\r');
      }
    } catch (error) {
      console.error('❌ Error polling queue:', error);
      console.log('🔄 Retrying in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Display a single message without deleting it
 */
async function peekQueue(): Promise<void> {
  try {
    console.log('👀 Peeking at queue contents...\n');

    const command = new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 1,
      MessageAttributeNames: ['All'],
    });

    const response = await sqsClient.send(command);

    if (response.Messages && response.Messages.length > 0) {
      console.log('📨 Found message in queue:');
      processWebhookMessage(response.Messages[0]);
      console.log('\n💡 Run with --process to consume messages from queue');
    } else {
      console.log('📭 No messages in queue');
    }
  } catch (error) {
    console.error('❌ Error peeking queue:', error);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  console.log('🔧 GitHub Webhook Processor (TypeScript)');
  console.log('='.repeat(50));

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage:');
    console.log('  tsx process-webhooks.ts [--process|--peek]');
    console.log('  # or compile first:');
    console.log('  tsc process-webhooks.ts && node process-webhooks.js');
    console.log('');
    console.log('Options:');
    console.log('  --process    Process messages from queue (default)');
    console.log('  --peek       Just peek at one message without consuming it');
    console.log('  --help, -h   Show this help message');
    return;
  }

  if (args.includes('--peek')) {
    await peekQueue();
  } else {
    // Default: process messages
    await pollQueue();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  process.exit(0);
});

// Run the script
main().catch((error: Error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
