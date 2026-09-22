(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.Quantum = api.createGenerator(typeof fetch === "function" ? fetch : null);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ANU_URL = "https://qrng.anu.edu.au/API/jsonI.php?length=64&type=uint8";
  const SPLITTER_URL = "https://api.freeuniversesplitter.com/rndnum";
  const NIST_URL = "https://beacon.nist.gov/beacon/2.0/pulse/last";

  const SOURCES = [
    { id: "builtin", label: "Wbudowany" },
    { id: "anu", label: "ANU QRNG" },
    { id: "pool", label: "LfD, CURBy i NIST" },
    { id: "nist", label: "NIST beacon" },
  ];

  function fail(message) {
    const error = new Error(message);
    error.name = "QuantumError";
    return error;
  }

  function hexToBytes(hex) {
    const clean = String(hex || "").trim();
    if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length < 2 || clean.length % 2 !== 0) return [];
    const bytes = [];
    for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.slice(i, i + 2), 16));
    return bytes;
  }

  async function stretch(seed, total, counterStart) {
    const out = [];
    let counter = counterStart;
    let material = seed;
    while (out.length < total) {
      const header = new Uint8Array(4);
      new DataView(header.buffer).setUint32(0, counter);
      const input = new Uint8Array(header.length + material.length);
      input.set(header, 0);
      input.set(material, header.length);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
      for (let i = 0; i < digest.length && out.length < total; i += 1) out.push(digest[i]);
      material = digest;
      counter += 1;
    }
    return { bytes: Uint8Array.from(out), counter: counter };
  }

  async function fromBuiltin() {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    return { name: "Wbudowany", bytes: bytes };
  }

  async function fromAnu(fetchImpl) {
    if (!fetchImpl) throw fail("Ta przeglądarka nie może pobrać liczb z zewnątrz.");
    const response = await fetchImpl(ANU_URL + "&_=" + Date.now(), { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) throw fail("ANU QRNG jest teraz ograniczone.");
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      throw fail("ANU QRNG nie zwróciło liczb.");
    }
    if (!payload || !Array.isArray(payload.data)) throw fail("ANU QRNG nie zwróciło liczb.");
    const clean = [];
    payload.data.forEach(function (n) {
      if (Number.isInteger(n) && n >= 0 && n <= 255) clean.push(n);
    });
    if (clean.length < 8) throw fail("ANU QRNG zwróciło za mało danych.");
    return { name: "ANU QRNG", bytes: Uint8Array.from(clean) };
  }

  function bytesFromDecimal(raw) {
    if (!/^\d+$/.test(raw) || raw === "0") return [];
    const value = BigInt(raw);
    const bits = value.toString(2).length;
    const take = Math.min(6, Math.floor((bits - 1) / 8));
    const out = [];
    let rest = value;
    for (let i = 0; i < take; i += 1) {
      out.push(Number(rest & 255n));
      rest >>= 8n;
    }
    return out;
  }

  async function fromPool(fetchImpl) {
    if (!fetchImpl) throw fail("Ta przeglądarka nie może pobrać liczb z zewnątrz.");
    const requests = [0, 1, 2, 3].map(function (index) {
      return fetchImpl(SPLITTER_URL + "?_=" + Date.now() + "-" + index, { cache: "no-store" })
        .then(function (response) {
          if (!response.ok) throw fail("Pula LfD, CURBy i NIST nie odpowiedziała.");
          return response.text();
        });
    });
    const settled = await Promise.allSettled(requests);
    const collected = [];
    settled.forEach(function (item) {
      if (item.status !== "fulfilled") return;
      bytesFromDecimal(String(item.value).trim()).forEach(function (byte) {
        collected.push(byte);
      });
    });
    if (collected.length < 8) throw fail("Pula LfD, CURBy i NIST zwróciła za mało danych.");
    return { name: "LfD, CURBy i NIST", bytes: Uint8Array.from(collected) };
  }

  async function fromNist(fetchImpl, previous) {
    if (!fetchImpl) throw fail("Ta przeglądarka nie może pobrać liczb z zewnątrz.");
    const response = await fetchImpl(NIST_URL + "?_=" + Date.now(), { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) throw fail("NIST beacon nie zwrócił pulsu.");
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      throw fail("NIST beacon nie zwrócił pulsu.");
    }
    const pulse = payload && (payload.pulse || payload);
    const seed = hexToBytes(pulse && pulse.outputValue);
    if (seed.length < 8) throw fail("NIST beacon nie zwrócił pulsu.");
    const pulseIndex = pulse.pulseIndex;
    if (previous && previous.pulseIndex === pulseIndex) {
      const stretched = await stretch(Uint8Array.from(seed), 64, previous.stretch + 1);
      return {
        name: "NIST beacon",
        bytes: stretched.bytes,
        extra: { pulseIndex: pulseIndex, stretch: stretched.counter },
      };
    }
    return {
      name: "NIST beacon",
      bytes: Uint8Array.from(seed),
      extra: { pulseIndex: pulseIndex, stretch: 0 },
    };
  }

  function createGenerator(fetchImpl) {
    const pools = {};
    SOURCES.forEach(function (source) {
      pools[source.id] = { bytes: new Uint8Array(0), offset: 0, name: source.label, extra: null };
    });

    async function refill(sourceId) {
      const pool = pools[sourceId];
      let got;
      if (sourceId === "builtin") got = await fromBuiltin();
      else if (sourceId === "anu") got = await fromAnu(fetchImpl);
      else if (sourceId === "pool") got = await fromPool(fetchImpl);
      else if (sourceId === "nist") got = await fromNist(fetchImpl, pool.extra);
      else throw fail("Nieznane źródło losowości.");
      pool.bytes = got.bytes;
      pool.offset = 0;
      pool.name = got.name;
      pool.extra = got.extra || pool.extra;
    }

    async function nextBelow(sourceId, span) {
      const pool = pools[sourceId];
      const limit = Math.floor(256 / span) * span;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (pool.offset >= pool.bytes.length) await refill(sourceId);
        const value = pool.bytes[pool.offset];
        pool.offset += 1;
        if (value < limit) return value % span;
      }
      throw fail("Źródło losowe nie dało poprawnej liczby.");
    }

    async function draw(count, max, sourceId) {
      const id = sourceId || "builtin";
      if (!pools[id]) throw fail("Nieznane źródło losowości.");
      const numbers = [];
      const bag = [];
      for (let n = 1; n <= max; n += 1) bag.push(n);
      for (let i = 0; i < count; i += 1) {
        const span = bag.length - i;
        const j = i + await nextBelow(id, span);
        const swap = bag[i];
        bag[i] = bag[j];
        bag[j] = swap;
      }
      bag.slice(0, count).forEach(function (n) { numbers.push(n); });
      numbers.sort(function (a, b) { return a - b; });
      return { numbers: numbers, source: pools[id].name };
    }

    return { draw: draw, sources: SOURCES };
  }

  return {
    createGenerator: createGenerator,
    bytesFromDecimal: bytesFromDecimal,
    hexToBytes: hexToBytes,
    sources: SOURCES,
  };
});
