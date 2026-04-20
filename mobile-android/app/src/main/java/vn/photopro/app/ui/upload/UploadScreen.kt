package vn.photopro.app.ui.upload

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddPhotoAlternate
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import vn.photopro.app.ui.theme.AccentGreen
import vn.photopro.app.ui.theme.ErrorRed
import vn.photopro.app.ui.theme.PrimaryGreen
import vn.photopro.app.ui.theme.StatusUploaded
import vn.photopro.app.ui.theme.StatusUploading
import vn.photopro.app.ui.theme.SurfaceWhite
import vn.photopro.app.ui.theme.TextSecondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UploadScreen(viewModel: UploadViewModel = hiltViewModel()) {
    val uploadItems by viewModel.uploadItems.collectAsStateWithLifecycle()
    val locations by viewModel.locations.collectAsStateWithLifecycle()
    val selectedLocation by viewModel.selectedLocation.collectAsStateWithLifecycle()
    val shootDate by viewModel.shootDate.collectAsStateWithLifecycle()
    val isUploading by viewModel.isUploading.collectAsStateWithLifecycle()

    var locationExpanded by remember { mutableStateOf(false) }

    val imagePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris: List<Uri> ->
        if (uris.isNotEmpty()) viewModel.setFiles(uris)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFFF5F5F0))
    ) {
        // Header
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(PrimaryGreen)
                .padding(horizontal = 16.dp, vertical = 12.dp)
        ) {
            Text(
                "Tai anh len",
                color = SurfaceWhite,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold
            )
        }

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Config card
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
                    elevation = CardDefaults.cardElevation(2.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Location picker
                        ExposedDropdownMenuBox(
                            expanded = locationExpanded,
                            onExpandedChange = { locationExpanded = it }
                        ) {
                            OutlinedTextField(
                                value = selectedLocation?.name ?: "Chon dia diem...",
                                onValueChange = {},
                                readOnly = true,
                                label = { Text("Dia diem") },
                                trailingIcon = {
                                    ExposedDropdownMenuDefaults.TrailingIcon(expanded = locationExpanded)
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .menuAnchor()
                            )
                            ExposedDropdownMenu(
                                expanded = locationExpanded,
                                onDismissRequest = { locationExpanded = false }
                            ) {
                                locations.forEach { loc ->
                                    DropdownMenuItem(
                                        text = { Text(loc.name) },
                                        onClick = {
                                            viewModel.selectLocation(loc)
                                            locationExpanded = false
                                        }
                                    )
                                }
                            }
                        }

                        // Shoot date
                        OutlinedTextField(
                            value = shootDate,
                            onValueChange = { viewModel.setShootDate(it) },
                            label = { Text("Ngay chup (YYYY-MM-DD)") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                    }
                }
            }

            // File picker button
            item {
                OutlinedButton(
                    onClick = { imagePicker.launch("image/*") },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(
                        Icons.Filled.AddPhotoAlternate,
                        contentDescription = null,
                        modifier = Modifier.padding(end = 8.dp)
                    )
                    Text("Chon anh tu thu vien (${uploadItems.size} anh)")
                }
            }

            // Upload controls
            if (uploadItems.isNotEmpty()) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (isUploading) {
                            OutlinedButton(
                                onClick = { viewModel.cancelUpload() },
                                modifier = Modifier.weight(1f),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = ErrorRed)
                            ) {
                                Icon(Icons.Filled.Close, contentDescription = null)
                                Text("  Huy")
                            }
                        } else {
                            Button(
                                onClick = { viewModel.startUpload() },
                                modifier = Modifier.weight(1f),
                                enabled = selectedLocation != null,
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                            ) {
                                Text("Bat dau tai len")
                            }
                            if (uploadItems.any { it.status == UploadItemStatus.FAILED }) {
                                OutlinedButton(
                                    onClick = { viewModel.retryFailed() },
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Filled.Refresh, contentDescription = null)
                                    Text("  Thu lai")
                                }
                            }
                        }
                    }
                }

                // File list
                items(uploadItems, key = { it.id }) { item ->
                    UploadItemRow(item = item)
                }
            }
        }
    }
}

@Composable
private fun UploadItemRow(item: UploadItem) {
    val statusColor = when (item.status) {
        UploadItemStatus.WAITING -> TextSecondary
        UploadItemStatus.UPLOADING -> StatusUploading
        UploadItemStatus.DONE -> StatusUploaded
        UploadItemStatus.FAILED -> ErrorRed
    }
    val statusText = when (item.status) {
        UploadItemStatus.WAITING -> "Cho"
        UploadItemStatus.UPLOADING -> "Dang tai ${(item.progress * 100).toInt()}%"
        UploadItemStatus.DONE -> "Xong"
        UploadItemStatus.FAILED -> "Loi: ${item.errorMessage ?: ""}"
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        elevation = CardDefaults.cardElevation(1.dp)
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = item.filename,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 13.sp
                )
                when (item.status) {
                    UploadItemStatus.UPLOADING -> CircularProgressIndicator(
                        modifier = Modifier
                            .padding(start = 8.dp)
                            .size(18.dp),
                        strokeWidth = 2.dp,
                        color = StatusUploading
                    )
                    UploadItemStatus.DONE -> Icon(
                        Icons.Filled.Check,
                        contentDescription = null,
                        tint = StatusUploaded
                    )
                    UploadItemStatus.FAILED -> Icon(
                        Icons.Filled.Close,
                        contentDescription = null,
                        tint = ErrorRed
                    )
                    else -> {}
                }
            }
            Text(statusText, color = statusColor, fontSize = 12.sp)
            if (item.status == UploadItemStatus.UPLOADING) {
                Spacer(Modifier.height(4.dp))
                LinearProgressIndicator(
                    progress = item.progress,
                    modifier = Modifier.fillMaxWidth(),
                    color = StatusUploading
                )
            }
        }
    }
}
