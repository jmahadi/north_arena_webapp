import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import SQLAlchemyError
from .database import engine, Base
from .routes import router as api_router
from .config import settings

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="North Arena Booking System", version="1.0.0")

# Configure CORS - use environment variable for production frontend URL
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(api_router)


# Health check endpoint for Railway
@app.get("/")
async def health_check():
    return {"status": "healthy", "service": "North Arena Booking System"}


@app.on_event("startup")
async def startup_event():
    """
    Function that runs on application startup.
    It tries to create database tables if they don't exist.
    """
    try:
        async with engine.begin() as conn:
            # Create tables if they don't exist, but don't update existing ones
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables checked/created successfully")
    except SQLAlchemyError as e:
        logger.error(f"An error occurred while creating database tables: {e}")
        # In a production environment, you might want to exit the app here
        # import sys
        # sys.exit(1)



@app.on_event("shutdown")
async def shutdown_event():
    """
    Function that runs on application shutdown.
    Close any open connections or perform cleanup here.
    """
    await engine.dispose()
    logger.info("Application shutting down, connections closed.")

    

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",  # Allows connections from all network interfaces
        port=8000,
        reload=True,  # Enable auto-reload for development
        log_level="info"
    )