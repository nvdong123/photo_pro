# PhotoPro V1 – Copilot Chat Prompts

---

## 🏗️ Tuần 1 – Foundation + Pipeline

```
@workspace Tạo toàn bộ SQLAlchemy models theo skill-01-models-schema.md:
Media, Tag, MediaTag, BundlePricing, Order, OrderItem, DigitalDelivery,
AdminUser, SystemSetting. Thêm alembic migration và seed.py.
```

```
@workspace Tạo FaceServiceClient trong app/services/face_client.py theo skill-02.
httpx async, retry 3 lần, không truyền business_id (single-tenant).
```

```
@workspace Implement Celery task scan_upload_folder trong app/workers/media_worker.py.
Parse shoot_date/photographer_code/album_code từ path. Upload S3. Tạo Media record.
Tạo hoặc lookup Tag album. Set expires_at từ SystemSetting["media_ttl_days"].
Idempotent - skip file đã có. ThreadPoolExecutor 20 workers.
```

```
@workspace Implement Celery task create_derivatives. Pillow: thumbnail 300px +
preview 1200px với watermark overlay (opacity từ SystemSetting). Stream S3, không ghi disk.
Dispatch index_faces sau khi xong. Spec trong skill-02-media-pipeline.md.
```

```
@workspace Implement Celery task index_faces. Presigned URL 10 phút cho Face Service.
Gọi face_client.index_photo(). Update has_face, face_count, status. Retry khi 503.
Chỉ index JPG/JPEG. Spec trong skill-02.
```

```
@workspace Implement Celery task cleanup_expired (cron mỗi 1h).
Logic 2 bước: (1) delivery hết hạn → xóa tag order → xóa S3 nếu media cũng hết hạn.
(2) media TTL hết hạn → skip nếu còn delivery active. Spec trong skill-02.
```

---

## 🔍 Tuần 1 – Search API

```
@workspace Implement POST /api/v1/search/face. Rate limit 10/min/IP (slowapi).
Tag filter logic: nếu có shoot_date → lấy media_ids theo ngày làm filter.
Batch load Media sau khi có kết quả từ Face Service. Cache presigned URL Redis 50 phút.
Spec trong skill-03-storefront.md.
```

---

## 🛒 Tuần 2 – Commerce

```
@workspace Implement suggest_pack() trong app/services/bundle_service.py.
Greedy algorithm, ưu tiên gói lớn. Viết unit tests cho k=1,2,3,4,8,9,11,16.
Spec trong skill-03.
```

```
@workspace Implement cart flow: CartSession model, POST /cart/session (httpOnly cookie),
GET /cart (với suggest_pack), POST /cart/items (validate INDEXED), DELETE /cart/items/{id}.
Spec trong skill-03.
```

```
@workspace Implement POST /api/v1/checkout trong 1 DB transaction.
Generate order_code "PP"+YYYYMMDD+6random. Denormalize photographer_code vào OrderItem.
Gọi VNPayService. Rollback nếu lỗi. Spec trong skill-03.
```

```
@workspace Implement VNPayService: create_payment_url() HMAC-SHA512,
verify_webhook() verify signature.
Implement POST /api/v1/payment/webhook/vnpay: idempotent, tạo DigitalDelivery với
expires_at từ SystemSetting["link_ttl_days"], gắn tag "order_{order_code}" vào ảnh.
Spec trong skill-03.
```

```
@workspace Implement download endpoints: GET /download/{token}/info (không tăng count),
GET /download/{token} (presigned URLs, tăng count), GET /download/{token}/zip (streaming ZIP
dùng zipstream-ng, không buffer). Spec trong skill-03.
```

---

## 👨‍💼 Tuần 2 – Admin

```
@workspace Implement admin auth và RBAC: AdminUser model, login endpoint bcrypt,
JWT, dependency require_roles(*roles). Shortcuts: require_any/require_sales/require_system.
Spec trong skill-04-admin.md.
```

```
@workspace Implement GET /api/v1/admin/revenue với period="today|week|month|quarter|year|custom".
Helper resolve_period(). 3 queries: summary, by_photographer (với MODE()), by_date, by_bundle.
Spec trong skill-04.
```

```
@workspace Implement DELETE /api/v1/admin/media/folder [SYSTEM only].
Require confirm=True trong body. Batch soft delete media + batch S3 delete.
Spec trong skill-04.
```

```
@workspace Implement GET/PATCH /api/v1/admin/settings [SYSTEM only].
Validate ALLOWED_SETTING_KEYS + value range. Lưu updated_by. Spec trong skill-04.
```

---

## 🔌 Frontend – Nối API (React)

```
@workspace Tạo src/lib/api-client.ts theo skill-05-frontend.md.
fetch wrapper với auto-attach Bearer token, handle 401 redirect,
parse APIResponse{success, data, error}. Export apiClient + API_BASE.
```

```
@workspace Tạo src/hooks/useAsync.ts generic hook. Sau đó tạo các hooks:
useFaceSearch, useAlbums, useCart, useCheckout, useDownloadInfo
theo đúng endpoint spec trong skill-05. Không sửa UI component nào.
```

```
@workspace Tìm tất cả chỗ dùng mock data trong customer site (MOCK_*, mockData.*, useState với hardcode array).
Thay từng cái bằng hook tương ứng từ skill-05. Giữ nguyên JSX, chỉ đổi data source.
```

