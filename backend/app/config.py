import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

class Settings:
    # Database Configuration
    DATABASE_URL: str = os.getenv(
        'DATABASE_URL',
        'postgresql+asyncpg://postgres.hayoszgqacaqhauizsmr:northarena2021!@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'
    )

    # Security Configuration
    SECRET_KEY: str = os.getenv('SECRET_KEY', 'CHANGE-THIS-IN-PRODUCTION-INSECURE-DEFAULT-KEY')
    ALGORITHM: str = os.getenv('ALGORITHM', 'HS256')
    # Default 30 days for the admin app — daily-use tool, infrequent re-auth
    # is the desired behavior. Override per-environment via env var.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv('ACCESS_TOKEN_EXPIRE_MINUTES', '43200'))  # 30 days

    # Legacy alias for compatibility
    SQLALCHEMY_DATABASE_URI: str = DATABASE_URL

settings = Settings()



