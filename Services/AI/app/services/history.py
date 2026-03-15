# services/history.py
from typing import Optional
import asyncio

from langchain_community.chat_message_histories import RedisChatMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory

from core.config import settings
from utils.logger import logger


class HistoryService:
    def get_history(self, session_id: str) -> BaseChatMessageHistory:
        """
        Returns an async-compatible RedisChatMessageHistory.
        This function is async because it awaits the async Redis client factory.
        RunnableWithMessageHistory supports async get_session_history when the chain is used via .ainvoke.
        """
        logger.debug("HistoryService.get_history called", extra={"session_id": session_id})

        try:
            history = RedisChatMessageHistory(
                session_id=session_id,
                url=settings.CACHE_SERVICE_ENDPOINT,
                ttl=settings.HISTORY_TTL,
            )
            logger.debug("Created RedisChatMessageHistory", extra={"session_id": session_id})
            return history
        except Exception as exc:
            logger.exception("Failed to construct RedisChatMessageHistory", exc_info=exc, extra={"session_id": session_id})
            raise


history_service = HistoryService()