package vn.photopro.app.ui.otg

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import vn.photopro.app.data.model.ConnectionStatus
import vn.photopro.app.data.model.PhotoItem
import vn.photopro.app.data.model.PhotoStatus
import vn.photopro.app.data.model.SessionStats
import vn.photopro.app.ui.theme.AccentGreen
import vn.photopro.app.ui.theme.ErrorRed
import vn.photopro.app.ui.theme.PrimaryGreen
import vn.photopro.app.ui.theme.StatusFailed
import vn.photopro.app.ui.theme.StatusPending
import vn.photopro.app.ui.theme.StatusUploaded
import vn.photopro.app.ui.theme.StatusUploading
import vn.photopro.app.ui.theme.SurfaceWhite
import vn.photopro.app.ui.theme.TextSecondary
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun OTGSessionScreen(viewModel: OTGViewModel = hiltViewModel()) {
    val connectionStatus by viewModel.connectionStatus.collectAsStateWithLifecycle()
    val cameraModel by viewModel.cameraModel.collectAsStateWithLifecycle()
    val photos by viewModel.photos.collectAsStateWithLifecycle()
    val stats by viewModel.stats.collectAsStateWithLifecycle()
    val selectedHandles by viewModel.selectedHandles.collectAsStateWithLifecycle()
    val activeLocation by viewModel.activeLocation.collectAsStateWithLifecycle()

    var filterIndex by remember { mutableIntStateOf(0) }
    var multiSelectMode by remember { mutableStateOf(false) }

    val filterTabs = listOf("Tat ca", "Cho", "Dang", "Xong", "Loi")
    val filteredPhotos = when (filterIndex) {
        1 -> photos.filter { it.status == PhotoStatus.PENDING }
        2 -> photos.filter { it.status == PhotoStatus.UPLOADING }
        3 -> photos.filter { it.status == PhotoStatus.UPLOADED }
        4 -> photos.filter { it.status == PhotoStatus.FAILED }
        else -> photos
    }

    // Group photos by date + 30min bucket
    val grouped = filteredPhotos.groupBy { photo ->
        val cal = java.util.Calendar.getInstance().apply { timeInMillis = photo.dateTaken }
        val mm = (cal.get(java.util.Calendar.MINUTE) / 30) * 30
        val dateFmt = SimpleDateFormat("MM-dd", Locale.getDefault()).format(Date(photo.dateTaken))
        val hour = String.format("%02d:%02d", cal.get(java.util.Calendar.HOUR_OF_DAY), mm)
        "$dateFmt / $hour"
    }

    Column(modifier = Modifier.fillMaxSize()) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(PrimaryGreen)
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = activeLocation?.name ?: "Chua chon dia diem",
                    color = SurfaceWhite,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "Phien chup co day (MTP/OTG)",
                    color = SurfaceWhite.copy(alpha = 0.8f),
                    fontSize = 12.sp
                )
            }
            Surface(
                shape = RoundedCornerShape(4.dp),
                color = SurfaceWhite.copy(alpha = 0.2f)
            ) {
                Text(
                    text = "JPG_HD",
                    color = SurfaceWhite,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                )
            }
        }

        // Connection Card
        ConnectionCard(
            status = connectionStatus,
            cameraModel = cameraModel,
            onRetry = { viewModel.connect() },
            onConnect = { viewModel.connect() }
        )

        // Stats Row
        StatsRow(stats = stats)

        // Action Buttons
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedButton(
                onClick = { /* pause */ },
                modifier = Modifier.weight(1f)
            ) { Text("Tam dung", fontSize = 13.sp) }

            Button(
                onClick = { viewModel.uploadAll() },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
            ) {
                Text(
                    "Upload (${stats.pending + stats.failed})",
                    fontSize = 13.sp
                )
            }

            OutlinedButton(
                onClick = { /* end session */ },
                modifier = Modifier.weight(1f),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = ErrorRed)
            ) { Text("Ket thuc", fontSize = 13.sp) }
        }

        // Filter Tabs
        ScrollableTabRow(
            selectedTabIndex = filterIndex,
            containerColor = SurfaceWhite,
            contentColor = PrimaryGreen,
            edgePadding = 0.dp
        ) {
            val tabLabels = listOf("Tat ca", "Cho", "Dang tai", "Da xong", "Loi")
            tabLabels.forEachIndexed { i, label ->
                Tab(
                    selected = filterIndex == i,
                    onClick = { filterIndex = i },
                    text = { Text(label, fontSize = 13.sp) }
                )
            }
        }

        // Photo Grid
        Box(modifier = Modifier.weight(1f)) {
            LazyVerticalGrid(
                columns = GridCells.Fixed(3),
                modifier = Modifier.fillMaxSize(),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                grouped.forEach { (groupKey, groupPhotos) ->
                    item(span = { GridItemSpan(3) }) {
                        Text(
                            text = "$groupKey / ${groupPhotos.size} anh",
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(Color(0xFFEEEEEE))
                                .padding(horizontal = 12.dp, vertical = 6.dp),
                            fontSize = 12.sp,
                            color = TextSecondary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    items(groupPhotos, key = { it.handle }) { photo ->
                        PhotoCard(
                            photo = photo,
                            isSelected = photo.handle in selectedHandles,
                            multiSelectMode = multiSelectMode,
                            onUpload = { viewModel.uploadPhoto(photo.handle) },
                            onToggleSelect = { viewModel.toggleSelect(photo.handle) }
                        )
                    }
                }
            }

            // Floating bar
            Row(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .background(SurfaceWhite)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedButton(
                    onClick = {
                        multiSelectMode = !multiSelectMode
                        if (!multiSelectMode) viewModel.clearSelection()
                    },
                    modifier = Modifier.weight(1f)
                ) { Text(if (multiSelectMode) "Huy chon" else "Chon nhieu", fontSize = 13.sp) }

                Button(
                    onClick = { viewModel.uploadSelected() },
                    modifier = Modifier.weight(1f),
                    enabled = selectedHandles.isNotEmpty(),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                ) { Text("Tai hang loat (${selectedHandles.size})", fontSize = 13.sp) }
            }
        }
    }
}

