package vn.photopro.app.ui.untagged

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import vn.photopro.app.data.model.LocationTag
import vn.photopro.app.data.model.MediaItem
import vn.photopro.app.data.repository.LocationRepository
import vn.photopro.app.data.repository.MediaRepository
import javax.inject.Inject

@HiltViewModel
class UntaggedViewModel @Inject constructor(
    private val mediaRepository: MediaRepository,
    private val locationRepository: LocationRepository
) : ViewModel() {

    private val _photos = MutableStateFlow<List<MediaItem>>(emptyList())
    val photos: StateFlow<List<MediaItem>> = _photos.asStateFlow()

    private val _locations = MutableStateFlow<List<LocationTag>>(emptyList())
    val locations: StateFlow<List<LocationTag>> = _locations.asStateFlow()

    private val _selectedIds = MutableStateFlow<Set<String>>(emptySet())
    val selectedIds: StateFlow<Set<String>> = _selectedIds.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _isSaving = MutableStateFlow(false)
    val isSaving: StateFlow<Boolean> = _isSaving.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        loadLocations()
        startPolling()
    }

    private fun loadLocations() {
        viewModelScope.launch {
            locationRepository.getLocations().onSuccess { _locations.value = it }
        }
    }

    fun loadUntagged() {
        viewModelScope.launch {
            _isLoading.value = true
            mediaRepository.getUntaggedMedia()
                .onSuccess { _photos.value = it }
                .onFailure { _error.value = it.message }
            _isLoading.value = false
        }
    }

    private fun startPolling() {
        viewModelScope.launch {
            while (isActive) {
                loadUntagged()
                delay(30_000L)
            }
        }
    }

    fun toggleSelect(id: String) {
        _selectedIds.update { current ->
            if (id in current) current - id else current + id
        }
    }

    fun selectAll() {
        _selectedIds.value = _photos.value.map { it.id }.toSet()
    }

    fun clearSelection() {
        _selectedIds.value = emptySet()
    }

    fun assignLocation(locationId: String) {
        val ids = _selectedIds.value.toList()
        if (ids.isEmpty()) return

        viewModelScope.launch {
            _isSaving.value = true
            mediaRepository.assignLocation(ids, locationId)
                .onSuccess {
                    clearSelection()
                    loadUntagged()
                }
                .onFailure { _error.value = "Gan dia diem that bai: ${it.message}" }
            _isSaving.value = false
        }
    }

    fun clearError() { _error.value = null }
}
