#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WebhookStack } from '../lib/webhook-stack';

const app = new cdk.App();

// Create the webhook stack with comprehensive tagging
new WebhookStack(app, 'GitHubWebhookStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  description: 'GitHub webhook processing stack with API Gateway, Lambda, and SQS',
  tags: {
    Project: 'GitHub-Webhook-Prototype',
    Environment: process.env.NODE_ENV || 'development',
    Owner: 'Engineering',
    CostCenter: 'Development',
    Department: 'Engineering',
    ManagedBy: 'CDK',
    CreatedDate: new Date().toISOString().split('T')[0],
    Purpose: 'Webhook-Processing',
    Team: 'Platform',
    DataClassification: 'Internal',
    Backup: 'NotRequired',
    Compliance: 'None'
  }
});