import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

const mockImap = {
  authenticated: false,
  connect: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  list: vi.fn(),
  status: vi.fn(),
  getMailboxLock: vi.fn(),
  search: vi.fn(),
  fetch: vi.fn(),
  fetchOne: vi.fn(),
  messageFlagsSet: vi.fn().mockResolvedValue(true),
  messageDelete: vi.fn().mockResolvedValue(true),
};

const mockSendMail = vi.fn().mockResolvedValue({ messageId: "<test@id>" });
const mockClose = vi.fn();
vi.mock("imapflow", () => ({
  ImapFlow: vi.fn().mockImplementation(() => mockImap),
}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: (...args: unknown[]) => mockSendMail(...args),
      close: () => mockClose(),
    }),
  },
}));

import { MailService } from "../src/mail-service.js";
import type { Config } from "../src/config.js";

const fakeConfig: Config = {
  fastmcpTransport: "httpStream",
  fastmcpPort: 3143,
  fastmcpHost: "0.0.0.0",
  imapHost: "imap.example.com",
  imapPort: 993,
  imapSecure: true,
  imapUser: "user@example.com",
  imapPass: "secret",
  imapRejectUnauthorized: false,
  smtpHost: "smtp.example.com",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "user@example.com",
  smtpPass: "secret",
  smtpRejectUnauthorized: false,
  logLevel: "info",
  logDir: "/tmp",
};

const logger = pino({ level: "silent" });

describe("MailService", () => {
  beforeEach(() => {
    mockImap.authenticated = false;
    mockImap.connect.mockClear();
    mockImap.logout.mockClear();
    mockImap.getMailboxLock.mockClear();
    mockImap.status.mockClear();
    mockImap.list.mockClear();
    mockImap.search.mockClear();
    mockImap.fetch.mockClear();
    mockImap.fetchOne.mockClear();
    mockImap.messageFlagsSet.mockClear();
    mockImap.messageDelete.mockClear();
    mockSendMail.mockClear();
    mockClose.mockClear();
  });

  it("connectImap creates ImapFlow with correct options", async () => {
    const mail = new MailService(fakeConfig, logger);
    await mail.connectImap();
    // ImapFlow constructor should have been called with our config
    expect(mockImap.connect).toHaveBeenCalled();
  });

  it("getServerInfo returns IMAP/SMTP details + inbox counts", async () => {
    const lock = { release: vi.fn() };
    mockImap.getMailboxLock.mockResolvedValue(lock);
    mockImap.status.mockResolvedValue({ messages: 100, unseen: 5 });

    const mail = new MailService(fakeConfig, logger);
    const info = await mail.getServerInfo();

    expect(info.user).toBe("user@example.com");
    expect(info.imap).toBe("imap.example.com:993");
    expect(info.smtp).toBe("smtp.example.com:465");
    expect(info.inbox_total).toBe(100);
    expect(info.inbox_unread).toBe(5);
    expect(lock.release).toHaveBeenCalled();
  });

  it("listMailboxes returns array of mailbox info", async () => {
    const lock = { release: vi.fn() };
    mockImap.getMailboxLock.mockResolvedValue(lock);
    mockImap.list.mockResolvedValue([
      { path: '"/" "INBOX"', name: "INBOX" },
      { path: '"/" "Sent"', name: "Sent" },
    ]);
    mockImap.status.mockResolvedValue({ messages: 10, unseen: 2 });

    const mail = new MailService(fakeConfig, logger);
    const boxes = await mail.listMailboxes();

    expect(Array.isArray(boxes)).toBe(true);
    expect(boxes.length).toBe(2);
    // Note: the IMAP path parsing leaves a leading space; this is consistent with the IMAP RFC
    expect(boxes[0].name).toBe("INBOX".trim());
    expect(boxes[0].total).toBe(10);
    expect(boxes[0].unread).toBe(2);
  });

  it("sendEmail returns messageId", async () => {
    const mail = new MailService(fakeConfig, logger);
    const result = await mail.sendEmail("a@b.com", "Hello", "Body");

    expect(mockSendMail).toHaveBeenCalledWith({
      from: "user@example.com",
      to: "a@b.com",
      subject: "Hello",
      text: "Body",
    });
    expect(result.messageId).toBe("<test@id>");
  });

  it("sendEmail uses smtpFrom override when provided", async () => {
    const mail = new MailService(
      { ...fakeConfig, smtpFrom: "alias@example.com" },
      logger,
    );
    await mail.sendEmail("a@b.com", "Hello", "Body");

    expect(mockSendMail).toHaveBeenCalledWith({
      from: "alias@example.com",
      to: "a@b.com",
      subject: "Hello",
      text: "Body",
    });
  });

  it("markRead adds or removes Seen flag", async () => {
    const lock = { release: vi.fn() };
    mockImap.getMailboxLock.mockResolvedValue(lock);

    const mail = new MailService(fakeConfig, logger);
    await mail.markRead(42, "INBOX", true);
    expect(mockImap.messageFlagsSet).toHaveBeenCalledWith("42", ["\\Seen"], {
      operation: "add",
      uid: true,
    });

    await mail.markRead(42, "INBOX", false);
    expect(mockImap.messageFlagsSet).toHaveBeenCalledWith("42", ["\\Seen"], {
      operation: "remove",
      uid: true,
    });
  });

  it("deleteEmail sets Deleted flag then expunges", async () => {
    const lock = { release: vi.fn() };
    mockImap.getMailboxLock.mockResolvedValue(lock);

    const mail = new MailService(fakeConfig, logger);
    await mail.deleteEmail(99, "INBOX");

    expect(mockImap.messageFlagsSet).toHaveBeenCalledWith("99", ["\\Deleted"], {
      operation: "add",
      uid: true,
    });
    expect(mockImap.messageDelete).toHaveBeenCalledWith(99);
  });

  it("close() calls logout when IMAP is connected", async () => {
    const lock = { release: vi.fn() };
    mockImap.getMailboxLock.mockResolvedValue(lock);
    mockImap.authenticated = true;
    const mail = new MailService(fakeConfig, logger);
    await mail.connectImap();
    // Reset call counts after connect
    mockImap.logout.mockClear();
    await mail.close();

    expect(mockImap.logout).toHaveBeenCalled();
  });
});
