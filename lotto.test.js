"use strict";

const assert = require("node:assert/strict");
const Lotto = require("./lotto.js");

function zeros() {
  return 0;
}

const parsed = Lotto.parseNumbers("1, 2, 3, 4, 5, 6");
assert.deepEqual(parsed, { ok: true, numbers: [1, 2, 3, 4, 5, 6] });
assert.deepEqual(Lotto.parseNumbers("1-2-3-4-5-6").numbers, [1, 2, 3, 4, 5, 6]);
assert.deepEqual(Lotto.parseNumbers("01 02 03 04 05 06").numbers, [1, 2, 3, 4, 5, 6]);
assert.equal(Lotto.parseNumbers("").ok, false);
assert.equal(Lotto.parseNumbers("1 2 3 4 5").ok, false);
assert.equal(Lotto.parseNumbers("1 2 3 4 5 6 7").ok, false);
assert.equal(Lotto.parseNumbers("0 1 2 3 4 5").ok, false);
assert.equal(Lotto.parseNumbers("1 2 3 4 5 50").ok, false);
assert.equal(Lotto.parseNumbers("1 01 2 3 4 5").ok, false);
assert.equal(Lotto.parseNumbers("1.5 2 3 4 5 6").ok, false);

assert.deepEqual(Lotto.drawNumbers(6, 49, zeros), [1, 2, 3, 4, 5, 6]);
for (let i = 0; i < 200; i += 1) {
  const draw = Lotto.drawNumbers();
  assert.equal(draw.length, 6);
  assert.equal(new Set(draw).size, 6);
  assert.deepEqual(draw, draw.slice().sort(function (a, b) { return a - b; }));
  draw.forEach(function (n) {
    assert.ok(n >= 1 && n <= 49);
  });
}

const ticket = { numbers: [1, 2, 3, 4, 5, 6], plus: true };
const original = ticket.numbers.slice();
const triple = Lotto.scoreTicket(
  { numbers: [1, 2, 3, 4, 5, 6], plus: false },
  { lotto: [1, 2, 3, 10, 11, 12], plus: [1, 2, 3, 4, 5, 6] }
);
assert.deepEqual(triple.lottoHits, [1, 2, 3]);
assert.deepEqual(triple.lotto, { hits: 3, tier: "IV", fixed: true, amount: 35 });
assert.equal(triple.plus, null);
assert.equal(triple.plusMissing, false);

const both = Lotto.scoreTicket(ticket, { lotto: [1, 2, 3, 4, 7, 8], plus: [1, 2, 3, 4, 5, 6] });
assert.equal(both.lotto.fixed, false);
assert.equal(both.lotto.tier, "III");
assert.equal(both.lotto.amount, null);
assert.deepEqual(both.plus, { hits: 6, tier: "I", fixed: true, amount: 1000000 });
assert.deepEqual(ticket.numbers, original);

const missingPlus = Lotto.scoreTicket(ticket, { lotto: [1, 2, 3, 4, 5, 6], plus: null });
assert.equal(missingPlus.plusMissing, true);
assert.equal(missingPlus.lotto.tier, "I");
assert.equal(missingPlus.lotto.fixed, false);

const noWin = Lotto.scoreTicket(
  { numbers: [1, 2, 3, 4, 5, 6], plus: true },
  { lotto: [7, 8, 9, 10, 11, 12], plus: [13, 14, 15, 16, 17, 18] }
);
assert.equal(noWin.lotto, null);
assert.equal(noWin.plus, null);
assert.equal(Lotto.fixedTotal([triple, both, missingPlus, noWin]), 35 + 1000000);

assert.equal(Lotto.stakeOf([
  { numbers: [1, 2, 3, 4, 5, 6], plus: false },
  { numbers: [1, 2, 3, 4, 5, 6], plus: true },
]), 11);

assert.equal(Lotto.combinations(7, 6), 7);
assert.equal(Lotto.combinations(8, 6), 28);
assert.equal(Lotto.combinations(9, 6), 84);
assert.equal(Lotto.combinations(10, 6), 210);
assert.equal(Lotto.combinations(11, 6), 462);
assert.equal(Lotto.combinations(12, 6), 924);
assert.deepEqual(Lotto.lineHits(8, 4).slice(3), [16, 6, 0, 0]);

