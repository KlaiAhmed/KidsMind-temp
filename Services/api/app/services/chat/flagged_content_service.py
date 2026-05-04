"""Flagged content persistence helpers.

Responsibility: Persists moderated chat rows, updates session flag counters, and emits parent notifications.
Layer: Service
Domain: Chat / Safety / Parents
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from models.chat.chat_history import ChatHistory
from models.chat.chat_session import ChatSession
from models.gamification.notification_prefs import ParentNotificationPrefs
from services.child.parent_flagged_notification_service import create_flagged_notification
from utils.shared.logger import logger


def _normalize_raw(raw: dict[str, Any] | None) -> dict[str, Any] | None:
    if raw is None:
        return None
    return raw


def save_flagged_chat_message(
    db: Session,
    *,
    session_id: UUID,
    role: str,
    content: str,
    moderation_result: dict[str, Any],
) -> ChatHistory:
    row = ChatHistory(
        session_id=session_id,
        role=role,
        content=content,
        is_flagged=True,
        flag_category=str(moderation_result.get("category") or "blocked"),
        flag_reason=str(moderation_result.get("reason") or "Content flagged by moderation"),
        moderation_score=moderation_result.get("score"),
        moderation_raw=_normalize_raw(moderation_result.get("raw")),
        flagged_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.flush()
    db.refresh(row)
    return row


def save_chat_turn_with_optional_flag(
    db: Session,
    *,
    session_id: UUID,
    user_message: str,
    ai_response: str,
    ai_moderation_result: dict[str, Any] | None = None,
) -> tuple[ChatHistory, ChatHistory]:
    user_row = ChatHistory(session_id=session_id, role="user", content=user_message)
    assistant_row = ChatHistory(
        session_id=session_id,
        role="assistant",
        content=ai_response,
        is_flagged=bool(ai_moderation_result and ai_moderation_result.get("blocked")),
        flag_category=str(ai_moderation_result.get("category") or "blocked") if ai_moderation_result else None,
        flag_reason=str(ai_moderation_result.get("reason") or "Content flagged by moderation") if ai_moderation_result else None,
        moderation_score=ai_moderation_result.get("score") if ai_moderation_result else None,
        moderation_raw=_normalize_raw(ai_moderation_result.get("raw")) if ai_moderation_result else None,
        flagged_at=datetime.now(timezone.utc) if ai_moderation_result and ai_moderation_result.get("blocked") else None,
    )
    db.add_all([user_row, assistant_row])
    db.flush()
    db.refresh(user_row)
    db.refresh(assistant_row)
    return user_row, assistant_row


def update_session_flag_counters(
    db: Session,
    *,
    session_id: UUID,
    increment_by: int = 1,
) -> ChatSession:
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise RuntimeError(f"Chat session {session_id} not found while updating flag counters")

    session.has_flagged_content = True
    session.flagged_message_count = int(session.flagged_message_count or 0) + increment_by
    db.flush()
    return session


def persist_flagged_message_and_notify_parent(
    db: Session,
    *,
    session_id: UUID,
    child_id: UUID,
    parent_id: UUID,
    message_id: int,
    category: str,
    message_preview: str,
    moderation_result: dict[str, Any],
) -> None:
    try:
        prefs = db.query(ParentNotificationPrefs).filter(ParentNotificationPrefs.parent_id == parent_id).first()
        if prefs and not prefs.safety_alerts_enabled:
            logger.info(
                "Parent safety alerts disabled; skipping flagged notification",
                extra={"parent_id": str(parent_id), "child_id": str(child_id), "message_id": message_id},
            )
            return

        create_flagged_notification(
            db,
            parent_id=parent_id,
            child_id=child_id,
            message_id=message_id,
            category=category,
            message_preview=message_preview,
            moderation_raw=moderation_result,
        )
        db.flush()
    except Exception:
        logger.exception(
            "Failed creating flagged notification",
            extra={"parent_id": str(parent_id), "child_id": str(child_id), "message_id": message_id},
        )
