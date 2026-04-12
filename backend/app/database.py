from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings
import os

DATABASE_URL = settings.SQLALCHEMY_DATABASE_URI

# Setting the statement_cache_size to 0 to avoid issues with pgbouncer
connect_args = {"server_settings": {"statement_cache_size": "0"}}

engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",  # Off by default, set SQL_ECHO=true to enable
    pool_size=5,           # Maintain 5 persistent connections
    max_overflow=10,       # Allow up to 10 extra connections under load
    pool_timeout=30,       # Wait 30s for a connection before erroring
    pool_recycle=1800,     # Recycle connections every 30 min to avoid stale connections
    pool_pre_ping=True,    # Verify connections are alive before using them
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=AsyncSession)
Base = declarative_base()

async def get_db():
    async with SessionLocal() as session:
        yield session