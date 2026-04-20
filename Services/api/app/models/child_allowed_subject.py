"""
Child Allowed Subject Model

Responsibility: Stores explicitly allowed subjects per child profile.
Layer: Model
Domain: Children
"""

from sqlalchemy import Column, ForeignKey, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID

from core.database import Base


class ChildAllowedSubject(Base):
    __tablename__ = "child_allowed_subjects"
    __table_args__ = (
        UniqueConstraint(
            "child_profile_id",
            "subject",
            name="uq_child_allowed_subjects_child_profile_id_subject",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    child_profile_id = Column(
        UUID(as_uuid=True),
        ForeignKey("child_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    subject = Column(Text, nullable=False)