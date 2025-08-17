import { IClaudeRunner } from './claude-runner.interface';
import { WorkflowError } from '../types';

/**
 * Mock Claude runner for testing purposes.
 * Allows for configurable responses, errors, and delays.
 */
export class MockClaudeRunner implements IClaudeRunner {
  private responses: string[] = [];
  private currentResponseIndex = 0;
  private shouldThrowError = false;
  private errorToThrow: Error | null = null;
  private simulatedDelay = 0;
  private shouldTimeout = false;
  private timeoutDuration = 0;

  /**
   * Sets the responses that this mock will return.
   * Each call to runPrompt will return the next response in the array.
   * If there are more calls than responses, the last response is repeated.
   */
  setResponses(responses: string[]): void {
    this.responses = [...responses];
    this.currentResponseIndex = 0;
  }

  /**
   * Sets a single response that will be returned for all calls.
   */
  setResponse(response: string): void {
    this.setResponses([response]);
  }

  /**
   * Configures the mock to throw an error on the next call.
   */
  setError(error: Error): void {
    this.shouldThrowError = true;
    this.errorToThrow = error;
  }

  /**
   * Configures the mock to simulate a timeout.
   */
  setTimeout(duration: number): void {
    this.shouldTimeout = true;
    this.timeoutDuration = duration;
  }

  /**
   * Sets a delay to simulate slow Claude responses.
   */
  setDelay(delayMs: number): void {
    this.simulatedDelay = delayMs;
  }

  /**
   * Resets the mock to its initial state.
   */
  reset(): void {
    this.responses = [];
    this.currentResponseIndex = 0;
    this.shouldThrowError = false;
    this.errorToThrow = null;
    this.simulatedDelay = 0;
    this.shouldTimeout = false;
    this.timeoutDuration = 0;
  }

  async runPrompt(prompt: string, timeout?: number): Promise<string> {
    // Apply simulated delay if configured
    if (this.simulatedDelay > 0) {
      await this.delay(this.simulatedDelay);
    }

    // Simulate timeout if configured
    if (this.shouldTimeout) {
      const timeoutMs = timeout ?? this.timeoutDuration;
      await this.delay(timeoutMs + 100); // Exceed timeout
      throw new WorkflowError(
        `Claude process timed out after ${timeoutMs}ms`,
        'CLAUDE_TIMEOUT',
        true
      );
    }

    // Throw error if configured
    if (this.shouldThrowError && this.errorToThrow) {
      const error = this.errorToThrow;
      this.shouldThrowError = false; // Reset after throwing once
      this.errorToThrow = null;
      throw error;
    }

    // Return configured response
    if (this.responses.length === 0) {
      throw new Error('MockClaudeRunner: No responses configured. Use setResponse() or setResponses() first.');
    }

    const responseIndex = Math.min(this.currentResponseIndex, this.responses.length - 1);
    const response = this.responses[responseIndex];
    
    // Advance to next response if available
    if (this.currentResponseIndex < this.responses.length - 1) {
      this.currentResponseIndex++;
    }

    return response;
  }

  /**
   * Gets the number of times runPrompt has been called.
   */
  getCallCount(): number {
    return this.currentResponseIndex + (this.responses.length > 0 ? 1 : 0);
  }

  /**
   * Gets all prompts that were passed to runPrompt calls.
   * Note: This simple implementation doesn't track prompts by default.
   * For more advanced testing, consider using a spy framework like Vitest's vi.fn().
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create a MockClaudeRunner with a predefined response.
 * Useful for simple test cases.
 */
export function createMockClaudeRunner(response: string): MockClaudeRunner {
  const mock = new MockClaudeRunner();
  mock.setResponse(response);
  return mock;
}

/**
 * Factory function to create a MockClaudeRunner that throws an error.
 * Useful for testing error scenarios.
 */
export function createErrorMockClaudeRunner(error: Error): MockClaudeRunner {
  const mock = new MockClaudeRunner();
  mock.setError(error);
  return mock;
}