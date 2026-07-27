/**
 * Configuration loaded from environment variables.
 *
 * All values are validated at startup; the process exits if any required
 * value is missing or malformed.
 */

import { z } from "zod";

const ConfigSchema = z.object({
  // Transport
  fastmcpTransport: z.enum(["httpStream", "stdio"]).default("httpStream"),
  fastmcpPort: z.number().int().min(1).max(65535).default(3143),
  fastmcpHost: z.string().default("0.0.0.0"),

  // IMAP
  imapHost: z.string().min(1, "IMAP_HOST is required"),
  imapPort: z.number().int().min(1).max(65535).default(993),
  imapSecure: z.boolean().default(true),
  imapUser: z.string().min(1, "IMAP_USER is required"),
  imapPass: z.string().min(1, "IMAP_PASS is required"),
  imapRejectUnauthorized: z.boolean().default(false),

  // SMTP
  smtpHost: z.string().min(1, "SMTP_HOST is required"),
  smtpPort: z.number().int().min(1).max(65535).default(465),
  smtpSecure: z.boolean().default(true),
  smtpUser: z.string().min(1, "SMTP_USER is required"),
  smtpPass: z.string().min(1, "SMTP_PASS is required"),
  smtpFrom: z.string().optional(), // Optional: defaults to smtpUser
  smtpRejectUnauthorized: z.boolean().default(false),

  // Logging
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  logDir: z.string().default("./logs"),

  // ── Security (all optional, opt-in) ──
  /** Bearer token for HTTP transport. If set, clients must send
   *  `Authorization: Bearer <token>` header. Ignored in stdio mode. */
  authToken: z.string().optional(),
  /** Comma-separated allowlist of recipient domains for send_email.
   *  If set, only emails to these domains are allowed.
   *  Example: "example.com,myorg.org" */
  allowedDomains: z.array(z.string()).default([]),
  /** When true, masks the IMAP/SMTP user in logs to prevent PII leaks.
   *  Default: true */
  redactLogs: z.boolean().default(true),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const raw = {
    fastmcpTransport: process.env.FASTMCP_TRANSPORT,
    fastmcpPort: process.env.FASTMCP_PORT ? parseInt(process.env.FASTMCP_PORT, 10) : undefined,
    fastmcpHost: process.env.FASTMCP_HOST,

    imapHost: process.env.IMAP_HOST,
    imapPort: process.env.IMAP_PORT ? parseInt(process.env.IMAP_PORT, 10) : undefined,
    imapSecure: process.env.IMAP_SECURE ? process.env.IMAP_SECURE === "true" : undefined,
    imapUser: process.env.IMAP_USER,
    imapPass: process.env.IMAP_PASS,
    imapRejectUnauthorized: process.env.IMAP_REJECT_UNAUTHORIZED
      ? process.env.IMAP_REJECT_UNAUTHORIZED === "true"
      : undefined,

    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
    smtpSecure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : undefined,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM,
    smtpRejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED
      ? process.env.SMTP_REJECT_UNAUTHORIZED === "true"
      : undefined,

    logLevel: process.env.LOG_LEVEL,
    logDir: process.env.LOG_DIR,

    authToken: process.env.AUTH_TOKEN,
    allowedDomains: process.env.ALLOWED_DOMAINS
      ? process.env.ALLOWED_DOMAINS.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
    redactLogs: process.env.REDACT_LOGS ? process.env.REDACT_LOGS === "true" : undefined,
  };

  // Strip undefined so zod applies defaults
  const clean = Object.fromEntries(Object.entries(raw).filter(([_, v]) => v !== undefined));

  const result = ConfigSchema.safeParse(clean);
  if (!result.success) {
    // Map camelCase field names back to UPPER_SNAKE_CASE for the user
    const errors = result.error.issues
      .map((i) => {
        const camel = i.path.join(".");
        const upper = camel.replace(/([A-Z])/g, "_$1").toUpperCase();
        return `  - ${upper} (${camel}): ${i.message}`;
      })
      .join("\n");
    throw new Error(`Invalid configuration:\n${errors}`);
  }

  return result.data;
}