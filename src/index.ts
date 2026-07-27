#!/usr/bin/env node
/**
 * anymail-mcp - Universal IMAP/SMTP MCP server
 *
 * Exposes any IMAP/SMTP mailbox as MCP tools (8 tools, FastMCP 3.x
 * httpStream transport). See README.md for usage.
 */

import { FastMCP } from "fastmcp";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { MailService } from "./mail-service.js";
import { registerMailTools } from "./tools.js";
import { redactEmail } from "./security.js";

async function main(): Promise<void> {
  // 1. Load and validate config
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(
      `Configuration error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }

  // 2. Set up logger
  const logger = createLogger(config.logDir, "anymail-mcp", config.logLevel);

  const userForLog = config.redactLogs
    ? redactEmail(config.imapUser)
    : config.imapUser;
  logger.info(
    {
      transport: config.fastmcpTransport,
      port: config.fastmcpPort,
      imap: `${config.imapHost}:${config.imapPort}`,
      smtp: `${config.smtpHost}:${config.smtpPort}`,
      user: userForLog,
      security: {
        authToken: config.authToken ? "enabled" : "disabled",
        allowedDomains:
          config.allowedDomains.length > 0 ? config.allowedDomains : "all",
        redactLogs: config.redactLogs,
      },
    },
    "Starting anymail-mcp",
  );

  // 3. Create mail service (does not connect yet - lazy)
  const mail = new MailService(config, logger);

  // 4. Create MCP server (with optional Bearer auth)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serverOptions: any = {
    name: "anymail-mcp",
    version: "1.1.0",
  };

  // If auth token is configured, add an authenticate function (FastMCP 3.x)
  if (config.authToken) {
    logger.info("Bearer token authentication enabled");
    serverOptions.authenticate = (request: Request) => {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("Missing or invalid Authorization header");
      }
      const token = authHeader.substring(7);
      if (token !== config.authToken) {
        throw new Error("Invalid auth token");
      }
    };
  }

  const server = new FastMCP(serverOptions);

  // 5. Register tools with security policy
  registerMailTools(
    (tool: unknown) =>
      server.addTool(tool as Parameters<typeof server.addTool>[0]),
    mail,
    { allowedDomains: config.allowedDomains },
  );

  // 6. Graceful shutdown
  const cleanup = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down");
    await mail.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void cleanup("SIGINT"));
  process.on("SIGTERM", () => void cleanup("SIGTERM"));

  process.on("uncaughtException", (err: unknown) => {
    const e = err as { code?: string; syscall?: string; message?: string };
    if (e?.code === "EPIPE" || e?.syscall === "write") return;
    logger.fatal({ err: e }, "Uncaught exception");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason: unknown) => {
    const r = reason as { code?: string };
    if (r?.code === "EPIPE") return;
    logger.error({ reason }, "Unhandled rejection");
  });

  // 7. Start the server
  try {
    if (config.fastmcpTransport === "httpStream") {
      await server.start({
        transportType: "httpStream",
        httpStream: {
          port: config.fastmcpPort,
          host: config.fastmcpHost,
        },
      });
      logger.info(
        { url: `http://${config.fastmcpHost}:${config.fastmcpPort}/mcp` },
        "HTTP Stream listening",
      );
    } else {
      await server.start();
      logger.info("stdio transport active");
    }
  } catch (err) {
    logger.fatal(
      { err: err instanceof Error ? err.message : String(err) },
      "Failed to start server",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
