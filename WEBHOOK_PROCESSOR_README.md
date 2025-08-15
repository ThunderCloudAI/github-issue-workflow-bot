# GitHub Webhook Processor

A TypeScript application to process GitHub webhook messages from the SQS queue with full type safety.

## Features

- 🔍 **Long Polling**: Efficiently waits for messages using SQS long polling
- 🎯 **Event Processing**: Handles different GitHub event types (push, PR, issues, etc.)
- 🔄 **Auto-cleanup**: Automatically deletes processed messages from the queue
- 👀 **Peek Mode**: Preview messages without consuming them
- 📊 **Rich Output**: Formatted, colorful console output with emojis
- 🔒 **Type Safety**: Full TypeScript types for all GitHub webhook payloads
- 🚀 **Enhanced Processing**: More detailed event information with type validation

## Usage

### Prerequisites

Make sure you have AWS credentials configured and the required dependencies:

```bash
# Install dependencies (already done in this project)
npm install

# Ensure AWS credentials are configured
aws configure list
```

### Commands

#### Process Messages (Default)
Continuously polls and processes messages from the SQS queue:

```bash
# TypeScript (recommended)
npm run webhook:process
# or directly with tsx
tsx process-webhooks.ts

# JavaScript (legacy)
node process-webhooks.js --process
```

This will:
- Poll the SQS queue every 20 seconds
- Process any received webhook messages
- Display formatted information about each GitHub event
- Delete processed messages from the queue
- Run continuously until stopped with Ctrl+C

#### Peek at Messages
View one message without removing it from the queue:

```bash
# TypeScript (recommended)
npm run webhook:peek
# or directly with tsx
tsx process-webhooks.ts --peek

# JavaScript (legacy)
node process-webhooks.js --peek
```

This is useful for:
- Debugging webhook payloads
- Checking what messages are in the queue
- Testing the processor logic without consuming messages

#### Help
Show usage information:

```bash
# TypeScript
tsx process-webhooks.ts --help

# JavaScript
node process-webhooks.js --help
```

## TypeScript Benefits

The TypeScript version provides several advantages over the JavaScript version:

- **🔒 Type Safety**: Full type definitions for all GitHub webhook payloads
- **🚀 Enhanced Processing**: More detailed event information with proper typing
- **🛡️ Runtime Safety**: Better error handling with type guards
- **📝 IntelliSense**: Full IDE support with autocomplete and error detection
- **🔍 Better Debugging**: Type information helps identify payload structure issues
- **📊 Richer Output**: Additional event details like file changes, reactions, etc.

## Supported GitHub Events

The processor handles these GitHub webhook events with full type safety:

### 🏓 Ping Event
- Webhook test/validation
- Shows repository and hook information

### 🚀 Push Event  
- Code pushes to repository
- Shows branch, commits, and pusher info
- Lists recent commit messages

### 🔀 Pull Request Event
- PR opened, closed, updated, etc.
- Shows PR number, title, author, and branches

### 🐛 Issue Event
- Issues created, updated, closed, etc.  
- Shows issue number, title, author, and labels

### 💬 Issue Comment Event
- Comments on issues
- Shows commenter, issue, and comment preview

### ℹ️ Other Events
- Unknown events are logged with full payload

## Example Output

```
🔔 GitHub Webhook Received
──────────────────────────────────────────────────
📅 Timestamp: 2025-08-15T16:27:49.962Z
🏷️  Event Type: push
📦 Delivery ID: c88c60f8-79f4-11f0-8237-94b6ff0f9f51
🚀 Push Event
📁 Repository: ThunderCloudAI/hello_world
🌿 Branch: main
👤 Pusher: TrevTCA (trevor.basinger@thundercloudai.com)
📊 Commits: 1

📝 Recent Commits:
  1. Test webhook integration - TrevTCA
     SHA: 41333786

✅ Message processed and deleted from queue
```

## Configuration

You can modify these constants in the script:

```javascript
const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/036670977009/github-webhook-events';
const REGION = 'us-east-1';
const MAX_MESSAGES = 10;           // Max messages per polling request
const WAIT_TIME_SECONDS = 20;      // SQS long polling timeout
```

## Error Handling

The script includes robust error handling:

- **Message Processing Errors**: Failed messages remain in queue
- **SQS Connection Errors**: Automatic retry with 5-second delay
- **Graceful Shutdown**: Ctrl+C cleanly exits the process

## Integration Ideas

This script serves as a foundation for more advanced webhook processing:

- **Database Storage**: Store webhook events in a database
- **Notifications**: Send Slack/Discord notifications for events  
- **CI/CD Integration**: Trigger deployments on push events
- **Issue Management**: Auto-label issues or assign reviewers
- **Analytics**: Track repository activity and metrics
- **Multi-processing**: Scale with multiple worker processes

## Monitoring

Monitor the SQS queue in the AWS Console:
- Queue URL: `https://sqs.us-east-1.amazonaws.com/036670977009/github-webhook-events`
- CloudWatch metrics for queue depth and processing rates
- Dead letter queue for failed messages