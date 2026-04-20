package vn.photopro.app.ui.upload

import android.app.Application
import android.content.Context
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import vn.photopro.app.data.model.LocationTag
import vn.photopro.app.data.model.PresignRequest
import vn.photopro.app.data.repository.LocationRepository
import vn.photopro.app.data.repository.MediaRepository
import vn.photopro.app.util.retryWithBackoff
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import javax.inject.Inject

enum class UploadItemStatus { WAITING, UPLOADING, DONE, FAILED }

data class UploadItem(
    val id: String = UUID.randomUUID().toString(),
    val uri: Uri,
    val filename: String,
    val status: UploadItemStatus = UploadItemStatus.WAITING,
    val progress: Float = 0f,
    val errorMessage: String? = null
)

@HiltViewModel
class UploadViewModel @Inject constructor(
    application: Application,
    private val mediaRepository: MediaRepository,
    private val locationRepository: LocationRepository,
    private val okHttpClient: OkHttpClient
) : AndroidViewModel(application) {

    private val context: Context get() = getApplication()
    private val semaphore = Semaphore(3)

    private val _uploadItems = MutableStateFlow<List<UploadItem>>(emptyList())
    val uploadItems: StateFlow<List<UploadItem>> = _uploadItems.asStateFlow()

    private val _locations = MutableStateFlow<List<LocationTag>>(emptyList())
    val locations: StateFlow<List<LocationTag>> = _locations.asStateFlow()

    private val _selectedLocation = MutableStateFlow<LocationTag?>(null)
    val selectedLocation: StateFlow<LocationTag?> = _selectedLocation.asStateFlow()

    private val _shootDate = MutableStateFlow(
        SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    )
    val shootDate: StateFlow<String> = _shootDate.asStateFlow()

    private val _isUploading = MutableStateFlow(false)
    val isUploading: StateFlow<Boolean> = _isUploading.asStateFlow()

    private var uploadJob: kotlinx.coroutines.Job? = null

    init {
        viewModelScope.launch {
            locationRepository.getLocations().onSuccess { _locations.value = it }
            locationRepository.getActiveLocation().onSuccess { loc ->
                _selectedLocation.value = loc
            }
        }
    }

    fun setFiles(uris: List<Uri>) {
        val items = uris.map { uri ->
            val filename = uri.lastPathSegment?.substringAfterLast('/')
                ?: "photo_${System.currentTimeMillis()}.jpg"
            UploadItem(uri = uri, filename = filename)
        }
        _uploadItems.value = items
    }

    fun selectLocation(location: LocationTag) {
        _selectedLocation.value = location
    }

    fun setShootDate(date: String) {
        _shootDate.value = date
    }

    fun startUpload() {
        val location = _selectedLocation.value ?: return
        _isUploading.value = true
        uploadJob = viewModelScope.launch {
            _uploadItems.value
                .filter { it.status == UploadItemStatus.WAITING || it.status == UploadItemStatus.FAILED }
                .forEach { item ->
                    launch {
                        semaphore.withPermit {
                            performUpload(item, location)
                        }
                    }
                }
        }
        uploadJob?.invokeOnCompletion { _isUploading.value = false }
    }

    fun cancelUpload() {
        uploadJob?.cancel()
        _isUploading.value = false
        _uploadItems.update { list ->
            list.map {
                if (it.status == UploadItemStatus.UPLOADING)
                    it.copy(status = UploadItemStatus.WAITING, progress = 0f)
                else it
            }
        }
    }

    fun retryFailed() {
        val location = _selectedLocation.value ?: return
        _isUploading.value = true
        uploadJob = viewModelScope.launch {
            _uploadItems.value.filter { it.status == UploadItemStatus.FAILED }
                .forEach { item ->
                    launch {
                        semaphore.withPermit {
                            performUpload(item, location)
                        }
                    }
                }
        }
        uploadJob?.invokeOnCompletion { _isUploading.value = false }
    }

    private suspend fun performUpload(item: UploadItem, location: LocationTag) {
        updateItem(item.id) { it.copy(status = UploadItemStatus.UPLOADING, progress = 0f) }
        runCatching {
            retryWithBackoff(times = 3) {
                val bytes = withContext(Dispatchers.IO) {
                    context.contentResolver.openInputStream(item.uri)?.readBytes()
                        ?: error("Khong doc duoc file")
                }
                val presign = mediaRepository.presign(
                    PresignRequest(
                        filename = item.filename,
                        content_type = "image/jpeg",
                        location_id = location.id,
                        shoot_date = _shootDate.value
                    )
                ).getOrThrow()

                updateItem(item.id) { it.copy(progress = 0.3f) }

                val putRequest = Request.Builder()
                    .url(presign.upload_url)
                    .put(bytes.toRequestBody("image/jpeg".toMediaType()))
                    .build()

                withContext(Dispatchers.IO) {
                    okHttpClient.newCall(putRequest).execute().use { resp ->
                        if (!resp.isSuccessful) error("S3 upload failed: ${resp.code}")
                    }
                }

                updateItem(item.id) { it.copy(progress = 0.8f) }
                mediaRepository.confirm(presign.media_id).getOrThrow()
            }
            updateItem(item.id) { it.copy(status = UploadItemStatus.DONE, progress = 1f) }
        }.onFailure { e ->
            updateItem(item.id) {
                it.copy(
                    status = UploadItemStatus.FAILED,
                    errorMessage = e.message ?: "Loi khong xac dinh"
                )
            }
        }
    }

    private fun updateItem(id: String, transform: (UploadItem) -> UploadItem) {
        _uploadItems.update { list -> list.map { if (it.id == id) transform(it) else it } }
    }
}
