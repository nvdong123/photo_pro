package vn.photopro.mobile.otg

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.mtp.MtpConstants
import android.mtp.MtpDevice
import android.os.Build
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.coroutines.resume

class MtpHelper(
    private val context: Context,
    private val usbManager: UsbManager
) {
    private var mtpDevice: MtpDevice? = null
    private val thumbnailCache = HashMap<Int, Bitmap>()

    data class CameraInfo(
        val manufacturer: String,
        val model: String
    )

    suspend fun connect(): Result<CameraInfo> = withContext(Dispatchers.IO) {
        try {
            Log.d("MTP", "Looking for camera devices...")
            Log.d("MTP", "Found ${usbManager.deviceList.size} USB devices")
            usbManager.deviceList.values.forEach { d ->
                Log.d("MTP", "Device: ${d.deviceName} vendor=0x${d.vendorId.toString(16)} " +
                    "class=${d.deviceClass} product=${d.productName}")
            }

            val camera = usbManager.deviceList.values.firstOrNull { device ->
                device.deviceClass == UsbConstants.USB_CLASS_STILL_IMAGE ||
                    device.vendorId == 0x04a9 || // Canon
                    device.vendorId == 0x054c || // Sony
                    device.vendorId == 0x04b0 || // Nikon
                    device.vendorId == 0x04cb // Fujifilm
            } ?: run {
                Log.d("MTP", "No matching camera found among ${usbManager.deviceList.size} devices")
                return@withContext Result.failure(Exception("Khong tim thay may anh"))
            }

            Log.d("MTP", "Matched camera: ${camera.productName} vendor=0x${camera.vendorId.toString(16)}")
            Log.d("MTP", "Has USB permission: ${usbManager.hasPermission(camera)}")

            if (!usbManager.hasPermission(camera)) {
                val granted = requestPermission(camera)
                if (!granted) {
                    return@withContext Result.failure(Exception("Tu choi quyen USB"))
                }
            }

            val connection = usbManager.openDevice(camera)
            if (connection == null) {
                Log.d("MTP", "openDevice() returned null")
                return@withContext Result.failure(Exception("Khong mo duoc ket noi USB"))
            }
            Log.d("MTP", "openDevice() OK")

            val mtp = MtpDevice(camera)
            val openResult = mtp.open(connection)
            Log.d("MTP", "MtpDevice.open() result: $openResult")
            if (!openResult) {
                connection.close()
                return@withContext Result.failure(Exception("Khong mo duoc MTP session"))
            }

            mtpDevice = mtp
            delay(800)

            val info = mtp.deviceInfo
            Log.d("MTP", "deviceInfo: manufacturer=${info?.manufacturer} model=${info?.model} " +
                "serialNumber=${info?.serialNumber}")
            val storageIds = mtp.storageIds
            Log.d("MTP", "storageIds after connect: ${storageIds?.toList()}")

            val model = info?.model ?: camera.productName ?: "Canon Camera"
            val manufacturer = info?.manufacturer ?: camera.manufacturerName ?: "Canon"
            Result.success(CameraInfo(manufacturer = manufacturer, model = model))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun getPhotoList(): List<PhotoItem> = withContext(Dispatchers.IO) {
        val device = mtpDevice ?: return@withContext emptyList()
        val photos = mutableListOf<PhotoItem>()

        val storageIds = waitForStorageIds(device)
        Log.d("MTP", "storageIds count: ${storageIds.size} -> ${storageIds.toList()}")
        if (storageIds.isEmpty()) return@withContext emptyList()

        for (storageId in storageIds) {
            Log.d("MTP", "Trying storageId=$storageId format=0 parent=0xFFFFFFFF")
            val handles = device.getObjectHandles(storageId, 0, 0xFFFFFFFF.toInt())
            Log.d("MTP", "handles count (parent=0xFFFFFFFF): ${handles?.size}")

            Log.d("MTP", "Trying storageId=$storageId format=0 parent=0")
            val handles0 = device.getObjectHandles(storageId, 0, 0)
            Log.d("MTP", "handles count (parent=0): ${handles0?.size}")

            val firstHandles = handles ?: handles0
            if (firstHandles != null && firstHandles.isNotEmpty()) {
                val firstInfo = device.getObjectInfo(firstHandles[0])
                Log.d("MTP", "First object: name=${firstInfo?.name} " +
                    "format=0x${firstInfo?.format?.toString(16)} " +
                    "size=${firstInfo?.compressedSize}")
            }
            if (handles == null) continue
            for (handle in handles) {
                val info = device.getObjectInfo(handle) ?: continue

                if (info.format == MtpConstants.FORMAT_ASSOCIATION) {
                    val subHandles = device.getObjectHandles(storageId, 0, handle) ?: continue
                    for (subHandle in subHandles) {
                        val subInfo = device.getObjectInfo(subHandle) ?: continue
                        if (isJpeg(subInfo.name ?: "", subInfo.format)) {
                            photos.add(
                                PhotoItem(
                                    handle = subHandle,
                                    filename = subInfo.name ?: "",
                                    fileSize = subInfo.compressedSize,
                                    dateTaken = subInfo.dateCreated
                                )
                            )
                        }
                    }
                    continue
                }

                if (!isJpeg(info.name ?: "", info.format)) continue

                photos.add(
                    PhotoItem(
                        handle = handle,
                        filename = info.name ?: "",
                        fileSize = info.compressedSize,
                        dateTaken = info.dateCreated
                    )
                )
            }
        }

        photos.sortByDescending { it.dateTaken }
        photos
    }

    fun getThumbnail(handle: Int): Bitmap? {
        thumbnailCache[handle]?.let { return it }
        return try {
            val bytes = mtpDevice?.getThumbnail(handle) ?: return null
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
            thumbnailCache[handle] = bitmap
            bitmap
        } catch (_: Exception) {
            null
        }
    }

    fun downloadPhoto(handle: Int, filename: String, cacheDir: File): String {
        val safeName = if (filename.isBlank()) "photo_$handle.jpg" else filename
        val file = File(cacheDir, safeName)
        val imported = mtpDevice?.importFile(handle, file.absolutePath) ?: false
        if (!imported) throw IllegalStateException("Khong the tai anh tu may anh")
        return file.absolutePath
    }

    private suspend fun waitForStorageIds(device: MtpDevice): IntArray {
        repeat(3) { attempt ->
            val ids = device.storageIds
            Log.d("MTP", "waitForStorageIds attempt ${attempt + 1}: ${ids?.toList()}")
            if (ids != null && ids.isNotEmpty()) return ids
            if (attempt < 2) delay(1000)
        }
        Log.d("MTP", "waitForStorageIds: giving up, no storage found")
        return intArrayOf()
    }

    private fun isJpeg(name: String, format: Int): Boolean {
        val lower = name.lowercase()
        return format == MtpConstants.FORMAT_EXIF_JPEG ||
            format == MtpConstants.FORMAT_JFIF ||
            lower.endsWith(".jpg") ||
            lower.endsWith(".jpeg")
    }

    private suspend fun requestPermission(device: UsbDevice): Boolean {
        return suspendCancellableCoroutine { cont ->
            val action = "vn.photopro.mobile.USB_PERMISSION"
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context, intent: Intent) {
                    runCatching { context.unregisterReceiver(this) }
                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    if (cont.isActive) cont.resume(granted)
                }
            }

            val filter = IntentFilter(action)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("DEPRECATION")
                context.registerReceiver(receiver, filter)
            }

            val flags = PendingIntent.FLAG_IMMUTABLE
            val pendingIntent = PendingIntent.getBroadcast(context, 0, Intent(action), flags)
            usbManager.requestPermission(device, pendingIntent)

            cont.invokeOnCancellation {
                runCatching { context.unregisterReceiver(receiver) }
            }
        }
    }

    fun close() {
        thumbnailCache.clear()
        mtpDevice?.close()
        mtpDevice = null
    }
}
