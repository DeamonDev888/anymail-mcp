/**
 * MCP Tools: thin wrappers around MailService.
 *
 * Each tool:
 *   - defines a Zod schema for its parameters
 *   - validates and sanitizes inputs (security layer)
 *   - calls MailService
 *   - returns JSON-serializable results
 *
 * Tools can be registered to any MCP server framework (FastMCP, the
 * official SDK, etc.).
 */

import { z } from "zod";
import type { MailService } from "./mail-service.js";
import {
  isRecipientAllowed,
  isValidMailboxName,
  sanitizeBody,
  sanitizeHeader,
  sanitizeSearchQuery,
  type SecurityPolicy,
} from "./security.js";

export function registerMailTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addTool: (tool: any) => void,
  mail: MailService,
  policy: SecurityPolicy = { allowedDomains: [] },
): void {
  addTool({
    name: "server_info",
    description: "Get IMAP/SMTP server info (mailbox counts, user, host).",
    parameters: z.object({}),
    execute: async () => {
      const info = await mail.getServerInfo();
      return JSON.stringify(info);
    },
  });

  addTool({
    name: "list_mailboxes",
    description: "List all mailboxes with message counts (total + unread).",
    parameters: z.object({}),
    execute: async () => {
      const list = await mail.listMailboxes();
      return JSON.stringify(list);
    },
  });

  addTool({
    name: "list_emails",
    description:
      "List emails in a mailbox. Returns subject, from, date, preview.",
    parameters: z.object({
      mailbox: z
        .string()
        .default("INBOX")
        .describe("Mailbox name (e.g. INBOX, Sent, Drafts)"),
      limit: z
        .number()
        .int()
        .positive()
        .max(500)
        .default(20)
        .describe("Max emails to return"),
      unread_only: z
        .boolean()
        .default(false)
        .describe("Only return unread emails"),
    }),
    execute: async (args: {
      mailbox: string;
      limit: number;
      unread_only: boolean;
    }) => {
      if (!isValidMailboxName(args.mailbox)) {
        return JSON.stringify({ error: "Invalid mailbox name" });
      }
      const emails = await mail.listEmails(
        args.mailbox,
        args.limit,
        args.unread_only,
      );
      return JSON.stringify(emails);
    },
  });

  addTool({
    name: "read_email",
    description:
      "Read a full email by UID (including body). Default returns preview (first 200 chars) to avoid blowing context. Set full=true to get the entire body.",
    parameters: z.object({
      uid: z.number().int().describe("Email UID"),
      mailbox: z.string().default("INBOX").describe("Mailbox name"),
      full: z
        .boolean()
        .default(false)
        .describe(
          "Return the entire body (default: false → preview only, first 200 chars)",
        ),
    }),
    execute: async (args: { uid: number; mailbox: string; full: boolean }) => {
      if (!isValidMailboxName(args.mailbox)) {
        return JSON.stringify({ error: "Invalid mailbox name" });
      }
      const email = await mail.readEmail(args.uid, args.mailbox, {
        preview: !args.full,
      });
      if (!email) {
        return JSON.stringify({ error: "Email not found" });
      }
      // Add a hint about the full body length when truncated
      const result: Record<string, unknown> = { ...email };
      if (args.full === false && email.body.length >= 200) {
        result.truncated = true;
        result.note = "Set full=true to retrieve the entire body";
      }
      return JSON.stringify(result);
    },
  });

  addTool({
    name: "search_emails",
    description: "Search emails by keyword (subject, from, to, body).",
    parameters: z.object({
      query: z.string().describe("Search keyword"),
      mailbox: z.string().default("INBOX").describe("Mailbox name"),
      limit: z
        .number()
        .int()
        .positive()
        .max(500)
        .default(20)
        .describe("Max results"),
    }),
    execute: async (args: {
      query: string;
      mailbox: string;
      limit: number;
    }) => {
      const query = sanitizeSearchQuery(args.query);
      if (!query) {
        return JSON.stringify({ error: "Empty or invalid search query" });
      }
      if (!isValidMailboxName(args.mailbox)) {
        return JSON.stringify({ error: "Invalid mailbox name" });
      }
      const results = await mail.searchEmails(query, args.mailbox, args.limit);
      return JSON.stringify(results);
    },
  });

  addTool({
    name: "send_email",
    description:
      "Send an email via SMTP. Set is_html=true to send HTML body (with inline SVG, images, etc.). Set preview=true to validate the payload size without actually sending.",
    parameters: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (plain text or HTML)"),
      is_html: z
        .boolean()
        .default(false)
        .describe("Treat body as HTML (default: false → plain text)"),
      preview: z
        .boolean()
        .default(false)
        .describe(
          "Don't send — just validate the payload and return its size in bytes",
        ),
    }),
    execute: async (args: {
      to: string;
      subject: string;
      body: string;
      is_html: boolean;
      preview: boolean;
    }) => {
      // Security: check allowlist policy
      const check = isRecipientAllowed(args.to, policy);
      if (!check.ok) {
        return JSON.stringify({
          error: "Blocked by security policy",
          reason: check.reason,
        });
      }

      // Security: sanitize subject (no CRLF injection, no null bytes)
      const safeSubject = sanitizeHeader(args.subject);
      if (!safeSubject) {
        return JSON.stringify({ error: "Invalid subject" });
      }

      // Security: sanitize body (no null bytes, cap length)
      const safeBody = sanitizeBody(args.body);

      const result = await mail.sendEmail(args.to, safeSubject, safeBody, {
        isHtml: args.is_html,
        preview: args.preview,
      });

      if (args.preview) {
        return JSON.stringify({
          status: "preview",
          to: args.to,
          subject: safeSubject,
          is_html: args.is_html,
          sizeBytes: result.sizeBytes,
          message: `Payload validated. Pass preview=false to actually send.`,
        });
      }

      return JSON.stringify({
        status: "sent",
        to: args.to,
        subject: safeSubject,
        is_html: args.is_html,
        sizeBytes: result.sizeBytes,
        messageId: result.messageId,
      });
    },
  });

  addTool({
    name: "reply_email",
    description:
      "Reply to an existing email thread. Reads the original email by UID to extract the sender, subject, and Message-ID, then sends a reply with proper threading headers (In-Reply-To, References) and a 'Re:' subject prefix.",
    parameters: z.object({
      uid: z.number().int().describe("UID of the email to reply to"),
      body: z.string().describe("Reply body (plain text)"),
      mailbox: z
        .string()
        .default("INBOX")
        .describe("Mailbox containing the original email"),
    }),
    execute: async (args: { uid: number; body: string; mailbox: string }) => {
      if (!isValidMailboxName(args.mailbox)) {
        return JSON.stringify({ error: "Invalid mailbox name" });
      }
      // Security: sanitize body
      const safeBody = sanitizeBody(args.body);
      try {
        const result = await mail.replyEmail(args.uid, args.mailbox, safeBody);
        return JSON.stringify({
          status: "sent",
          to: result.to,
          subject: result.subject,
          messageId: result.messageId,
          inReplyTo: result.inReplyTo,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ status: "error", error: message });
      }
    },
  });

  addTool({
    name: "mark_read",
    description: "Mark an email as read or unread.",
    parameters: z.object({
      uid: z.number().int().describe("Email UID"),
      mailbox: z.string().default("INBOX").describe("Mailbox name"),
      read: z
        .boolean()
        .default(true)
        .describe("true=mark read, false=mark unread"),
    }),
    execute: async (args: { uid: number; mailbox: string; read: boolean }) => {
      if (!isValidMailboxName(args.mailbox)) {
        return JSON.stringify({ error: "Invalid mailbox name" });
      }
      await mail.markRead(args.uid, args.mailbox, args.read);
      return JSON.stringify({ uid: args.uid, status: "ok", read: args.read });
    },
  });

  addTool({
    name: "delete_email",
    description: "Delete an email (sets \\Deleted flag, then expunges).",
    parameters: z.object({
      uid: z.number().int().describe("Email UID"),
      mailbox: z.string().default("INBOX").describe("Mailbox name"),
    }),
    execute: async (args: { uid: number; mailbox: string }) => {
      if (!isValidMailboxName(args.mailbox)) {
        return JSON.stringify({ error: "Invalid mailbox name" });
      }
      await mail.deleteEmail(args.uid, args.mailbox);
      return JSON.stringify({ uid: args.uid, status: "deleted" });
    },
  });
}
