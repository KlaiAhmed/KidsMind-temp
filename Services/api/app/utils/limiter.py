from slowapi import Limiter
from slowapi.util import get_remote_address
from core.config import  CACHE_PASSWORD

limiter = Limiter(key_func=get_remote_address, storage_uri=f"redis://:{CACHE_PASSWORD}@cache:6379")
