"use strict";

const STORAGE_KEY = "lotto-simulator-tickets-v1";

const money = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const state = {
  pick: [],
  plus: false,
  tickets: loadTickets(),
  mode: "future",
  draw: null,
  formError: "",
  busy: false,
  rngError: "",
  rngErrorWhere: "",
  entropyNote: "",
  source: "anu",
  system: false,
  systemSize: 7,
};

function targetSize() {
  return state.system ? state.systemSize : Lotto.PICK;
}

function fitPick() {
  const limit = targetSize();
  if (state.pick.length > limit) state.pick = state.pick.slice(0, limit);
}

function ticketCount() {
  const field = document.getElementById("random-count");
  const raw = field ? Number(field.value) : 1;
  if (!Number.isInteger(raw) || raw < 1) return 1;
  return raw;
}

function busyLabel() {
  return state.source === "builtin" ? "Losuję…" : "Pobieram liczby…";
}

function plural(n, one, few, many) {
  const teen = n % 100;
  const word = n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (teen < 10 || teen >= 20) ? few : many;
  return n + " " + word;
}

function isTicket(ticket) {
  if (!ticket || typeof ticket.id !== "string" || typeof ticket.plus !== "boolean") return false;
  if (!Array.isArray(ticket.numbers)) return false;
  const size = ticket.numbers.length;
  const allowed = size === Lotto.PICK || (size >= Lotto.SYSTEM_MIN && size <= Lotto.SYSTEM_MAX);
  if (!allowed) return false;
  return ticket.numbers.every(function (n) {
    return Number.isInteger(n) && n >= 1 && n <= Lotto.MAX;
  }) && new Set(ticket.numbers).size === size;
}

function loadTickets() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(isTicket).map(function (ticket) {
      return {
        id: ticket.id,
        plus: ticket.plus,
        numbers: ticket.numbers.slice().sort(function (a, b) { return a - b; }),
      };
    });
  } catch (err) {
    return [];
  }
}

function saveTickets() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tickets));
  } catch (err) {
    /* storage can be unavailable in private mode */
  }
}

function addTicket(numbers, save) {
  state.tickets.push({
    id: crypto.randomUUID(),
    numbers: numbers.slice().sort(function (a, b) { return a - b; }),
    plus: state.plus,
  });
  if (save !== false) saveTickets();
}

function balls(numbers, lottoHits, plusHits) {
  const row = document.createElement("div");
  row.className = "balls";
  numbers.forEach(function (n) {
    const el = document.createElement("span");
    const inLotto = lottoHits.has(n);
    const inPlus = plusHits && plusHits.has(n);
    el.className = "ball" + (inLotto ? " hit" : "") + (!inLotto && inPlus ? " plus hit" : "");
    el.textContent = String(n);
    row.appendChild(el);
  });
  return row;
}

function renderGrid() {
  const grid = document.getElementById("grid");
  if (!grid.childElementCount) {
    for (let n = 1; n <= Lotto.MAX; n += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "num";
      button.dataset.n = String(n);
      button.textContent = String(n);
      button.setAttribute("aria-label", "Liczba " + n);
      grid.appendChild(button);
    }
  }
  const full = state.pick.length >= targetSize();
  Array.from(grid.children).forEach(function (button) {
    const n = Number(button.dataset.n);
    const on = state.pick.indexOf(n) !== -1;
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.disabled = full && !on;
  });
}

