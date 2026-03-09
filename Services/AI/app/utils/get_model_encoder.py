import tiktoken
from core.config import MODEL_NAME

try:
    ENCODER = tiktoken.encoding_for_model(MODEL_NAME)
except KeyError:
    ENCODER = tiktoken.get_encoding("cl100k_base") # default for gpt-4 + models