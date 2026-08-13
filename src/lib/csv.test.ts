import { describe, it, expect } from "vitest";
import { escapeCsvField, buildContactLogHeaderLine, buildContactLogRow, CONTACT_LOG_HEADER } from "./csv";

describe("escapeCsvField", () => {
  it("leaves plain values untouched", () => {
    expect(escapeCsvField("jane")).toBe("jane");
  });

  it("quote-wraps and doubles internal quotes when a comma, quote, or newline is present", () => {
    expect(escapeCsvField("Smith, Jane")).toBe('"Smith, Jane"');
    expect(escapeCsvField('Say "hi"')).toBe('"Say ""hi"""');
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("buildContactLogHeaderLine", () => {
  it("joins the header columns with commas, in order", () => {
    expect(buildContactLogHeaderLine()).toBe(CONTACT_LOG_HEADER.join(","));
    expect(buildContactLogHeaderLine()).toBe(
      "suggested_filename,question_number,first_name,last_name,email,relationship,years_associated,role_info,submission_date,video_storage_key,submission_id",
    );
  });
});

describe("buildContactLogRow", () => {
  const BASE_FIELDS = {
    suggestedFilename: "q3_jane_smith_08122026",
    questionNumber: 3,
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    relationship: ["alumni_parent"],
    yearsAssociated: "2005-2009",
    roleInfo: "Camper",
    submissionDate: new Date("2026-08-12T14:30:00.000Z"),
    videoStorageKey: "camp-coleman/sub-1/ans-1/abc123.webm",
    submissionId: "sub-1",
  };

  it("builds a row matching the header's column order and count", () => {
    const row = buildContactLogRow(BASE_FIELDS);
    const cells = row.split(",");
    expect(cells).toHaveLength(CONTACT_LOG_HEADER.length);
    expect(row).toBe(
      "q3_jane_smith_08122026,3,Jane,Smith,jane@example.com,alumni_parent,2005-2009,Camper,2026-08-12,camp-coleman/sub-1/ans-1/abc123.webm,sub-1",
    );
  });

  it("joins multiple relationship selections into one cell with a semicolon separator", () => {
    const row = buildContactLogRow({ ...BASE_FIELDS, relationship: ["alumni_parent", "staff"] });
    expect(row).toContain("alumni_parent; staff");
  });

  it("renders missing optional fields as empty cells rather than 'null'/'undefined'", () => {
    const row = buildContactLogRow({
      ...BASE_FIELDS,
      email: null,
      relationship: null,
      yearsAssociated: null,
      roleInfo: null,
    });
    expect(row).toBe("q3_jane_smith_08122026,3,Jane,Smith,,,,,2026-08-12,camp-coleman/sub-1/ans-1/abc123.webm,sub-1");
  });

  it("escapes a field containing a comma (e.g. a role description)", () => {
    const row = buildContactLogRow({ ...BASE_FIELDS, roleInfo: "Counselor, Unit A" });
    expect(row).toContain('"Counselor, Unit A"');
  });
});
