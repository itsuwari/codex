# Authentication Schema

This document describes how `auth.json` is used to authenticate Codex with OpenAI services.

## File Location

The authentication file is stored at `$CODEX_HOME/auth.json`.

## Schema

```json
{
  "OPENAI_API_KEY": "<optional string>",
  "tokens": {
    "id_token": "<JWT string>",
    "access_token": "<JWT string>",
    "refresh_token": "<string>",
    "account_id": "<optional string>"
  },
  "last_refresh": "<RFC3339 timestamp>"
}
```

### Field Details

- `OPENAI_API_KEY` – optional API key used when authenticating via the traditional OpenAI API key flow.
- `tokens` – optional object containing tokens for ChatGPT authentication:
  - `id_token` – ID token parsed to obtain email and plan information.
  - `access_token` – token used for authenticated requests.
  - `refresh_token` – token used to obtain new credentials.
  - `account_id` – optional account identifier.
- `last_refresh` – optional time when tokens were last refreshed.

## Token Refresh Flow

When tokens are present and near expiration, Codex sends a refresh request:

```http
POST https://auth.openai.com/oauth/token
Content-Type: application/json
{
  "client_id": "app_EMoamEEZ73f0CkXaXp7hrann",
  "grant_type": "refresh_token",
  "refresh_token": "<refresh token>",
  "scope": "openid profile email"
}
```

The response includes new `id_token`, `access_token`, and `refresh_token` values which are written back to `auth.json` alongside an updated `last_refresh` timestamp.

## Environment Fallback

If `auth.json` is missing, Codex falls back to the `OPENAI_API_KEY` environment variable for API key authentication.

