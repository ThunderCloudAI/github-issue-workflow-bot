import { SQSClient } from '@aws-sdk/client-sqs';
import { ISQSClient } from './sqs-client.interface';

/**
 * Wrapper for AWS SDK SQSClient that implements our ISQSClient interface.
 * This provides a consistent interface and makes testing easier.
 */
export class SQSClientWrapper implements ISQSClient {
  private client: SQSClient;

  constructor(region: string) {
    this.client = new SQSClient({ region });
  }

  async send(command: any): Promise<any> {
    return this.client.send(command);
  }

  /**
   * Get the underlying AWS SDK client if needed for advanced operations.
   * Use sparingly to maintain abstraction.
   */
  getUnderlyingClient(): SQSClient {
    return this.client;
  }
}
