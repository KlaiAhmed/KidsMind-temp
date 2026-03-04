from fastapi import APIRouter, HTTPException, Request
from typing import Optional
from pydantic import BaseModel, Field
import time
import logging

# Local Imports
from services.chains import build_chain
from services.moderation import check_moderation
from services.dev_moderation import dev_check_moderation

from utils.validate_token_limit import validate_token_limit
from utils.age_guidelines import age_guidelines
from utils.get_client import get_client

from core.config import IS_PROD


router = APIRouter(tags=["AI"])

logger = logging.getLogger(__name__)

# Build the AI chain once at startup to reuse across requests
chain = build_chain()

class ChatRequest(BaseModel):
    message: str = Field(..., max_length=10000, description="The message to send by user to the AI")
    context: Optional[str] = Field(None,  max_length=1000, description="Optional context for the AI")
    age_group: Optional[str] = Field("3-15", max_length=5, description="The Kid Age group for content guidelines")


@router.post("/chat")
async def chat_with_ai(
    request: Request,
    payload: ChatRequest):
    try:    
        start_time = time.time()

        # Validate token limits for message and context
        if not validate_token_limit(payload.message):
            logger.warning("Message exceeds token limit.")
            raise HTTPException(status_code=413, detail="Message is too long. Please shorten it and try again.")
        
        if payload.context:
            if not validate_token_limit(payload.context, 1000):
                logger.warning("Context exceeds token limit.")
                raise HTTPException(status_code=413, detail="Context is too long. Please shorten it and try again.")
        

        # Calling External Moderation API to check if user input is appropriate for kids
        if IS_PROD:
            safe_content = await check_moderation(payload.message, payload.context or "", client=get_client(request))
        else:
            safe_content = await dev_check_moderation(payload.message, payload.context or "", client=get_client(request))

        # If content is not safe, return a 400 error with appropriate message
        if not safe_content:
            logger.warning("Message failed moderation checks.")
            raise HTTPException(status_code=400, detail="Message contains inappropriate content for your age.")

        # Get age-specific guidelines for the AI response based on the provided age group
        guidelines = age_guidelines(payload.age_group)
                
        # Invoke the AI chain
        response = await chain.ainvoke({
            "age_group": payload.age_group,
            "age_guidelines": guidelines,
            "context": payload.context,
            "input": payload.message,
            "history": []  # Placeholder for conversation history, yet to be implemented in future
        })

        # Calling External Moderation API to check if LLM response is appropriate for kids
        if IS_PROD:
            safe_content = await check_moderation(response.content, payload.context or "", client=get_client(request))
        else:
            safe_content = await dev_check_moderation(response.content, payload.context or "", client=get_client(request))
        
        duration = time.time()-start_time    
        
        return {"response": response.content, "processing_time": duration}
    
    except HTTPException as e:
        logger.warning(f"HTTPException: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")