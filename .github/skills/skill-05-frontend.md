# Skill 05 – Frontend React: Thay Mock Data → API Thật (v2)

## Nguyên tắc
- Frontend đã có giao diện — **KHÔNG sửa UI/layout**
- Chỉ thay mock data bằng API calls thật
- Mọi API call qua `apiClient` duy nhất

---

## 1. Setup API Client + useAsync — giữ nguyên v1

```typescript
// src/lib/api-client.ts — không đổi
// src/hooks/useAsync.ts — không đổi
```

---

## 2. Face Search — bổ sung date filter (B1)

**Endpoint:** `POST /api/v1/search/face`

```typescript
// src/hooks/useFaceSearch.ts
export function useFaceSearch() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const search = async (
    image: File | Blob,
    filters?: {
      shoot_date?: string;    // YYYY-MM-DD (1 ngày cụ thể)
      date_from?:  string;    // YYYY-MM-DD (khoảng — B1)
      date_to?:    string;    // YYYY-MM-DD
      album_id?:   string;    // UUID Địa Điểm
    }
  ) => {
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("image", image, "selfie.jpg");
    if (filters?.shoot_date) form.append("shoot_date", filters.shoot_date);
    if (filters?.date_from)  form.append("date_from",  filters.date_from);
    if (filters?.date_to)    form.append("date_to",    filters.date_to);
    if (filters?.album_id)   form.append("album_id",   filters.album_id);
    try {
      const data = await apiClient.postForm<{ results: SearchResult[]; total: number }>(
        "/api/v1/search/face", form
      );
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tìm được ảnh");
    } finally { setLoading(false); }
  };

  return { results, loading, error, search };
}

// Quick date helper (B1 UI):
export function getQuickDateRange(preset: "today" | "3days" | "7days" | "30days") {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const offsets = { today: 0, "3days": 3, "7days": 7, "30days": 30 };
  const from = new Date(today);
  from.setDate(from.getDate() - offsets[preset]);
  return { date_from: fmt(from), date_to: fmt(today) };
}

// Trong component Face Search:
// Thay mock → dùng useFaceSearch()
// Quick date buttons:
const handleQuickDate = (preset: "today" | "3days" | "7days" | "30days") => {
  const range = getQuickDateRange(preset);
  setDateFrom(range.date_from);
  setDateTo(range.date_to);
};
```

---

## 3. Locations (thay Albums)

**Endpoint:** `GET /api/v1/search/locations`

```typescript
// src/hooks/useLocations.ts — đổi tên từ useAlbums
export function useLocations() {
  return useAsync(() =>
    apiClient.get<Array<{ id: string; name: string; shoot_date: string; media_count: number }>>(
      "/api/v1/search/locations"
    )
  );
}

// Trong filter dropdown:
// TRƯỚC: const albums = MOCK_ALBUMS;
// SAU:
const { data: locations } = useLocations();
// Đổi label "Albums" → "Địa Điểm" trong UI nếu cần
```

---

## 4. Cart, Checkout, Download — giữ nguyên v1

Thêm: cart items báo lỗi `MEDIA_ALREADY_SOLD`:
```typescript
// Trong useCart.addItem — bắt error code mới:
} catch (e) {
  if (e instanceof APIError && e.code === "MEDIA_ALREADY_SOLD") {
    // Hiện toast: "Ảnh này đã được người khác mua"
    setError("Ảnh này đã được người khác mua rồi");
  }
}
```

---

## 5. Admin Auth + RBAC (4 roles)

