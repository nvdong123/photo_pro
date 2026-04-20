package vn.photopro.app.data.model

import android.graphics.Bitmap

data class LoginRequest(
    val email: String,
    val password: String
)

data class LoginResponse(
    val access_token: String,
    val staff: StaffInfo
)

data class StaffInfo(
    val id: String,
    val email: String,
    val employee_code: String,
    val role: String
)

data class LocationTag(
    val id: String,
    val name: String,
    val code: String,
    val shoot_date: String? = null
)

data class FTPCredentials(
    val host: String,
    val port: Int,
    val username: String,
    val password: String,
    val passive_mode: Boolean
)

data class FTPStatus(
    val connected: Boolean,
    val client_ip: String? = null,
    val connected_at: String? = null
)

data class SetLocationRequest(
    val location_id: String
)

data class AssignLocationRequest(
    val media_ids: List<String>,
    val location_id: String
)

data class AssignResult(
    val assigned_count: Int,
    val failed_ids: List<String>
)

data class MediaItem(
    val id: String,
    val filename: String,
    val thumb_url: String? = null,
    val preview_url: String? = null,
    val created_at: String,
    val location: LocationTag? = null
)

data class PresignRequest(
    val filename: String,
    val content_type: String,
    val location_id: String,
    val shoot_date: String
)

data class PresignResponse(
    val upload_url: String,
    val media_id: String,
    val s3_key: String
)

data class ConfirmRequest(
    val media_id: String
)

data class ConfirmResponse(
    val success: Boolean,
    val media_id: String
)

data class PhotoItem(
    val handle: Int = 0,
    val filename: String,
    val fileSize: Int,
    val dateTaken: Long,
    val thumbnail: Bitmap? = null,
    val status: PhotoStatus = PhotoStatus.PENDING,
    val uri: String? = null
)

enum class PhotoStatus { PENDING, UPLOADING, UPLOADED, FAILED }

data class CameraInfo(
    val deviceName: String,
    val storageIds: List<Int>
)

data class SessionStats(
    val total: Int = 0,
    val pending: Int = 0,
    val uploading: Int = 0,
    val uploaded: Int = 0,
    val failed: Int = 0
)

enum class ConnectionStatus {
    IDLE, DETECTING, CONNECTING, CONNECTED, ERROR
}
