ĐẶC TẢ HỆ THỐNG PHOTO PRO V.1
Đặc tả thiết kế cơ bản – tinh gọn – ưu tiên dev nhanh để kinh doanh sớm cho PhotoPro
0) MVP mục tiêu
Chốt nhanh v1 (1 tuần):
Thợ upload ảnh vào folder theo ngày + theo photographer
Hệ thống tự tạo thumbnail + watermark preview và Face Index
Khách quét mặt / upload selfie → thấy ảnh match → chọn ảnh → mua theo gói → thanh toán → tải ảnh HD
Admin set gói giá + quota ảnh + xem doanh thu theo photographer/folder
V1 chưa cần in giấy (có thể bật v1.1)
1) Module 1 – Photographer Portal (Folder structure only)
Dùng lại Hệ thống đã có sẵn, nên module này chỉ cần chuẩn folder + quy ước file để module 2 xử lý.
1.1 Cấu trúc folder đề xuất (rõ ràng để xử lý tự động)
Root chung: /photopro_upload/
A) Theo ngày
/photopro_upload/YYYY-MM-DD/
B) Theo photographer
/photopro_upload/YYYY-MM-DD/{photographer_code}/
C) Theo phiên chụp (optional, nên có để dễ quản trị)
/photopro_upload/YYYY-MM-DD/{photographer_code}/{album_code}/
Ví dụ
/photopro_upload/2026-02-25/PH001/ALB_ConVienNuoc_Sang/
1.2 Quy ước file
Ảnh: IMG_*.jpg|jpeg|png
Video (v1 có thể hoãn): VID_*.mp4
Nếu có video: yêu cầu có ảnh đại diện tham chiếu:
VID_0001.mp4
VID_0001_cover.jpg (ảnh có khuôn mặt rõ để scan)
1.3 Metadata tối thiểu (để không cần UI phức tạp)
photographer_code lấy từ folder
shoot_date lấy từ folder
album_code lấy từ folder (nếu có)
Không bắt buộc EXIF

2) Module 2 – Processing & AI (Worker/Queue)
Nguồn vào: đọc file từ folder Module 1
Nhiệm vụ: tạo bản preview + index khuôn mặt + cung cấp dataset cho tìm kiếm.
2.1 Pipeline xử lý (async)
Job 1: Import & Register
Quét folder theo lịch (cron) hoặc watch
Tạo record Media trong DB (id, path, photographer_code, date, album_code, status)
Job 2: Create Derivatives
Tạo:
thumbnail (nhỏ, load nhanh)
preview_watermark (hiện cho khách xem)
Lưu ở storage riêng (không dùng trực tiếp file gốc)
Update status: DERIVATIVES_READY
Job 3: Face Detect & Index
Detect mặt trên ảnh gốc hoặc ảnh resized chất lượng cao
Nếu có mặt:
tạo embedding
lưu vector / index
set has_face=true, face_count, quality_score
Nếu không có mặt: has_face=false (không đưa vào search)
Job 4: Search API dataset
Cung cấp endpoint nội bộ:
nhận selfie → embedding → trả topK ảnh match (lọc theo threshold)
2.2 Dữ liệu tối thiểu (DB)
Media
id
original_path
photographer_code
shoot_date
album_code (nullable)
status: NEW | DERIVATIVES_READY | INDEXED | FAILED
has_face (bool)
created_at
MediaAsset
media_id
type: THUMB | PREVIEW_WM
path_or_key
width,height,size
FaceIndex
media_id
embedding_ref (hoặc vector trực tiếp)
quality_score
face_count
2.3 API nội bộ (giữa module 4 ↔ module 2)
POST /internal/face-search
input: image (selfie) + options (topK)
output: list {media_id, score}
GET /internal/media/{id}/thumb
GET /internal/media/{id}/preview (watermark)
2.4 Rule quan trọng (để giảm lỗi & chi phí)
Chỉ index ảnh jpg/jpeg ở v1 (png để sau)
Threshold match: ví dụ score >= 0.75 (tune sau)
Chỉ trả ảnh has_face=true và status>=INDEXED

