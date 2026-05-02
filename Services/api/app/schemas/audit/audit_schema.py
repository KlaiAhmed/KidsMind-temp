"""
Audit Schema

Responsibility: Defines response models for audit log read endpoints.
Layer: Schema
Domain: Audit
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AuditLogEntry(BaseModel):
    action: str
    actor_id: UUID
    target_child_id: UUID | None = None
    detail: str = ""
    timestamp: datetime | None = None


class AuditLogResponse(BaseModel):
    entries: list[AuditLogEntry] = Field(default_factory=list)
    total_count: int = 0
    limit: int = 20
    offset: int = 0
