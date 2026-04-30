class AuditAction:
    AUTH_LOGIN_SUCCESS = "auth.login.success"
    AUTH_LOGIN_FAILURE = "auth.login.failure"
    AUTH_LOGOUT = "auth.logout"

    CHILD_PROFILE_CREATE = "child_profile.create"
    CHILD_PROFILE_UPDATE = "child_profile.update"
    CHILD_PROFILE_DELETE = "child_profile.delete"

    CHILD_RULES_UPDATE = "child_rules.update"

    DATA_ACCESS_HISTORY_VIEW = "data_access.history_view"
    DATA_ACCESS_EXPORT_PDF = "data_access.export_pdf"

    MODERATION_BLOCK = "moderation.block"

    ADMIN_CONTENT_CREATE = "admin.content.create"
    ADMIN_CONTENT_UPDATE = "admin.content.update"
    ADMIN_CONTENT_DELETE = "admin.content.delete"
