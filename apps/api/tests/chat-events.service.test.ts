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
});
