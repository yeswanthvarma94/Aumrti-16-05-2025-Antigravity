import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import OfflineBanner from "./components/OfflineBanner.tsx";
import { OfflineSyncProvider } from "./contexts/OfflineSyncContext.tsx";
import "./index.css";

// Register service worker only in production builds.
// Dynamic import keeps the virtual module out of the dev bundle entirely.
if (import.meta.env.PROD) {
  import("virtual:pwa-register").then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onOfflineReady() {
        console.info("[HMS] App ready for offline use (read-only).");
      },
      onRegisteredSW(swUrl, registration) {
        // Check for SW updates every 60 minutes while the app is open.
        if (registration) {
          setInterval(() => registration.update(), 60 * 60 * 1000);
        }
      },
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <OfflineSyncProvider>
      <OfflineBanner />
      <App />
    </OfflineSyncProvider>
  </ErrorBoundary>
);
