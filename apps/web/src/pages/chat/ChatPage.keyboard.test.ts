import { describe, expect, it, vi } from "vitest";
import { markerIncludesMessage, resolveChatClientMessageId, shouldSendChatMessageOnKey } from "./ChatPage.js";

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
