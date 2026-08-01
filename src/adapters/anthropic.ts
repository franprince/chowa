/**
 * Anthropic Provider Adapter
 *
 * Reference adapter implementation — encodes/decodes between Chowa's
 * canonical types and Anthropic's Messages API format.
 *
 * Anthropic quirks handled:
 * - Tool definitions use `input_schema` (not `parameters`)
 * - Multiple `tool_use` blocks can appear in a single assistant turn
 * - `tool_result` blocks go inside user messages with matching `tool_use_id`
 * - Arguments arrive already-parsed (no string→object conversion needed)
 */

import type {
  ProviderAdapter,
  CanonicalTool,
  CanonicalToolCall,
  CanonicalMessage,
  CanonicalContentBlock,
} from '../core/types.js';
import { AdapterError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Anthropic-native types (minimal subset we care about)
// ---------------------------------------------------------------------------

interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  stop_reason?: string;
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

export class AnthropicAdapter implements ProviderAdapter {
  readonly providerId = 'anthropic' as const;

  /**
   * Convert canonical tool definitions to Anthropic's `tools` format.
   * Anthropic uses `input_schema` instead of `parameters`.
   */
  encodeTools(tools: readonly CanonicalTool[]): AnthropicToolDef[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Record<string, unknown>,
    }));
  }

  /**
   * Convert canonical messages to Anthropic's message format.
   *
   * Key mapping:
   * - `user` → `{ role: 'user', content: string | blocks }`
   * - `assistant` → `{ role: 'assistant', content: blocks }` (with tool_use blocks if present)
   * - `tool_result` → merged into a `user` message with tool_result blocks
   */
  encodeMessages(messages: readonly CanonicalMessage[]): AnthropicMessage[] {
    const encoded: AnthropicMessage[] = [];

    for (const message of messages) {
      if (message.role === 'tool_result') {
        encoded.push(this.encodeToolResultMessage(message));
      } else if (message.role === 'assistant') {
        encoded.push(this.encodeAssistantMessage(message));
      } else {
        encoded.push(this.encodeUserMessage(message));
      }
    }

    return this.mergeAdjacentUserMessages(encoded);
  }

  /**
   * Extract all tool calls from an Anthropic response.
   * Handles multiple `tool_use` blocks in a single turn.
   */
  decodeToolCalls(response: unknown): CanonicalToolCall[] {
    const anthropicResponse = this.assertAnthropicResponse(response);
    const toolUseBlocks = anthropicResponse.content.filter(
      (block): block is AnthropicToolUseBlock => block.type === 'tool_use',
    );

    return toolUseBlocks.map((block) => ({
      id: block.id,
      name: block.name,
      arguments: block.input,
      raw: block,
    }));
  }

  /**
   * Extract text content from an Anthropic response.
   * Concatenates all text blocks (ignoring tool_use blocks).
   */
  decodeTextContent(response: unknown): string | undefined {
    const anthropicResponse = this.assertAnthropicResponse(response);
    const textBlocks = anthropicResponse.content.filter(
      (block): block is AnthropicTextBlock => block.type === 'text',
    );

    if (textBlocks.length === 0) {
      return undefined;
    }

    return textBlocks.map((block) => block.text).join('\n');
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private encodeUserMessage(message: CanonicalMessage): AnthropicMessage {
    if (typeof message.content === 'string') {
      return { role: 'user', content: message.content };
    }

    return {
      role: 'user',
      content: this.encodeContentBlocks(message.content),
    };
  }

  private encodeAssistantMessage(message: CanonicalMessage): AnthropicMessage {
    if (typeof message.content === 'string') {
      const blocks: AnthropicContentBlock[] = [{ type: 'text', text: message.content }];

      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const toolCall of message.toolCalls) {
          blocks.push({
            type: 'tool_use',
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.arguments,
          });
        }
      }

      return { role: 'assistant', content: blocks };
    }

    return {
      role: 'assistant',
      content: this.encodeContentBlocks(message.content),
    };
  }

  private encodeToolResultMessage(message: CanonicalMessage): AnthropicMessage {
    const blocks: AnthropicContentBlock[] = [];

    if (typeof message.content === 'string') {
      if (message.toolCallId) {
        blocks.push({
          type: 'tool_result',
          tool_use_id: message.toolCallId,
          content: message.content,
        });
      } else {
        blocks.push({ type: 'text', text: message.content });
      }
    } else {
      for (const block of message.content) {
        if (block.type === 'tool_result') {
          blocks.push({
            type: 'tool_result',
            tool_use_id: block.toolCallId,
            content: typeof block.result === 'string' ? block.result : JSON.stringify(block.result),
            is_error: block.isError,
          });
        }
      }
    }

    return { role: 'user', content: blocks };
  }

  private encodeContentBlocks(
    blocks: readonly CanonicalContentBlock[],
  ): AnthropicContentBlock[] {
    return blocks.map((block) => {
      switch (block.type) {
        case 'text':
          return { type: 'text' as const, text: block.text };

        case 'tool_use':
          return {
            type: 'tool_use' as const,
            id: block.toolCall.id,
            name: block.toolCall.name,
            input: block.toolCall.arguments,
          };

        case 'tool_result':
          return {
            type: 'tool_result' as const,
            tool_use_id: block.toolCallId,
            content: typeof block.result === 'string'
              ? block.result
              : JSON.stringify(block.result),
            is_error: block.isError,
          };
      }
    });
  }

  /**
   * Anthropic requires that consecutive user messages be merged into one.
   * This is common when a tool_result follows a user message.
   */
  private mergeAdjacentUserMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
    const merged: AnthropicMessage[] = [];

    for (const message of messages) {
      const last = merged[merged.length - 1];

      if (last && last.role === 'user' && message.role === 'user') {
        const lastBlocks = this.toBlockArray(last.content);
        const currentBlocks = this.toBlockArray(message.content);
        last.content = [...lastBlocks, ...currentBlocks];
      } else {
        merged.push({ ...message });
      }
    }

    return merged;
  }

  private toBlockArray(
    content: string | AnthropicContentBlock[],
  ): AnthropicContentBlock[] {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }
    return content;
  }

  private assertAnthropicResponse(response: unknown): AnthropicResponse {
    if (
      typeof response !== 'object' ||
      response === null ||
      !('content' in response) ||
      !Array.isArray((response as AnthropicResponse).content)
    ) {
      throw new AdapterError(
        this.providerId,
        'decode',
        'Response does not match expected Anthropic format (missing content array)',
        response,
      );
    }
    return response as AnthropicResponse;
  }
}
