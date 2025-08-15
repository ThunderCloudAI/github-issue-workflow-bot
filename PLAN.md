# GitHub Webhook Prototype Plan

## Overview
A simple prototype for receiving GitHub webhook events using AWS API Gateway, Lambda, and SQS with CDK.

## Architecture
```
GitHub → API Gateway → Lambda → SQS
```

### Components
1. **API Gateway**: REST endpoint for webhooks
2. **Webhook Lambda**: Validates GitHub signatures and queues events  
3. **SQS Queue**: Holds webhook events

## Project Structure
```
github-webhook-prototype/
├── bin/
│   └── app.ts              # CDK entry point
├── lib/
│   └── webhook-stack.ts    # Single stack with all resources
├── lambda/
│   └── webhook/
│       └── index.ts        # Webhook receiver
├── package.json
└── cdk.json
```

## Implementation Steps

### 1. CDK Setup
- Initialize TypeScript CDK project
- Install dependencies: `@aws-cdk/aws-apigateway`, `@aws-cdk/aws-lambda`, `@aws-cdk/aws-sqs`

### 2. Webhook Stack
Create single stack with:
- API Gateway REST API with `/webhook` POST endpoint
- Lambda function for webhook validation
- SQS queue for event storage
- Basic IAM permissions

### 3. Webhook Lambda Function
```typescript
// Basic HMAC-SHA256 validation
// Parse GitHub event type
// Send to SQS queue
// Return success response
```

## Security (Minimal)
- Store GitHub webhook secret as environment variable
- Basic HMAC signature validation
- IAM roles with minimal permissions

## Configuration
```typescript
const GITHUB_SECRET = process.env.GITHUB_SECRET;
const QUEUE_URL = process.env.QUEUE_URL;
```

## GitHub Events to Handle
- `push` - Repository pushes
- `pull_request` - PR events
- `issues` - Issue events

## Deployment
```bash
npm install
cdk bootstrap
cdk deploy
```

## Testing
- Manual testing with GitHub webhook delivery
- CloudWatch logs for debugging

## Success Criteria
- [ ] Receive GitHub webhooks successfully
- [ ] Validate webhook signatures
- [ ] Queue events in SQS
- [ ] View messages in SQS console