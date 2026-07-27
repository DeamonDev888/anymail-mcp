# Contributing

Thanks for your interest in contributing!

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/anymail-mcp.git
cd anymail-mcp
npm install
```

## Before submitting a PR

```bash
npm run lint
npm test
npm run build
```

All three must pass.

## Guidelines

- Keep `src/` clean: separate concerns (config, logger, service, tools).
- All new tools must have tests in `tests/`.
- No secrets, no hard-coded hosts/users in the source code.
- Use TypeScript strict mode (already configured).
- Follow the existing code style (ESLint + Prettier).

## Adding a provider example

Provider setup notes belong in the README, not in code. To add an example:

1. Edit `README.md` → "Provider notes" section.
2. Add a `.env.example` snippet for your provider.
3. Open a PR with a clear description.

## Reporting bugs

Use GitHub issues. Include:

- anymail-mcp version (`npm list anymail-mcp` or check the running version)
- Node.js version (`node --version`)
- Mail provider (Gmail, Outlook, self-hosted, etc.)
- Relevant logs (set `LOG_LEVEL=debug` first)
- Reproduction steps

## Security issues

Email security is critical. **Do not open public issues for security
vulnerabilities.** Email the maintainer directly (see your fork for contact
info).