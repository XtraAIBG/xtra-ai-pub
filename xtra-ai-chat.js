// Xtra AI chat widget. Loaded on every page by src/components/ChatWidget.tsx, which passes:
//   data-endpoint  chat API (streams `data: {"text": "..."}` lines)
//   data-booking   free-diagnostic booking page
//   data-email     contact address shown when the chat fails
// The file name starts with "xtra-ai-" so relativize-export.mjs makes its URL page-relative.
(() => {
  const script = document.currentScript;
  const data = (script && script.dataset) || {};
  const ENDPOINT = data.endpoint;
  if (!ENDPOINT) {
    console.error("xtra-ai-chat: missing data-endpoint");
    return;
  }
  const BOOKING = data.booking || "";
  const EMAIL = data.email || "";

  const isEN = (document.documentElement.lang || "").toLowerCase().startsWith("en");

  const T = isEN
    ? {
        title: "Alex · AI assistant",
        greet: "Hello! 👋\n\nI'm **Alex**, the AI assistant of Xtra AI.\n\nIt would be my pleasure to talk with you about growth opportunities for your business!",
        placeholder: "Type your question...",
        send: "Send",
        open: "Open chat",
        close: "Close chat",
        reset: "New conversation",
        teaser: "Hi! 👋 Can I help?",
        prev: "Previous",
        hubLink: "All tips",
        homeLink: "Xtra AI home page",
        ownLink: "Open the page",
        next: "Next",
        tilesLead: "Here you can learn more about this topic:",
        service: "Service",
        privacy: "Messages are answered by AI. Please don't share personal or sensitive data.",
        limit: "We've reached the message limit for this conversation. The quickest next step is a free call with us:",
        // [button label, message sent]; a plain string sends its own label.
        chips: ["I want more customers", "I lose time on routine tasks", "How much does it cost?",
          ["Helpful tips for my business", "What helpful tips do you have for a business like mine?"]],
        chipPage: (t) => "I have a question about “" + t + "”",
        chipPageLabel: "A question about this page",
        teaserClose: "Hide",
        book: "Free diagnostic",
        bookCta: "Book a free diagnostic →",
        error: "Something went wrong. Please try again" + (EMAIL ? " or email " + EMAIL + "." : "."),
      }
    : {
        title: "Алекс · AI асистент",
        greet: "Здравейте! 👋\n\nАз съм **Алекс**, AI асистентът на Xtra AI.\n\nЗа мен ще бъде удоволствие да разговаряме за възможности за развитие на Вашия бизнес!",
        placeholder: "Напишете въпрос...",
        send: "Изпрати",
        open: "Отвори чата",
        close: "Затвори чата",
        reset: "Нов разговор",
        teaser: "Здравейте! 👋 Мога ли да помогна?",
        prev: "Предишна",
        hubLink: "Всички съвети",
        homeLink: "Началната страница на Xtra AI",
        ownLink: "Отворете страницата",
        next: "Следваща",
        tilesLead: "Тук ще разберете повече по темата:",
        service: "Услуга",
        privacy: "Отговорите са от AI. Моля, не споделяйте лични или чувствителни данни.",
        limit: "Достигнахме лимита на съобщения за този разговор. Най-бързата следваща стъпка е безплатен разговор с нас:",
        // [надпис на бутона, изпратен текст]; обикновен текст изпраща самия надпис.
        chips: ["Искам повече клиенти", "Губя време в рутинни задачи", "Колко струва?",
          ["Полезни съвети за бизнеса", "Какви полезни съвети имате за бизнес като моя?"]],
        chipPage: (t) => "Имам въпрос за „" + t + "“",
        chipPageLabel: "Въпрос за тази страница",
        teaserClose: "Скрий",
        book: "Безплатна диагностика",
        bookCta: "Запазете безплатна диагностика →",
        error: "Възникна грешка. Опитайте отново" + (EMAIL ? " или пишете на " + EMAIL + "." : "."),
      };

  // ---- State (per tab; the old "bizgrow-chat-history" key is not carried over) ----
  const STORE_KEY = "xtra-ai-chat-history";
  let history = [];
  try {
    history = JSON.parse(sessionStorage.getItem(STORE_KEY) || "[]");
    if (!Array.isArray(history)) history = [];
  } catch {
    history = [];
  }
  const save = () => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-20)));
    } catch {}
  };
  let busy = false;

  // ---- UI (Shadow DOM keeps site CSS and widget CSS separate) ----
  // Colors follow the @theme tokens in src/app/globals.css (teal, teal-deep, ink, sky, mint).
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: var(--font-body, system-ui), -apple-system, "Segoe UI", Roboto, sans-serif; }
      .fab { position: absolute; right: 0; bottom: 0; width: 56px; height: 56px; border-radius: 50%; border: 0; cursor: pointer;
        background: #2a8178; color: #fff; display: grid; place-items: center;
        box-shadow: 0 18px 40px -18px rgba(23,41,51,.45), 0 4px 14px rgba(23,41,51,.18); transition: background .2s; }
      .fab:hover { background: #1f6a66; }
      .fab svg { width: 26px; height: 26px; }
      .fab:focus-visible, button:focus-visible, textarea:focus-visible, a:focus-visible { outline: 2px solid #256f9e; outline-offset: 3px; }
      .panel { display: none; flex-direction: column; width: min(380px, calc(100vw - 32px));
        height: min(560px, calc(100dvh - 100px)); background: #fff; color: #172933;
        border-radius: 20px; box-shadow: 0 30px 70px -30px rgba(23,41,51,.45), 0 8px 24px rgba(23,41,51,.12);
        overflow: hidden; margin-bottom: 68px; }
      .open .panel { display: flex; }
      .teaser { position: absolute; right: 0; bottom: 68px; display: none; align-items: center; gap: 8px;
        background: #fff; color: #172933; border-radius: 16px 16px 4px 16px; padding: 8px 8px 8px 10px;
        box-shadow: 0 18px 40px -18px rgba(23,41,51,.45), 0 4px 14px rgba(23,41,51,.14); white-space: nowrap; }
      .teaser.on { display: flex; animation: pop .35s ease-out; }
      .open .teaser { display: none; }
      .teaser .t { all: unset; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; }
      .teaser .t img { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
      .teaser .c { background: transparent; border: 0; color: #4f5d63; font-size: 18px; line-height: 1; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
      .teaser .c:hover { background: #eef7fc; }
      @keyframes pop { from { opacity: 0; transform: translateY(6px) scale(.96); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) { .teaser.on { animation: none; } }
      .head { background: #1f6a66; color: #fff; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .head strong { font-size: 15px; font-weight: 700; }
      .nm { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; }
      .nm small { font-size: 12px; opacity: .85; font-weight: 500; }
      .who { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .ava { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex: none;
        border: 2px solid #d5f6eb; background: #d5f6eb; }
      .head a { color: #1f6a66; background: #d5f6eb; text-decoration: none; font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 999px; white-space: nowrap; }
      .head a:hover { background: #fff; }
      .new { background: transparent; border: 0; color: #fff; cursor: pointer; padding: 4px; border-radius: 8px; display: grid; place-items: center; }
      .new:hover { background: rgba(255,255,255,.15); }
      .new:disabled { opacity: .5; cursor: default; }
      .new svg { width: 18px; height: 18px; }
      .x { background: transparent; border: 0; color: #fff; font-size: 22px; line-height: 1; cursor: pointer; padding: 2px 4px; }
      .msgs { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 12px; display: flex; flex-direction: column; gap: 8px; background: #eef7fc; }
      .m { max-width: 85%; padding: 9px 12px; border-radius: 14px; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
      .m a { color: inherit; text-decoration: underline; }
      .tiles { display: flex; flex-direction: column; gap: 8px; max-width: 92%; }
      .tile { display: flex; gap: 10px; align-items: center; background: #fff; border: 1px solid #d6e6ee; border-radius: 14px;
        padding: 8px; color: #172933; text-decoration: none; transition: border-color .2s, box-shadow .2s; }
      .tile:hover { border-color: #2a8178; box-shadow: 0 8px 20px -12px rgba(23,41,51,.35); }
      .tile img { width: 96px; aspect-ratio: 1200 / 630; object-fit: cover; border-radius: 8px; flex: none; background: #d5f6eb; }
      .tile span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .tile small { font-size: 11px; font-weight: 700; color: #2a8178; text-transform: uppercase; letter-spacing: .04em; }
      .tile b { font-size: 13px; line-height: 1.3; font-weight: 700; }
      .tile em { font-style: normal; font-size: 12px; line-height: 1.35; color: #4f5d63;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      /* Two or more tiles: a row of vertical cards scrolled sideways (swipe, trackpad or the arrows in the
         heading row). The next card peeks in and the edges fade, so it is clear there is more. */
      .carousel { max-width: 100%; }
      .tiles-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .cnavs { display: flex; gap: 6px; flex: none; }
      .cnav { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #c7dbe3; background: #fff; color: #1f6a66;
        font-size: 17px; line-height: 1; cursor: pointer; display: grid; place-items: center; padding: 0 0 2px; }
      .cnav:hover:not(:disabled) { background: #d5f6eb; border-color: #2a8178; }
      .cnav:disabled { opacity: .35; cursor: default; }
      .carousel .track { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-behavior: smooth;
        scrollbar-width: none; padding: 2px 2px 6px; overscroll-behavior-x: contain; scroll-padding: 0 2px; }
      .carousel .track::-webkit-scrollbar { display: none; }
      .carousel .track.more-r { -webkit-mask-image: linear-gradient(90deg, #000 85%, transparent); mask-image: linear-gradient(90deg, #000 85%, transparent); }
      .carousel .track.more-l { -webkit-mask-image: linear-gradient(90deg, transparent, #000 15%); mask-image: linear-gradient(90deg, transparent, #000 15%); }
      .carousel .track.more-l.more-r { -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
      .carousel .tile { flex: 0 0 min(78%, 230px); flex-direction: column; align-items: stretch; gap: 0; padding: 0;
        overflow: hidden; scroll-snap-align: start; border-radius: 14px; }
      .carousel .tile img { width: 100%; border-radius: 0; border-bottom: 1px solid #e3eef3; }
      .carousel .tile span { padding: 9px 11px 11px; gap: 3px; }
      .carousel .tile b { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .carousel .tile em { -webkit-line-clamp: 2; }
      .tiles-lead { margin: 2px 0 0 2px; font-size: 12px; font-weight: 700; color: #1f6a66; }
      .bot { max-width: 90%; background: #fff; border: 1px solid #d6e6ee; align-self: flex-start; padding: 10px 13px; }
      .user { background: #2a8178; color: #fff; align-self: flex-end; white-space: pre-wrap; }
      .bot p, .bot ul, .bot ol { margin: 0; }
      .bot > :not(:first-child) { margin-top: 10px; } /* beats ".bot p { margin: 0 }" (0,2,0 > 0,1,1) */
      .bot ul, .bot ol { padding-left: 20px; }
      .bot li + li { margin-top: 4px; }
      .bot li::marker { color: #2a8178; font-weight: 700; }
      .bot strong { font-weight: 700; color: #172933; }
      .bot .h { font-weight: 700; }
      .bot a { color: #1f6a66; }
      .bot a.cta { display: table; margin: 8px 0 6px; background: #2a8178; color: #fff; text-decoration: none;
        font-weight: 600; font-size: 13px; padding: 7px 14px; border-radius: 999px; }
      .bot a.cta:hover { background: #1f6a66; }
      .typing::after { content: "…"; animation: b 1s infinite; }
      @keyframes b { 50% { opacity: .2; } }
      @media (prefers-reduced-motion: reduce) { .typing::after { animation: none; } .fab { transition: none; } }
      form { display: flex; gap: 8px; padding: 10px 10px 4px; background: #fff; }
      .note { margin: 0; padding: 0 12px 8px; background: #fff; font-size: 11px; line-height: 1.35; color: #6b787e; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; max-width: 92%; }
      .chip { border: 1px solid #2a8178; background: #fff; color: #1f6a66; border-radius: 999px; padding: 6px 11px;
        font-size: 13px; font-weight: 600; cursor: pointer; line-height: 1.2; text-align: left; }
      .chip:hover { background: #d5f6eb; }
      .chip.page { background: #1f6a66; color: #fff; border-color: #1f6a66; }
      .chip.page:hover { background: #2a8178; }
      /* Phones: the open chat fills the screen; 16px input text stops iOS from zooming in. */
      @media (max-width: 640px) {
        .open .panel { position: fixed; inset: 0; width: 100vw; height: 100dvh; max-height: none; margin: 0; border-radius: 0; }
        .open .fab, .open .teaser { display: none; }
        textarea { font-size: 16px; height: 44px; }
        .send { min-height: 44px; }
        .m, .chips, .tiles { max-width: 100%; }
      }
      textarea { flex: 1; resize: none; border: 1px solid #c7d6dd; border-radius: 12px; padding: 9px 10px; font-size: 14px; height: 40px; color: #172933; }
      .send { background: #2a8178; color: #fff; border: 0; border-radius: 12px; padding: 0 14px; font-size: 14px; font-weight: 600; cursor: pointer; }
      .send:hover { background: #1f6a66; }
      .send:disabled { opacity: .5; cursor: default; }
    </style>
    <div class="wrap">
      <div class="panel" role="dialog">
        <div class="head">
          <span class="who"><img class="ava" alt="" width="36" height="36" decoding="async"><span class="nm"><strong></strong><small></small></span></span>
          <a target="_blank" rel="noopener"></a>
          <button class="new" type="button"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button class="x" type="button">×</button>
        </div>
        <div class="msgs" aria-live="polite"></div>
        <form>
          <textarea rows="1" maxlength="1000"></textarea>
          <button class="send" type="submit"></button>
        </form>
        <p class="note"></p>
      </div>
      <div class="teaser" role="status"><button class="t" type="button"><img alt="" width="28" height="28"><span></span></button><button class="c" type="button">×</button></div>
      <button class="fab" type="button" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    </div>`;
  document.body.appendChild(host);

  const $ = (s) => root.querySelector(s);
  const wrap = $(".wrap");
  const fab = $(".fab");
  const msgsEl = $(".msgs");
  const form = $("form");
  const input = $("textarea");
  const sendBtn = $(".send");
  const bookLink = $(".head a");

  // Text is set through properties, never interpolated into HTML.
  $(".panel").setAttribute("aria-label", T.title);
  $(".note").textContent = T.privacy;
  // Wheel over the open chat scrolls the messages only, never the page behind it: at the top or
  // bottom of the messages (or over the header and input) the event is swallowed instead of chaining.
  $(".panel").addEventListener(
    "wheel",
    (e) => {
      const el = msgsEl;
      const inMsgs = el.contains(e.target);
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if (!inMsgs || (e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) e.preventDefault();
    },
    { passive: false },
  );
  // "Алекс · AI асистент" → name on top, role underneath (one line each, next to the photo).
  const [who, role = ""] = T.title.split(" · ");
  $(".head strong").textContent = who;
  $(".head small").textContent = role;
  // Alex's photo sits next to this script (public/xtra-ai-aleks.webp), so resolve it from our own URL.
  const ava = $(".ava");
  if (script && script.src) ava.src = new URL("xtra-ai-aleks.webp", script.src).href;
  else ava.remove();
  if (BOOKING) {
    bookLink.href = BOOKING;
    bookLink.textContent = T.book;
  } else {
    bookLink.remove();
  }
  $(".x").setAttribute("aria-label", T.close);
  const newBtn = $(".new");
  newBtn.setAttribute("aria-label", T.reset);
  newBtn.title = T.reset;
  input.placeholder = T.placeholder;
  input.setAttribute("aria-label", T.placeholder);
  sendBtn.textContent = T.send;
  fab.setAttribute("aria-label", T.open);

  // ---- Formatting ----
  // Bot replies support a small Markdown subset: paragraphs, "- " / "1. " lists, "### " headings,
  // **bold**, [text](https://…), bare URLs and emails. Everything is built with createElement and
  // textContent, so model output can never inject HTML; links are limited to http(s) and mailto.
  // BEGIN pure-parser (scripts/chat-format.test.mjs extracts this block)
  function parseBlocks(text) {
    const blocks = [];
    let para = null;
    let list = null;
    for (const raw of String(text).replace(/\r/g, "").split("\n")) {
      const line = raw.trim();
      if (!line) {
        para = null;
        list = null;
        continue;
      }
      let m;
      if ((m = line.match(/^[-*•]\s+(.*)$/)) || (m = line.match(/^(\d+)[.)]\s+(.*)$/))) {
        const type = m.length === 3 ? "ol" : "ul";
        if (!list || list.type !== type) {
          list = { type, items: [] };
          if (type === "ol") list.start = Number(m[1]);
          blocks.push(list);
        }
        list.items.push(m[m.length - 1]);
        para = null;
        continue;
      }
      if (list && /^\s{2,}/.test(raw)) {
        // Indented line under a list item belongs to that item.
        list.items[list.items.length - 1] += "\n" + line;
        continue;
      }
      if ((m = line.match(/^#{1,6}\s+(.*)$/))) {
        blocks.push({ type: "h", text: m[1] });
        para = null;
        list = null;
        continue;
      }
      list = null;
      if (!para) {
        para = { type: "p", lines: [] };
        blocks.push(para);
      }
      para.lines.push(line);
    }
    return blocks;
  }

  const INLINE_RE =
    /\*\*(.+?)\*\*|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|(https?:\/\/[^\s<>"]*[^\s<>".,;:!?)»'])|([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

  function parseInline(text) {
    const out = [];
    let last = 0;
    for (const m of String(text).matchAll(INLINE_RE)) {
      if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
      if (m[1] !== undefined) out.push({ t: "b", v: m[1] });
      else if (m[2] !== undefined) out.push({ t: "a", label: m[2], href: m[3] });
      else if (m[4] !== undefined) out.push({ t: "a", href: m[4] });
      else out.push({ t: "a", label: m[5], href: "mailto:" + m[5] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: "text", v: text.slice(last) });
    return out;
  }

  /**
   * Put a space between a URL and the punctuation the model glues to it
   * ("…/kqKZktoywsgfwTyFA. Ако…" → "…/kqKZktoywsgfwTyFA . Ако…"), so the link never includes it.
   */
  function spaceAfterUrls(text) {
    return String(text).replace(/(https?:\/\/[^\s<>"]*?)([.,;:!?»']+)(?=\s|$)/g, "$1 $2");
  }

  /** Short label for a bare URL: host + path, cut to 40 characters. */
  function shortUrl(href) {
    try {
      const u = new URL(href);
      const s = u.host.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
      return s.length > 40 ? s.slice(0, 39) + "…" : s;
    } catch {
      return href;
    }
  }
  // END pure-parser

  const sameUrl = (a, b) => !!a && !!b && a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

  function appendInline(parent, text) {
    text.split("\n").forEach((line, i) => {
      if (i) parent.appendChild(document.createElement("br"));
      for (const tok of parseInline(line)) {
        if (tok.t === "text") {
          // spaceAfterUrls() split "https://x.bg/." into URL + " ."; glue the punctuation back on.
          const last = parent.lastChild;
          const prevLink = last && last.nodeName === "A";
          // After the booking button (its own line) drop the sentence punctuation that followed the link.
          const v = prevLink && last.classList.contains("cta")
            ? tok.v.replace(/^\s*[.,;:]?\s*/, "")
            : prevLink ? tok.v.replace(/^\s+(?=[.,;:!?»')])/, "") : tok.v;
          parent.appendChild(document.createTextNode(v));
        } else if (tok.t === "b") {
          const s = document.createElement("strong");
          appendInline(s, tok.v);
          parent.appendChild(s);
        } else {
          const a = document.createElement("a");
          a.href = tok.href;
          if (sameUrl(tok.href, BOOKING)) {
            a.className = "cta";
            a.textContent = T.bookCta;
          } else {
            a.textContent = tok.label || shortUrl(tok.href);
          }
          const own = ownPage(tok.href);
          if (own) {
            // Our own pages open in the same tab (on this copy of the site); the chat reopens there.
            a.href = own;
            // A bare link shows the page's name instead of "xtra-ai.com/…".
            if (!tok.label && !a.classList.contains("cta")) a.textContent = ownLabel(own);
          } else if (!tok.href.startsWith("mailto:")) {
            a.target = "_blank";
            a.rel = "noopener";
          }
          parent.appendChild(a);
        }
      }
    });
  }

  function render(el, text) {
    el.textContent = "";
    if (el.classList.contains("user")) {
      // Visitor text stays as typed (white-space: pre-wrap); only links become clickable.
      for (const tok of parseInline(text)) {
        if (tok.t === "a") {
          const a = document.createElement("a");
          a.href = tok.href;
          a.textContent = tok.label || tok.href;
          a.target = "_blank";
          a.rel = "noopener";
          el.appendChild(a);
        } else {
          el.appendChild(document.createTextNode(tok.t === "b" ? "**" + tok.v + "**" : tok.v));
        }
      }
      return;
    }
    for (const b of parseBlocks(spaceAfterUrls(text))) {
      let node;
      if (b.type === "p") {
        node = document.createElement("p");
        appendInline(node, b.lines.join("\n"));
      } else if (b.type === "h") {
        node = document.createElement("p");
        node.className = "h";
        appendInline(node, b.text);
      } else {
        node = document.createElement(b.type);
        if (b.type === "ol" && b.start > 1) node.start = b.start;
        for (const item of b.items) {
          const li = document.createElement("li");
          appendInline(li, item);
          node.appendChild(li);
        }
      }
      el.appendChild(node);
    }
  }
  // ---- Article tiles ----
  // The site publishes its articles (title, path, category, cover) at xtra-ai-chat-context.json, next to
  // this script. When a bot answer links to one of them, a tile with the cover follows the answer.
  const BASE = script && script.src ? new URL(".", script.src) : new URL("/", location.href);
  let articles = null;
  const articlesReady = fetch(new URL("xtra-ai-chat-context.json", BASE))
    .then((r) => (r.ok ? r.json() : { articles: [] }))
    .then((d) => {
      const lang = isEN ? "en" : "bg";
      const pick = (list, kind) => (Array.isArray(list) ? list : []).filter((x) => (x.locale || "bg") === lang).map((x) => ({ ...x, kind }));
      articles = [...pick(d.articles, "article"), ...pick(d.services, "service")];
    })
    .catch(() => (articles = []));
  const norm = (p) => (p.endsWith("/") ? p : p + "/");
  // Root path of a page on this copy of the site (drops the folder the site is served from, if any).
  const sitePath = (pathname) => (pathname.startsWith(BASE.pathname) ? "/" + pathname.slice(BASE.pathname.length) : pathname);

  // A link to one of our own pages (xtra-ai.com, www, or this host) → the same page on the site the
  // visitor is on, so links from the chat keep working locally and on previews. Else null.
  function ownPage(href) {
    let u;
    try { u = new URL(href, BASE); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.host.replace(/^www\./, "");
    if (host !== "xtra-ai.com" && u.host !== location.host) return null;
    return new URL(u.pathname.replace(/^\//, "") + u.search + u.hash, BASE).href;
  }

  function ownLabel(href) {
    let path;
    try { path = norm(sitePath(new URL(href).pathname)); } catch { return T.ownLink; }
    const hit = (articles || []).find((x) => norm(x.path) === path);
    if (hit) return hit.title;
    if (path === "/saveti/" || path === "/en/saveti/") return T.hubLink;
    if (path === "/" || path === "/en/") return T.homeLink;
    return T.ownLink;
  }

  function addTiles(el) {
    if (!articles || !articles.length) return;
    const seen = new Set();
    const found = [];
    el.querySelectorAll("a[href]").forEach((a) => {
      let path;
      try { path = norm(sitePath(new URL(a.getAttribute("href"), BASE).pathname)); } catch { return; }
      // No tile for the page the visitor is already on.
      const art = path === norm(PAGE.path) ? null : articles.find((x) => path === norm(x.path));
      if (art && !seen.has(art.path)) { seen.add(art.path); found.push(art); }
    });
    if (!found.length) return;
    const box = document.createElement("div");
    box.className = "tiles";
    const head = document.createElement("div");
    head.className = "tiles-head";
    const lead = document.createElement("p");
    lead.className = "tiles-lead";
    lead.textContent = T.tilesLead;
    head.appendChild(lead);
    box.appendChild(head);
    const many = found.length > 1;
    let holder = box;
    if (many) {
      box.classList.add("carousel");
      holder = document.createElement("div");
      holder.className = "track";
      box.appendChild(holder);
    }
    for (const art of found.slice(0, 6)) {
      const t = document.createElement("a");
      t.className = "tile";
      t.href = new URL(art.path.replace(/^\//, ""), BASE).href;
      if (art.image) {
        const img = document.createElement("img");
        img.src = new URL(art.image.replace(/^\//, ""), BASE).href;
        img.alt = "";
        img.loading = "lazy";
        t.appendChild(img);
      }
      const txt = document.createElement("span");
      const label = art.kind === "service" ? T.service : art.category;
      if (label) {
        const c = document.createElement("small");
        c.textContent = label;
        txt.appendChild(c);
      }
      const b = document.createElement("b");
      b.textContent = art.title;
      txt.appendChild(b);
      if (art.summary) {
        // What the reader will get from it, from the article's own summary.
        const d = document.createElement("em");
        d.textContent = art.summary;
        txt.appendChild(d);
      }
      t.appendChild(txt);
      holder.appendChild(t);
    }
    if (many) {
      const navs = document.createElement("div");
      navs.className = "cnavs";
      head.appendChild(navs);
      const step = () => (holder.firstElementChild ? holder.firstElementChild.offsetWidth + 10 : holder.clientWidth * 0.8);
      const mk = (label, glyph, dir) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "cnav";
        b.setAttribute("aria-label", label);
        b.textContent = glyph;
        b.addEventListener("click", () => holder.scrollBy({ left: dir * step(), behavior: "smooth" }));
        navs.appendChild(b);
        return b;
      };
      const prev = mk(T.prev, "‹", -1);
      const next = mk(T.next, "›", 1);
      const sync = () => {
        const atStart = holder.scrollLeft <= 2;
        const atEnd = holder.scrollLeft + holder.clientWidth >= holder.scrollWidth - 2;
        prev.disabled = atStart;
        next.disabled = atEnd;
        holder.classList.toggle("more-l", !atStart);
        holder.classList.toggle("more-r", !atEnd);
      };
      holder.addEventListener("scroll", sync, { passive: true });
      requestAnimationFrame(sync);
    }
    el.after(box);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  // ---- Page context (sent with every question so the bot knows where the visitor is) ----
  const PAGE = {
    path: sitePath(location.pathname),
    title: (document.querySelector("h1")?.textContent || document.title).trim().slice(0, 200),
    lang: isEN ? "en" : "bg",
  };
  const onHome = PAGE.path === "/" || PAGE.path === "/en/";

  // ---- Message limit (per visit; the API should rate-limit too) ----
  const MAX_USER_MESSAGES = 30;
  const COUNT_KEY = "xtra-ai-chat-count";
  const userCount = () => {
    try { return Number(sessionStorage.getItem(COUNT_KEY)) || 0; } catch { return 0; }
  };
  const bumpUserCount = () => {
    try { sessionStorage.setItem(COUNT_KEY, String(userCount() + 1)); } catch {}
  };

  // ---- Quick replies under the greeting (only while the conversation is empty) ----
  function clearChips() {
    msgsEl.querySelectorAll(".chips").forEach((c) => c.remove());
  }
  function addChips() {
    if (history.length) return;
    const box = document.createElement("div");
    box.className = "chips";
    const items = T.chips.map((c) => (Array.isArray(c) ? { label: c[0], text: c[1] } : { label: c, text: c }));
    if (!onHome && PAGE.title) items.unshift({ label: T.chipPageLabel, text: T.chipPage(PAGE.title), page: true });
    for (const it of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (it.page ? " page" : "");
      b.textContent = it.label;
      b.addEventListener("click", () => { if (!busy) send(it.text); });
      box.appendChild(b);
    }
    msgsEl.appendChild(box);
  }

  function addMsg(who, text) {
    const el = document.createElement("div");
    el.className = "m " + who;
    render(el, text);
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  addMsg("bot", T.greet);
  const restored = history.map((m) => addMsg(m.role === "user" ? "user" : "bot", m.content));
  addChips();
  articlesReady.then(() =>
    restored.forEach((el, i) => {
      if (!el.classList.contains("bot")) return;
      render(el, history[i].content); // page names for bare links now that the list is loaded
      addTiles(el);
    }),
  );

  // ---- Open / close ----
  // Open state survives page changes in this tab: after following a link from the chat, the next page
  // opens the chat again at the latest message.
  const OPEN_KEY = "xtra-ai-chat-open";
  const setOpen = (v, { focus = true } = {}) => {
    wrap.classList.toggle("open", v);
    fab.setAttribute("aria-expanded", String(v));
    fab.setAttribute("aria-label", v ? T.close : T.open);
    try { v ? sessionStorage.setItem(OPEN_KEY, "1") : sessionStorage.removeItem(OPEN_KEY); } catch {}
    if (v) {
      msgsEl.scrollTop = msgsEl.scrollHeight;
      if (focus) input.focus();
    }
  };
  let wasOpen = false;
  try { wasOpen = sessionStorage.getItem(OPEN_KEY) === "1"; } catch {}
  // No focus on restore: on phones that would pop the keyboard over the page just opened.
  if (wasOpen) setOpen(true, { focus: false });
  fab.addEventListener("click", () => setOpen(!wrap.classList.contains("open")));

  // ---- Teaser bubble ----
  // After TEASER_DELAY on a page, a small "can I help?" bubble appears next to the button: once per
  // visit (sessionStorage), and never when the visitor has already chatted or opened the chat.
  const TEASER_DELAY = 15000;
  const TEASER_KEY = "xtra-ai-chat-teaser";
  const teaser = $(".teaser");
  $(".teaser .t span").textContent = T.teaser;
  const tImg = $(".teaser .t img");
  if (ava.src) tImg.src = ava.src;
  else tImg.remove();
  $(".teaser .c").setAttribute("aria-label", T.teaserClose);
  const teaserSeen = () => {
    try { return sessionStorage.getItem(TEASER_KEY) === "1"; } catch { return false; }
  };
  const hideTeaser = () => {
    teaser.classList.remove("on");
    try { sessionStorage.setItem(TEASER_KEY, "1"); } catch {}
  };
  if (!teaserSeen() && history.length === 0) {
    setTimeout(() => {
      if (wrap.classList.contains("open") || teaserSeen()) return;
      teaser.classList.add("on");
      try { sessionStorage.setItem(TEASER_KEY, "1"); } catch {}
    }, TEASER_DELAY);
  }
  $(".teaser .t").addEventListener("click", () => { hideTeaser(); setOpen(true); });
  $(".teaser .c").addEventListener("click", hideTeaser);
  fab.addEventListener("click", hideTeaser);
  // New conversation: forget the history (also in sessionStorage) and start again from the greeting.
  newBtn.addEventListener("click", () => {
    if (busy) return;
    history = [];
    save();
    msgsEl.replaceChildren();
    addMsg("bot", T.greet);
    addChips();
    input.value = "";
    input.focus();
  });

  $(".x").addEventListener("click", () => {
    setOpen(false);
    fab.focus();
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && wrap.classList.contains("open")) {
      setOpen(false);
      fab.focus();
    }
  });

  // ---- Sending ----
  async function send(text) {
    clearChips();
    if (userCount() >= MAX_USER_MESSAGES) {
      addMsg("user", text);
      addMsg("bot", T.limit + (BOOKING ? "\n\n" + BOOKING : ""));
      return;
    }
    bumpUserCount();
    busy = true;
    sendBtn.disabled = true;
    newBtn.disabled = true;
    history.push({ role: "user", content: text });
    addMsg("user", text);
    const bot = addMsg("bot", "");
    bot.classList.add("typing");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, page: PAGE }),
      });
      if (!res.ok || !res.body) throw new Error("bad response");

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let full = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const ev = JSON.parse(line.slice(5));
            if (typeof ev.text === "string" && ev.text) {
              full += ev.text;
              bot.classList.remove("typing");
              render(bot, full);
              msgsEl.scrollTop = msgsEl.scrollHeight;
            }
          } catch {}
        }
      }
      if (!full) throw new Error("empty reply");
      await articlesReady;
      addTiles(bot);
      history.push({ role: "assistant", content: full });
      save();
    } catch (e) {
      history.pop(); // keep history valid (user/assistant alternation)
      bot.classList.remove("typing");
      render(bot, T.error);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      newBtn.disabled = false;
      input.focus();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    send(text);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
})();
