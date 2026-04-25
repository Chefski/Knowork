# Security Policy

## Reporting a vulnerability

If you find a security issue, please **do not** open a public GitHub issue.

Email the maintainer at **patryk@chef.ski** with a description of the issue, the steps to reproduce, and (if possible) a suggested fix.

You can expect:

- An acknowledgement within 72 hours.
- A coordinated disclosure timeline if the issue is confirmed.
- Public credit (if you want it) when the fix ships.

## Scope

This project is intended to be self-hosted. Treat the room code as the only secret in the v0 design — anyone with the code can read and write that room. For stronger guarantees, place the service behind an authenticating reverse proxy (oauth2-proxy, Cloudflare Access, Tailscale).

The following are **not** considered vulnerabilities for v0:

- Lack of native SSO/OIDC (use a reverse proxy)
- Room enumeration via brute-forcing 6-character codes (mitigated by per-IP rate limits; documented as a known trait)
- A self-hoster running the service on the public internet without TLS (the operator is responsible for terminating TLS)

These may be revisited in future versions.
