# PhotoPro Mobile Refactor Spec for Codex
<!-- Ghi chú VN: File này viết rule bằng tiếng Anh để Codex hiểu tốt hơn. Các note ngắn trong comment dùng tiếng Việt để bạn đọc nhanh. -->
<!-- Ghi chú VN: UI/UX target = càng gần Piufoto càng tốt, nhưng map lại sang mô hình Location của PhotoPro. -->

## 1. Goal

Refactor the existing PhotoPro mobile app so that:

- the UI/UX becomes simpler and closer to Piufoto's field-operator workflow
- the app supports two connection modes:
  - **Wired**
  - **Wireless**
- both connection modes feed into **one unified capture session pipeline**
- the app integrates with the **existing PhotoPro backend/system**
- the app uses **Location-based workflow**, not free-form album creation

<!-- Ghi chú VN:
- Mục tiêu không phải làm lại cả hệ thống
- Chỉ refactor mobile app
- Flow UI/UX phải giống tool tác nghiệp ngoài hiện trường
-->

---

## 2. Core Product Rules

### Rule 2.1 — Do not redesign the whole platform
The mobile app must be treated as a bridge client for the existing PhotoPro system.

It must integrate with:
- existing authentication
- existing assigned locations
- existing storage/upload backend
- existing gallery flow
- existing watermark/preview flow
- existing face indexing/search flow if already available

### Rule 2.2 — Location is the primary working unit
The user does **not** create a main album manually.

The user must:
1. log in
2. load assigned locations from backend
3. select one location
4. start a capture session under that location

### Rule 2.3 — UI must be field-friendly
The app must feel like a real event photography tool, not an admin dashboard.

The UI must:
- reduce cognitive load
- minimize taps
- use large, obvious actions
- make connection status and upload status visible at all times
- avoid admin-like complexity on the main flow

### Rule 2.4 — Wired and Wireless are connector modes, not separate systems
Wired and Wireless must have separate setup flows, but after file ingestion they must enter the same internal pipeline:

```text
Location selected
-> Connection mode selected
-> Connection adapter initialized
-> Capture session started
-> Incoming files normalized
-> Local queue
-> Upload pipeline
-> Existing backend/gallery flow
```

<!-- Ghi chú VN:
- Đây là rule rất quan trọng
- Wired/Wireless khác nhau ở bước setup
- Nhưng sau đó phải đổ vào cùng một pipeline
-->

### Rule 2.5 — AI Retouch is out of scope
Do not design AI Retouch into the current mobile refactor.

Do not add:
- retouch worker assumptions
- retouch UI
- retouch dependency before publish
- retouch-first workflow

The correct current pipeline is:

```text
Capture
-> Local temp/cache
-> Upload
-> Preview/thumbnail
-> Watermark
-> Face indexing/search
-> Gallery / sales flow
```

---

## 3. UX Target

### Rule 3.1 — UX should closely follow Piufoto style
The target UX should be visually and behaviorally similar to Piufoto:

- simple workflow
- minimal screen count
- strong session-oriented operation
- clear connection mode choice
- clear live transfer/upload status
- fast transition from setup to active capture

However, PhotoPro must replace Piufoto's "album/event album" mental model with PhotoPro's "location" model.

### Rule 3.2 — The user should always know 4 things
During the active workflow, the user must always understand:

1. Which **location** is currently active
2. Which **connection mode** is active
3. Whether the device is **connected or not**
4. Whether photos are **being received/uploaded successfully**

### Rule 3.3 — Do not overload the first-use flow
The setup flow must not expose too many technical details upfront.

Show advanced details only when needed.

For example:
- show a big "Wired" card
- show a big "Wireless" card
- show only the necessary setup instructions
- hide low-level diagnostics behind an expandable section if required

<!-- Ghi chú VN:
- Đừng làm UI giống dashboard kỹ thuật
- Ưu tiên thao tác nhanh, dễ hiểu
-->

---

## 4. Recommended Screen Structure

## Screen 1 — Login
Purpose:
- authenticate the user with the existing PhotoPro auth system

Requirements:
- simple login UI
- loading state
- error state
- optional remember session behavior if supported

## Screen 2 — Select Location
Purpose:
- display the list of assigned locations for the logged-in user

Requirements:
- show only locations assigned to the user
- allow one active selection
- show basic location info only
- primary CTA: `Continue`

Do not:
- expose free album creation here
- expose advanced settings here

<!-- Ghi chú VN:
- Màn này thay cho tư duy album
- Chỉ chọn location được gán sẵn
-->

## Screen 3 — Select Connection Mode
Purpose:
- let the user choose how they want to connect the camera workflow

Options:
- `Wired`
- `Wireless`

Requirements:
- large card-based selection
- one short description per mode
- one primary CTA after selection

Suggested card labels:
- Wired — "Connect camera via cable"
- Wireless — "Receive photos wirelessly"

## Screen 4A — Wired Setup
Purpose:
- guide the user to establish the wired capture connection

Requirements:
- show visual instruction for cable/OTG connection
- detect device status
- show states:
  - disconnected
  - requesting permission
  - connected
  - error
- show primary CTA: `Start Session`

Do not:
- overload with protocol details unless necessary
- expose engineering terms by default

## Screen 4B — Wireless Setup
Purpose:
- guide the user to establish the wireless receiving flow

Requirements:
- show the required wireless setup information clearly
- show connection/waiting state
- show incoming status once active
- show primary CTA: `Start Session`

