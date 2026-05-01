"""Regression test for the ChildRulesUpdate allowed_subjects bug.

Verifies that payload.model_dump(exclude_unset=True) no longer
produces dicts that break .subject attribute access, and that
payload.allowed_subjects / payload.week_schedule retain their
Pydantic model types through the update path.
"""

from schemas.child.child_profile_schema import (
    ChildAllowedSubjectIn,
    ChildRulesUpdate,
    AccessWindowIn,
    AccessWindowSubjectIn,
)


class TestChildRulesUpdatePayload:
    def test_allowed_subjects_remain_pydantic_models(self):
        payload = ChildRulesUpdate(
            allowed_subjects=[
                ChildAllowedSubjectIn(subject="math"),
                ChildAllowedSubjectIn(subject="science"),
            ]
        )
        for item in payload.allowed_subjects:
            assert isinstance(item, ChildAllowedSubjectIn)
            assert hasattr(item, "subject")

    def test_model_dump_serializes_allowed_subjects_to_dicts(self):
        payload = ChildRulesUpdate(
            allowed_subjects=[
                ChildAllowedSubjectIn(subject="math"),
            ]
        )
        dump = payload.model_dump(exclude_unset=True)
        dumped_subjects = dump["allowed_subjects"]
        assert isinstance(dumped_subjects, list)
        assert isinstance(dumped_subjects[0], dict)
        assert dumped_subjects[0]["subject"] == "math"

    def test_payload_attribute_preserves_model_type_after_dump(self):
        payload = ChildRulesUpdate(
            allowed_subjects=[ChildAllowedSubjectIn(subject="reading")]
        )
        dump = payload.model_dump(exclude_unset=True)
        _ = dump.pop("allowed_subjects", None)
        assert payload.allowed_subjects is not None
        for item in payload.allowed_subjects:
            assert isinstance(item, ChildAllowedSubjectIn)
            assert item.subject == "reading"

    def test_week_schedule_remain_pydantic_models(self):
        payload = ChildRulesUpdate(
            week_schedule=[
                AccessWindowIn(
                    day_of_week=0,
                    access_window_start="08:00",
                    access_window_end="10:00",
                    daily_cap_seconds=7200,
                    subjects=[AccessWindowSubjectIn(subject="math")],
                )
            ]
        )
        for item in payload.week_schedule:
            assert isinstance(item, AccessWindowIn)
            assert hasattr(item, "day_of_week")
            for subj in item.subjects:
                assert isinstance(subj, AccessWindowSubjectIn)
                assert hasattr(subj, "subject")

    def test_unset_allowed_subjects_is_none(self):
        payload = ChildRulesUpdate(default_language="en")
        assert payload.allowed_subjects is None
        dump = payload.model_dump(exclude_unset=True)
        assert "allowed_subjects" not in dump

    def test_empty_allowed_subjects_list(self):
        payload = ChildRulesUpdate(allowed_subjects=[])
        assert payload.allowed_subjects is not None
        assert len(payload.allowed_subjects) == 0
        dump = payload.model_dump(exclude_unset=True)
        assert dump["allowed_subjects"] == []
