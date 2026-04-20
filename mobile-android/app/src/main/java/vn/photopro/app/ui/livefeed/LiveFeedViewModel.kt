package vn.photopro.app.ui.livefeed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import vn.photopro.app.BuildConfig
import vn.photopro.app.data.model.MediaItem
import com.google.gson.Gson
import javax.inject.Inject

@HiltViewModel
class LiveFeedViewModel @Inject constructor(
    private val okHttpClient: OkHttpClient
) : ViewModel() {

    private val _photos = MutableStateFlow<List<MediaItem>>(emptyList())
    val photos: StateFlow<List<MediaItem>> = _photos.asStateFlow()

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _newPhotoIds = MutableStateFlow<Set<String>>(emptySet())
    val newPhotoIds: StateFlow<Set<String>> = _newPhotoIds.asStateFlow()

    private val gson = Gson()
    private var eventSource: EventSource? = null
    private var connectJob: Job? = null

    init {
        connect()
    }

    fun connect() {
        eventSource?.cancel()
        connectJob?.cancel()

        connectJob = viewModelScope.launch(Dispatchers.IO) {
            val request = Request.Builder()
                .url("${BuildConfig.API_URL}/api/v1/realtime/staff-stream")
                .header("Accept", "text/event-stream")
                .build()

            val listener = object : EventSourceListener() {
                override fun onOpen(eventSource: EventSource, response: Response) {
                    _isConnected.value = true
                }

                override fun onEvent(
                    eventSource: EventSource,
                    id: String?,
                    type: String?,
                    data: String
                ) {
                    if (type == "new_photo" || type == null) {
                        runCatching {
                            val media = gson.fromJson(data, MediaItem::class.java)
                            _photos.update { listOf(media) + it }
                            _newPhotoIds.update { it + media.id }
                            // Remove "new" badge after 3s
                            viewModelScope.launch {
                                kotlinx.coroutines.delay(3000L)
                                _newPhotoIds.update { it - media.id }
                            }
                        }
                    }
                }

                override fun onClosed(eventSource: EventSource) {
                    _isConnected.value = false
                    // Auto-reconnect after 5s
                    viewModelScope.launch {
                        kotlinx.coroutines.delay(5000L)
                        connect()
                    }
                }

                override fun onFailure(
                    eventSource: EventSource,
                    t: Throwable?,
                    response: Response?
                ) {
                    _isConnected.value = false
                    viewModelScope.launch {
                        kotlinx.coroutines.delay(5000L)
                        connect()
                    }
                }
            }

            this@LiveFeedViewModel.eventSource = EventSources
                .createFactory(okHttpClient)
                .newEventSource(request, listener)
        }
    }

    override fun onCleared() {
        super.onCleared()
        eventSource?.cancel()
        connectJob?.cancel()
    }
}
