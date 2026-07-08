"""SQLite-backed account foundation for the local FinSim API."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DEFAULT_DB_PATH = Path("processing_api/data/finsim_local.db")
PASSWORD_ITERATIONS = 260_000
LOGIN_CODE_MINUTES = 10


class AccountError(ValueError):
    """Raised when an account request cannot be completed."""


class AuthError(PermissionError):
    """Raised when credentials or session tokens are invalid."""


@dataclass(frozen=True, slots=True)
class AccountUser:
    user_id: str
    full_name: str
    email: str
    email_verified: bool
    theme: str
    monthly_email: bool
    created_at: str

    def as_dict(self) -> dict[str, object]:
        return {
            "user_id": self.user_id,
            "full_name": self.full_name,
            "email": self.email,
            "email_verified": self.email_verified,
            "theme": self.theme,
            "monthly_email": self.monthly_email,
            "created_at": self.created_at,
        }


class AccountService:
    """Small account store that gives the local MVP a real persistence base."""

    def __init__(self, db_path: Path | None = None) -> None:
        configured = os.environ.get("FINSIM_ACCOUNT_DB")
        self.db_path = Path(configured) if configured else db_path or DEFAULT_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def signup(self, full_name: str, email: str, password: str) -> dict[str, object]:
        name = _clean_name(full_name)
        normalized_email = _clean_email(email)
        _validate_password(password)
        user_id = secrets.token_hex(16)
        verification_token = secrets.token_urlsafe(32)
        salt = secrets.token_hex(16)
        password_hash = _hash_password(password, salt)
        now = _now()

        try:
            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO users (
                        user_id, full_name, email, password_hash, password_salt,
                        email_verified, verification_token, theme, monthly_email, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, 0, ?, 'system', 1, ?, ?)
                    """,
                    (
                        user_id,
                        name,
                        normalized_email,
                        password_hash,
                        salt,
                        verification_token,
                        now,
                        now,
                    ),
                )
        except sqlite3.IntegrityError as error:
            raise AccountError("An account already exists for this email address") from error

        user = self._get_user_by_id(user_id)
        return {
            "user": user.as_dict(),
            "verification_token": verification_token,
            "message": "Verification token generated for local development.",
        }

    def verify_email(self, token: str) -> AccountUser:
        cleaned = token.strip()
        if not cleaned:
            raise AccountError("Verification token is required")
        with self._connect() as connection:
            row = connection.execute(
                "SELECT user_id FROM users WHERE verification_token = ?",
                (cleaned,),
            ).fetchone()
            if row is None:
                raise AccountError("Verification token is invalid or expired")
            connection.execute(
                """
                UPDATE users
                SET email_verified = 1, verification_token = NULL, updated_at = ?
                WHERE user_id = ?
                """,
                (_now(), row["user_id"]),
            )
        return self._get_user_by_id(row["user_id"])

    def signin(self, email: str, password: str) -> dict[str, object]:
        normalized_email = _clean_email(email)
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE email = ?",
                (normalized_email,),
            ).fetchone()
            if row is None or not hmac.compare_digest(
                _hash_password(password, row["password_salt"]),
                row["password_hash"],
            ):
                raise AuthError("Email or password is incorrect")
            if not bool(row["email_verified"]):
                raise AuthError("Email must be verified before signing in")

            session_token = self._start_session(connection, row["user_id"])
        return {"session_token": session_token, "user": self._row_to_user(row).as_dict()}

    def request_signin_code(self, email: str, password: str) -> dict[str, object]:
        normalized_email = _clean_email(email)
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE email = ?",
                (normalized_email,),
            ).fetchone()
            if row is None or not hmac.compare_digest(
                _hash_password(password, row["password_salt"]),
                row["password_hash"],
            ):
                raise AuthError("Email or password is incorrect")
            if not bool(row["email_verified"]):
                raise AuthError("Email must be verified before signing in")

            challenge_id = secrets.token_urlsafe(24)
            code = f"{secrets.randbelow(1_000_000):06d}"
            connection.execute(
                """
                INSERT INTO login_challenges (challenge_id, user_id, code_hash, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    challenge_id,
                    row["user_id"],
                    _hash_code(code),
                    _future(minutes=LOGIN_CODE_MINUTES),
                    _now(),
                ),
            )
        return {
            "login_challenge_id": challenge_id,
            "verification_code": code,
            "message": "Verification code sent to email.",
        }

    def verify_signin_code(self, challenge_id: str, code: str) -> dict[str, object]:
        cleaned_challenge = challenge_id.strip()
        cleaned_code = "".join(character for character in code.strip() if character.isdigit())
        if not cleaned_challenge or len(cleaned_code) != 6:
            raise AuthError("A valid six digit verification code is required")

        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT login_challenges.*, users.*
                FROM login_challenges
                JOIN users ON users.user_id = login_challenges.user_id
                WHERE login_challenges.challenge_id = ?
                """,
                (cleaned_challenge,),
            ).fetchone()
            if row is None:
                raise AuthError("Verification code is invalid or expired")
            if _parse_time(row["expires_at"]) < datetime.now(timezone.utc):
                connection.execute("DELETE FROM login_challenges WHERE challenge_id = ?", (cleaned_challenge,))
                raise AuthError("Verification code is invalid or expired")
            if not hmac.compare_digest(_hash_code(cleaned_code), row["code_hash"]):
                raise AuthError("Verification code is incorrect")

            connection.execute("DELETE FROM login_challenges WHERE challenge_id = ?", (cleaned_challenge,))
            session_token = self._start_session(connection, row["user_id"])
        return {"session_token": session_token, "user": self._row_to_user(row).as_dict()}

    def signout(self, session_token: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "DELETE FROM sessions WHERE session_token = ?",
                (session_token.strip(),),
            )

    def get_user_for_session(self, session_token: str) -> AccountUser:
        token = session_token.strip()
        if not token:
            raise AuthError("Session token is required")
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT users.*
                FROM sessions
                JOIN users ON users.user_id = sessions.user_id
                WHERE sessions.session_token = ?
                """,
                (token,),
            ).fetchone()
        if row is None:
            raise AuthError("Session is invalid or expired")
        return self._row_to_user(row)

    def update_settings(
        self,
        session_token: str,
        *,
        full_name: str | None = None,
        theme: str | None = None,
        monthly_email: bool | None = None,
    ) -> AccountUser:
        user = self.get_user_for_session(session_token)
        updates: dict[str, Any] = {"updated_at": _now()}
        if full_name is not None:
            updates["full_name"] = _clean_name(full_name)
        if theme is not None:
            if theme not in {"system", "light", "dark"}:
                raise AccountError("Theme must be system, light, or dark")
            updates["theme"] = theme
        if monthly_email is not None:
            updates["monthly_email"] = 1 if monthly_email else 0

        assignments = ", ".join(f"{column} = ?" for column in updates)
        values = list(updates.values()) + [user.user_id]
        with self._connect() as connection:
            connection.execute(
                f"UPDATE users SET {assignments} WHERE user_id = ?",
                values,
            )
        return self._get_user_by_id(user.user_id)

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    user_id TEXT PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    email_verified INTEGER NOT NULL DEFAULT 0,
                    verification_token TEXT UNIQUE,
                    theme TEXT NOT NULL DEFAULT 'system',
                    monthly_email INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS login_challenges (
                    challenge_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    code_hash TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                )
                """
            )

    def _get_user_by_id(self, user_id: str) -> AccountUser:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        if row is None:
            raise AuthError("Account was not found")
        return self._row_to_user(row)

    def _start_session(self, connection: sqlite3.Connection, user_id: str) -> str:
        session_token = secrets.token_urlsafe(32)
        connection.execute(
            """
            INSERT INTO sessions (session_token, user_id, created_at)
            VALUES (?, ?, ?)
            """,
            (session_token, user_id, _now()),
        )
        return session_token

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    @staticmethod
    def _row_to_user(row: sqlite3.Row) -> AccountUser:
        return AccountUser(
            user_id=row["user_id"],
            full_name=row["full_name"],
            email=row["email"],
            email_verified=bool(row["email_verified"]),
            theme=row["theme"],
            monthly_email=bool(row["monthly_email"]),
            created_at=row["created_at"],
        )


def bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("Bearer session token is required")
    return authorization[7:].strip()


def _clean_email(email: str) -> str:
    cleaned = email.strip().lower()
    if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
        raise AccountError("A valid email address is required")
    return cleaned


def _clean_name(full_name: str) -> str:
    cleaned = " ".join(full_name.strip().split())
    if len(cleaned) < 2:
        raise AccountError("Full name is required")
    return cleaned


def _validate_password(password: str) -> None:
    if len(password) < 8:
        raise AccountError("Password must be at least 8 characters")


def _hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_ITERATIONS,
    )
    return digest.hex()


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _future(*, minutes: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def _parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
