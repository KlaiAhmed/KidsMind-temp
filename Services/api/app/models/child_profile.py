from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer, JSON, String, func

from core.database import Base
from utils.child_profile_logic import EducationStage


class ChildProfile(Base):
    __tablename__ = "child_profiles"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    nickname = Column(String(64), nullable=False)
    birth_date = Column(Date, nullable=False)
    education_stage = Column(Enum(EducationStage, name="education_stage"), nullable=False)
    is_accelerated = Column(Boolean, nullable=False)
    languages = Column(JSON, nullable=False)
    avatar = Column(String(64), nullable=True)
    settings_json = Column(JSON, nullable=False, default=dict)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
