import logging
from uuid import UUID

from fastapi import Request

from core.database import SessionLocal
from models.audit.audit_log import AuditLog, AuditActorRole
from services.audit.constants import AuditAction

logger = logging.getLogger(__name__)

_CHILD_PROFILE_SAFE_FIELDS = {
    "education_stage",
    "is_accelerated",
    "is_below_expected_stage",
    "xp",
    "is_paused",
}

_CHILD_RULES_SAFE_FIELDS = {
    "voice_mode_enabled",
    "audio_storage_enabled",
    "conversation_history_enabled",
    "homework_mode_enabled",
    "default_language",
}


def write_audit_log(
    *,
    actor_id: UUID,
    actor_role: AuditActorRole,
    action: str,
    resource: str | None = None,
    resource_id: UUID | None = None,
    before_state: dict | None = None,
    after_state: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    db = SessionLocal()
    try:
        log_entry = AuditLog(
            actor_id=actor_id,
            actor_role=actor_role,
            action=action,
            resource=resource,
            resource_id=resource_id,
            before_state=before_state,
            after_state=after_state,
            ip_address=ip_address,
            user_agent=(user_agent or "")[:255] if user_agent else None,
        )
        db.add(log_entry)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(
            "Audit log write failed — action=%s actor=%s resource=%s: %s",
            action, actor_id, resource_id, exc, exc_info=True,
        )
    finally:
        db.close()


def extract_request_context(request: Request) -> tuple[str | None, str | None]:
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        ip_address = forwarded_for.split(",")[0].strip()
    else:
        ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")
    return ip_address, user_agent


def sanitize_child_profile(profile_dict: dict) -> dict:
    return {k: v for k, v in profile_dict.items() if k in _CHILD_PROFILE_SAFE_FIELDS}


def sanitize_child_rules(rules_dict: dict) -> dict:
    return {k: v for k, v in rules_dict.items() if k in _CHILD_RULES_SAFE_FIELDS}


def build_detail(log: AuditLog) -> str:
    parts = [log.resource] if log.resource else []
    if log.before_state or log.after_state:
        changes = []
        before = log.before_state or {}
        after = log.after_state or {}
        all_keys = set(before.keys()) | set(after.keys())
        for key in sorted(all_keys):
            old_val = before.get(key)
            new_val = after.get(key)
            if old_val != new_val:
                changes.append(f"{key}: {old_val} → {new_val}")
        if changes:
            parts.append("; ".join(changes))
    return " | ".join(parts) if parts else ""
