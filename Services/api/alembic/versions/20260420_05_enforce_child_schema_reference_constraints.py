"""enforce_child_schema_reference_constraints

Revision ID: 20260420_05
Revises: ad2ea6fe5ebc
Create Date: 2026-04-20 12:35:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260420_05"
down_revision: Union[str, Sequence[str], None] = "ad2ea6fe5ebc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text('CREATE EXTENSION IF NOT EXISTS "pgcrypto"'))

    # Align parent key type with UUID child foreign key columns.
    op.alter_column("child_profiles", "id", existing_type=sa.Integer(), server_default=None)
    op.alter_column(
        "child_profiles",
        "id",
        existing_type=sa.Integer(),
        type_=postgresql.UUID(as_uuid=True),
        postgresql_using="gen_random_uuid()",
    )
    op.alter_column(
        "child_profiles",
        "id",
        existing_type=postgresql.UUID(as_uuid=True),
        server_default=sa.text("gen_random_uuid()"),
    )

    op.create_unique_constraint(
        "uq_child_rules_child_profile_id",
        "child_rules",
        ["child_profile_id"],
    )

    op.create_foreign_key(
        "fk_child_rules_child_profile_id_child_profiles",
        "child_rules",
        "child_profiles",
        ["child_profile_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_child_allowed_subjects_child_profile_id_child_profiles",
        "child_allowed_subjects",
        "child_profiles",
        ["child_profile_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_child_week_schedule_child_profile_id_child_profiles",
        "child_week_schedule",
        "child_profiles",
        ["child_profile_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_child_week_schedule_child_profile_id_child_profiles",
        "child_week_schedule",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_child_allowed_subjects_child_profile_id_child_profiles",
        "child_allowed_subjects",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_child_rules_child_profile_id_child_profiles",
        "child_rules",
        type_="foreignkey",
    )
    op.drop_constraint(
        "uq_child_rules_child_profile_id",
        "child_rules",
        type_="unique",
    )

    op.execute(sa.text("CREATE SEQUENCE IF NOT EXISTS child_profiles_id_seq"))

    op.alter_column(
        "child_profiles",
        "id",
        existing_type=postgresql.UUID(as_uuid=True),
        server_default=None,
    )
    op.alter_column(
        "child_profiles",
        "id",
        existing_type=postgresql.UUID(as_uuid=True),
        type_=sa.Integer(),
        postgresql_using="nextval('child_profiles_id_seq')",
    )
    op.alter_column(
        "child_profiles",
        "id",
        existing_type=sa.Integer(),
        server_default=sa.text("nextval('child_profiles_id_seq'::regclass)"),
    )

    op.execute(sa.text("ALTER SEQUENCE child_profiles_id_seq OWNED BY child_profiles.id"))
