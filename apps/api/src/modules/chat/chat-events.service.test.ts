import { afterEach, describe, expect, it, vi } from "vitest";
import { publishChatEvent, subscribeChatEvents, type ChatRealtimeEvent } from "./chat-events.service.js";

const cleanups: Array<() => void> = [];\n\nafterEach(() => {\n  cleanups.splice(0).forEach((cleanup) => cleanup());\n});\n\nconst event: ChatRealtimeEvent = {
  id: "event-1",
  type: "message.created",
  conversationId: "conversation-1",
  messageId: "message-1",
  createdAt: "2026-11-16T20:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chat realtime event channels", () => {
  it("delivers only to the matching business and user channel", () => {
    const businessA: ChatRealtimeEvent[] = [];
    const businessB: ChatRealtimeEvent[] = [];
    const userB: ChatRealtimeEvent[] = [];
    cleanups.push(subscribeChatEvents("business-a", "user-a", (item) => businessA.push(item)));
    cleanups.push(subscribeChatEvents("business-b", "user-a", (item) => businessB.push(item)));
    cleanups.push(subscribeChatEvents("business-a", "user-b", (item) => userB.push(item)));

    publishChatEvent("business-a", ["user-a", "user-b"], event);

    expect(businessA).toEqual([event]);
    expect(businessB).toEqual([]);
    expect(userB).toEqual([event]);
  });

  it("removes a listener when its subscription is closed", () => {
    const received: ChatRealtimeEvent[] = [];
    const unsubscribe = subscribeChatEvents("business-a", "user-a", (item) => received.push(item));
    unsubscribe();
    publishChatEvent("business-a", ["user-a"], event);
    expect(received).toEqual([]);
  });

  it("isolates throwing listeners so other subscribers still receive the event", () => {
    const received: ChatRealtimeEvent[] = [];
    cleanups.push(subscribeChatEvents("business-a", "user-a", () => { throw new Error("closed response"); }));
    cleanups.push(subscribeChatEvents("business-a", "user-a", (item) => received.push(item)));
    expect(() => publishChatEvent("business-a", ["user-a"], event)).not.toThrow();
    expect(received).toEqual([event]);
  });
});
