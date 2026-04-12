package vn.photopro.mobile

import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.mtp.MtpConstants
import android.mtp.MtpDevice
import android.mtp.MtpObjectInfo
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class MtpModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "MtpModule"

    private var mtpDevice: MtpDevice? = null
    private var usbDevice: UsbDevice? = null
    private val thumbnailCache = HashMap<Int, String>()

    // ── USB helpers ────────────────────────────────────────────────────────────

    private fun getUsbManager(): UsbManager =
        reactApplicationContext.getSystemService(Context.USB_SERVICE) as UsbManager

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
            try {
                val storageIds = device.storageIds ?: run {
                    promise.resolve(0)
                    return@Thread
                }
                val emitter = reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)

                // ── Phase 1: Collect ALL handles WITHOUT getObjectInfo ───────────────────
                // Fast path: getObjectHandles(FORMAT_EXIF_JPEG, 0xFFFFFFFF) → 1 USB call for all JPEGs.
                // Fallback:  collectHandlesOnly — format-filtered recursive scan, zero getObjectInfo.
                // Either way: count is known in < 100 ms over OTG (only ~5–10 USB calls total).
                val rawHandles = mutableListOf<Pair<Int, Int>>() // (handle, storageId)
                for (sid in storageIds) {
                    val fast = device.getObjectHandles(sid, MtpConstants.FORMAT_EXIF_JPEG, 0xFFFFFFFF.toInt())
                    if (fast != null && fast.isNotEmpty()) {
                        fast.forEach { rawHandles.add(it to sid) }
                    } else {
                        collectHandlesOnly(device, sid, 0, rawHandles)
                    }
                }

                // Emit total immediately
                emitter.emit("MtpScanTotal", rawHandles.size)

                // ── Phase 1b: Emit handle stubs in batches of 200 — ZERO getObjectInfo ──
                // JS renders all N placeholder cells immediately (<100 ms).
                // Thumbnails start loading on-demand for visible cells right away.
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

                // ── Phase 2: Stream full metadata in batches of 50 ──────────────────────
                // Each getObjectInfo = 1 USB round-trip. Results upgrade stubs in JS.
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
            }
        }.start()
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /**
     * Collect JPEG handles recursively using format-filtered queries — ZERO getObjectInfo calls.
     * parentHandle=0 = direct children of storage root.
     * Canon structure: root(0) → DCIM(FORMAT_ASSOCIATION) → 100CANON, 101CANON → *.JPG(FORMAT_EXIF_JPEG)
     */
    private fun collectHandlesOnly(
        device: MtpDevice,
        storageId: Int,
        parentHandle: Int,
        result: MutableList<Pair<Int, Int>>
    ) {
        // JPEGs at this level (Canon, Nikon, most DSLRs)
        device.getObjectHandles(storageId, MtpConstants.FORMAT_EXIF_JPEG, parentHandle)
            ?.forEach { result.add(it to storageId) }
        // JFIF at this level (Sony, some point-and-shoot cameras)
        device.getObjectHandles(storageId, MtpConstants.FORMAT_JFIF, parentHandle)
            ?.forEach { result.add(it to storageId) }
        // Recurse into subfolders
        device.getObjectHandles(storageId, MtpConstants.FORMAT_ASSOCIATION, parentHandle)
            ?.forEach { folder -> collectHandlesOnly(device, storageId, folder, result) }
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

    /** Build a WritableMap for one photo handle (fetches info from camera). Returns null on failure. */
    private fun buildPhotoMap(device: MtpDevice, handle: Int, storageId: Int): WritableMap? {
        val info = device.getObjectInfo(handle) ?: return null
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

    // Required for NativeEventEmitter on RN side
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