const system = Lotto.scoreTicket(
  { numbers: [1, 2, 3, 4, 5, 6, 7], plus: true },
  { lotto: [1, 2, 3, 4, 5, 6], plus: [1, 2, 3, 4, 5, 6] }
);
assert.equal(system.system, true);
assert.equal(system.lottoLines[6], 1);
assert.equal(system.lottoLines[5], 6);
assert.equal(system.poolLines, 7);
assert.equal(system.lottoFixed, 0);
assert.equal(system.plusLines[6], 1);
assert.equal(system.plusLines[5], 6);
assert.equal(system.plusFixed, 1000000 + 6 * 3500);
assert.equal(Lotto.lineCount({ numbers: [1, 2, 3, 4, 5, 6, 7] }), 7);
assert.equal(Lotto.stakeOf([{ numbers: [1, 2, 3, 4, 5, 6, 7], plus: false }]), 35);
assert.equal(Lotto.stakeOf([{ numbers: [1, 2, 3, 4, 5, 6, 7], plus: true }]), 42);
assert.equal(Lotto.fixedTotal([system]), 1000000 + 6 * 3500);

const systemFours = Lotto.scoreTicket(
  { numbers: [1, 2, 3, 4, 5, 6, 7, 8], plus: false },
  { lotto: [1, 2, 3, 4, 20, 21], plus: null }
);
assert.equal(systemFours.lottoLines[4], 6);
assert.equal(systemFours.lottoLines[3], 16);
assert.equal(systemFours.lottoFixed, 16 * 35);
assert.equal(systemFours.poolLines, 6);

function at(iso) {
  return new Date(iso);
}

assert.deepEqual(Lotto.nextDraw(at("2026-09-22T19:59:00Z")), {
  year: 2026, month: 9, day: 22, weekday: "Tue",
});
assert.deepEqual(Lotto.nextDraw(at("2026-09-22T20:00:00Z")), {
  year: 2026, month: 9, day: 24, weekday: "Thu",
});
assert.deepEqual(Lotto.nextDraw(at("2026-09-23T10:00:00Z")), {
  year: 2026, month: 9, day: 24, weekday: "Thu",
});
assert.deepEqual(Lotto.nextDraw(at("2026-09-26T21:00:00Z")), {
  year: 2026, month: 9, day: 29, weekday: "Tue",
});
assert.deepEqual(Lotto.nextDraw(at("2026-12-01T20:30:00Z")), {
  year: 2026, month: 12, day: 1, weekday: "Tue",
});
assert.deepEqual(Lotto.nextDraw(at("2026-12-01T21:00:00Z")), {
  year: 2026, month: 12, day: 3, weekday: "Thu",
});
assert.deepEqual(Lotto.nextDraw(at("2026-10-27T20:00:00Z")), {
  year: 2026, month: 10, day: 27, weekday: "Tue",
});
assert.equal(Lotto.formatDraw(Lotto.nextDraw(at("2026-09-22T19:00:00Z"))), "wtorek, 22.09.2026, 22:00");

const now = at("2026-09-22T12:00:00Z");
assert.equal(Lotto.describePastDate("2026-09-19", now).ok, true);
assert.equal(Lotto.describePastDate("2026-09-19", now).warning, null);
assert.equal(Lotto.describePastDate("2026-09-19", now).weekday, "Sat");
assert.match(Lotto.describePastDate("2026-09-21", now).warning, /wtorek/);
assert.equal(Lotto.describePastDate("2026-09-24", now).ok, false);
assert.equal(Lotto.describePastDate("2026-09-22", at("2026-09-22T19:00:00Z")).ok, false);
assert.equal(Lotto.describePastDate("2026-09-22", at("2026-09-22T20:30:00Z")).ok, true);
assert.equal(Lotto.describePastDate("2026-02-31", now).ok, false);
assert.equal(Lotto.describePastDate("", now).ok, false);
assert.equal(Lotto.toIso(Lotto.latestCheckableDate(at("2026-09-22T19:00:00Z"))), "2026-09-21");
assert.equal(Lotto.toIso(Lotto.latestCheckableDate(at("2026-09-22T20:30:00Z"))), "2026-09-22");

console.log("lotto.test.js ok");
