from app.core.database import AsyncSessionLocal
from app.services.android_login import cleanup_login


async def cleanup_android_login_task(ctx):
    async with AsyncSessionLocal() as session:
        await cleanup_login(session)
