package vn.photopro.app.data.repository

import vn.photopro.app.data.api.StaffApi
import vn.photopro.app.data.model.LocationTag
import vn.photopro.app.data.model.SetLocationRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LocationRepository @Inject constructor(
    private val staffApi: StaffApi
) {
    suspend fun getLocations(): Result<List<LocationTag>> =
        runCatching { staffApi.getLocations() }

    suspend fun getActiveLocation(): Result<LocationTag?> =
        runCatching { staffApi.getActiveLocation() }

    suspend fun setActiveLocation(locationId: String): Result<LocationTag> =
        runCatching { staffApi.setActiveLocation(SetLocationRequest(locationId)) }
}
