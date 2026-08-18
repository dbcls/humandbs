import json

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import src.auth as auth


def test_load_admin_uids_filters_non_strings(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    admin_file = tmp_path / "admin_uids.json"
    admin_file.write_text(json.dumps(["uid-1", 123, "uid-2", None]), encoding="utf-8")

    monkeypatch.setenv("HUMANDBS_BACKEND_ADMIN_UID_FILE", str(admin_file))
    auth._admin_uids_cache.clear()

    assert auth._load_admin_uids() == ["uid-1", "uid-2"]


def test_load_admin_uids_returns_empty_list_when_file_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("HUMANDBS_BACKEND_ADMIN_UID_FILE", "/tmp/does-not-exist.json")
    auth._admin_uids_cache.clear()

    assert auth._load_admin_uids() == []


def test_require_admin_rejects_missing_credentials() -> None:
    with pytest.raises(HTTPException) as exc_info:
        auth.require_admin(None)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Authentication required"


def test_require_admin_rejects_invalid_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_verify_token", lambda token: None)

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="bad-token")

    with pytest.raises(HTTPException) as exc_info:
        auth.require_admin(credentials)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid or expired token"


def test_require_admin_rejects_non_admin_user(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_verify_token", lambda token: {"sub": "user-1", "preferred_username": "user"})
    monkeypatch.setattr(auth, "_get_admin_uids", lambda: ["admin-1"])

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")

    with pytest.raises(HTTPException) as exc_info:
        auth.require_admin(credentials)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Admin access required"


def test_require_admin_returns_auth_user_for_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth,
        "_verify_token",
        lambda token: {
            "sub": "admin-1",
            "preferred_username": "admin-user",
            "email": "admin@example.com",
        },
    )
    monkeypatch.setattr(auth, "_get_admin_uids", lambda: ["admin-1"])

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid-token")
    user = auth.require_admin(credentials)

    assert user.user_id == "admin-1"
    assert user.username == "admin-user"
    assert user.email == "admin@example.com"
    assert user.is_admin is True