import json
import os
from pathlib import Path


def read_access_token() -> str | None:
    """Load access token from auth.json, mirroring the TypeScript proxy."""
    codex_home = os.environ.get("CODEX_HOME", Path.home() / ".config" / "codex")
    auth_path = Path(codex_home) / "auth.json"
    try:
        with auth_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("tokens", {}).get("access_token")
    except Exception:
        return None
