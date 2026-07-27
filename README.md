# anymail-mcp

**Connect ANY mailbox to ANY AI agent.** Expose Gmail, Outlook, Apple Mail
(iCloud), Fastmail, ProtonMail, Yahoo, and every self-hosted server (Stalwart,
Dovecot, Postfix, Mailcow) as [Model Context Protocol](https://modelcontextprotocol.io)
tools, so any MCP-compatible agent (Claude Desktop, Hermes, your own scripts)
can read, search, send, reply to, and manage email.

**9 tools** · **82 unit tests** · **HTTP/MCP daemon** (no stdio zombies) · **MIT**

```
┌──────────────────┐  HTTP + SSE       ┌──────────────────┐  IMAP   ┌────────────┐
│  MCP client      │ ────────────────► │  anymail-mcp     │ ───────►│ Mail       │
│  (Claude,        │                   │  (HTTP daemon)   │         │ server     │
│   Hermes, etc.)  │ ◄──────────────── │  :3143/mcp       │  SMTP   │ (any)      │
└──────────────────┘  Server-Sent Eve  └──────────────────┘ ───────►└────────────┘
```

## Why httpStream (not stdio)?

This server defaults to **httpStream** — a persistent HTTP daemon that speaks
MCP over Server-Sent Events. Unlike `stdio` (one process per client session),
httpStream is:

- **A single daemon** serving multiple clients — no zombie processes piling up
- **Always warm** — IMAP/SMTP connections stay alive between requests
- **Network-accessible** — any machine on your LAN (or via reverse proxy) can
  connect to the same instance
- **systemd-friendly** — runs as a managed service, restarts on crash

Use `stdio` only for single-user desktop apps (Claude Desktop local integration).

---

## 📦 Install

### Option A — npm (fastest)

```bash
npm install -g anymail-mcp
```

Then create a config file and start:

```bash
# Create config
cat > ~/.anymail-mcp.env << 'EOF'
IMAP_HOST=imap.gmail.com
IMAP_USER=you@gmail.com
IMAP_PASS=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
EOF

# Start the daemon (reads .env from cwd or ~/.anymail-mcp.env)
anymail-mcp
# → [INFO] HTTP Stream listening on http://0.0.0.0:3143/mcp
```

### Option B — From source

```bash
git clone https://github.com/DeamonDev888/anymail-mcp.git
cd anymail-mcp
npm install
npm run build       # TypeScript → dist/
cp .env.example .env
# Edit .env with your IMAP/SMTP credentials
npm start
# → [INFO] HTTP Stream listening on http://0.0.0.0:3143/mcp
```

### Option C — systemd daemon (production)

```bash
# Clone + build
git clone https://github.com/DeamonDev888/anymail-mcp.git /opt/anymail-mcp
cd /opt/anymail-mcp
npm install && npm run build

# Config
cp .env.example .env
nano .env  # fill in credentials

# Create systemd service
cat > /etc/systemd/system/anymail-mcp.service << 'EOF'
[Unit]
Description=anymail-mcp — IMAP/SMTP MCP Server
After=network.target

[Service]
Type=simple
User=mail
WorkingDirectory=/opt/anymail-mcp
EnvironmentFile=/opt/anymail-mcp/.env
ExecStart=/usr/bin/node /opt/anymail-mcp/dist/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now anymail-mcp
systemctl status anymail-mcp
```

### The `anymail-mcp` bin helper

When installed via `npm install -g`, the package ships a CLI helper
(`dist/index.js` with `#!/usr/bin/env node` shebang) registered as:

```
$ anymail-mcp
```

It loads `.env` from the current working directory (or from
`~/.anymail-mcp.env`), validates config, and starts the HTTP daemon on
`:3143/mcp`. Use `FASTMCP_TRANSPORT=stdio` env var to switch to stdio mode
for desktop integrations.

---

## 🔌 Connect your MCP client

Once the daemon is running on `http://localhost:3143/mcp`, add it to any
MCP-compatible client config:

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "mail": {
      "url": "http://localhost:3143/mcp"
    }
  }
}
```

### Hermes Agent

In `config.yaml`:

```yaml
mcp:
  mail:
    url: "http://localhost:3143/mcp"
