# OpenAI API vs Anthropic API

| Feature | OpenAI (oaiapi) | Anthropic (antapi) |
| --- | --- | --- |
| Endpoint | `/v1/chat/completions` | `/v1/messages` |
| Auth Header | `Authorization: Bearer <key>` | `x-api-key: <key>` + `anthropic-version` |
| Text Message | `content: "text"` | `content: [{ type: "text", text: "text" }]` |
| Image Message | `{ type: "image_url", image_url: { url } }` or `{ type: "image_base64", image_base64: { data } }` | `{ type: "image", source: { type: "base64", media_type, data } }` |
| Stop Sequences | `stop` (string or array) | `stop_sequences` (array) |
| Streaming | `stream: true` | `stream: true` |
| Model Info | `GET /v1/models` (lists ids) | `GET /v1/models` (includes `context_length`) |
