package vn.photopro.mobile.otg

import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import androidx.compose.material3.ExperimentalMaterial3Api
import vn.photopro.mobile.otg.ui.SessionStatsView

private enum class FilterTab {
    ALL,
    PENDING,
    UPLOADING,
    UPLOADED,
    FAILED
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OTGSessionScreen(
    viewModel: OTGViewModel,
    onBack: () -> Unit,
    onFinish: (SessionResult) -> Unit
) {
    val connectionStatus by viewModel.connectionStatus.collectAsState()
    val photos by viewModel.photos.collectAsState()
    val cameraModel by viewModel.cameraModel.collectAsState()
    val locationName by viewModel.locationName.collectAsState()
    val isLoading by viewModel.isLoadingPhotos.collectAsState()

    var filterTab by remember { mutableStateOf(FilterTab.ALL) }

    val filteredPhotos = remember(photos, filterTab) {
        photos.filter { photo ->
            when (filterTab) {
                FilterTab.ALL -> true
                FilterTab.PENDING -> photo.status == PhotoStatus.PENDING
                FilterTab.UPLOADING -> photo.status == PhotoStatus.UPLOADING
                FilterTab.UPLOADED -> photo.status == PhotoStatus.UPLOADED
                FilterTab.FAILED -> photo.status == PhotoStatus.FAILED
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(text = locationName.ifBlank { "Phiên OTG" }, fontWeight = FontWeight.Bold)
                        Text(text = "JPG_HD", color = Color(0xFF166534))
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Quay lại")
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF5F7F9))
        ) {
            Column(modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
                ConnectionStatusCard(connectionStatus = connectionStatus, cameraModel = cameraModel)
                SessionStatsView(viewModel = viewModel)
                ActionRow(
                    pendingCount = viewModel.pendingCount,
                    onUploadAll = { viewModel.uploadAll() },
                    onFinish = { onFinish(viewModel.finishResult()) }
                )
                FilterTabs(
                    selected = filterTab,
                    onSelected = { filterTab = it },
                    viewModel = viewModel
                )

                if (isLoading || (photos.isEmpty() && connectionStatus == ConnectionStatus.CONNECTED)) {
                    Box(modifier = Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            CircularProgressIndicator(color = Color(0xFF166534))
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(text = "Đang tải ảnh...", color = Color(0xFF334155))
                        }
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(3),
                        modifier = Modifier.fillMaxWidth().weight(1f),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(items = filteredPhotos, key = { it.handle }) { photo ->
                            LaunchedEffect(photo.handle) {
                                viewModel.ensureThumbnail(photo.handle)
                            }
                            PhotoCard(
                                photo = photo,
                                onUpload = { viewModel.uploadPhoto(photo) },
                                onSelect = {}
                            )
                        }
                    }
                }
            }

            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(onClick = {}, modifier = Modifier.weight(1f)) {
                    Text(text = "Chọn nhiều")
                }
                Button(
                    onClick = { viewModel.uploadAll() },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF166534))
                ) {
                    Text(text = "Tải hàng loạt")
                }
            }
        }
    }
}

@Composable
private fun ConnectionStatusCard(connectionStatus: ConnectionStatus, cameraModel: String) {
    val (label, tone) = when (connectionStatus) {
        ConnectionStatus.IDLE -> "Chưa kết nối" to Color(0xFF64748B)
        ConnectionStatus.DETECTING -> "Đang tìm máy ảnh..." to Color(0xFF334155)
        ConnectionStatus.CONNECTING -> "Đang kết nối..." to Color(0xFF2563EB)
        ConnectionStatus.CONNECTED -> "Đã kết nối" to Color(0xFF166534)
        ConnectionStatus.ERROR -> "Lỗi kết nối" to Color(0xFFB91C1C)
    }

    Card(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(text = label, color = tone, fontWeight = FontWeight.Bold)
            Text(
                text = if (cameraModel.isBlank()) "Chưa nhận diện model camera" else cameraModel,
                color = Color(0xFF475569)
            )
        }
    }
}

