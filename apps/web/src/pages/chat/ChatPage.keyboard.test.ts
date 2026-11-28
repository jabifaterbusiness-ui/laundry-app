import { describe, expect, it, vi } from "vitest";
import { appendChatEmoji, markerIncludesMessage, preserveChatScrollPosition, preserveDroppedLatestChatMessages, resolveChatClientMessageId, shouldSendChatMessageOnKey } from "./ChatPage.js";

describe("chat composer emoji insertion", () => {
  it("appends the selected emoji without replacing the existing draft", () => {
    expect(appendChatEmoji("Order is ready ", "🎉")).toBe("Order is ready 🎉");
  });
});

describe("chat composer keyboard behaviour", () => {
  it("sends on Enter without Shift", () => {
    expect(shouldSendChatMessageOnKey("Enter", false, false)).toBe(true);
  });

  it("keeps Shift+Enter as a newline", () => {
    expect(shouldSendChatMessageOnKey("Enter", true, false)).toBe(false);
  });

  it("does not intercept Enter while an IME composition is active", () => {
    expect(shouldSendChatMessageOnKey("Enter", false, true)).toBe(false);
  });

  it("does not intercept other keys", () => {
    expect(shouldSendChatMessageOnKey("a", false, false)).toBe(false);
  });
});

describe("chat send retry idempotency", () => {
  it("reuses the same client id when the exact message is retried", () => {
    const original = { key: "conversation-a|same message", clientMessageId: "client-id-1" };
    const createId = vi.fn(() => "client-id-2");

    expect(resolveChatClientMessageId(original, original.key, createId)).toBe(original);
    expect(createId).not.toHaveBeenCalled();
  });

  it("creates a new client id when the message payload changes", () => {
    const original = { key: "conversation-a|first message", clientMessageId: "client-id-1" };
    const createId = vi.fn(() => "client-id-2");

    expect(resolveChatClientMessageId(original, "conversation-a|edited message", createId)).toEqual({
      key: "conversation-a|edited message",
      clientMessageId: "client-id-2",
    });
    expect(createId).toHaveBeenCalledOnce();
  });
});
describe("chat delivery and read receipt markers", () => {
  const message = { id: "message-b", createdAt: "2026-11-16T22:00:00.000Z" };

  it("does not show a message as delivered before a recipient fetches it", () => {
    expect(markerIncludesMessage(null, null, message)).toBe(false);
    expect(markerIncludesMessage("2026-11-16T21:59:59.000Z", "message-z", message)).toBe(false);
  });

  it("uses message ordering to distinguish messages created in the same millisecond", () => {
    expect(markerIncludesMessage("2026-11-16T22:00:00.000Z", "message-a", message)).toBe(false);
    expect(markerIncludesMessage("2026-11-16T22:00:00.000Z", "message-c", message)).toBe(true);
  });
});

describe("chat history scroll anchoring", () => {
  it("keeps the same visible message in place after older messages are prepended", () => {
    expect(preserveChatScrollPosition(120, 800, 1800)).toBe(1120);
  });

  it("preserves the current scroll offset when the content height is unchanged", () => {
    expect(preserveChatScrollPosition(120, 800, 800)).toBe(120);
  });
});

describe("chat latest-page rollover", () => {
  it("keeps messages that roll off the newest page when newer messages arrive", () => {
    const older = [{ id: "m1", createdAt: "2026-11-28T10:00:00.000Z" }];
    const previous = [
      { id: "m2", createdAt: "2026-11-28T10:01:00.000Z" },
      { id: "m3", createdAt: "2026-11-28T10:02:00.000Z" },
    ];
    const current = [
      { id: "m3", createdAt: "2026-11-28T10:02:00.000Z" },
      { id: "m4", createdAt: "2026-11-28T10:03:00.000Z" },
    ];
    expect(preserveDroppedLatestChatMessages(older, previous, current).map((message) => message.id))
      .toEqual(["m1", "m2"]);
  });

  it("does not re-add a message removed when an older row fills a deleted slot", () => {
    const previous = [
      { id: "m2", createdAt: "2026-11-28T10:02:00.000Z" },
      { id: "m3", createdAt: "2026-11-28T10:03:00.000Z" },
    ];
    const current = [
      { id: "m1", createdAt: "2026-11-28T10:01:00.000Z" },
      { id: "m3", createdAt: "2026-11-28T10:03:00.000Z" },
    ];
    expect(preserveDroppedLatestChatMessages([], previous, current)).toEqual([]);
  });
});
