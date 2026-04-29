from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from models.chat_session import ChatSession


def create_session_for_child(db: Session, child_id: UUID, session_id: UUID) -> ChatSession:
    try:
        stmt = (
            pg_insert(ChatSession)
            .values(
                id=session_id,
                child_profile_id=child_id,
                started_at=datetime.now(timezone.utc),
            )
            .on_conflict_do_nothing(index_elements=["id"])
        )
        db.execute(stmt)
        db.commit()
        result = db.execute(select(ChatSession).where(ChatSession.id == session_id))
        return result.scalar_one()
    except Exception:
        db.rollback()
        raise
