import { describe, expect, it, vi } from "vitest";
import { publishChatEvent, subscribeChatEvents, type ChatRealtimeEvent } from "../src/modules/chat/chat-events.service.js";

describe("chat realtime event delivery", () => {
  it("delivers persisted conversation events only to the selected participant channels", () => {
    const firstListener = vi.fn();
    const otherBusinessListener = vi.fn();
    const unsubscribe = subscribeChatEvents("user-a", firstListener);
    subscribeChatEvents("user-b", otherBusinessListener);
    const event: ChatRealtimeEvent = {
      id: "message-a",
      type: "message.created",
      conversationId: "conversation-a",
      messageId: "message-a",
      createdAt: "2026-11-16T20:00:00.000Z",
    };

    publishChatEvent(["user-a", "user-a"], event);

    expect(firstListener).toHaveBeenCalledOnce();
    expect(firstListener).toHaveBeenCalledWith(event);
    expect(otherBusinessListener).not.toHaveBeenCalled();

    unsubscribe();
    publishChatEvent(["user-a"], event);
    expect(firstListener).toHaveBeenCalledOnce();
  });
  it("isolates a disconnected subscriber that throws during delivery", () => {
    const disconnectedListener = vi.fn(() => { throw new Error("socket closed"); });
    const healthyListener = vi.fn();
    subscribeChatEvents("user-c", disconnectedListener);
    subscribeChatEvents("user-c", healthyListener);

    publishChatEvent(["user-c"], {
      id: "message-b",
      type: "message.created",
      conversationId: "conversation-b",
      messageId: "message-b",
      createdAt: "2026-11-16T20:01:00.000Z",
    });

    expect(disconnectedListener).toHaveBeenCalledOnce();
    expect(healthyListener).toHaveBeenCalledOnce();
  });

});
