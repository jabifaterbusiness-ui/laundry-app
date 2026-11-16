import { describe, expect, it, vi } from "vitest";
import { publishChatEvent, subscribeChatEvents, type ChatRealtimeEvent } from "../src/modules/chat/chat-events.service.js";

describe("chat realtime event delivery", () => {
  it("delivers persisted conversation events only to the selected participant channels", () => {
    const firstListener = vi.fn();
    const otherBusinessListener = vi.fn();
    const unsubscribe = subscribeChatEvents("business-a", "user-a", firstListener);
    subscribeChatEvents("business-a", "user-b", otherBusinessListener);
    const event: ChatRealtimeEvent = {
      id: "message-a",
      type: "message.created",
      conversationId: "conversation-a",
      messageId: "message-a",
      createdAt: "2026-11-16T20:00:00.000Z",
    };

    publishChatEvent("business-a", ["user-a", "user-a"], event);

    expect(firstListener).toHaveBeenCalledOnce();
    expect(firstListener).toHaveBeenCalledWith(event);
    expect(otherBusinessListener).not.toHaveBeenCalled();

    unsubscribe();
    publishChatEvent("business-a", ["user-a"], event);
    expect(firstListener).toHaveBeenCalledOnce();
  });
  it("does not cross business channels even when a user id is identical", () => {
    const businessA = vi.fn();
    const businessB = vi.fn();
    subscribeChatEvents("business-a", "shared-user", businessA);
    subscribeChatEvents("business-b", "shared-user", businessB);
    const event: ChatRealtimeEvent = { id: "message-c", type: "message.created", conversationId: "conversation-c", messageId: "message-c", createdAt: "2026-11-16T20:02:00.000Z" };

    publishChatEvent("business-a", ["shared-user"], event);

    expect(businessA).toHaveBeenCalledWith(event);
    expect(businessB).not.toHaveBeenCalled();
  });

  it("isolates a disconnected subscriber that throws during delivery", () => {
    const disconnectedListener = vi.fn(() => { throw new Error("socket closed"); });
    const healthyListener = vi.fn();
    subscribeChatEvents("business-c", "user-c", disconnectedListener);
    subscribeChatEvents("business-c", "user-c", healthyListener);

    publishChatEvent("business-c", ["user-c"], {
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