@Composable
private fun FilterTabs(selected: FilterTab, onSelected: (FilterTab) -> Unit, viewModel: OTGViewModel) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        FilterChip(text = "Tất cả", active = selected == FilterTab.ALL) { onSelected(FilterTab.ALL) }
        FilterChip(text = "Chờ ${viewModel.pendingCount}", active = selected == FilterTab.PENDING) { onSelected(FilterTab.PENDING) }
        FilterChip(text = "Đang ${viewModel.uploadingCount}", active = selected == FilterTab.UPLOADING) { onSelected(FilterTab.UPLOADING) }
        FilterChip(text = "Xong ${viewModel.uploadedCount}", active = selected == FilterTab.UPLOADED) { onSelected(FilterTab.UPLOADED) }
        FilterChip(text = "Lỗi ${viewModel.failedCount}", active = selected == FilterTab.FAILED) { onSelected(FilterTab.FAILED) }
    }
}

@Composable
private fun FilterChip(text: String, active: Boolean, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (active) Color(0xFF166534) else Color.White)
            .border(1.dp, Color(0xFFD1D5DB), RoundedCornerShape(999.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 6.dp)
    ) {
        Text(text = text, color = if (active) Color.White else Color(0xFF1F2937))
    }
}

@Composable
private fun ActionRow(pendingCount: Int, onUploadAll: () -> Unit, onFinish: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        OutlinedButton(onClick = {}, modifier = Modifier.weight(1f)) {
            Text(text = "Tạm dừng")
        }
        Button(
            onClick = onUploadAll,
            modifier = Modifier.weight(1f),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF166534))
        ) {
            Text(text = "Upload ($pendingCount)")
        }
        OutlinedButton(onClick = onFinish, modifier = Modifier.weight(1f)) {
            Text(text = "Kết thúc phiên", color = Color(0xFFB91C1C))
        }
    }
}

@Composable
fun PhotoCard(photo: PhotoItem, onUpload: () -> Unit, onSelect: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable { onSelect() }) {
        Box(modifier = Modifier.background(Color.White)) {
            if (photo.thumbnail != null) {
                androidx.compose.foundation.Image(
                    bitmap = photo.thumbnail.asImageBitmap(),
                    contentDescription = photo.filename,
                    modifier = Modifier.fillMaxWidth().height(110.dp),
                    contentScale = ContentScale.Crop
                )
            } else {
                AsyncImage(
                    model = null,
                    contentDescription = null,
                    modifier = Modifier.fillMaxWidth().height(110.dp)
                )
            }

            StatusBadge(photo.status)

            Text(
                text = "...${photo.filename.takeLast(3)}",
                modifier = Modifier.align(Alignment.BottomStart).padding(6.dp),
                color = Color.White,
                fontWeight = FontWeight.Bold
            )

            Button(
                onClick = onUpload,
                modifier = Modifier.align(Alignment.BottomEnd).padding(4.dp).height(28.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF166534))
            ) {
                Text(text = "Tải lên")
            }
        }
    }
}

@Composable
private fun BoxScope.StatusBadge(status: PhotoStatus) {
    val (text, color) = when (status) {
        PhotoStatus.PENDING -> "Chưa tải" to Color(0xFF64748B)
        PhotoStatus.UPLOADING -> "Đang tải" to Color(0xFF2563EB)
        PhotoStatus.UPLOADED -> "Đã tải" to Color(0xFF166534)
        PhotoStatus.FAILED -> "Lỗi" to Color(0xFFB91C1C)
        PhotoStatus.CACHED -> "Đã cache" to Color(0xFF7C3AED)
    }

    Box(
        modifier = Modifier
            .align(Alignment.TopEnd)
            .padding(6.dp)
            .clip(RoundedCornerShape(999.dp))
            .background(color)
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        Text(text = text, color = Color.White)
    }
}
