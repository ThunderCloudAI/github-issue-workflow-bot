# GitHub Webhook Prototype

A simple prototype for receiving GitHub webhook events using AWS API Gateway, Lambda, and SQS with CDK.

## Architecture

```
GitHub → API Gateway → Lambda → SQS
```

### Components
- **API Gateway**: REST endpoint for webhooks at `/webhook`
- **Webhook Lambda**: Validates GitHub signatures and queues events  
- **SQS Queue**: Holds webhook events with DLQ for failed messages

## Prerequisites

- AWS CLI configured
- Node.js 18+ installed
- GitHub repository with webhook access

## Installation

1. Install dependencies:
```bash
npm install
```

2. Bootstrap CDK (first time only):
```bash
npm run bootstrap
```

## Configuration

Set your GitHub webhook secret:
```bash
# Option 1: Environment variable
export GITHUB_SECRET="your-webhook-secret"

# Option 2: CDK context
cdk deploy -c githubSecret="your-webhook-secret"
```

## Deployment

```bash
# Build and deploy
npm run build
npm run deploy
```

After deployment, the webhook endpoint URL will be displayed in the outputs.

## GitHub Webhook Configuration

1. Go to your GitHub repository settings
2. Navigate to Webhooks
3. Add webhook with the deployed API Gateway URL
4. Set content type to `application/json`
5. Add your webhook secret
6. Select individual events: `push`, `pull_request`, `issues`

## Monitoring

- CloudWatch Logs: `/aws/lambda/github-webhook-handler`
- SQS Queue: `github-webhook-events`
- CloudWatch Alarms: Lambda errors and queue depth

## Supported Events

- `push` - Repository pushes
- `pull_request` - Pull request events
- `issues` - Issue events
- `issue_comment` - Issue comments
- `pull_request_review` - PR reviews

## Security Features

- HMAC-SHA256 signature validation
- Timing-safe signature comparison
- Request validation and sanitization
- Encrypted SQS queues
- IAM least privilege permissions

## Cost Optimization

- Lambda reserved concurrency (10)
- SQS message retention (14 days)
- CloudWatch log retention (1 week)
- API Gateway throttling limits

## Clean Up

```bash
npm run destroy
```