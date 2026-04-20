package vn.photopro.app.ui.otg

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
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
import okhttp3.RequestBody.Companion.asRequestBody
import vn.photopro.app.data.model.ConnectionStatus
import vn.photopro.app.data.model.PhotoItem
import vn.photopro.app.data.model.PhotoStatus
import vn.photopro.app.data.model.PresignRequest
import vn.photopro.app.data.model.SessionStats
import vn.photopro.app.data.repository.LocationRepository
import vn.photopro.app.data.repository.MediaRepository
import vn.photopro.app.util.retryWithBackoff
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject

@HiltViewModel
class OTGViewModel @Inject constructor(
    application: Application,
    private val mediaRepository: MediaRepository,
    private val locationRepository: LocationRepository,
    private val okHttpClient: OkHttpClient
) : AndroidViewModel(application) {

    private val context: Context get() = getApplication()
    private val mtpHelper = MtpHelper(context)
    private val uploadSemaphore = Semaphore(3) // max 3 parallel uploads

    private val _connectionStatus = MutableStateFlow(ConnectionStatus.IDLE)
    val connectionStatus: StateFlow<ConnectionStatus> = _connectionStatus.asStateFlow()

    private val _cameraModel = MutableStateFlow("")
    val cameraModel: StateFlow<String> = _cameraModel.asStateFlow()

    private val _photos = MutableStateFlow<List<PhotoItem>>(emptyList())
    val photos: StateFlow<List<PhotoItem>> = _photos.asStateFlow()

    private val _stats = MutableStateFlow(SessionStats())
    val stats: StateFlow<SessionStats> = _stats.asStateFlow()

    private val _selectedHandles = MutableStateFlow<Set<Int>>(emptySet())
    val selectedHandles: StateFlow<Set<Int>> = _selectedHandles.asStateFlow()

    private val _activeLocation = MutableStateFlow<vn.photopro.app.data.model.LocationTag?>(null)
    val activeLocation: StateFlow<vn.photopro.app.data.model.LocationTag?> = _activeLocation.asStateFlow()

    private var watchJob: Job? = null

    init {
        viewModelScope.launch {
            locationRepository.getActiveLocation().onSuccess { loc ->
                _activeLocation.value = loc
            }
        }
    }

    fun connect() {
        viewModelScope.launch {
            _connectionStatus.value = ConnectionStatus.DETECTING
            mtpHelper.connect()
                .onSuccess { cameraInfo ->
                    _cameraModel.value = cameraInfo.deviceName
                    _connectionStatus.value = ConnectionStatus.CONNECTED
                    loadPhotos()
                    startWatching()
                }
                .onFailure {
                    _connectionStatus.value = ConnectionStatus.ERROR
                }
        }
    }

    fun loadPhotos() {
        viewModelScope.launch(Dispatchers.IO) {
            mtpHelper.getPhotoList { batch ->
                _photos.update { current -> current + batch }
                recalcStats()
            }
        }
    }

    private fun startWatching() {
        watchJob?.cancel()
        mtpHelper.watchNewPhotos(viewModelScope) { newPhoto ->
            _photos.update { it + newPhoto }
            recalcStats()
        }
    }

    fun uploadPhoto(handle: Int) {
        val photo = _photos.value.find { it.handle == handle } ?: return
        if (photo.status == PhotoStatus.UPLOADING || photo.status == PhotoStatus.UPLOADED) return

        viewModelScope.launch {
            updatePhotoStatus(handle, PhotoStatus.UPLOADING)
            performUpload(handle)
        }
    }

    fun uploadSelected() {
        val handles = _selectedHandles.value.toList()
        handles.forEach { handle -> uploadPhoto(handle) }
        clearSelection()
    }

    fun uploadAll() {
        _photos.value
            .filter { it.status == PhotoStatus.PENDING || it.status == PhotoStatus.FAILED }
            .forEach { uploadPhoto(it.handle) }
    }

    fun retryFailed() {
        _photos.value.filter { it.status == PhotoStatus.FAILED }
            .forEach { uploadPhoto(it.handle) }
    }

    fun toggleSelect(handle: Int) {
        _selectedHandles.update { current ->
            if (handle in current) current - handle else current + handle
        }
    }

    fun selectAll() {
        _selectedHandles.value = _photos.value.map { it.handle }.toSet()
    }

    fun clearSelection() {
        _selectedHandles.value = emptySet()
    }

    private suspend fun performUpload(handle: Int) = uploadSemaphore.withPermit {
        val photo = _photos.value.find { it.handle == handle } ?: return
        val location = _activeLocation.value

        runCatching {
            retryWithBackoff(times = 3) {
                // Download from camera to cache
                val file = mtpHelper.downloadPhoto(
                    handle,
                    photo.filename,
                    context.cacheDir
                )

                // Presign
                val shootDate = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
                    .format(Date(photo.dateTaken))
                val presignReq = PresignRequest(
                    filename = photo.filename,
                    content_type = "image/jpeg",
                    location_id = location?.id ?: "",
                    shoot_date = shootDate
                )
                val presign = mediaRepository.presign(presignReq).getOrThrow()

                // PUT to S3
                val requestBody = file.asRequestBody("image/jpeg".toMediaType())
                val putRequest = Request.Builder()
                    .url(presign.upload_url)
                    .put(requestBody)
                    .build()
                withContext(Dispatchers.IO) {
                    okHttpClient.newCall(putRequest).execute().use { resp ->
                        if (!resp.isSuccessful) error("S3 upload failed: ${resp.code}")
                    }
                }

                // Confirm
                mediaRepository.confirm(presign.media_id).getOrThrow()

                // Cleanup cache
                file.delete()
            }
            updatePhotoStatus(handle, PhotoStatus.UPLOADED)
        }.onFailure {
            updatePhotoStatus(handle, PhotoStatus.FAILED)
        }
        recalcStats()
    }

    private fun updatePhotoStatus(handle: Int, status: PhotoStatus) {
        _photos.update { list ->
            list.map { if (it.handle == handle) it.copy(status = status) else it }
        }
    }

    private fun recalcStats() {
        val list = _photos.value
        _stats.value = SessionStats(
            total = list.size,
            pending = list.count { it.status == PhotoStatus.PENDING },
            uploading = list.count { it.status == PhotoStatus.UPLOADING },
            uploaded = list.count { it.status == PhotoStatus.UPLOADED },
            failed = list.count { it.status == PhotoStatus.FAILED }
        )
    }

    override fun onCleared() {
        super.onCleared()
        watchJob?.cancel()
        mtpHelper.disconnect()
    }
}
