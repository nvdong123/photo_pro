package vn.photopro.app.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import vn.photopro.app.data.repository.AuthRepository
import javax.inject.Inject

data class LoginUiState(
    val isLoading: Boolean = false,
    val error: String? = null,
    val isSuccess: Boolean = false
)

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _uiState.value = _uiState.value.copy(error = "Vui lòng nhập đầy đủ thông tin")
            return
        }
        viewModelScope.launch {
            _uiState.value = LoginUiState(isLoading = true)
            authRepository.login(email.trim(), password)
                .onSuccess {
                    _uiState.value = LoginUiState(isSuccess = true)
                }
                .onFailure { e ->
                    _uiState.value = LoginUiState(
                        error = e.message ?: "Đăng nhập thất bại. Vui lòng thử lại."
                    )
                }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }
}
