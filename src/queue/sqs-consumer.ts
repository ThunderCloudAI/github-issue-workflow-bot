import { ReceiveMessageCommand, DeleteMessageCommand, Message } from '@aws-sdk/client-sqs';
import { WorkflowProcessor } from '../workflow-processor';
import { GitHubWebhook, WorkflowConfig, WorkflowError } from '../types';
import { ISQSClient } from '../aws/sqs-client.interface';
import { SQSClientFactory } from '../aws/sqs-client.factory';

export interface SQSConfig {
  region: string;
  queueUrl: string;
  maxMessages: number;
  waitTimeSeconds: number;
  visibilityTimeoutSeconds: number;
}

export class SQSConsumer {
  private sqsClient: ISQSClient;
  private processor: WorkflowProcessor;
  private config: SQSConfig;
  private isRunning = false;

  constructor(processor: WorkflowProcessor, config: SQSConfig, sqsClient?: ISQSClient) {
    this.processor = processor;
    this.config = config;
    this.sqsClient = sqsClient || new SQSClientFactory().createClient(config.region);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Consumer is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting SQS consumer for queue: ${this.config.queueUrl}`);

    while (this.isRunning) {
      try {
        await this.pollMessages();
      } catch (error) {
        console.error('Error in message polling loop:', error);
        // Wait before retrying to avoid tight error loops
        await this.sleep(5000);
      }
    }
  }

  stop(): void {
    console.log('Stopping SQS consumer...');
    this.isRunning = false;
  }

  private async pollMessages(): Promise<void> {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.config.queueUrl,
        MaxNumberOfMessages: this.config.maxMessages,
        WaitTimeSeconds: this.config.waitTimeSeconds,
        VisibilityTimeout: this.config.visibilityTimeoutSeconds,
      });

      const response = await this.sqsClient.send(command);

      if (!response.Messages || response.Messages.length === 0) {
        return; // No messages to process
      }

      // Process messages in parallel
      const processingPromises = response.Messages.map((message: Message) =>
        this.processMessage(message)
      );

      await Promise.allSettled(processingPromises);
    } catch (error) {
      console.error('Failed to poll messages from SQS:', error);
      throw error;
    }
  }

  private async processMessage(message: Message): Promise<void> {
    if (!message.Body || !message.ReceiptHandle) {
      console.warn('Received message without body or receipt handle, skipping');
      return;
    }

    try {
      console.log(`Processing message: ${message.MessageId}`);

      // Parse the webhook payload
      const webhookPayload = this.parseWebhookPayload(message.Body);

      // Process the issue workflow
      await this.processor.processIssue(webhookPayload);

      // Delete the message from the queue after successful processing
      await this.deleteMessage(message.ReceiptHandle);

      console.log(`Successfully processed message: ${message.MessageId}`);
    } catch (error) {
      console.error(`Failed to process message ${message.MessageId}:`, error);

      // For non-retryable errors, we might want to move to DLQ
      // For now, we'll let SQS handle retries via message visibility timeout
      if (error instanceof WorkflowError && !error.retryable) {
        console.error(`Non-retryable error, message will be moved to DLQ: ${error.message}`);
        // In a real implementation, you might want to manually delete the message
        // or send it to a dead letter queue with additional metadata
      }
    }
  }

  private parseWebhookPayload(messageBody: string): GitHubWebhook {
    try {
      // Handle different message formats (direct webhook vs SQS wrapped)
      let payload = JSON.parse(messageBody);

      // If the message is wrapped in SQS format, extract the actual payload
      if (payload.Records && Array.isArray(payload.Records)) {
        // SNS -> SQS format
        if (payload.Records[0].Sns && payload.Records[0].Sns.Message) {
          payload = JSON.parse(payload.Records[0].Sns.Message);
        }
        // Direct SQS format
        else if (payload.Records[0].body) {
          payload = JSON.parse(payload.Records[0].body);
        }
      }

      // Validate required webhook fields
      if (!payload.action || !payload.issue || !payload.repository) {
        throw new WorkflowError(
          'Invalid webhook payload: missing required fields',
          'INVALID_WEBHOOK_PAYLOAD',
          false
        );
      }

      return payload as GitHubWebhook;
    } catch (error) {
      if (error instanceof WorkflowError) {
        throw error;
      }
      throw new WorkflowError(
        `Failed to parse webhook payload: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'WEBHOOK_PARSE_ERROR',
        false,
        { messageBody }
      );
    }
  }

  private async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.config.queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await this.sqsClient.send(command);
    } catch (error) {
      console.error('Failed to delete message from SQS:', error);
      // Don't throw here as the message processing was successful
      // The message will become visible again for retry
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async healthCheck(): Promise<{ status: string; queueUrl: string; timestamp: string }> {
    try {
      // Test SQS connectivity by getting queue attributes
      const command = new ReceiveMessageCommand({
        QueueUrl: this.config.queueUrl,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 1,
      });

      await this.sqsClient.send(command);

      return {
        status: 'healthy',
        queueUrl: this.config.queueUrl,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        queueUrl: this.config.queueUrl,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
