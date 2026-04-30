"""
Access Window Subject Model

Responsibility: Stores subjects enabled for each child access window row.
Layer: Model
Domain: Children
"""

from sqlalchemy import Column, ForeignKey, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class AccessWindowSubject(Base):
    __tablename__ = "access_window_subjects"
    __table_args__ = (
        UniqueConstraint(
            "access_window_id",
            "subject",
            name="uq_access_window_subjects_access_window_id_subject",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    access_window_id = Column(
        UUID(as_uuid=True),
        ForeignKey("access_windows.id", ondelete="CASCADE"),
        nullable=False,
    )
    subject = Column(Text, nullable=False)

    access_window = relationship("AccessWindow", back_populates="subjects")