@Composable
private fun ConnectionCard(
    status: ConnectionStatus,
    cameraModel: String,
    onRetry: () -> Unit,
    onConnect: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(12.dp),
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            when (status) {
                ConnectionStatus.IDLE -> {
                    Column {
                        Text("Chua ket noi", fontWeight = FontWeight.SemiBold)
                        Text("Cam cap OTG vao may anh", color = TextSecondary, fontSize = 13.sp)
                    }
                    Button(
                        onClick = onConnect,
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                    ) { Text("Ket noi") }
                }
                ConnectionStatus.DETECTING -> {
                    Text("Dang quet thiet bi...")
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                }
                ConnectionStatus.CONNECTING -> {
                    Text("Dang ket noi...")
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
                }
                ConnectionStatus.CONNECTED -> {
                    Column {
                        Text(
                            "Da ket noi",
                            fontWeight = FontWeight.SemiBold,
                            color = StatusUploaded
                        )
                        Text(cameraModel, color = TextSecondary, fontSize = 13.sp)
                    }
                    Icon(
                        Icons.Filled.CheckCircle,
                        contentDescription = null,
                        tint = StatusUploaded,
                        modifier = Modifier.size(28.dp)
                    )
                }
                ConnectionStatus.ERROR -> {
                    Column {
                        Text(
                            "Ket noi that bai",
                            fontWeight = FontWeight.SemiBold,
                            color = ErrorRed
                        )
                    }
                    OutlinedButton(
                        onClick = onRetry,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = ErrorRed)
                    ) { Text("Thu lai") }
                }
            }
        }
    }
}

@Composable
private fun StatsRow(stats: SessionStats) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        StatBox("Nhan duoc", stats.total, Color(0xFF1565C0), Modifier.weight(1f))
        StatBox("Cho/Dang", stats.pending + stats.uploading, StatusPending, Modifier.weight(1f))
        StatBox("Da upload", stats.uploaded, StatusUploaded, Modifier.weight(1f))
        StatBox("Loi", stats.failed, StatusFailed, Modifier.weight(1f))
    }
}

@Composable
private fun StatBox(label: String, count: Int, color: Color, modifier: Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        elevation = CardDefaults.cardElevation(1.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = count.toString(),
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = color
            )
            Text(label, fontSize = 10.sp, color = TextSecondary)
        }
    }
}

@Composable
private fun PhotoCard(
    photo: PhotoItem,
    isSelected: Boolean,
    multiSelectMode: Boolean,
    onUpload: () -> Unit,
    onToggleSelect: () -> Unit
) {
    val statusColor = when (photo.status) {
        PhotoStatus.PENDING -> StatusPending
        PhotoStatus.UPLOADING -> StatusUploading
        PhotoStatus.UPLOADED -> StatusUploaded
        PhotoStatus.FAILED -> StatusFailed
    }
    val statusLabel = when (photo.status) {
        PhotoStatus.PENDING -> "Chua tai"
        PhotoStatus.UPLOADING -> "Dang tai"
        PhotoStatus.UPLOADED -> "Da tai"
        PhotoStatus.FAILED -> "Loi"
    }

    Box(
        modifier = Modifier
            .aspectRatio(1f)
            .background(Color(0xFFEEEEEE))
            .clickable { if (multiSelectMode) onToggleSelect() }
            .then(
                if (isSelected) Modifier.border(2.dp, PrimaryGreen) else Modifier
            )
    ) {
        if (photo.thumbnail != null) {
            Image(
                bitmap = photo.thumbnail.asImageBitmap(),
                contentDescription = photo.filename,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    Icons.Filled.CameraAlt,
                    contentDescription = null,
                    tint = Color(0xFFBBBBBB),
                    modifier = Modifier.size(32.dp)
                )
            }
        }

        // Status badge top-right
        Surface(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(3.dp),
            shape = RoundedCornerShape(3.dp),
            color = statusColor
        ) {
            Text(
                text = statusLabel,
                color = SurfaceWhite,
                fontSize = 8.sp,
                modifier = Modifier.padding(horizontal = 3.dp, vertical = 1.dp)
            )
        }

        // Filename bottom-left
        Text(
            text = "...${photo.filename.takeLast(6)}",
            modifier = Modifier
                .align(Alignment.BottomStart)
                .background(Color.Black.copy(alpha = 0.5f))
                .padding(horizontal = 3.dp, vertical = 1.dp),
            color = SurfaceWhite,
            fontSize = 9.sp,
            maxLines = 1
        )

        // Upload button bottom-right (only if pending/failed)
        if (photo.status == PhotoStatus.PENDING || photo.status == PhotoStatus.FAILED) {
            Surface(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(3.dp)
                    .clickable { onUpload() },
                shape = RoundedCornerShape(3.dp),
                color = PrimaryGreen
            ) {
                Text(
                    text = "Tai len",
                    color = SurfaceWhite,
                    fontSize = 8.sp,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                )
            }
        }

        if (photo.status == PhotoStatus.UPLOADING) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(4.dp)
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = StatusUploading
                )
            }
        }

        // Multiselect checkbox top-left
        if (multiSelectMode) {
            Checkbox(
                checked = isSelected,
                onCheckedChange = { onToggleSelect() },
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .size(24.dp)
            )
        }
    }
}
