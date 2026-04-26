from operator import itemgetter

from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import trim_messages
from langchain_core.runnables import RunnablePassthrough
from langchain_core.runnables.history import RunnableWithMessageHistory

from services.prompts import BASE_SYSTEM_PROMPT
from services.history import history_service
from schemas.llm_response import KidsMindResponse
from core.llm import llm as default_llm
from core.config import settings
from utils.token_count import get_sum_token_count


class ChainBuilder:

    def _build_parser(self) -> JsonOutputParser:
        return JsonOutputParser(pydantic_object=KidsMindResponse)

    def _build_prompt(self, format_instructions: str) -> ChatPromptTemplate:
        return ChatPromptTemplate.from_messages([
            ("system", BASE_SYSTEM_PROMPT),
            MessagesPlaceholder(variable_name="history"),
            ("human", "{input}")
        ]).partial(format_instructions=format_instructions)

    def _build_trimmer(self, llm_client):
        return trim_messages(
            max_tokens=settings.MAX_HISTORY_TOKENS,
            strategy="last",
            token_counter=llm_client if settings.IS_PROD else get_sum_token_count,
            include_system=True,
            allow_partial=False,
            start_on="human",
        )

    def build(self, llm_client=None, with_parser: bool = True):
        selected_llm = llm_client or default_llm

        parser = self._build_parser()
        prompt = self._build_prompt(parser.get_format_instructions())
        trimmer = self._build_trimmer(selected_llm)

        trim = RunnablePassthrough.assign(
            history=itemgetter("history") | trimmer
        )

        chain_with_history = RunnableWithMessageHistory(
            trim | prompt | selected_llm,
            get_session_history=history_service.get_history,
            input_messages_key="input",
            history_messages_key="history",
        )

        if with_parser:
            return chain_with_history | parser

        return chain_with_history

chain_builder = ChainBuilder()
