# Skill 08 – Veno File Manager Integration (Module 1)

## Bối cảnh

- Veno File Manager (PHP) đã chạy sẵn, photographer dùng để upload ảnh
- PhotoPro V1 và Veno **cùng server**, share folder `/photopro_upload/` trực tiếp
- **Không sửa Veno** — chỉ thêm 1 trang helper nhỏ để photographer tạo folder đúng convention
- Celery `scan_upload_folder` đọc folder này mỗi 5 phút

---

## Vấn đề cần giải quyết

Photographer cần upload vào đúng path:
```
/photopro_upload/2026-03-06/PH001/ALB_SangSom/IMG_*.jpg
```

Nếu tạo sai (ví dụ `2026-3-6` thay vì `2026-03-06`, hoặc thiếu photographer_code) → Celery parse lỗi → ảnh không được xử lý.

---

## Giải pháp: Trang "Tạo Folder Upload"

Một FastAPI endpoint đơn giản trả về **direct link vào Veno đúng folder** sau khi tạo folder.

```
Photographer mở trang → chọn ngày + nhập album → nhấn "Tạo & Mở Veno" 
→ hệ thống tạo folder → redirect thẳng vào Veno tại folder đó
```

---

## API Endpoint

```python
# app/api/v1/photographer.py

# POST /api/v1/photographer/prepare-folder
# Body: { photographer_code, shoot_date, album_code? }
# Logic:
#   1. Validate photographer_code: chỉ chữ hoa + số + gạch dưới, max 20 ký tự
#   2. Validate shoot_date: format YYYY-MM-DD, không quá 7 ngày trong quá khứ
#   3. Build path: /photopro_upload/{shoot_date}/{photographer_code}/{album_code}/
#   4. os.makedirs(path, exist_ok=True)  ← tạo folder thật trên disk
#   5. Tạo file .photopro_meta (để scan worker nhận biết folder hợp lệ):
#      { "photographer_code": "PH001", "shoot_date": "2026-03-06", "album_code": "ALB_SangSom" }
#   6. Return { folder_path, veno_url }
#      veno_url = f"{VENO_BASE_URL}?dir={url_encode(relative_path)}"

# GET /api/v1/photographer/my-folders?photographer_code=PH001
# Logic:
#   1. Glob /photopro_upload/*/{photographer_code}/
#   2. Với mỗi folder: đọc .photopro_meta + đếm số file IMG_*.jpg
#   3. Return list { shoot_date, album_code, file_count, folder_path, veno_url }
```

---

## Trang Helper (React hoặc HTML đơn giản)

```
/photographer  (route trong React app hoặc file HTML riêng)

┌─────────────────────────────────────────────────────┐
│  📁 Chuẩn bị Folder Upload                          │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Mã thợ (Photographer Code):                        │
│  [PH001________________]                            │
│  ℹ️ Chỉ chữ hoa, số, gạch dưới. VD: PH001          │
│                                                      │
│  Ngày chụp:                                         │
│  [📅 2026-03-06       ]  ← mặc định hôm nay        │
│                                                      │
│  Tên album (không bắt buộc):                        │
│  [ALB_SangSom__________]                            │
│  ℹ️ VD: ALB_SangSom, ALB_ChieuToi                  │
│                                                      │
│  Preview path:                                       │
│  📂 /photopro_upload/2026-03-06/PH001/ALB_SangSom/ │
│                                                      │
│  [✅ Tạo Folder & Mở Veno]                          │
│                                                      │
├─────────────────────────────────────────────────────┤
│  📋 Folder của tôi (PH001)                          │
│                                                      │
│  2026-03-06 / ALB_SangSom    42 ảnh   [Mở Veno]   │
│  2026-03-05 / ALB_ChieuToi   18 ảnh   [Mở Veno]   │
│  2026-03-05 / (không album)   7 ảnh   [Mở Veno]   │
└─────────────────────────────────────────────────────┘
```

---

