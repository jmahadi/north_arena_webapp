"""
Quick script to create an admin user with default credentials
Usage: python3 create_admin_user.py
"""
import asyncio
from app.database import SessionLocal
from app.models import User
from sqlalchemy.future import select


async def create_admin():
    """Create admin user with default credentials"""
    # Default credentials
    username = "admin"
    email = "admin@northarena.com"
    password = "admin123"

    async with SessionLocal() as session:
        try:
            # Check if user already exists
            result = await session.execute(select(User).filter(User.email == email))
            existing_user = result.scalar_one_or_none()

            if existing_user:
                print(f"✅ Admin user already exists!")
                print(f"   Email: {email}")
                print(f"   Password: {password}")
                print(f"\nYou can login with these credentials at http://localhost:3000/login")
                return

            # Create new admin user
            new_user = User(
                username=username,
                email=email
            )
            new_user.set_password(password)

            session.add(new_user)
            await session.commit()

            print(f"✅ Admin user created successfully!")
            print(f"   Email: {email}")
            print(f"   Password: {password}")
            print(f"\nYou can now login with these credentials at http://localhost:3000/login")

        except Exception as e:
            await session.rollback()
            print(f"❌ Error creating admin user: {e}")


if __name__ == "__main__":
    print("=" * 50)
    print("Creating Admin User for North Arena")
    print("=" * 50)
    asyncio.run(create_admin())
