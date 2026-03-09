from services.build_chain import build_chain
from services.history import history_service
from utils.age_guidelines import age_guidelines
from utils.llm_json_parsing import parse_llm_response
from utils.logger import logger


class AIService:
    def __init__(self, chain=None):
        self.chain= chain or build_chain()
    
    async def get_response(self, user: dict, payload: dict) -> dict:
        guidelines = age_guidelines(payload.age_group)

        history = None
        trimmed_history = []
        try:
            # Attempt to retrieve and trim history, but proceed even if Redis is unavailable
            history = history_service.get_history(user)
            trimmed_history = history_service.get_trimmed_messages(history)
        except Exception as e:
            logger.warning(f"Redis unavailable, proceeding without history: {e}")

        response = await self.chain.ainvoke({
            "age_group": payload.age_group,
            "age_guidelines": guidelines,
            "context": payload.context or "",
            "input": payload.text,
            "history": trimmed_history
        })

        parsed = parse_llm_response(response)
        if history:
            try:
                # Save the turn to history
                history_service.append_turn(
                    history,
                    user_input = payload.text,
                    llm_output = parsed.get("explanation", ""),
                )
                logger.info("Successfully saved history turn.")
            except Exception as e:
                logger.warning(f"Could not save history turn: {e}")

        return parsed
        

ai_service = AIService()