```

### Remote server

Replace `localhost` with your server hostname:

```json
{
  "mcpServers": {
    "mail": {
      "url": "http://mail.myserver.com:3143/mcp"
    }
  }
}
```

---

## ⚙️ Configuration

All configuration is via environment variables (`.env` file or shell exports).

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
| `IMAP_PORT` | `993` | IMAP port (993 = SSL, 143 = STARTTLS) |
| `IMAP_SECURE` | `true` | Use implicit TLS |
| `IMAP_REJECT_UNAUTHORIZED` | `false` | Reject invalid TLS certs (set `true` in prod) |
| `SMTP_PORT` | `465` | SMTP port (465 = SSL, 587 = STARTTLS) |
| `SMTP_SECURE` | `true` | Use implicit TLS |
| `SMTP_REJECT_UNAUTHORIZED` | `false` | Reject invalid TLS certs |
| `SMTP_FROM` | `SMTP_USER` | Override "From" address (aliases) |
| `FASTMCP_TRANSPORT` | `httpStream` | `httpStream` or `stdio` |
| `FASTMCP_PORT` | `3143` | HTTP port (httpStream mode) |
| `FASTMCP_HOST` | `0.0.0.0` | Bind address (`127.0.0.1` = local only) |
| `LOG_LEVEL` | `info` | `fatal` `error` `warn` `info` `debug` `trace` |
| `LOG_DIR` | `./logs` | Log file directory |

### Security (optional, opt-in)

| Variable | Default | Description |
|---|---|---|
| `AUTH_TOKEN` | _(none)_ | Bearer token for HTTP transport auth |
| `ALLOWED_DOMAINS` | _(all)_ | Comma-separated recipient domain allowlist |
| `REDACT_LOGS` | `true` | Mask emails + passwords in logs |

### Example `.env`

```dotenv
IMAP_HOST=imap.gmail.com
IMAP_USER=you@gmail.com
IMAP_PASS=abcd efgh ijkl mnop
IMAP_PORT=993
IMAP_SECURE=true

SMTP_HOST=smtp.gmail.com
SMTP_USER=you@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
SMTP_PORT=465
SMTP_SECURE=true

FASTMCP_TRANSPORT=httpStream
FASTMCP_PORT=3143
FASTMCP_HOST=0.0.0.0

