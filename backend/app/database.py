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