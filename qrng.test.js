"use strict";

const assert = require("node:assert/strict");
const { createGenerator, bytesFromDecimal, hexToBytes } = require("./qrng.js");

function response(body, ok) {
  return {
    ok: ok !== false,
    text: function () { return Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)); },
  };
}

assert.deepEqual(bytesFromDecimal("0"), []);
assert.deepEqual(bytesFromDecimal("abc"), []);
assert.ok(bytesFromDecimal("123456789012345").length >= 4);
assert.deepEqual(hexToBytes("00ff"), [0, 255]);

function anuFetch(data) {
  return function (url) {
    if (String(url).indexOf("anu.edu.au") === -1) {
      return Promise.reject(new Error("unexpected " + url));
    }
    return Promise.resolve(response({ success: true, type: "uint8", data: data }));
  };
}

(async function () {
  const zeros = createGenerator(anuFetch(new Array(64).fill(0)));
  const first = await zeros.draw(6, 49, "anu");
  assert.deepEqual(first.numbers, [1, 2, 3, 4, 5, 6]);
  assert.equal(first.source, "ANU QRNG");

  const bytes = [];
  for (let i = 0; i < 64; i += 1) bytes.push((i * 17) % 200);
  const varied = await createGenerator(anuFetch(bytes)).draw(6, 49, "anu");
  assert.equal(new Set(varied.numbers).size, 6);
  varied.numbers.forEach(function (n) { assert.ok(n >= 1 && n <= 49); });

  let anuCalls = 0;
  const anuDown = createGenerator(function (url) {
    anuCalls += 1;
    assert.ok(String(url).indexOf("anu.edu.au") !== -1);
    return Promise.resolve(response("limited", false));
  });
  await assert.rejects(anuDown.draw(6, 49, "anu"), /ANU/);
  assert.equal(anuCalls, 1);

  const pool = createGenerator(function () {
    return Promise.resolve(response("123456789012345"));
  });
  const mixed = await pool.draw(6, 49, "pool");
  assert.equal(mixed.source, "LfD, CURBy i NIST");
  assert.equal(mixed.numbers.length, 6);

  const nist = createGenerator(function () {
    return Promise.resolve(response({
      pulse: { outputValue: "00".repeat(32), pulseIndex: 7 },
    }));
  });
  const beacon = await nist.draw(6, 49, "nist");
  assert.equal(beacon.source, "NIST beacon");
  assert.deepEqual(beacon.numbers, [1, 2, 3, 4, 5, 6]);

  const local = await createGenerator(null).draw(6, 49, "builtin");
  assert.equal(local.source, "Wbudowany");
  assert.equal(new Set(local.numbers).size, 6);

  await assert.rejects(createGenerator(null).draw(6, 49, "nope"), /źródł/);

  console.log("qrng.test.js ok");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
