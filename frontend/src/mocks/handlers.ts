import { http, HttpResponse } from "msw";

const BASE = "http://localhost:8000";

export const handlers = [
  http.post(`${BASE}/api/v1/search/face`, () =>
    HttpResponse.json({
      success: true,
      data: {
        results: [
          {
            media_id: "uuid-1",
            similarity: 96.5,
            thumb_url: "https://mock.test/thumb1.jpg",
            shoot_date: "2026-03-06",
            photographer_code: "PH001",
            album_code: null,
          },
        ],
        total: 1,
      },
    })
  ),

  http.post(`${BASE}/api/v1/cart/session`, () =>
    HttpResponse.json({ success: true, data: {} })
  ),

  http.get(`${BASE}/api/v1/cart`, () =>
    HttpResponse.json({
      success: true,
      data: { items: [], count: 0, suggested_pack: null },
    })
  ),

  http.post(`${BASE}/api/v1/cart/items`, () =>
    HttpResponse.json({ success: true, data: {} })
  ),

  http.delete(`${BASE}/api/v1/cart/items/:mediaId`, () =>
    HttpResponse.json({ success: true, data: {} })
  ),

  http.delete(`${BASE}/api/v1/cart`, () =>
    HttpResponse.json({ success: true, data: {} })
  ),

  http.post(`${BASE}/api/v1/checkout`, () =>
    HttpResponse.json({
      success: true,
      data: {
        order_id: "order-uuid",
        order_code: "PP20260306ABCXYZ",
        payment_url: "https://vnpay.test",
      },
    })
  ),

  http.get(`${BASE}/api/v1/download/:token/info`, () =>
    HttpResponse.json({
      success: true,
      data: {
        order_code: "PP20260306ABCXYZ",
        is_active: true,
        photo_previews: [],
        expires_at: "2026-04-06T00:00:00Z",
        remaining_downloads: 9,
      },
    })
  ),

  http.get(`${BASE}/api/v1/search/albums`, () =>
    HttpResponse.json({
      success: true,
      data: { albums: [], total: 0 },
    })
  ),
];
