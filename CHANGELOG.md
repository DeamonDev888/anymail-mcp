# Changelog

## [1.1.0] - 2026-07-27

### Renamed
- `imap-smtp-mcp` → **`anymail-mcp`** (cleaner branding, more memorable)
- New npm package: https://www.npmjs.com/package/anymail-mcp
- New GitHub repo: https://github.com/DeamonDev888/anymail-mcp

### Added
- **38 security tests** (`tests/security.test.ts`): email validation, CRLF injection, IMAP injection, password redaction, allowlist enforcement
- `src/security.ts` module: `isValidEmail`, `isRecipientAllowed`, `sanitizeHeader`, `sanitizeBody`, `sanitizeSearchQuery`, `isValidMailboxName`, `redactEmail`, `redactSecret`
- Optional `ALLOWED_DOMAINS` env var (recipient allowlist for `send_email`)
- Optional `REDACT_LOGS=true` env var (masks emails + passwords in logs)
- Optional `AUTH_TOKEN` env var (Bearer auth for HTTP transport)
- New keywords in package.json: `gmail`, `outlook`, `icloud`, `fastmail`, `protonmail`, `yahoo`, `anymail`

### Changed
- **81 unit tests** (up from 29), all passing
- Description expanded to list supported providers explicitly
- Repository + bugs + homepage links point to the new GitHub repo
- Bumped to v1.1.0

## [1.0.0] - 2026-07-25

### Added
- Initial public release as `imap-smtp-mcp`
- 8 MCP tools: `server_info`, `list_mailboxes`, `list_emails`, `read_email`, `search_emails`, `send_email`, `mark_read`, `delete_email`
- FastMCP 3.x with `httpStream` transport
- imapflow + nodemailer for universal IMAP/SMTP support
- 29 unit tests
- GitHub Actions CI (Node 18 / 20 / 22, lint + test + build)
- README, CONTRIBUTING, LICENSE (MIT), .env.example