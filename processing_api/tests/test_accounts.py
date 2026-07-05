from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from finsim_api.accounts import AccountService
from finsim_api.app import create_app
from finsim_api.service import ProcessingService


class AccountApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = tempfile.TemporaryDirectory()
        account_service = AccountService(Path(self.folder.name) / "accounts.db")
        self.client_context = TestClient(
            create_app(
                ProcessingService(),
                account_service=account_service,
            )
        )
        self.client = self.client_context.__enter__()

    def tearDown(self) -> None:
        self.client_context.__exit__(None, None, None)
        self.folder.cleanup()

    def test_signup_verify_signin_and_current_account(self) -> None:
        signup = self.client.post(
            "/api/accounts/signup",
            json={
                "full_name": "Test User",
                "email": "mohammad@example.com",
                "password": "securepass123",
            },
        )
        self.assertEqual(signup.status_code, 201)
        token = signup.json()["verification_token"]
        self.assertFalse(signup.json()["user"]["email_verified"])

        blocked = self.client.post(
            "/api/accounts/signin",
            json={"email": "mohammad@example.com", "password": "securepass123"},
        )
        self.assertEqual(blocked.status_code, 401)
        self.assertIn("verified", blocked.json()["detail"])

        verified = self.client.post("/api/accounts/verify-email", json={"token": token})
        self.assertEqual(verified.status_code, 200)
        self.assertTrue(verified.json()["user"]["email_verified"])

        signin = self.client.post(
            "/api/accounts/signin",
            json={"email": "mohammad@example.com", "password": "securepass123"},
        )
        self.assertEqual(signin.status_code, 200)
        session = signin.json()["session_token"]

        current = self.client.get(
            "/api/accounts/me",
            headers={"Authorization": f"Bearer {session}"},
        )
        self.assertEqual(current.status_code, 200)
        self.assertEqual(current.json()["user"]["email"], "mohammad@example.com")

    def test_duplicate_email_and_short_password_are_rejected(self) -> None:
        weak = self.client.post(
            "/api/accounts/signup",
            json={
                "full_name": "Mo",
                "email": "mo@example.com",
                "password": "short",
            },
        )
        self.assertEqual(weak.status_code, 422)

        first = self.client.post(
            "/api/accounts/signup",
            json={
                "full_name": "Test User",
                "email": "same@example.com",
                "password": "securepass123",
            },
        )
        duplicate = self.client.post(
            "/api/accounts/signup",
            json={
                "full_name": "Test User",
                "email": "same@example.com",
                "password": "securepass123",
            },
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("already exists", duplicate.json()["detail"])

    def test_settings_update_and_signout_require_a_session(self) -> None:
        signup = self.client.post(
            "/api/accounts/signup",
            json={
                "full_name": "Test User",
                "email": "settings@example.com",
                "password": "securepass123",
            },
        ).json()
        self.client.post("/api/accounts/verify-email", json={"token": signup["verification_token"]})
        session = self.client.post(
            "/api/accounts/signin",
            json={"email": "settings@example.com", "password": "securepass123"},
        ).json()["session_token"]

        missing = self.client.patch("/api/accounts/settings", json={"theme": "dark"})
        self.assertEqual(missing.status_code, 401)

        updated = self.client.patch(
            "/api/accounts/settings",
            json={"full_name": "Updated User", "theme": "dark", "monthly_email": False},
            headers={"Authorization": f"Bearer {session}"},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["user"]["full_name"], "Updated User")
        self.assertEqual(updated.json()["user"]["theme"], "dark")
        self.assertFalse(updated.json()["user"]["monthly_email"])

        signed_out = self.client.post(
            "/api/accounts/signout",
            headers={"Authorization": f"Bearer {session}"},
        )
        self.assertEqual(signed_out.status_code, 204)
        current = self.client.get(
            "/api/accounts/me",
            headers={"Authorization": f"Bearer {session}"},
        )
        self.assertEqual(current.status_code, 401)


if __name__ == "__main__":
    unittest.main()
