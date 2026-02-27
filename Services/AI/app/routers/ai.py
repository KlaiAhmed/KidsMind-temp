from fastapi import APIRouter, HTTPException
from typing import Optional
from pydantic import BaseModel 
from core.llm import llm
from utils.prompt import create_chat_prompt
from utils.age_guidelines import age_guidelines
import time


router = APIRouter()

# Load prompt blueprint
prompt_template = create_chat_prompt()


class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    age_group: Optional[str] = "3-15"


@router.post("/chat")
def chat_with_ai(request: ChatRequest):
    if not request.message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    start_time = time.time()
    
    guidelines = age_guidelines(request.age_group)
    
    chain = prompt_template | llm
    
    response = chain.invoke({
        "age_group": request.age_group,
        "age_guidelines":   guidelines,
        "context": request.context,
        "message": request.message
    })
    

    duration = time.time()-start_time    
    
    return {"response": response.content, "processing_time": duration}