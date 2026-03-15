from langchain_core.output_parsers import JsonOutputParser
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnablePassthrough
from langchain_core.messages import trim_messages
from operator import itemgetter

from services.prompts import BASE_SYSTEM_PROMPT
from services.history import history_service
from schemas.llm_response import KidsMindResponse
from core.llm import llm
from core.config import settings
from utils.token_count import get_sum_token_count


def build_chain():
    """ Constructs the AI processing chain: prompt -> LLM -> JSON Output Parser."""

    # The JsonOutputParser will parse the LLM's response into a KidsMindResponse model.
    parser = JsonOutputParser(pydantic_object=KidsMindResponse)

    # Prompt with format instructions embedded
    prompt = ChatPromptTemplate.from_messages([
        ("system", BASE_SYSTEM_PROMPT),
        MessagesPlaceholder(variable_name="history"),
        ("human", "{input}")
    ]).partial(format_instructions=parser.get_format_instructions())


    # Trim the message history to ensure we stay within token limits
    trimmer = trim_messages(
        max_tokens=settings.MAX_HISTORY_TOKENS,
        strategy="last",
        token_counter=llm if settings.IS_PROD else get_sum_token_count,
        include_system=True,
        allow_partial=False,
        start_on="human",
    )

    trim = RunnablePassthrough.assign(history= itemgetter("history") | trimmer)

    # Chain
    chain = trim | prompt | llm | parser

    # Manages loading/saving message history around the chain execution
    chain_with_history = RunnableWithMessageHistory(
        chain,
        get_session_history=history_service.get_history,
        input_messages_key="input",
        history_messages_key="history",
    )

    return chain_with_history