package vn.photopro.mobile.otg

import android.graphics.Bitmap

data class PhotoItem(
    val handle: Int,
    val filename: String,
    val fileSize: Int,
    val dateTaken: Long,
    val thumbnail: Bitmap? = null,
    val status: PhotoStatus = PhotoStatus.PENDING
)

enum class PhotoStatus {
    PENDING,
    UPLOADING,
    UPLOADED,
    FAILED,
    CACHED
}

enum class ConnectionStatus {
    IDLE,
    DETECTING,
    CONNECTING,
    CONNECTED,
    ERROR
}

data class SessionResult(
    val uploadedCount: Int,
    val failedCount: Int
)
