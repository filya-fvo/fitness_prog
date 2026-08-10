import asyncio
import uuid

import httpx
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.email_otp import EmailOtpCode
from app.services.email_auth_service import _hash_code

API = "http://127.0.0.1:8001"


async def main() -> None:
    email = f"ux.n.{uuid.uuid4().hex[:6]}@example.com"
    async with httpx.AsyncClient(timeout=40) as c:
        r = await c.post(f"{API}/auth/email/request-code", json={"email": email})
        print("req", r.status_code, r.text[:200])
        settings = get_settings()
        code = "121212"
        async with AsyncSessionLocal() as s:
            row = await s.scalar(
                select(EmailOtpCode)
                .where(EmailOtpCode.email == email)
                .order_by(EmailOtpCode.created_at.desc())
                .limit(1)
            )
            assert row is not None
            row.code_hash = _hash_code(code, settings)
            row.attempts = 0
            row.consumed_at = None
            await s.commit()
        r = await c.post(f"{API}/auth/email/verify", json={"email": email, "code": code})
        print("verify", r.status_code)
        tok = r.json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}
        r = await c.get(f"{API}/nutrition/products", headers=h, params={"q": "овсян", "limit": 5})
        print("products", r.status_code, r.text[:800])
        items = r.json().get("items") or []
        pid = items[0]["id"] if items else None
        print("pid", pid, "item0", items[0] if items else None)
        if pid:
            payload = {"product_id": pid, "quantity_grams": 100, "meal_type": "breakfast"}
            r = await c.post(f"{API}/nutrition/log", headers=h, json=payload)
            print("log1", r.status_code, r.text[:400])
            r = await c.post(
                f"{API}/nutrition/log",
                headers=h,
                json={**payload, "date": "2026-08-07"},
            )
            print("log2", r.status_code, r.text[:400])
        r = await c.put(
            f"{API}/notifications/water",
            headers=h,
            json={"ml": 250, "mode": "add"},
        )
        print("water", r.status_code, r.text[:200])
        r = await c.get(f"{API}/nutrition/daily", headers=h)
        print("daily", r.status_code, r.text[:300])


if __name__ == "__main__":
    asyncio.run(main())
