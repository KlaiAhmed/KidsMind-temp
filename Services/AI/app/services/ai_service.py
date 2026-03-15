import json
from typing import AsyncGenerator
import time

from services.build_chain import chain_builder
from utils.age_guidelines import age_guidelines
from utils.logger import logger

class AIService:
    def __init__(self, chain=None):
        self.chain = chain or chain_builder.build()

    def build_session_key(self, user_id: str, child_id: str, session_id: str) -> str:
        return f"kidsmind:history:{user_id}:{child_id}:{session_id}"

    async def get_response(self, user: dict, payload) -> dict:
        """Non-streaming path: returns the fully structured dict."""
        timer=time.perf_counter()

        guidelines = age_guidelines(payload.age_group)
        
        session_id = self.build_session_key(user['id'], user['child_id'], user['session_id'])

        try:
            response = await self.chain.ainvoke(
                {
                    "age_group": payload.age_group,
                    "age_guidelines": guidelines,
                    "context": payload.context or "",
                    "input": payload.text,
                },
                config={"configurable": {"session_id": session_id}}
            )
            elapsed = time.perf_counter() - timer
            logger.info("AIService.get_response completed", extra={
                "session_id": session_id,
                "elapsed_seconds": elapsed
            })
            return response
        except Exception as exc:
            logger.exception("AIService.get_response failed", exc_info=exc, extra={"session_id": session_id})
            raise
    
    async def stream_response(self, user: dict, payload) -> AsyncGenerator[str, None]:
        """
        Streaming path: yields cumulative JSON dicts.
        """
        timer = time.perf_counter()

        guidelines = age_guidelines(payload.age_group)

        session_id = self.build_session_key(user['id'], user['child_id'], user['session_id'])

        logger.info("AIService.stream_response started", extra={
            "user_id": user.get("id"),
            "child_id": user.get("child_id"),
            "session_id": session_id,
            "age_group": payload.age_group,
        })

        try:
            async for chunk in self.chain.astream(
                {
                    "age_group": payload.age_group,
                    "age_guidelines": guidelines,
                    "context": payload.context or "",
                    "input": payload.text,
                },
                config={"configurable": {"session_id": session_id}}
            ):

                yield json.dumps(chunk)
        except Exception as exc:
            logger.exception("AIService.stream_response failed", exc_info=exc, extra={"session_id": session_id})
            raise
        finally:
            elapsed = time.perf_counter() - timer
            logger.info("AIService.stream_response finished", extra={"session_id": session_id, "elapsed_seconds": elapsed})


ai_service = AIService()