import { ISQSClient } from './sqs-client.interface';

/**
 * Mock implementation of ISQSClient for testing.
 * Provides configurable responses and tracks method calls.
 */
export class MockSQSClient implements ISQSClient {
  private responses: Map<string, any> = new Map();
  private errors: Map<string, Error> = new Map();
  private calls: Array<{ command: any; timestamp: Date }> = [];
  private defaultResponse: any = {};

  /**
   * Mock implementation of send method.
   * Returns configured responses or throws configured errors.
   */
  async send(command: any): Promise<any> {
    // Record the call for verification
    this.calls.push({
      command,
      timestamp: new Date(),
    });

    const commandName = command.constructor.name;

    // Check if we should throw an error for this command
    if (this.errors.has(commandName)) {
      throw this.errors.get(commandName);
    }

    // Return configured response or default
    return this.responses.get(commandName) || this.defaultResponse;
  }

  /**
   * Configure a response for a specific command type.
   * @param commandName Name of the command class (e.g., 'SendMessageCommand')
   * @param response Response to return when this command is sent
   */
  setResponse(commandName: string, response: any): void {
    this.responses.set(commandName, response);
  }

  /**
   * Configure an error to throw for a specific command type.
   * @param commandName Name of the command class
   * @param error Error to throw when this command is sent
   */
  setError(commandName: string, error: Error): void {
    this.errors.set(commandName, error);
  }

  /**
   * Set a default response for any unspecified commands.
   * @param response Default response object
   */
  setDefaultResponse(response: any): void {
    this.defaultResponse = response;
  }

  /**
   * Get all calls made to the send method.
   * @returns Array of call records
   */
  getCalls(): Array<{ command: any; timestamp: Date }> {
    return [...this.calls];
  }

  /**
   * Get calls for a specific command type.
   * @param commandName Name of the command class to filter by
   * @returns Array of matching call records
   */
  getCallsForCommand(commandName: string): Array<{ command: any; timestamp: Date }> {
    return this.calls.filter(call => call.command.constructor.name === commandName);
  }

  /**
   * Get the number of times send was called.
   * @returns Total call count
   */
  getCallCount(): number {
    return this.calls.length;
  }

  /**
   * Get the number of times a specific command was called.
   * @param commandName Name of the command class
   * @returns Call count for the command
   */
  getCallCountForCommand(commandName: string): number {
    return this.getCallsForCommand(commandName).length;
  }

  /**
   * Clear all recorded calls and configured responses/errors.
   */
  reset(): void {
    this.calls = [];
    this.responses.clear();
    this.errors.clear();
    this.defaultResponse = {};
  }

  /**
   * Verify that a command was called with specific input.
   * @param commandName Name of the command class
   * @param expectedInput Expected input object
   * @returns True if command was called with matching input
   */
  wasCalledWith(commandName: string, expectedInput: any): boolean {
    const calls = this.getCallsForCommand(commandName);
    return calls.some(call => {
      const actualInput = call.command.input;
      return this.deepEqual(actualInput, expectedInput);
    });
  }

  /**
   * Deep equality check for objects.
   * @param a First object
   * @param b Second object
   * @returns True if objects are deeply equal
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;

      for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!this.deepEqual(a[key], b[key])) return false;
      }
      return true;
    }

    return false;
  }
}
