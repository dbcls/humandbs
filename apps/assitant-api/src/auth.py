"""
Keycloak OIDC Authentication for FastAPI

Validates JWT tokens from Keycloak using the JWKS endpoint,
then checks whether the user's sub is listed in the admin UIDs file.

Environment variables:
  HUMANDBS_AUTH_ISSUER_URL        – Keycloak realm URL (default: staging)
  HUMANDBS_AUTH_CLIENT_ID         – Expected audience (default: humandbs-dev)
  HUMANDBS_BACKEND_ADMIN_UID_FILE – Path to JSON file containing allowed UIDs
                                    (array of strings).  If unset, all
                                    authenticated requests are rejected.
"""

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError, JWTClaimsError

logger = logging.getLogger("auth")

# ---------------------------------------------------------------------------
# Configuration (read at import time; can be overridden by tests via env)
# ---------------------------------------------------------------------------

AUTH_ISSUER_URL: str = os.environ.get(
    "HUMANDBS_AUTH_ISSUER_URL",
    "https://idp-staging.ddbj.nig.ac.jp/realms/master",
)
AUTH_CLIENT_ID: str = os.environ.get("HUMANDBS_AUTH_CLIENT_ID", "humandbs-dev")


def _get_admin_uid_file() -> str | None:
    """Resolve admin UID file path.

    Priority:
      1. HUMANDBS_BACKEND_ADMIN_UID_FILE
      2. monorepo-root/admin_uids.json (local development fallback)
    """
    configured = os.environ.get("HUMANDBS_BACKEND_ADMIN_UID_FILE")
    if configured:
        return configured

    # auth.py -> src -> assitant-api -> apps -> monorepo root
    fallback = Path(__file__).resolve().parents[3] / "admin_uids.json"
    if fallback.exists():
        return str(fallback)

    return None


# ---------------------------------------------------------------------------
# Simple TTL cache
# ---------------------------------------------------------------------------

_JWKS_TTL = 600        # 10 minutes
_ADMIN_UIDS_TTL = 300  # 5 minutes


class _TtlCache:
    def __init__(self, ttl: int) -> None:
        self._ttl = ttl
        self._value: Any = None
        self._expiry: float = 0.0

    def get(self) -> Any:
        if self._value is not None and time.monotonic() < self._expiry:
            return self._value
        return None

    def set(self, value: Any) -> None:
        self._value = value
        self._expiry = time.monotonic() + self._ttl

    def clear(self) -> None:
        self._value = None
        self._expiry = 0.0


_jwks_cache = _TtlCache(_JWKS_TTL)
_admin_uids_cache = _TtlCache(_ADMIN_UIDS_TTL)


# ---------------------------------------------------------------------------
# JWKS helpers
# ---------------------------------------------------------------------------

def _fetch_jwks() -> dict:
    jwks_url = f"{AUTH_ISSUER_URL}/protocol/openid-connect/certs"
    logger.debug("Fetching JWKS from %s", jwks_url)
    with httpx.Client(timeout=10) as client:
        resp = client.get(jwks_url)
        resp.raise_for_status()
        return resp.json()


def _get_jwks() -> dict:
    cached = _jwks_cache.get()
    if cached is not None:
        return cached
    jwks = _fetch_jwks()
    _jwks_cache.set(jwks)
    return jwks


# ---------------------------------------------------------------------------
# Admin UIDs helpers
# ---------------------------------------------------------------------------

def _load_admin_uids() -> list[str]:
    admin_uid_file = _get_admin_uid_file()
    if not admin_uid_file:
        logger.info("HUMANDBS_BACKEND_ADMIN_UID_FILE is not set, no admin users configured")
        return []

    try:
        with open(admin_uid_file, encoding="utf-8") as f:
            parsed = json.load(f)
        if isinstance(parsed, list):
            uids = [uid for uid in parsed if isinstance(uid, str)]
            logger.debug("Loaded %d admin UIDs from %s", len(uids), admin_uid_file)
            return uids
        logger.warning("Admin UID file is not a JSON array, using empty list")
        return []
    except FileNotFoundError:
        logger.info("Admin UID file not found, no admin users configured: %s", admin_uid_file)
        return []
    except Exception:
        logger.exception("Error loading admin UIDs from %s", admin_uid_file)
        return []


def _get_admin_uids() -> list[str]:
    cached = _admin_uids_cache.get()
    if cached is not None:
        return cached
    uids = _load_admin_uids()
    _admin_uids_cache.set(uids)
    return uids


# ---------------------------------------------------------------------------
# JWT verification
# ---------------------------------------------------------------------------

@dataclass
class AuthUser:
    user_id: str
    username: str | None
    email: str | None
    is_admin: bool


def _verify_token(token: str) -> dict | None:
    """Verify a JWT against Keycloak JWKS.  Returns decoded claims or None."""
    def _do_verify(jwks: dict) -> dict:
        return jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            audience=AUTH_CLIENT_ID,
            issuer=AUTH_ISSUER_URL,
            options={"verify_at_hash": False},
        )

    try:
        jwks = _get_jwks()
        return _do_verify(jwks)
    except ExpiredSignatureError:
        logger.warning("JWT token expired")
        return None
    except JWTClaimsError as exc:
        logger.warning("JWT claim validation failed: %s", exc)
        return None
    except JWTError as exc:
        # Signature failure may indicate key rotation – retry once with fresh JWKS
        logger.warning("JWT verification failed (%s), refreshing JWKS and retrying", exc)
        _jwks_cache.clear()
        try:
            jwks = _get_jwks()
            return _do_verify(jwks)
        except ExpiredSignatureError:
            logger.warning("JWT token expired (retry)")
            return None
        except JWTError as retry_exc:
            logger.error("JWT verification failed after JWKS refresh: %s", retry_exc)
            return None
    except Exception:
        logger.exception("Unexpected error during JWT verification")
        return None


def _build_auth_user(claims: dict) -> AuthUser:
    user_id: str = claims["sub"]
    admin_uids = _get_admin_uids()
    is_admin = user_id in admin_uids
    return AuthUser(
        user_id=user_id,
        username=claims.get("preferred_username"),
        email=claims.get("email"),
        is_admin=is_admin,
    )


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

_bearer_scheme = HTTPBearer(auto_error=False)


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthUser:
    """FastAPI dependency: requires a valid JWT whose sub appears in the admin UIDs file.

    Raises:
        401 – no token or invalid/expired token
        403 – valid token but user is not an admin
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = _verify_token(credentials.credentials)
    if claims is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = _build_auth_user(claims)
    if not user.is_admin:
        logger.warning("Forbidden access attempt by user %s", user.user_id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return user
