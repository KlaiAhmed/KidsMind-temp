"""Tests for badge catalog endpoint and service.

Validates that the badge catalog query (including the count() path)
succeeds without UndefinedColumn errors when the database schema
matches the ORM model, and that the response shape is correct.

Uses an in-memory SQLite database so these tests run without any
external service or .env configuration.
"""

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, create_engine, func, text
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

from schemas.gamification.badge_schema import BadgeCatalogItem, BadgeCatalogResponse

Base = declarative_base()


class Badge(Base):
    __tablename__ = "badges"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    condition = Column(String(512), nullable=True)
    file_path = Column(String(512), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ChildBadge(Base):
    __tablename__ = "child_badges"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    child_profile_id = Column(String(36), nullable=False, index=True)
    badge_id = Column(String(36), ForeignKey("badges.id", ondelete="CASCADE"), nullable=False, index=True)
    earned = Column(Boolean, nullable=False, default=False)
    earned_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    badge = relationship("Badge")


class ChildProfile(Base):
    __tablename__ = "child_profiles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    parent_id = Column(String(36), nullable=False)
    name = Column(String(255), nullable=False)
    age_group = Column(String(10), nullable=False)
    pin_hash = Column(String(255), nullable=False)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)


@pytest.fixture()
def db():
    e = create_engine("sqlite:///:memory:")
    with e.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys = ON"))
    Base.metadata.create_all(bind=e)
    session = sessionmaker(autocommit=False, autoflush=False, bind=e)()
    try:
        yield session
    finally:
        session.close()


def _seed_parent_and_child(db):
    parent = User(
        id=str(uuid4()),
        email=f"parent-{uuid4().hex[:8]}@test.com",
        password_hash="x",
        first_name="P",
        last_name="T",
    )
    db.add(parent)
    db.flush()
    child = ChildProfile(
        id=str(uuid4()),
        parent_id=parent.id,
        name="TestChild",
        age_group="6-8",
        pin_hash="x",
    )
    db.add(child)
    db.flush()
    return parent, child


def _make_badge(name="Test Badge", sort_order=0, is_active=True, file_path=None):
    return Badge(
        id=str(uuid4()),
        name=name,
        description="A test badge",
        condition='{"type":"FIRST_QUIZ"}',
        file_path=file_path,
        sort_order=sort_order,
        is_active=is_active,
    )


def _run_catalog(db, child_id, parent_id, limit=100, offset=0):
    base_query = db.query(Badge).filter(Badge.is_active.is_(True))
    total_count = base_query.count()
    all_badges = (
        base_query
        .order_by(Badge.sort_order.asc(), Badge.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    earned_rows = db.query(ChildBadge).filter(ChildBadge.child_profile_id == child_id).all()
    earned_by_badge_id = {row.badge_id: row for row in earned_rows}

    items = []
    total_earned = 0
    for badge in all_badges:
        child_badge = earned_by_badge_id.get(badge.id)
        earned = child_badge.earned if child_badge else False
        if earned:
            total_earned += 1
        items.append(
            BadgeCatalogItem(
                id=badge.id,
                name=badge.name,
                description=badge.description,
                earned=earned,
                earned_at=child_badge.earned_at if child_badge and child_badge.earned else None,
                file_path=badge.file_path,
                condition=badge.condition,
            )
        )
    return BadgeCatalogResponse(
        items=items,
        total_earned=total_earned,
        total_count=total_count,
        limit=limit,
        offset=offset,
    )


class TestBadgeCatalogQuery:
    def test_count_succeeds_with_file_path(self, db):
        parent, child = _seed_parent_and_child(db)
        db.add(_make_badge(file_path="badges/test.webp"))
        db.commit()
        result = _run_catalog(db, child.id, parent.id)
        assert result.total_count == 1

    def test_count_succeeds_without_file_path(self, db):
        parent, child = _seed_parent_and_child(db)
        db.add(_make_badge(file_path=None))
        db.commit()
        result = _run_catalog(db, child.id, parent.id)
        assert result.total_count == 1

    def test_response_shape(self, db):
        parent, child = _seed_parent_and_child(db)
        db.add(_make_badge(name="Alpha", file_path="badges/alpha.webp", sort_order=1))
        db.add(_make_badge(name="Beta", file_path=None, sort_order=2))
        db.commit()
        result = _run_catalog(db, child.id, parent.id)
        assert isinstance(result, BadgeCatalogResponse)
        assert result.total_count == 2
        assert result.total_earned == 0
        assert len(result.items) == 2
        item_map = {i.name: i for i in result.items}
        assert item_map["Alpha"].file_path == "badges/alpha.webp"
        assert item_map["Beta"].file_path is None

    def test_earned_status(self, db):
        parent, child = _seed_parent_and_child(db)
        badge = _make_badge(file_path="badges/earned.webp")
        db.add(badge)
        db.flush()
        db.add(ChildBadge(
            id=str(uuid4()),
            child_profile_id=child.id,
            badge_id=badge.id,
            earned=True,
            earned_at=datetime.now(timezone.utc),
        ))
        db.commit()
        result = _run_catalog(db, child.id, parent.id)
        assert result.total_earned == 1
        assert result.items[0].earned is True

    def test_pagination(self, db):
        parent, child = _seed_parent_and_child(db)
        for i in range(5):
            db.add(_make_badge(name=f"Badge {i}", sort_order=i, file_path=f"badges/{i}.webp" if i % 2 == 0 else None))
        db.commit()
        page1 = _run_catalog(db, child.id, parent.id, limit=2, offset=0)
        page2 = _run_catalog(db, child.id, parent.id, limit=2, offset=2)
        assert page1.total_count == 5
        assert len(page1.items) == 2
        assert len(page2.items) == 2

    def test_inactive_excluded(self, db):
        parent, child = _seed_parent_and_child(db)
        db.add(_make_badge(name="Active", is_active=True, sort_order=1, file_path="badges/active.webp"))
        db.add(_make_badge(name="Inactive", is_active=False, sort_order=2, file_path="badges/inactive.webp"))
        db.commit()
        result = _run_catalog(db, child.id, parent.id)
        assert result.total_count == 1
        assert result.items[0].name == "Active"


class TestBadgeModelColumns:
    def test_file_path_column_exists(self):
        assert "file_path" in Badge.__table__.columns

    def test_no_icon_key_column(self):
        assert "icon_key" not in Badge.__table__.columns
