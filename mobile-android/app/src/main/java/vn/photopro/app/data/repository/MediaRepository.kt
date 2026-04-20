package vn.photopro.app.data.repository

import vn.photopro.app.data.api.StaffApi
import vn.photopro.app.data.model.AssignLocationRequest
import vn.photopro.app.data.model.AssignResult
import vn.photopro.app.data.model.ConfirmRequest
import vn.photopro.app.data.model.ConfirmResponse
import vn.photopro.app.data.model.MediaItem
import vn.photopro.app.data.model.PresignRequest
import vn.photopro.app.data.model.PresignResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MediaRepository @Inject constructor(
    private val staffApi: StaffApi
) {
    suspend fun getUntaggedMedia(): Result<List<MediaItem>> =
        runCatching { staffApi.getUntaggedMedia() }

    suspend fun assignLocation(
        mediaIds: List<String>,
        locationId: String
    ): Result<AssignResult> = runCatching {
        staffApi.assignLocation(AssignLocationRequest(mediaIds, locationId))
    }

    suspend fun presign(request: PresignRequest): Result<PresignResponse> =
        runCatching { staffApi.presign(request) }

    suspend fun confirm(mediaId: String): Result<ConfirmResponse> =
        runCatching { staffApi.confirm(ConfirmRequest(mediaId)) }
}
