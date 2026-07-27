/**
 * Security utilities: input sanitization and policy enforcement.
 *
 * These functions are pure (no side effects, no I/O) which makes them
 * easy to unit test. They are used by the MCP tools layer.
 */

export interface SecurityPolicy {
  allowedDomains: string[];
}

export interface ValidationError {
  field: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────
// Email address validation (RFC 5321 simplified)
// ─────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  return EMAIL_RE.test(email);
}

/** Extracts the domain part of an email address. Returns "" if invalid. */
export function extractDomain(email: string): string {
  const parts = email.split("@");
  return parts.length >= 2 ? parts[parts.length - 1].toLowerCase().trim() : "";
}

// ─────────────────────────────────────────────────────────────
// Recipient allowlist enforcement
// ─────────────────────────────────────────────────────────────

/**
 * Checks if a recipient email is allowed by the domain allowlist policy.
 * If the policy has no allowed domains, all valid emails are allowed.
 * Domain matching is case-insensitive.
 */
export function isRecipientAllowed(
  recipient: string,
  policy: SecurityPolicy,
): { ok: boolean; reason?: string } {
  if (!isValidEmail(recipient)) {
    return { ok: false, reason: "Invalid email address format" };
  }

  // If no allowlist is configured, allow all valid emails
  if (policy.allowedDomains.length === 0) {
    return { ok: true };
  }

  const domain = extractDomain(recipient);
  const allowed = policy.allowedDomains.map((d) => d.toLowerCase().trim());

  if (!allowed.includes(domain)) {
    return {
      ok: false,
      reason: `Domain "${domain}" is not in the allowed list: ${allowed.join(", ")}`,
    };
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Subject / body sanitization (prevent log injection, CRLF injection)
// ─────────────────────────────────────────────────────────────

/**
 * Strips control characters (including \r, \n, \t) and null bytes
 * from a string. Used to sanitize the email subject before it enters
 * the SMTP stream or gets logged.
 */
export function sanitizeHeader(value: string): string {
  if (!value) return "";
  return value
    .replace(/[\r\n\t]/g, " ") // No newlines in headers
    .replace(/\0/g, "") // No null bytes
    .trim()
    .substring(0, 998); // RFC 5322 max header line length
}

/**
 * Basic body sanitization: removes null bytes and limits length.
 * Unlike headers, newlines are preserved in the body.
 */
export function sanitizeBody(value: string, maxLength = 1_000_000): string {
  if (!value) return "";
  return value.replace(/\0/g, "").substring(0, maxLength);
}

// ─────────────────────────────────────────────────────────────
// PII redaction for logs
// ─────────────────────────────────────────────────────────────

/**
 * Redacts the local part of an email address for safe logging.
 * "user@example.com" → "u***@example.com"
 * "a@b.com" → "***@b.com" (too short to show any char)
 */
export function redactEmail(email: string): string {
  if (!email || !email.includes("@")) return "[redacted]";
  const [local, domain] = email.split("@");
  if (!local || local.length <= 1) return `***@${domain}`;
  return `${local[0]}${"*".repeat(Math.max(2, local.length - 1))}@${domain}`;
}

/**
 * Redacts a secret/password string for logging.
 * Shows only the first 2 and last 2 characters.
 */
export function redactSecret(secret: string): string {
  if (!secret) return "[empty]";
  if (secret.length <= 4) return "****";
  return `${secret.substring(0, 2)}${"*".repeat(4)}${secret.substring(secret.length - 2)}`;
}

// ─────────────────────────────────────────────────────────────
// Mailbox name validation (prevent path traversal / injection)
// ─────────────────────────────────────────────────────────────

const VALID_MAILBOX_RE = /^[a-zA-Z0-9 _\-./]+$/;

export function isValidMailboxName(name: string): boolean {
  if (!name || name.length > 200) return false;
  // Reject path traversal attempts
  if (name.includes("..")) return false;
  return VALID_MAILBOX_RE.test(name);
}

// ─────────────────────────────────────────────────────────────
// Search query sanitization (prevent IMAP injection)
// ─────────────────────────────────────────────────────────────

/**
 * Sanitizes a search query to prevent IMAP SEARCH command injection.
 * Removes double quotes and backslashes which could break the IMAP
 * protocol or match unintended criteria.
 */
export function sanitizeSearchQuery(query: string): string {
  if (!query) return "";
  return query
    .replace(/["\\]/g, "") // Remove quotes and backslashes
    .replace(/[\0\r\n]/g, "") // Remove control chars
    .trim()
    .substring(0, 500);
}