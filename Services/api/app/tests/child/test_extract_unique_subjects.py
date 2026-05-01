"""Tests for extract_unique_subjects utility.

Covers: Pydantic model input, dict input, duplicate removal,
missing subject key, blank/invalid subject values.
"""

import pytest

from schemas.child.child_profile_schema import ChildAllowedSubjectIn, AccessWindowSubjectIn
from utils.child.subject_helpers import extract_unique_subjects


class TestExtractUniqueSubjects:
    @staticmethod
    def _run(items):
        return extract_unique_subjects(items)

    def test_pydantic_model_input(self):
        items = [
            ChildAllowedSubjectIn(subject="math"),
            ChildAllowedSubjectIn(subject="science"),
        ]
        assert self._run(items) == ["math", "science"]

    def test_dict_input(self):
        items = [
            {"subject": "math"},
            {"subject": "science"},
        ]
        assert self._run(items) == ["math", "science"]

    def test_mixed_pydantic_and_dict_input(self):
        items = [
            ChildAllowedSubjectIn(subject="math"),
            {"subject": "science"},
        ]
        assert self._run(items) == ["math", "science"]

    def test_duplicate_subjects_removed_preserving_order(self):
        items = [
            {"subject": "math"},
            {"subject": "science"},
            {"subject": "math"},
            {"subject": "history"},
        ]
        assert self._run(items) == ["math", "science", "history"]

    def test_duplicate_pydantic_subjects_removed(self):
        items = [
            ChildAllowedSubjectIn(subject="math"),
            ChildAllowedSubjectIn(subject="math"),
            ChildAllowedSubjectIn(subject="art"),
        ]
        assert self._run(items) == ["math", "art"]

    def test_empty_list_returns_empty(self):
        assert self._run([]) == []

    def test_single_item(self):
        assert self._run([{"subject": "math"}]) == ["math"]

    def test_access_window_subject_in_pydantic_model(self):
        items = [
            AccessWindowSubjectIn(subject="reading"),
            AccessWindowSubjectIn(subject="writing"),
        ]
        assert self._run(items) == ["reading", "writing"]

    def test_dict_missing_subject_key_raises(self):
        with pytest.raises(ValueError, match="missing required 'subject' key"):
            self._run([{"name": "oops"}])

    def test_dict_blank_subject_raises(self):
        with pytest.raises(ValueError, match="non-blank string"):
            self._run([{"subject": "   "}])

    def test_dict_empty_subject_raises(self):
        with pytest.raises(ValueError, match="non-blank string"):
            self._run([{"subject": ""}])