```typescript
// src/hooks/useAdminAuth.ts
export function useAdminAuth() {
  const login = async (email: string, password: string) => {
    const data = await apiClient.post<{
      access_token: string;
      role: string;
      full_name: string;
      employee_code?: string;  // có nếu role=STAFF
    }>("/api/v1/admin/auth/login", { email, password });
    localStorage.setItem("admin_token",         data.access_token);
    localStorage.setItem("admin_role",          data.role);
    localStorage.setItem("admin_name",          data.full_name);
    if (data.employee_code)
      localStorage.setItem("admin_employee_code", data.employee_code);
    return data;
  };

  const role = localStorage.getItem("admin_role") as
    "SYSTEM" | "SALES" | "MANAGER" | "STAFF" | null;

  const can = {
    viewDashboard:    true,
    viewLocations:    true,                               // mọi role (STAFF: chỉ được gán)
    manageLocations:  role === "SYSTEM" || role === "SALES",
    viewOrders:       role === "SYSTEM" || role === "SALES",
    manageStaff:      role === "SYSTEM",
    manageBundles:    role === "SYSTEM" || role === "SALES",
    viewRevenue:      role !== "STAFF",
    viewStaffStats:   true,                               // mọi role
    viewAllStaffStats:role !== "STAFF",                  // STAFF chỉ xem của mình
    changeSettings:   role === "SYSTEM",
    deleteFolder:     role === "SYSTEM",
    uploadPhotos:     role === "STAFF",
  };

  return { login, logout, role, can };
}
```

---

## 6. Staff Statistics (A1)

```typescript
// src/hooks/useStaffStats.ts

// Admin/Manager — xem list tất cả staff
export function useAllStaffStats(filters?: { search?: string; period?: string }) {
  const params = new URLSearchParams(filters as Record<string, string>);
  return useAsync(
    () => apiClient.get<StaffStat[]>(`/api/v1/admin/staff/statistics?${params}`),
    [JSON.stringify(filters)]
  );
}

// STAFF — xem stats của mình
export function useMyStats() {
  return useAsync(() => apiClient.get<StaffStat>("/api/v1/admin/staff/statistics/me"));
}

// Revenue chart cho 1 staff
export function useStaffRevenue(staffId: string, period: "day" | "month" | "year") {
  return useAsync(
    () => apiClient.get<{ by_date: RevenuePoint[] }>(
      `/api/v1/admin/staff/statistics/${staffId}/revenue?period=${period}`
    ),
    [staffId, period]
  );
}

// Trong StaffStatsPage:
const { role, can } = useAdminAuth();

// Nếu role=STAFF → hiện trực tiếp stats của mình (không có bảng danh sách)
// Nếu role=SYSTEM/SALES/MANAGER → hiện bảng danh sách + click → modal chi tiết
if (!can.viewAllStaffStats) {
  const { data: myStats } = useMyStats();
  // render trang stats cá nhân
} else {
  const { data: allStats } = useAllStaffStats(filters);
  // render bảng danh sách
}
```

---

## 7. Locations Admin (A2)

```typescript
// src/hooks/useAdminLocations.ts
export function useAdminLocations() {
  const { data, refetch } = useAsync(() =>
    apiClient.get<Location[]>("/api/v1/admin/locations")
  );

  const create = async (payload: CreateLocationPayload) => {
    await apiClient.post("/api/v1/admin/locations", payload);
    refetch();
  };

  const update = async (id: string, payload: Partial<Location>) => {
    await apiClient.patch(`/api/v1/admin/locations/${id}`, payload);
    refetch();
  };

  const remove = async (id: string) => {
    await apiClient.delete(`/api/v1/admin/locations/${id}`);
    refetch();
  };

  // Staff assignment
  const assignStaff = async (locationId: string, staffId: string, canUpload = true) => {
    await apiClient.post(`/api/v1/admin/locations/${locationId}/staff`,
      { staff_id: staffId, can_upload: canUpload });
    refetch();
  };

  const removeStaff = async (locationId: string, staffId: string) => {
    await apiClient.delete(`/api/v1/admin/locations/${locationId}/staff/${staffId}`);
    refetch();
  };

  return { locations: data, create, update, remove, assignStaff, removeStaff };
}

// Trong LocationsPage:
// "Albums" → "Địa Điểm" (đổi label trong UI)
// Modal tạo/sửa: thêm section "Phân quyền nhân viên" với multi-select staff
```

---

## 8. Staff Management (A5)