```
@workspace Tạo src/hooks/useAdminAuth.ts với login, logout, can.* RBAC helper.
Sau đó tìm các component admin dùng mock auth/role và thay bằng useAdminAuth.
can.deleteFolder và can.changeSettings chỉ true với role SYSTEM.
```

```
@workspace Thay mock data trong admin dashboard: useRevenue (kết nối Chart.js labels/data),
useOrders (pagination), useBundles (CRUD), useSettings.
Spec chi tiết trong skill-05-frontend.md section 9-10.
```

---

## 🧪 Testing

```
@workspace Tạo tests/conftest.py đầy đủ theo skill-07-testing.md.
Bao gồm: engine fixture, db_session (rollback sau mỗi test), client fixture với
dependency override, mock_face_client, mock_s3, mock_payment, mock_email,
và factory helpers create_test_media / create_test_admin.
```

```
@workspace Tạo toàn bộ unit tests trong tests/unit/ theo skill-07:
- test_bundle_service.py: parametrize 9 cases k=1,2,3,4,8,9,11,16,17
- test_payment_service.py: VNPay signature + verify
- test_media_parser.py: parse path convention
Chạy được với: pytest tests/unit/ -v
```

```
@workspace Tạo integration tests trong tests/integration/ theo skill-07.
Ưu tiên theo thứ tự: test_search_api.py → test_cart_api.py →
test_payment_api.py (idempotent webhook) → test_download_api.py → test_admin_api.py (RBAC).
```

```
@workspace Tạo tests/e2e/test_purchase_flow.py - full flow:
search face → add 3 ảnh vào cart → checkout → VNPay webhook PAID →
verify delivery + tag gắn vào ảnh → download info → download ZIP → verify email gửi.
Theo đúng spec trong skill-07-testing.md.
```

```
@workspace Setup MSW cho React tests: tạo src/mocks/handlers.ts + src/mocks/server.ts
+ jest.setup.ts theo skill-07. Sau đó tạo tests cho hooks:
useFaceSearch (success + error), useCheckout (redirect payment_url),
useDownloadInfo (expired token → is_active=false).
```

```
@workspace Tạo .github/workflows/ci.yml theo skill-07-testing.md.
Chạy backend (pytest unit + integration + e2e) và frontend (Jest) song song.
Service: postgres pgvector + redis. Upload coverage lên Codecov.
Block merge nếu test fail.
```

---

## 🔄 Cập nhật v2 (spec-v2.md)

```
@workspace Đọc .github/skills/skill-01-models-schema.md (v2).
Cập nhật model AdminUser → Staff (thêm role STAFF, employee_code).
Thêm StaffLocationAssignment model. Thêm OrderPhoto model.
Cập nhật Tag model (thêm tag_type, is_permanent, order_id).
Cập nhật Media model (thêm photo_status AVAILABLE/SOLD, uploader_id FK tới Staff).
Tạo alembic migration mới cho các thay đổi này.
Tạo view v_staff_statistics theo SQL trong skill-01.
```

```
@workspace Đọc .github/skills/skill-03-storefront.md (v2).
Cập nhật face search: thêm filter date_from/date_to, loại media có photo_status='sold'.
Cập nhật cart: validate photo_status='available' trước khi add, raise MEDIA_ALREADY_SOLD.
Cập nhật payment webhook: thêm logic di chuyển ảnh sau PAID —
  a) tạo Tag type='order' is_permanent=True,
  b) copy S3 object sang orders/{order_id}/, xóa key cũ,
  c) xóa MediaTag location, tạo MediaTag order,
  d) set media.photo_status='sold', media.expires_at=None,
  e) tạo OrderPhoto record.
Thêm method copy_object vào StorageService.
```

```
@workspace Đọc .github/skills/skill-04-admin.md (v2).
Cập nhật RBAC: thêm role STAFF vào require_roles, SIDEBAR_PERMISSIONS.
Tạo app/api/v1/admin/locations.py (thay albums): CRUD + staff assignment endpoints.
GET /locations/:id/photos filter theo role (STAFF chỉ thấy ảnh mình).
Tạo app/api/v1/admin/staff_stats.py: GET /statistics (admin), GET /statistics/me (staff),
GET /statistics/:id/revenue. Query từ view v_staff_statistics.
Cập nhật staff endpoints: thêm employee_code auto-generate, location_ids khi role=STAFF.
Cập nhật settings: thêm primary_color/accent_color, xóa auto_delete_mode.
Cập nhật orders/:id response: thêm photos[] từ order_photos, delivery object.
```

```
@workspace Đọc .github/skills/skill-05-frontend.md (v2).
Cập nhật useFaceSearch: thêm date_from/date_to params + getQuickDateRange helper.
Đổi useAlbums → useLocations (endpoint /search/locations).
Cập nhật useAdminAuth: thêm role STAFF, employee_code, can.* mới.
Tạo useAllStaffStats, useMyStats, useStaffRevenue hooks.
Tạo useAdminLocations với assignStaff/removeStaff.
Tạo useStaffManagement với employee_code + location_ids.
Cập nhật useSettings: thêm applyColorToDOM cho primary_color/accent_color.
Cập nhật useOrderDetail: thêm photos[], delivery object.
```
