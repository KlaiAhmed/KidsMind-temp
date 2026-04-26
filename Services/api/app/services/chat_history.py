"""
Chat History Service

Responsibility: Handles conversation history persistence in Postgres,
archival to MinIO, and short-term cache management via the AI service.
Layer: Service
Domain: Chat
"""

import io
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, inspect
from sqlalchemy.orm import Session

from services.ai_service import ai_service
from services.history import history_service
from core.config import settings
from core.storage import minio_client
from models.chat_history import ChatHistory
from models.chat_session import ChatSession
from utils.file_name import generate_chat_history_storage_path
from utils.logger import logger


class ChatHistoryService:
    async def _cache_clear_conversation_history(
        self,
        user_id: str,
        child_id: str,
        session_id: str,
    ) -> None:
        logger.info(
            "Clearing conversation history",
            extra={"user_id": user_id, "child_id": child_id, "session_id": session_id},
        )

        try:
            session_key = ai_service.build_session_key(user_id, child_id, session_id)
            history = history_service.get_history(session_key)
            history.clear()

            logger.info(
                "Conversation history cleared",
                extra={
                    "user_id": user_id,
                    "child_id": child_id,
                    "session_id": session_id,
                },
            )
        except Exception:
            logger.exception(
                "Failed to clear conversation history",
                extra={"user_id": user_id, "child_id": child_id, "session_id": session_id},
            )
            raise

    def _db_save_turn_to_db(
        self,
        db: Session,
        session_id: UUID,
        user_message: str,
        ai_response: str,
    ) -> None:
        logger.info(
            "Persisting chat turn to database",
            extra={
                "session_id": str(session_id),
                "user_message_length": len(user_message),
                "assistant_message_length": len(ai_response),
            },
        )

        try:
            user_row = ChatHistory(
                session_id=session_id,
                role="user",
                content=user_message,
            )
            assistant_row = ChatHistory(
                session_id=session_id,
                role="assistant",
                content=ai_response,
            )

            db.add_all([user_row, assistant_row])
            db.flush()
            db.commit()
        except Exception as exc:
            db.rollback()

            table_exists = None
            try:
                table_exists = inspect(db.get_bind()).has_table(ChatHistory.__tablename__)
            except Exception:
                logger.exception(
                    "Failed inspecting chat_history table after persistence error",
                    extra={"session_id": str(session_id)},
                )

            logger.exception(
                "Failed to persist chat turn to database",
                extra={
                    "session_id": str(session_id),
                    "error_type": type(exc).__name__,
                    "table_exists": table_exists,
                },
            )
            raise

    def _db_archive_session_to_minio(
        self,
        db: Session,
        child_id: str,
        session_id: UUID,
    ) -> bool:
        bucket_name = "chat-archive"

        try:
            rows = (
                db.query(ChatHistory)
                .filter(ChatHistory.session_id == session_id)
                .order_by(ChatHistory.created_at.asc())
                .all()
            )

            if not rows:
                logger.info(
                    "No persisted chat rows found for archive",
                    extra={"child_id": child_id, "session_id": str(session_id)},
                )
                return True

            object_key = generate_chat_history_storage_path(child_id, str(session_id))
            payload_lines = [
                json.dumps(
                    {
                        "role": row.role,
                        "content": row.content,
                        "created_at": row.created_at.isoformat() if row.created_at else None,
                    }
                )
                for row in rows
            ]
            payload = ("\n".join(payload_lines) + "\n").encode("utf-8")
            data = io.BytesIO(payload)

            minio_client.put_object(
                bucket_name=bucket_name,
                object_name=object_key,
                data=data,
                length=len(payload),
                content_type="application/x-ndjson",
            )

            logger.info(
                "Chat session archived to storage",
                extra={
                    "child_id": child_id,
                    "session_id": str(session_id),
                    "storage_path": object_key,
                    "message_count": len(rows),
                },
            )
            return True
        except Exception:
            logger.exception(
                "Failed to archive chat session",
                extra={"child_id": child_id, "session_id": str(session_id)},
            )
            return False

    def _db_delete_session_rows(
        self,
        db: Session,
        child_id: str,
        session_id: UUID,
    ) -> int:
        logger.info(
            "Deleting persisted chat session from database",
            extra={"child_id": child_id, "session_id": str(session_id)},
        )

        try:
            deleted_rows = (
                db.query(ChatHistory)
                .filter(ChatHistory.session_id == session_id)
                .delete(synchronize_session=False)
            )
            db.flush()
            db.commit()
        except Exception:
            db.rollback()
            logger.exception(
                "Failed deleting persisted chat session from database",
                extra={"child_id": child_id, "session_id": str(session_id)},
            )
            raise

        logger.info(
            "Persisted chat session deleted from database",
            extra={
                "child_id": child_id,
                "session_id": str(session_id),
                "deleted_rows": deleted_rows,
            },
        )
        return deleted_rows

    def _db_archive_and_delete_expired_sessions(
        self,
        db: Session,
        user_id: str,
    ) -> dict:
        cutoff = datetime.now(timezone.utc) - timedelta(days=90)
        archived_count = 0
        failed_count = 0

        expired_sessions = (
            db.query(ChatHistory.session_id, ChatSession.child_profile_id)
            .join(ChatSession, ChatHistory.session_id == ChatSession.id)
            .group_by(ChatHistory.session_id, ChatSession.child_profile_id)
            .having(func.max(ChatHistory.created_at) < cutoff)
            .all()
        )

        logger.info(
            "Starting expired chat session archive job",
            extra={"expired_session_count": len(expired_sessions), "cutoff": cutoff.isoformat()},
        )

        for session_id, child_id in expired_sessions:
            archived = self._db_archive_session_to_minio(
                db=db,
                child_id=str(child_id),
                session_id=session_id,
            )
            if not archived:
                failed_count += 1
                continue

        try:
            self._db_delete_session_rows(
                db=db,
                child_id=str(child_id),
                session_id=session_id,
            )
            archived_count += 1
        except Exception:
            failed_count += 1
            logger.exception(
                "Failed deleting archived chat session",
                extra={"child_id": str(child_id), "session_id": str(session_id)},
            )

        result = {"archived": archived_count, "failed": failed_count}
        logger.info("Expired chat session archive job completed", extra=result)
        return result

    async def save_turn_to_db(
        self,
        db: Session,
        session_id: UUID,
        user_message: str,
        ai_response: str,
    ) -> None:
        await run_in_threadpool(
            self._db_save_turn_to_db,
            db=db,
            session_id=session_id,
            user_message=user_message,
            ai_response=ai_response,
        )

    async def archive_session_to_minio(
        self,
        db: Session,
        child_id: str,
        session_id: UUID,
    ) -> bool:
        return await run_in_threadpool(
            self._db_archive_session_to_minio,
            db=db,
            child_id=child_id,
            session_id=session_id,
        )

    async def delete_session_from_db(
        self,
        db: Session,
        child_id: str,
        session_id: UUID,
        user_id: str,
    ) -> None:
        await run_in_threadpool(
            self._db_delete_session_rows,
            db=db,
            child_id=child_id,
            session_id=session_id,
        )
        await self._cache_clear_conversation_history(
            user_id=user_id,
            child_id=child_id,
            session_id=str(session_id),
        )

    async def archive_and_delete_expired_sessions(
        self,
        db: Session,
        user_id: str,
    ) -> dict:
        return await run_in_threadpool(
            self._db_archive_and_delete_expired_sessions,
            db=db,
            user_id=user_id,
        )


chat_history_service = ChatHistoryService()
