import { describe, expect, it } from "vitest";
import { buildChatMessagesPath, consumeChatEventFrames, type ChatRealtimeEvent } from "./chat-api.js";

describe("chat realtime event frame parser", () => {
  it("preserves partial chunks and parses CRLF-delimited message events", () => {
    const event: ChatRealtimeEvent = {
      id: "message-a",
      type: "message.created",
      conversationId: "conversation-a",
      messageId: "message-a",
      createdAt: "2026-11-16T20:03:00.000Z",
    };
    const firstChunk = ": connected\r\n\r\nid: message-a\r\nevent: message.created\r\ndata: " + JSON.stringify(event) + "\r\n";
    const partial = consumeChatEventFrames(firstChunk);
    expect(partial.events).toEqual([]);
    expect(partial.remaining).toContain("data:");
    const completed = consumeChatEventFrames(partial.remaining + "\r\n: heartbeat\r\n\r\n");
    expect(completed.events).toEqual([event]);
    expect(completed.remaining).toBe("");
  });

  it("parses conversation delivery receipt events", () => {
    const event: ChatRealtimeEvent = {
      id: "conversation-a:delivered:user-b:message-a",
      type: "conversation.delivered",
      conversationId: "conversation-a",
      actorUserId: "user-b",
      createdAt: "2026-11-16T20:05:00.000Z",
    };
    expect(consumeChatEventFrames("data: " + JSON.stringify(event) + "\n\n").events).toEqual([event]);
  });

  it("ignores malformed frames and continues with later valid events", () => {
    const event: ChatRealtimeEvent = {
      id: "message-b",
      type: "message.created",
      conversationId: "conversation-b",
      messageId: "message-b",
      createdAt: "2026-11-16T20:04:00.000Z",
    };
    const input = "data: not-json\n\ndata: " + JSON.stringify(event) + "\n\n";
    expect(consumeChatEventFrames(input)).toEqual({ remaining: "", events: [event] });
  });
});

describe("chat history pagination URL", () => {
  it("adds the before cursor while preserving a bounded search term", () => {
    expect(buildChatMessagesPath("conversation/1", " old messages ", "message-50"))
      .toBe("/chat/conversations/conversation%2F1/messages?search=old+messages&before=message-50");
  });

  it("omits empty search and cursor parameters for the latest page", () => {
    expect(buildChatMessagesPath("conversation-1")).toBe("/chat/conversations/conversation-1/messages");
  });
});
