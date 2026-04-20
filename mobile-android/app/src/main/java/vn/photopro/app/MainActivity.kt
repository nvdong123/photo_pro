package vn.photopro.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint
import vn.photopro.app.ui.navigation.NavGraph
import vn.photopro.app.ui.navigation.Screen
import vn.photopro.app.ui.theme.PhotoProTheme
import vn.photopro.app.util.TokenManager
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var tokenManager: TokenManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PhotoProTheme {
                val navController = rememberNavController()
                var startDestination by remember { mutableStateOf<String?>(null) }

                LaunchedEffect(Unit) {
                    startDestination = if (tokenManager.getToken() != null) {
                        Screen.Dashboard.route
                    } else {
                        Screen.Login.route
                    }
                }

                startDestination?.let { start ->
                    NavGraph(
                        navController = navController,
                        startDestination = start
                    )
                }
            }
        }
    }
}
