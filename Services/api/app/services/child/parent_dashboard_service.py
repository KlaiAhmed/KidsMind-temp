"""
Parent Dashboard Service

Responsibility: Implements business logic for parent dashboard data aggregation.
Layer: Service
Domain: Parent Dashboard
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from models.audit.audit_log import AuditLog
from models.child.child_profile import ChildProfile
from models.chat.chat_session import ChatSession
from models.chat.chat_history import ChatHistory
from models.gamification.notification_prefs import ParentNotificationPrefs
from schemas.audit.audit_schema import AuditLogEntry, AuditLogResponse
from schemas.child.parent_dashboard_schema import (
    BulkDeleteResponse,
    DailyUsagePoint,
    HistoryExportResponse,
    ChildPauseResponse,
    NotificationPrefsRead,
    NotificationPrefsUpdate,
    ParentHistoryResponse,
    ParentHistorySession,
    ParentOverviewResponse,
    ParentOverviewStats,
    ParentProgressResponse,
    SessionMetadata,
    SubjectMasteryItem,
    WeeklyInsight,
)
from services.audit.service import build_detail


class ParentDashboardService:
    def __init__(self, db: Session):
        self.db = db

    def _require_child_for_parent(self, child_id: UUID, parent_id: UUID) -> ChildProfile:
        child = self.db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
        if not child:
            raise HTTPException(status_code=404, detail="Child profile not found")
        if child.parent_id != parent_id:
            raise HTTPException(status_code=403, detail="Access denied")
        return child

    def get_overview(self, child_id: UUID, parent_id: UUID) -> ParentOverviewResponse:
        child = self._require_child_for_parent(child_id, parent_id)
        xp = int(child.xp or 0)
        level = (xp // 100) + 1

        session_stats = (
            self.db.query(
                func.count(ChatSession.id).label("total_sessions"),
                func.max(ChatSession.started_at).label("last_active_at"),
            )
            .filter(ChatSession.child_profile_id == child_id)
            .first()
        )

        total_sessions = int(session_stats.total_sessions or 0)
        last_active_at = session_stats.last_active_at

        total_messages = (
            self.db.query(func.count(ChatHistory.id))
            .join(ChatSession, ChatHistory.session_id == ChatSession.id)
            .filter(ChatSession.child_profile_id == child_id)
            .scalar() or 0
        )

        flagged_count = (
            self.db.query(func.count(ChatHistory.id))
            .join(ChatSession, ChatHistory.session_id == ChatSession.id)
            .filter(
                ChatSession.child_profile_id == child_id,
                ChatHistory.is_flagged.is_(True),
            )
            .scalar() or 0
        )

        streak = self._compute_streak(child_id)

        return ParentOverviewResponse(
            child_id=child.id,
            child_nickname=child.nickname,
            child_xp=xp,
            child_level=level,
            stats=ParentOverviewStats(
                total_sessions=total_sessions,
                total_messages=int(total_messages),
                total_exercises_completed=0,
                total_xp=xp,
                streak_days=streak,
                flagged_message_count=flagged_count,
                last_active_at=last_active_at,
            ),
        )

    def get_progress(self, child_id: UUID, parent_id: UUID) -> ParentProgressResponse:
        child = self._require_child_for_parent(child_id, parent_id)

        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

        if self.db.bind.dialect.name == "postgresql":
            daily_usage = self._get_daily_usage_postgresql(child_id)
        else:
            daily_usage = self._get_daily_usage_sqlite(child_id)

        recent_sessions_rows = (
            self.db.query(ChatSession)
            .filter(
                ChatSession.child_profile_id == child_id,
                ChatSession.started_at >= seven_days_ago,
            )
            .order_by(ChatSession.started_at.desc())
            .limit(10)
            .all()
        )

        session_ids = [s.id for s in recent_sessions_rows]
        msg_count_rows = (
            self.db.query(
                ChatHistory.session_id,
                func.count(ChatHistory.id).label("msg_count"),
            )
            .filter(ChatHistory.session_id.in_(session_ids))
            .group_by(ChatHistory.session_id)
            .all()
        )
        count_map = {row.session_id: int(row.msg_count) for row in msg_count_rows}

        flagged_rows = (
            self.db.query(
                ChatHistory.session_id,
                func.count(ChatHistory.id).label("flagged_count"),
                func.max(ChatHistory.created_at).label("last_flagged_at"),
            )
            .filter(
                ChatHistory.session_id.in_(session_ids),
                ChatHistory.is_flagged.is_(True),
            )
            .group_by(ChatHistory.session_id)
            .all()
        )
        flagged_map = {
            row.session_id: {
                "flagged_count": int(row.flagged_count or 0),
                "last_flagged_at": row.last_flagged_at,
            }
            for row in flagged_rows
        }

        recent_sessions = [
            SessionMetadata(
                session_id=s.id,
                started_at=s.started_at,
                ended_at=s.ended_at,
                message_count=count_map.get(s.id, 0),
                has_flagged_content=bool(flagged_map.get(s.id, {}).get("flagged_count")),
                flagged_message_count=flagged_map.get(s.id, {}).get("flagged_count", 0),
                last_flagged_at=flagged_map.get(s.id, {}).get("last_flagged_at"),
                subjects=[],
            )
            for s in recent_sessions_rows
        ]

        total_messages = sum(d.messages for d in daily_usage)
        active_days = sum(1 for d in daily_usage if d.sessions > 0)
        top_subject = daily_usage[-1].date if daily_usage else None
        engagement = "moderate" if total_messages > 10 else "low"

        return ParentProgressResponse(
            child_id=child_id,
            daily_usage=daily_usage,
            subject_mastery=[],
            weekly_insight=WeeklyInsight(
                summary=f"Activity over the last 7 days: {total_messages} messages across {active_days} active days.",
                top_subject=top_subject,
                engagement_level=engagement,
            ),
            recent_sessions=recent_sessions,
        )

    def _get_daily_usage_postgresql(self, child_id: UUID) -> list[DailyUsagePoint]:
        daily_rows = (
            self.db.execute(
                text("""
                    SELECT d.day AS date,
                           COALESCE(s.session_count, 0) AS sessions,
                           COALESCE(s.message_count, 0) AS messages,
                           COALESCE(s.xp_gained, 0) AS xp_gained
                    FROM generate_series(
                        CURRENT_DATE - INTERVAL '6 days',
                        CURRENT_DATE,
                        INTERVAL '1 day'
                    ) AS d(day)
                    LEFT JOIN LATERAL (
                        SELECT COUNT(DISTINCT cs.id)::int AS session_count,
                               COUNT(ch.id)::int AS message_count,
                               0 AS xp_gained
                        FROM chat_sessions cs
                        LEFT JOIN chat_history ch ON ch.session_id = cs.id
                        WHERE cs.child_profile_id = :child_id
                          AND cs.started_at::date = d.day::date
                    ) s ON TRUE
                    ORDER BY d.day ASC
                """),
                {"child_id": str(child_id)},
            )
            .fetchall()
        )

        return [
            DailyUsagePoint(
                date=str(row.date),
                sessions=row.sessions,
                messages=row.messages,
                xp_gained=row.xp_gained,
            )
            for row in daily_rows
        ]

    def _get_daily_usage_sqlite(self, child_id: UUID) -> list[DailyUsagePoint]:
        today = datetime.now(timezone.utc).date()
        daily_usage = []

        for i in range(6, -1, -1):
            day = today - timedelta(days=i)
            day_str = day.isoformat()

            session_count = (
                self.db.query(func.count(ChatSession.id))
                .filter(
                    ChatSession.child_profile_id == child_id,
                    func.date(ChatSession.started_at) == day_str,
                )
                .scalar() or 0
            )

            message_count = (
                self.db.query(func.count(ChatHistory.id))
                .join(ChatSession, ChatHistory.session_id == ChatSession.id)
                .filter(
                    ChatSession.child_profile_id == child_id,
                    func.date(ChatHistory.created_at) == day_str,
                )
                .scalar() or 0
            )

            daily_usage.append(
                DailyUsagePoint(
                    date=day_str,
                    sessions=int(session_count),
                    messages=int(message_count),
                    xp_gained=0,
                )
            )

        return daily_usage

    def get_history(
        self,
        *,
        child_id: UUID,
        parent_id: UUID,
        flagged_only: bool = False,
        limit: int = 20,
        offset: int = 0,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> ParentHistoryResponse:
        self._require_child_for_parent(child_id, parent_id)

        query = self.db.query(ChatSession).filter(ChatSession.child_profile_id == child_id)
        if date_from:
            query = query.filter(ChatSession.started_at >= date_from)
        if date_to:
            query = query.filter(ChatSession.started_at <= date_to)
        if flagged_only:
            query = query.filter(
                self.db.query(ChatHistory.id).filter(
                    ChatHistory.session_id == ChatSession.id,
                    ChatHistory.is_flagged.is_(True)
                ).exists()
            )

        total_count = (
            self.db.query(func.count())
            .select_from(query.with_entities(ChatSession.id).distinct().subquery())
            .scalar()
            or 0
        )

        rows = (
            query.order_by(ChatSession.started_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        session_ids = [session.id for session in rows]
        message_rows = []
        if session_ids:
            message_rows = (
                self.db.query(ChatHistory)
                .filter(ChatHistory.session_id.in_(session_ids))
                .order_by(ChatHistory.session_id.asc(), ChatHistory.created_at.asc(), ChatHistory.id.asc())
                .all()
            )

        messages_by_session: dict[UUID, list[ChatHistory]] = {}
        for message in message_rows:
            messages_by_session.setdefault(message.session_id, []).append(message)

        flagged_rows = []
        if session_ids:
            flagged_rows = (
                self.db.query(
                    ChatHistory.session_id,
                    func.count(ChatHistory.id).label("flagged_count"),
                    func.max(ChatHistory.created_at).label("last_flagged_at"),
                )
                .filter(
                    ChatHistory.session_id.in_(session_ids),
                    ChatHistory.is_flagged.is_(True),
                )
                .group_by(ChatHistory.session_id)
                .all()
            )

        flagged_map = {
            row.session_id: {
                "flagged_count": int(row.flagged_count or 0),
                "last_flagged_at": row.last_flagged_at,
            }
            for row in flagged_rows
        }

        sessions = []
        for session in rows:
            session_messages = messages_by_session.get(session.id, [])
            last_message_at = session_messages[-1].created_at if session_messages else None
            preview = session_messages[-1].content[:160] if session_messages else ""
            flagged_info = flagged_map.get(session.id, {})

            sessions.append(
                ParentHistorySession(
                    session_id=session.id,
                    started_at=session.started_at,
                    ended_at=session.ended_at,
                    message_count=len(session_messages),
                    has_flagged_content=bool(flagged_info.get("flagged_count")),
                    flagged_message_count=flagged_info.get("flagged_count", 0),
                    last_flagged_at=flagged_info.get("last_flagged_at"),
                    last_message_at=last_message_at,
                    preview=preview,
                )
            )

        has_more = (offset + limit) < total_count
        return ParentHistoryResponse(
            child_id=child_id,
            sessions=sessions,
            total_count=total_count,
            limit=limit,
            offset=offset,
            has_more=has_more,
        )

    def bulk_delete_sessions(
        self,
        child_id: UUID,
        parent_id: UUID,
        session_ids: list[UUID],
    ) -> BulkDeleteResponse:
        child = self._require_child_for_parent(child_id, parent_id)

        deleted = 0
        not_found = 0

        for sid in session_ids:
            session = (
                self.db.query(ChatSession)
                .filter(
                    ChatSession.id == sid,
                    ChatSession.child_profile_id == child.id,
                )
                .first()
            )
            if session:
                self.db.delete(session)
                deleted += 1
            else:
                not_found += 1

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        return BulkDeleteResponse(deleted_count=deleted, not_found_count=not_found)

    def export_history(
        self,
        child_id: UUID,
        parent_id: UUID,
        export_format: str = "json",
    ) -> HistoryExportResponse:
        child = self._require_child_for_parent(child_id, parent_id)

        sessions = (
            self.db.query(ChatSession)
            .filter(ChatSession.child_profile_id == child.id)
            .order_by(ChatSession.started_at.desc())
            .all()
        )

        session_ids = [s.id for s in sessions]
        total_messages = 0
        if session_ids:
            msg_count_rows = (
                self.db.query(
                    ChatHistory.session_id,
                    func.count(ChatHistory.id).label("msg_count"),
                )
                .filter(ChatHistory.session_id.in_(session_ids))
                .group_by(ChatHistory.session_id)
                .all()
            )
            total_messages = sum(int(row.msg_count) for row in msg_count_rows)

        return HistoryExportResponse(
            child_id=child_id,
            export_format=export_format,
            download_url=None,
            total_sessions=len(sessions),
            total_messages=total_messages,
        )

    def pause_child(
        self,
        child_id: UUID,
        parent_id: UUID,
    ) -> ChildPauseResponse:
        child = self._require_child_for_parent(child_id, parent_id)
        child.is_paused = True
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        self.db.refresh(child)
        return ChildPauseResponse(child_id=child.id, is_paused=True)

    def resume_child(
        self,
        child_id: UUID,
        parent_id: UUID,
    ) -> ChildPauseResponse:
        child = self._require_child_for_parent(child_id, parent_id)
        child.is_paused = False
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        self.db.refresh(child)
        return ChildPauseResponse(child_id=child.id, is_paused=False)

    def get_notification_prefs(
        self,
        parent_id: UUID,
    ) -> NotificationPrefsRead:
        prefs = (
            self.db.query(ParentNotificationPrefs)
            .filter(ParentNotificationPrefs.parent_id == parent_id)
            .first()
        )
        if not prefs:
            return NotificationPrefsRead()

        return NotificationPrefsRead.model_validate(prefs)

    def update_notification_prefs(
        self,
        parent_id: UUID,
        payload: NotificationPrefsUpdate,
    ) -> NotificationPrefsRead:
        prefs = (
            self.db.query(ParentNotificationPrefs)
            .filter(ParentNotificationPrefs.parent_id == parent_id)
            .first()
        )

        if not prefs:
            prefs = ParentNotificationPrefs(parent_id=parent_id)
            self.db.add(prefs)
            self.db.flush()

        update_data = payload.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if hasattr(prefs, key):
                setattr(prefs, key, value)

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        self.db.refresh(prefs)
        return NotificationPrefsRead.model_validate(prefs)

    def get_control_audit(
        self,
        *,
        parent_id: UUID,
        child_id: UUID | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> AuditLogResponse:
        query = self.db.query(AuditLog).filter(AuditLog.actor_id == parent_id)
        if child_id:
            query = query.filter(AuditLog.resource_id == child_id)

        total = query.count()
        logs = (
            query.order_by(AuditLog.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        entries = [
            AuditLogEntry(
                action=log.action,
                actor_id=log.actor_id,
                target_child_id=log.resource_id if log.resource_id else parent_id,
                detail=build_detail(log),
                timestamp=log.created_at,
            )
            for log in logs
        ]

        return AuditLogResponse(
            entries=entries,
            total_count=total,
            limit=limit,
            offset=offset,
        )

    def _compute_streak(self, child_id: UUID) -> int:
        today = datetime.now(timezone.utc).date()
        cutoff = today - timedelta(days=365)
        active_days = set(
            self.db.query(func.date(ChatSession.started_at))
            .filter(
                ChatSession.child_profile_id == child_id,
                ChatSession.started_at >= cutoff,
            )
            .group_by(func.date(ChatSession.started_at))
            .all()
        )
        streak = 0
        for i in range(365):
            day = today - timedelta(days=i)
            if day in active_days:
                streak += 1
            elif i > 0:
                break
        return streak
