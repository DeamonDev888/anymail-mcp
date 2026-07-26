# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-07-25

### Added
- Initial public release
- 8 MCP tools: `server_info`, `list_mailboxes`, `list_emails`, `read_email`,
  `search_emails`, `send_email`, `mark_read`, `delete_email`
- FastMCP 3.x httpStream transport with stdio fallback
- Universal IMAP/SMTP support (works with Gmail, Outlook, Fastmail, ProtonMail,
  Dovecot, Stalwart, Postfix, and any RFC-compliant IMAP/SMTP server)
- Zod-validated configuration via environment variables
- Pino structured logging (JSON to files + stdout)
- Graceful shutdown on SIGINT/SIGTERM
- Unit tests with vitest (config, mail service, tools)
- ESLint + Prettier for code quality
- GitHub Actions CI (lint + test + build on Node 18, 20, 22)
- Comprehensive README with provider-specific setup notes