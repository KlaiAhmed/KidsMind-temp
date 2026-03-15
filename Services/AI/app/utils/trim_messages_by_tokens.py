from utils.token_count import get_token_count
from collections import deque

def trim_messages_by_tokens(messages: list, max_tokens: int = 2000) -> list:
    dq = deque(messages)
    
    def count(msg) -> int:
        return get_token_count(msg.content)


    total = sum(count(m) for m in dq)
    
    while dq and total > max_tokens:
        removed = dq.popleft()
        total -= count(removed)

    return list(dq)