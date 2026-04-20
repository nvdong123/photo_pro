package vn.photopro.app.ui.livefeed

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import vn.photopro.app.data.model.MediaItem
import vn.photopro.app.ui.theme.AccentGreen
import vn.photopro.app.ui.theme.PrimaryGreen
import vn.photopro.app.ui.theme.StatusUploaded
import vn.photopro.app.ui.theme.SurfaceWhite
import vn.photopro.app.ui.theme.TextSecondary

@Composable
fun LiveFeedScreen(viewModel: LiveFeedViewModel = hiltViewModel()) {
    val photos by viewModel.photos.collectAsStateWithLifecycle()
    val isConnected by viewModel.isConnected.collectAsStateWithLifecycle()
    val newPhotoIds by viewModel.newPhotoIds.collectAsStateWithLifecycle()

    Column(modifier = Modifier.fillMaxSize()) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(PrimaryGreen)
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Live Feed", color = SurfaceWhite, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    shape = CircleShape,
                    color = if (isConnected) StatusUploaded else Color(0xFF757575),
                    modifier = Modifier.size(10.dp)
                ) {}
                Text(
                    text = if (isConnected) "  Dang ket noi" else "  Mat ket noi",
                    color = SurfaceWhite,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(start = 4.dp)
                )
            }
        }

        if (photos.isEmpty()) {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "Chua co anh moi",
                        color = TextSecondary,
                        fontSize = 16.sp
                    )
                    Text(
                        "Anh moi tu may anh se hien thi o day",
                        color = TextSecondary,
                        fontSize = 13.sp
                    )
                }
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                items(photos, key = { it.id }) { media ->
                    val isNew = media.id in newPhotoIds
                    AnimatedVisibility(
                        visible = true,
                        enter = fadeIn() + slideInVertically { -it }
                    ) {
                        LiveFeedPhotoCard(media = media, isNew = isNew)
                    }
                }
            }
        }
    }
}

@Composable
private fun LiveFeedPhotoCard(media: MediaItem, isNew: Boolean) {
    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .background(Color(0xFFEEEEEE))
            .then(if (isNew) Modifier.border(2.dp, AccentGreen) else Modifier)
    ) {
        AsyncImage(
            model = media.thumb_url ?: media.preview_url,
            contentDescription = media.filename,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )

        if (isNew) {
            Surface(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(4.dp),
                shape = RoundedCornerShape(4.dp),
                color = AccentGreen
            ) {
                Text(
                    "MOI",
                    color = SurfaceWhite,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                )
            }
        }

        media.location?.let { loc ->
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth(),
                color = Color.Black.copy(alpha = 0.4f)
            ) {
                Text(
                    text = loc.name,
                    color = SurfaceWhite,
                    fontSize = 9.sp,
                    maxLines = 1,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                )
            }
        }
    }
}
