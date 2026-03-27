"""
Child Profile Logic Utilities

Responsibility: Provides age calculation and education stage alignment logic.
Layer: Utils
Domain: Children
"""

from datetime import date
from enum import Enum


class EducationStage(str, Enum):
    """Enumeration of education stages supported by the system."""

    KINDERGARTEN = "KINDERGARTEN"
    PRIMARY = "PRIMARY"
    SECONDARY = "SECONDARY"


def get_age(birth_date: date) -> int:
    return (date.today() - birth_date).days // 365


def get_age_group(birth_date: date) -> str:
    age = get_age(birth_date)
    if age <= 6:
        return "3-6"
    if age <= 11:
        return "7-11"
    return "12-15"


def _expected_stage_for_age_group(age_group: str) -> EducationStage:
    mapping = {
        "3-6": EducationStage.KINDERGARTEN,
        "7-11": EducationStage.PRIMARY,
        "12-15": EducationStage.SECONDARY,
    }
    return mapping[age_group]


def evaluate_stage_alignment(birth_date: date, education_stage: EducationStage) -> tuple[bool, bool, EducationStage, str]:
    """
    Return alignment metadata for one child profile.

    Returns tuple:
    - is_accelerated (stage mismatches expected stage for age group)
    - is_below_expected_stage
    - expected_stage
    - age_group
    """
    age_group = get_age_group(birth_date)
    expected_stage = _expected_stage_for_age_group(age_group)
    is_accelerated = education_stage != expected_stage
    order = {
        EducationStage.KINDERGARTEN: 0,
        EducationStage.PRIMARY: 1,
        EducationStage.SECONDARY: 2,
    }
    is_below_expected_stage = order[education_stage] < order[expected_stage]
    return is_accelerated, is_below_expected_stage, expected_stage, age_group
