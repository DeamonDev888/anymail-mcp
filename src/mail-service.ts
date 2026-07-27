/**
 * MailService: IMAP/SMTP operations.
 *
 * This is the layer that talks to the mail server. The MCP tools
 * (in tools.ts) call this service. By separating concerns, we can:
 *   - mock MailService in tests
 *   - swap implementations (e.g. for OAuth2 providers)
 *   - keep transport logic clean
 */

import { ImapFlow, type ImapFlowOptions } from "imapflow";
import nodemailer, { type Transporter } from "nodemailer";
import type { Logger } from "pino";
import type { Config } from "./config.js";

export interface EmailSummary {
  uid: number;
  subject: string | undefined;
  from: string | undefined;
  to: string | undefined;
  date: string | undefined;
  flags: string[];
  preview: string;
}

export interface EmailFull extends EmailSummary {
  body: string;
}

export interface MailboxInfo {
  name: string;
  total: number;
  unread: number;
}

export interface ServerInfo {
  user: string;
  imap: string;
  smtp: string;
  inbox_total: number;
  inbox_unread: number;
}

export class MailService {
  private imap: ImapFlow | null = null;
  private smtp: Transporter | null = null;

  constructor(
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  async connectImap(): Promise<ImapFlow> {
    if (this.imap?.authenticated) {
      return this.imap;
    }

    const opts: ImapFlowOptions = {
      host: this.config.imapHost,
      port: this.config.imapPort,
      secure: this.config.imapSecure,
      auth: {
        user: this.config.imapUser,
        pass: this.config.imapPass,
      },
      logger: false,
    };

    if (!this.config.imapRejectUnauthorized) {
      opts.tls = { rejectUnauthorized: false };
    }

    this.imap = new ImapFlow(opts);
    await this.imap.connect();
    this.logger.info(
      {
        host: this.config.imapHost,
        port: this.config.imapPort,
        user: this.config.imapUser,
      },
      "IMAP connected",
    );
    return this.imap;
  }

  getSmtp(): Transporter {
    if (this.smtp) {
      return this.smtp;
    }

    this.smtp = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpSecure,
      auth: {
        user: this.config.smtpUser,
        pass: this.config.smtpPass,
      },
      ...(this.config.smtpRejectUnauthorized
        ? {}
        : { tls: { rejectUnauthorized: false } }),
    });