## Config cần thêm vào Settings

```python
# app/core/config.py — thêm các fields sau:
VENO_BASE_URL: str = "http://localhost/veno"   # URL Veno File Manager
UPLOAD_ROOT: str = "/photopro_upload"          # Phải trùng với UPLOAD_SCAN_FOLDER
```

```env
# .env
VENO_BASE_URL=https://yourdomain.com/veno
UPLOAD_ROOT=/photopro_upload
```

---

## Celery scan_upload_folder — cần update để đọc .photopro_meta

```python
# app/workers/media_worker.py
# Trong hàm parse_upload_path(), ưu tiên đọc .photopro_meta nếu có:

def get_folder_meta(folder_path: str) -> dict | None:
    """
    Đọc .photopro_meta trong folder nếu có.
    File này được tạo bởi /photographer/prepare-folder endpoint.
    Nếu không có → parse từ folder path như cũ (fallback).
    """
    meta_path = os.path.join(folder_path, ".photopro_meta")
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            return json.load(f)
    return None
```

---

## Validation rules

```python
import re
from datetime import date, timedelta

def validate_photographer_code(code: str) -> bool:
    # Chỉ chữ hoa, số, gạch dưới, 3-20 ký tự
    return bool(re.match(r'^[A-Z0-9_]{3,20}$', code))

def validate_shoot_date(shoot_date: str) -> bool:
    try:
        d = date.fromisoformat(shoot_date)
        # Không cho tạo folder quá 7 ngày trong quá khứ
        # Không cho tạo folder quá 30 ngày trong tương lai
        return date.today() - timedelta(days=7) <= d <= date.today() + timedelta(days=30)
    except ValueError:
        return False

def normalize_album_code(name: str) -> str:
    """
    "Sáng Sớm" → "ALB_Sang_Som"
    Tự động thêm prefix ALB_ nếu chưa có.
    Strip dấu tiếng Việt, replace space → underscore.
    """
```

---

## Hướng dẫn cho Photographer (hiển thị trong trang)

```
📌 Quy trình upload ảnh:

1. Mở trang này → điền Mã thợ + Ngày chụp + Tên album
2. Nhấn "Tạo Folder & Mở Veno" → Veno mở đúng folder
3. Upload ảnh vào folder đó (IMG_*.jpg)
4. Hệ thống tự động xử lý trong vòng 5 phút

⚠️ Lưu ý:
- Tên file phải bắt đầu bằng IMG_ (VD: IMG_001.jpg)
- Chỉ upload JPG/JPEG ở V1
- Không upload vào folder sai cấu trúc
```

---

## Copilot prompt

```
@workspace Đọc .github/skills/skill-08-veno-integration.md.
Tạo app/api/v1/photographer.py với 2 endpoints:
  POST /photographer/prepare-folder: validate input, tạo folder trên disk bằng os.makedirs,
  ghi .photopro_meta JSON, return veno_url = VENO_BASE_URL + ?dir= + encoded path.
  GET /photographer/my-folders: glob folder theo photographer_code, đọc meta + đếm IMG_*.jpg.
Thêm validate_photographer_code(), validate_shoot_date(), normalize_album_code() vào app/utils/validators.py.
Update scan_upload_folder trong media_worker.py để đọc .photopro_meta nếu có (fallback parse path).
```

---

## Test cases

- [ ] prepare-folder: tạo đúng path trên disk
- [ ] prepare-folder: tạo .photopro_meta với đúng content
- [ ] prepare-folder: photographer_code có ký tự đặc biệt → 422
- [ ] prepare-folder: shoot_date quá 7 ngày trước → 422
- [ ] prepare-folder: gọi 2 lần cùng path → không lỗi (exist_ok=True)
- [ ] my-folders: trả đúng file_count
- [ ] scan_worker: đọc .photopro_meta thay vì parse path khi file tồn tại
- [ ] normalize_album_code: "Sáng Sớm" → "ALB_Sang_Som"
