"""
Access Window Model

Responsibility: Stores one weekly access window and daily cap per child day.
Layer: Model
Domain: Children
"""

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, SmallInteger, Time, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class AccessWindow(Base):
    __tablename__ = "access_windows"
    __table_args__ = (
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_access_windows_day_of_week"),
        CheckConstraint("daily_cap_seconds > 0", name="ck_access_windows_daily_cap_seconds"),
        UniqueConstraint(
            "child_profile_id",
            "day_of_week",
            name="uq_access_windows_child_profile_id_day_of_week",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    child_profile_id = Column(
        UUID(as_uuid=True),
        ForeignKey("child_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    day_of_week = Column(SmallInteger, nullable=False)
    access_window_start = Column(Time(), nullable=False)
    access_window_end = Column(Time(), nullable=False)
    daily_cap_seconds = Column(Integer, nullable=False)
    created_at = Column(DateTime(), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(), server_default=func.now(), onupdate=func.now(), nullable=False)

    child_profile = relationship("ChildProfile", back_populates="access_windows")
    subjects = relationship(
        "AccessWindowSubject",
        back_populates="access_window",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    chat_sessions = relationship("ChatSession", back_populates="access_window", passive_deletes=True)