3) Module 3 – Business & Admin (Set giá – Quota – Doanh thu)
Mục tiêu: tối giản nhưng đủ “bán được & chia tiền”.
3.1 Pricing theo gói (bundle)
Bạn yêu cầu hiển thị kiểu (Cho thiết lập, Mỹ đề xuất thêm cho thực tế và hiệu quả hơn):
20k - 1 ảnh
50k - 3 ảnh
100k - 8 ảnh
=> Tạo BundlePricing:
BundlePricing
id
name: “Gói 1 ảnh”
photo_count: 1 / 3 / 8
price: 20000 / 50000 / 100000
currency: VND
is_active
Rule: Khách chọn N ảnh → hệ thống đề xuất gói phù hợp (hoặc cho chọn gói).
3.2 Thống kê doanh thu theo Photographer (theo folder)
Order lưu photographer_code theo từng media item, aggregate ra:
doanh thu theo ngày
doanh thu theo photographer_code
top bundle
3.3 Admin UI tối thiểu (3 màn)
Bundle Pricing: tạo/sửa gói 1/3/8 ảnh
Revenue Dashboard: tổng doanh thu + theo photographer
Orders: danh sách đơn + trạng thái thanh toán

4) Module 4 – Customer Storefront & Commerce
Mục tiêu: khách tìm → chọn → mua gói → thanh toán → tải HD + share
4.1 UX flow (Mỹ có thể làm hướng khác, miễn là đúng giử Flow)
Landing: “Tìm ảnh của bạn”
Chọn cách tìm:
Scan camera
Upload selfie
Result grid: thumbnail các ảnh match
Click ảnh → mở preview watermark + checkbox chọn
Sidebar: hiển thị gói giá (1/3/8 ảnh) + tổng
Checkout: nhập email/SĐT (nhận link + hoá đơn)
Pay → Success
Download HD (zip hoặc từng ảnh) + nút share Zalo/Facebook/Email
4.2 Facesearch scope
Yêu cầu: Facesearch trên toàn bộ folder
Search trên toàn bộ FaceIndex đã index, nhưng để tốc độ và chính xác nên Filter theo shoot_date (Hôm qua, hôm nay, chọn ngày).
4.3 Logic chọn gói (bundle)
Khách chọn k ảnh:
k=1 → đề xuất gói 1
k=2 → đề xuất gói 3 (nếu policy cho “mua gói dư”, hoặc ép chọn đủ 3)
k=3 → gói 3
k=4..8 → gói 8
8 → mua nhiều gói 8 + phần dư theo gói 1/3
V1 nên chọn rule đơn giản: mua theo số ảnh chọn, hệ thống tự tính gói tối ưu (auto-pack).
4.4 Data tối thiểu (DB)
CartSession
session_id
selected_media_ids[]
Order
order_id
customer_phone/email
bundle_id
photo_count
amount
status: CREATED | PAID | FAILED
OrderItem
order_id
media_id
photographer_code
DigitalDelivery
order_id
download_token
expiry
download_count
4.5 Payment (v1)
Tạo payment intent
Webhook confirm PAID
Khi PAID:
tạo link download signed (TTL 7–30 ngày)
gửi email/SMS
hiển thị trang download
4.6 Download & Share (Quan trọng, tập trung vào trải nghiệm : Chụp hình để đăng mxh, share bạn bè, người thân)
Download:
tải từng ảnh hoặc zip
Share:
Zalo/Facebook: share link trang download (có token/OTP tuỳ mức bảo mật)
Email: gửi link tự động

5) Tích hợp giữa các module (tối giản)
Events tối thiểu
media.discovered (Module2 tự quét folder)
media.indexed
order.paid → trigger tạo download
API tối thiểu
Module4 gọi Module2: face-search + lấy thumb/preview
Module4/3 dùng chung Orders DB hoặc API Orders

6) Checklist triển khai nhanh (để “đưa vào kinh doanh sớm”)
Tuần 1
Chốt folder convention + job quét folder
Pipeline thumbnail + watermark preview
Face detect + index + face-search API
UI khách: scan/upload + grid kết quả
Tuần 2
Bundle pricing + checkout + payment + download
Admin UI: set bundle + xem orders
Dashboard doanh thu theo photographer
Share Zalo/Facebook + email template

