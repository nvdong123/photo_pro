from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bundle import BundlePricing


@dataclass
class PackLine:
    bundle_id: str
    bundle_name: str
    photo_count: int
    quantity: int
    subtotal: int


@dataclass
class PackResult:
    lines: list[PackLine] = field(default_factory=list)
    total_amount: int = 0
    total_photos_included: int = 0


async def suggest_pack(photo_count: int, db: AsyncSession) -> PackResult:
    """
    Greedy algorithm: prefer the largest bundle to minimise cost.
    k=1  → [gói1×1]           20k
    k=2  → [gói3×1]           50k  (bundle rounding is fine)
    k=9  → [gói8×1, gói1×1] 120k
    k=11 → [gói8×1, gói3×1] 150k
    k=16 → [gói8×2]          200k
    """
    result = await db.execute(
        select(BundlePricing)
        .where(BundlePricing.is_active.is_(True), BundlePricing.deleted_at.is_(None))
        .order_by(BundlePricing.photo_count.desc())
    )
    bundles = result.scalars().all()
    if not bundles:
        raise ValueError("Không có gói giá nào đang hoạt động")

    pack = PackResult()
    remaining = photo_count

    for i, bundle in enumerate(bundles):
        if remaining <= 0:
            break
        qty = remaining // bundle.photo_count
        if qty == 0:
            # Round up: find the smallest bundle (from this position onwards) whose
            # photo_count covers `remaining` in a single purchase.
            covering = [b for b in bundles[i:] if b.photo_count >= remaining]
            chosen = covering[-1] if covering else bundles[-1]
            pack.lines.append(
                PackLine(
                    bundle_id=str(chosen.id),
                    bundle_name=chosen.name,
                    photo_count=chosen.photo_count,
                    quantity=1,
                    subtotal=chosen.price,
                )
            )
            remaining = 0
            break
        pack.lines.append(
            PackLine(
                bundle_id=str(bundle.id),
                bundle_name=bundle.name,
                photo_count=bundle.photo_count,
                quantity=qty,
                subtotal=qty * bundle.price,
            )
        )
        remaining -= qty * bundle.photo_count

    pack.total_amount = sum(line.subtotal for line in pack.lines)
    pack.total_photos_included = sum(
        line.photo_count * line.quantity for line in pack.lines
    )
    return pack
