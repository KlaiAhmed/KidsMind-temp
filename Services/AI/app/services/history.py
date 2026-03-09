from langchain_community.chat_message_histories import RedisChatMessageHistory
from langchain_core.messages import BaseMessage
from core.config import CACHE_SERVICE_ENDPOINT, MAX_HISTORY_MESSAGES, MAX_HISTORY_TOKENS, HISTORY_TTL
from utils.trim_messages_by_tokens import trim_messages_by_tokens

class HistoryService:

    def get_session_key(self, user: dict) -> str:
        return f"kidsmind:history:{user['id']}:{user['child_id']}:{user['session_id']}"

    # Get the RedisChatMessageHistory instance for this session
    def get_history(self, user: dict) -> RedisChatMessageHistory:
        """Returns a RedisChatMessageHistory instance for this session."""
        return RedisChatMessageHistory(
            session_id=self.get_session_key(user),
            url=CACHE_SERVICE_ENDPOINT,
            ttl=HISTORY_TTL,
        )

    # Get the last MAX_HISTORY_MESSAGES messages to prevent token overflow
    def get_trimmed_messages(self, history: RedisChatMessageHistory) -> list[BaseMessage]:
        """
        Returns the last MAX_HISTORY_MESSAGES messages.
        Prevents token overflow on long sessions.
        """
        messages = history.messages
        trimmed = messages[-MAX_HISTORY_MESSAGES:]
        trimmed= trim_messages_by_tokens(trimmed, max_tokens=MAX_HISTORY_TOKENS)
        return trimmed

    # Append a new turn to the history after a successful response
    def append_turn(self, history: RedisChatMessageHistory, user_input: str, llm_output: str) -> None:
        """Saves a full human/AI turn to Redis after a successful response."""
        history.add_user_message(user_input)
        history.add_ai_message(llm_output)

history_service = HistoryService()