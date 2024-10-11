from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from .database import SessionLocal
from .models import User
from .config import settings
import logging

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")




async def get_db():
    async with SessionLocal() as session:
        yield session

async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    logger.info(f"Validating token: {token[:10]}...")
    credentials_exception = HTTPException(
        status_code=401,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            logger.warning("No email in token payload")
            raise credentials_exception
        token_exp = payload.get("exp")
        if token_exp is None or datetime.utcfromtimestamp(token_exp) < datetime.utcnow():
            logger.warning("Token expired")
            raise credentials_exception
    except JWTError as e:
        logger.error(f"JWT error: {str(e)}")
        raise credentials_exception
    user = await db.execute(select(User).filter(User.email == email))
    user = user.scalar_one_or_none()
    if user is None:
        logger.warning(f"No user found for email: {email}")
        raise credentials_exception
    logger.info(f"User authenticated: {email}")
    return user

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt
