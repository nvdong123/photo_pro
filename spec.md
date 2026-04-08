# Phân tích Piufoto: luồng chạy app, OTG, kết nối máy ảnh, và bản spec suy luận cho Codex

## Ghi chú quan trọng cho PhotoPro

Trong Piufoto, khái niệm gần nhất là **album / event album**.

Nhưng với **PhotoPro**, cần hiểu lại như sau:

- đơn vị chính trong app là **Location**
- mỗi **user account** được gán sẵn một hoặc nhiều **locations**
- photographer / staff sau khi đăng nhập **không nhất thiết tự tạo album chính**
- họ sẽ **chọn trong danh sách locations đã được hệ thống gán sẵn**
- ảnh upload lên sẽ đi vào **location hiện tại**
- bên trong location có thể vẫn có:
  - session chụp
  - ngày chụp
  - photographer folder
  - event subfolder
  - bộ ảnh / batch ảnh

Vì vậy, trong toàn bộ tài liệu này:

- chỗ nào nhắc đến `album` như mô hình Piufoto thì với PhotoPro nên map thành **location hoặc location-based gallery**
- backend nên thiết kế theo hướng **user -> assigned locations -> capture sessions -> photos**

---

## Mục tiêu tài liệu

Tài liệu này không phải source code của Piufoto. Đây là **bản reverse-analysis từ thông tin công khai** để giúp Codex hiểu:

1. Piufoto đang giải quyết bài toán gì  
2. Luồng chạy app nhiều khả năng hoạt động ra sao  
3. Cơ chế OTG / FTP được tổ chức như thế nào  
4. Kiến trúc nào nên clone theo cho một app tương tự  
5. Những gì là **fact công khai** và những gì là **suy luận kỹ thuật**

---

## 1) Piufoto là gì

Piufoto là một app cho nhiếp ảnh gia / đội chụp sự kiện, cho phép:

- nhận ảnh từ máy ảnh về điện thoại **theo thời gian thực**
- dùng **OTG có dây** hoặc **FTP không dây**
- upload ảnh lên cloud / album ngay sau khi chụp
- có thể chạy thêm AI như:
  - AI Review
  - AI Retouch
  - AI Search
- chia sẻ ảnh gần như live cho khách xem trong lúc sự kiện đang diễn ra

Nói ngắn gọn:  
**Camera -> Phone -> Cloud Album -> AI xử lý -> Client xem / tìm / tải / mua**

---

## 2) Những fact công khai đã xác nhận

### 2.1 Trên website chính
Piufoto công khai rằng:

- hỗ trợ **real-time photo transfer from camera to phones**
- có 2 cách kết nối:
  - **Wired (OTG Cable)**
  - **Wireless (FTP)**
- ảnh có thể được xử lý AI và chia sẻ real-time
- có API integration cho doanh nghiệp
- album hỗ trợ watermark, AI reviewer, phân loại, microsite / link chia sẻ

### 2.2 Trên App Store / Google Play
Piufoto mô tả:

- camera-to-cloud thông qua smartphone
- automatic uploads and enhancements
- instant sharing
- hỗ trợ nhiều model máy ảnh phổ biến
- app được cập nhật gần đây, nghĩa là feature này vẫn đang sống

### 2.3 Từ tutorial / social snippet công khai
Các snippet công khai cho thấy Piufoto có các mode kiểu:

- **Auto Upload**: ảnh chụp xong là đẩy ngay
- **Starred Upload**: chỉ upload ảnh được đánh dấu sao trên máy ảnh
- **Lock Upload**: bỏ qua ảnh bị khóa / bảo vệ hoặc ngược lại tùy logic app
- có bước:
  - tạo album
  - chọn upload size
  - cấu hình bảo mật album
  - kết nối camera có dây hoặc không dây

---

## 3) Kết luận mức sản phẩm: Piufoto thực chất là gì

Piufoto không chỉ là app chuyển ảnh.

Nó là một hệ thống gồm 5 lớp:

1. **Capture bridge layer**  
   Nhận ảnh từ camera sang điện thoại qua OTG hoặc FTP

2. **Transfer/session layer**  
   Theo dõi session đang chụp, kiểm tra ảnh mới, retry khi lỗi, queue upload

