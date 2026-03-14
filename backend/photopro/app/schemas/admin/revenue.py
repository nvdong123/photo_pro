from pydantic import BaseModel


class RevenueByPhotographer(BaseModel):
    photographer_code: str
    revenue: int
    order_count: int
    photo_count: int
    top_bundle: str | None


class RevenueByDate(BaseModel):
    date: str
    revenue: int
    order_count: int


class RevenueByBundle(BaseModel):
    bundle_name: str
    count: int
    revenue: int


class RevenueSummary(BaseModel):
    total_revenue: int
    total_orders: int
    avg_order_value: int
    top_bundle: str | None


class RevenueResponse(BaseModel):
    period: str
    from_date: str
    to_date: str
    summary: RevenueSummary
    by_photographer: list[RevenueByPhotographer]
    by_date: list[RevenueByDate]
    by_bundle: list[RevenueByBundle]
