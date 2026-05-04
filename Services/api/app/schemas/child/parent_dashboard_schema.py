"""
Parent Dashboard Schemas

Responsibility: Defines response schemas for parent dashboard endpoints.
Layer: Schema
Domain: Parent Dashboard
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ParentOverviewStats(BaseModel):
    total_sessions: int = 0
    total_messages: int = 0
    total_exercises_completed: int = 0
    total_xp: int = 0
    streak_days: int = 0
    flagged_message_count: int = 0
    last_active_at: datetime | None = None


class ParentOverviewResponse(BaseModel):
    child_id: UUID
    child_nickname: str
    child_xp: int = 0
    child_level: int = 1
    stats: ParentOverviewStats


class DailyUsagePoint(BaseModel):
    date: str
    sessions: int = 0
    messages: int = 0
    xp_gained: int = 0


class SubjectMasteryItem(BaseModel):
    subject: str
    sessions: int = 0
    messages: int = 0
    xp: int = 0


class WeeklyInsight(BaseModel):
    summary: str = ""
    top_subject: str | None = None
    engagement_level: str = "low"


class SessionMetadata(BaseModel):
    session_id: UUID
    started_at: datetime | None = None
    ended_at: datetime | None = None
    message_count: int = 0
    has_flagged_content: bool = False
    flagged_message_count: int = 0
    last_flagged_at: datetime | None = None
    subjects: list[str] = Field(default_factory=list)


class ParentProgressResponse(BaseModel):
    child_id: UUID
    daily_usage: list[DailyUsagePoint] = Field(default_factory=list)
    subject_mastery: list[SubjectMasteryItem] = Field(default_factory=list)
    weekly_insight: WeeklyInsight = Field(default_factory=lambda: WeeklyInsight())
    recent_sessions: list[SessionMetadata] = Field(default_factory=list)


class ParentHistorySession(BaseModel):
    session_id: UUID
    started_at: datetime | None = None
    ended_at: datetime | None = None
    message_count: int = 0
    has_flagged_content: bool = False
    flagged_message_count: int = 0
    last_flagged_at: datetime | None = None
    last_message_at: datetime | None = None
    preview: str = ""


class ParentHistoryResponse(BaseModel):
    child_id: UUID
    sessions: list[ParentHistorySession] = Field(default_factory=list)
    total_count: int = 0
    limit: int = 20
    offset: int = 0
    has_more: bool = False


class BulkDeleteRequest(BaseModel):
    session_ids: list[UUID] = Field(default_factory=list)


class BulkDeleteResponse(BaseModel):
    deleted_count: int = 0
    not_found_count: int = 0


class HistoryExportResponse(BaseModel):
    child_id: UUID
    export_format: str = "json"
    download_url: str | None = None
    total_sessions: int = 0
    total_messages: int = 0


class ChildPauseResponse(BaseModel):
    child_id: UUID
    is_paused: bool = False


class NotificationPrefsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    daily_summary_enabled: bool = True
    safety_alerts_enabled: bool = True
    weekly_report_enabled: bool = True
    session_start_enabled: bool = False
    session_end_enabled: bool = False
    streak_milestone_enabled: bool = True
    email_channel: bool = True
    push_channel: bool = False


class NotificationPrefsUpdate(BaseModel):
    daily_summary_enabled: bool | None = None
    safety_alerts_enabled: bool | None = None
    weekly_report_enabled: bool | None = None
    session_start_enabled: bool | None = None
    session_end_enabled: bool | None = None
    streak_milestone_enabled: bool | None = None
    email_channel: bool | None = None
    push_channel: bool | None = None


from schemas.audit.audit_schema import AuditLogEntry as ControlAuditEntry
from schemas.audit.audit_schema import AuditLogResponse as ControlAuditResponse
