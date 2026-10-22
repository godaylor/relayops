type RecoveryCopy = {
  appName: string;
  title: string;
  description: string;
  refreshPage: string;
};

// Vite inlines this self-contained function before module scripts. Recovery must
// still work when the entry module or one of its imports cannot be downloaded.
export function installStartupRecovery(copy: {
  "en-US": RecoveryCopy;
  "ru-RU": RecoveryCopy;
}) {
  let appReady = false;
  window.addEventListener("relayops:ready", () => {
    appReady = true;
  });

  function showRecovery() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", showRecovery, {
        once: true,
      });
      return;
    }
    if (document.getElementById("startup-recovery")) return;
    let locale = navigator.language.startsWith("ru") ? "ru-RU" : "en-US";
    try {
      locale = localStorage.getItem("relayops.locale") || locale;
    } catch {
      // Storage can be unavailable in restricted browsing contexts.
    }
    const language = locale === "ru-RU" ? "ru-RU" : "en-US";
    const text = copy[language];
    const panel = document.createElement("section");
    panel.id = "startup-recovery";
    panel.lang = language;
    panel.setAttribute("role", "alert");
    panel.setAttribute("aria-labelledby", "startup-recovery-title");
    panel.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center;gap:16px;padding:32px;background:#101222;color:#f3f3ff;font:16px/1.6 system-ui,sans-serif;color-scheme:dark";
    const brand = document.createElement("strong");
    brand.textContent = text.appName;
    brand.style.cssText = "color:#a6acff;letter-spacing:.06em";
    const title = document.createElement("h1");
    title.id = "startup-recovery-title";
    title.textContent = text.title;
    title.style.cssText = "margin:0;font-size:clamp(24px,5vw,36px)";
    const description = document.createElement("p");
    description.textContent = text.description;
    description.style.cssText = "margin:0;max-width:42ch;color:#c8cada";
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text.refreshPage;
    button.style.cssText =
      "justify-self:start;margin-top:8px;padding:12px 20px;border:1px solid #a6acff;border-radius:12px;background:#555bd6;color:#fff;font:inherit;font-weight:600;cursor:pointer";
    // Never reload automatically: another tab or a route may contain a draft.
    button.addEventListener("click", () => window.location.reload());
    panel.append(brand, title, description, button);
    document.body.append(panel);
    button.focus();
  }

  window.addEventListener(
    "error",
    (event) => {
      if (appReady) return;
      const target = event.target;
      if (
        (target instanceof HTMLScriptElement && target.type === "module") ||
        (target instanceof HTMLLinkElement && target.rel === "stylesheet")
      ) {
        showRecovery();
      }
    },
    true,
  );
  window.addEventListener("vite:preloadError", (event) => {
    // Intent preloading may fail while the current screen and its draft are
    // healthy. Let the router handle a requested route's failure locally.
    if (appReady) return;
    event.preventDefault();
    showRecovery();
  });
}
