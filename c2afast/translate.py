import base64
import re
from typing import Any, Dict, List

import httpx


def _data_url_to_media_and_data(url: str) -> tuple[str, str]:
    match = re.match(r"data:(.*?);base64,(.*)", url)
    if not match:
        raise ValueError("invalid data URL")
    return match.group(1), match.group(2)


async def translate_request(body: Dict[str, Any], client: httpx.AsyncClient) -> Dict[str, Any]:
    messages: List[Dict[str, Any]] = []
    for msg in body.get("messages", []):
        parts: List[Dict[str, Any]] = []
        content = msg.get("content")
        if isinstance(content, str):
            parts.append({"type": "text", "text": content})
        else:
            for part in content:
                if isinstance(part, str):
                    parts.append({"type": "text", "text": part})
                else:
                    if part.get("type") == "text":
                        parts.append({"type": "text", "text": part.get("text", "")})
                    elif part.get("type") == "image_url":
                        url = part.get("image_url")
                        if isinstance(url, dict):
                            url = url.get("url")
                        if not isinstance(url, str):
                            raise ValueError("image_url missing url")
                        if url.startswith("data:"):
                            media_type, data = _data_url_to_media_and_data(url)
                        else:
                            resp = await client.get(url)
                            resp.raise_for_status()
                            media_type = resp.headers.get("content-type", "image/png")
                            data = base64.b64encode(resp.content).decode()
                        parts.append(
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": data,
                                },
                            }
                        )
                    else:
                        raise ValueError("unsupported content part")
        messages.append({"role": msg.get("role"), "content": parts})
    result: Dict[str, Any] = {"model": body.get("model"), "messages": messages}
    if "max_tokens" in body:
        result["max_tokens"] = body["max_tokens"]
    return result
