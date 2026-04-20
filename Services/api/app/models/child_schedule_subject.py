"""
Child Schedule Subject Model

Responsibility: Stores subjects enabled for each child weekly schedule row.
Layer: Model
Domain: Children
"""

from sqlalchemy import Column, ForeignKey, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base
from models.child_week_schedule import ChildWeekSchedule


class ChildScheduleSubject(Base):
    __tablename__ = "child_schedule_subjects"
    __table_args__ = (
        UniqueConstraint(
            "schedule_id",
            "subject",
            name="uq_child_schedule_subjects_schedule_id_subject",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    schedule_id = Column(
        UUID(as_uuid=True),
        ForeignKey(f"{ChildWeekSchedule.__tablename__}.id", ondelete="CASCADE"),
        nullable=False,
    )
    subject = Column(Text, nullable=False)

    schedule = relationship("ChildWeekSchedule", back_populates="schedule_subjects")