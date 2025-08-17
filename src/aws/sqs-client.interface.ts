/**
 * Interface for SQS client operations.
 * Abstracts the AWS SDK SQS client for easier testing and dependency injection.
 */
export interface ISQSClient {
  /**
   * Sends a command to the SQS service.
   * @param command The command to send (e.g., SendMessageCommand, ReceiveMessageCommand)
   * @returns Promise that resolves with the command response
   */
  send(command: any): Promise<any>;
}
