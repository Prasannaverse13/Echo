#!/usr/bin/env python3
"""Set NEXT_PUBLIC_GOOGLE_CLIENT_ID on Vercel production.

Reads the Vercel token from $VERCEL_TOKEN. The project ID is read from
.vercel/project.json so this script works for any Vercel project
without editing.

Usage:
  $env:VERCEL_TOKEN = '...'
  python vercel_set_client.py [--client-id <id>] [--target production|preview|development]

The --client-id flag defaults to the Echo Web Client already wired in
src/components/auth/GoogleButton.tsx (a Google OAuth 2.0 client for
the All Things Agentic hackathon submission). The script is idempotent:
if the env var already exists on the target, it PATCHes the value in place.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_CLIENT_ID = (
    "431018085923-skdv940r6dm240at7l8lf2ei37le8571.apps.googleusercontent.com"
)
KEY = "NEXT_PUBLIC_GOOGLE_CLIENT_ID"


def project_id() -> str:
    cfg = json.loads(Path(".vercel/project.json").read_text(encoding="utf-8"))
    pid = cfg.get("projectId")
    if not pid:
        sys.exit("missing projectId in .vercel/project.json")
    return pid


def req(method: str, url: str, token: str, body: dict | None = None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
    }
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8") or "{}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--client-id", default=os.environ.get("GOOGLE_CLIENT_ID", DEFAULT_CLIENT_ID))
    ap.add_argument("--target", action="append", default=None,
                    help="repeat for multiple; defaults to ['production']")
    args = ap.parse_args()
    targets = args.target or ["production"]

    token = os.environ.get("VERCEL_TOKEN")
    if not token:
        sys.exit("VERCEL_TOKEN env var is required (generate at vercel.com/account/tokens)")

    pid = project_id()
    base = f"https://api.vercel.com/v10/projects/{pid}"

    code, existing = req("GET", base + "/env", token)
    if code != 200:
        print("LIST FAILED", code, existing)
        return 1
    print("Existing envs:", [e.get("key") for e in existing.get("envs", [])])
    current = [e for e in existing.get("envs", []) if e.get("key") == KEY]
    payload = {
        "key": KEY,
        "value": args.client_id,
        "type": "plain",
        "target": targets,
    }
    if current:
        env_id = current[0]["id"]
        code, body = req("PATCH", base + "/env/" + env_id, token, payload)
        action = "UPDATED"
    else:
        code, body = req("POST", base + "/env", token, payload)
        action = "CREATED"
    print(action, "HTTP", code)
    print("env:", json.dumps(body, indent=2)[:500])
    return 0 if code in (200, 201) else 1


if __name__ == "__main__":
    sys.exit(main())