LOG_LEVEL=info
```

---

## 🧰 Tools (9)

| Tool | Description |
|---|---|
| `server_info` | Server details + inbox message counts |
| `list_mailboxes` | List all mailboxes (INBOX, Sent, Drafts, Junk...) |
| `list_emails` | List emails with subject, from, date, preview |
| `read_email` | Read full email body by UID |
| `search_emails` | Search by keyword (subject/from/to/body) |
| `send_email` | Send plain-text or HTML email via SMTP |
| `reply_email` | Reply to a thread (In-Reply-To + References) |
| `mark_read` | Toggle \Seen flag (read/unread) |
| `delete_email` | Delete email (flag + expunge) |

<details>
<summary>📋 Detailed tool reference</summary>

### `list_emails`

| Param | Type | Default | Description |
|---|---|---|---|
| `mailbox` | string | `INBOX` | Mailbox name |
| `limit` | number | `20` | Max results (1–500) |
| `unread_only` | boolean | `false` | Only unread |

Returns: `[{ uid, subject, from, to, date, flags, preview }]`

### `read_email`

| Param | Type | Default | Description |
|---|---|---|---|
| `uid` | number | _(required)_ | Email UID from `list_emails` |
| `mailbox` | string | `INBOX` | Mailbox name |
| `full` | boolean | `false` | `false` = preview (first 200 chars), `true` = full body |

Returns: `{ uid, subject, from, to, date, flags, preview, body, truncated? }`

### `search_emails`

| Param | Type | Default | Description |
|---|---|---|---|
| `query` | string | _(required)_ | Keyword |
| `mailbox` | string | `INBOX` | Mailbox |
| `limit` | number | `20` | Max results |

### `send_email`

| Param | Type | Default | Description |
|---|---|---|---|
| `to` | string | _(required)_ | Recipient |
| `subject` | string | _(required)_ | Subject line |
| `body` | string | _(required)_ | Email body (plain text or HTML) |
| `is_html` | boolean | `false` | Treat body as HTML |
| `preview` | boolean | `false` | Validate payload without sending |

Returns: `{ status: "sent", to, subject, messageId, sizeBytes }`

### `reply_email`

| Param | Type | Default | Description |
|---|---|---|---|
| `uid` | number | _(required)_ | UID of email to reply to |
| `body` | string | _(required)_ | Reply body (plain text) |
| `mailbox` | string | `INBOX` | Mailbox containing original |

Reads the original email, extracts Message-ID + From + Subject, then sends a
reply with proper threading headers (`In-Reply-To`, `References`) and `Re:`
prefix.

Returns: `{ status: "sent", to, subject, messageId, inReplyTo }`

### `mark_read` / `delete_email`

| Param | Type | Default | Description |
|---|---|---|---|
| `uid` | number | _(required)_ | Email UID |
| `mailbox` | string | `INBOX` | Mailbox |
| `read` | boolean | `true` | (mark_read only) `true`=read, `false`=unread |

</details>

---

## 📧 Provider quick-start

<details>
<summary><b>Gmail</b></summary>

1. Enable 2FA → [Google Account Security](https://myaccount.google.com/security)
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
</details>

<details>
<summary><b>Outlook / Microsoft 365 / Hotmail</b></summary>

1. Enable 2FA on your Microsoft account
2. Create an app password via Microsoft account security

```dotenv
IMAP_HOST=outlook.office365.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
```
</details>

<details>
<summary><b>Apple iCloud / me.com / mac.com</b></summary>

1. Enable 2FA on your Apple Account
2. Generate an app-specific password at [appleid.apple.com](https://appleid.apple.com)
   → Sign-In and Security → App-Specific Passwords

```dotenv
IMAP_HOST=imap.mail.me.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.mail.me.com
SMTP_PORT=587
SMTP_SECURE=false
```
</details>

<details>
<summary><b>Fastmail</b></summary>

```dotenv
IMAP_HOST=imap.fastmail.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.fastmail.com
SMTP_PORT=465
SMTP_SECURE=true
```
</details>

<details>
<summary><b>ProtonMail Bridge</b></summary>

Requires [ProtonMail Bridge](https://proton.me/mail/bridge) running locally:

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
</details>

<details>
<summary><b>Yahoo / AOL</b></summary>

Generate an app password in Yahoo Account Security.

```dotenv
IMAP_HOST=imap.mail.yahoo.com
SMTP_HOST=smtp.mail.yahoo.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_PORT=465
SMTP_SECURE=true
```
</details>

<details>
<summary><b>Zoho Mail</b></summary>

```dotenv
IMAP_HOST=imap.zoho.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_SECURE=true
```
</details>

<details>
<summary><b>Self-hosted (Stalwart, Dovecot, Postfix, Mailcow)</b></summary>

For self-signed certificates:

```dotenv
IMAP_REJECT_UNAUTHORIZED=false
SMTP_REJECT_UNAUTHORIZED=false
```

For valid Let's Encrypt certs in production:

```dotenv
IMAP_REJECT_UNAUTHORIZED=true
SMTP_REJECT_UNAUTHORIZED=true
```
</details>

---

## 🛠️ Development

```bash
npm run build       # TypeScript → dist/
npm run dev         # Watch mode (tsx watch)
npm run lint        # ESLint
npm test            # Unit tests (vitest)
npm run test:watch  # Tests in watch mode
npm run format      # Prettier
```

### Project layout

```
src/
  index.ts         # Entry point — FastMCP server setup
  config.ts        # Env loading + Zod validation
  logger.ts        # Pino logger
  mail-service.ts  # IMAP/SMTP operations (ImapFlow + nodemailer)
  tools.ts         # 9 MCP tool definitions (Zod schemas)
  security.ts      # Input sanitization + allowlist enforcement
tests/
  *.test.ts        # 82 unit tests
dist/              # Compiled output (gitignored)
```

### Adding a new tool

1. Add a method to `MailService` in `src/mail-service.ts`
2. Register the tool in `registerMailTools()` in `src/tools.ts`
3. Add tests in `tests/`

---

## 🔒 Security

- **No secrets in code** — all credentials come from environment variables
- **Use app passwords** for Gmail/Outlook/Yahoo (never your account password)
- Set `IMAP_REJECT_UNAUTHORIZED=true` in production with valid certs
- Bind `FASTMCP_HOST=127.0.0.1` if the client runs on the same host
- For remote access, use a reverse proxy (nginx) with TLS termination
- `AUTH_TOKEN` enables Bearer authentication for HTTP transport
- `ALLOWED_DOMAINS` restricts who can receive emails via `send_email`
- `REDACT_LOGS=true` masks emails + passwords in structured logs

---

## 📜 License

MIT — see [LICENSE](./LICENSE).

## 🤝 Contributing

Issues and PRs welcome at [github.com/DeamonDev888/anymail-mcp](https://github.com/DeamonDev888/anymail-mcp).
Please run `npm run lint && npm test` before submitting.