3. **Cloud ingestion layer**  
   Upload ảnh lên cloud storage / album service

4. **Post-processing layer**  
   Watermark, resize, AI retouch, AI review, AI search, privacy masking

5. **Distribution layer**  
   Trang album / microsite / link chia sẻ / bán ảnh / client viewing

---

## 4) Luồng tổng thể nhiều khả năng của Piufoto

## 4.1 Luồng ở mức business

### Vai trò người chụp
- mở app
- đăng nhập
- hệ thống tải danh sách **locations đã được gán sẵn cho tài khoản**
- người dùng chọn **location đang tác nghiệp**
- chọn phương thức kết nối:
  - OTG
  - FTP
- chọn chế độ upload:
  - auto
  - starred only
  - filtered
- bắt đầu chụp
- ảnh tự chảy vào app
- app tự upload
- khách mở album xem gần real-time

### Vai trò hệ thống
- phát hiện ảnh mới
- chuẩn hóa metadata
- upload file gốc hoặc file preview
- sinh thumbnail / watermark
- cập nhật danh sách ảnh trong album
- chạy AI nếu bật
- đẩy trạng thái lên UI client

---

## 5) Phân tích riêng phần OTG

## 5.1 OTG ở đây khả năng cao là gì

OTG trong case Piufoto gần như chắc là:

- điện thoại đóng vai trò **USB host**
- máy ảnh cắm vào điện thoại bằng cable phù hợp
- app đọc ảnh trực tiếp từ camera hoặc từ media interface của camera
- khi camera ghi ảnh mới, app detect file mới và import / transfer

Tức là logic gần với:

**Camera storage / camera media endpoint -> Mobile app -> Local temp cache -> Cloud**

Không phải OTG kiểu màn hình live view phức tạp.  
Mục tiêu chính là **lấy file ảnh vừa chụp** nhanh nhất có thể.

## 5.2 Trên mobile, OTG thường có 2 cách hiện thực

### Cách A - Camera lộ như USB mass storage / MTP / PTP
App có thể:

- mount / truy cập thiết bị USB
- duyệt DCIM hoặc media object
- polling danh sách file
- phát hiện file mới
- copy file sang sandbox tạm
- đưa vào upload queue

### Cách B - Dùng giao thức camera control / vendor SDK / PTP
Nếu model camera không expose storage đơn giản, app có thể:

- kết nối PTP/MTP
- subscribe event object added
- lấy object handle mới
- download object sang app

**Khả năng cao Piufoto phải hỗ trợ cả hai kiểu**, vì họ nói “supports most popular camera models”, mà thực tế mỗi hãng expose hơi khác.

## 5.3 Luồng OTG hợp lý nhất

### Bước 1: Người dùng cắm cáp
- camera <-> cáp OTG <-> điện thoại
- app detect USB attach event

### Bước 2: App nhận diện loại thiết bị
- vendor id / product id
- mode:
  - storage mode
  - PTP mode
  - MTP mode
  - unknown mode

### Bước 3: App bắt đầu session
- user chọn **location đã được gán quyền**
- app tạo capture session gắn với location đó
- user chọn quality:
  - original
  - compressed
  - preview
- user chọn upload mode:
  - all photos
  - starred only
  - maybe jpeg only
  - maybe raw skip

### Bước 4: Detect ảnh mới
Có 3 khả năng kỹ thuật:

#### Phương án 1: Polling folder / media list
- mỗi 1–3 giây quét danh sách file
- so sánh object id / filename / size / modified time
- nếu có file mới thì enqueue

#### Phương án 2: PTP event
- camera bắn event object added
- app lấy file mới ngay
- ổn định hơn polling nếu camera hỗ trợ tốt

#### Phương án 3: Hybrid
- nghe event nếu có
- fallback polling nếu event lỗi

**Khả năng triển khai thực tế tốt nhất: hybrid**

### Bước 5: Local staging
- file mới được copy về thư mục tạm
- đánh dấu trạng thái:
  - detected
  - copying
  - copied
  - queued
  - uploading
  - uploaded
  - failed

### Bước 6: Upload queue
- hàng đợi nền upload từng file
- có retry
- có checksum / file size validation
- có pause/resume nếu mất mạng

