from .mobile_auth import router as mobile_auth_router
from .web_auth import router as web_auth_router

__all__ = ["mobile_auth_router", "web_auth_router"]
