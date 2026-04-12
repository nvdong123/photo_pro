package vn.photopro.mobile

import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.mtp.MtpConstants
import android.mtp.MtpDevice
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

    // ── List all JPEG photos on camera (recursive, background thread) ──────────

    @ReactMethod
    fun getPhotoList(promise: Promise) {
        val device = mtpDevice ?: run {
            promise.reject("NOT_CONNECTED", "Chua ket noi may anh")
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
                    scanFolder(device, storageId, 0xFFFFFFFF.toInt(), photos)
                }
                promise.resolve(photos)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }.start()
    }

    // ── Stream photos in batches of 50 — faster perceived load ────────────────

    @ReactMethod
    fun getPhotoListStreaming(promise: Promise) {
        val device = mtpDevice ?: run {
            promise.reject("NOT_CONNECTED", "Chua ket noi")
            return
        }
        Thread {
            try {
                val storageIds = device.storageIds ?: run {
                    promise.resolve(0)
                    return@Thread
                }
                var totalCount = 0
                val pendingBatch = mutableListOf<WritableMap>()

                fun emitBatch() {
                    if (pendingBatch.isEmpty()) return
                    val arr = Arguments.createArray()
                    pendingBatch.forEach { arr.pushMap(it) }
                    pendingBatch.clear()
                    reactApplicationContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("MtpPhotosBatch", arr)
                }

                fun scanStreaming(storageId: Int, parentHandle: Int) {
                    val handles = device.getObjectHandles(storageId, 0, parentHandle) ?: return
                    for (handle in handles) {
                        val info = device.getObjectInfo(handle) ?: continue
                        when (info.format) {
                            MtpConstants.FORMAT_EXIF_JPEG,
                            MtpConstants.FORMAT_JFIF -> {
                                pendingBatch.add(Arguments.createMap().apply {
                                    putInt("handle", handle)
                                    putString("filename", info.name ?: "")
                                    putInt("fileSize", info.compressedSize)
                                    putDouble("captureTime", info.dateCreated.toDouble() * 1000.0)
                                    putInt("storageId", storageId)
                                    putInt("imagePixWidth", info.imagePixWidth)
                                    putInt("imagePixHeight", info.imagePixHeight)
                                })
                                totalCount++
                                if (pendingBatch.size >= 50) emitBatch()
                            }
                            MtpConstants.FORMAT_ASSOCIATION -> {
                                scanStreaming(storageId, handle)
                            }
                        }
                    }
                }

                for (storageId in storageIds) {
                    scanStreaming(storageId, 0xFFFFFFFF.toInt())
                }
                emitBatch()
                promise.resolve(totalCount)
            } catch (e: Exception) {
                promise.reject("ERROR", e.message)
            }
        }.start()
    }

    // ── Private: recursive JPEG scan, appends to results ──────────────────────

    private fun scanFolder(
        device: MtpDevice,
        storageId: Int,
        parentHandle: Int,
        results: WritableArray
    ) {
        val handles = device.getObjectHandles(storageId, 0, parentHandle) ?: return
        for (handle in handles) {
            val info = device.getObjectInfo(handle) ?: continue
            when (info.format) {
                MtpConstants.FORMAT_EXIF_JPEG,
                MtpConstants.FORMAT_JFIF -> {
                    results.pushMap(Arguments.createMap().apply {
                        putInt("handle", handle)
                        putString("filename", info.name ?: "")
                        putInt("fileSize", info.compressedSize)
                        putDouble("captureTime", info.dateCreated.toDouble() * 1000.0)
                        putInt("storageId", storageId)
                        putInt("imagePixWidth", info.imagePixWidth)
                        putInt("imagePixHeight", info.imagePixHeight)
                    })
                }
                MtpConstants.FORMAT_ASSOCIATION -> {
                    scanFolder(device, storageId, handle, results)
                }
            }
        }
    }

    // ── Private: collect JPEG handles recursively (for watcher) ───────────────

    private fun collectAllPhotoHandles(
        device: MtpDevice,
        storageId: Int,
        parentHandle: Int
    ): Set<Int> {
        val result = mutableSetOf<Int>()
        val handles = device.getObjectHandles(storageId, 0, parentHandle) ?: return result
        for (handle in handles) {
            val info = device.getObjectInfo(handle) ?: continue
            when (info.format) {
                MtpConstants.FORMAT_EXIF_JPEG,
                MtpConstants.FORMAT_JFIF -> result.add(handle)
                MtpConstants.FORMAT_ASSOCIATION ->
                    result.addAll(collectAllPhotoHandles(device, storageId, handle))
            }
        }
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
                    collectAllPhotoHandles(device, sid, 0xFFFFFFFF.toInt()).toList()
                }?.toSet() ?: emptySet()
            } catch (_: Exception) { emptySet() }

            while (watchingActive && mtpDevice != null) {
                Thread.sleep(2000)
                try {
                    val current: Set<Int> = device.storageIds?.flatMap { sid ->
                        collectAllPhotoHandles(device, sid, 0xFFFFFFFF.toInt()).toList()
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