```typescript
// src/hooks/useStaffManagement.ts
export function useStaffManagement() {
  const { data, refetch } = useAsync(() =>
    apiClient.get<Staff[]>("/api/v1/admin/staff")
  );

  const create = async (payload: CreateStaffPayload) => {
    // payload bao gồm employee_code (optional), location_ids[] nếu role=STAFF
    await apiClient.post("/api/v1/admin/staff", payload);
    refetch();
  };

  // ...update, remove
  return { staffList: data, create, refetch };
}

// Trong StaffForm component:
// Khi role === "STAFF":
//   - Hiện field "Mã nhân viên" (auto-fill từ BE, có thể sửa)
//   - Hiện multi-select "Địa điểm được upload"
const isStaffRole = selectedRole === "STAFF";
```

---

## 9. Color Picker Settings (A6)

```typescript
// src/hooks/useSettings.ts — thêm helper cho color
export function useSettings() {
  const { data: settings, refetch } = useAsync(() =>
    apiClient.get<Record<string, string>>("/api/v1/admin/settings")
  );

  const update = async (key: string, value: string) => {
    await apiClient.patch("/api/v1/admin/settings", { key, value });
    refetch();
    // Áp dụng màu real-time nếu là color setting:
    if (key === "primary_color" || key === "accent_color") {
      applyColorToDOM(key === "primary_color" ? "--primary" : "--accent", value);
    }
  };

  return { settings, update };
}

// Apply màu vào CSS variables:
function applyColorToDOM(cssVar: string, hex: string) {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
  document.documentElement.style.setProperty(cssVar, hex);
  // Auto generate light/dark variant:
  const hsl = hexToHSL(hex);
  document.documentElement.style.setProperty(`${cssVar}-light`, `hsl(${hsl.h}, 30%, 95%)`);
  document.documentElement.style.setProperty(`${cssVar}-dark`,  `hsl(${hsl.h}, ${hsl.s}%, 20%)`);
}

// Trong Settings page — Photo Retention section (C2):
// XÓA: checkbox "Bật tự động xóa" + select "Chế độ xóa"
// GIỮ: chỉ input "Thời gian lưu trữ ảnh (ngày)" + note text
```

---

## 10. Order Detail — hiển thị ảnh đã mua (C1)

```typescript
// src/hooks/useOrderDetail.ts
export function useOrderDetail(orderId: string) {
  return useAsync(
    () => apiClient.get<OrderDetail>(`/api/v1/admin/orders/${orderId}`),
    [orderId]
  );
}

// OrderDetail response bổ sung:
interface OrderDetail {
  // ...order fields
  photos: Array<{ media_id: string; preview_url: string; filename: string }>;
  delivery: {
    token: string;
    expires_at: string;
    download_count: number;
    max_downloads: number;
    is_active: boolean;
    download_url: string;
  };
}

// Trong OrderDetailModal:
// Hiện grid ảnh đã mua (từ order.photos)
// Hiện link tải + trạng thái (từ order.delivery)
// Buttons: Copy link, Tạo link mới, Gửi lại email
const copyLink    = () => navigator.clipboard.writeText(delivery.download_url);
const newLink     = () => apiClient.patch(`/api/v1/admin/orders/${orderId}/new-link`, {});
const resendEmail = () => apiClient.patch(`/api/v1/admin/orders/${orderId}/resend-email`, {});
```

---

## 11. .env + Checklist

```bash
VITE_API_URL=http://localhost:8000
```

### Checklist nối API

#### Customer site
- [ ] `useFaceSearch` — thêm `date_from/date_to`, quick date buttons
- [ ] `useLocations` — thay `useAlbums`, đổi label "Địa Điểm"
- [ ] `useCart` — bắt lỗi `MEDIA_ALREADY_SOLD`
- [ ] Checkout, Download — giữ nguyên v1

#### Admin dashboard
- [ ] `useAdminAuth` — thêm role `STAFF`, `employee_code`, `can.*` mới
- [ ] `useAllStaffStats` / `useMyStats` — trang Thống kê NV
- [ ] `useAdminLocations` — thay `useAlbums`, thêm staff assignment
- [ ] `useStaffManagement` — thêm `employee_code`, `location_ids`
- [ ] `useSettings` — thêm `applyColorToDOM`, bỏ `auto_delete_mode`
- [ ] `useOrderDetail` — hiển thị ảnh đã mua + delivery status
- [ ] `useRevenue` — thêm filter `staff_id`
