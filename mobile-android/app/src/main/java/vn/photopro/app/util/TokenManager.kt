package vn.photopro.app.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.gson.Gson
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import vn.photopro.app.data.model.StaffInfo

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "photopro_prefs")

class TokenManager(private val context: Context) {

    private val gson = Gson()

    companion object {
        private val KEY_TOKEN = stringPreferencesKey("auth_token")
        private val KEY_STAFF = stringPreferencesKey("staff_info")
    }

    suspend fun saveToken(token: String) {
        context.dataStore.edit { prefs ->
            prefs[KEY_TOKEN] = token
        }
    }

    suspend fun getToken(): String? {
        return context.dataStore.data
            .map { prefs -> prefs[KEY_TOKEN] }
            .first()
    }

    suspend fun clearToken() {
        context.dataStore.edit { prefs ->
            prefs.remove(KEY_TOKEN)
            prefs.remove(KEY_STAFF)
        }
    }

    suspend fun saveStaffInfo(staff: StaffInfo) {
        context.dataStore.edit { prefs ->
            prefs[KEY_STAFF] = gson.toJson(staff)
        }
    }

    suspend fun getStaffInfo(): StaffInfo? {
        val json = context.dataStore.data
            .map { prefs -> prefs[KEY_STAFF] }
            .first() ?: return null
        return runCatching { gson.fromJson(json, StaffInfo::class.java) }.getOrNull()
    }
}
