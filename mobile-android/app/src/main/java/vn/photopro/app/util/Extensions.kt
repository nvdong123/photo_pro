package vn.photopro.app.util

import kotlinx.coroutines.delay

suspend fun <T> retryWithBackoff(
    times: Int = 3,
    initialDelayMs: Long = 1000L,
    block: suspend () -> T
): T {
    var lastException: Exception? = null
    repeat(times) { attempt ->
        try {
            return block()
        } catch (e: Exception) {
            lastException = e
            val delayMs = initialDelayMs * (1L shl attempt) // 1s, 2s, 4s
            delay(delayMs)
        }
    }
    throw lastException ?: IllegalStateException("Retry failed")
}

fun Long.toReadableSize(): String {
    return when {
        this < 1024 -> "$this B"
        this < 1024 * 1024 -> "${this / 1024} KB"
        else -> String.format("%.1f MB", this / (1024.0 * 1024.0))
    }
}

fun String.takeLastFileName(n: Int): String {
    val noExt = this.substringBeforeLast(".")
    return if (noExt.length <= n) this else "...${this.takeLast(n)}"
}
