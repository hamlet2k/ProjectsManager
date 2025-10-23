# Security & Configuration Rules

- Never commit `.env`, `credentials.json`, or token-related files.
- Always access configuration values via `os.getenv` with safe defaults.
- Do not print GitHub tokens or secrets to logs or migration output.
- When re-encrypting tokens after `SECRET_KEY` rotation, create a migration or management command.
