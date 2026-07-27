import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  extractDomain,
  isRecipientAllowed,
  sanitizeHeader,
  sanitizeBody,
  redactEmail,
  redactSecret,
  isValidMailboxName,
  sanitizeSearchQuery,
} from "../src/security.js";

// ─────────────────────────────────────────────────────────────
// Email validation
// ─────────────────────────────────────────────────────────────

describe("isValidEmail", () => {
  it("accepts standard email addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("first.last@sub.domain.org")).toBe(true);
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("user+tag@gmail.com")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("user@")).toBe(false);
    expect(isValidEmail("user@example")).toBe(false);
    expect(isValidEmail("user name@example.com")).toBe(false);
    expect(isValidEmail("user@exa mple.com")).toBe(false);
  });

  it("rejects emails longer than 254 characters", () => {
    const long = "a".repeat(250) + "@b.co";
    expect(isValidEmail(long)).toBe(false);
  });
});

describe("extractDomain", () => {
  it("extracts the domain from valid emails", () => {
    expect(extractDomain("user@example.com")).toBe("example.com");
    expect(extractDomain("a@sub.domain.org")).toBe("sub.domain.org");
  });

  it("returns empty string for invalid emails", () => {
    expect(extractDomain("not-an-email")).toBe("");
    expect(extractDomain("")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────
// Recipient allowlist
// ─────────────────────────────────────────────────────────────

describe("isRecipientAllowed", () => {
  it("allows all valid emails when no allowlist is set", () => {
    const policy = { allowedDomains: [] };
    expect(isRecipientAllowed("anyone@anywhere.com", policy).ok).toBe(true);
    expect(isRecipientAllowed("user@gmail.com", policy).ok).toBe(true);
  });

  it("blocks invalid email addresses regardless of policy", () => {
    const policy = { allowedDomains: [] };
    expect(isRecipientAllowed("not-an-email", policy).ok).toBe(false);
    expect(isRecipientAllowed("", policy).ok).toBe(false);
  });

  it("allows recipients in the allowlisted domains", () => {
    const policy = { allowedDomains: ["example.com", "myorg.org"] };
    expect(isRecipientAllowed("user@example.com", policy).ok).toBe(true);
    expect(isRecipientAllowed("user@myorg.org", policy).ok).toBe(true);
  });

  it("blocks recipients NOT in the allowlisted domains", () => {
    const policy = { allowedDomains: ["example.com"] };
    const result = isRecipientAllowed("user@gmail.com", policy);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("gmail.com");
    expect(result.reason).toContain("not in the allowed list");
  });

  it("domain matching is case-insensitive", () => {
    const policy = { allowedDomains: ["Example.Com"] };
    expect(isRecipientAllowed("user@example.com", policy).ok).toBe(true);
    expect(isRecipientAllowed("user@EXAMPLE.COM", policy).ok).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// Header sanitization (CRLF injection prevention)
// ─────────────────────────────────────────────────────────────

describe("sanitizeHeader", () => {
  it("removes newlines and carriage returns", () => {
    expect(sanitizeHeader("Hello\nWorld")).toBe("Hello World");
    expect(sanitizeHeader("Hello\r\nWorld")).toBe("Hello  World");
    expect(sanitizeHeader("Hello\rWorld")).toBe("Hello World");
  });

  it("removes tabs", () => {
    expect(sanitizeHeader("Hello\tWorld")).toBe("Hello World");
  });

  it("removes null bytes", () => {
    expect(sanitizeHeader("Hello\0World")).toBe("HelloWorld");
  });

  it("trims whitespace", () => {
    expect(sanitizeHeader("  Hello  ")).toBe("Hello");
  });

  it("truncates very long headers to 998 characters (RFC 5322)", () => {
    const long = "A".repeat(2000);
    const result = sanitizeHeader(long);
    expect(result.length).toBe(998);
  });

  it("returns empty string for falsy input", () => {
    expect(sanitizeHeader("")).toBe("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sanitizeHeader(null as any)).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────
// Body sanitization
// ─────────────────────────────────────────────────────────────

describe("sanitizeBody", () => {
  it("preserves newlines in body", () => {
    const body = "Line 1\nLine 2\nLine 3";
    expect(sanitizeBody(body)).toBe(body);
  });

  it("removes null bytes", () => {
    expect(sanitizeBody("Hello\0World")).toBe("HelloWorld");
  });

  it("truncates to max length (default 1MB)", () => {
    const huge = "X".repeat(2_000_000);
    expect(sanitizeBody(huge).length).toBe(1_000_000);
  });

  it("allows custom max length", () => {
    expect(sanitizeBody("Hello World", 5)).toBe("Hello");
  });

  it("returns empty string for falsy input", () => {
    expect(sanitizeBody("")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────
// PII Redaction
// ─────────────────────────────────────────────────────────────

describe("redactEmail", () => {
  it("redacts the local part of standard emails", () => {
    const result = redactEmail("user@example.com");
    expect(result).toContain("@example.com");
    expect(result).not.toContain("user");
    expect(result).toContain("*");
  });

  it("keeps at least 2 asterisks for short local parts", () => {
    const result = redactEmail("ab@example.com");
    expect(result).toBe("a**@example.com");
  });

  it("fully redacts single-character local parts", () => {
    expect(redactEmail("a@b.com")).toBe("***@b.com");
  });

  it("handles missing @ sign", () => {
    expect(redactEmail("just-a-string")).toBe("[redacted]");
    expect(redactEmail("")).toBe("[redacted]");
  });
});

describe("redactSecret", () => {
  it("shows first 2 and last 2 chars for long secrets", () => {
    const result = redactSecret("abcdefghijklmnop");
    expect(result).toBe("ab****op");
  });

  it("fully masks secrets of 4 chars or fewer", () => {
    expect(redactSecret("ab")).toBe("****");
    expect(redactSecret("abcd")).toBe("****");
    expect(redactSecret("")).toBe("[empty]");
  });

  it("does not leak the full secret", () => {
    const secret = "my-super-secret-password-123";
    const result = redactSecret(secret);
    expect(result).not.toContain(secret);
    expect(result).not.toContain("super");
    expect(result).not.toContain("password");
  });
});

// ─────────────────────────────────────────────────────────────
// Mailbox name validation
// ─────────────────────────────────────────────────────────────

describe("isValidMailboxName", () => {
  it("accepts standard mailbox names", () => {
    expect(isValidMailboxName("INBOX")).toBe(true);
    expect(isValidMailboxName("Sent")).toBe(true);
    expect(isValidMailboxName("Junk Mail")).toBe(true);
    expect(isValidMailboxName("Archive/2024")).toBe(true);
  });

  it("rejects path traversal attempts", () => {
    expect(isValidMailboxName("../etc/passwd")).toBe(false);
    expect(isValidMailboxName("..")).toBe(false);
  });

  it("rejects special characters that could break IMAP", () => {
    expect(isValidMailboxName("INBOX; rm -rf /")).toBe(false);
    expect(isValidMailboxName("INBOX`whoami`")).toBe(false);
    expect(isValidMailboxName("INBOX$()")).toBe(false);
    expect(isValidMailboxName("INBOX|cat")).toBe(false);
  });

  it("rejects empty or excessively long names", () => {
    expect(isValidMailboxName("")).toBe(false);
    expect(isValidMailboxName("A".repeat(201))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// Search query sanitization (IMAP injection prevention)
// ─────────────────────────────────────────────────────────────

describe("sanitizeSearchQuery", () => {
  it("preserves normal search text", () => {
    expect(sanitizeSearchQuery("hello world")).toBe("hello world");
    expect(sanitizeSearchQuery("invoice 2024")).toBe("invoice 2024");
  });

  it("removes double quotes (IMAP SEARCH delimiter)", () => {
    expect(sanitizeSearchQuery('hello"world')).toBe("helloworld");
    expect(sanitizeSearchQuery('"injection"')).toBe("injection");
  });

  it("removes backslashes", () => {
    expect(sanitizeSearchQuery("hello\\world")).toBe("helloworld");
  });

  it("removes control characters", () => {
    expect(sanitizeSearchQuery("hello\nworld")).toBe("helloworld");
    expect(sanitizeSearchQuery("hello\rworld")).toBe("helloworld");
    expect(sanitizeSearchQuery("hello\0world")).toBe("helloworld");
  });

  it("truncates very long queries", () => {
    const long = "A".repeat(1000);
    expect(sanitizeSearchQuery(long).length).toBe(500);
  });

  it("returns empty string for falsy input", () => {
    expect(sanitizeSearchQuery("")).toBe("");
    expect(sanitizeSearchQuery("   ")).toBe("");
  });
});