### Bước 7: Cloud side processing
- tạo thumbnail
- watermark
- cập nhật album timeline
- AI review / retouch / face search nếu bật

## 5.4 Vì sao Piufoto cần local staging thay vì upload trực tiếp từ camera
Vì thực tế ổn định hơn:

- camera có thể đang còn ghi file
- file có thể chưa hoàn tất nếu đọc quá sớm
- USB session có thể chập chờn
- upload cần retry kể cả khi camera bị rút cáp

Nên pattern đúng là:

**Camera -> local temp cache -> upload queue -> cloud**

không phải:

**Camera -> upload trực tiếp ngay lập tức**

---

## 6) Phân tích riêng phần FTP / wireless

## 6.1 FTP trong case này là gì
Một số máy ảnh hỗ trợ gửi file qua Wi‑Fi bằng FTP.  
Piufoto quảng cáo wireless transfer nếu camera hỗ trợ FTP/OTG.

Mô hình nhiều khả năng:

- điện thoại hoặc cloud đóng vai trò FTP destination
- camera sau khi chụp sẽ upload file tới destination đó
- app theo dõi file mới rồi tiếp tục sync album

## 6.2 Có 2 mô hình FTP khả thi

### Mô hình A - Điện thoại chạy FTP server mini
Luồng:

- app bật FTP server local trên điện thoại
- camera kết nối Wi‑Fi tới điện thoại hoặc cùng LAN / hotspot
- camera gửi file vào thư mục app chỉ định
- app detect file mới trong thư mục receive
- app upload lên cloud

Ưu điểm:
- rất hợp với quảng cáo “camera -> phone -> cloud”
- không cần laptop
- vẫn hoạt động kể cả khi cloud chập chờn

Nhược:
- mobile app phải giữ background service khá chắc
- iOS khó hơn Android
- phải xử lý permission / sandbox / local network

### Mô hình B - Camera upload thẳng lên cloud FTP / SFTP của Piufoto
Luồng:

- app chỉ giúp cấu hình credentials
- camera gửi trực tiếp lên server
- server gán file vào album

Ưu điểm:
- đỡ tải cho điện thoại
- không phụ thuộc app luôn foreground

Nhược:
- camera phải có Wi‑Fi Internet thật
- setup phức tạp hơn ở hiện trường
- không khớp hoàn toàn với thông điệp “use smartphone to transfer effortlessly”

**Khả năng cao Piufoto ưu tiên Mô hình A cho trải nghiệm người dùng**, ít nhất ở Android.  
Cũng có thể hỗ trợ cả A và B tùy model / nền tảng.

## 6.3 Luồng wireless hợp lý
- user tạo album
- app hiển thị thông tin FTP:
  - host
  - port
  - username
  - password
  - folder path
- user nhập 1 lần vào camera
- sau đó camera auto gửi ảnh
- app hoặc server nhận ảnh
- album update real-time

Điểm này rất gần với hướng PhotoPro của bạn.

---

## 7) Luồng app ở mức state machine

## 7.1 State tổng quát
```text
IDLE
-> AUTHENTICATED
-> ALBUM_SELECTED
-> CONNECTION_METHOD_SELECTED
-> DEVICE_CONNECTED
-> CAPTURE_SESSION_ACTIVE
-> FILE_DETECTED
-> FILE_STAGED
-> FILE_QUEUED
-> FILE_UPLOADING
-> FILE_UPLOADED
-> POST_PROCESSING
-> ALBUM_PUBLISHED
```

## 7.2 State lỗi
```text
USB_PERMISSION_DENIED
CAMERA_NOT_SUPPORTED
FTP_AUTH_FAILED
FILE_COPY_INCOMPLETE
UPLOAD_TIMEOUT
NETWORK_OFFLINE
LOW_STORAGE
BACKGROUND_KILLED
SESSION_RECOVERY
```

---

## 8) Chế độ upload Piufoto nhiều khả năng đang có

Dựa trên snippet công khai, app kiểu Piufoto nhiều khả năng có:

### 8.1 Auto Upload
- mọi ảnh mới chụp đều enqueue
- phù hợp sự kiện cần live

### 8.2 Starred Upload
- chỉ ảnh được mark sao trên camera mới upload
- giúp giảm rác
- phù hợp nhiếp ảnh gia chọn ảnh ngay tại máy

