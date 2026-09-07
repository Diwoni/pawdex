# Security Policy

Pawdex is currently a planning-stage project with a non-production feasibility spike. There is no supported production release yet. Do not expose the spike daemon to a LAN or the public internet, and do not use it to approve elevated or destructive actions.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Use [GitHub private vulnerability reporting](https://github.com/Diwoni/pawdex/security/advisories/new) and include:

- affected commit or release;
- reproduction steps or a minimal proof of concept;
- expected impact and required attacker access;
- whether credentials, source code, or user changes may have been exposed;
- any suggested mitigation, if known.

Avoid accessing data that is not yours while testing. The maintainers will use the private advisory to coordinate validation, remediation, credit, and disclosure.

## Security boundaries

The normative threat model and release gates are in [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md). In particular, a P0 Pawdex daemon must expose only local IPC or loopback listeners, must not expose a raw shell or generic App Server pass-through endpoint, and must require explicit authenticated UI confirmation for elevated or destructive approvals.
