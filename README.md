# imap-smtp-mcp

**Connect ANY mailbox to ANY AI agent.** Expose Gmail, Outlook, Apple Mail
(iCloud), Fastmail, ProtonMail, Yahoo, and every self-hosted server as
[Model Context Protocol](https://modelcontextprotocol.io/) tools, so any
MCP-compatible agent (Claude Desktop, Hermes, your own scripts) can read,
search, send, and manage email.

```
┌──────────────────┐  httpStream + SSE  ┌──────────────────┐  IMAP   ┌────────────┐
│  MCP client      │ ──────────────────►│ imap-smtp-mcp    │ ───────►│ Mail       │
│  (Claude,        │                    │ (this server)    │         │ server     │
│   Hermes, etc.)  │                    │                  │  SMTP   │ (any)      │
└──────────────────┘                    └──────────────────┘ ───────►└────────────┘
```

## ✨ Features

- **8 MCP tools**: `server_info`, `list_mailboxes`, `list_emails`,
  `read_email`, `search_emails`, `send_email`, `mark_read`, `delete_email`.
- **Universal**: works with any IMAP/SMTP server (Gmail, Outlook, Fastmail,
  ProtonMail, Dovecot, Stalwart, Postfix, etc.).
- **Transport**: FastMCP 3.x with `httpStream` (per-session, server-sent events)
  and `stdio` (for desktop integration).
- **Production-ready**: graceful shutdown, persistent connections, structured
  logging, error handling.
- **No secrets in code**: configuration via environment variables only.

## 📦 Installation

### Prerequisites

- Node.js ≥ 18
- An IMAP/SMTP-enabled mailbox
- For Gmail/Yahoo/Microsoft: an **app password** (not your account password).
  See provider-specific notes below.

### From npm (once published)

```bash
npm install -g imap-smtp-mcp
imap-smtp-mcp
```

### From source

```bash
git clone https://github.com/YOUR_USERNAME/imap-smtp-mcp.git
cd imap-smtp-mcp
npm install
npm run build
npm start
```

### Development mode (with hot reload)

```bash
npm run dev
```

## ⚙️ Configuration

All configuration is via environment variables. Create a `.env` file or
export them in your shell / systemd unit.

### Required

| Variable | Description |
|---|---|
| `IMAP_HOST` | IMAP server hostname (e.g. `imap.gmail.com`) |
| `IMAP_USER` | IMAP username (often your full email address) |
| `IMAP_PASS` | IMAP password or app password |
| `SMTP_HOST` | SMTP server hostname (often same as IMAP host) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password or app password |

### Optional

| Variable | Default | Description |
|---|---|---|
| `IMAP_PORT` | `993` | IMAP port (993 for SSL, 143 for STARTTLS) |
| `IMAP_SECURE` | `true` | Use TLS (set `false` for STARTTLS or plaintext) |
| `IMAP_REJECT_UNAUTHORIZED` | `false` | Reject invalid TLS certs (set `true` for production) |
| `SMTP_PORT` | `465` | SMTP port (465 for SSL, 587 for STARTTLS) |
| `SMTP_SECURE` | `true` | Use TLS |
| `SMTP_REJECT_UNAUTHORIZED` | `false` | Reject invalid TLS certs |
| `SMTP_FROM` | `SMTP_USER` | "From" address (if different from SMTP_USER) |
| `FASTMCP_TRANSPORT` | `httpStream` | `httpStream` or `stdio` |
| `FASTMCP_PORT` | `3143` | HTTP port (only for httpStream) |
| `FASTMCP_HOST` | `0.0.0.0` | Bind address (use `127.0.0.1` for local-only) |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `LOG_DIR` | `./logs` | Directory for log files |

### Example `.env`

```dotenv
IMAP_HOST=imap.gmail.com
IMAP_USER=you@gmail.com
IMAP_PASS=abcd efgh ijkl mnop
IMAP_PORT=993
IMAP_SECURE=true
IMAP_REJECT_UNAUTHORIZED=true

SMTP_HOST=smtp.gmail.com
SMTP_USER=you@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
SMTP_PORT=465
SMTP_SECURE=true

FASTMCP_TRANSPORT=httpStream
FASTMCP_PORT=3143
FASTMCP_HOST=0.0.0.0

LOG_LEVEL=info
LOG_DIR=/var/log/imap-smtp-mcp
```

## 🚀 Usage

### As a daemon (recommended)

Once configured, just run:

```bash
imap-smtp-mcp
# [INFO] HTTP Stream listening on http://0.0.0.0:3143/mcp
```

### With systemd

```ini
# /etc/systemd/system/imap-smtp-mcp.service
[Unit]
Description=IMAP/SMTP MCP Server
After=network.target

[Service]
Type=simple
User=imap-smtp
EnvironmentFile=/etc/imap-smtp-mcp.env
ExecStart=/usr/bin/node /opt/imap-smtp-mcp/dist/index.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/imap-smtp-mcp/mcp.log
StandardError=append:/var/log/imap-smtp-mcp/mcp.err.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now imap-smtp-mcp
systemctl status imap-smtp-mcp
```

### With Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY dist ./dist
ENV NODE_ENV=production
EXPOSE 3143
CMD ["node", "dist/index.js"]
```

```bash
docker run -d --name imap-smtp-mcp \
  -p 3143:3143 \
  --env-file ./.env \
  imap-smtp-mcp:latest
```

### As an MCP client (Claude Code, etc.)

```json
{
  "mcpServers": {
    "mail": {
      "url": "http://localhost:3143/mcp"
    }
  }
}
```

For a remote server, replace `localhost` with the host:

```json
{
  "mcpServers": {
    "mail": {
      "url": "http://localhost:3143/mcp"
    }
  }
}
```

### As stdio (alternative)

If you prefer stdio transport (one process per session, e.g. for local desktop):

```json
{
  "mcpServers": {
    "mail": {
      "command": "node",
      "args": ["/path/to/imap-smtp-mcp/dist/index.js"],
      "env": {
        "FASTMCP_TRANSPORT": "stdio",
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_USER": "you@gmail.com",
        "IMAP_PASS": "..."
      }
    }
  }
}
```

## 🧰 Tools reference

### `server_info`

Returns IMAP/SMTP server details and inbox counts.

```json
{
  "user": "you@example.com",
  "imap": "imap.example.com:993",
  "smtp": "smtp.example.com:465",
  "inbox_total": 42,
  "inbox_unread": 7
}
```

### `list_mailboxes`

Lists all mailboxes with message counts.

```json
[
  { "name": "INBOX", "total": 42, "unread": 7 },
  { "name": "Sent", "total": 15, "unread": 0 },
  { "name": "Drafts", "total": 0, "unread": 0 }
]
```

### `list_emails`

Lists emails in a mailbox.

| Param | Type | Default | Description |
|---|---|---|---|
| `mailbox` | string | `INBOX` | Mailbox name |
| `limit` | number | `20` | Max results (1-500) |
| `unread_only` | boolean | `false` | Only return unread emails |

```json
[
  {
    "uid": 1234,
    "subject": "Hello",
    "from": "alice@example.com",
    "to": "you@example.com",
    "date": "2026-07-25T18:00:00.000Z",
    "flags": ["\\Seen"],
    "preview": "First 200 chars of body..."
  }
]
```

### `read_email`

Reads a full email by UID.

| Param | Type | Description |
|---|---|---|
| `uid` | number | Email UID (from `list_emails`) |
| `mailbox` | string | Mailbox name (default `INBOX`) |

Returns the email with full body. `body` is parsed as `text/plain` from the MIME source.

### `search_emails`

Searches emails by keyword (matches body text).

| Param | Type | Default | Description |
|---|---|---|---|
| `query` | string | (required) | Keyword |
| `mailbox` | string | `INBOX` | Mailbox |
| `limit` | number | `20` | Max results |

### `send_email`

Sends an email via SMTP.

| Param | Type | Description |
|---|---|---|
| `to` | string | Recipient address |
| `subject` | string | Subject line |
| `body` | string | Plain-text body |

Returns `{ status: "sent", to, subject, messageId }`.

### `mark_read`

Marks an email as read or unread.

| Param | Type | Default | Description |
|---|---|---|---|
| `uid` | number | (required) | Email UID |
| `mailbox` | string | `INBOX` | Mailbox |
| `read` | boolean | `true` | `true`=read, `false`=unread |

### `delete_email`

Marks an email as deleted and expunges it. **Permanent.**

| Param | Type | Default | Description |
|---|---|---|---|
| `uid` | number | (required) | Email UID |
| `mailbox` | string | `INBOX` | Mailbox |

## 📧 Provider notes

### Gmail

1. Enable 2FA on your Google account
2. Create an [app password](https://myaccount.google.com/apppasswords)
3. Use the app password as `IMAP_PASS` / `SMTP_PASS`

```dotenv
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
```

### Outlook / Microsoft 365 / Hotmail / Live

1. Enable 2FA on your Microsoft account
2. Create an app password via Microsoft account security
3. `IMAP_USER` should be your full email address

```dotenv
IMAP_HOST=outlook.office365.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false    # STARTTLS, not implicit TLS
```

### Apple iCloud / Apple Mail / me.com / mac.com

1. Enable 2FA on your Apple Account
2. Generate an app-specific password at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords
3. Use your full iCloud email and the app-specific password

```dotenv
IMAP_HOST=imap.mail.me.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.mail.me.com
SMTP_PORT=587
SMTP_SECURE=false    # STARTTLS
```

### Fastmail

```dotenv
IMAP_HOST=imap.fastmail.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.fastmail.com
SMTP_PORT=465
SMTP_SECURE=true
```

### ProtonMail Bridge

Run [ProtonMail Bridge](https://proton.me/mail/bridge) locally, then:

```dotenv
IMAP_HOST=127.0.0.1
IMAP_PORT=1143
IMAP_SECURE=false
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
SMTP_SECURE=false
IMAP_USER=your-bridge-username
IMAP_PASS=your-bridge-password
```

### Yahoo Mail / AOL

```dotenv
IMAP_HOST=imap.mail.yahoo.com
SMTP_HOST=smtp.mail.yahoo.com
```

Generate an app password in Yahoo Account Security.

### Zoho Mail

```dotenv
IMAP_HOST=imap.zoho.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_SECURE=true
```

### Self-hosted (Dovecot, Stalwart, Postfix, Mailcow, etc.)

For self-hosted mail servers with self-signed certificates:

```dotenv
IMAP_REJECT_UNAUTHORIZED=false
SMTP_REJECT_UNAUTHORIZED=false
```

For production with valid certificates (Let's Encrypt), set both to `true`.

## 🛠️ Development

### Scripts

```bash
npm run build       # Compile TypeScript to dist/
npm run dev         # Watch mode with tsx
npm run lint        # ESLint
npm test            # Run unit tests (vitest)
npm run test:watch  # Tests in watch mode
npm run format      # Prettier
```

### Project layout

```
src/
  index.ts         # Entry point
  config.ts        # Env loading + Zod validation
  logger.ts        # Pino logger setup
  mail-service.ts  # IMAP/SMTP operations
  tools.ts         # MCP tool definitions
tests/
  config.test.ts   # Config validation tests
  mail-service.test.ts  # MailService with mocks
  tools.test.ts    # Tool registration + dispatch
.github/
  workflows/
    ci.yml         # Lint + test + build on Node 18/20/22
```

### Adding a new tool

1. Add a method to `MailService` (in `src/mail-service.ts`).
2. Register the tool in `registerMailTools` (in `src/tools.ts`).
3. Add a test in `tests/tools.test.ts`.

## 🔒 Security

- **No secrets in code.** All credentials come from environment variables.
- **Use app passwords**, not account passwords, for Gmail/Outlook/Yahoo.
- For production, set `IMAP_REJECT_UNAUTHORIZED=true` and
  `SMTP_REJECT_UNAUTHORIZED=true` with valid certificates.
- Bind `FASTMCP_HOST=127.0.0.1` if the MCP client runs on the same host.
- For remote access, place behind a reverse proxy (nginx) with TLS.

## 📜 License

MIT — see [LICENSE](./LICENSE).

## 🤝 Contributing

Issues and pull requests welcome. Please run `npm run lint && npm test` before
submitting.