import { spawn, ChildProcess } from 'child_process';
import { IClaudeRunner } from './claude-runner.interface';
import { WorkflowError } from '../types';
import { parseMessage, ParsedMessage } from '../message-parser';

/**
 * Real Claude runner that spawns the actual Claude process.
 * Handles process management, JSON stream parsing, and error handling.
 */
export class RealClaudeRunner implements IClaudeRunner {
  private readonly defaultTimeout: number;

  constructor(defaultTimeout: number = 30000) {
    this.defaultTimeout = defaultTimeout;
  }

  async runPrompt(prompt: string, timeout?: number): Promise<string> {
    const effectiveTimeout = timeout ?? this.defaultTimeout;
    
    return new Promise((resolve, reject) => {
      let claudeProcess: ChildProcess;
      let outputBuffer = '';
      const messages: ParsedMessage[] = [];
      let timeoutId: NodeJS.Timeout | null = null;

      try {
        // Step 1: Spawn Claude process with specific arguments
        claudeProcess = spawn('claude', [
          '--verbose',
          '--output-format', 'stream-json',
          '-p'
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env
          }
        });

        // Step 6: Set up timeout handling
        timeoutId = setTimeout(() => {
          if (claudeProcess && !claudeProcess.killed) {
            claudeProcess.kill('SIGTERM');
            reject(new WorkflowError(
              `Claude process timed out after ${effectiveTimeout}ms`,
              'CLAUDE_TIMEOUT',
              true
            ));
          }
        }, effectiveTimeout);

        // Step 4: Error handling for process failures
        claudeProcess.on('error', (error: Error) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(new WorkflowError(
            `Failed to start Claude process: ${error.message}`,
            'CLAUDE_PROCESS_ERROR',
            true,
            error
          ));
        });

        // Capture stderr for debugging
        claudeProcess.stderr?.on('data', (data: Buffer) => {
          console.error('Claude stderr:', data.toString());
        });

        // Step 3: Implement stdout JSON stream parsing
        claudeProcess.stdout?.on('data', (data: Buffer) => {
          outputBuffer += data.toString();
          
          // Split by newlines to handle JSON stream
          const lines = outputBuffer.split('\n');
          outputBuffer = lines.pop() || ''; // Keep incomplete line
          
          for (const line of lines) {
            if (line.trim()) {
              try {
                const message = parseMessage(line);
                messages.push(message);
              } catch (error) {
                console.warn('Failed to parse Claude output line:', line, error);
              }
            }
          }
        });

        // Handle process completion
        claudeProcess.on('close', (code: number | null, signal: string | null) => {
          if (timeoutId) clearTimeout(timeoutId);
          
          // Process any remaining buffer content
          if (outputBuffer.trim()) {
            try {
              const message = parseMessage(outputBuffer.trim());
              messages.push(message);
            } catch (error) {
              console.warn('Failed to parse final Claude output:', outputBuffer, error);
            }
          }

          if (code !== 0 && code !== null) {
            reject(new WorkflowError(
              `Claude process exited with code ${code}`,
              'CLAUDE_EXIT_ERROR',
              true,
              { code, signal }
            ));
            return;
          }

          // Step 5: Extract and return response
          try {
            const response = this.extractResponse(messages);
            resolve(response);
          } catch (error) {
            reject(new WorkflowError(
              `Failed to extract response from Claude output: ${error instanceof Error ? error.message : 'Unknown error'}`,
              'CLAUDE_RESPONSE_EXTRACTION_ERROR',
              true,
              error
            ));
          }
        });

        // Step 2: Inject prompt via stdin
        if (claudeProcess.stdin) {
          claudeProcess.stdin.write(prompt);
          claudeProcess.stdin.end();
        } else {
          throw new Error('Failed to access Claude process stdin');
        }

      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        reject(new WorkflowError(
          `Failed to setup Claude process: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'CLAUDE_SETUP_ERROR',
          true,
          error
        ));
      }
    });
  }

  // Step 5: Response aggregation and processing logic
  private extractResponse(messages: ParsedMessage[]): string {
    let response = '';
    
    for (const message of messages) {
      if (message.type === 'assistant' && message.content) {
        for (const content of message.content) {
          if (content.type === 'text') {
            response += content.text;
          }
        }
      }
    }
    
    const trimmedResponse = response.trim();
    if (!trimmedResponse) {
      throw new Error('No text content found in Claude response');
    }
    
    return trimmedResponse;
  }
}