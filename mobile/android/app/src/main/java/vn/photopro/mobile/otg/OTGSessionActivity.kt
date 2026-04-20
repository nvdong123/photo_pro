package vn.photopro.mobile.otg

import android.content.Intent
import android.hardware.usb.UsbManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class OTGSessionActivity : ComponentActivity() {

    private val viewModel: OTGViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val locationId = intent.getStringExtra("locationId") ?: ""
        val locationName = intent.getStringExtra("locationName") ?: ""
        val apiUrl = intent.getStringExtra("apiUrl") ?: ""
        val authToken = intent.getStringExtra("authToken") ?: ""
        val shootDate = intent.getStringExtra("shootDate")
            ?: SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

        viewModel.init(locationId, locationName, apiUrl, authToken, shootDate)

        setContent {
            OTGSessionScreen(
                viewModel = viewModel,
                onBack = {
                    setResult(RESULT_CANCELED)
                    finish()
                },
                onFinish = { result ->
                    val resultIntent = Intent().apply {
                        putExtra("uploadedCount", result.uploadedCount)
                        putExtra("failedCount", result.failedCount)
                    }
                    setResult(RESULT_OK, resultIntent)
                    finish()
                }
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.action == UsbManager.ACTION_USB_DEVICE_ATTACHED) {
            viewModel.onUsbAttached()
        }
    }
}
