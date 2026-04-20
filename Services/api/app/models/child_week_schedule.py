"""
Child Week Schedule Model

Responsibility: Stores one weekly time window and duration cap per child day.
Layer: Model
Domain: Children
"""

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, SmallInteger, Time, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class ChildWeekSchedule(Base):
    __tablename__ = "child_week_schedule"
    __table_args__ = (
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="ck_child_week_schedule_day_of_week"),
        CheckConstraint("max_duration_minutes > 0", name="ck_child_week_schedule_max_duration_minutes"),
        UniqueConstraint(
            "child_profile_id",
            "day_of_week",
            name="uq_child_week_schedule_child_profile_id_day_of_week",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    child_profile_id = Column(
        UUID(as_uuid=True),
        ForeignKey("child_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    day_of_week = Column(SmallInteger, nullable=False)
    session_start_time = Column(Time(), nullable=False)
    session_end_time = Column(Time(), nullable=False)
    max_duration_minutes = Column(Integer, nullable=False)
    created_at = Column(DateTime(), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(), server_default=func.now(), onupdate=func.now(), nullable=False)

    schedule_subjects = relationship(
        "ChildScheduleSubject",
        back_populates="schedule",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )