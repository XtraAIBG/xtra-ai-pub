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
        greet: "Hello! I'm Alex, the AI assistant of Xtra AI. How can I help you today?",
        placeholder: "Type your question...",
        send: "Send",
        open: "Open chat",
        close: "Close chat",
        book: "Free diagnostic",
        bookCta: "Book a free diagnostic →",
        error: "Something went wrong. Please try again" + (EMAIL ? " or email " + EMAIL + "." : "."),
      }
    : {
        title: "Алекс · AI асистент",
        greet: "Здравейте! Аз съм Алекс, AI асистентът на Xtra AI. С какво мога да Ви помогна?",
        placeholder: "Напишете въпрос...",
        send: "Изпрати",
        open: "Отвори чата",
        close: "Затвори чата",
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
      .head { background: #1f6a66; color: #fff; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .head strong { font-size: 15px; font-weight: 700; }
      .head a { color: #1f6a66; background: #d5f6eb; text-decoration: none; font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 999px; white-space: nowrap; }
      .head a:hover { background: #fff; }
      .x { background: transparent; border: 0; color: #fff; font-size: 22px; line-height: 1; cursor: pointer; padding: 2px 4px; }
      .msgs { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; background: #eef7fc; }
      .m { max-width: 85%; padding: 9px 12px; border-radius: 14px; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
      .m a { color: inherit; text-decoration: underline; }
      .bot { max-width: 90%; background: #fff; border: 1px solid #d6e6ee; align-self: flex-start; padding: 10px 13px; }
      .user { background: #2a8178; color: #fff; align-self: flex-end; white-space: pre-wrap; }
      .bot p, .bot ul, .bot ol { margin: 0; }
      .bot > * + * { margin-top: 8px; }
      .bot ul, .bot ol { padding-left: 20px; }
      .bot li + li { margin-top: 4px; }
      .bot li::marker { color: #2a8178; font-weight: 700; }
      .bot strong { font-weight: 700; color: #172933; }
      .bot .h { font-weight: 700; }
      .bot a { color: #1f6a66; }
      .bot a.cta { display: inline-block; margin-top: 2px; background: #2a8178; color: #fff; text-decoration: none;
        font-weight: 600; font-size: 13px; padding: 7px 14px; border-radius: 999px; }
      .bot a.cta:hover { background: #1f6a66; }
      .typing::after { content: "…"; animation: b 1s infinite; }
      @keyframes b { 50% { opacity: .2; } }
      @media (prefers-reduced-motion: reduce) { .typing::after { animation: none; } .fab { transition: none; } }
      form { display: flex; gap: 8px; padding: 10px; background: #fff; }
      textarea { flex: 1; resize: none; border: 1px solid #c7d6dd; border-radius: 12px; padding: 9px 10px; font-size: 14px; height: 40px; color: #172933; }
      .send { background: #2a8178; color: #fff; border: 0; border-radius: 12px; padding: 0 14px; font-size: 14px; font-weight: 600; cursor: pointer; }
      .send:hover { background: #1f6a66; }
      .send:disabled { opacity: .5; cursor: default; }
    </style>
    <div class="wrap">
      <div class="panel" role="dialog">
        <div class="head">
          <strong></strong>
          <a target="_blank" rel="noopener"></a>
          <button class="x" type="button">×</button>
        </div>
        <div class="msgs" aria-live="polite"></div>
        <form>
          <textarea rows="1" maxlength="1000"></textarea>
          <button class="send" type="submit"></button>
        </form>
      </div>
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
  $(".head strong").textContent = T.title;
  if (BOOKING) {
    bookLink.href = BOOKING;
    bookLink.textContent = T.book;
  } else {
    bookLink.remove();
  }
  $(".x").setAttribute("aria-label", T.close);
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
          parent.appendChild(document.createTextNode(tok.v));
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
          if (!tok.href.startsWith("mailto:")) {
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
  function addMsg(who, text) {
    const el = document.createElement("div");
    el.className = "m " + who;
    render(el, text);
    msgsEl.appendChild(el);
    msgsEl.scrollTop = msgsEl.scrollHeight;
    return el;
  }

  addMsg("bot", T.greet);
  history.forEach((m) => addMsg(m.role === "user" ? "user" : "bot", m.content));

  // ---- Open / close ----
  const setOpen = (v) => {
    wrap.classList.toggle("open", v);
    fab.setAttribute("aria-expanded", String(v));
    fab.setAttribute("aria-label", v ? T.close : T.open);
    if (v) input.focus();
  };
  fab.addEventListener("click", () => setOpen(!wrap.classList.contains("open")));
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
    busy = true;
    sendBtn.disabled = true;
    history.push({ role: "user", content: text });
    addMsg("user", text);
    const bot = addMsg("bot", "");
    bot.classList.add("typing");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
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
      history.push({ role: "assistant", content: full });
      save();
    } catch (e) {
      history.pop(); // keep history valid (user/assistant alternation)
      bot.classList.remove("typing");
      render(bot, T.error);
    } finally {
      busy = false;
      sendBtn.disabled = false;
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
