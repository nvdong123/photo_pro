package vn.photopro.app.ui.otg

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
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import vn.photopro.app.data.model.CameraInfo
import vn.photopro.app.data.model.PhotoItem
import kotlin.coroutines.resume

private const val TAG = "MTP_CANON"
private const val ACTION_USB_PERMISSION = "vn.photopro.app.USB_PERMISSION"

// Known camera vendor IDs
private val CAMERA_VENDOR_IDS = setOf(
    0x04a9, // Canon
    0x054c, // Sony
    0x04b0, // Nikon
    0x04cb  // Fujifilm
)

class MtpHelper(private val context: Context) {

    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private var mtpDevice: MtpDevice? = null
    private val thumbnailCache = HashMap<Int, Bitmap>()

    fun findCamera(): UsbDevice? {
        Log.d(TAG, "findCamera: scanning USB device list")
        val devices = usbManager.deviceList
        Log.d(TAG, "findCamera: found ${devices.size} USB device(s)")

        for ((name, device) in devices) {
            Log.d(TAG, "findCamera: checking device $name " +
                    "class=${device.deviceClass} vendorId=0x${device.vendorId.toString(16)}")

            // Match by USB Still Image class (6) or by known camera vendor IDs
            if (device.deviceClass == UsbConstants.USB_CLASS_STILL_IMAGE ||
                device.vendorId in CAMERA_VENDOR_IDS
            ) {
                Log.d(TAG, "findCamera: matched camera device: ${device.deviceName}")
                return device
            }
            // Check interface-level class for composite devices
            for (i in 0 until device.interfaceCount) {
                val intf = device.getInterface(i)
                if (intf.interfaceClass == UsbConstants.USB_CLASS_STILL_IMAGE) {
                    Log.d(TAG, "findCamera: matched via interface class: ${device.deviceName}")
                    return device
                }
            }
        }
        Log.d(TAG, "findCamera: no camera found")
        return null
    }

    suspend fun requestPermission(device: UsbDevice): Boolean =
        suspendCancellableCoroutine { cont ->
            if (usbManager.hasPermission(device)) {
                Log.d(TAG, "requestPermission: already have permission")
                cont.resume(true)
                return@suspendCancellableCoroutine
            }

            val receiver = object : BroadcastReceiver() {
                override fun onReceive(ctx: Context, intent: Intent) {
                    context.unregisterReceiver(this)
                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    Log.d(TAG, "requestPermission: granted=$granted")
                    if (cont.isActive) cont.resume(granted)
                }
            }

            context.registerReceiver(
                receiver,
                IntentFilter(ACTION_USB_PERMISSION),
                Context.RECEIVER_NOT_EXPORTED
            )

            val permIntent = android.app.PendingIntent.getBroadcast(
                context,
                0,
                Intent(ACTION_USB_PERMISSION),
                android.app.PendingIntent.FLAG_MUTABLE
            )
            Log.d(TAG, "requestPermission: requesting permission for ${device.deviceName}")
            usbManager.requestPermission(device, permIntent)

            cont.invokeOnCancellation {
                try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
            }
        }

    suspend fun connect(): Result<CameraInfo> = withContext(Dispatchers.IO) {
        runCatching {
            val device = findCamera() ?: error("Không tìm thấy máy ảnh")
            val hasPermission = requestPermission(device)
            if (!hasPermission) error("Không có quyền truy cập USB")

            Log.d(TAG, "connect: opening connection to ${device.deviceName}")
            val connection = usbManager.openDevice(device)
                ?: error("Không mở được kết nối USB")

            val mtp = MtpDevice(device)
            if (!mtp.open(connection)) {
                connection.close()
                error("Không mở được MTP device")
            }
            mtpDevice = mtp
            Log.d(TAG, "connect: MTP open OK, waiting for camera ready...")
            kotlinx.coroutines.delay(800L) // Canon cần thời gian khởi động

            // Retry getStorageIds up to 3 times
            var storageIds: IntArray? = null
            repeat(3) { attempt ->
                storageIds = mtp.storageIds
                if (storageIds != null && storageIds!!.isNotEmpty()) {
                    Log.d(TAG, "connect: got ${storageIds!!.size} storage(s) on attempt ${attempt + 1}")
                    return@repeat
                }
                Log.d(TAG, "connect: no storage yet, attempt ${attempt + 1}/3, retrying...")
                kotlinx.coroutines.delay(1000L)
            }

            val finalStorageIds = storageIds
            if (finalStorageIds == null || finalStorageIds.isEmpty()) error("Không đọc được bộ nhớ máy ảnh")

            CameraInfo(
                deviceName = device.deviceName,
                storageIds = finalStorageIds.toList()
            )
        }
    }

