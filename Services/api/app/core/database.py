from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from core.config import settings


# Format: postgresql://[user]:[password]@[service_name]:[port]/[db_name]
SQLALCHEMY_DATABASE_URL = f"postgresql://{settings.DB_USERNAME}:{settings.DB_PASSWORD}@database:5432/{settings.DB_NAME}"

# Create the SQLAlchemy engine
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# Create a session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def init_db() -> None:
	"""Initialize database schema for local/dev environments."""
	import models.user  # noqa: F401
	import models.child_profile  # noqa: F401
	import models.refresh_token_session  # noqa: F401

	Base.metadata.create_all(bind=engine)