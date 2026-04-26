from core.config import settings
from services.moderation import check_moderation
from services.dev_moderation import dev_check_moderation

def get_moderation_service():
    return check_moderation if settings.IS_PROD else dev_check_moderation