function renderTickets() {
  const list = document.getElementById("ticket-list");
  list.replaceChildren();
  if (state.tickets.length === 0) return;
  state.tickets.forEach(function (ticket, index) {
    const row = document.createElement("article");
    row.className = "ticket";
    const head = document.createElement("div");
    head.className = "ticket-head";
    head.textContent = "Zakład " + (index + 1);
    if (ticket.numbers.length > Lotto.PICK) {
      const systemPill = document.createElement("span");
      systemPill.className = "pill system";
      systemPill.textContent = "System " + ticket.numbers.length;
      head.appendChild(systemPill);
    }
    if (ticket.plus) {
      const pill = document.createElement("span");
      pill.className = "pill";
      pill.textContent = "Plus";
      head.appendChild(pill);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "text";
    remove.textContent = "Usuń";
    remove.addEventListener("click", function () {
      state.tickets = state.tickets.filter(function (item) { return item.id !== ticket.id; });
      saveTickets();
      render();
    });
    row.append(head, remove, balls(ticket.numbers, new Set(), null));
    list.appendChild(row);
  });
}

function gameLine(name, hits, prize, missing) {
  if (missing) return name + ": brak liczb losowania.";
  const count = plural(hits.length, "trafienie", "trafienia", "trafień");
  if (!prize) return name + ": " + count + ", brak wygranej.";
  const tier = { I: "I stopień", II: "II stopień", III: "III stopień", IV: "IV stopień" }[prize.tier];
  if (prize.fixed) return name + ": " + count + ", " + tier + ", " + money.format(prize.amount) + ".";
  const pool = prize.hits === 6
    ? "pula min. " + money.format(Lotto.JACKPOT_POOL_MIN) + " do podziału"
    : "kwota z puli";
  return name + ": " + count + ", " + tier + ", " + pool + ".";
}

function drawBlock(title, numbers, plus) {
  const wrap = document.createElement("div");
  wrap.className = "draw-block";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const row = document.createElement("div");
  row.className = "balls";
  numbers.forEach(function (n) {
    const el = document.createElement("span");
    el.className = "ball lg draw" + (plus ? " plus" : "");
    el.textContent = String(n);
    row.appendChild(el);
  });
  wrap.append(heading, row);
  return wrap;
}

function emptyTiers() {
  return { 4: 0, 5: 0, 6: 0 };
}

function addTier(bucket, level) {
  if (level >= 4 && level <= 6) bucket[level] += 1;
}

function tierCounts(rows) {
  const lotto = emptyTiers();
  const plus = emptyTiers();
  rows.forEach(function (row) {
    const score = row.score;
    if (score.system) {
      [4, 5, 6].forEach(function (level) {
        lotto[level] += score.lottoLines[level] || 0;
        if (score.plusLines) plus[level] += score.plusLines[level] || 0;
      });
      return;
    }
    if (score.lotto) addTier(lotto, score.lotto.hits);
    if (score.plus) addTier(plus, score.plus.hits);
  });
  return { lotto: lotto, plus: plus };
}

function tierPhrase(counts) {
  const parts = [];
  if (counts[4]) parts.push(plural(counts[4], "czwórka", "czwórki", "czwórek"));
  if (counts[5]) parts.push(plural(counts[5], "piątka", "piątki", "piątek"));
  if (counts[6]) parts.push(plural(counts[6], "szóstka", "szóstki", "szóstek"));
  return parts.join(", ");
}

function summaryText(rows) {
  if (rows.length === 0) return "Kupon jest pusty, więc nie ma czego sprawdzić.";
  const scores = rows.map(function (row) { return row.score; });
  const fixed = Lotto.fixedTotal(scores);
  const tiers = tierCounts(rows);
  const lottoPhrase = tierPhrase(tiers.lotto);
  const plusPhrase = tierPhrase(tiers.plus);
  const bits = ["Koszt kuponu: " + money.format(Lotto.stakeOf(rows.map(function (row) { return row.ticket; }))) + "."];
  if (!lottoPhrase && !plusPhrase && fixed === 0) {
    bits.push("Brak wygranej.");
    return bits.join(" ");
  }
  if (lottoPhrase) bits.push("Lotto: " + lottoPhrase + ".");
  if (plusPhrase) bits.push("Lotto Plus: " + plusPhrase + ".");
  if (fixed > 0) bits.push("Stałe wygrane: " + money.format(fixed) + ".");
  return bits.join(" ");
}

function systemGameLine(name, hits, lines, fixedFor, missing) {
  if (missing) return name + ": brak liczb losowania.";
  const head = name + ": " + plural(hits.length, "trafienie", "trafienia", "trafień") + " w systemie";
  const parts = [];
  [6, 5, 4, 3].forEach(function (level) {
    const count = lines[level];
    if (!count) return;
    const word = { 6: "szóstka", 5: "piątka", 4: "czwórka", 3: "trójka" }[level];
    if (fixedFor[level] != null) {
      parts.push(count + "× " + word + " " + money.format(fixedFor[level] * count));
    } else {
      const pool = level === 6
        ? "pula min. " + money.format(Lotto.JACKPOT_POOL_MIN)
        : "pula";
      parts.push(count + "× " + word + " (" + pool + ")");
    }
  });
  if (!parts.length) return head + ", brak wygranej.";
  return head + " · " + parts.join(", ") + ".";
}

function resultCard(ticket, score, index) {
  const card = document.createElement("article");
  card.className = "result-ticket";
  const won = score.system
    ? score.lottoFixed > 0 || score.poolLines > 0 || score.plusFixed > 0
    : Boolean(score.lotto || score.plus);
  if (won) card.classList.add("won");
  const title = document.createElement("h3");
  title.textContent = "Zakład " + (index + 1);
  if (ticket.numbers.length > Lotto.PICK) {
    const systemPill = document.createElement("span");
    systemPill.className = "pill system";
    systemPill.textContent = "System " + ticket.numbers.length;
    title.appendChild(document.createTextNode(" "));
    title.appendChild(systemPill);
  }
  if (ticket.plus) {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = "Plus";
    title.appendChild(document.createTextNode(" "));
    title.appendChild(pill);
  }
  const list = document.createElement("ul");
  list.className = "lines";
  if (score.system) {
    const sizeItem = document.createElement("li");
    sizeItem.textContent = plural(Lotto.lineCount(ticket), "zakład", "zakłady", "zakładów") + " w systemie " + ticket.numbers.length + ".";
    list.appendChild(sizeItem);
  }
  const lottoItem = document.createElement("li");
  lottoItem.textContent = score.system
    ? systemGameLine("Lotto", score.lottoHits, score.lottoLines, { 3: Lotto.LOTTO_THREE }, false)
    : gameLine("Lotto", score.lottoHits, score.lotto, false);
  list.appendChild(lottoItem);
  if (ticket.plus) {
    const plusItem = document.createElement("li");
    plusItem.textContent = score.system
      ? systemGameLine("Lotto Plus", score.plusHits, score.plusLines, Lotto.PLUS_TABLE, score.plusMissing)
      : gameLine("Lotto Plus", score.plusHits, score.plus, score.plusMissing);
    list.appendChild(plusItem);
  }
  const plusHits = ticket.plus && !score.plusMissing ? new Set(score.plusHits) : null;
  card.append(title, balls(ticket.numbers, new Set(score.lottoHits), plusHits), list);
  return card;
}

function renderResults() {
  const root = document.getElementById("results");
  root.replaceChildren();
  if (!state.draw) {
    const waiting = document.createElement("p");
    waiting.className = "muted";
    waiting.textContent = "Tu pojawi się symulacja albo wynik, który wpiszesz.";
    root.appendChild(waiting);
    return;
  }

  const banner = document.createElement("p");
  banner.className = "banner " + (state.draw.source === "future" ? "sim" : "past");
  banner.textContent = state.draw.source === "future"
    ? "Symulacja. Źródło liczb: " + (state.draw.entropy || "generator kwantowy") + "."
    : "Wynik wpisany ręcznie.";
  const when = document.createElement("p");
  when.className = "when";
  when.textContent = state.draw.label;
  root.append(banner, when);

  if (state.draw.warning) {
    const warning = document.createElement("p");
    warning.className = "banner warn";
    warning.textContent = state.draw.warning;
    root.appendChild(warning);
  }

  root.appendChild(drawBlock("Lotto", state.draw.lotto, false));
  if (state.draw.plus) root.appendChild(drawBlock("Lotto Plus", state.draw.plus, true));
  else {
    const missing = document.createElement("p");
    missing.className = "muted";
    missing.textContent = "Lotto Plus: nie wpisano liczb tego losowania.";
    root.appendChild(missing);
  }

  const rows = state.tickets.map(function (ticket) {
    return { ticket: ticket, score: Lotto.scoreTicket(ticket, state.draw) };
  });
  const summary = document.createElement("p");
  summary.className = "summary";
  summary.textContent = summaryText(rows);
  root.appendChild(summary);
  rows.forEach(function (row, index) {
    root.appendChild(resultCard(row.ticket, row.score, index));
  });
}

function render() {
  const price = Lotto.STAKE + (state.plus ? Lotto.PLUS_STAKE : 0);
  const lines = state.system ? Lotto.combinations(state.systemSize, Lotto.PICK) : 1;
  const unit = price * lines;
  const batchLabel = money.format(unit * ticketCount());
  const target = targetSize();
  const left = target - state.pick.length;
  const hint = document.getElementById("pick-hint");
  if (state.system) {
    if (left === 0) hint.textContent = "System " + state.systemSize + " · " + plural(lines, "zakład", "zakłady", "zakładów") + ". Dodaj albo popraw zaznaczenie.";
    else if (left === target) hint.textContent = "Zaznacz " + target + " liczb do systemu albo użyj chybił trafił.";
    else hint.textContent = "Wybierz jeszcze " + plural(left, "liczbę", "liczby", "liczb") + " do systemu " + state.systemSize + ".";
  } else if (left === 0) hint.textContent = "Sześć liczb wybranych. Dodaj zakład albo popraw zaznaczenie.";
  else if (left === Lotto.PICK) hint.textContent = "Zaznacz 6 liczb albo użyj chybił trafił.";
  else hint.textContent = "Wybierz jeszcze " + plural(left, "liczbę", "liczby", "liczb") + ".";

  document.getElementById("system").checked = state.system;
  document.getElementById("system-size").value = String(state.systemSize);
  document.getElementById("system-size-label").hidden = !state.system;
  document.getElementById("count-label").textContent = state.system ? "Ile systemów" : "Ile zakładów";
  document.getElementById("plus").checked = state.plus;
  document.getElementById("add-ticket").disabled = state.busy || state.pick.length !== target;
  document.getElementById("add-ticket").textContent = state.system
    ? "Dodaj system · " + money.format(unit)
    : "Dodaj zakład · " + money.format(price);
  document.getElementById("random").disabled = state.busy;
  document.getElementById("random").textContent = state.busy ? busyLabel() : "Chybił trafił · " + batchLabel;
  document.getElementById("clear-pick").disabled = state.pick.length === 0;
  document.getElementById("clear-coupon").disabled = state.busy || state.tickets.length === 0;
  const playedLines = state.tickets.reduce(function (sum, ticket) { return sum + Lotto.lineCount(ticket); }, 0);
  document.getElementById("coupon-meta").textContent = state.tickets.length === 0
    ? "Kupon jest pusty."
    : plural(playedLines, "zakład", "zakłady", "zakładów") + " · " + money.format(Lotto.stakeOf(state.tickets));
  document.getElementById("entropy-note").textContent = state.entropyNote
    ? "Ostatnie losowe liczby: " + state.entropyNote + "."
    : "";
  document.getElementById("rng-error").textContent = state.rngErrorWhere === "ticket" ? state.rngError : "";
  document.getElementById("draw-error").textContent = state.rngErrorWhere === "draw" ? state.rngError : "";
  document.getElementById("next-draw").textContent = "Najbliższe losowanie: " + Lotto.formatDraw(Lotto.nextDraw(new Date())) + ". Przycisk użyje wybranego źródła losowości.";
  document.getElementById("draw-future").disabled = state.busy;
  document.getElementById("draw-future").textContent = state.busy
    ? busyLabel()
    : (state.draw && state.draw.source === "future" ? "Wylosuj ponownie" : "Wylosuj wynik");
  document.getElementById("form-error").textContent = state.formError;
  document.getElementById("past-date").max = Lotto.toIso(Lotto.latestCheckableDate(new Date()));

  document.querySelectorAll("[data-mode]").forEach(function (button) {
    button.setAttribute("aria-pressed", button.dataset.mode === state.mode ? "true" : "false");
  });
  document.getElementById("panel-future").hidden = state.mode !== "future";
  document.getElementById("past-form").hidden = state.mode !== "past";

  renderGrid();
  renderTickets();
  renderResults();
}

function init() {
  const sourceSelect = document.getElementById("entropy-source");
  Quantum.sources.forEach(function (source) {
    const option = document.createElement("option");
    option.value = source.id;
    option.textContent = source.label;
    sourceSelect.appendChild(option);
  });
  sourceSelect.value = state.source;
  sourceSelect.addEventListener("change", function () {
    state.source = sourceSelect.value;
    render();
  });

  document.getElementById("random-count").addEventListener("input", function () {
    render();
  });

  document.getElementById("grid").addEventListener("click", function (event) {
    const button = event.target.closest("button[data-n]");
    if (!button || button.disabled) return;
    const n = Number(button.dataset.n);
    const index = state.pick.indexOf(n);
    if (index >= 0) state.pick.splice(index, 1);
    else if (state.pick.length < targetSize()) state.pick.push(n);
    render();
  });

  document.getElementById("system").addEventListener("change", function (event) {
    state.system = event.target.checked;
    fitPick();
    render();
  });

  document.getElementById("system-size").addEventListener("change", function (event) {
    const size = Number(event.target.value);
    if (size >= Lotto.SYSTEM_MIN && size <= Lotto.SYSTEM_MAX) state.systemSize = size;
    fitPick();
    render();
  });

  document.getElementById("plus").addEventListener("change", function (event) {
    state.plus = event.target.checked;
    render();
  });

  document.getElementById("random").addEventListener("click", function () {
    withQuantum("ticket", function () {
      return drawTickets(ticketCount());
    });
  });

  document.getElementById("add-ticket").addEventListener("click", function () {
    if (state.pick.length !== targetSize()) return;
    addTicket(state.pick);
    state.pick = [];
    render();
  });

  document.getElementById("clear-pick").addEventListener("click", function () {
    state.pick = [];
    render();
  });

  document.getElementById("clear-coupon").addEventListener("click", function () {
    if (state.tickets.length === 0) return;
    if (!window.confirm("Usunąć wszystkie zakłady z kuponu?")) return;
    state.tickets = [];
    saveTickets();
    render();
  });

  document.querySelectorAll("[data-mode]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.mode = button.dataset.mode;
      state.formError = "";
      render();
    });
  });

  document.getElementById("draw-future").addEventListener("click", function () {
    withQuantum("draw", async function () {
      const source = state.source;
      const lotto = await Quantum.draw(Lotto.PICK, Lotto.MAX, source);
      const plus = await Quantum.draw(Lotto.PICK, Lotto.MAX, source);
      state.draw = {
        source: "future",
        label: Lotto.formatDraw(Lotto.nextDraw(new Date())),
        lotto: lotto.numbers,
        plus: plus.numbers,
        warning: null,
        entropy: lotto.source === plus.source ? lotto.source : lotto.source + " · " + plus.source,
      };
    });
  });

  let holdingE = false;
  let holdTimer = 0;

  function typingTarget(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
  }

  function stopHold() {
    holdingE = false;
    window.clearInterval(holdTimer);
  }

  function addOneFromHold() {
    if (!holdingE || state.busy) return;
    withQuantum("ticket", function () {
      return drawTickets(1);
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "e" && event.key !== "E") return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
    if (typingTarget(event.target)) return;
    event.preventDefault();
    holdingE = true;
    addOneFromHold();
    window.clearInterval(holdTimer);
    holdTimer = window.setInterval(addOneFromHold, 420);
  });

  document.addEventListener("keyup", function (event) {
    if (event.key !== "e" && event.key !== "E") return;
    stopHold();
  });
  window.addEventListener("blur", stopHold);

  async function drawTickets(count) {
    const source = state.source;
    let last = "";
    for (let i = 0; i < count; i += 1) {
      const drawn = await Quantum.draw(targetSize(), Lotto.MAX, source);
      addTicket(drawn.numbers, false);
      last = drawn.source;
      if (i % 40 === 39) await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
    saveTickets();
    state.entropyNote = last;
  }

  function withQuantum(where, action) {
    if (state.busy) return;
    state.busy = true;
    state.rngError = "";
    state.rngErrorWhere = "";
    render();
    action().then(function () {
      state.busy = false;
      render();
    }).catch(function (err) {
      state.busy = false;
      state.rngError = err && err.message ? err.message : "Nie udało się pobrać liczb kwantowych.";
      state.rngErrorWhere = where;
      render();
    });
  }

  document.getElementById("past-form").addEventListener("submit", function (event) {
    event.preventDefault();
    const described = Lotto.describePastDate(document.getElementById("past-date").value, new Date());
    if (!described.ok) {
      state.formError = described.error;
      render();
      return;
    }
    const lotto = Lotto.parseNumbers(document.getElementById("past-lotto").value);
    if (!lotto.ok) {
      state.formError = "Lotto: " + lotto.error;
      render();
      return;
    }
    const plusRaw = document.getElementById("past-plus").value.trim();
    let plus = null;
    if (plusRaw) {
      const parsed = Lotto.parseNumbers(plusRaw);
      if (!parsed.ok) {
        state.formError = "Lotto Plus: " + parsed.error;
        render();
        return;
      }
      plus = parsed.numbers;
    }
    state.formError = "";
    state.draw = {
      source: "past",
      label: Lotto.formatDraw(described),
      lotto: lotto.numbers,
      plus: plus,
      warning: described.warning,
    };
    render();
  });

  render();
}

init();
