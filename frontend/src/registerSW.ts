import { registerSW } from 'virtual:pwa-register';

export const updateSW = registerSW({
  onNeedRefresh() {
    // Notify user that a new version is available.
    // Using a simple confirm so we don't pull in Ant Design here.
    if (window.confirm('Có bản cập nhật mới. Tải lại ngay?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('[PhotoPro PWA] App ready to work offline');
  },
  onRegisteredSW(swUrl, registration) {
    // Poll for updates every 60 s (useful when tab stays open for hours)
    if (registration) {
      setInterval(() => {
        registration.update().catch(() => { /* ignore update check errors */ });
      }, 60_000);
    }
  },
});
