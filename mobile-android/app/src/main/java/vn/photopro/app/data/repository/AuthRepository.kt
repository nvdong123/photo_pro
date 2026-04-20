package vn.photopro.app.data.repository

import vn.photopro.app.data.api.AuthApi
import vn.photopro.app.data.model.LoginRequest
import vn.photopro.app.data.model.LoginResponse
import vn.photopro.app.data.model.StaffInfo
import vn.photopro.app.util.TokenManager
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val authApi: AuthApi,
    private val tokenManager: TokenManager
) {
    suspend fun login(email: String, password: String): Result<LoginResponse> {
        return runCatching {
            val response = authApi.login(LoginRequest(email, password))
            tokenManager.saveToken(response.access_token)
            tokenManager.saveStaffInfo(response.staff)
            response
        }
    }

    suspend fun getMe(): Result<StaffInfo> = runCatching { authApi.getMe() }

    suspend fun logout() = tokenManager.clearToken()

    suspend fun isLoggedIn(): Boolean = tokenManager.getToken() != null

    suspend fun getCachedStaff(): StaffInfo? = tokenManager.getStaffInfo()
}
