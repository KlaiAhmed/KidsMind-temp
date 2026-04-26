from langchain_community.chat_message_histories import RedisChatMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory

from core.config import settings
from utils.logger import logger


class HistoryService:
    def get_history(self, session_id: str) -> BaseChatMessageHistory:
        logger.debug("HistoryService.get_history called", extra={"session_id": session_id})

        try:
            history = RedisChatMessageHistory(
                session_id=session_id,
                url=settings.CACHE_SERVICE_ENDPOINT,
                ttl=settings.HISTORY_TTL,
            )
            logger.debug("Created RedisChatMessageHistory", extra={"session_id": session_id})
            return history
        except Exception:
            logger.exception(
                "Failed to construct RedisChatMessageHistory",
                extra={"session_id": session_id},
            )
            raise


history_service = HistoryService()
