from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse

# Local Imports
from controllers.chat_controller import chat_controller, chat_stream_controller
from services.history import history_service
from services.ai_service import ai_service
from schemas.ChatRequest import ChatRequest
from utils.get_client import get_client
from utils.auth import verify_service_token
from utils.logger import logger

router = APIRouter()


# This endpoint handles chat interactions with the AI model.
@router.post("/chat/{user_id}/{child_id}/{session_id}", dependencies=[Depends(verify_service_token)])
async def chat_with_ai(user_id: str, child_id: str, session_id: str, payload: ChatRequest, client = Depends(get_client)):
    try:
        user = {"id": user_id, "child_id": child_id, "session_id": session_id}

        logger.info(
            "Chat request received",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
                "text_length": len(payload.text),
                "stream": False,
            },
        )

        response = await chat_controller(payload, user, client)

        logger.info(
            "Chat request completed",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
            },
        )

        return {"response": response}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Unexpected error in chat endpoint",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
            },
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


# This endpoint handles chat interactions with the AI model with streaming responses.
@router.post("/chat/stream/{user_id}/{child_id}/{session_id}", dependencies=[Depends(verify_service_token)])
async def chat_with_ai_stream(user_id: str, child_id: str, session_id: str, payload: ChatRequest, client = Depends(get_client)):
    try:
        user = {"id": user_id, "child_id": child_id, "session_id": session_id}

        logger.info(
            "Stream chat request received",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
                "text_length": len(payload.text),
                "stream": True,
            },
        )

        # chat_stream_controller returns an async generator that yields response chunks as they come in from the LLM
        generator = await chat_stream_controller(payload, user, client)

        return StreamingResponse(
            generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(
            "Unexpected error in stream chat endpoint",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
            },
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


# Get conversation history for a specific user/child/session.
@router.get("/history/{user_id}/{child_id}/{session_id}", dependencies=[Depends(verify_service_token)])
async def get_session_history(user_id: str, child_id: str, session_id: str):
    """Returns conversation history."""
    try:
        session_key = ai_service.build_session_key(user_id, child_id, session_id)

        logger.info(
            "History retrieval request received",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
            },
        )

        history = history_service.get_history(session_key)

        logger.info(
            "History retrieved",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
                "message_count": len(history.messages),
            },
        )

        return {
            "messages": [
                {"role": m.type, "content": m.content}
                for m in history.messages
            ]
        }

    except Exception as e:
        logger.exception(
            "Error retrieving history",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
            },
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")


# Clear conversation history for a specific user/child/session.
@router.delete("/history/{user_id}/{child_id}/{session_id}", dependencies=[Depends(verify_service_token)])
async def clear_session(user_id: str, child_id: str, session_id: str):
    """Clears a child's conversation history."""
    try:
        session_key = ai_service.build_session_key(user_id, child_id, session_id)

        logger.info(
            "History clear request received",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
            },
        )

        history = history_service.get_history(session_key)
        history.clear()

        logger.info(
            "History cleared",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
            },
        )

        return {"status": "cleared"}

    except Exception as e:
        logger.exception(
            "Error clearing history",
            extra={
                "user_id": user_id,
                "child_id": child_id,
                "session_id": session_id,
            },
        )
        raise HTTPException(status_code=500, detail="Internal Server Error")
