package vn.photopro.app.ui.ftp

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import vn.photopro.app.data.api.StaffApi
import vn.photopro.app.data.model.FTPCredentials
import vn.photopro.app.data.model.FTPStatus
import vn.photopro.app.data.model.LocationTag
import vn.photopro.app.data.repository.LocationRepository
import javax.inject.Inject

@HiltViewModel
class FTPViewModel @Inject constructor(
    private val staffApi: StaffApi,
    private val locationRepository: LocationRepository
) : ViewModel() {

    private val _credentials = MutableStateFlow<FTPCredentials?>(null)
    val credentials: StateFlow<FTPCredentials?> = _credentials.asStateFlow()

    private val _ftpStatus = MutableStateFlow<FTPStatus?>(null)
    val ftpStatus: StateFlow<FTPStatus?> = _ftpStatus.asStateFlow()

    private val _locations = MutableStateFlow<List<LocationTag>>(emptyList())
    val locations: StateFlow<List<LocationTag>> = _locations.asStateFlow()

    private val _activeLocation = MutableStateFlow<LocationTag?>(null)
    val activeLocation: StateFlow<LocationTag?> = _activeLocation.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        loadCredentials()
        loadLocations()
        startStatusPolling()
    }

    fun loadCredentials() {
        viewModelScope.launch {
            _isLoading.value = true
            runCatching { staffApi.getFTPCredentials() }
                .onSuccess { _credentials.value = it }
                .onFailure { _error.value = it.message }
            _isLoading.value = false
        }
    }

    fun resetPassword() {
        viewModelScope.launch {
            _isLoading.value = true
            runCatching { staffApi.resetFTPPassword() }
                .onSuccess { _credentials.value = it }
                .onFailure { _error.value = "Doi mat khau that bai: ${it.message}" }
            _isLoading.value = false
        }
    }

    private fun loadLocations() {
        viewModelScope.launch {
            locationRepository.getLocations().onSuccess { _locations.value = it }
            locationRepository.getActiveLocation().onSuccess { _activeLocation.value = it }
        }
    }

    fun setActiveLocation(locationId: String) {
        viewModelScope.launch {
            locationRepository.setActiveLocation(locationId)
                .onSuccess { _activeLocation.value = it }
                .onFailure { _error.value = "Luu dia diem that bai" }
        }
    }

    private fun startStatusPolling() {
        viewModelScope.launch {
            while (isActive) {
                runCatching { staffApi.getFTPStatus() }
                    .onSuccess { _ftpStatus.value = it }
                delay(10_000L)
            }
        }
    }

    fun clearError() { _error.value = null }
}