The exact setup UI can vary depending on the chosen wireless architecture, but the user flow must still feel lightweight.

## Screen 5 — Session Monitor
Purpose:
- act as the main operational screen during a shoot

Must display:
- current location
- current connection mode
- session state
- received photo count
- queued upload count
- uploaded count
- latest error or warning
- recent activity feedback

Primary actions:
- pause session
- retry failed items
- end session

Optional secondary actions:
- open diagnostics
- open upload details
- switch connection mode only if safe

<!-- Ghi chú VN:
- Đây là màn quan trọng nhất
- Người dùng sẽ ở đây trong lúc tác nghiệp
-->

---

## 5. Visual/UI Direction

### Rule 5.1 — Match Piufoto style direction
Use a UI direction similar to Piufoto:
- clean
- modern
- mobile-first
- large touch targets
- minimal clutter
- strong visual hierarchy
- obvious primary CTA
- session-centric visual layout

### Rule 5.2 — Prefer operational cards over dense tables
Use:
- status cards
- progress blocks
- mode cards
- simple counters

Avoid:
- dense management tables
- complex nested menus
- hidden critical status

### Rule 5.3 — The active session must feel "live"
The Session Monitor screen should feel active/live:
- visible connection badge
- visible upload activity
- visible counts
- visible warning states
- lightweight recent-event feedback

---

## 6. Connection Architecture Rules

## 6.1 Unified internal architecture
Both connector modes must feed the same internal pipeline.

High-level architecture:

```text
Selected Location
-> Connection Mode
-> Connection Adapter
   -> Wired Adapter
   -> Wireless Adapter
-> File Intake Layer
-> Normalization Layer
-> Local Queue
-> Upload Manager
-> Existing Backend APIs
```

## 6.2 Wired mode rules
Wired mode must:
- initialize a wired adapter
- detect camera/device presence
- request required permissions
- detect incoming files or media objects
- move valid files into local managed queue
- push upload tasks into the unified upload manager

The UI flow must hide technical complexity unless something fails.

## 6.3 Wireless mode rules
Wireless mode must:
- initialize a wireless adapter
- expose only the setup data the user truly needs
- detect incoming files or remote transfer readiness
- move valid files into local managed queue or direct managed intake
- push upload tasks into the unified upload manager

Wireless must not become a completely different data model.

## 6.4 Session lifecycle rules
A capture session must always belong to:
- one authenticated user
- one selected location
- one connection mode
- one active session state

Suggested states:
- idle
- preparing
- ready
- active
- paused
- recovering
- ended
- failed

<!-- Ghi chú VN:
- Session là lõi của app
- Mọi ảnh nhận được phải gắn với session
-->

---

## 7. Upload and Intake Rules

### Rule 7.1 — Use local managed staging/queue
Do not assume immediate direct publish from incoming camera file to final backend success.

Use:
- managed temporary intake
- queue state
- retry support
- dedupe support

### Rule 7.2 — Normalize both modes before upload
Files coming from Wired and Wireless must be normalized into a shared structure such as:

```ts
type IncomingCaptureItem = {
  locationId: string;
  sessionId: string;
  sourceType: "wired" | "wireless";
  localPath: string;
  originalFilename?: string;
  capturedAt?: string;
  fileSize?: number;
  checksum?: string;
  metadata?: Record<string, unknown>;
};
```

### Rule 7.3 — Backend calls should reuse existing services
Do not invent a new backend domain model if the current PhotoPro backend already has relevant endpoints.

Prefer:
- existing auth APIs
- existing location assignment APIs
- existing media upload endpoints
- existing gallery/session-related endpoints if available

Only add new backend endpoints if absolutely necessary for:
- mobile session bootstrap
- mobile upload state sync
- device/session diagnostics

---

## 8. UX Copy Direction

All user-facing copy should be:
- simple
- direct
- operational
- non-technical by default

Examples:
- "Select Location"
- "Choose Connection"
- "Camera connected"
- "Waiting for photos"
- "Uploading photos"
- "Upload issue detected"
- "Retry failed uploads"

Avoid exposing raw engineering terms unless inside diagnostics.

---

## 9. Refactor Priorities

Priority order:

1. simplify the mobile UI/UX
2. align the app flow with the real operator workflow
3. refactor Wired setup flow
4. refactor Wireless setup flow
5. unify file/session/upload pipeline
6. integrate cleanly with existing backend
7. add diagnostics and recovery UX
8. leave future advanced features for later

<!-- Ghi chú VN:
- Không ưu tiên thêm feature mới trước
- Ưu tiên chỉnh flow và kiến trúc mobile
-->

---

## 10. Explicit Non-Goals

Do not prioritize these in the current phase:
- AI Retouch
- advanced editing UI
- complex gallery management inside mobile
- deep admin tools on mobile
- redesigning the entire backend from scratch
- building two fully separate upload architectures for Wired and Wireless

---

## 11. Suggested Deliverables for Codex

Codex should generate or update:

1. `mobile_information_architecture.md`
2. `mobile_screen_flow.md`
3. `wired_connection_flow.md`
4. `wireless_connection_flow.md`
5. `unified_capture_session_design.md`
6. `mobile_upload_queue_design.md`
7. `mobile_api_integration_map.md`
8. `session_monitor_screen_spec.md`

---

## 12. One-Sentence Implementation Summary

Refactor the PhotoPro mobile app to closely match Piufoto-style UI/UX, keep the workflow location-based, and implement Wired/Wireless as two setup modes feeding one shared capture-session and upload pipeline on top of the existing backend.
