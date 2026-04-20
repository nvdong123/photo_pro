package vn.photopro.mobile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.mtp.MtpConstants
import android.mtp.MtpDevice
import android.mtp.MtpObjectInfo
import android.util.Base64
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import vn.photopro.mobile.otg.OTGSessionActivity

class MtpModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "MtpModule"

    private val prefs by lazy {
        reactApplicationContext.getSharedPreferences("photopro_otg", Context.MODE_PRIVATE)
    }
    private var pendingOTGPromise: Promise? = null

    private var mtpDevice: MtpDevice? = null
    private var usbDevice: UsbDevice? = null
    private val thumbnailCache = HashMap<Int, String>()
    private val activityEventListener: ActivityEventListener = object : BaseActivityEventListener() {
        override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
            if (requestCode != OTG_REQUEST_CODE) return

            val promise = pendingOTGPromise
            pendingOTGPromise = null

            if (promise == null) return
            if (resultCode != Activity.RESULT_OK) {
                promise.reject("OTG_CANCELLED", "Nguoi dung da dong phien OTG")
                return
            }

            val uploaded = data?.getIntExtra("uploadedCount", 0) ?: 0
            val failed = data?.getIntExtra("failedCount", 0) ?: 0
            val result = Arguments.createMap().apply {
                putInt("uploadedCount", uploaded)
                putInt("failedCount", failed)
            }
            promise.resolve(result)
        }
    }

    init {
        reactApplicationContext.addActivityEventListener(activityEventListener)
    }

    // Prevent watcher from touching MTP bus during active scan (MTP is sequential — not thread-safe)
    @Volatile private var isScanning = false

    // ── USB helpers ────────────────────────────────────────────────────────────

    private fun getUsbManager(): UsbManager =
        reactApplicationContext.getSystemService(Context.USB_SERVICE) as UsbManager

    private fun getStoredToken(): String =
        prefs.getString(OTG_AUTH_TOKEN_KEY, "") ?: ""

    private fun getStoredApiUrl(): String =
        prefs.getString(OTG_API_URL_KEY, BuildConfig.API_URL) ?: BuildConfig.API_URL

    private fun findCamera(usbManager: UsbManager): UsbDevice? =
        usbManager.deviceList.values.firstOrNull { device ->
            device.deviceClass == UsbConstants.USB_CLASS_STILL_IMAGE ||
            device.deviceClass == 0x00  // composite device (Canon, Nikon)
        }

    // ── Detect connected USB/OTG camera ───────────────────────────────────────

    @ReactMethod
    fun detectDevice(promise: Promise) {
        try {
            val usbManager = getUsbManager()
            val camera = findCamera(usbManager)
            if (camera == null) {
                promise.resolve(null)
                return
            }
            val info = Arguments.createMap().apply {
                putString("deviceName", camera.deviceName)
                putString("manufacturerName", camera.manufacturerName ?: "Unknown")
                putString("productName", camera.productName ?: "Camera")
                putInt("vendorId", camera.vendorId)
                putInt("productId", camera.productId)
            }
            promise.resolve(info)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun configureOTGSession(apiUrl: String, authToken: String, promise: Promise) {
        prefs.edit()
            .putString(OTG_API_URL_KEY, apiUrl.trimEnd('/'))
            .putString(OTG_AUTH_TOKEN_KEY, authToken)
            .apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun startOTGSession(
        locationId: String,
        locationName: String,
        shootDate: String,
        promise: Promise
    ) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "Khong co activity")
            return
        }

        if (pendingOTGPromise != null) {
            promise.reject("OTG_BUSY", "Phien OTG khac dang chay")
            return
        }

        val authToken = getStoredToken()
        if (authToken.isBlank()) {
            promise.reject("NO_AUTH_TOKEN", "Chua co auth token")
            return
        }

        val intent = Intent(activity, OTGSessionActivity::class.java).apply {
            putExtra("locationId", locationId)
            putExtra("locationName", locationName)
            putExtra("apiUrl", getStoredApiUrl())
            putExtra("authToken", authToken)
            putExtra("shootDate", shootDate)
            // Do NOT add FLAG_ACTIVITY_NEW_TASK — breaks startActivityForResult
        }

        pendingOTGPromise = promise
        activity.startActivityForResult(intent, OTG_REQUEST_CODE)
    }

    // ── Connect + open MTP session ─────────────────────────────────────────────

    @ReactMethod
    fun connect(promise: Promise) {
        try {
            val usbManager = getUsbManager()
            val camera = findCamera(usbManager) ?: run {
                promise.reject("NO_DEVICE", "Khong tim thay may anh OTG")
                return
            }

            if (!usbManager.hasPermission(camera)) {
                promise.reject("NO_PERMISSION", "Can cap quyen USB. Khi hop thoai xuat hien, chon Cho phep.")
                return
            }

            val connection = usbManager.openDevice(camera) ?: run {
                promise.reject("OPEN_FAILED", "Khong the mo ket noi USB")
                return
            }

            val device = MtpDevice(camera)
            if (!device.open(connection)) {
                promise.reject("MTP_FAILED", "Khong the mo phien MTP. Dam bao may anh o che do PTP/MTP.")
                return
            }

            mtpDevice = device
            usbDevice = camera

            val info = Arguments.createMap().apply {
                putString("manufacturer", device.deviceInfo?.manufacturer ?: camera.manufacturerName ?: "Canon")
                putString("model", device.deviceInfo?.model ?: camera.productName ?: "Camera")
                putString("serialNumber", device.deviceInfo?.serialNumber ?: "")
            }
            promise.resolve(info)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // ── List all JPEG photos on camera (fast single-call + fallback) ──────────

    @ReactMethod
    fun getPhotoList(promise: Promise) {
        val device = mtpDevice ?: run {
            promise.reject("NOT_CONNECTED", "Chưa kết nối máy ảnh")
            return
        }
        Thread {
            try {
                val storageIds = device.storageIds
                if (storageIds == null || storageIds.isEmpty()) {
                    promise.resolve(Arguments.createArray())
                    return@Thread
                }
                val photos = Arguments.createArray()
                for (storageId in storageIds) {
                    // Fast path: ask camera for ALL JPEGs in one shot
                    val jpegHandles = device.getObjectHandles(
                        storageId, MtpConstants.FORMAT_EXIF_JPEG, 0xFFFFFFFF.toInt()
                    )
                    if (jpegHandles != null && jpegHandles.isNotEmpty()) {
                        for (handle in jpegHandles) {
                            buildPhotoMap(device, handle, storageId)?.let { photos.pushMap(it) }
                        }
                    } else {
                        // Fallback: recursive scan from storage root (parentHandle=0)
                        scanFolderFromRoot(device, storageId, 0, photos)
                    }
                }
                promise.resolve(photos)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }.start()
    }

    // ── Stream photos — 2-phase: discover handles → emit total → stream metadata ──────────────

    @ReactMethod
    fun getPhotoListStreaming(promise: Promise) {
        val device = mtpDevice ?: run {
            promise.reject("NOT_CONNECTED", "Chưa kết nối")
            return
        }
        Thread {
            isScanning = true
            try {
                val storageIds = device.storageIds ?: run {
                    promise.resolve(0)
                    return@Thread
                }
                val emitter = reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)

                // ── Phase 1: Collect ALL handles WITHOUT getObjectInfo ───────────────────
                // Strategy 1: FORMAT_EXIF_JPEG + parent=0xFFFFFFFF → works on Nikon/Fuji/Sony
                // Strategy 2: format=0 + parent=0xFFFFFFFF → works on Canon EOS (no format filter)
                // Strategy 3: recursive with format=0 per level + getObjectInfo classify → universal fallback
                val rawHandles = mutableListOf<Pair<Int, Int>>() // (handle, storageId)
                var fastPathWorked = false // true = all rawHandles guaranteed to be JPEGs (safe for stubs)

                for (sid in storageIds) {
                    val fast = device.getObjectHandles(sid, MtpConstants.FORMAT_EXIF_JPEG, 0xFFFFFFFF.toInt())
                    if (fast != null && fast.isNotEmpty()) {
                        // Strategy 1 worked — guaranteed JPEGs only
                        fast.forEach { rawHandles.add(it to sid) }
                        fastPathWorked = true
                    } else {
                        // Strategy 2: Canon EOS — get ALL objects in storage flat
                        val all = device.getObjectHandles(sid, 0, 0xFFFFFFFF.toInt())
                        if (all != null && all.isNotEmpty()) {
                            all.forEach { rawHandles.add(it to sid) }
                            // NOTE: includes folders — buildPhotoMap will filter them in Phase 2
                        } else {
                            // Strategy 3: full recursive fallback
                            collectHandlesOnly(device, sid, 0, rawHandles)
                        }
                    }
                }

                // Emit total immediately
                emitter.emit("MtpScanTotal", rawHandles.size)

                // ── Phase 1b: Emit handle stubs ONLY when handles are guaranteed JPEGs ──
                // If Strategy 2/3 was used, rawHandles may contain folders → skip stubs to avoid
                // placeholder cells that never get upgraded.
                if (fastPathWorked) {
                    var stubStart = 0
                    while (stubStart < rawHandles.size) {
                        val stubEnd = minOf(stubStart + 200, rawHandles.size)
                        val stubArr = Arguments.createArray()
                        for (i in stubStart until stubEnd) {
                            val (h, sid) = rawHandles[i]
                            stubArr.pushMap(Arguments.createMap().apply {
                                putInt("handle", h)
                                putInt("storageId", sid)
                            })
                        }
                        emitter.emit("MtpHandlesBatch", stubArr)
                        stubStart = stubEnd
                    }
                }

                // ── Phase 2: Stream full metadata in batches of 50 ──────────────────────
                // buildPhotoMap filters non-JPEG objects (folders, RAW, etc.)
                var pending = mutableListOf<WritableMap>()

                fun flush() {
                    if (pending.isEmpty()) return
                    val arr = Arguments.createArray()
                    pending.forEach { arr.pushMap(it) }
                    pending = mutableListOf()
                    emitter.emit("MtpPhotosBatch", arr)
                }

                for ((handle, sid) in rawHandles) {
                    buildPhotoMap(device, handle, sid)?.let { pending.add(it) }
                    if (pending.size >= 50) flush()
                }
                flush()

                promise.resolve(rawHandles.size)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            } finally {
                isScanning = false
            }
        }.start()
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /**
     * Collect JPEG handles recursively.
     * Primary: format-filtered queries (fast, zero getObjectInfo).
     * Fallback: format=0 + getObjectInfo classification (for Canon when format filter is unsupported).
     */
    private fun collectHandlesOnly(
        device: MtpDevice,
        storageId: Int,
        parentHandle: Int,
        result: MutableList<Pair<Int, Int>>
    ) {
        // JPEGs at this level
        val jpegs = device.getObjectHandles(storageId, MtpConstants.FORMAT_EXIF_JPEG, parentHandle)
        jpegs?.forEach { result.add(it to storageId) }
        // JFIF at this level (Sony, some point-and-shoot)
        device.getObjectHandles(storageId, MtpConstants.FORMAT_JFIF, parentHandle)
            ?.forEach { result.add(it to storageId) }
        // Recurse into subfolders
        val folders = device.getObjectHandles(storageId, MtpConstants.FORMAT_ASSOCIATION, parentHandle)
        if (folders != null) {
            folders.forEach { folder -> collectHandlesOnly(device, storageId, folder, result) }
        } else if (jpegs == null) {
            // Canon EOS: format filter not supported at this level.
            // Fall back to format=0 (all objects) and classify via getObjectInfo.
            val all = device.getObjectHandles(storageId, 0, parentHandle) ?: return
            for (handle in all) {
                val info = device.getObjectInfo(handle) ?: continue
                val name = info.name?.lowercase() ?: ""
                when {
                    info.format == MtpConstants.FORMAT_ASSOCIATION ->
                        collectHandlesOnly(device, storageId, handle, result)
                    info.format == MtpConstants.FORMAT_EXIF_JPEG ||
                    info.format == MtpConstants.FORMAT_JFIF ->
                        result.add(handle to storageId)
                    name.endsWith(".jpg") || name.endsWith(".jpeg") ->
                        result.add(handle to storageId)
                }
            }
        }
    }

    /** Build a WritableMap when MtpObjectInfo is already fetched (avoids second USB round-trip). */
    private fun buildPhotoMapFromInfo(info: MtpObjectInfo, handle: Int, storageId: Int): WritableMap =
        Arguments.createMap().apply {
            putInt("handle", handle)
            putString("filename", info.name ?: "")
            putInt("fileSize", info.compressedSize)
            putDouble("captureTime", info.dateCreated.toDouble() * 1000.0)
            putInt("storageId", storageId)
            putInt("imagePixWidth", info.imagePixWidth)
            putInt("imagePixHeight", info.imagePixHeight)
        }

    /** Build a WritableMap for one photo handle (fetches info from camera). Returns null on failure or non-JPEG. */
    private fun buildPhotoMap(device: MtpDevice, handle: Int, storageId: Int): WritableMap? {
        val info = device.getObjectInfo(handle) ?: return null
        // Filter folders and non-JPEG files (critical when using all-formats fallback for Canon)
        val name = info.name?.lowercase() ?: ""
        val isJpeg = info.format == MtpConstants.FORMAT_EXIF_JPEG ||
                     info.format == MtpConstants.FORMAT_JFIF ||
                     (info.format != MtpConstants.FORMAT_ASSOCIATION &&
                      (name.endsWith(".jpg") || name.endsWith(".jpeg")))
        if (!isJpeg) return null
        return buildPhotoMapFromInfo(info, handle, storageId)
    }

    /** Recursive folder scan starting from parentHandle (use 0 for storage root). */
    private fun scanFolderFromRoot(
        device: MtpDevice,
        storageId: Int,
        parentHandle: Int,
        results: WritableArray
    ) {
        val handles = device.getObjectHandles(storageId, 0, parentHandle) ?: return
        for (handle in handles) {
            val info = device.getObjectInfo(handle) ?: continue
            val name = info.name ?: ""
            val isJpeg = info.format == MtpConstants.FORMAT_EXIF_JPEG ||
                         info.format == MtpConstants.FORMAT_JFIF ||
                         name.lowercase().endsWith(".jpg") ||
                         name.lowercase().endsWith(".jpeg")
            when {
                isJpeg -> results.pushMap(buildPhotoMapFromInfo(info, handle, storageId))
                info.format == MtpConstants.FORMAT_ASSOCIATION ->
                    scanFolderFromRoot(device, storageId, handle, results)
            }
        }
    }

    /** Collect all JPEG handles for watcher diff (fast path + fallback). */
    private fun collectJpegHandles(device: MtpDevice, storageId: Int): Set<Int> {
        val fast = device.getObjectHandles(storageId, MtpConstants.FORMAT_EXIF_JPEG, 0xFFFFFFFF.toInt())
        if (fast != null && fast.isNotEmpty()) return fast.toSet()
        // Fallback recursive
        val result = mutableSetOf<Int>()
        fun recurse(parentHandle: Int) {
            val handles = device.getObjectHandles(storageId, 0, parentHandle) ?: return
            for (handle in handles) {
                val info = device.getObjectInfo(handle) ?: continue
                val name = info.name ?: ""
                val isJpeg = info.format == MtpConstants.FORMAT_EXIF_JPEG ||
                             info.format == MtpConstants.FORMAT_JFIF ||
                             name.lowercase().endsWith(".jpg") ||
                             name.lowercase().endsWith(".jpeg")
                if (isJpeg) result.add(handle)
                else if (info.format == MtpConstants.FORMAT_ASSOCIATION) recurse(handle)
            }
        }
        recurse(0)
        return result
    }

    // ── Get JPEG thumbnail (base64) — cached, background thread ───────────────

    @ReactMethod
    fun getThumbnail(handle: Int, promise: Promise) {
        thumbnailCache[handle]?.let {
            promise.resolve(it)
            return
        }
        val device = mtpDevice ?: run {
            promise.reject("NOT_CONNECTED", "Chua ket noi")
            return
        }
        Thread {
            try {
                val thumbnail = device.getThumbnail(handle)
                if (thumbnail == null) {
                    promise.resolve(null)
                    return@Thread
                }
                val b64 = Base64.encodeToString(thumbnail, Base64.NO_WRAP)
                val dataUrl = "data:image/jpeg;base64,$b64"
                thumbnailCache[handle] = dataUrl
                promise.resolve(dataUrl)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }.start()
    }

    // ── Download a photo to app cache dir ─────────────────────────────────────

    @ReactMethod
    fun downloadPhoto(handle: Int, filename: String, promise: Promise) {
        val device = mtpDevice ?: run {
            promise.reject("NOT_CONNECTED", "Chua ket noi")
            return
        }
        // importFile is a blocking USB transfer — must run off the main thread.
        Thread {
            try {
                val cacheDir = reactApplicationContext.cacheDir
                val file = File(cacheDir, filename)
                val success = device.importFile(handle, file.absolutePath)
                if (success) {
                    promise.resolve(file.absolutePath)
                } else {
                    promise.reject("DOWNLOAD_FAILED", "Khong the tai anh tu may anh")
                }
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }.start()
    }

    // ── Poll for new photos every 2s, emit RN events ──────────────────────────

    @Volatile
    private var watchingActive = false

    @ReactMethod
    fun startWatching(promise: Promise) {
        val device = mtpDevice ?: run {
            promise.reject("NOT_CONNECTED", "Chua ket noi")
            return
        }
        if (watchingActive) {
            promise.resolve(null)
            return
        }
        watchingActive = true

        Thread {
            var lastHandles: Set<Int> = try {
                device.storageIds?.flatMap { sid ->
                    collectJpegHandles(device, sid).toList()
                }?.toSet() ?: emptySet()
            } catch (_: Exception) { emptySet() }

            while (watchingActive && mtpDevice != null) {
                Thread.sleep(2000)
                // Skip this poll cycle if initial scan is still running
                // MTP is a sequential protocol — concurrent USB calls cause timeouts
                if (isScanning) continue
                try {
                    val current: Set<Int> = device.storageIds?.flatMap { sid ->
                        collectJpegHandles(device, sid).toList()
                    }?.toSet() ?: emptySet()

                    val newHandles = current - lastHandles
                    newHandles.forEach { handle ->
                        val info = device.getObjectInfo(handle)
                        val eventData = Arguments.createMap().apply {
                            putInt("handle", handle)
                            putString("filename", info?.name ?: "")
                            putInt("fileSize", info?.compressedSize ?: 0)
                            putDouble("captureTime", (info?.dateCreated ?: 0L).toDouble() * 1000.0)
                            putInt("storageId", 0)
                            putInt("imagePixWidth", info?.imagePixWidth ?: 0)
                            putInt("imagePixHeight", info?.imagePixHeight ?: 0)
                        }
                        reactApplicationContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("MtpNewPhoto", eventData)
                    }
                    lastHandles = current
                } catch (_: Exception) {
                    // Device disconnected — stop polling
                    watchingActive = false
                }
            }
        }.start()

        promise.resolve(null)
    }

    @ReactMethod
    fun stopWatching(promise: Promise) {
        watchingActive = false
        promise.resolve(null)
    }

    // ── Disconnect ─────────────────────────────────────────────────────────────

    @ReactMethod
    fun disconnect(promise: Promise) {
        watchingActive = false
        try { mtpDevice?.close() } catch (_: Exception) {}
        mtpDevice = null
        usbDevice = null
        promise.resolve(null)
    }

    // ── Diagnose — log Canon MTP behaviour for debugging ────────────────────

    @ReactMethod
    fun diagnose(promise: Promise) {
        val device = mtpDevice ?: run {
            promise.reject("NOT_CONNECTED", "Chưa kết nối")
            return
        }

        Thread {
            try {
                val result = Arguments.createMap()

                // 1. Device info
                val devInfo = device.deviceInfo
                result.putString("manufacturer", devInfo?.manufacturer ?: "null")
                result.putString("model", devInfo?.model ?: "null")
                result.putString("version", devInfo?.version ?: "null")

                // 2. Storage list
                val storageIds = device.storageIds
                result.putInt("storageCount", storageIds?.size ?: 0)

                if (storageIds != null && storageIds.isNotEmpty()) {
                    val storageId = storageIds[0]
                    result.putInt("firstStorageId", storageId)

                    // 3. Try different getObjectHandles strategies
                    val strategies = Arguments.createMap()

                    // Strategy A: FORMAT_EXIF_JPEG + parent=0xFFFFFFFF  (works on Nikon/Sony/Fuji)
                    val exifAll = try {
                        device.getObjectHandles(storageId, MtpConstants.FORMAT_EXIF_JPEG, 0xFFFFFFFF.toInt())
                    } catch (e: Exception) { null }
                    strategies.putString("A_EXIF_JPEG_allParent",
                        if (exifAll == null) "null" else "${exifAll.size} handles")

                    // Strategy B: FORMAT_JFIF + parent=0xFFFFFFFF
                    val jfifAll = try {
                        device.getObjectHandles(storageId, MtpConstants.FORMAT_JFIF, 0xFFFFFFFF.toInt())
                    } catch (e: Exception) { null }
                    strategies.putString("B_JFIF_allParent",
                        if (jfifAll == null) "null" else "${jfifAll.size} handles")

                    // Strategy C: format=0 (all formats) + parent=0xFFFFFFFF
                    val allAll = try {
                        device.getObjectHandles(storageId, 0, 0xFFFFFFFF.toInt())
                    } catch (e: Exception) { null }
                    strategies.putString("C_format0_allParent",
                        if (allAll == null) "null" else "${allAll.size} handles")

                    // Strategy D: format=0 + parent=0 (root children only)
                    val root0 = try {
                        device.getObjectHandles(storageId, 0, 0)
                    } catch (e: Exception) { null }
                    strategies.putString("D_format0_parent0",
                        if (root0 == null) "null" else "${root0.size} handles")

                    // Strategy E: FORMAT_ASSOCIATION + parent=0 (find DCIM folder)
                    val folders0 = try {
                        device.getObjectHandles(storageId, MtpConstants.FORMAT_ASSOCIATION, 0)
                    } catch (e: Exception) { null }
                    strategies.putString("E_ASSOCIATION_parent0",
                        if (folders0 == null) "null" else "${folders0.size} handles")

                    // Strategy F: FORMAT_EXIF_JPEG + parent=0 (JPEGs in root)
                    val jpegRoot = try {
                        device.getObjectHandles(storageId, MtpConstants.FORMAT_EXIF_JPEG, 0)
                    } catch (e: Exception) { null }
                    strategies.putString("F_EXIF_JPEG_parent0",
                        if (jpegRoot == null) "null" else "${jpegRoot.size} handles")

                    result.putMap("strategies", strategies)

                    // 4. Show first 10 items from root (format=0, parent=0)
                    if (root0 != null && root0.isNotEmpty()) {
                        val rootItems = Arguments.createArray()
                        for (h in root0.take(10)) {
                            val info = device.getObjectInfo(h)
                            rootItems.pushMap(Arguments.createMap().apply {
                                putInt("handle", h)
                                putString("name", info?.name ?: "null")
                                putString("format", String.format("0x%04X", info?.format ?: 0))
                                putInt("size", info?.compressedSize ?: -1)
                            })
                        }
                        result.putArray("rootItems", rootItems)
                    }

                    // 5. If we found folders at root, recurse one level into first folder
                    if (root0 != null) {
                        for (h in root0) {
                            val info = device.getObjectInfo(h) ?: continue
                            if (info.format == MtpConstants.FORMAT_ASSOCIATION) {
                                val folderName = info.name ?: "?"
                                // Get children of this folder
                                val children = device.getObjectHandles(storageId, 0, h)
                                val childArr = Arguments.createArray()
                                if (children != null) {
                                    for (ch in children.take(10)) {
                                        val ci = device.getObjectInfo(ch)
                                        childArr.pushMap(Arguments.createMap().apply {
                                            putInt("handle", ch)
                                            putString("name", ci?.name ?: "null")
                                            putString("format", String.format("0x%04X", ci?.format ?: 0))
                                            putInt("size", ci?.compressedSize ?: -1)
                                        })
                                    }
                                }
                                result.putString("firstFolderName", folderName)
                                result.putInt("firstFolderChildCount", children?.size ?: -1)
                                result.putArray("firstFolderItems", childArr)
                                break // only first folder
                            }
                        }
                    }

                    // 6. If Strategy C worked, show first 5 object infos from flat list
                    if (allAll != null && allAll.isNotEmpty()) {
                        val sample = Arguments.createArray()
                        for (h in allAll.take(5)) {
                            val info = device.getObjectInfo(h)
                            sample.pushMap(Arguments.createMap().apply {
                                putInt("handle", h)
                                putString("name", info?.name ?: "null")
                                putString("format", String.format("0x%04X", info?.format ?: 0))
                                putInt("size", info?.compressedSize ?: -1)
                            })
                        }
                        result.putArray("flatSample", sample)
                    }
                }

                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("ERROR", "${e.javaClass.simpleName}: ${e.message}")
            }
        }.start()
    }

    // Required for NativeEventEmitter on RN side
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    companion object {
        private const val OTG_REQUEST_CODE = 5417
        private const val OTG_AUTH_TOKEN_KEY = "auth_token"
        private const val OTG_API_URL_KEY = "api_url"
    }
}
