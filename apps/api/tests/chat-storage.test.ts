import { describe, expect, it } from "vitest";
import { CHAT_MAX_UPLOAD_BYTES, sanitizeChatFilename } from "../src/modules/chat/chat-storage.service.js";

describe("chat attachment storage safeguards", () => {
  it("limits uploads to ten megabytes", () => {
    expect(CHAT_MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  it("removes path separators from uploaded file names", () => {
    const safe = sanitizeChatFilename(`../../private${String.fromCharCode(92)}invoice.pdf`);
    expect(safe).not.toContain("/");
    expect(safe).not.toContain(String.fromCharCode(92));
    expect(safe).toContain("invoice.pdf");
  });

  it("replaces control characters and supplies a safe fallback", () => {
    expect(sanitizeChatFilename("invoice\n2026.pdf")).not.toContain("\n");
    expect(sanitizeChatFilename("..")).toBe("attachment");
    expect(sanitizeChatFilename("")).toBe("attachment");
  });

  it("caps the stored display name length", () => {
    expect(sanitizeChatFilename("a".repeat(300))).toHaveLength(160);
  });
});
