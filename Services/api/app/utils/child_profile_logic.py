"""
Child Profile Logic Utilities

Responsibility: Provides age calculation and education stage derivation logic.
Layer: Utils
Domain: Children
"""

from dataclasses import dataclass
from datetime import date
from enum import Enum


MIN_PROFILE_AGE = 3
MAX_PROFILE_AGE = 15

AGE_GROUP_3_6 = "3-6"
AGE_GROUP_7_11 = "7-11"
AGE_GROUP_12_15 = "12-15"

AGE_GROUP_ORDER = {
    AGE_GROUP_3_6: 0,
    AGE_GROUP_7_11: 1,
    AGE_GROUP_12_15: 2,
}


class EducationStage(str, Enum):
    """Enumeration of education stages supported by the system."""

    KINDERGARTEN = "KINDERGARTEN"
    PRIMARY = "PRIMARY"
    SECONDARY = "SECONDARY"


def get_age(birth_date: date) -> int:
    return (date.today() - birth_date).days // 365


def get_age_group_from_age(age: int, *, strict: bool = False) -> str:
    if strict and (age < MIN_PROFILE_AGE or age > MAX_PROFILE_AGE):
        raise ValueError(f"age must be between {MIN_PROFILE_AGE} and {MAX_PROFILE_AGE}")

    if age <= 6:
        return AGE_GROUP_3_6
    if age <= 11:
        return AGE_GROUP_7_11
    return AGE_GROUP_12_15


def get_age_group(birth_date: date) -> str:
    return get_age_group_from_age(get_age(birth_date), strict=False)


def infer_birth_date_from_age(age: int, *, reference_date: date | None = None) -> date:
    if age < MIN_PROFILE_AGE or age > MAX_PROFILE_AGE:
        raise ValueError(f"age must be between {MIN_PROFILE_AGE} and {MAX_PROFILE_AGE}")

    today = reference_date or date.today()
    try:
        return today.replace(year=today.year - age)
    except ValueError:
        # Handles leap-day replacement for non-leap years.
        return today.replace(year=today.year - age, day=28)


def normalize_education_stage(education_stage: EducationStage | str) -> EducationStage:
    raw_stage = education_stage.value if isinstance(education_stage, EducationStage) else str(education_stage)
    canonical = raw_stage.strip().upper()
    if canonical == "PRIMARY_SCHOOL":
        canonical = EducationStage.PRIMARY.value

    if canonical == EducationStage.KINDERGARTEN.value:
        return EducationStage.KINDERGARTEN
    if canonical == EducationStage.PRIMARY.value:
        return EducationStage.PRIMARY
    if canonical == EducationStage.SECONDARY.value:
        return EducationStage.SECONDARY
    raise ValueError("education_stage must be one of KINDERGARTEN, PRIMARY, SECONDARY")


def get_standard_age_group_for_stage(education_stage: EducationStage | str) -> str:
    canonical_stage = normalize_education_stage(education_stage)
    if canonical_stage == EducationStage.KINDERGARTEN:
        return AGE_GROUP_3_6
    if canonical_stage == EducationStage.PRIMARY:
        return AGE_GROUP_7_11
    return AGE_GROUP_12_15


def _normalize_age_group(age_group: str) -> str:
    normalized = age_group.strip()
    if normalized not in AGE_GROUP_ORDER:
        raise ValueError("age_group must be one of 3-6, 7-11, 12-15")
    return normalized


@dataclass(frozen=True)
class StudentProfileDerivation:
    birth_date: date
    age: int
    age_group: str
    education_stage: EducationStage
    standard_age_group: str
    is_accelerated: bool
    is_over_age: bool


def _expected_stage_for_age_group(age_group: str) -> EducationStage:
    mapping = {
        AGE_GROUP_3_6: EducationStage.KINDERGARTEN,
        AGE_GROUP_7_11: EducationStage.PRIMARY,
        AGE_GROUP_12_15: EducationStage.SECONDARY,
    }
    return mapping[_normalize_age_group(age_group)]


def derive_student_profile_fields(
    *,
    education_stage: EducationStage | str,
    birth_date: date | None = None,
    age: int | None = None,
    age_group: str | None = None,
    input_is_accelerated: bool | None = None,
    input_is_over_age: bool | None = None,
) -> StudentProfileDerivation:
    if input_is_accelerated is True and input_is_over_age is True:
        raise ValueError("is_accelerated and is_over_age cannot both be true")

    if birth_date is None and age is None:
        raise ValueError("Either birth_date or age must be provided")

    if birth_date is not None and birth_date > date.today():
        raise ValueError("birth_date cannot be in the future")

    if age is not None and (age < MIN_PROFILE_AGE or age > MAX_PROFILE_AGE):
        raise ValueError(f"age must be between {MIN_PROFILE_AGE} and {MAX_PROFILE_AGE}")

    computed_age = age
    if birth_date is not None:
        computed_from_birth_date = get_age(birth_date)
        if computed_from_birth_date < MIN_PROFILE_AGE or computed_from_birth_date > MAX_PROFILE_AGE:
            raise ValueError("birth_date must correspond to an age between 3 and 15")
        if age is not None and age != computed_from_birth_date:
            raise ValueError("age does not match birth_date")
        computed_age = computed_from_birth_date
    else:
        assert age is not None
        birth_date = infer_birth_date_from_age(age=age)

    resolved_age_group = get_age_group_from_age(computed_age, strict=True)
    if age_group is not None:
        provided_age_group = _normalize_age_group(age_group)
        if provided_age_group != resolved_age_group:
            raise ValueError("age_group does not match age")

    resolved_stage = normalize_education_stage(education_stage)
    standard_age_group = get_standard_age_group_for_stage(resolved_stage)

    is_accelerated = AGE_GROUP_ORDER[resolved_age_group] < AGE_GROUP_ORDER[standard_age_group]
    is_over_age = AGE_GROUP_ORDER[resolved_age_group] > AGE_GROUP_ORDER[standard_age_group]

    if input_is_accelerated is not None and input_is_accelerated != is_accelerated:
        raise ValueError("is_accelerated is derived from age and education_stage")
    if input_is_over_age is not None and input_is_over_age != is_over_age:
        raise ValueError("is_over_age is derived from age and education_stage")
    if is_accelerated and is_over_age:
        raise ValueError("is_accelerated and is_over_age cannot both be true")

    return StudentProfileDerivation(
        birth_date=birth_date,
        age=computed_age,
        age_group=resolved_age_group,
        education_stage=resolved_stage,
        standard_age_group=standard_age_group,
        is_accelerated=is_accelerated,
        is_over_age=is_over_age,
    )


def evaluate_stage_alignment(birth_date: date, education_stage: EducationStage) -> tuple[bool, bool, EducationStage, str]:
    """
    Return alignment metadata for one child profile.

    Returns tuple:
    - is_accelerated (child is younger than standard age group for education stage)
    - is_below_expected_stage
    - expected_stage
    - age_group
    """
    derived = derive_student_profile_fields(
        education_stage=education_stage,
        birth_date=birth_date,
    )
    expected_stage = _expected_stage_for_age_group(derived.age_group)
    is_below_expected_stage = derived.is_over_age
    return derived.is_accelerated, is_below_expected_stage, expected_stage, derived.age_group
