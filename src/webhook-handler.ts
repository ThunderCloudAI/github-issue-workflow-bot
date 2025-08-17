import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { GitHubWebhook, WorkflowError } from './types';
import { ISQSClient } from './aws/sqs-client.interface';
import { SQSClientFactory } from './aws/sqs-client.factory';

export interface WebhookConfig {
  port: number;
  secret: string;
  queueUrl: string;
  awsRegion: string;
}

export class WebhookHandler {
  private app: express.Application;
  private config: WebhookConfig;
  private sqsClient: ISQSClient;

  constructor(config: WebhookConfig, sqsClient?: ISQSClient) {
    this.config = config;
    this.app = express();
    this.sqsClient = sqsClient || new SQSClientFactory().createClient(config.awsRegion);
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Parse raw body for signature verification
    this.app.use('/webhook', express.raw({ type: 'application/json' }));
    // Parse JSON for other routes
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'github-webhook-handler',
      });
    });

    // GitHub webhook endpoint
    this.app.post('/webhook', this.handleWebhook.bind(this));

    // Error handling middleware
    this.app.use((error: Error, req: Request, res: Response, next: express.NextFunction) => {
      console.error('Webhook handler error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    });
  }

  private async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Verify GitHub signature
      const signature = req.headers['x-hub-signature-256'] as string;
      const payload = req.body;

      if (!this.verifySignature(signature, payload)) {
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }

      // Parse the webhook payload
      const webhookData: GitHubWebhook = JSON.parse(payload.toString());

      // Filter for issue events we care about
      if (!this.shouldProcessWebhook(webhookData)) {
        res.status(200).json({ message: 'Event ignored' });
        return;
      }

      // Send to SQS for processing
      await this.enqueueWebhook(webhookData);

      console.log(
        `Webhook queued for issue ${webhookData.issue.number}: ${webhookData.issue.title}`
      );

      res.status(200).json({
        message: 'Webhook received and queued for processing',
        issueNumber: webhookData.issue.number,
      });
    } catch (error) {
      console.error('Failed to handle webhook:', error);

      if (error instanceof WorkflowError) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to process webhook' });
      }
    }
  }

  private verifySignature(signature: string, payload: Buffer): boolean {
    if (!signature) {
      return false;
    }

    try {
      const expectedSignature = `sha256=${crypto
        .createHmac('sha256', this.config.secret)
        .update(payload)
        .digest('hex')}`;

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  private shouldProcessWebhook(webhook: GitHubWebhook): boolean {
    // Only process opened issues
    if (webhook.action !== 'opened') {
      return false;
    }

    // Only process issues (not pull requests)
    if (!webhook.issue || webhook.issue.state !== 'open') {
      return false;
    }

    // Skip if issue has labels we want to ignore
    const ignoredLabels = ['wontfix', 'duplicate', 'invalid', 'question'];
    const issueLabels = webhook.issue.labels.map(label => label.name.toLowerCase());

    if (ignoredLabels.some(label => issueLabels.includes(label))) {
      return false;
    }

    // Skip if issue is already assigned to the workflow system
    const workflowLabels = issueLabels.filter(label => label.startsWith('workflow:'));
    if (workflowLabels.length > 0) {
      return false;
    }

    return true;
  }

  private async enqueueWebhook(webhook: GitHubWebhook): Promise<void> {
    try {
      const messageBody = JSON.stringify(webhook);

      const command = new SendMessageCommand({
        QueueUrl: this.config.queueUrl,
        MessageBody: messageBody,
        MessageAttributes: {
          'event-type': {
            DataType: 'String',
            StringValue: 'github-issue-opened',
          },
          repository: {
            DataType: 'String',
            StringValue: webhook.repository.full_name,
          },
          'issue-number': {
            DataType: 'Number',
            StringValue: webhook.issue.number.toString(),
          },
        },
      });

      await this.sqsClient.send(command);
    } catch (error) {
      throw new WorkflowError(
        `Failed to enqueue webhook: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ENQUEUE_FAILED',
        true,
        error
      );
    }
  }

  start(): Promise<void> {
    return new Promise(resolve => {
      const server = this.app.listen(this.config.port, () => {
        console.log(`Webhook handler listening on port ${this.config.port}`);
        resolve();
      });

      // Graceful shutdown
      process.on('SIGTERM', () => {
        console.log('Received SIGTERM, shutting down webhook handler...');
        server.close(() => {
          console.log('Webhook handler stopped');
          process.exit(0);
        });
      });

      process.on('SIGINT', () => {
        console.log('Received SIGINT, shutting down webhook handler...');
        server.close(() => {
          console.log('Webhook handler stopped');
          process.exit(0);
        });
      });
    });
  }
}
