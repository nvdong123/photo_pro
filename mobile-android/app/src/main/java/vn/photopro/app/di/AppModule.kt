package vn.photopro.app.di

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import vn.photopro.app.data.api.ApiClient
import vn.photopro.app.data.api.AuthApi
import vn.photopro.app.data.api.StaffApi
import vn.photopro.app.util.TokenManager
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideTokenManager(@ApplicationContext context: Context): TokenManager =
        TokenManager(context)

    @Provides
    @Singleton
    fun provideRetrofit(tokenManager: TokenManager): Retrofit =
        ApiClient.create(tokenManager)

    @Provides
    @Singleton
    fun provideRawOkHttpClient(tokenManager: TokenManager): OkHttpClient =
        ApiClient.createRawClient(tokenManager)

    @Provides
    @Singleton
    fun provideAuthApi(retrofit: Retrofit): AuthApi =
        retrofit.create(AuthApi::class.java)

    @Provides
    @Singleton
    fun provideStaffApi(retrofit: Retrofit): StaffApi =
        retrofit.create(StaffApi::class.java)
}
