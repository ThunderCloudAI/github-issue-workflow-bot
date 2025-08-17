/**
 * Interface for Claude runners that can execute prompts and return responses.
 * This abstraction allows for dependency injection and easy testing.
 */
export interface IClaudeRunner {
  /**
   * Executes a prompt using Claude and returns the response.
   * @param prompt The prompt to send to Claude
   * @param timeout Optional timeout in milliseconds (defaults to implementation-specific value)
   * @returns Promise that resolves to Claude's text response
   * @throws WorkflowError if Claude execution fails
   */
  runPrompt(prompt: string, timeout?: number): Promise<string>;
}