### 8.3 Lock / Protected Upload logic
Có 2 khả năng:
- upload ảnh locked/protected
- hoặc ngược lại, skip ảnh bị lock
Vì snippet không đủ rõ, Codex không nên hard-code logic này mà phải để thành config.

### 8.4 Size / quality modes
Nhiều khả năng có:
- original
- large jpeg
- compressed preview

Điều này hợp với nhu cầu:
- live xem nhanh
- sau đó tải file gốc hoặc bán ảnh

---

## 9) Kiến trúc backend hợp lý phía sau Piufoto

## 9.0 Mapping từ Piufoto sang PhotoPro

Nếu Piufoto dùng tư duy `album-centric`, thì PhotoPro của bạn nên dùng tư duy `location-centric`:

```text
user
-> assigned_locations
-> selected_location
-> capture_session
-> media_files
-> previews / watermark / face index
```

Điểm quan trọng:
- **location là thực thể gốc** trong vận hành hằng ngày
- user chỉ nhìn thấy các location được phân quyền sẵn
- session upload luôn phải gắn với một location hợp lệ
- có thể cho phép một location chứa nhiều session theo ngày / ca / photographer


## 9.1 Thành phần backend tối thiểu
- Auth service
- Album service
- Upload service
- File metadata service
- Storage layer
- AI processing workers
- Client gallery service
- Notification / websocket service

## 9.2 Storage strategy
Nên tách:
- original
- preview
- thumbnail
- watermark version

Ví dụ:
```text
/event/{album_id}/original/{file_id}.jpg
/event/{album_id}/preview/{file_id}.jpg
/event/{album_id}/thumb/{file_id}.jpg
/event/{album_id}/watermark/{file_id}.jpg
```

## 9.3 Bảng dữ liệu gợi ý
### locations
- id
- name
- slug
- code
- address
- active
- created_at

### user_locations
- id
- user_id
- location_id
- role_at_location
- assigned_at
- is_active

### capture_sessions
- id
- location_id
- user_id
- connection_type
- device_name
- started_at
- ended_at
- status
- session_date
- photographer_name

### media_files
- id
- location_id
- session_id
- original_filename
- source_type
- camera_model
- captured_at
- file_size
- checksum
- upload_status
- processing_status
- starred_flag
- locked_flag

### transfer_logs
- id
- media_file_id
- stage
- message
- created_at

---

## 10) Kiến trúc mobile hợp lý để clone mô hình Piufoto

Lưu ý cho PhotoPro: màn hình đầu sau đăng nhập nên là **danh sách locations được gán sẵn**, không phải màn hình tạo album tự do.


## 10.1 Các module nên có
### A. Auth + Workspace
- login
- photographer profile
- team / event context

### B. Location Manager
- tải danh sách locations user được phép dùng
- chọn location active
- hiển thị thông tin location / mã location / trạng thái
- có thể cấu hình branding / watermark / URL theo location

### C. Connection Manager
- OTG mode
- FTP mode
- detect device / show instructions

### D. Transfer Engine
- detect new file
- copy file
- queue upload
- retry
- dedupe

### E. Upload Manager
- multipart upload
- progress
- pause/resume
- offline retry

### F. AI / Post-process trigger
- gọi API sau upload
- poll / subscribe trạng thái

### G. Session Monitor UI
- số ảnh đã nhận
- số ảnh đã upload
- số lỗi
- tốc độ truyền
- cảnh báo mất kết nối

## 10.2 Với Android
Android phù hợp hơn cho bản đầu vì:
- USB host / OTG linh hoạt hơn
- background service dễ hơn
- local FTP server khả thi hơn

## 10.3 Với iOS
iOS vẫn làm được, nhưng:
- background hạn chế hơn
- xử lý USB và local server thường khó hơn
- cần thiết kế lại session để tránh app bị treo nền quá lâu

---

## 11) Bản suy luận kỹ thuật sát thực tế nhất cho phần OTG

Đây là flow nên đưa cho Codex nếu muốn clone bản MVP.

