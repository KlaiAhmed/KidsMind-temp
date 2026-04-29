"""
Bootstrap Admin Service

Responsibility: Handles super admin initialization during application startup.
Layer: Service
Domain: Auth / Admin
"""

from sqlalchemy import or_
from sqlalchemy.exc import ProgrammingError

from core.config import settings
from core.database import SessionLocal
from models.user import User, UserRole
from utils.manage_pwd import hash_password
from utils.logger import logger


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
        try:
            existing_user = (
                db.query(User)
                .filter(or_(User.email == email, User.username == username))
                .first()
            )
        except ProgrammingError as exc:
            db.rollback()
            logger.exception(
                "Schema drift detected during super admin bootstrap. Run 'alembic upgrade head' from services/api before starting the server."
            )
            raise RuntimeError(
                "Schema drift detected in users table. Run 'alembic upgrade head' from services/api before starting the server."
            ) from exc

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
            consent_terms=True,
            # REMOVED: is_verified dropped in migration 20260422_01
            # REMOVED: consent_data_processing dropped in migration 20260422_01
            # REMOVED: consent_given_at dropped in migration 20260422_01
        )

        db.add(super_admin)
        db.commit()
        logger.info("Bootstrap super admin created successfully")
    except Exception:
        db.rollback()
        logger.exception(
            "Failed to bootstrap super admin during startup",
            extra={"email": email, "username": username},
        )
        raise
    finally:
        db.close()
