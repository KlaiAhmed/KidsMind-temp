# services/chain_builder.py
from operator import itemgetter

from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import trim_messages
from langchain_core.runnables import RunnablePassthrough
from langchain_core.runnables.history import RunnableWithMessageHistory

from services.prompts import BASE_SYSTEM_PROMPT
from services.history import history_service
from schemas.llm_response import KidsMindResponse
from core.llm import llm
from core.config import settings
from utils.token_count import get_sum_token_count


class ChainBuilder:
    """Assembles the LangChain pipeline from isolated, testable components."""

    def _build_parser(self) -> JsonOutputParser:
        return JsonOutputParser(pydantic_object=KidsMindResponse)

    def _build_prompt(self, format_instructions: str) -> ChatPromptTemplate:
        return ChatPromptTemplate.from_messages([
            ("system", BASE_SYSTEM_PROMPT),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{input}")
        ]).partial(format_instructions=format_instructions)

    def _build_trimmer(self):
        return trim_messages(
            max_tokens=settings.MAX_HISTORY_TOKENS,
            strategy="last",
            token_counter=llm if settings.IS_PROD else get_sum_token_count,
            include_system=True,
            allow_partial=False,
            start_on="human",
        )

    def build(self):
        parser  = self._build_parser()
        prompt  = self._build_prompt(parser.get_format_instructions())
        trimmer = self._build_trimmer()

        trim = RunnablePassthrough.assign(
            history=itemgetter("history") | trimmer
        )

        chain_with_history = RunnableWithMessageHistory(
            trim | prompt | llm,
            get_session_history=history_service.get_history,
            input_messages_key="input",
            history_messages_key="history",
        )

        return chain_with_history | parser
    
chain_builder = ChainBuilder()