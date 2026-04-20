package vn.photopro.app.ui.dashboard

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.WifiTethering
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import vn.photopro.app.ui.ftp.FTPScreen
import vn.photopro.app.ui.livefeed.LiveFeedScreen
import vn.photopro.app.ui.otg.OTGSessionScreen
import vn.photopro.app.ui.theme.PrimaryGreen
import vn.photopro.app.ui.theme.SurfaceWhite
import vn.photopro.app.ui.upload.UploadScreen

data class BottomNavItem(
    val label: String,
    val icon: ImageVector,
    val route: String
)

@Composable
fun DashboardScreen(onLogout: () -> Unit) {
    val navItems = listOf(
        BottomNavItem("Tải lên", Icons.Filled.CloudUpload, "upload"),
        BottomNavItem("Phiên chụp", Icons.Filled.CameraAlt, "otg"),
        BottomNavItem("Live Feed", Icons.Filled.WifiTethering, "livefeed"),
        BottomNavItem("Cài đặt", Icons.Filled.Settings, "settings")
    )
    var selectedIndex by remember { mutableIntStateOf(0) }

    Scaffold(
        bottomBar = {
            NavigationBar(containerColor = PrimaryGreen) {
                navItems.forEachIndexed { index, item ->
                    NavigationBarItem(
                        selected = selectedIndex == index,
                        onClick = { selectedIndex = index },
                        icon = {
                            Icon(
                                imageVector = item.icon,
                                contentDescription = item.label
                            )
                        },
                        label = { Text(item.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = PrimaryGreen,
                            selectedTextColor = SurfaceWhite,
                            unselectedIconColor = SurfaceWhite.copy(alpha = 0.7f),
                            unselectedTextColor = SurfaceWhite.copy(alpha = 0.7f),
                            indicatorColor = SurfaceWhite
                        )
                    )
                }
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (selectedIndex) {
                0 -> UploadScreen()
                1 -> OTGSessionScreen()
                2 -> LiveFeedScreen()
                3 -> FTPScreen(onLogout = onLogout)
            }
        }
    }
}