### 11.1 Sequence đề xuất
```text
User opens app
-> loads assigned locations
-> selects current location
-> chooses OTG mode
-> app asks USB permission
-> camera connected
-> app identifies protocol (PTP/MTP/storage)
-> app starts watcher
-> user shoots a photo
-> app detects new media object
-> app waits until file size stabilizes
-> app copies file to local temp
-> app computes checksum
-> app creates upload task
-> uploader sends file to cloud
-> backend returns media_id
-> worker generates thumbnail/watermark
-> album websocket pushes new photo to viewers
```

### 11.2 Chi tiết rất quan trọng
#### Chờ file ổn định
Không được upload ngay khi vừa thấy file xuất hiện.  
Phải chờ:
- size đứng yên trong 1–2 chu kỳ polling
- hoặc camera gửi event “transfer complete”

#### Dedupe
Nếu app reconnect, phải tránh upload trùng bằng:
- checksum
- camera object id
- filename + size + captured_at

#### Session recovery
Nếu app crash:
- khôi phục queue từ local db
- resume file chưa upload xong
- đánh dấu orphan temp files để dọn sau

---

## 12) Những gì PhotoPro có thể học từ Piufoto

## 12.1 Điều nên học
- UX cực đơn giản: chỉ cần “chọn album -> chọn kết nối -> chụp”
- hỗ trợ 2 mode:
  - OTG
  - FTP
- auto upload + starred upload
- ảnh lên cloud ngay trong khi sự kiện diễn ra
- client side album cập nhật live

## 12.2 Điều nên cải tiến hơn Piufoto theo hướng PhotoPro
- tập trung mạnh vào **face search**
- có flow **mua ảnh / package / download HD**
- photographer có folder riêng / credential riêng
- backend rõ ràng cho event photo sales
- hỗ trợ FTP thẳng vào cloud storage hoặc S3-compatible server

---

## 13) Spec MVP cho Codex nếu muốn clone logic Piufoto cho PhotoPro

Nguyên tắc mới của PhotoPro:
- user không làm việc theo `album tự tạo`
- user làm việc theo `location được gán sẵn`
- toàn bộ upload, session, phân quyền, thống kê nên xoay quanh location


## 13.1 Mục tiêu MVP
Tạo mobile app Android trước, có thể:

- login photographer
- tải danh sách locations được gán cho tài khoản
- chọn location đang tác nghiệp
- kết nối camera qua OTG
- detect ảnh mới
- upload ảnh lên server
- server tạo preview + watermark
- gallery của location hiển thị ảnh mới theo thời gian thực

## 13.2 Không làm ngay ở MVP
- live view camera control
- remote shutter
- raw editing phức tạp
- AI retouch on-device
- multi-camera sync phức tạp
- iOS background FTP phức tạp

## 13.3 Ưu tiên triển khai
### P1
- Android OTG import
- upload queue
- album realtime
- watermark
- basic dashboard

### P2
- FTP receive
- starred upload
- face indexing
- client search by selfie

### P3
- photo sales
- payment
- photographer payout
- multi-user album collaboration

---

## 14) Yêu cầu kỹ thuật Codex nên hiểu rõ

## 14.1 Đây là app event-driven, không phải chỉ là upload form
Cần architecture bất đồng bộ:
- event detect file mới
- queue upload
- worker xử lý hậu kỳ
- realtime notify

## 14.2 Local DB là bắt buộc
Dùng để lưu:
- capture session
- file queue
- retry state
- upload cursor
- mapping local file -> cloud file

## 14.3 Backend phải idempotent
Nếu 1 ảnh gửi lại 2 lần do reconnect, backend phải nhận ra và không tạo 2 bản ghi khác nhau.

## 14.4 Storage phải tách original và derivative
Nếu chỉ có 1 bản sẽ khó:
- bán ảnh HD
- hiển thị preview
- watermark
- AI search

---

## 15) Bản giả lập kiến trúc end-to-end

```text
[Camera]
   |  OTG / FTP
   v
[Mobile App]
   - Connection Manager
   - File Watcher
   - Temp Cache
   - Upload Queue
   - Session DB
   |
   | HTTPS upload
   v
[Backend API]
   - Auth
   - Album API
   - Upload API
   - Metadata API
   |
   v
[Object Storage]
   - original
   - preview
   - thumbnail
   - watermark
   |
   +--> [AI Worker]
   |     - face index
   |     - retouch
   |     - review
   |
   +--> [Realtime Service]
         - websocket / SSE
         - album updates
         - viewer notification
```

