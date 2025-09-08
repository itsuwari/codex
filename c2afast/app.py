from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
import httpx
from typing import Optional

from .translate import translate_request


def create_app(expected_token: Optional[str], client: Optional[httpx.AsyncClient] = None) -> FastAPI:
    app = FastAPI()
    http_client = client or httpx.AsyncClient()

    async def _check_auth(request: Request):
        auth = request.headers.get("authorization")
        token = auth[7:] if auth and auth.lower().startswith("bearer ") else None
        if not expected_token or token != expected_token:
            raise HTTPException(status_code=401)

    @app.post("/v1/messages")
    async def messages(request: Request):
        await _check_auth(request)
        body = await request.json()
        anthropic_req = await translate_request(body, http_client)
        upstream = await http_client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "content-type": "application/json",
                "x-api-key": expected_token or "",
                "anthropic-version": "2023-06-01",
            },
            json=anthropic_req,
        )
        data = upstream.json()
        return JSONResponse(data)

    @app.get("/v1/models")
    async def models(request: Request):
        await _check_auth(request)
        return {
            "data": [
                {"id": "claude-3-haiku", "context_length": 200000},
                {"id": "claude-3-sonnet", "context_length": 200000},
                {"id": "claude-3-opus", "context_length": 200000},
            ]
        }

    @app.on_event("shutdown")
    async def shutdown():
        await http_client.aclose()

    return app