    suspend fun getPhotoList(onBatch: (List<PhotoItem>) -> Unit) = withContext(Dispatchers.IO) {
        val mtp = mtpDevice ?: error("Chưa kết nối máy ảnh")
        val storageIds = mtp.storageIds ?: error("Không đọc được storage")
        Log.d(TAG, "getPhotoList: scanning ${storageIds.size} storage(s)")

        val batch = mutableListOf<PhotoItem>()

        for (storageId in storageIds) {
            Log.d(TAG, "getPhotoList: scanning storageId=$storageId")

            // Strategy A: get JPEG handles directly
            var handles = mtp.getObjectHandles(storageId, MtpConstants.FORMAT_EXIF_JPEG, 0xFFFFFFFF.toInt())
            Log.d(TAG, "getPhotoList: strategy A -> ${handles?.size ?: 0} handles")

            // Strategy B: get all objects, filter JPEG by format
            if (handles == null || handles.isEmpty()) {
                Log.d(TAG, "getPhotoList: trying strategy B (all formats)")
                handles = mtp.getObjectHandles(storageId, 0, 0xFFFFFFFF.toInt())
                handles = handles?.filter { h ->
                    val info = mtp.getObjectInfo(h)
                    info?.format == MtpConstants.FORMAT_EXIF_JPEG
                }?.toIntArray()
                Log.d(TAG, "getPhotoList: strategy B -> ${handles?.size ?: 0} JPEG handles")
            }

            // Strategy C: recursive scan from root
            if (handles == null || handles.isEmpty()) {
                Log.d(TAG, "getPhotoList: trying strategy C (recursive from root)")
                handles = scanRecursive(mtp, storageId, 0xFFFFFFFF.toInt())
                Log.d(TAG, "getPhotoList: strategy C -> ${handles?.size ?: 0} handles")
            }

            handles?.forEach { handle ->
                val info = mtp.getObjectInfo(handle)
                if (info != null) {
                    val photo = PhotoItem(
                        handle = handle,
                        filename = info.name ?: "IMG_$handle.jpg",
                        fileSize = info.compressedSize,
                        dateTaken = (info.dateCreated ?: 0L) * 1000L
                    )
                    batch.add(photo)
                    if (batch.size >= 30) {
                        Log.d(TAG, "getPhotoList: emitting batch of ${batch.size}")
                        onBatch(batch.toList())
                        batch.clear()
                    }
                }
            }
        }

        if (batch.isNotEmpty()) {
            Log.d(TAG, "getPhotoList: emitting final batch of ${batch.size}")
            onBatch(batch.toList())
        }
    }

    private fun scanRecursive(mtp: MtpDevice, storageId: Int, parentHandle: Int): IntArray {
        val result = mutableListOf<Int>()
        val children = mtp.getObjectHandles(storageId, 0, parentHandle) ?: return IntArray(0)
        for (handle in children) {
            val info = mtp.getObjectInfo(handle) ?: continue
            when {
                info.format == MtpConstants.FORMAT_EXIF_JPEG -> {
                    Log.d(TAG, "scanRecursive: found JPEG handle=$handle name=${info.name}")
                    result.add(handle)
                }
                info.format == MtpConstants.FORMAT_ASSOCIATION -> {
                    // folder — recurse
                    result.addAll(scanRecursive(mtp, storageId, handle).toList())
                }
            }
        }
        return result.toIntArray()
    }

    suspend fun getThumbnail(handle: Int): Bitmap? = withContext(Dispatchers.IO) {
        thumbnailCache[handle]?.let { return@withContext it }
        val mtp = mtpDevice ?: return@withContext null
        Log.d(TAG, "getThumbnail: handle=$handle")
        val bytes = mtp.getThumbnail(handle) ?: return@withContext null
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        if (bmp != null) thumbnailCache[handle] = bmp
        bmp
    }

    suspend fun downloadPhoto(handle: Int, filename: String, cacheDir: java.io.File): java.io.File =
        withContext(Dispatchers.IO) {
            val mtp = mtpDevice ?: error("Chưa kết nối máy ảnh")
            val destFile = java.io.File(cacheDir, filename)
            Log.d(TAG, "downloadPhoto: handle=$handle -> ${destFile.absolutePath}")
            val success = mtp.importFile(handle, destFile.absolutePath)
            if (!success) error("Tải ảnh thất bại: $filename")
            Log.d(TAG, "downloadPhoto: done ${destFile.length()} bytes")
            destFile
        }

    fun watchNewPhotos(
        scope: CoroutineScope,
        onNew: (PhotoItem) -> Unit
    ): Job {
        return scope.launch(Dispatchers.IO) {
            val mtp = mtpDevice ?: return@launch
            val storageIds = mtp.storageIds ?: return@launch
            val knownHandles = mutableSetOf<Int>()

            // seed initial set
            for (sid in storageIds) {
                mtp.getObjectHandles(sid, MtpConstants.FORMAT_EXIF_JPEG, 0xFFFFFFFF.toInt())
                    ?.forEach { knownHandles.add(it) }
            }

            while (isActive) {
                delay(3000L)
                for (sid in storageIds) {
                    val current = mtp.getObjectHandles(
                        sid, MtpConstants.FORMAT_EXIF_JPEG, 0xFFFFFFFF.toInt()
                    ) ?: continue
                    val newHandles = current.filter { it !in knownHandles }
                    for (h in newHandles) {
                        knownHandles.add(h)
                        val info = mtp.getObjectInfo(h) ?: continue
                        Log.d(TAG, "watchNewPhotos: new photo handle=$h name=${info.name}")
                        onNew(
                            PhotoItem(
                                handle = h,
                                filename = info.name ?: "IMG_$h.jpg",
                                fileSize = info.compressedSize,
                                dateTaken = (info.dateCreated ?: 0L) * 1000L
                            )
                        )
                    }
                }
            }
        }
    }

    fun disconnect() {
        Log.d(TAG, "disconnect: closing MTP device")
        mtpDevice?.close()
        mtpDevice = null
        thumbnailCache.clear()
    }
}
