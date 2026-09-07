# Pawdex contributor guide

- Keep the daemon local-first and bind to loopback by default.
- Never expose a raw shell endpoint to remote clients.
- Treat Codex app-server schemas as versioned external contracts.
- Add a state-machine test when introducing a new Codex event mapping.
- Require explicit confirmation for destructive or elevated approvals.
- Keep provider-specific code behind adapters in `apps/daemon/src/codex`.
