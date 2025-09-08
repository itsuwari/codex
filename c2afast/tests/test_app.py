import json
import pathlib
import sys

import httpx
from fastapi.testclient import TestClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from c2afast.app import create_app


def test_messages_translation():
    captured = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured['body'] = json.loads(request.content.decode())
        return httpx.Response(200, json={"id": "1", "content": [{"type": "text", "text": "ok"}]})

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport)
    app = create_app("secret", client)
    with TestClient(app) as test_client:
        resp = test_client.post(
            "/v1/messages",
            headers={"Authorization": "Bearer secret"},
            json={
                "model": "claude-3-haiku",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": "data:image/png;base64,Zm9v"},
                            }
                        ],
                    }
                ],
            },
        )
    assert resp.status_code == 200
    assert captured["body"] == {
        "model": "claude-3-haiku",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": "Zm9v",
                        },
                    }
                ],
            }
        ],
    }


def test_auth_rejected():
    app = create_app("secret", httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200))))
    with TestClient(app) as test_client:
        resp = test_client.post("/v1/messages")
    assert resp.status_code == 401
