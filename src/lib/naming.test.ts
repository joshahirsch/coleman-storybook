import { describe, it, expect } from "vitest";
import { slugifyNamePart, formatDateMMDDYYYY, buildSuggestedFilename } from "./naming";

describe("slugifyNamePart", () => {
  it("lowercases and strips spaces/punctuation", () => {
    expect(slugifyNamePart("Jane")).toBe("jane");
    expect(slugifyNamePart("Mary Ann")).toBe("maryann");
    expect(slugifyNamePart("O'Brien")).toBe("obrien");
  });

  it("strips accents", () => {
    expect(slugifyNamePart("José")).toBe("jose");
  });

  it("falls back to empty string for a fully-punctuation input (caller handles the empty case)", () => {
    expect(slugifyNamePart("---")).toBe("");
  });
});

describe("formatDateMMDDYYYY", () => {
  it("formats a UTC date as MMDDYYYY", () => {
    expect(formatDateMMDDYYYY(new Date("2026-08-12T00:00:00.000Z"))).toBe("08122026");
  });

  it("pads single-digit month/day", () => {
    expect(formatDateMMDDYYYY(new Date("2026-01-05T12:00:00.000Z"))).toBe("01052026");
  });
});

describe("buildSuggestedFilename", () => {
  it("builds q#_firstname_lastname_MMDDYYYY", () => {
    const name = buildSuggestedFilename({
      questionNumber: 3,
      firstName: "Jane",
      lastName: "Smith",
      date: new Date("2026-08-12T00:00:00.000Z"),
    });
    expect(name).toBe("q3_jane_smith_08122026");
  });

  it("collapses multi-word names into single lowercase tokens", () => {
    const name = buildSuggestedFilename({
      questionNumber: 1,
      firstName: "Mary Ann",
      lastName: "O'Brien",
      date: new Date("2026-08-12T00:00:00.000Z"),
    });
    expect(name).toBe("q1_maryann_obrien_08122026");
  });

  it("falls back to 'unknown' if a name is empty/all-punctuation rather than producing a malformed filename", () => {
    const name = buildSuggestedFilename({
      questionNumber: 2,
      firstName: "",
      lastName: "Smith",
      date: new Date("2026-08-12T00:00:00.000Z"),
    });
    expect(name).toBe("q2_unknown_smith_08122026");
  });
});
