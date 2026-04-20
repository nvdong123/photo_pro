package vn.photopro.app.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import vn.photopro.app.data.model.AssignLocationRequest
import vn.photopro.app.data.model.AssignResult
import vn.photopro.app.data.model.ConfirmRequest
import vn.photopro.app.data.model.ConfirmResponse
import vn.photopro.app.data.model.FTPCredentials
import vn.photopro.app.data.model.FTPStatus
import vn.photopro.app.data.model.LocationTag
import vn.photopro.app.data.model.MediaItem
import vn.photopro.app.data.model.PresignRequest
import vn.photopro.app.data.model.PresignResponse
import vn.photopro.app.data.model.SetLocationRequest

interface StaffApi {
    @GET("api/v1/admin/albums")
    suspend fun getLocations(): List<LocationTag>

    @GET("api/v1/staff/ftp-credentials")
    suspend fun getFTPCredentials(): FTPCredentials

    @POST("api/v1/staff/ftp-credentials/reset")
    suspend fun resetFTPPassword(): FTPCredentials

    @GET("api/v1/staff/ftp/status")
    suspend fun getFTPStatus(): FTPStatus

    @POST("api/v1/staff/active-location")
    suspend fun setActiveLocation(@Body body: SetLocationRequest): LocationTag

    @GET("api/v1/staff/active-location")
    suspend fun getActiveLocation(): LocationTag?

    @GET("api/v1/staff/media/untagged")
    suspend fun getUntaggedMedia(): List<MediaItem>

    @POST("api/v1/staff/media/assign-location")
    suspend fun assignLocation(@Body body: AssignLocationRequest): AssignResult

    @POST("api/v1/staff/upload/presign")
    suspend fun presign(@Body request: PresignRequest): PresignResponse

    @POST("api/v1/staff/upload/confirm")
    suspend fun confirm(@Body request: ConfirmRequest): ConfirmResponse
}
