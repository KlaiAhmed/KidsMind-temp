"""refactor_child_rules_normalize_schedule_subjects

Revision ID: ad2ea6fe5ebc
Revises: a623968614f0
Create Date: 2026-04-20 11:21:02.665565

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'ad2ea6fe5ebc'
down_revision: Union[str, Sequence[str], None] = 'a623968614f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    inspector = inspect(op.get_bind())
    return table_name in inspector.get_table_names()


def _column_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_bind())
    return {column['name'] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if _table_exists('child_profiles') and 'xp' not in _column_names('child_profiles'):
        op.add_column(
            'child_profiles',
            sa.Column('xp', sa.Integer(), nullable=False, server_default=sa.text('0')),
        )
        op.alter_column('child_profiles', 'xp', server_default=None)

    if _table_exists('child_schedule_subjects'):
        op.drop_table('child_schedule_subjects')
    if _table_exists('child_week_schedule'):
        op.drop_table('child_week_schedule')
    if _table_exists('child_allowed_subjects'):
        op.drop_table('child_allowed_subjects')
    if _table_exists('child_rules'):
        op.drop_table('child_rules')

    op.create_table(
        'child_rules',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('child_profile_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('default_language', sa.Text(), nullable=True),
        sa.Column('homework_mode_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('voice_mode_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('audio_storage_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('conversation_history_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'child_allowed_subjects',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('child_profile_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('subject', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'child_profile_id',
            'subject',
            name='uq_child_allowed_subjects_child_profile_id_subject',
        ),
    )

    op.create_table(
        'child_week_schedule',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('child_profile_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('day_of_week', sa.SmallInteger(), nullable=False),
        sa.Column('session_start_time', sa.Time(), nullable=False),
        sa.Column('session_end_time', sa.Time(), nullable=False),
        sa.Column('max_duration_minutes', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.CheckConstraint('day_of_week BETWEEN 0 AND 6', name='ck_child_week_schedule_day_of_week'),
        sa.CheckConstraint('max_duration_minutes > 0', name='ck_child_week_schedule_max_duration_minutes'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'child_profile_id',
            'day_of_week',
            name='uq_child_week_schedule_child_profile_id_day_of_week',
        ),
    )

    op.create_table(
        'child_schedule_subjects',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('schedule_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('subject', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['schedule_id'], ['child_week_schedule.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('schedule_id', 'subject', name='uq_child_schedule_subjects_schedule_id_subject'),
    )


def downgrade() -> None:
    if _table_exists('child_schedule_subjects'):
        op.drop_table('child_schedule_subjects')
    if _table_exists('child_week_schedule'):
        op.drop_table('child_week_schedule')
    if _table_exists('child_allowed_subjects'):
        op.drop_table('child_allowed_subjects')
    if _table_exists('child_rules'):
        op.drop_table('child_rules')

    op.create_table(
        'child_rules',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('child_profile_id', sa.Integer(), nullable=False),
        sa.Column('default_language', sa.String(length=10), nullable=False, server_default=sa.text("'fr'")),
        sa.Column('daily_limit_minutes', sa.Integer(), nullable=True),
        sa.Column('allowed_subjects', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('blocked_subjects', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column('week_schedule', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('time_window_start', sa.Time(), nullable=True),
        sa.Column('time_window_end', sa.Time(), nullable=True),
        sa.Column('homework_mode_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('voice_mode_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('audio_storage_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('conversation_history_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column(
            'content_safety_level',
            postgresql.ENUM('strict', 'moderate', name='content_safety_level_enum', create_type=False),
            nullable=False,
            server_default=sa.text("'strict'"),
        ),
        sa.Column('_original_settings_json', sa.Text(), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(
            ['child_profile_id'],
            ['child_profiles.id'],
            ondelete='CASCADE',
            name='child_rules_child_profile_id_fkey',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('child_profile_id', name='uq_child_rules_child_profile_id'),
    )
    op.create_index('ix_child_rules_child_profile_id', 'child_rules', ['child_profile_id'], unique=False)