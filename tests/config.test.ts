import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  // Save original env
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env between tests
    process.env = { ...originalEnv };
  });

  it("loads required IMAP/SMTP fields from env", () => {
    process.env.IMAP_HOST = "imap.example.com";
    process.env.IMAP_USER = "user@example.com";
    process.env.IMAP_PASS = "secret";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user@example.com";
    process.env.SMTP_PASS = "secret";

    const config = loadConfig();
    expect(config.imapHost).toBe("imap.example.com");
    expect(config.imapUser).toBe("user@example.com");
    expect(config.imapPass).toBe("secret");
    expect(config.smtpHost).toBe("smtp.example.com");
  });

  it("applies sensible defaults", () => {
    process.env.IMAP_HOST = "imap.example.com";
    process.env.IMAP_USER = "u@e.com";
    process.env.IMAP_PASS = "p";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "u@e.com";
    process.env.SMTP_PASS = "p";

    const config = loadConfig();
    expect(config.imapPort).toBe(993);
    expect(config.imapSecure).toBe(true);
    expect(config.smtpPort).toBe(465);
    expect(config.smtpSecure).toBe(true);
    expect(config.fastmcpTransport).toBe("httpStream");
    expect(config.fastmcpPort).toBe(3143);
    expect(config.fastmcpHost).toBe("0.0.0.0");
    expect(config.logLevel).toBe("info");
    expect(config.imapRejectUnauthorized).toBe(false);
  });

  it("respects custom FASTMCP_PORT", () => {
    process.env.IMAP_HOST = "i";
    process.env.IMAP_USER = "u";
    process.env.IMAP_PASS = "p";
    process.env.SMTP_HOST = "s";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.FASTMCP_PORT = "9999";

    const config = loadConfig();
    expect(config.fastmcpPort).toBe(9999);
  });

  it("respects custom IMAP_PORT", () => {
    process.env.IMAP_HOST = "i";
    process.env.IMAP_USER = "u";
    process.env.IMAP_PASS = "p";
    process.env.SMTP_HOST = "s";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.IMAP_PORT = "143";

    const config = loadConfig();
    expect(config.imapPort).toBe(143);
  });

  it("rejects invalid FASTMCP_PORT", () => {
    process.env.IMAP_HOST = "i";
    process.env.IMAP_USER = "u";
    process.env.IMAP_PASS = "p";
    process.env.SMTP_HOST = "s";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.FASTMCP_PORT = "not-a-number";

    expect(() => loadConfig()).toThrow();
  });

  it("rejects out-of-range FASTMCP_PORT", () => {
    process.env.IMAP_HOST = "i";
    process.env.IMAP_USER = "u";
    process.env.IMAP_PASS = "p";
    process.env.SMTP_HOST = "s";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.FASTMCP_PORT = "999999";

    expect(() => loadConfig()).toThrow();
  });

  it("rejects missing IMAP_HOST", () => {
    process.env.IMAP_USER = "u";
    process.env.IMAP_PASS = "p";
    process.env.SMTP_HOST = "s";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";

    expect(() => loadConfig()).toThrow(/IMAP_HOST/);
  });

  it("rejects missing IMAP_PASS", () => {
    process.env.IMAP_HOST = "i";
    process.env.IMAP_USER = "u";
    process.env.SMTP_HOST = "s";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";

    expect(() => loadConfig()).toThrow(/IMAP_PASS/);
  });

  it("rejects missing SMTP_USER", () => {
    process.env.IMAP_HOST = "i";
    process.env.IMAP_USER = "u";
    process.env.IMAP_PASS = "p";
    process.env.SMTP_HOST = "s";
    process.env.SMTP_PASS = "p";

    expect(() => loadConfig()).toThrow(/SMTP_USER/);
  });

  it("respects SMTP_FROM override", () => {
    process.env.IMAP_HOST = "i";
    process.env.IMAP_USER = "u";
    process.env.IMAP_PASS = "p";
    process.env.SMTP_HOST = "s";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.SMTP_FROM = "alias@example.com";

    const config = loadConfig();
    expect(config.smtpFrom).toBe("alias@example.com");
  });

  it("respects LOG_LEVEL", () => {
    process.env.IMAP_HOST = "i";
    process.env.IMAP_USER = "u";
    process.env.IMAP_PASS = "p";
    process.env.SMTP_HOST = "s";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.LOG_LEVEL = "debug";

    const config = loadConfig();
    expect(config.logLevel).toBe("debug");
  });
});
