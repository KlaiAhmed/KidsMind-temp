from datetime import datetime, timezone

from sqlalchemy import or_

from core.config import settings
from core.database import SessionLocal
from models.user import User, UserRole
from utils.logger import logger
from utils.manage_pwd import hash_password


def ensure_super_admin_exists() -> None:
    """Create the bootstrap super admin on startup if it doesn't exist."""
    email = settings.SUPER_ADMIN_EMAIL
    username = settings.SUPER_ADMIN_USERNAME
    password = settings.SUPER_ADMIN_PASSWORD

    if not email or not username or not password:
        logger.warning(
            "Super admin bootstrap skipped: SUPER_ADMIN_EMAIL, SUPER_ADMIN_USERNAME, and SUPER_ADMIN_PASSWORD must be set"
        )
        return

    db = SessionLocal()
    try:
        existing_user = (
            db.query(User)
            .filter(or_(User.email == email, User.username == username))
            .first()
        )

        if existing_user:
            updated = False

            if existing_user.email != email:
                existing_user.email = email
                updated = True

            if existing_user.username != username:
                existing_user.username = username
                updated = True

            if existing_user.role != UserRole.ADMIN:
                existing_user.role = UserRole.ADMIN
                updated = True

            if updated:
                db.commit()
                logger.info("Existing bootstrap super admin synchronized with configured credentials")
            else:
                logger.info("Bootstrap super admin already exists")
            return

        super_admin = User(
            email=email,
            username=username,
            hashed_password=hash_password(password),
            role=UserRole.ADMIN,
            is_active=True,
            is_verified=True,
            consent_terms=True,
            consent_data_processing=True,
            consent_given_at=datetime.now(timezone.utc),
        )

        db.add(super_admin)
        db.commit()
        logger.info("Bootstrap super admin created successfully")
    except Exception as error:
        db.rollback()
        logger.error(f"Failed to bootstrap super admin: {error}")
        raise
    finally:
        db.close()
