# Security notes

FinSim handles financial documents, so the safest rule is simple: do not treat the current project as a production banking product without the extra controls listed below.

## What is protected now

- Users authenticate before creating processing jobs.
- Processing jobs are scoped to the signed in user.
- Uploaded statements are checked for PDF extension, supported content type, PDF signature, duplicate content, file size, and monthly continuity.
- Temporary uploaded files are removed after processing finishes.
- Passwords are salted and hashed with PBKDF2 SHA 256.
- Password hash checks use constant time comparison.
- Local databases, raw input folders, output folders, `.env` files, and private data folders are ignored by Git.
- CORS is local only by default and can be configured with `FINSIM_CORS_ORIGINS`.

## Required before a real public deployment

- Use HTTPS only.
- Use a managed private database instead of local SQLite.
- Move raw uploaded PDFs into private object storage with encryption at rest and a short retention policy.
- Add production email verification, password reset, and account deletion.
- Add rate limiting to sign in, sign up, upload, and feedback endpoints.
- Add audit logs that avoid raw descriptions, account numbers, file names, passwords, and tokens.
- Add backups and restore testing for the production database.
- Add dependency scanning in GitHub.
- Add server side request size limits at the proxy or hosting platform.
- Add monitoring for failed jobs, API errors, and unusual upload volume.

## Data handling rule

Never commit real statements, transaction exports, account numbers, API keys, passwords, database files, `.env` files, or raw user documents. Use synthetic or safely redacted fixtures only.

## Reporting a problem

For this academic project, open a private team issue or message the repository owner directly. Do not post real user data in GitHub issues or pull requests.
