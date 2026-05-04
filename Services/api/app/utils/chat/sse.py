import json
from uuid import uuid4


def format_sse(event: str, data: dict) -> bytes:
    payload = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    return payload.encode("utf-8")


def format_chat_start(message_id: str, child_id: str, message_type: str = "chat") -> bytes:
    return format_sse("start", {
        "message_id": message_id,
        "type": message_type,
        "child_id": child_id,
    })


def format_chat_delta(text: str) -> bytes:
    return format_sse("delta", {"text": text})


def format_chat_end(message_id: str, finish_reason: str = "stop") -> bytes:
    return format_sse("end", {
        "finish_reason": finish_reason,
        "message_id": message_id,
    })


def format_chat_error(code: str, message: str, message_id: str) -> bytes:
    return format_sse("error", {
        "code": code,
        "message": message,
        "message_id": message_id,
    })


def new_message_id() -> str:
    return f"msg_{uuid4().hex[:12]}"
