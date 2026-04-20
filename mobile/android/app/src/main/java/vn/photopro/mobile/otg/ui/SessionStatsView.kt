package vn.photopro.mobile.otg.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import vn.photopro.mobile.otg.OTGViewModel

@Composable
fun SessionStatsView(viewModel: OTGViewModel) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .background(Color.White, RoundedCornerShape(12.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        StatItem(label = "Nhận được", value = viewModel.totalCount, color = Color(0xFF1E293B))
        StatItem(label = "Chờ", value = viewModel.pendingCount, color = Color(0xFF64748B))
        StatItem(label = "Đang", value = viewModel.uploadingCount, color = Color(0xFF2563EB))
        StatItem(label = "Đã upload", value = viewModel.uploadedCount, color = Color(0xFF166534))
        StatItem(label = "Lỗi", value = viewModel.failedCount, color = Color(0xFFB91C1C))
    }
}

@Composable
private fun StatItem(label: String, value: Int, color: Color) {
    Column {
        Text(text = value.toString(), fontWeight = FontWeight.Bold, color = color)
        Text(text = label, color = Color(0xFF64748B))
    }
}