    this.logger.info(
      { host: this.config.smtpHost, port: this.config.smtpPort },
      "SMTP transport ready",
    );
    return this.smtp;
  }

  async getServerInfo(): Promise<ServerInfo> {
    const c = await this.connectImap();
    const lock = await c.getMailboxLock("INBOX");
    try {
      const status = await c.status("INBOX", { messages: true, unseen: true });
      return {
        user: this.config.imapUser,
        imap: `${this.config.imapHost}:${this.config.imapPort}`,
        smtp: `${this.config.smtpHost}:${this.config.smtpPort}`,
        inbox_total: status.messages ?? 0,
        inbox_unread: status.unseen ?? 0,
      };
    } finally {
      lock.release();
    }
  }

  async listMailboxes(): Promise<MailboxInfo[]> {
    const c = await this.connectImap();
    const list = await c.list();
    const result: MailboxInfo[] = [];
    for (const item of list) {
      // imapflow list() returns objects with path + specialUse flags
      // Path can be "INBOX", "Sent Items", or "/"-delimited. Trim and clean.
      const rawName = item.path || item.name || "";
      const name = rawName.split("/").pop()?.replace(/"/g, "").trim() || "";
      const status = await c.status(name, { messages: true, unseen: true });
      result.push({
        name,
        total: status.messages ?? 0,
        unread: status.unseen ?? 0,
      });
    }
    return result;
  }

  async listEmails(
    mailbox: string,
    limit: number,
    unreadOnly: boolean,
  ): Promise<EmailSummary[]> {
    const c = await this.connectImap();
    const lock = await c.getMailboxLock(mailbox);
    try {
      const criteria = unreadOnly ? { seen: false } : { all: true };
      const uids = (await c.search(criteria as never)) || [];
      const recent = uids.slice(-limit).reverse();
      const results: EmailSummary[] = [];
      for await (const msg of c.fetch(recent, {
        uid: true,
        envelope: true,
        flags: true,
      } as never)) {
        // imapflow doesn't expose preview at the type level; fetch via unknown
        const m = msg as unknown as { preview?: string };
        results.push({
          uid: msg.uid as number,
          subject: msg.envelope?.subject,
          from: msg.envelope?.from?.[0]?.address,
          to: msg.envelope?.to?.map((t) => t.address).join(", "),
          date: msg.envelope?.date?.toISOString(),
          flags: msg.flags ? Array.from(msg.flags) : [],
          preview: m.preview?.substring(0, 200) || "",
        });
      }
      return results;
    } finally {
      lock.release();
    }
  }

  async readEmail(
    uid: number,
    mailbox: string,
    options: { preview?: boolean } = {},
  ): Promise<EmailFull | null> {
    const c = await this.connectImap();
    const lock = await c.getMailboxLock(mailbox);
    try {
      const msg = await c.fetchOne(
        String(uid),
        {
          uid: true,
          envelope: true,
          flags: true,
          source: true,
        } as never,
        { uid: true },
      );
      if (!msg) return null;

      const m = msg as unknown as { preview?: string };
      const source = msg.source?.toString() || "";

      // Parse MIME body. Try text/plain first, then text/html, then fallback.
      const decodeMimeBody = (mimeSource: string): string => {
        const textPlain = mimeSource.match(
          /Content-Type: text\/plain[^\n]*\n(?:[^:\n]+:\n)?\n\n([\s\S]*?)(?=\n\n[A-Z]|\n\n$|$)/,
        );
        if (textPlain) return textPlain[1].trim();
        const textHtml = mimeSource.match(
          /Content-Type: text\/html[^\n]*\n(?:[^:\n]+:\n)?\n\n([\s\S]*?)(?=\n\n[A-Z]|\n\n$|$)/,
        );
        if (textHtml) return textHtml[1].trim();
        // Fallback: first 2000 chars of source
        return mimeSource.substring(0, 2000);
      };

      const fullBody = decodeMimeBody(source);

      // If preview mode (default), truncate to 200 chars for the body
      // but also include the preview from the server if available
      const body =
        options.preview === false ? fullBody : fullBody.substring(0, 200);

      return {
        uid: msg.uid as number,
        subject: msg.envelope?.subject,
        from: msg.envelope?.from?.[0]?.address,
        to: msg.envelope?.to?.map((t) => t.address).join(", "),
        date: msg.envelope?.date?.toISOString(),
        flags: msg.flags ? Array.from(msg.flags) : [],
        preview: m.preview?.substring(0, 200) || fullBody.substring(0, 200),
        body,
      };
    } finally {
      lock.release();
    }
  }

  async searchEmails(
    query: string,
    mailbox: string,
    limit: number,
  ): Promise<EmailSummary[]> {
    const c = await this.connectImap();
    const lock = await c.getMailboxLock(mailbox);
    try {
      const uids = (await c.search({ body: query })) || [];
      const recent = uids.slice(-limit).reverse();
      const results: EmailSummary[] = [];
      for await (const msg of c.fetch(recent, {
        uid: true,
        envelope: true,
        flags: true,
      } as never)) {
        const m = msg as unknown as { preview?: string };
        results.push({
          uid: msg.uid as number,
          subject: msg.envelope?.subject,
          from: msg.envelope?.from?.[0]?.address,
          to: undefined,
          date: msg.envelope?.date?.toISOString(),
          flags: msg.flags ? Array.from(msg.flags) : [],
          preview: m.preview?.substring(0, 200) || "",
        });
      }
      return results;
    } finally {
      lock.release();
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    body: string,
    options: { isHtml?: boolean; preview?: boolean } = {},
  ): Promise<{ messageId: string; sizeBytes?: number }> {
    const isHtml = options.isHtml === true;
    const preview = options.preview === true;

    // If preview=true, don't actually send — just validate the payload size
    if (preview) {
      const estimatedSize = Buffer.byteLength(body, "utf8");
      this.logger.info(
        { to, subject, sizeBytes: estimatedSize, isHtml },
        "Email preview requested (not sent)",
      );
      return { messageId: "preview", sizeBytes: estimatedSize };
    }

    const t = this.getSmtp();
    const mailOptions: nodemailer.SendMailOptions = {
      from: this.config.smtpFrom || this.config.smtpUser,
      to,
      subject,
    };

    if (isHtml) {
      mailOptions.html = body;
    } else {
      mailOptions.text = body;
    }

    const info = await t.sendMail(mailOptions);
    this.logger.info(
      {
        to,
        subject,
        messageId: info.messageId,
        isHtml,
        sizeBytes: Buffer.byteLength(body, "utf8"),
      },
      "Email sent",
    );
    return {
      messageId: info.messageId || "",
      sizeBytes: Buffer.byteLength(body, "utf8"),
    };
  }

  /**
   * Reply to an existing email. Reads the original by UID to extract
   * Message-ID, From address, and Subject, then sends a reply with proper
   * threading headers (In-Reply-To, References) and "Re:" subject prefix.
   *
   * Returns the SMTP Message-ID of the reply.
   */
  async replyEmail(
    uid: number,
    mailbox: string,
    body: string,
  ): Promise<{
    messageId: string;
    to: string;
    subject: string;
    inReplyTo: string | null;
  }> {
    // 1. Read the original email to extract threading headers
    const c = await this.connectImap();
    const lock = await c.getMailboxLock(mailbox);
    let originalMsgId: string | undefined;
    let originalFrom: string | undefined;
    let originalSubject: string | undefined;

    try {
      const msg = await c.fetchOne(
        String(uid),
        { uid: true, envelope: true, internalDate: true },
        { uid: true },
      );
      if (!msg) throw new Error(`Email UID ${uid} not found in ${mailbox}`);
      originalMsgId = msg.envelope?.messageId;
      originalFrom = msg.envelope?.from?.[0]?.address;
      originalSubject = msg.envelope?.subject;
    } finally {
      lock.release();
    }

    if (!originalFrom) {
      throw new Error("Could not determine original sender address");
    }

    // 2. Build the reply subject with Re: prefix
    let replySubject = originalSubject || "";
    if (!replySubject.toLowerCase().startsWith("re:")) {
      replySubject = "Re: " + replySubject;
    }

    // 3. Send the reply with threading headers
    const t = this.getSmtp();
    const mailOptions: nodemailer.SendMailOptions = {
      from: this.config.smtpFrom || this.config.smtpUser,
      to: originalFrom,
      subject: replySubject,
      text: body,
    };
    if (originalMsgId) {
      (mailOptions as never as { headers: Record<string, string> }).headers = {
        "In-Reply-To": `<${originalMsgId}>`,
        References: `<${originalMsgId}>`,
      };
    }
    const info = await t.sendMail(mailOptions);

    this.logger.info(
      {
        uid,
        to: originalFrom,
        subject: replySubject,
        messageId: info.messageId,
        inReplyTo: originalMsgId,
      },
      "Reply sent",
    );

    return {
      messageId: info.messageId || "",
      to: originalFrom,
      subject: replySubject,
      inReplyTo: originalMsgId || null,
    };
  }

  async markRead(uid: number, mailbox: string, read: boolean): Promise<void> {
    const c = await this.connectImap();
    const lock = await c.getMailboxLock(mailbox);
    try {
      await c.messageFlagsSet(String(uid), ["\\Seen"], {
        operation: read ? "add" : "remove",
        uid: true,
      } as never);
    } finally {
      lock.release();
    }
  }

  async deleteEmail(uid: number, mailbox: string): Promise<void> {
    const c = await this.connectImap();
    const lock = await c.getMailboxLock(mailbox);
    try {
      await c.messageFlagsSet(String(uid), ["\\Deleted"], {
        operation: "add",
        uid: true,
      } as never);
      await c.messageDelete(String(uid), { uid: true } as never);
    } finally {
      lock.release();
    }
  }

  async close(): Promise<void> {
    if (this.imap) {
      try {
        await this.imap.logout();
      } catch {
        // ignore
      }
      this.imap = null;
    }
    if (this.smtp) {
      this.smtp.close();
      this.smtp = null;
    }
  }
}
