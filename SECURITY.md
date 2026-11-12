# Security policy

## Supported version

Security fixes are applied to the latest commit on the default branch.

## Reporting a vulnerability

Please report suspected credential exposure, authentication bypasses, or other
security issues privately to the repository owner. Do not open a public issue
that contains an API key, database URL, access token, private user data, or a
working exploit.

Include the affected commit, the smallest reproducible example, and the impact
you observed. Remove or redact all real credentials from logs and screenshots.

## Credential handling

- Keep real values in `.env.local` or the deployment's secret manager.
- Never expose server credentials through `NEXT_PUBLIC_`, `VITE_`, URLs, or
  browser bundles.
- If a key is accidentally committed or shared, revoke and rotate it before
  attempting to remove it from Git history.
- Use the deterministic mock provider when testing code that does not require
  a live entitlement.

This project is research software and does not execute trades.
