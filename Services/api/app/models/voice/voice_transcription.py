from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, String, Text, func, text as sql_text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from core.database import Base


class VoiceTranscription(Base):
    __tablename__ = "voice_transcriptions"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid4,
        server_default=sql_text("gen_random_uuid()"),
    )
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    child_id = Column(
        UUID(as_uuid=True),
        ForeignKey("child_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transcription_id = Column(String(255), nullable=False)
    text = Column(Text, nullable=False)
    language = Column(String(10), nullable=True)
    duration_seconds = Column(Float, nullable=True)
    audio_stored = Column(Boolean, nullable=False, default=False, server_default=sql_text("false"))
    minio_object_key = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    session = relationship("ChatSession")
    child_profile = relationship("ChildProfile")
