package vn.photopro.app.ui.ftp

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import vn.photopro.app.data.model.FTPCredentials
import vn.photopro.app.data.model.LocationTag
import vn.photopro.app.ui.theme.AccentGreen
import vn.photopro.app.ui.theme.PrimaryGreen
import vn.photopro.app.ui.theme.StatusUploaded
import vn.photopro.app.ui.theme.StatusPending
import vn.photopro.app.ui.theme.SurfaceWhite
import vn.photopro.app.ui.theme.TextSecondary

@Composable
fun FTPScreen(
    onLogout: () -> Unit,
    viewModel: FTPViewModel = hiltViewModel()
) {
    val credentials by viewModel.credentials.collectAsStateWithLifecycle()
    val ftpStatus by viewModel.ftpStatus.collectAsStateWithLifecycle()
    val locations by viewModel.locations.collectAsStateWithLifecycle()
    val activeLocation by viewModel.activeLocation.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            "Cai dat FTP",
            style = androidx.compose.material3.MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )

        // Section 1: FTP credentials
        credentials?.let { creds ->
            FTPCredentialsCard(
                credentials = creds,
                onReset = { viewModel.resetPassword() }
            )
        }

        // Section 2: Active location
        LocationSelectorCard(
            locations = locations,
            activeLocation = activeLocation,
            onSelect = { viewModel.setActiveLocation(it.id) }
        )

        // Section 3: FTP status
        FTPStatusCard(
            connected = ftpStatus?.connected == true,
            clientIp = ftpStatus?.client_ip
        )

        // Section 4: Setup instructions
        credentials?.let { creds ->
            SetupGuideCard(credentials = creds)
        }

        // Logout
        Spacer(Modifier.height(8.dp))
        TextButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(Icons.Filled.Logout, contentDescription = null, tint = Color.Red)
            Text("  Dang xuat", color = Color.Red)
        }
    }
}

@Composable
private fun FTPCredentialsCard(credentials: FTPCredentials, onReset: () -> Unit) {
    val clipboard = LocalClipboardManager.current
    var passwordVisible by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Thong tin ket noi FTP", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Divider()

            CopyableField("Server (Host)", credentials.host,
                onCopy = { clipboard.setText(AnnotatedString(credentials.host)) })
            CopyableField("Cong (Port)", credentials.port.toString(),
                onCopy = { clipboard.setText(AnnotatedString(credentials.port.toString())) })
            CopyableField("Ten dang nhap", credentials.username,
                onCopy = { clipboard.setText(AnnotatedString(credentials.username)) })

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = credentials.password,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Mat khau") },
                    modifier = Modifier.weight(1f),
                    visualTransformation = if (passwordVisible)
                        VisualTransformation.None else PasswordVisualTransformation(),
                    trailingIcon = {
                        Row {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    if (passwordVisible) Icons.Filled.Visibility
                                    else Icons.Filled.VisibilityOff,
                                    contentDescription = null
                                )
                            }
                            IconButton(onClick = {
                                clipboard.setText(AnnotatedString(credentials.password))
                            }) {
                                Icon(Icons.Filled.ContentCopy, contentDescription = "Sao chep")
                            }
                        }
                    }
                )
            }

            Button(
                onClick = onReset,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
            ) {
                Text("Doi mat khau FTP")
            }
        }
    }
}

@Composable
private fun CopyableField(label: String, value: String, onCopy: () -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        trailingIcon = {
            IconButton(onClick = onCopy) {
                Icon(Icons.Filled.ContentCopy, contentDescription = "Sao chep")
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LocationSelectorCard(
    locations: List<LocationTag>,
    activeLocation: LocationTag?,
    onSelect: (LocationTag) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Tu dong gan dia diem", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Divider()
            Text(
                "Anh chup qua FTP se tu dong gan vao dia diem nay",
                color = TextSecondary,
                fontSize = 13.sp
            )
            ExposedDropdownMenuBox(
                expanded = expanded,
                onExpandedChange = { expanded = it }
            ) {
                OutlinedTextField(
                    value = activeLocation?.name ?: "Chon dia diem...",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Dia diem hien tai") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor()
                )
                ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    locations.forEach { loc ->
                        DropdownMenuItem(
                            text = { Text(loc.name) },
                            onClick = {
                                onSelect(loc)
                                expanded = false
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun FTPStatusCard(connected: Boolean, clientIp: String?) {
    val statusColor = if (connected) StatusUploaded else StatusPending
    val statusText = if (connected) "May anh da ket noi - $clientIp" else "Chua ket noi"

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Trang thai ket noi FTP", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Divider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    shape = CircleShape,
                    color = statusColor,
                    modifier = Modifier
                        .padding(end = 8.dp)
                        .size(10.dp)
                ) {}
                Text(statusText, color = statusColor, fontWeight = FontWeight.Medium)
            }
            Text(
                "Tu dong cap nhat moi 10 giay",
                color = TextSecondary,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
private fun SetupGuideCard(credentials: FTPCredentials) {
    data class CameraGuide(val brand: String, val steps: List<String>)

    val guides = listOf(
        CameraGuide("Canon", listOf(
            "Menu > Wireless comm. settings > FTP transfer settings",
            "Server: ${credentials.host}",
            "Port: ${credentials.port}",
            "Username: ${credentials.username}",
            "Password: (xem o tren)",
            "Transfer mode: Passive"
        )),
        CameraGuide("Sony", listOf(
            "Menu > Network > FTP Transfer Func.",
            "Server hostname: ${credentials.host}",
            "Port: ${credentials.port}",
            "User: ${credentials.username}"
        )),
        CameraGuide("Nikon", listOf(
            "Menu > Connect to FTP server",
            "Server: ${credentials.host}:${credentials.port}",
            "Login: ${credentials.username}"
        )),
        CameraGuide("Fujifilm", listOf(
            "Bluetooth/Connection setting > FTP",
            "Server: ${credentials.host}",
            "Port: ${credentials.port}",
            "User: ${credentials.username}"
        ))
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = SurfaceWhite),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Huong dan cai dat may anh", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
            Divider()

            guides.forEach { guide ->
                var expanded by remember { mutableStateOf(false) }
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { expanded = !expanded }
                        .padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(guide.brand, fontWeight = FontWeight.Medium)
                    Icon(
                        if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                        contentDescription = null
                    )
                }
                if (expanded) {
                    Column(
                        modifier = Modifier.padding(start = 8.dp, bottom = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        guide.steps.forEachIndexed { i, step ->
                            Text("${i + 1}. $step", fontSize = 13.sp, color = TextSecondary)
                        }
                    }
                }
                Divider()
            }
        }
    }
}
