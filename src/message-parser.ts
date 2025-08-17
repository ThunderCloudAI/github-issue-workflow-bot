export type MessageType = 'system' | 'assistant' | 'user' | 'result';

// Base interface for all messages
interface BaseMessage {
  type: MessageType;
  sessionId?: string;
}

// System message specific fields
export interface SystemMessage extends BaseMessage {
  type: 'system';
  subtype?: string;
  cwd?: string;
  tools?: string[];
  model?: string;
  isError?: boolean;
  durationMs?: number;
  numTurns?: number;
  result?: string;
  totalCostUsd?: number;
  usage?: Usage;
}

// Assistant/User message specific fields
export interface ConversationMessage extends BaseMessage {
  type: 'assistant' | 'user';
  messageId?: string;
  role?: string;
  model?: string;
  content?: ContentItem[];
  usage?: Usage;
}

// Result message specific fields
export interface ResultMessage extends BaseMessage {
  type: 'result';
  subtype?: string;
  isError?: boolean;
  durationMs?: number;
  durationApiMs?: number;
  numTurns?: number;
  result?: string;
  totalCostUsd?: number;
  usage?: Usage;
  permissionDenials?: any[];
}

export type ParsedMessage = SystemMessage | ConversationMessage | ResultMessage;

// Content types for assistant/user messages
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResultContent {
  type: 'tool_result';
  toolUseId: string;
  content: string;
}

export type ContentItem = TextContent | ToolUseContent | ToolResultContent;

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

// Raw JSON interfaces for parsing
interface RawMessage {
  type: string;
  session_id?: string;
  [key: string]: any;
}

// Helper functions for parsing different parts
function parseUsage(rawUsage: any): Usage | undefined {
  if (!rawUsage) return undefined;

  return {
    inputTokens: rawUsage.input_tokens,
    outputTokens: rawUsage.output_tokens,
    cacheCreationInputTokens: rawUsage.cache_creation_input_tokens,
    cacheReadInputTokens: rawUsage.cache_read_input_tokens,
  };
}

function parseContentItem(item: any): ContentItem {
  switch (item.type) {
    case 'text':
      return {
        type: 'text',
        text: item.text,
      };

    case 'tool_use':
      return {
        type: 'tool_use',
        id: item.id,
        name: item.name,
        input: item.input || {},
      };

    case 'tool_result':
      return {
        type: 'tool_result',
        toolUseId: item.tool_use_id,
        content: item.content,
      };

    default:
      throw new Error(`Unknown content type: ${item.type}`);
  }
}

function parseSystemMessage(data: RawMessage): SystemMessage {
  return {
    type: 'system',
    sessionId: data.session_id,
    subtype: data.subtype,
    cwd: data.cwd,
    tools: data.tools,
    model: data.model,
    isError: data.is_error,
    durationMs: data.duration_ms,
    numTurns: data.num_turns,
    result: data.result,
    totalCostUsd: data.total_cost_usd,
    usage: parseUsage(data.usage),
  };
}

function parseConversationMessage(data: RawMessage): ConversationMessage {
  const message = data.message || {};

  return {
    type: data.type as 'assistant' | 'user',
    sessionId: data.session_id,
    messageId: message.id,
    role: message.role,
    model: message.model,
    content: message.content ? message.content.map(parseContentItem) : undefined,
    usage: parseUsage(message.usage),
  };
}

function parseResultMessage(data: RawMessage): ResultMessage {
  return {
    type: 'result',
    sessionId: data.session_id,
    subtype: data.subtype,
    isError: data.is_error,
    durationMs: data.duration_ms,
    durationApiMs: data.duration_api_ms,
    numTurns: data.num_turns,
    result: data.result,
    totalCostUsd: data.total_cost_usd,
    usage: parseUsage(data.usage),
    permissionDenials: data.permission_denials,
  };
}

export function parseMessage(jsonString: string): ParsedMessage {
  try {
    const data: RawMessage = JSON.parse(jsonString);

    if (!data.type) {
      throw new Error('Message must have a type field');
    }

    switch (data.type) {
      case 'system':
        return parseSystemMessage(data);

      case 'assistant':
      case 'user':
        return parseConversationMessage(data);

      case 'result':
        return parseResultMessage(data);

      default:
        throw new Error(`Unknown message type: ${data.type}`);
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
    throw error;
  }
}
