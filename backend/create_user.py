"""
Script to create a new user in the database
Usage: python create_user.py
"""
import asyncio
import sys
from app.database import SessionLocal
from app.models import User
from sqlalchemy.future import select


async def create_user(username: str, email: str, password: str):
    """Create a new user with the given credentials"""
    async with SessionLocal() as session:
        try:
            # Check if user already exists
            result = await session.execute(select(User).filter(User.email == email))
            existing_user = result.scalar_one_or_none()

            if existing_user:
                print(f"❌ User with email '{email}' already exists!")
                return False

            # Create new user
            new_user = User(
                username=username,
                email=email
            )
            new_user.set_password(password)

            session.add(new_user)
            await session.commit()

            print(f"✅ User created successfully!")
            print(f"   Username: {username}")
            print(f"   Email: {email}")
            print(f"   Password: {password}")
            print(f"\nYou can now login with these credentials at http://localhost:3000/login")
            return True

        except Exception as e:
            await session.rollback()
            print(f"❌ Error creating user: {e}")
            return False


async def main():
    print("=" * 50)
    print("Create New User for North Arena Booking System")
    print("=" * 50)

    # Get user input
    print("\nEnter new user details:")
    username = input("Username: ").strip()
    email = input("Email: ").strip()
    password = input("Password: ").strip()

    if not username or not email or not password:
        print("❌ All fields are required!")
        sys.exit(1)

    print("\nCreating user...")
    success = await create_user(username, email, password)

    if not success:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
