package vn.photopro.mobile.otg

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class UploadManager(
    private val apiUrl: String,
    private val authToken: String
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    suspend fun upload(
        file: File,
        locationId: String,
        shootDate: String,
        onProgress: (Int) -> Unit = {}
    ) = withContext(Dispatchers.IO) {
        val presignBody = JSONObject().apply {
            put("filename", file.name)
            put("content_type", "image/jpeg")
            put("location_id", locationId)
            put("shoot_date", shootDate)
        }

        val presignRequest = Request.Builder()
            .url("$apiUrl/api/v1/staff/upload/presign")
            .post(presignBody.toString().toRequestBody("application/json".toMediaType()))
            .header("Authorization", "Bearer $authToken")
            .build()

        val uploadUrl: String
        val mediaId: String
        client.newCall(presignRequest).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("Presign that bai: ${response.code}")
            }
            val body = response.body?.string() ?: throw IllegalStateException("Presign response rong")
            val json = JSONObject(body)
            uploadUrl = json.getString("upload_url")
            mediaId = json.getString("media_id")
        }

        onProgress(30)

        val putRequest = Request.Builder()
            .url(uploadUrl)
            .put(file.asRequestBody("image/jpeg".toMediaType()))
            .build()

        client.newCall(putRequest).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("Upload S3 that bai: ${response.code}")
            }
        }

        onProgress(80)

        val confirmBody = JSONObject().apply {
            put("media_id", mediaId)
        }

        val confirmRequest = Request.Builder()
            .url("$apiUrl/api/v1/staff/upload/confirm")
            .post(confirmBody.toString().toRequestBody("application/json".toMediaType()))
            .header("Authorization", "Bearer $authToken")
            .build()

        client.newCall(confirmRequest).execute().use { response ->
            if (!response.isSuccessful) {
                throw IllegalStateException("Confirm that bai: ${response.code}")
            }
        }

        onProgress(100)
    }
}
