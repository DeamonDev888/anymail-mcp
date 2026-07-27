import { describe, it, expect, vi, beforeEach } from "vitest";
import pino from "pino";

// Mock MailService with controlled behavior
const mockMail = {
  getServerInfo: vi.fn(),
  listMailboxes: vi.fn(),
  listEmails: vi.fn(),
  readEmail: vi.fn(),
  searchEmails: vi.fn(),
  sendEmail: vi.fn(),
  replyEmail: vi.fn(),
  markRead: vi.fn(),
  deleteEmail: vi.fn(),
  close: vi.fn(),
};

vi.mock("../src/mail-service.js", () => ({
  MailService: vi.fn().mockImplementation(() => mockMail),
}));

// Collect registered tools in an array
const registeredTools: Array<{
  name: string;
  description: string;
  parameters: unknown;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}> = [];

// Mock fastmcp
vi.mock("fastmcp", () => ({
  FastMCP: vi.fn().mockImplementation(() => ({
    addTool: vi.fn((tool: (typeof registeredTools)[number]) => {
      registeredTools.push(tool);
    }),
    start: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { registerMailTools } from "../src/tools.js";
import { MailService } from "../src/mail-service.js";

// Helper: create a fake addTool function and register all tools
function registerAllTools(): typeof registeredTools {
  registeredTools.length = 0;
  const fakeAddTool = vi.fn((tool: (typeof registeredTools)[number]) => {
    registeredTools.push(tool);
  });
  registerMailTools(
    fakeAddTool as never,
    new (MailService as never)({} as never, pino({ level: "silent" }) as never),
  );
  return registeredTools;
}

// Helper: register a single tool by name
function registerOneTool(name: string): (typeof registeredTools)[number] {
  registeredTools.length = 0;
  let captured: (typeof registeredTools)[number] | null = null;
  const fakeAddTool = vi.fn((t: (typeof registeredTools)[number]) => {
    if (t.name === name) captured = t;
  });
  registerMailTools(
    fakeAddTool as never,
    new (MailService as never)({} as never, pino({ level: "silent" }) as never),
  );
  if (!captured) throw new Error(`Tool ${name} not registered`);
  return captured;
}

// Helper: register with a specific security policy
function registerOneToolWithPolicy(
  name: string,
  allowedDomains: string[],
): (typeof registeredTools)[number] {
  registeredTools.length = 0;
  let captured: (typeof registeredTools)[number] | null = null;
  const fakeAddTool = vi.fn((t: (typeof registeredTools)[number]) => {
    if (t.name === name) captured = t;
  });
  registerMailTools(
    fakeAddTool as never,
    new (MailService as never)({} as never, pino({ level: "silent" }) as never),
    { allowedDomains },
  );
  if (!captured) throw new Error(`Tool ${name} not registered`);
  return captured;
}

describe("registerMailTools", () => {
  beforeEach(() => {
    registeredTools.length = 0;
    Object.values(mockMail).forEach((m) => m.mockReset());
  });

  it("registers all 9 tools", () => {
    const tools = registerAllTools();
    expect(tools.length).toBe(9);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "delete_email",
      "list_emails",
      "list_mailboxes",
      "mark_read",
      "read_email",
      "reply_email",
      "search_emails",
      "send_email",
      "server_info",
    ]);
  });

  it("every tool has a name, description, parameters, and execute function", () => {
    const tools = registerAllTools();
    for (const t of tools) {
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe("string");
      expect(t.description.length).toBeGreaterThan(0);
      expect(t.parameters).toBeDefined();
      expect(typeof t.execute).toBe("function");
    }
  });

  it("server_info returns JSON string of getServerInfo()", async () => {
    mockMail.getServerInfo.mockResolvedValue({ user: "u", inbox_total: 10 });
    const tool = registerOneTool("server_info");
    const result = await tool.execute({});
    expect(JSON.parse(result as string)).toEqual({
      user: "u",
      inbox_total: 10,
    });
  });

  it("list_mailboxes returns JSON array", async () => {
    mockMail.listMailboxes.mockResolvedValue([
      { name: "INBOX", total: 5, unread: 1 },
    ]);
    const tool = registerOneTool("list_mailboxes");
    const result = await tool.execute({});
    expect(JSON.parse(result as string)).toEqual([
      { name: "INBOX", total: 5, unread: 1 },
    ]);
  });

  it("send_email sends as HTML when is_html=true", async () => {
    mockMail.sendEmail.mockResolvedValue({
      messageId: "<html@id>",
      sizeBytes: 200,
    });
    const tool = registerOneTool("send_email");
    const result = await tool.execute({
      to: "a@b.com",
      subject: "Hi",
      body: "<h1>Hello</h1>",
      is_html: true,
      preview: false,
    });
    expect(mockMail.sendEmail).toHaveBeenCalledWith(
      "a@b.com",
      "Hi",
      "<h1>Hello</h1>",
      { isHtml: true, preview: false },
    );
    expect(JSON.parse(result as string).is_html).toBe(true);
  });

  it("send_email preview=true returns size without sending", async () => {
    mockMail.sendEmail.mockResolvedValue({
      messageId: "preview",
      sizeBytes: 11,
    });
    const tool = registerOneTool("send_email");
    const result = await tool.execute({
      to: "a@b.com",
      subject: "Hi",
      body: "Hello world",
      is_html: false,
      preview: true,
    });
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe("preview");
    expect(parsed.sizeBytes).toBe(11);
    expect(parsed.message).toContain("preview=false");
  });

  it("reply_email passes through to mail service with threading", async () => {
    mockMail.replyEmail.mockResolvedValue({
      messageId: "<reply@id>",
      to: "a@b.com",
      subject: "Re: Original",
      inReplyTo: "<orig@id>",
    });
    const tool = registerOneTool("reply_email");
    const result = await tool.execute({
      uid: 42,
      body: "My reply",
      mailbox: "INBOX",
    });
    expect(mockMail.replyEmail).toHaveBeenCalledWith(42, "INBOX", "My reply");
    expect(JSON.parse(result as string)).toEqual({
      status: "sent",
      to: "a@b.com",
      subject: "Re: Original",
      messageId: "<reply@id>",
      inReplyTo: "<orig@id>",
    });
  });

  it("reply_email returns error JSON on failure", async () => {
    mockMail.replyEmail.mockRejectedValue(new Error("UID not found"));
    const tool = registerOneTool("reply_email");
    const result = await tool.execute({
      uid: 999,
      body: "Reply",
      mailbox: "INBOX",
    });
    expect(JSON.parse(result as string)).toEqual({
      status: "error",
      error: "UID not found",
    });
  });

  it("read_email returns error JSON when email is null", async () => {
    mockMail.readEmail.mockResolvedValue(null);
    const tool = registerOneTool("read_email");
    const result = await tool.execute({ uid: 42, mailbox: "INBOX" });
    expect(JSON.parse(result as string)).toEqual({ error: "Email not found" });
  });

  it("mark_read passes read flag through", async () => {
    mockMail.markRead.mockResolvedValue(undefined);
    const tool = registerOneTool("mark_read");
    const result = await tool.execute({
      uid: 5,
      mailbox: "INBOX",
      read: false,
    });
    expect(mockMail.markRead).toHaveBeenCalledWith(5, "INBOX", false);
    expect(JSON.parse(result as string)).toEqual({
      uid: 5,
      status: "ok",
      read: false,
    });
  });

  it("delete_email calls mail service", async () => {
    mockMail.deleteEmail.mockResolvedValue(undefined);
    const tool = registerOneTool("delete_email");
    const result = await tool.execute({ uid: 3, mailbox: "INBOX" });
    expect(mockMail.deleteEmail).toHaveBeenCalledWith(3, "INBOX");
    expect(JSON.parse(result as string)).toEqual({ uid: 3, status: "deleted" });
  });

  it("list_emails respects unread_only and limit", async () => {
    mockMail.listEmails.mockResolvedValue([]);
    const tool = registerOneTool("list_emails");
    await tool.execute({ mailbox: "Junk", limit: 50, unread_only: true });
    expect(mockMail.listEmails).toHaveBeenCalledWith("Junk", 50, true);
  });

  it("search_emails passes query and limit", async () => {
    mockMail.searchEmails.mockResolvedValue([]);
    const tool = registerOneTool("search_emails");
    await tool.execute({ query: "audit", mailbox: "INBOX", limit: 10 });
    expect(mockMail.searchEmails).toHaveBeenCalledWith("audit", "INBOX", 10);
  });

  // ── Security integration tests ──

  it("send_email blocks recipient not in allowlist", async () => {
    const tool = registerOneToolWithPolicy("send_email", ["example.com"]);
    const result = await tool.execute({
      to: "user@gmail.com",
      subject: "Hi",
      body: "Hello",
    });
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain("Blocked by security policy");
    expect(parsed.reason).toContain("gmail.com");
    expect(mockMail.sendEmail).not.toHaveBeenCalled();
  });

  it("send_email allows recipient in allowlist", async () => {
    mockMail.sendEmail.mockResolvedValue({ messageId: "<ok@id>" });
    const tool = registerOneToolWithPolicy("send_email", ["example.com"]);
    const result = await tool.execute({
      to: "user@example.com",
      subject: "Hi",
      body: "Hello",
    });
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe("sent");
    expect(mockMail.sendEmail).toHaveBeenCalled();
  });

  it("send_email sanitizes CRLF in subject", async () => {
    mockMail.sendEmail.mockResolvedValue({ messageId: "<ok@id>" });
    const tool = registerOneTool("send_email");
    await tool.execute({
      to: "user@example.com",
      subject: "Hello\r\nBcc: evil@hacker.com",
      body: "Body",
    });
    const callArgs = mockMail.sendEmail.mock.calls[0];
    expect(callArgs[1]).not.toContain("\r");
    expect(callArgs[1]).not.toContain("\n");
    expect(callArgs[1]).toContain("Hello");
  });

  it("send_email rejects invalid email format", async () => {
    const tool = registerOneTool("send_email");
    const result = await tool.execute({
      to: "not-an-email",
      subject: "Hi",
      body: "Hello",
    });
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toContain("security policy");
    expect(mockMail.sendEmail).not.toHaveBeenCalled();
  });

  it("list_emails rejects invalid mailbox name", async () => {
    const tool = registerOneTool("list_emails");
    const result = await tool.execute({
      mailbox: "../etc/passwd",
      limit: 10,
      unread_only: false,
    });
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe("Invalid mailbox name");
    expect(mockMail.listEmails).not.toHaveBeenCalled();
  });

  it("search_emails strips quotes from query (IMAP injection prevention)", async () => {
    mockMail.searchEmails.mockResolvedValue([]);
    const tool = registerOneTool("search_emails");
    await tool.execute({
      query: 'hello"injection"',
      mailbox: "INBOX",
      limit: 10,
    });
    const callArgs = mockMail.searchEmails.mock.calls[0];
    expect(callArgs[0]).not.toContain('"');
    expect(callArgs[0]).toBe("helloinjection");
  });

  it("read_email rejects invalid mailbox name", async () => {
    const tool = registerOneTool("read_email");
    const result = await tool.execute({ uid: 1, mailbox: "INBOX; rm -rf /" });
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe("Invalid mailbox name");
    expect(mockMail.readEmail).not.toHaveBeenCalled();
  });

  it("mark_read rejects invalid mailbox name", async () => {
    const tool = registerOneTool("mark_read");
    const result = await tool.execute({ uid: 1, mailbox: "../", read: true });
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBe("Invalid mailbox name");
    expect(mockMail.markRead).not.toHaveBeenCalled();
  });
});
