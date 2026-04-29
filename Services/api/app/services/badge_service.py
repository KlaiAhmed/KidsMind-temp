"""
Badge Service

Responsibility: Implements business logic for badge retrieval.
Layer: Service
Domain: Children / Badges
"""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.badge import Badge, ChildBadge
from models.child_profile import ChildProfile
from schemas.badge_schema import BadgeCatalogItem, BadgeCatalogResponse


class BadgeService:
    def __init__(self, db: Session):
        self.db = db

    def _require_child_for_parent(self, child_id: UUID, parent_id: UUID) -> ChildProfile:
        child = self.db.query(ChildProfile).filter(ChildProfile.id == child_id).first()
        if not child:
            raise HTTPException(status_code=404, detail="Child profile not found")
        if child.parent_id != parent_id:
            raise HTTPException(status_code=403, detail="Access denied")
        return child

    def get_badge_catalog(
        self,
        child_id: UUID,
        parent_id: UUID,
        *,
        limit: int = 100,
        offset: int = 0,
    ) -> BadgeCatalogResponse:
        self._require_child_for_parent(child_id, parent_id)

        base_query = self.db.query(Badge).filter(Badge.is_active.is_(True))
        total_count = base_query.count()

        all_badges = (
            base_query
            .order_by(Badge.sort_order.asc(), Badge.id.asc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        earned_rows = (
            self.db.query(ChildBadge)
            .filter(ChildBadge.child_profile_id == child_id)
            .all()
        )
        earned_by_badge_id = {row.badge_id: row for row in earned_rows}

        items: list[BadgeCatalogItem] = []
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
