(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Lotto = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PICK = 6;
  const MAX = 49;
  const SYSTEM_MIN = 7;
  const SYSTEM_MAX = 12;
  const STAKE = 5;
  const PLUS_STAKE = 1;
  const LOTTO_THREE = 35;
  const JACKPOT_POOL_MIN = 3000000;
  const PLUS_TABLE = { 3: 10, 4: 100, 5: 3500, 6: 1000000 };
  const DRAW_DAYS = ["Tue", "Thu", "Sat"];
  const WEEKDAY_PL = {
    Sun: "niedziela",
    Mon: "poniedziałek",
    Tue: "wtorek",
    Wed: "środa",
    Thu: "czwartek",
    Fri: "piątek",
    Sat: "sobota",
  };
  const TIER_BY_HITS = { 6: "I", 5: "II", 4: "III", 3: "IV" };

  function drawNumbers(count, max, rng) {
    const size = count === undefined ? PICK : count;
    const ceiling = max === undefined ? MAX : max;
    const random = rng || Math.random;
    if (size > ceiling) throw new Error("count exceeds max");
    const pool = [];
    for (let n = 1; n <= ceiling; n += 1) pool.push(n);
    for (let i = 0; i < size; i += 1) {
      const span = pool.length - i;
      let offset = Math.floor(random() * span);
      if (offset >= span) offset = span - 1;
      if (offset < 0) offset = 0;
      const j = i + offset;
      const swap = pool[i];
      pool[i] = pool[j];
      pool[j] = swap;
    }
    return pool.slice(0, size).sort(function (a, b) { return a - b; });
  }

  function parseNumbers(input) {
    const raw = String(input == null ? "" : input).trim();
    if (!raw) return { ok: false, error: "Wpisz 6 liczb." };
    const parts = raw.split(/[\s,;/-]+/).filter(Boolean);
    if (parts.length !== PICK) return { ok: false, error: "Potrzeba dokładnie 6 liczb." };
    if (parts.some(function (part) { return !/^[0-9]+$/.test(part); })) {
      return { ok: false, error: "Każda liczba musi być z zakresu 1–49." };
    }
    const numbers = parts.map(function (part) { return Number(part); });
    if (numbers.some(function (n) { return n < 1 || n > MAX; })) {
      return { ok: false, error: "Każda liczba musi być z zakresu 1–49." };
    }
    if (new Set(numbers).size !== PICK) return { ok: false, error: "Liczby nie mogą się powtarzać." };
    numbers.sort(function (a, b) { return a - b; });
    return { ok: true, numbers: numbers };
  }

  function intersect(left, right) {
    const set = new Set(right);
    return left.filter(function (n) { return set.has(n); }).sort(function (a, b) { return a - b; });
  }

  function prizeLotto(hits) {
    if (hits < 3 || hits > 6) return null;
    if (hits === 3) return { hits: 3, tier: "IV", fixed: true, amount: LOTTO_THREE };
    return { hits: hits, tier: TIER_BY_HITS[hits], fixed: false, amount: null };
  }

  function prizePlus(hits) {
    if (hits < 3 || hits > 6) return null;
    return { hits: hits, tier: TIER_BY_HITS[hits], fixed: true, amount: PLUS_TABLE[hits] };
  }

  function combinations(n, k) {
    if (k < 0 || n < 0 || k > n) return 0;
    const choose = k < n - k ? k : n - k;
    let result = 1;
    for (let i = 1; i <= choose; i += 1) {
      result = (result * (n - choose + i)) / i;
    }
    return Math.round(result);
  }

  function lineCount(ticket) {
    const size = ticket.numbers.length;
    if (size === PICK) return 1;
    if (size >= SYSTEM_MIN && size <= SYSTEM_MAX) return combinations(size, PICK);
    return 0;
  }

  function lineHits(picked, matched) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const misses = picked - matched;
    for (let level = 0; level <= PICK; level += 1) {
      counts[level] = combinations(matched, level) * combinations(misses, PICK - level);
    }
    return counts;
  }

  function plusFixedAmount(lines) {
    return lines[3] * PLUS_TABLE[3] + lines[4] * PLUS_TABLE[4] + lines[5] * PLUS_TABLE[5] + lines[6] * PLUS_TABLE[6];
  }

  function scoreSimple(ticket, draw) {
    const lottoHits = intersect(ticket.numbers, draw.lotto);
    const score = {
      system: false,
      lottoHits: lottoHits,
      lotto: prizeLotto(lottoHits.length),
      plusHits: [],
      plus: null,
      plusMissing: false,
    };
    if (ticket.plus) {
      if (!draw.plus) {
        score.plusMissing = true;
      } else {
        score.plusHits = intersect(ticket.numbers, draw.plus);
        score.plus = prizePlus(score.plusHits.length);
      }
    }
    return score;
  }

  function scoreSystem(ticket, draw) {
    const lottoHits = intersect(ticket.numbers, draw.lotto);
    const lottoLines = lineHits(ticket.numbers.length, lottoHits.length);
    const score = {
      system: true,
      lottoHits: lottoHits,
      lottoLines: lottoLines,
      lotto: null,
      plusHits: [],
      plusLines: null,
      plus: null,
      plusMissing: false,
      lottoFixed: lottoLines[3] * LOTTO_THREE,
      plusFixed: 0,
      poolLines: lottoLines[4] + lottoLines[5] + lottoLines[6],
    };
    if (ticket.plus) {
      if (!draw.plus) {
        score.plusMissing = true;
      } else {
        score.plusHits = intersect(ticket.numbers, draw.plus);
        score.plusLines = lineHits(ticket.numbers.length, score.plusHits.length);
        score.plusFixed = plusFixedAmount(score.plusLines);
      }
    }
    return score;
  }

  function scoreTicket(ticket, draw) {
    if (ticket.numbers.length === PICK) return scoreSimple(ticket, draw);
    return scoreSystem(ticket, draw);
  }

  function stakeOf(tickets) {
    return tickets.reduce(function (sum, ticket) {
      const lines = lineCount(ticket);
      return sum + lines * (STAKE + (ticket.plus ? PLUS_STAKE : 0));
    }, 0);
  }

  function fixedTotal(scores) {
    return scores.reduce(function (sum, score) {
      if (typeof score.lottoFixed === "number" || typeof score.plusFixed === "number") {
        return sum + (score.lottoFixed || 0) + (score.plusFixed || 0);
      }
      const lotto = score.lotto && score.lotto.fixed ? score.lotto.amount : 0;
      const plus = score.plus && score.plus.fixed ? score.plus.amount : 0;
      return sum + lotto + plus;
    }, 0);
  }

  function warsawParts(date) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    });
    const parts = {};
    formatter.formatToParts(date).forEach(function (part) {
      if (part.type !== "literal") parts[part.type] = part.value;
    });
    let hour = Number(parts.hour);
    if (hour === 24) hour = 0;
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: hour,
      minute: Number(parts.minute),
      weekday: parts.weekday,
    };
  }

  function weekdayOfCalendar(year, month, day) {
    const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Warsaw",
      weekday: "short",
    }).format(probe);
  }

  function addDays(year, month, day, days) {
    const utc = new Date(Date.UTC(year, month - 1, day + days));
    return {
      year: utc.getUTCFullYear(),
      month: utc.getUTCMonth() + 1,
      day: utc.getUTCDate(),
    };
  }

  function ymdValue(year, month, day) {
    return year * 10000 + month * 100 + day;
  }

  function isRealDate(year, month, day) {
    const utc = new Date(Date.UTC(year, month - 1, day));
    return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
  }

  function nextDraw(now) {
    const wall = warsawParts(now || new Date());
    for (let add = 0; add < 8; add += 1) {
      const date = addDays(wall.year, wall.month, wall.day, add);
      const weekday = weekdayOfCalendar(date.year, date.month, date.day);
      if (DRAW_DAYS.indexOf(weekday) === -1) continue;
      if (add === 0 && wall.hour >= 22) continue;
      return { year: date.year, month: date.month, day: date.day, weekday: weekday };
    }
    throw new Error("no draw found");
  }

  function latestCheckableDate(now) {
    const wall = warsawParts(now || new Date());
    if (wall.hour >= 22) return { year: wall.year, month: wall.month, day: wall.day };
    return addDays(wall.year, wall.month, wall.day, -1);
  }

  function parseIsoDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
    if (!match) return { ok: false, error: "Podaj datę losowania." };
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isRealDate(year, month, day)) return { ok: false, error: "Podaj prawdziwą datę." };
    return { ok: true, year: year, month: month, day: day };
  }

  function describePastDate(iso, now) {
    const parsed = parseIsoDate(iso);
    if (!parsed.ok) return parsed;
    const latest = latestCheckableDate(now || new Date());
    if (ymdValue(parsed.year, parsed.month, parsed.day) > ymdValue(latest.year, latest.month, latest.day)) {
      return { ok: false, error: "To losowanie jeszcze się nie odbyło. Użyj symulacji przyszłego losowania." };
    }
    const weekday = weekdayOfCalendar(parsed.year, parsed.month, parsed.day);
    const drawDay = DRAW_DAYS.indexOf(weekday) !== -1;
    return {
      ok: true,
      year: parsed.year,
      month: parsed.month,
      day: parsed.day,
      weekday: weekday,
      warning: drawDay ? null : "To nie jest zwykły dzień losowania (wtorek, czwartek, sobota).",
    };
  }

  function formatDraw(parts) {
    const weekday = WEEKDAY_PL[parts.weekday] || parts.weekday;
    const day = String(parts.day).padStart(2, "0");
    const month = String(parts.month).padStart(2, "0");
    return weekday + ", " + day + "." + month + "." + parts.year + ", 22:00";
  }

  function toIso(parts) {
    return parts.year + "-" + String(parts.month).padStart(2, "0") + "-" + String(parts.day).padStart(2, "0");
  }

  return {
    PICK: PICK,
    MAX: MAX,
    SYSTEM_MIN: SYSTEM_MIN,
    SYSTEM_MAX: SYSTEM_MAX,
    combinations: combinations,
    lineCount: lineCount,
    lineHits: lineHits,
    STAKE: STAKE,
    PLUS_STAKE: PLUS_STAKE,
    LOTTO_THREE: LOTTO_THREE,
    JACKPOT_POOL_MIN: JACKPOT_POOL_MIN,
    PLUS_TABLE: PLUS_TABLE,
    drawNumbers: drawNumbers,
    parseNumbers: parseNumbers,
    scoreTicket: scoreTicket,
    stakeOf: stakeOf,
    fixedTotal: fixedTotal,
    nextDraw: nextDraw,
    latestCheckableDate: latestCheckableDate,
    describePastDate: describePastDate,
    formatDraw: formatDraw,
    toIso: toIso,
  };
});
