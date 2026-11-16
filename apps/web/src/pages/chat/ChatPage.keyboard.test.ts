import { describe, expect, it } from "vitest";
import { shouldSendChatMessageOnKey } from "./ChatPage.js";

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
