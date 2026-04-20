package vn.photopro.mobile.otg

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.hardware.usb.UsbManager
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import java.io.File

class OTGViewModel(application: Application) : AndroidViewModel(application) {

    private val _connectionStatus = MutableStateFlow(ConnectionStatus.IDLE)
    val connectionStatus: StateFlow<ConnectionStatus> = _connectionStatus.asStateFlow()

    private val _cameraModel = MutableStateFlow("")
    val cameraModel: StateFlow<String> = _cameraModel.asStateFlow()

    private val _locationName = MutableStateFlow("")
    val locationName: StateFlow<String> = _locationName.asStateFlow()

    private val _photos = MutableStateFlow<List<PhotoItem>>(emptyList())
    val photos: StateFlow<List<PhotoItem>> = _photos.asStateFlow()

    private val _isLoadingPhotos = MutableStateFlow(false)
    val isLoadingPhotos: StateFlow<Boolean> = _isLoadingPhotos.asStateFlow()

    private val _uploadProgress = MutableStateFlow(0)
    val uploadProgress: StateFlow<Int> = _uploadProgress.asStateFlow()

    private var mtpHelper: MtpHelper? = null
    private var uploadManager: UploadManager? = null
    private var locationId: String = ""
    private var apiUrl: String = ""
    private var authToken: String = ""
    private var shootDate: String = ""

    private val uploadSemaphore = Semaphore(3)

    val totalCount: Int get() = _photos.value.size
    val pendingCount: Int get() = _photos.value.count { it.status == PhotoStatus.PENDING }
    val uploadingCount: Int get() = _photos.value.count { it.status == PhotoStatus.UPLOADING }
    val uploadedCount: Int get() = _photos.value.count { it.status == PhotoStatus.UPLOADED }
    val failedCount: Int get() = _photos.value.count { it.status == PhotoStatus.FAILED }

    fun init(
        locationId: String,
        locationName: String,
        apiUrl: String,
        authToken: String,
        shootDate: String
    ) {
        this.locationId = locationId
        this.apiUrl = apiUrl.trimEnd('/')
        this.authToken = authToken
        this.shootDate = shootDate
        _locationName.value = locationName
        uploadManager = UploadManager(this.apiUrl, this.authToken)
        detectCamera()
    }

    fun detectCamera() {
        viewModelScope.launch {
            _connectionStatus.value = ConnectionStatus.DETECTING
            val usbManager = getApplication<Application>()
                .getSystemService(Context.USB_SERVICE) as UsbManager
            mtpHelper?.close()
            mtpHelper = MtpHelper(getApplication(), usbManager)

            val result = mtpHelper?.connect()
            result?.fold(
                onSuccess = { info ->
                    _cameraModel.value = info.model
                    _connectionStatus.value = ConnectionStatus.CONNECTED
                    loadPhotos()
                },
                onFailure = {
                    _connectionStatus.value = ConnectionStatus.ERROR
                }
            ) ?: run {
                _connectionStatus.value = ConnectionStatus.ERROR
            }
        }
    }

    fun loadPhotos() {
        viewModelScope.launch(Dispatchers.IO) {
            _isLoadingPhotos.value = true
            val list = mtpHelper?.getPhotoList() ?: emptyList()
            _photos.value = list
            _isLoadingPhotos.value = false
        }
    }

    fun ensureThumbnail(handle: Int) {
        val item = _photos.value.find { it.handle == handle } ?: return
        if (item.thumbnail != null) return

        viewModelScope.launch(Dispatchers.IO) {
            val thumb = mtpHelper?.getThumbnail(handle) ?: return@launch
            updatePhotoThumbnail(handle, thumb)
        }
    }

    fun uploadPhoto(photo: PhotoItem) {
        viewModelScope.launch(Dispatchers.IO) {
            uploadSemaphore.withPermit {
                updatePhotoStatus(photo.handle, PhotoStatus.UPLOADING)
                var success = false

                repeat(3) { attempt ->
                    if (success) return@repeat
                    success = runCatching {
                        val helper = requireNotNull(mtpHelper) { "Chua co ket noi camera" }
                        val manager = requireNotNull(uploadManager) { "Chua khoi tao upload manager" }
                        val localPath = helper.downloadPhoto(
                            handle = photo.handle,
                            filename = photo.filename,
                            cacheDir = getApplication<Application>().cacheDir
                        )
                        manager.upload(
                            file = File(localPath),
                            locationId = locationId,
                            shootDate = shootDate
                        ) { progress ->
                            _uploadProgress.value = progress
                        }
                    }.isSuccess

                    if (!success && attempt < 2) {
                        updatePhotoStatus(photo.handle, PhotoStatus.PENDING)
                    }
                }

                if (success) {
                    updatePhotoStatus(photo.handle, PhotoStatus.UPLOADED)
                } else {
                    updatePhotoStatus(photo.handle, PhotoStatus.FAILED)
                }
            }
        }
    }

    fun uploadAll() {
        val pending = _photos.value.filter { it.status == PhotoStatus.PENDING }
        pending.forEach { uploadPhoto(it) }
    }

    fun uploadSelected(handles: List<Int>) {
        _photos.value
            .filter { it.handle in handles }
            .filter { it.status == PhotoStatus.PENDING || it.status == PhotoStatus.FAILED }
            .forEach { uploadPhoto(it) }
    }

    fun finishResult(): SessionResult {
        return SessionResult(uploadedCount = uploadedCount, failedCount = failedCount)
    }

    fun onUsbAttached() {
        detectCamera()
    }

    private fun updatePhotoStatus(handle: Int, status: PhotoStatus) {
        _photos.value = _photos.value.map {
            if (it.handle == handle) it.copy(status = status) else it
        }
    }

    private fun updatePhotoThumbnail(handle: Int, bitmap: Bitmap) {
        _photos.value = _photos.value.map {
            if (it.handle == handle) it.copy(thumbnail = bitmap) else it
        }
    }

    override fun onCleared() {
        mtpHelper?.close()
        mtpHelper = null
        super.onCleared()
    }
}
