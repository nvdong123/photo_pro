"""
Backfill script: set price_at_purchase on OrderItems that were saved with 0.

For each PAID order where at least one item has price_at_purchase = 0:
  - Distribute order.amount evenly across all items
  - Last item gets any rounding remainder so SUM == order.amount
  - Also updates OrderPhoto.price_at_purchase to match

Run inside the container:
  python scripts/backfill_order_item_prices.py
"""
import asyncio
import sys

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.models.order import Order, OrderItem, OrderPhoto, OrderStatus


async def backfill(db: AsyncSession) -> None:
    # Find PAID orders that have any item with price_at_purchase = 0
    orders_result = await db.execute(
        select(Order)
        .where(Order.status == OrderStatus.PAID)
        .where(
            Order.id.in_(
                select(OrderItem.order_id)
                .where(OrderItem.price_at_purchase == 0)
                .distinct()
            )
        )
    )
    orders = orders_result.scalars().all()

    if not orders:
        print("No orders need backfilling.")
        return

    print(f"Found {len(orders)} orders to backfill...")

    total_updated = 0
    for order in orders:
        items_result = await db.execute(
            select(OrderItem)
            .where(OrderItem.order_id == order.id)
            .order_by(OrderItem.id)
        )
        items = items_result.scalars().all()
        n = len(items)
        if n == 0:
            continue

        per_photo = order.amount // n
        remainder = order.amount % n

        for idx, item in enumerate(items):
            price = per_photo + (remainder if idx == n - 1 else 0)
            item.price_at_purchase = price

            # Update matching OrderPhoto if it exists
            await db.execute(
                update(OrderPhoto)
                .where(
                    OrderPhoto.order_id == order.id,
                    OrderPhoto.media_id == item.media_id,
                )
                .values(price_at_purchase=price)
            )

        total_updated += n
        print(f"  Order {order.order_code}: {n} items × {per_photo}đ (remainder {remainder}đ on last)")

    await db.commit()
    print(f"\nBackfill complete. Updated {total_updated} order_items.")


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with SessionLocal() as db:
            await backfill(db)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
