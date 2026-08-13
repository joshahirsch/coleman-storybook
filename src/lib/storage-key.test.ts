import { describe, it, expect } from "vitest";
import { extensionFromStorageKey } from "./storage-key";

describe("extensionFromStorageKey", () => {
  it("extracts the extension from a storage key", () => {
    expect(extensionFromStorageKey("camp-coleman/sub-1/ans-1/abc123.webm")).toBe("webm");
  });

  it("is case-insensitive on the extension itself", () => {
    expect(extensionFromStorageKey("camp-coleman/sub-1/ans-1/abc123.MP4")).toBe("MP4");
  });

  it("falls back to 'bin' for a key with no extension", () => {
    expect(extensionFromStorageKey("camp-coleman/sub-1/ans-1/abc123")).toBe("bin");
  });
});
