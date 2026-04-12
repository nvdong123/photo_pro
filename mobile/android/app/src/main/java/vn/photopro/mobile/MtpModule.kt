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
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class MtpModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "MtpModule"

    private var mtpDevice: MtpDevice? = null
    private var usbDevice: UsbDevice? = null

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

    // ── List all JPEG photos on camera ─────────────────────────────────────────

    @ReactMethod
    fun getPhotoList(promise: Promise) {
        val device = mtpDevice ?: run {
            promise.reject("NOT_CONNECTED", "Chua ket noi may anh")
            return
        }
        try {
            val storageIds = device.storageIds
            if (storageIds == null || storageIds.isEmpty()) {
                promise.resolve(Arguments.createArray())
                return
            }

            val photos = Arguments.createArray()
            for (storageId in storageIds) {
                val handles = device.getObjectHandles(
                    storageId,
                    MtpConstants.FORMAT_EXIF_JPEG,
                    0
                ) ?: continue

                for (handle in handles) {
                    val info = device.getObjectInfo(handle) ?: continue
                    val photoInfo = Arguments.createMap().apply {
                        putInt("handle", handle)
                        putString("filename", info.name)
                        putInt("fileSize", info.compressedSize)
                        putString("captureTime", info.dateCreated?.toString() ?: "")
                        putInt("storageId", storageId)
                        putInt("imagePixWidth", info.imagePixWidth)
                        putInt("imagePixHeight", info.imagePixHeight)
                    }
                    photos.pushMap(photoInfo)
                }
            }
            promise.resolve(photos)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // ── Get JPEG thumbnail (base64) ────────────────────────────────────────────

    @ReactMethod
    fun getThumbnail(handle: Int, promise: Promise) {
        val device = mtpDevice ?: run {
            promise.reject("NOT_CONNECTED", "Chua ket noi")
            return
        }
        try {
            val thumbnail = device.getThumb(handle)
            if (thumbnail == null) {
                promise.resolve(null)
                return
            }
            val b64 = Base64.encodeToString(thumbnail, Base64.NO_WRAP)
            promise.resolve("data:image/jpeg;base64,$b64")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
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
                    device.getObjectHandles(sid, MtpConstants.FORMAT_EXIF_JPEG, 0)?.toList()
                        ?: emptyList()
                }?.toSet() ?: emptySet()
            } catch (_: Exception) { emptySet() }

            while (watchingActive && mtpDevice != null) {
                Thread.sleep(2000)
                try {
                    val current: Set<Int> = device.storageIds?.flatMap { sid ->
                        device.getObjectHandles(sid, MtpConstants.FORMAT_EXIF_JPEG, 0)?.toList()
                            ?: emptyList()
                    }?.toSet() ?: emptySet()

                    val newHandles = current - lastHandles
                    newHandles.forEach { handle ->
                        val info = device.getObjectInfo(handle)
                        val eventData = Arguments.createMap().apply {
                            putInt("handle", handle)
                            putString("filename", info?.name ?: "")
                            putInt("fileSize", info?.compressedSize ?: 0)
                            putString("captureTime", info?.dateCreated?.toString() ?: "")
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
