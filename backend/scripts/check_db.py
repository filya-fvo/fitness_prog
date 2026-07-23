import asyncio
from sqlalchemy import text
from app.core.database import engine

async def main() -> None:
    async with engine.connect() as conn:
        tables = await conn.execute(
            text(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema = 'public'"
            )
        )
        users = await conn.execute(text("SELECT count(*) FROM users"))
        print("tables", tables.scalar())
        print("users", users.scalar())
        print("DB_CONNECT_OK")

asyncio.run(main())
