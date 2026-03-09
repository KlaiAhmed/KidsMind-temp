from fastapi import APIRouter, HTTPException, Depends
# Local Imports
from controllers.chat_controller import chat_controller
from services.history import history_service
from schemas.ChatRequest import ChatRequest
from utils.get_client import get_client
from utils.logger import logger

router = APIRouter()

# This endpoint handles chat interactions with the AI model.
@router.post("/chat/{user_id}/{child_id}/{session_id}")
async def chat_with_ai(
    user_id: str,
    child_id: str,
    session_id: str,
    payload: ChatRequest,
    client = Depends(get_client),
    ):
    try:    
        user = {"id": user_id, "child_id": child_id, "session_id": session_id}
        response = await chat_controller(payload, user, client)

        return {"response": response}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
    

# Get conversation history for a specific user/child/session.
@router.get("/history/{user_id}/{child_id}/{session_id}")
async def get_session_history(user_id: str, child_id: str, session_id: str):
    """Returns conversation history."""
    try:
        user = {"id": user_id, "child_id": child_id, "session_id": session_id}
        history = history_service.get_history(user)
        return {
            "messages": [
                {"role": m.type, "content": m.content}
                for m in history.messages
            ]
        }
    
    except Exception as e:
        logger.error(f"Error retrieving history: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
    

# Clear conversation history for a specific user/child/session.
@router.delete("/history/{user_id}/{child_id}/{session_id}")
async def clear_session(user_id: str, child_id: str, session_id: str):
    """Clears a child's conversation history."""
    try:
        user = {"id": user_id, "child_id": child_id, "session_id": session_id}
        history = history_service.get_history(user)
        history.clear()
        return {"status": "cleared"}
    
    except Exception as e:
        logger.error(f"Error clearing history: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")