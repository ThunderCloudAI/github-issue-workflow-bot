import { ISQSClient } from './sqs-client.interface';
import { SQSClientWrapper } from './sqs-client.wrapper';

/**
 * Factory for creating SQS client instances.
 * Provides a single source of truth for client creation and configuration.
 */
export class SQSClientFactory {
  /**
   * Creates a real SQS client for the specified region.
   * @param region AWS region for the SQS client
   * @returns ISQSClient instance
   */
  createClient(region: string): ISQSClient {
    return new SQSClientWrapper(region);
  }

  /**
   * Creates a mock SQS client for testing purposes.
   * @returns ISQSClient mock instance
   */
  createMockClient(): ISQSClient {
    return {
      send: () => Promise.resolve({})
    };
  }
}