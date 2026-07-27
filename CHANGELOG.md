# Changelog

## [1.2.2] - 2026-07-27

### Fixed
- **CRITICAL: `read_email`, `reply_email`, `mark_read`, `delete_email` broken since v1.2.0**
- Root cause: commit `0db9f57` removed the 3rd `{uid: true}` arg from `fetchOne()`, `messageFlagsSet()`, and `messageDelete()`
- Without `{uid: true}`, imapflow interprets the 1st arg as a **sequence number**, not a UID. Any UID > message count returns NULL → "Email not found"
- Fix: restore `{uid: true}` in all 3 methods (readEmail, replyEmail, markRead, deleteEmail)
- 3 unit tests updated to match the correct imapflow call signatures

### Verified live
- Deployed on Stalwart (admin@veridy.ca) — all 9 tools tested via httpStream
- `read_email UID 60` returns full body (was returning "Email not found")
- `reply_email` sends with correct `In-Reply-To` + `References` headers

## [1.2.1] - 2026-07-27 (BROKEN — superseded by 1.2.2)

### Broken
- Removed `{uid: true}` from fetchOne/flagsSet — broke read_email, reply_email, mark_read, delete_email

## [1.2.0] - 2026-07-27

### Added
- `send_email` gains `is_html` (send HTML body) and `preview` (validate without sending) params
- `read_email` gains `full` param (default: false = preview, true = full body)
- `reply_email` tool (reads original by UID, sends reply with `In-Reply-To`/`References`/`Re:` threading)
- `truncated` flag emitted when preview mode truncates body
- Bumped to 82 unit tests

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