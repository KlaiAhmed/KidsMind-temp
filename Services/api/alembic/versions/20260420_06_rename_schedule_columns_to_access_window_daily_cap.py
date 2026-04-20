"""rename_schedule_columns_to_access_window_daily_cap

Revision ID: 20260420_06
Revises: 20260420_05
Create Date: 2026-04-20 13:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "20260420_06"
down_revision: Union[str, Sequence[str], None] = "20260420_05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def _column_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {column["name"] for column in inspector.get_columns(table_name)}


def _check_constraint_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {
        constraint["name"]
        for constraint in inspector.get_check_constraints(table_name)
        if constraint.get("name")
    }


def _rename_column_if_exists(table_name: str, old_name: str, new_name: str) -> bool:
    if not _table_exists(table_name):
        return False

    columns = _column_names(table_name)
    if old_name not in columns or new_name in columns:
        return False

    op.execute(sa.text(f"ALTER TABLE {table_name} RENAME COLUMN {old_name} TO {new_name}"))
    return True


def upgrade() -> None:
    renamed_week_schedule_cap = _rename_column_if_exists(
        "child_week_schedule",
        "max_duration_minutes",
        "daily_cap_seconds",
    )
    if renamed_week_schedule_cap:
        op.execute(
            sa.text(
                "UPDATE child_week_schedule "
                "SET daily_cap_seconds = daily_cap_seconds * 60 "
                "WHERE daily_cap_seconds IS NOT NULL"
            )
        )

    _rename_column_if_exists("child_week_schedule", "session_start_time", "access_window_start")
    _rename_column_if_exists("child_week_schedule", "session_end_time", "access_window_end")

    if _table_exists("child_week_schedule"):
        check_constraints = _check_constraint_names("child_week_schedule")
        if (
            "ck_child_week_schedule_max_duration_minutes" in check_constraints
            and "ck_child_week_schedule_daily_cap_seconds" not in check_constraints
        ):
            op.execute(
                sa.text(
                    "ALTER TABLE child_week_schedule "
                    "RENAME CONSTRAINT ck_child_week_schedule_max_duration_minutes "
                    "TO ck_child_week_schedule_daily_cap_seconds"
                )
            )

    renamed_schedule_subject_cap = _rename_column_if_exists(
        "child_schedule_subjects",
        "max_duration_minutes",
        "daily_cap_seconds",
    )
    if renamed_schedule_subject_cap:
        op.execute(
            sa.text(
                "UPDATE child_schedule_subjects "
                "SET daily_cap_seconds = daily_cap_seconds * 60 "
                "WHERE daily_cap_seconds IS NOT NULL"
            )
        )
    _rename_column_if_exists("child_schedule_subjects", "session_start_time", "access_window_start")
    _rename_column_if_exists("child_schedule_subjects", "session_end_time", "access_window_end")

    renamed_rules_cap = _rename_column_if_exists(
        "child_rules",
        "daily_limit_minutes",
        "daily_cap_seconds",
    )
    if renamed_rules_cap:
        op.execute(
            sa.text(
                "UPDATE child_rules "
                "SET daily_cap_seconds = daily_cap_seconds * 60 "
                "WHERE daily_cap_seconds IS NOT NULL"
            )
        )
    _rename_column_if_exists("child_rules", "time_window_start", "access_window_start")
    _rename_column_if_exists("child_rules", "time_window_end", "access_window_end")


def downgrade() -> None:
    renamed_rules_cap = _rename_column_if_exists(
        "child_rules",
        "daily_cap_seconds",
        "daily_limit_minutes",
    )
    if renamed_rules_cap:
        op.execute(
            sa.text(
                "UPDATE child_rules "
                "SET daily_limit_minutes = daily_limit_minutes / 60 "
                "WHERE daily_limit_minutes IS NOT NULL"
            )
        )
    _rename_column_if_exists("child_rules", "access_window_start", "time_window_start")
    _rename_column_if_exists("child_rules", "access_window_end", "time_window_end")

    renamed_schedule_subject_cap = _rename_column_if_exists(
        "child_schedule_subjects",
        "daily_cap_seconds",
        "max_duration_minutes",
    )
    if renamed_schedule_subject_cap:
        op.execute(
            sa.text(
                "UPDATE child_schedule_subjects "
                "SET max_duration_minutes = max_duration_minutes / 60 "
                "WHERE max_duration_minutes IS NOT NULL"
            )
        )
    _rename_column_if_exists("child_schedule_subjects", "access_window_start", "session_start_time")
    _rename_column_if_exists("child_schedule_subjects", "access_window_end", "session_end_time")

    renamed_week_schedule_cap = _rename_column_if_exists(
        "child_week_schedule",
        "daily_cap_seconds",
        "max_duration_minutes",
    )
    if renamed_week_schedule_cap:
        op.execute(
            sa.text(
                "UPDATE child_week_schedule "
                "SET max_duration_minutes = max_duration_minutes / 60 "
                "WHERE max_duration_minutes IS NOT NULL"
            )
        )

    _rename_column_if_exists("child_week_schedule", "access_window_start", "session_start_time")
    _rename_column_if_exists("child_week_schedule", "access_window_end", "session_end_time")

    if _table_exists("child_week_schedule"):
        check_constraints = _check_constraint_names("child_week_schedule")
        if (
            "ck_child_week_schedule_daily_cap_seconds" in check_constraints
            and "ck_child_week_schedule_max_duration_minutes" not in check_constraints
        ):
            op.execute(
                sa.text(
                    "ALTER TABLE child_week_schedule "
                    "RENAME CONSTRAINT ck_child_week_schedule_daily_cap_seconds "
                    "TO ck_child_week_schedule_max_duration_minutes"
                )
            )