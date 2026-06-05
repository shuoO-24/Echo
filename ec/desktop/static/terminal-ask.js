/* Echo ec:// ASK — natural-language prompts about your day. */

(function () {
  const PROMPT_EXAMPLES = [
    "How much time did I spend coding today?",
    "What were my top apps?",
    "Summarize my day in a few bullets",
    "What was my longest focus block?",
    "Break down time by project",
  ];

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function formatAnswer(text) {
    return esc(text).replaceAll("\n", "<br>");
  }

  function renderResult(res) {
    if (!res) return "";
    if (res.type === "clear") return "";
    if (res.type === "error") {
      return `<div class="ec-ask-error">✗ ${esc(res.msg)}${
        res.hint ? `<div class="ec-ask-hint">↳ ${esc(res.hint)}</div>` : ""
      }</div>`;
    }
    if (res.type === "loading") {
      return `<div class="ec-ask-answer"><span class="ec-ask-meta">echo ›</span> <span style="color:var(--dim)">thinking…</span></div>`;
    }
    const meta =
      res.source === "llm" ? esc(res.model || "kimi-k2.6") : "local";
    return `<div class="ec-ask-answer">
      <div class="ec-ask-answer-meta"><span style="color:var(--accent)">echo ›</span> <span class="ec-ask-foot">${meta} · ${res.elapsed_ms}ms</span></div>
      <div class="ec-ask-answer-body">${formatAnswer(res.answer || "")}</div>
    </div>`;
  }

  function renderScrollback(entries) {
    return entries
      .map(
        (en) => `<div class="ec-ask-entry">
        <div class="ec-ask-prompt-line"><span class="ec-ask-you">you ›</span><span>${esc(en.prompt)}</span></div>
        ${renderResult(en.res)}</div>`
      )
      .join("");
  }

  function renderConsole(compact, dens) {
    const examples = (compact ? PROMPT_EXAMPLES.slice(0, 3) : PROMPT_EXAMPLES)
      .map(
        (q, i) =>
          `<span class="ec-ask-chip ec-act" data-ask-chip="${i}" title="${esc(q)}">${esc(q)}</span>`
      )
      .join("");
    const scrollMax = compact ? "210px" : "52vh";
    const rows = compact ? 2 : 3;
    return `<div class="ec-ask-console" data-ask-compact="${compact ? "1" : "0"}">
      <div class="ec-ask-panel">
        <div class="ec-panel-head">
          <span class="ec-panel-title">▸ ASK</span>
          <span class="ec-panel-right" data-ask-mode-label>ask · your day</span>
        </div>
        <div class="ec-ask-scroll" data-ask-scroll style="max-height:${scrollMax}">${renderScrollback(
      window.ecAskState.entries
    )}</div>
        <div class="ec-ask-input-row">
          <span class="ec-ask-you">you ›</span>
          <textarea class="ec-ask-input" data-ask-input rows="${rows}" spellcheck="true"
            placeholder="Ask about your day…">${esc(window.ecAskState.input)}</textarea>
          <button type="button" class="ec-ask-send ec-act" data-ask-send>↵</button>
        </div>
        <div class="ec-ask-input-hint">↵ send · shift+↵ newline · ↑↓ history</div>
      </div>
      <div class="ec-ask-chips">
        <span class="ec-ask-chips-label">try</span>${examples}
        <span class="ec-ask-chip ec-act ec-ask-clear" data-ask-clear>clear</span>
      </div>
    </div>`;
  }

  async function runRemote(prompt, date) {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, date }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { type: "error", msg: data.error || res.statusText, hint: data.hint || "" };
    }
    return {
      type: "answer",
      answer: data.answer,
      source: data.source,
      model: data.model,
      elapsed_ms: data.elapsed_ms,
    };
  }

  async function submit(prompt, { date, compact, onUpdate }) {
    const text = (prompt ?? window.ecAskState.input).trim();
    if (!text) return;
    if (text.toLowerCase() === "clear") {
      window.ecAskState.entries = [];
      window.ecAskState.input = "";
      window.ecAskState.histIdx = -1;
      onUpdate();
      return;
    }

    const pending = { prompt: text, res: { type: "loading" } };
    window.ecAskState.entries.push(pending);
    window.ecAskState.hist.push(text);
    window.ecAskState.histIdx = -1;
    window.ecAskState.input = "";
    onUpdate();

    let res;
    try {
      res = await runRemote(text, date);
    } catch (err) {
      res = { type: "error", msg: err.message || String(err) };
    }
    pending.res = res;
    onUpdate(compact);
  }

  function bindConsole(root, { date, dens, compact, onUpdate }) {
    const input = root.querySelector("[data-ask-input]");
    const scroll = root.querySelector("[data-ask-scroll]");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;

    if (input && !input.dataset.bound) {
      input.dataset.bound = "1";
      if (!compact) input.focus();
      input.addEventListener("input", () => {
        window.ecAskState.input = input.value;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submit(input.value, { date, dens, compact, onUpdate });
          return;
        }
        const hist = window.ecAskState.hist;
        if (e.key === "ArrowUp" && !e.shiftKey) {
          e.preventDefault();
          if (!hist.length) return;
          const idx =
            window.ecAskState.histIdx < 0
              ? hist.length - 1
              : Math.max(0, window.ecAskState.histIdx - 1);
          window.ecAskState.histIdx = idx;
          window.ecAskState.input = hist[idx];
          input.value = hist[idx];
        } else if (e.key === "ArrowDown" && !e.shiftKey) {
          e.preventDefault();
          if (window.ecAskState.histIdx < 0) return;
          const idx = window.ecAskState.histIdx + 1;
          if (idx >= hist.length) {
            window.ecAskState.histIdx = -1;
            window.ecAskState.input = "";
            input.value = "";
          } else {
            window.ecAskState.histIdx = idx;
            window.ecAskState.input = hist[idx];
            input.value = hist[idx];
          }
        }
      });
    }

    const send = root.querySelector("[data-ask-send]");
    if (send && !send.dataset.bound) {
      send.dataset.bound = "1";
      send.addEventListener("click", () => {
        const inputEl = root.querySelector("[data-ask-input]");
        submit(inputEl ? inputEl.value : "", { date, dens, compact, onUpdate });
      });
    }

    root.querySelectorAll("[data-ask-chip]").forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = "1";
      el.addEventListener("click", () => {
        const q = PROMPT_EXAMPLES[Number(el.getAttribute("data-ask-chip"))];
        submit(q, { date, dens, compact, onUpdate });
      });
    });

    const clearBtn = root.querySelector("[data-ask-clear]");
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = "1";
      clearBtn.addEventListener("click", () => submit("clear", { date, dens, compact, onUpdate }));
    }
  }

  function updateModeLabels(llmAvailable) {
    const label = llmAvailable ? "kimi-k2.6 · your day" : "local · your day";
    document.querySelectorAll("[data-ask-mode-label]").forEach((el) => {
      el.textContent = label;
    });
  }

  function ensureWelcome() {
    if (window.ecAskState.seeded) return;
    window.ecAskState.seeded = true;
    fetch("/api/ask/status")
      .then((r) => r.json())
      .then((data) => {
        window.ecAskState.llmAvailable = !!data.llm_available;
        updateModeLabels(window.ecAskState.llmAvailable);
      })
      .catch(() => updateModeLabels(false));
  }

  window.ecAskState = window.ecAskState || {
    entries: [],
    hist: [],
    histIdx: -1,
    input: "",
    seeded: false,
    date: "",
    llmAvailable: false,
  };

  window.ecAsk = {
    renderAskHeading: () =>
      `<div class="ec-ask-heading">
        <span class="ec-ask-title">▸ ASK</span>
        <span class="ec-ask-sub">ask about your day · Kimi K2.6 when API key is set</span>
      </div>`,
    renderConsole,
    refreshScrollback(root) {
      const scroll = root.querySelector("[data-ask-scroll]");
      if (!scroll) return;
      scroll.innerHTML = renderScrollback(window.ecAskState.entries);
      scroll.scrollTop = scroll.scrollHeight;
      const input = root.querySelector("[data-ask-input]");
      if (input) input.value = window.ecAskState.input;
    },
    bindConsole,
    ensureWelcome,
  };
})();
