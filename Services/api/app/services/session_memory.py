"""Session Memory Service

Responsibility: Manages active conversation MEMORY in Redis for LLM context.
Layer: Service
Domain: AI/LLM

ARCHITECTURAL NOTE: History vs Memory
---------------------------------------
- **MEMORY** = Active conversation context loaded into the LLM's context window.
  This service provides MEMORY - the messages currently "remembered" by the AI.
  MEMORY is short-lived (TTL), stored in Redis, and injected into prompts.

- **HISTORY** = Persisted conversation data in Postgres (ChatHistory model).
  HISTORY is long-term storage, managed by chat_history_service.
  HISTORY is NOT directly passed to the LLM.

The Transformation Layer:
  build_chain.py uses this service to fetch MEMORY.
  RunnableWithMessageHistory injects MEMORY into prompts sent to the LLM.
  The trimmer limits MEMORY to fit within token constraints.

Key distinction:
  - MEMORY is what the LLM sees RIGHT NOW (active context)
  - HISTORY is what happened in the past (persisted record)
"""

from langchain_community.chat_message_histories import RedisChatMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory

from core.config import settings
from utils.logger import logger


class SessionMemoryService:
    """
    Provides active conversation MEMORY for LLM context.

    MEMORY is:
    - Stored in Redis with TTL
    - Trimmed to fit within token limits before LLM calls
    - Automatically injected into prompts by RunnableWithMessageHistory

    This is NOT for persisted HISTORY - that's handled by chat_history_service.
    """

    def get_session_memory(self, session_id: str) -> BaseChatMessageHistory:
        """
        Retrieve MEMORY for a session from Redis.

        Args:
            session_id: The unique session identifier (format: kidsmind:session:...)

        Returns:
            RedisChatMessageHistory: The active MEMORY for the session.
            This is injected into LLM prompts by RunnableWithMessageHistory.
        """
        logger.debug("SessionMemoryService.get_session_memory called", extra={"session_id": session_id})

        try:
            memory = RedisChatMessageHistory(
                session_id=session_id,
                url=settings.CACHE_SERVICE_ENDPOINT,
                ttl=settings.SESSION_MEMORY_TTL,
            )
            logger.debug("Created RedisChatMessageHistory for MEMORY", extra={"session_id": session_id})
            return memory
        except Exception:
            logger.exception(
                "Failed to construct RedisChatMessageHistory for MEMORY",
                extra={"session_id": session_id},
            )
            raise


# Singleton instance
session_memory_service = SessionMemoryService()