---

## 16) Pseudocode cho Codex

### 16.1 OTG watcher
```pseudo
onUsbConnected(device):
  protocol = detectProtocol(device)
  session = createCaptureSession(protocol)

  while session.active:
    newItems = scanForNewMedia(device, session.lastCursor)

    for item in newItems:
      if isDuplicate(item):
        continue

      waitUntilStable(item)
      localPath = copyToTemp(item)
      checksum = hashFile(localPath)

      queueUpload({
        localPath,
        checksum,
        locationId: session.locationId,
        sourceType: "otg",
        metadata: extractMetadata(localPath, item)
      })

      markSeen(item)
```

### 16.2 Upload worker
```pseudo
workerLoop():
  while true:
    task = getNextPendingUpload()
    if not task:
      sleep(short_interval)
      continue

    try:
      markUploading(task)
      response = uploadFile(task.localPath, task.metadata)
      markUploaded(task, response.mediaId)
      triggerPostProcess(response.mediaId)
    except TemporaryError:
      retryLater(task)
    except FatalError:
      markFailed(task)
```

### 16.3 FTP receiver logic
```pseudo
onFtpFileReceived(file):
  if not isValidPhoto(file):
    return

  if isDuplicate(file):
    return

  localPath = moveToManagedTemp(file)
  checksum = hashFile(localPath)

  queueUpload({
    localPath,
    checksum,
    sourceType: "ftp"
  })
```

---

## 17) Các assumption cần ghi chú cho Codex

### Fact mạnh
- Piufoto hỗ trợ OTG và camera FTP
- Piufoto làm real-time transfer
- Piufoto có automatic upload
- Piufoto có cloud album / AI / sharing

### Suy luận mạnh nhưng chưa có source code xác nhận
- app dùng local staging trước khi upload
- app có queue retry
- app có polling hoặc PTP event detection
- app có state machine session
- app có mode auto/starred/lock filter

### Suy luận cần giữ mở
- exact protocol từng hãng máy ảnh
- exact cách iOS xử lý FTP / background
- exact logic lock upload
- exact format API nội bộ Piufoto

---

## 18) Kết luận ngắn cho Codex

Nếu phải mô tả Piufoto trong 1 câu cho kỹ sư:

> Piufoto là một mobile bridge giữa máy ảnh và cloud album, dùng OTG hoặc FTP để nhận ảnh vừa chụp theo thời gian thực, rồi đẩy qua pipeline upload + AI + gallery distribution cho khách xem gần như live.

Nếu phải mô tả cách clone MVP:

> Hãy xây một Android app có màn hình chọn location được gán sẵn, OTG watcher, temp cache, upload queue, location API, object storage, watermark worker, và realtime gallery theo location; sau đó thêm FTP mode và face search ở phase 2.

---

## 19) Đề xuất áp trực tiếp cho PhotoPro

### Phiên bản phù hợp nhất với bài toán của bạn
- ưu tiên **FTP first** cho thợ ảnh chuyên nghiệp
- giữ **OTG mode** làm fallback / demo / setup nhanh
- backend tập trung vào:
  - assigned locations
  - photographer folders
  - watermark preview
  - face indexing
  - photo sales

### Vì sao
- FTP phù hợp chụp số lượng lớn
- setup 1 lần, dùng lâu dài
- giảm phụ thuộc điện thoại cắm dây liên tục
- hợp với quy trình event / sports / school photography

### Còn OTG nên dùng khi nào
- test MVP nhanh
- camera không có FTP ổn định
- setup onsite nhanh
- cần giải pháp “plug and play”

---

## 20) Deliverable gợi ý tiếp theo cho Codex

Sau tài liệu này, Codex nên viết tiếp các file:

1. `system_architecture.md`
2. `mobile_otg_flow.md`
3. `ftp_mode_flow.md`
4. `upload_queue_design.md`
5. `album_realtime_api_spec.md`
6. `face_search_pipeline.md`

Nếu muốn, có thể dùng chính tài liệu này làm seed để Codex generate:
- PRD
- technical design
- DB schema
- API spec
- mobile task breakdown
