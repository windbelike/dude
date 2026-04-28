export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface MessageParam {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface MessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  model: string;
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface CreateMessageRequest {
  model: string;
  messages: MessageParam[];
  max_tokens: number;
  system?: string;
  tools?: Tool[];
}
