package vn.photopro.app.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import vn.photopro.app.data.model.LoginRequest
import vn.photopro.app.data.model.LoginResponse
import vn.photopro.app.data.model.StaffInfo

interface AuthApi {
    @POST("api/v1/admin/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("api/v1/admin/auth/me")
    suspend fun getMe(): StaffInfo
}
