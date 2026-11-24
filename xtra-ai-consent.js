// Xtra AI cookie consent banner. Loaded on every page by src/components/ConsentBanner.tsx, which passes:
//   data-privacy  privacy policy page, relative to the site root ("privacy/" or "en/privacy/")
// The consent logic (Google Consent Mode, loading GA only after "Accept") lives in
// src/components/Analytics.tsx and is reached through window.xtraConsent.
// The banner shows until the visitor chooses. Any element with [data-consent-open] (the footer link
// "Cookie settings") opens it again, so the choice can be changed or withdrawn at any time.
// The file name starts with "xtra-ai-" so relativize-export.mjs makes its URL page-relative.
(() => {
  const script = document.currentScript;
  const api = window.xtraConsent;
  if (!api) return; // no consent logic on this page (analytics off)

  const isEN = (document.documentElement.lang || "").toLowerCase().startsWith("en");
  const T = isEN
    ? {
        label: "Cookie consent",
        text: "We use Google Analytics cookies to understand how the website is used. We turn them on only if you agree.",
        privacy: "Privacy policy",
        accept: "Accept",
        decline: "Decline",
      }
    : {
        label: "Съгласие за бисквитки",
        text: "Използваме бисквитки на Google Analytics, за да разберем как се използва сайтът. Включваме ги само ако се съгласите.",
        privacy: "Политика за поверителност",
        accept: "Приемам",
        decline: "Отказвам",
      };

  const base = script && script.src ? new URL(".", script.src) : new URL("/", location.href);
  const privacyHref = new URL((script && script.dataset.privacy) || "privacy/", base).href;

  let host = null;

  function close() {
    if (host) host.remove();
    host = null;
  }

  function choose(value) {
    api.set(value);
    close();
  }

  function open() {
    if (host) return;
    host = document.createElement("div");
    // Above the chat widget (2147483000), so the choice is made first.
    host.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483600;pointer-events:none;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .box { pointer-events: auto; box-sizing: border-box; max-width: 440px; padding: 18px 18px 16px;
          background: #ffffff; color: #1f2933; border: 1px solid rgba(22,36,48,.12); border-radius: 18px;
          box-shadow: 0 12px 40px rgba(22,36,48,.18); font: 15px/1.5 Manrope, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
        p { margin: 0; }
        a { color: #1f7a6c; text-decoration: underline; text-underline-offset: 3px; }
        a:focus-visible, button:focus-visible { outline: 2px solid #2a8a7a; outline-offset: 2px; }
        .row { display: flex; gap: 10px; margin-top: 14px; }
        button { flex: 1; cursor: pointer; font-family: inherit; font-size: 15px; font-weight: 600; line-height: 1; padding: 12px 14px;
          border-radius: 999px; border: 1px solid #1d4462; }
        .accept { background: #1d4462; color: #fff; }
        .decline { background: #fff; color: #1d4462; }
        button:hover { filter: brightness(1.08); }
      </style>
      <div class="box" role="dialog" aria-live="polite" aria-label="${T.label}">
        <p>${T.text} <a href="${privacyHref}">${T.privacy}</a></p>
        <div class="row">
          <button type="button" class="decline">${T.decline}</button>
          <button type="button" class="accept">${T.accept}</button>
        </div>
      </div>`;
    root.querySelector(".accept").addEventListener("click", () => choose("granted"));
    root.querySelector(".decline").addEventListener("click", () => choose("denied"));
    document.body.appendChild(host);
  }

  document.addEventListener("click", (e) => {
    const trigger = e.target instanceof Element && e.target.closest("[data-consent-open]");
    if (!trigger) return;
    e.preventDefault();
    open();
  });

  const current = api.get();
  if (current !== "granted" && current !== "denied") open();
})();
