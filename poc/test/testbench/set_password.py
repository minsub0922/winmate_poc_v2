"""계정 바꾸기 — 비밀번호는 PBKDF2 해시로만 auth.json 에 저장한다.

  .venv/bin/python set_password.py            # 아이디 · 비밀번호를 물어본다
"""
import base64
import getpass
import hashlib
import json
import os
from pathlib import Path

user = input("아이디 [admin]: ").strip() or "admin"
pw = getpass.getpass("새 비밀번호: ")
if len(pw) < 8 or pw != getpass.getpass("한 번 더: "):
    raise SystemExit("8자 이상이고 두 번 같아야 합니다")
salt, it = os.urandom(16), 240000
h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, it)
(Path(__file__).parent / "auth.json").write_text(json.dumps({"username": user, "algo": "pbkdf2_sha256", "iterations": it,
                                                             "salt": base64.b64encode(salt).decode(), "hash": base64.b64encode(h).decode()}, indent=1))
print("바꿨습니다 — 이미 로그인한 세션은 그대로 유지됩니다(.secret 을 지우면 모두 로그아웃)")
