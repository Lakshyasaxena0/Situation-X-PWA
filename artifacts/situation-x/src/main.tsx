import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Installable app: the service worker (public/sw.js) is registered in the production build only, so
// development is never served from a cache.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {
      /* the site works the same without it */
    });
  });
}

// After a new version goes live, an app screen saved on the device may ask for a file that no longer
// exists. Reload once (the background refresh has by then saved the new screen) instead of staying blank.
window.addEventListener("vite:preloadError", () => {
  try {
    if (window.sessionStorage.getItem("sx_reloaded_for_update")) return;
    window.sessionStorage.setItem("sx_reloaded_for_update", "1");
  } catch {
    /* reload anyway */
  }
  window.location.reload();
});
