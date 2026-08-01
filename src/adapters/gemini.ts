/**
 * Gemini Provider Adapter
 *
 * Encodes/decodes between Chowa's canonical types and Gemini's
 * REST / SDK API format.
 *
 * Gemini quirks handled:
 * - Tool definitions use `functionDeclarations` array with `{ name, description, parameters }`
 * - `functionCall.args` is already an object (no string parsing needed)
 * - **No native call ID** — synthesized deterministically using a hash of
 *   `name + turnIndex + position` so downstream code can treat it like other providers
 * - Response structure: `candidates[0].content.parts[]` where each part can be
 *   `{ text }` or `{ functionCall: { name, args } }`
 * - Tool results go as `{ functionResponse: { name, response } }` parts inside `user` messages
 */

import { createHash } from 'node:crypto';
import type {
  ProviderAdapter,
  CanonicalTool,
  CanonicalToolCall,
  CanonicalMessage,
  CanonicalContentBlock,
} from '../core/types.js';
import { AdapterError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Gemini-native types (minimal subset)
// ---------------------------------------------------------------------------

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

interface GeminiToolConfig {
  functionDeclarations: GeminiFunctionDeclaration[];
}

interface GeminiPart {
  text?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiMessage {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content?: {
    role?: string;
    parts?: GeminiPart[];
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates: GeminiCandidate[];
}

// ---------------------------------------------------------------------------
// Adapter implementation
// ---------------------------------------------------------------------------

export class GeminiAdapter implements ProviderAdapter {
  readonly providerId = 'gemini' as const;

  /**
   * Convert canonical tool definitions to Gemini's `functionDeclarations` format.
   */
  encodeTools(tools: readonly CanonicalTool[]): GeminiToolConfig {
    return {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
      })),
    };
  }

  /**
   * Convert canonical messages to Gemini's content format.
   *
   * Key mapping:
   * - `user` → `{ role: 'user', parts: [...] }`
   * - `assistant` → `{ role: 'model', parts: [...] }` (with functionCall parts)
   * - `tool_result` → `{ role: 'user', parts: [{ functionResponse: { name, response } }] }`
   */
  encodeMessages(messages: readonly CanonicalMessage[]): GeminiMessage[] {
    const encoded: GeminiMessage[] = [];
    const toolCallIdToName = new Map<string, string>();

    for (const message of messages) {
      if (message.role === 'tool_result') {
        encoded.push(this.encodeToolResultMessage(message, toolCallIdToName));
      } else if (message.role === 'assistant') {
        encoded.push(this.encodeAssistantMessage(message, toolCallIdToName));
      } else {
        encoded.push(this.encodeUserMessage(message, toolCallIdToName));
      }
    }

    return this.mergeAdjacentUserMessages(encoded);
  }

  /**
   * Extract tool calls from a Gemini API response.
   * Synthesizes deterministic call IDs since Gemini does not supply native IDs.
   */
  decodeToolCalls(response: unknown, turnIndex: number = 0): CanonicalToolCall[] {
    const geminiResponse = this.assertGeminiResponse(response);
    const parts = geminiResponse.candidates[0]!.content!.parts ?? [];

    const functionCallParts = parts.filter(
      (part): part is GeminiPart & { functionCall: { name: string; args: Record<string, unknown> } } =>
        Boolean(part.functionCall && typeof part.functionCall.name === 'string'),
    );

    return functionCallParts.map((part, position) => {
      const name = part.functionCall.name;
      const args = part.functionCall.args ?? {};

      const hashInput = `${name}:${turnIndex}:${position}`;
      const id = createHash('sha256').update(hashInput).digest('hex').slice(0, 24);

      return {
        id,
        name,
        arguments: args,
        raw: part,
      };
    });
  }

  /**
   * Extract text content from a Gemini response.
   * Concatenates all text parts.
   */
  decodeTextContent(response: unknown): string | undefined {
    const geminiResponse = this.assertGeminiResponse(response);
    const parts = geminiResponse.candidates[0]!.content!.parts ?? [];

    const textParts = parts.filter(
      (part): part is GeminiPart & { text: string } => typeof part.text === 'string',
    );

    if (textParts.length === 0) {
      return undefined;
    }

    return textParts.map((part) => part.text).join('\n');
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private encodeUserMessage(
    message: CanonicalMessage,
    toolCallIdToName: Map<string, string>,
  ): GeminiMessage {
    if (typeof message.content === 'string') {
      return {
        role: 'user',
        parts: [{ text: message.content }],
      };
    }

    return {
      role: 'user',
      parts: this.encodeContentBlocks(message.content, toolCallIdToName),
    };
  }

  private encodeAssistantMessage(
    message: CanonicalMessage,
    toolCallIdToName: Map<string, string>,
  ): GeminiMessage {
    const parts: GeminiPart[] = [];

    if (typeof message.content === 'string') {
      if (message.content.length > 0) {
        parts.push({ text: message.content });
      }

      if (message.toolCalls && message.toolCalls.length > 0) {
        for (const toolCall of message.toolCalls) {
          toolCallIdToName.set(toolCall.id, toolCall.name);
          parts.push({
            functionCall: {
              name: toolCall.name,
              args: toolCall.arguments,
            },
          });
        }
      }
    } else {
      parts.push(...this.encodeContentBlocks(message.content, toolCallIdToName));
    }

    return {
      role: 'model',
      parts,
    };
  }

  private encodeToolResultMessage(
    message: CanonicalMessage,
    toolCallIdToName: Map<string, string>,
  ): GeminiMessage {
    const parts: GeminiPart[] = [];

    if (typeof message.content === 'string') {
      if (message.toolCallId) {
        const name = toolCallIdToName.get(message.toolCallId) ?? 'unknown';
        parts.push({
          functionResponse: {
            name,
            response: { output: message.content },
          },
        });
      } else {
        parts.push({ text: message.content });
      }
    } else {
      for (const block of message.content) {
        if (block.type === 'tool_result') {
          const name = toolCallIdToName.get(block.toolCallId) ?? 'unknown';
          const response =
            typeof block.result === 'object' && block.result !== null && !Array.isArray(block.result)
              ? (block.result as Record<string, unknown>)
              : { output: block.result };

          parts.push({
            functionResponse: {
              name,
              response,
            },
          });
        }
      }
    }

    return {
      role: 'user',
      parts,
    };
  }

  private encodeContentBlocks(
    blocks: readonly CanonicalContentBlock[],
    toolCallIdToName: Map<string, string>,
  ): GeminiPart[] {
    return blocks.map((block) => {
      switch (block.type) {
        case 'text':
          return { text: block.text };

        case 'tool_use':
          toolCallIdToName.set(block.toolCall.id, block.toolCall.name);
          return {
            functionCall: {
              name: block.toolCall.name,
              args: block.toolCall.arguments,
            },
          };

        case 'tool_result': {
          const name = toolCallIdToName.get(block.toolCallId) ?? 'unknown';
          const response =
            typeof block.result === 'object' && block.result !== null && !Array.isArray(block.result)
              ? (block.result as Record<string, unknown>)
              : { output: block.result };

          return {
            functionResponse: {
              name,
              response,
            },
          };
        }
      }
    });
  }

  /**
   * Gemini requires adjacent user messages to be merged into a single user turn.
   */
  private mergeAdjacentUserMessages(messages: GeminiMessage[]): GeminiMessage[] {
    const merged: GeminiMessage[] = [];

    for (const message of messages) {
      const last = merged[merged.length - 1];

      if (last && last.role === 'user' && message.role === 'user') {
        last.parts = [...last.parts, ...message.parts];
      } else {
        merged.push({
          role: message.role,
          parts: [...message.parts],
        });
      }
    }

    return merged;
  }

  private assertGeminiResponse(response: unknown): GeminiResponse {
    if (
      typeof response !== 'object' ||
      response === null ||
      !('candidates' in response) ||
      !Array.isArray((response as GeminiResponse).candidates) ||
      (response as GeminiResponse).candidates.length === 0 ||
      !(response as GeminiResponse).candidates[0]?.content?.parts
    ) {
      throw new AdapterError(
        this.providerId,
        'decode',
        'Response does not match expected Gemini format (missing candidates[0].content.parts)',
        response,
      );
    }
    return response as GeminiResponse;
  }
}
