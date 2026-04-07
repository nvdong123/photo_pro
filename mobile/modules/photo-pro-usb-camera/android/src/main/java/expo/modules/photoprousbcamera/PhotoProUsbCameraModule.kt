package expo.modules.photoprousbcamera

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.mtp.MtpConstants
import android.mtp.MtpDevice
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.coroutines.resume

class PhotoProUsbCameraModule : Module() {
  private var lastCacheCleanup = 0L
  private val indexedFiles = linkedMapOf<String, CachedUsbPhoto>()

  override fun definition() = ModuleDefinition {
    Name("PhotoProUsbCamera")

    AsyncFunction("scanConnectedCamerasAsync") Coroutine { maxFiles: Int ->
      withContext(Dispatchers.IO) {
        cleanCacheIfNeeded()
        scanConnectedCameras(maxFiles.coerceIn(1, 500))
      }
    }

    AsyncFunction("requestCameraPermissionAsync") Coroutine { deviceId: Int ->
      withContext(Dispatchers.Main) {
        requestCameraPermission(deviceId)
      }
    }

    AsyncFunction("materializeFileAsync") Coroutine { cacheKey: String ->
      withContext(Dispatchers.IO) {
        materializeFile(cacheKey)
      }
    }

    AsyncFunction("getThumbnailAsync") Coroutine { cacheKey: String ->
      withContext(Dispatchers.IO) {
        getThumbnail(cacheKey)
      }
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React Application Context is null" }

  private val usbManager: UsbManager
    get() = context.getSystemService(Context.USB_SERVICE) as UsbManager

  private data class MtpPhotoCandidate(
    val deviceKey: String,
    val storageId: Int,
    val objectHandle: Int,
    val fileName: String,
    val expectedSize: Long,
    val mimeType: String,
    val sortTimestamp: Long
  )

  private data class CachedUsbPhoto(
    val cacheKey: String,
    val deviceKey: String,
    val storageId: Int,
    val objectHandle: Int,
    val fileName: String,
    val expectedSize: Long,
    val mimeType: String,
    val sortTimestamp: Long,
    var previewPath: String?,
    var fullPath: String?,
    var lastSeenAt: Long
  )

  private fun scanConnectedCameras(maxFiles: Int): Map<String, Any?> {
    val devices = usbManager.deviceList.values.toList()
    val candidateDevices = devices.filter(::isLikelyCameraDevice)
    val summaries = candidateDevices.map(::deviceSummary)

    if (candidateDevices.isEmpty()) {
      return mapOf(
        "state" to "idle",
        "deviceName" to null,
        "primaryDeviceId" to null,
        "devices" to summaries,
        "files" to emptyList<Map<String, Any?>>()
      )
    }

    val deviceWithPermission = candidateDevices.firstOrNull { usbManager.hasPermission(it) }
    if (deviceWithPermission == null) {
      val primary = candidateDevices.first()
      return mapOf(
        "state" to "permission_required",
        "deviceName" to buildDeviceLabel(primary),
        "primaryDeviceId" to primary.deviceId,
        "devices" to summaries,
        "files" to emptyList<Map<String, Any?>>()
      )
    }

    return try {
      val files = scanMtpFiles(deviceWithPermission, maxFiles)
      mapOf(
        "state" to "connected",
        "deviceName" to buildDeviceLabel(deviceWithPermission),
        "primaryDeviceId" to deviceWithPermission.deviceId,
        "devices" to summaries,
        "files" to files
      )
    } catch (e: Exception) {
      mapOf(
        "state" to "error",
        "deviceName" to buildDeviceLabel(deviceWithPermission),
        "primaryDeviceId" to deviceWithPermission.deviceId,
        "devices" to summaries,
        "files" to emptyList<Map<String, Any?>>(),
        "error" to (e.message ?: "Unknown USB camera error")
      )
    }
  }

  private suspend fun requestCameraPermission(deviceId: Int): Boolean = suspendCancellableCoroutine { continuation ->
    val device = usbManager.deviceList.values.firstOrNull { it.deviceId == deviceId }
    if (device == null) {
      continuation.resume(false)
      return@suspendCancellableCoroutine
    }

    if (usbManager.hasPermission(device)) {
      continuation.resume(true)
      return@suspendCancellableCoroutine
    }

    val action = "${context.packageName}.PHOTO_PRO_USB_PERMISSION"
    val permissionIntent = PendingIntent.getBroadcast(
      context,
      deviceId,
      Intent(action).setPackage(context.packageName),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val receiver = object : BroadcastReceiver() {
      override fun onReceive(receiverContext: Context?, intent: Intent?) {
        if (intent?.action != action) {
          return
        }

        try {
          context.unregisterReceiver(this)
        } catch (_: IllegalArgumentException) {
        }

        val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
        if (continuation.isActive) {
          continuation.resume(granted)
        }
      }
    }

    val filter = IntentFilter(action)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }

    continuation.invokeOnCancellation {
      try {
        context.unregisterReceiver(receiver)
      } catch (_: IllegalArgumentException) {
      }
    }

    usbManager.requestPermission(device, permissionIntent)
  }

  private fun scanMtpFiles(device: UsbDevice, maxFiles: Int): List<Map<String, Any?>> {
    val connection = usbManager.openDevice(device) ?: throw IllegalStateException("Cannot open USB device")
    val mtpDevice = MtpDevice(device)
    val now = System.currentTimeMillis()

    try {
      if (!mtpDevice.open(connection)) {
        throw IllegalStateException("Cannot open MTP session")
      }

      val deviceKey = buildDeviceKey(device)
      val candidates = mutableListOf<MtpPhotoCandidate>()
      val storageIds = mtpDevice.storageIds ?: intArrayOf()

      for (storageId in storageIds) {
        val handles = mtpDevice.getObjectHandles(storageId, 0, 0) ?: intArrayOf()
        for (handle in handles) {
          val info = mtpDevice.getObjectInfo(handle) ?: continue
          val name = info.name ?: continue
          if (info.format == MtpConstants.FORMAT_ASSOCIATION || !isSupportedPhotoName(name)) {
            continue
          }

          val sortTimestamp = when {
            info.dateModified > 0L -> info.dateModified
            info.dateCreated > 0L -> info.dateCreated
            else -> handle.toLong()
          }

          candidates.add(
            MtpPhotoCandidate(
              deviceKey = deviceKey,
              storageId = storageId,
              objectHandle = handle,
              fileName = name,
              expectedSize = info.compressedSizeLong,
              mimeType = detectMimeType(name),
              sortTimestamp = sortTimestamp
            )
          )
        }
      }

      val selectedCandidates = candidates
        .sortedWith(compareByDescending<MtpPhotoCandidate> { it.sortTimestamp }.thenByDescending { it.objectHandle })
        .take(maxFiles)

      val currentKeys = mutableSetOf<String>()
      val files = selectedCandidates.mapIndexedNotNull { index, candidate ->
        val entry = indexCandidate(
          mtpDevice = mtpDevice,
          usbDevice = device,
          candidate = candidate,
          eagerFullImport = index < EAGER_PREVIEW_IMPORT_COUNT
        )
        entry.lastSeenAt = now
        currentKeys.add(entry.cacheKey)
        entryToMap(entry)
      }

      pruneIndexedEntries(now)
      return files
    } finally {
      try {
        mtpDevice.close()
      } catch (_: Exception) {
      }
      try {
        connection.close()
      } catch (_: Exception) {
      }
    }
  }

  private fun indexCandidate(
    mtpDevice: MtpDevice,
    usbDevice: UsbDevice,
    candidate: MtpPhotoCandidate,
    eagerFullImport: Boolean
  ): CachedUsbPhoto {
    val cacheKey = buildCacheKey(candidate.deviceKey, candidate.storageId, candidate.objectHandle, candidate.fileName)
    val existing = indexedFiles[cacheKey]
    if (existing != null) {
      existing.previewPath = existing.previewPath?.takeIf { File(it).exists() }
      existing.fullPath = existing.fullPath?.takeIf { isExpectedFile(File(it), existing.expectedSize) }
      // Remove eager thumbnail loading - will be loaded on-demand
      if (existing.previewPath == null && existing.fullPath == null && eagerFullImport && existing.mimeType.startsWith("image/")) {
        existing.fullPath = importFileToCache(
          mtpDevice,
          usbDevice,
          existing.storageId,
          existing.objectHandle,
          existing.fileName,
          existing.expectedSize
        ).absolutePath
      }
      return existing
    }

    val entry = CachedUsbPhoto(
      cacheKey = cacheKey,
      deviceKey = candidate.deviceKey,
      storageId = candidate.storageId,
      objectHandle = candidate.objectHandle,
      fileName = candidate.fileName,
      expectedSize = candidate.expectedSize,
      mimeType = candidate.mimeType,
      sortTimestamp = candidate.sortTimestamp,
      previewPath = null,  // Don't load thumbnail here
      fullPath = null,
      lastSeenAt = System.currentTimeMillis()
    )

    val fullFile = fullCacheFile(entry)
    if (isExpectedFile(fullFile, entry.expectedSize)) {
      entry.fullPath = fullFile.absolutePath
    }

    // Remove eager thumbnail creation
    // if (entry.previewPath == null) {
    //   entry.previewPath = createThumbnailPreview(mtpDevice, entry)
    // }

    if (entry.previewPath == null && entry.fullPath == null && eagerFullImport && entry.mimeType.startsWith("image/")) {
      entry.fullPath = importFileToCache(
        mtpDevice,
        usbDevice,
        entry.storageId,
        entry.objectHandle,
        entry.fileName,
        entry.expectedSize
      ).absolutePath
    }

    indexedFiles[cacheKey] = entry
    return entry
  }

  private fun entryToMap(entry: CachedUsbPhoto): Map<String, Any?>? {
    val displayPath = entry.previewPath ?: entry.fullPath ?: return null
    return mapOf(
      "uri" to Uri.fromFile(File(displayPath)).toString(),
      "uploadUri" to entry.fullPath?.let { Uri.fromFile(File(it)).toString() },
      "name" to entry.fileName,
      "size" to entry.expectedSize.toDouble(),
      "mimeType" to entry.mimeType,
      "source" to mapOf(
        "type" to "android-usb-camera",
        "cacheKey" to entry.cacheKey
      ),
      "capturedAt" to entry.sortTimestamp
    )
  }

  private fun materializeFile(cacheKey: String): Map<String, Any?> {
    cleanCacheIfNeeded()
    val entry = indexedFiles[cacheKey] ?: throw IllegalStateException("Không tìm thấy file camera trong bộ nhớ đệm")
    val existingFullFile = fullCacheFile(entry)
    if (isExpectedFile(existingFullFile, entry.expectedSize)) {
      entry.fullPath = existingFullFile.absolutePath
      return mapOf(
        "uri" to Uri.fromFile(existingFullFile).toString(),
        "size" to existingFullFile.length().toDouble()
      )
    }

    val usbDevice = usbManager.deviceList.values.firstOrNull { buildDeviceKey(it) == entry.deviceKey }
      ?: throw IllegalStateException("Camera đã ngắt kết nối")
    if (!usbManager.hasPermission(usbDevice)) {
      throw IllegalStateException("Thiếu quyền USB để đọc file gốc")
    }

    val connection = usbManager.openDevice(usbDevice) ?: throw IllegalStateException("Cannot open USB device")
    val mtpDevice = MtpDevice(usbDevice)

    try {
      if (!mtpDevice.open(connection)) {
        throw IllegalStateException("Cannot open MTP session")
      }

      val importedFile = importFileToCache(
        mtpDevice,
        usbDevice,
        entry.storageId,
        entry.objectHandle,
        entry.fileName,
        entry.expectedSize
      )
      entry.fullPath = importedFile.absolutePath

      if (entry.previewPath == null && entry.mimeType.startsWith("image/")) {
        entry.previewPath = importedFile.absolutePath
      }

      return mapOf(
        "uri" to Uri.fromFile(importedFile).toString(),
        "size" to importedFile.length().toDouble()
      )
    } finally {
      try {
        mtpDevice.close()
      } catch (_: Exception) {
      }
      try {
        connection.close()
      } catch (_: Exception) {
      }
    }
  }

  private fun createThumbnailPreview(mtpDevice: MtpDevice, entry: CachedUsbPhoto): String? {
    return try {
      val thumbnail = mtpDevice.getThumbnail(entry.objectHandle) ?: return null
      if (thumbnail.isEmpty()) {
        null
      } else {
        val previewFile = previewCacheFile(entry)
        previewFile.parentFile?.mkdirs()
        previewFile.writeBytes(thumbnail)
        previewFile.absolutePath
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun getThumbnail(cacheKey: String): String? {
    val entry = indexedFiles[cacheKey] ?: return null
    
    // Check if already cached
    val previewFile = previewCacheFile(entry)
    if (previewFile.exists() && previewFile.length() > 0L) {
      return previewFile.absolutePath
    }

    // Get device and create MTP connection
    val devices = usbManager.deviceList.values.toList()
    val device = devices.find { buildDeviceKey(it) == entry.deviceKey } ?: return null
    
    if (!usbManager.hasPermission(device)) return null

    val connection = usbManager.openDevice(device) ?: return null
    val mtpDevice = MtpDevice(device)
    
    try {
      if (!mtpDevice.open(connection)) return null
      
      return createThumbnailPreview(mtpDevice, entry)
    } finally {
      try {
        mtpDevice.close()
      } catch (_: Exception) {}
      try {
        connection.close()
      } catch (_: Exception) {}
    }
  }

  private fun importFileToCache(
    mtpDevice: MtpDevice,
    usbDevice: UsbDevice,
    storageId: Int,
    objectHandle: Int,
    fileName: String,
    expectedSize: Long
  ): File {
    val destination = fullCacheFile(buildDeviceKey(usbDevice), storageId, objectHandle, fileName)

    if (isExpectedFile(destination, expectedSize)) {
      return destination
    }

    destination.parentFile?.mkdirs()
    ParcelFileDescriptor.open(
      destination,
      ParcelFileDescriptor.MODE_CREATE or ParcelFileDescriptor.MODE_TRUNCATE or ParcelFileDescriptor.MODE_WRITE_ONLY
    ).use { descriptor ->
      if (!mtpDevice.importFile(objectHandle, descriptor)) {
        throw IllegalStateException("Failed to import $fileName from camera")
      }
    }

    return destination
  }

  private fun deviceSummary(device: UsbDevice): Map<String, Any?> = mapOf(
    "deviceId" to device.deviceId,
    "label" to buildDeviceLabel(device),
    "manufacturer" to safeText { device.manufacturerName },
    "productName" to safeText { device.productName },
    "hasPermission" to usbManager.hasPermission(device)
  )

  private fun buildDeviceLabel(device: UsbDevice): String {
    val manufacturer = safeText { device.manufacturerName }
    val product = safeText { device.productName }
    return listOf(manufacturer, product)
      .filter { !it.isNullOrBlank() }
      .joinToString(" ")
      .ifBlank { "USB Camera ${device.deviceId}" }
  }

  private fun buildDeviceKey(device: UsbDevice): String {
    val manufacturer = safeText { device.manufacturerName } ?: "camera"
    val product = safeText { device.productName } ?: device.deviceId.toString()
    return sanitizeFileName("${manufacturer}_${product}_${device.vendorId}_${device.productId}")
  }

  private fun buildCacheKey(deviceKey: String, storageId: Int, objectHandle: Int, fileName: String): String {
    return sanitizeFileName("${deviceKey}_${storageId}_${objectHandle}_${fileName}")
  }

  private fun previewCacheFile(entry: CachedUsbPhoto): File {
    return File(context.cacheDir, "usb-camera-cache/${entry.deviceKey}/preview/${entry.storageId}/${entry.objectHandle}_${sanitizeFileName(entry.fileName)}.jpg")
  }

  private fun fullCacheFile(entry: CachedUsbPhoto): File {
    return fullCacheFile(entry.deviceKey, entry.storageId, entry.objectHandle, entry.fileName)
  }

  private fun fullCacheFile(deviceKey: String, storageId: Int, objectHandle: Int, fileName: String): File {
    return File(context.cacheDir, "usb-camera-cache/${deviceKey}/full/${storageId}/${objectHandle}_${sanitizeFileName(fileName)}")
  }

  private fun isExpectedFile(file: File, expectedSize: Long): Boolean {
    if (!file.exists() || !file.isFile) {
      return false
    }
    return expectedSize <= 0L || file.length() == expectedSize
  }

  private fun safeText(block: () -> String?): String? {
    return try {
      block()?.trim()?.takeIf { it.isNotEmpty() }
    } catch (_: SecurityException) {
      null
    }
  }

  private fun sanitizeFileName(value: String): String {
    return value.replace(Regex("[^A-Za-z0-9._-]"), "_")
  }

  private fun isLikelyCameraDevice(device: UsbDevice): Boolean {
    if (device.deviceClass == UsbConstants.USB_CLASS_STILL_IMAGE) {
      return true
    }

    for (index in 0 until device.interfaceCount) {
      val usbInterface = device.getInterface(index)
      if (usbInterface.interfaceClass == UsbConstants.USB_CLASS_STILL_IMAGE) {
        return true
      }
    }

    if (device.vendorId in CAMERA_VENDOR_IDS) {
      return true
    }

    val manufacturer = safeText { device.manufacturerName }?.lowercase().orEmpty()
    val product = safeText { device.productName }?.lowercase().orEmpty()
    val combined = "$manufacturer $product"
    return CAMERA_BRAND_KEYWORDS.any { combined.contains(it) }
  }

  private fun isSupportedPhotoName(fileName: String): Boolean {
    val extension = fileName.substringAfterLast('.', "").lowercase()
    return extension in SUPPORTED_EXTENSIONS
  }

  private fun detectMimeType(fileName: String): String {
    return when (fileName.substringAfterLast('.', "").lowercase()) {
      "jpg", "jpeg" -> "image/jpeg"
      "png" -> "image/png"
      "webp" -> "image/webp"
      "cr2", "cr3", "crw", "nef", "nrw", "arw", "dng" -> "application/octet-stream"
      else -> "application/octet-stream"
    }
  }

  private fun cleanCacheIfNeeded() {
    val now = System.currentTimeMillis()
    if (now - lastCacheCleanup < CACHE_TTL_MS) {
      pruneIndexedEntries(now)
      return
    }
    lastCacheCleanup = now
    clearUsbCache()
  }

  private fun clearUsbCache() {
    try {
      indexedFiles.clear()
      val cacheDir = File(context.cacheDir, "usb-camera-cache")
      if (!cacheDir.exists()) {
        return
      }

      val totalSize = calculateDirSize(cacheDir)
      if (totalSize > CACHE_MAX_SIZE_MB * 1024 * 1024) {
        val files = cacheDir.listFiles() ?: return
        val sortedByAge = files.sortedBy { it.lastModified() }
        var currentSize = totalSize
        for (file in sortedByAge) {
          if (currentSize <= CACHE_MAX_SIZE_MB * 1024 * 1024 * 0.8) {
            break
          }
          val size = if (file.isDirectory) calculateDirSize(file) else file.length()
          if (file.deleteRecursively()) {
            currentSize -= size
          }
        }
      }

      val cutoff = System.currentTimeMillis() - CACHE_TTL_MS
      cacheDir.walkTopDown().forEach { file ->
        if (file.isFile && file.lastModified() < cutoff) {
          file.delete()
        }
      }
    } catch (_: Exception) {
    }
  }

  private fun pruneIndexedEntries(now: Long) {
    val cutoff = now - CACHE_TTL_MS
    val iterator = indexedFiles.entries.iterator()
    while (iterator.hasNext()) {
      val entry = iterator.next().value
      val hasPreview = entry.previewPath?.let { File(it).exists() } ?: false
      val hasFull = entry.fullPath?.let { isExpectedFile(File(it), entry.expectedSize) } ?: false
      if ((!hasPreview && !hasFull) || entry.lastSeenAt < cutoff) {
        iterator.remove()
      }
    }
  }

  private fun calculateDirSize(dir: File): Long {
    if (!dir.exists()) return 0L
    return dir.walkTopDown().filter { it.isFile }.map { it.length() }.sum()
  }

  companion object {
    private val SUPPORTED_EXTENSIONS = setOf(
      "jpg", "jpeg", "png", "webp",
      "crw", "cr2", "cr3", "nef", "nrw", "arw", "dng"
    )

    private val CAMERA_VENDOR_IDS = setOf(
      1193,
      1200,
      1356,
      1227,
      1266,
      1123,
      2062,
      4869,
      10550,
      1482,
      6668,
      11427
    )

    private val CAMERA_BRAND_KEYWORDS = setOf(
      "canon", "nikon", "sony", "fujifilm", "fuji", "olympus", "om system",
      "panasonic", "lumix", "leica", "gopro", "pentax", "ricoh",
      "hasselblad", "dji", "mirrorless", "dslr", "digital camera"
    )

    private const val CACHE_MAX_SIZE_MB = 500L
    private const val CACHE_TTL_MS = 24 * 60 * 60 * 1000L
    private const val EAGER_PREVIEW_IMPORT_COUNT = 6
  }
}

