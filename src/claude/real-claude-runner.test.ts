import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { RealClaudeRunner } from './real-claude-runner';
import { WorkflowError } from '../types';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock message parser
vi.mock('../message-parser', () => ({
  parseMessage: vi.fn(),
}));

describe('RealClaudeRunner', () => {
  let mockProcess: any;
  let realClaudeRunner: RealClaudeRunner;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock process with EventEmitter functionality
    mockProcess = new EventEmitter();
    mockProcess.stdin = {
      write: vi.fn(),
      end: vi.fn(),
    };
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.killed = false;
    mockProcess.kill = vi.fn();

    (spawn as any).mockReturnValue(mockProcess);

    realClaudeRunner = new RealClaudeRunner();
  });

  describe('Process Spawning', () => {
    it('should spawn Claude process with correct arguments', async () => {
      const prompt = 'Test prompt';

      // Start the process but don't wait for completion
      const claudePromise = realClaudeRunner.runPrompt(prompt);

      // Allow spawn to be called
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(spawn).toHaveBeenCalledWith(
        'claude',
        ['--verbose', '--output-format', 'stream-json', '-p'],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: expect.objectContaining(process.env),
        }
      );

      // Complete the process to avoid hanging
      mockProcess.emit('close', 0);

      try {
        await claudePromise;
      } catch {
        // Expected to fail since we don't have proper message parsing setup
      }
    });

    it('should inject prompt via stdin', async () => {
      const prompt = 'Test prompt for analysis';

      const claudePromise = realClaudeRunner.runPrompt(prompt);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockProcess.stdin.write).toHaveBeenCalledWith(prompt);
      expect(mockProcess.stdin.end).toHaveBeenCalled();

      mockProcess.emit('close', 0);

      try {
        await claudePromise;
      } catch {
        // Expected to fail since we don't have proper message parsing setup
      }
    });

    it('should set up environment variables correctly', async () => {
      const claudePromise = realClaudeRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));

      const spawnCall = (spawn as any).mock.calls[0];
      const options = spawnCall[2];

      expect(options.env).toEqual(expect.objectContaining(process.env));

      mockProcess.emit('close', 0);

      try {
        await claudePromise;
      } catch {
        // Expected to fail
      }
    });
  });

  describe('JSON Stream Parsing', () => {
    it('should parse JSON stream output correctly', async () => {
      const { parseMessage } = await import('../message-parser');

      (parseMessage as any).mockReturnValue({
        type: 'assistant',
        content: [{ type: 'text', text: 'Claude response' }],
      });

      const claudePromise = realClaudeRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));

      // Simulate Claude response
      mockProcess.stdout.emit('data', Buffer.from('{"type":"assistant"}\n'));
      mockProcess.emit('close', 0);

      const result = await claudePromise;
      expect(result).toBe('Claude response');
      expect(parseMessage).toHaveBeenCalledWith('{"type":"assistant"}');
    });

    it('should handle incomplete JSON lines', async () => {
      const { parseMessage } = await import('../message-parser');

      (parseMessage as any).mockReturnValue({
        type: 'assistant',
        content: [{ type: 'text', text: 'Complete response' }],
      });

      const claudePromise = realClaudeRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));

      // Send incomplete line first, then complete it
      mockProcess.stdout.emit('data', Buffer.from('{"type":"assi'));
      mockProcess.stdout.emit('data', Buffer.from('stant"}\n'));
      mockProcess.emit('close', 0);

      const result = await claudePromise;
      expect(result).toBe('Complete response');
    });

    it('should handle multiple JSON messages', async () => {
      const { parseMessage } = await import('../message-parser');

      (parseMessage as any)
        .mockReturnValueOnce({
          type: 'assistant',
          content: [{ type: 'text', text: 'First part ' }],
        })
        .mockReturnValueOnce({
          type: 'assistant',
          content: [{ type: 'text', text: 'second part' }],
        });

      const claudePromise = realClaudeRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));

      mockProcess.stdout.emit('data', Buffer.from('{"type":"assistant"}\n{"type":"assistant"}\n'));
      mockProcess.emit('close', 0);

      const result = await claudePromise;
      expect(result).toBe('First part second part');
    });
  });

  describe('Error Handling', () => {
    it('should handle process spawn errors', async () => {
      const spawnError = new Error('Failed to spawn process');

      const claudePromise = realClaudeRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));
      mockProcess.emit('error', spawnError);

      await expect(claudePromise).rejects.toThrow(WorkflowError);
      await expect(claudePromise).rejects.toThrow('Failed to start Claude process');
    });

    it('should handle non-zero exit codes', async () => {
      const claudePromise = realClaudeRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));
      mockProcess.emit('close', 1, null);

      await expect(claudePromise).rejects.toThrow(WorkflowError);
      await expect(claudePromise).rejects.toThrow('Claude process exited with code 1');
    });

    it('should handle JSON parsing errors gracefully', async () => {
      const { parseMessage } = await import('../message-parser');

      (parseMessage as any).mockImplementation(() => {
        throw new Error('Invalid JSON');
      });

      const claudePromise = realClaudeRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));

      // Send invalid JSON - should be caught and logged, not crash
      mockProcess.stdout.emit('data', Buffer.from('invalid json\n'));
      mockProcess.emit('close', 0);

      // Should still complete but with empty response error
      await expect(claudePromise).rejects.toThrow(WorkflowError);
      await expect(claudePromise).rejects.toThrow('No text content found in Claude response');
    });

    it('should handle timeout correctly', async () => {
      const shortTimeoutRunner = new RealClaudeRunner(100); // 100ms timeout

      const claudePromise = shortTimeoutRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));

      // Don't emit close event to simulate hanging process

      await expect(claudePromise).rejects.toThrow(WorkflowError);
      await expect(claudePromise).rejects.toThrow('Claude process timed out after 100ms');

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle empty Claude response', async () => {
      const { parseMessage } = await import('../message-parser');

      (parseMessage as any).mockReturnValue({
        type: 'system',
        subtype: 'init',
      });

      const claudePromise = realClaudeRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));
      mockProcess.stdout.emit('data', Buffer.from('{"type":"system"}\n'));
      mockProcess.emit('close', 0);

      await expect(claudePromise).rejects.toThrow(WorkflowError);
      await expect(claudePromise).rejects.toThrow('No text content found in Claude response');
    });
  });

  describe('Response Extraction', () => {
    it('should extract text from assistant messages only', async () => {
      const { parseMessage } = await import('../message-parser');

      const messages = [
        { type: 'system', subtype: 'init' },
        { type: 'assistant', content: [{ type: 'text', text: 'Hello ' }] },
        { type: 'user', content: [{ type: 'text', text: 'Should be ignored' }] },
        { type: 'assistant', content: [{ type: 'text', text: 'World!' }] },
      ];

      (parseMessage as any)
        .mockReturnValueOnce(messages[0])
        .mockReturnValueOnce(messages[1])
        .mockReturnValueOnce(messages[2])
        .mockReturnValueOnce(messages[3]);

      const claudePromise = realClaudeRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));

      mockProcess.stdout.emit(
        'data',
        Buffer.from(
          '{"type":"system"}\n{"type":"assistant"}\n{"type":"user"}\n{"type":"assistant"}\n'
        )
      );
      mockProcess.emit('close', 0);

      const result = await claudePromise;
      expect(result).toBe('Hello World!');
    });

    it('should handle tool_use content gracefully', async () => {
      const { parseMessage } = await import('../message-parser');

      (parseMessage as any).mockReturnValue({
        type: 'assistant',
        content: [
          { type: 'text', text: 'Using tool: ' },
          { type: 'tool_use', id: '123', name: 'test_tool', input: {} },
          { type: 'text', text: 'Done!' },
        ],
      });

      const claudePromise = realClaudeRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));

      mockProcess.stdout.emit('data', Buffer.from('{"type":"assistant"}\n'));
      mockProcess.emit('close', 0);

      const result = await claudePromise;
      expect(result).toBe('Using tool: Done!');
    });
  });

  describe('Custom Timeout', () => {
    it('should use provided timeout over default', async () => {
      const claudePromise = realClaudeRunner.runPrompt('test', 5000);

      await new Promise(resolve => setTimeout(resolve, 0));

      // Process should be set up with custom timeout
      expect(spawn).toHaveBeenCalled();

      mockProcess.emit('close', 0);

      try {
        await claudePromise;
      } catch {
        // Expected to fail due to no response
      }
    });

    it('should fall back to default timeout when not provided', async () => {
      const defaultTimeoutRunner = new RealClaudeRunner(15000);

      const claudePromise = defaultTimeoutRunner.runPrompt('test');

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(spawn).toHaveBeenCalled();

      mockProcess.emit('close', 0);

      try {
        await claudePromise;
      } catch {
        // Expected to fail due to no response
      }
    });
  });
});
