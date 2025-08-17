import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { Construct } from 'constructs';

export class WebhookStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // SQS Queue for storing webhook events
    const webhookQueue = new sqs.Queue(this, 'WebhookQueue', {
      queueName: 'github-webhook-events',
      visibilityTimeout: cdk.Duration.seconds(300),
      retentionPeriod: cdk.Duration.days(14),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'WebhookDLQ', {
          queueName: 'github-webhook-events-dlq',
          retentionPeriod: cdk.Duration.days(14),
        }),
        maxReceiveCount: 3,
      },
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // Lambda function for webhook processing
    const webhookHandler = new lambda.Function(this, 'WebhookHandler', {
      functionName: 'github-webhook-handler',
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/webhook')),
      handler: 'simple-index.handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        QUEUE_URL: webhookQueue.queueUrl,
        // GitHub webhook secret will be provided via environment variable or CDK context
        GITHUB_SECRET: this.node.tryGetContext('githubSecret') || 'default-secret-change-me',
        NODE_ENV: 'production',
      },
      deadLetterQueue: new sqs.Queue(this, 'WebhookLambdaDLQ', {
        queueName: 'github-webhook-lambda-dlq',
        retentionPeriod: cdk.Duration.days(14),
      }),
      // reservedConcurrentExecutions: 10, // Removed due to account concurrency limits
    });

    // Grant Lambda permission to send messages to SQS
    webhookQueue.grantSendMessages(webhookHandler);

    // API Gateway REST API
    const api = new apigateway.RestApi(this, 'WebhookApi', {
      restApiName: 'github-webhook-api',
      description: 'API Gateway for GitHub webhook events',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST'],
        allowHeaders: [
          'Content-Type',
          'X-Hub-Signature-256',
          'X-GitHub-Event',
          'X-GitHub-Delivery',
        ],
      },
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false, // Disable for security (webhook payloads may contain sensitive data)
        metricsEnabled: true,
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
      cloudWatchRole: true,
    });

    // Lambda integration for API Gateway
    const webhookIntegration = new apigateway.LambdaIntegration(webhookHandler, {
      proxy: true,
      allowTestInvoke: false, // Disable test invocation for security
    });

    // Create /webhook resource and POST method
    const webhookResource = api.root.addResource('webhook');
    webhookResource.addMethod('POST', webhookIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      requestValidatorOptions: {
        requestValidatorName: 'webhook-request-validator',
        validateRequestBody: false,
        validateRequestParameters: false,
      },
    });

    // CloudWatch alarms for monitoring
    new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      alarmName: 'github-webhook-lambda-errors',
      alarmDescription: 'Alert when Lambda function has errors',
      metric: webhookHandler.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'QueueDepthAlarm', {
      alarmName: 'github-webhook-queue-depth',
      alarmDescription: 'Alert when SQS queue depth is high',
      metric: webhookQueue.metricApproximateNumberOfMessagesVisible({
        period: cdk.Duration.minutes(5),
        statistic: 'Average',
      }),
      threshold: 100,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Apply additional tags to all resources in this stack
    cdk.Tags.of(this).add('Service', 'WebhookProcessing');
    cdk.Tags.of(this).add('Component', 'GitHubIntegration');

    // Output important values
    new cdk.CfnOutput(this, 'WebhookEndpoint', {
      value: `${api.url}webhook`,
      description: 'GitHub webhook endpoint URL',
      exportName: 'GitHubWebhookEndpoint',
    });

    new cdk.CfnOutput(this, 'QueueUrl', {
      value: webhookQueue.queueUrl,
      description: 'SQS Queue URL for webhook events',
      exportName: 'GitHubWebhookQueueUrl',
    });

    new cdk.CfnOutput(this, 'QueueArn', {
      value: webhookQueue.queueArn,
      description: 'SQS Queue ARN for webhook events',
      exportName: 'GitHubWebhookQueueArn',
    });

    new cdk.CfnOutput(this, 'LambdaFunctionName', {
      value: webhookHandler.functionName,
      description: 'Lambda function name for webhook processing',
      exportName: 'GitHubWebhookLambdaName',
    });
  }
}
