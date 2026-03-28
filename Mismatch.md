# Register 422 Mismatch Report

## 1. Issue

The first step of web onboarding in Get Started sends a register request that does not include parent_pin, while the API register schema required parent_pin.

Result: POST http://localhost:8000/api/v1/auth/register returns 422 Unprocessable Entity.

## 2. Source of mismatch

Frontend request payload is built in [Apps/web/src/pages/GetStartedPage/GetStartedPage.tsx](Apps/web/src/pages/GetStartedPage/GetStartedPage.tsx#L186) and sent at [Apps/web/src/pages/GetStartedPage/GetStartedPage.tsx](Apps/web/src/pages/GetStartedPage/GetStartedPage.tsx#L199).

Backend register schema is defined in [services/api/app/schemas/auth_schema.py](services/api/app/schemas/auth_schema.py#L26). Before the fix, parent_pin was required in this schema.

Step 1 form fields are in [Apps/web/src/components/GetStarted/StepParentAccount/StepParentAccount.tsx](Apps/web/src/components/GetStarted/StepParentAccount/StepParentAccount.tsx#L1) and do not collect a parent PIN.

## 3. What client is sending

Source: [Apps/web/src/pages/GetStartedPage/GetStartedPage.tsx](Apps/web/src/pages/GetStartedPage/GetStartedPage.tsx#L186)

The step-1 register payload contains:
- email
- password
- default_language
- timezone
- consents.terms
- consents.data_processing
- consents.analytics
- country (when selected)

It does not include parent_pin.

Representative payload:
{
  "email": "parent@example.com",
  "password": "StrongPass1!",
  "default_language": "en",
  "timezone": "Europe/Paris",
  "consents": {
    "terms": true,
    "data_processing": true,
    "analytics": false
  },
  "country": "FR"
}

## 4. What API was expecting

Source: [services/api/app/schemas/auth_schema.py](services/api/app/schemas/auth_schema.py#L26)

Before fix:
- parent_pin was required and validated as exactly 4 digits.

After fix:
- parent_pin is optional.
- if provided, it must still be exactly 4 digits.

## 5. Fix applied

### Backend changes

1. Made parent_pin optional in register schema:
- [services/api/app/schemas/auth_schema.py](services/api/app/schemas/auth_schema.py#L35)
- Validator updated to allow None and still enforce 4 digits when present:
  [services/api/app/schemas/auth_schema.py](services/api/app/schemas/auth_schema.py#L60)

2. Updated register service to hash parent_pin only when present:
- [services/api/app/services/auth_service.py](services/api/app/services/auth_service.py#L63)

This removes the 422 for step-1 web registration payloads.

## 6. Front validation rules

### Step 1 (Parent Account)

Source: [Apps/web/src/utils/validators.ts](Apps/web/src/utils/validators.ts#L156)

- email: required and format-validated.
- password: required, minimum 8, must include uppercase, lowercase, number, special.
- confirmPassword: required and must match password.
- country: required.
- agreedToTerms: must be true.

There is no parent PIN validation in step 1.

### Step 3 (Preferences)

Source: [Apps/web/src/utils/validators.ts](Apps/web/src/utils/validators.ts#L227)

- parentPinCode: required, exactly 4 digits.
- confirmPinCode: required and must match parentPinCode.

## 7. Back validation rules (Register)

Schema source: [services/api/app/schemas/auth_schema.py](services/api/app/schemas/auth_schema.py#L26)

- email: must be valid email.
- password: min length 8 plus complexity (uppercase, lowercase, number, special).
- country: optional, max length 100.
- default_language: length 2 to 10.
- timezone: length 2 to 100.
- consents: terms and data_processing required booleans; analytics optional boolean.
- parent_pin: optional; if present must be exactly 4 digits.
- extra fields are forbidden.

Service-level rules source: [services/api/app/services/auth_service.py](services/api/app/services/auth_service.py#L41)

- terms and data_processing must be accepted, otherwise 400.
- email must be unique, otherwise 409.

## 8. Notes

- The immediate 422 mismatch is fixed.
- Parent PIN is currently validated in web step 3, but the current web flow does not send that step-3 PIN to an API endpoint in this page flow. If product intent is to persist PIN during onboarding, a follow-up API call or flow change is needed.
