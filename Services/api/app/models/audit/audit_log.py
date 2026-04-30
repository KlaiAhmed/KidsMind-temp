"""
Audit Log Model

Responsibility: Defines the AuditLog ORM model and AuditActorRole enum for
persistent audit trail storage.
Layer: Model
Domain: Audit
"""

import enum

from sqlalchemy import Column, DateTime, Enum as SAEnum, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from core.database import Base


class AuditActorRole(str, enum.Enum):
    PARENT = "parent"
    ADMIN = "admin"
    SYSTEM = "system"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))

    actor_id = Column(UUID(as_uuid=True), nullable=False)
    actor_role = Column(
        SAEnum(AuditActorRole, name="audit_actor_role"),
        nullable=False,
    )

    action = Column(String(100), nullable=False)
    resource = Column(String(50), nullable=True)
    resource_id = Column(UUID(as_uuid=True), nullable=True)

    before_state = Column(JSONB, nullable=True)
    after_state = Column(JSONB, nullable=True)

    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_audit_logs_actor_id", "actor_id"),
        Index("ix_audit_logs_resource_id", "resource_id"),
        Index("ix_audit_logs_action", "action"),
        Index("ix_audit_logs_created_at", "created_at"),
    )
