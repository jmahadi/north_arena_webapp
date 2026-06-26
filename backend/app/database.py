from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings
import os

DATABASE_URL = settings.SQLALCHEMY_DATABASE_URI

# asyncpg connect-args. statement_cache_size=0 is required when connecting via
# Supabase's pgbouncer in TRANSACTION mode (which doesn't support prepared
# statements). The current DATABASE_URL points to the session-mode pooler
# (port 5432), which DOES support prepared statements — but Supabase docs still
# recommend disabling the cache here for portability across both pooler modes.
# Keep at 0 unless you switch off the pooler entirely.
connect_args = {"statement_cache_size": 0}

engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",  # Off by default, set SQL_ECHO=true to enable
    connect_args=connect_args,
    pool_size=15,          # Dashboard fans out ~8 concurrent queries; 15 steady connections lets a few users overlap without overflow
    max_overflow=20,       # Burst capacity under spike load
    pool_timeout=10,       # Fail fast instead of hanging requests for 30s when truly saturated
    pool_recycle=1800,     # Recycle connections every 30 min to avoid stale connections
    pool_pre_ping=True,    # Verify connections are alive before using them
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, class_=AsyncSession)
Base = declarative_base()

async def get_db():
    async with SessionLocal() as session:
        yield session