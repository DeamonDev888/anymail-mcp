/**
 * MCP Tools: thin wrappers around MailService.
 *
 * Each tool:
 *   - defines a Zod schema for its parameters
 *   - calls MailService
 *   - returns JSON-serializable results
 *
 * Tools can be registered to any MCP server framework (FastMCP, the
 * official SDK, etc.).
 */

import { z } from "zod";
import type { MailService } from "./mail-service.js";

export function registerMailTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addTool: (tool: any) => void,
  mail: MailService,
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
    description: "List emails in a mailbox. Returns subject, from, date, preview.",
    parameters: z.object({
      mailbox: z.string().default("INBOX").describe("Mailbox name (e.g. INBOX, Sent, Drafts)"),
      limit: z.number().int().positive().max(500).default(20).describe("Max emails to return"),
      unread_only: z.boolean().default(false).describe("Only return unread emails"),
    }),
    execute: async (args: { mailbox: string; limit: number; unread_only: boolean }) => {
      const emails = await mail.listEmails(args.mailbox, args.limit, args.unread_only);
      return JSON.stringify(emails);
    },
  });

  addTool({
    name: "read_email",
    description: "Read a full email by UID (including body).",
    parameters: z.object({
      uid: z.number().int().describe("Email UID"),
      mailbox: z.string().default("INBOX").describe("Mailbox name"),
    }),
    execute: async (args: { uid: number; mailbox: string }) => {
      const email = await mail.readEmail(args.uid, args.mailbox);
      if (!email) {
        return JSON.stringify({ error: "Email not found" });
      }
      return JSON.stringify(email);
    },
  });

  addTool({
    name: "search_emails",
    description: "Search emails by keyword (subject, from, to, body).",
    parameters: z.object({
      query: z.string().describe("Search keyword"),
      mailbox: z.string().default("INBOX").describe("Mailbox name"),
      limit: z.number().int().positive().max(500).default(20).describe("Max results"),
    }),
    execute: async (args: { query: string; mailbox: string; limit: number }) => {
      const results = await mail.searchEmails(args.query, args.mailbox, args.limit);
      return JSON.stringify(results);
    },
  });

  addTool({
    name: "send_email",
    description: "Send an email via SMTP.",
    parameters: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (plain text)"),
    }),
    execute: async (args: { to: string; subject: string; body: string }) => {
      const result = await mail.sendEmail(args.to, args.subject, args.body);
      return JSON.stringify({
        status: "sent",
        to: args.to,
        subject: args.subject,
        messageId: result.messageId,
      });
    },
  });

  addTool({
    name: "mark_read",
    description: "Mark an email as read or unread.",
    parameters: z.object({
      uid: z.number().int().describe("Email UID"),
      mailbox: z.string().default("INBOX").describe("Mailbox name"),
      read: z.boolean().default(true).describe("true=mark read, false=mark unread"),
    }),
    execute: async (args: { uid: number; mailbox: string; read: boolean }) => {
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
      await mail.deleteEmail(args.uid, args.mailbox);
      return JSON.stringify({ uid: args.uid, status: "deleted" });
    },
  });
}