"""Attestation Service

Responsibility: Evaluate mobile registration attestation signals and map them
to trust levels without hard-blocking registration.
Layer: Service
Domain: Auth Security
"""

from dataclasses import dataclass

from core.config import settings
from services.auth_service import AttestationStatus, TrustLevel


@dataclass(slots=True)
class AttestationResult:
    status: str
    trust_level: str
    reason: str | None = None


class AttestationService:
    """Adapter-style attestation service with deterministic fallback behavior."""

    def validate_registration_attestation(
        self,
        *,
        platform: str | None,
        attestation_token: str | None,
    ) -> AttestationResult:
        if not settings.APP_ATTESTATION_ENABLED:
            return AttestationResult(status=AttestationStatus.SKIPPED, trust_level=TrustLevel.NORMAL)

        if attestation_token and attestation_token.strip():
            return AttestationResult(status=AttestationStatus.PASSED, trust_level=TrustLevel.NORMAL)

        # Attestation failure is intentionally degraded-trust, not hard denial.
        return AttestationResult(
            status=AttestationStatus.FAILED,
            trust_level=TrustLevel.DEGRADED,
            reason="missing_or_invalid_attestation",
        )
