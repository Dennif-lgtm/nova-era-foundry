import test from "node:test";
import assert from "node:assert/strict";
import {
  availableConcordances, canPayComposition, expireHeraldTurn, heraldCapacity,
  heraldDuration, heraldOverloadThreshold, normalizeHeraldState, removeComposition,
  resonanceCounts
} from "../scripts/herald/rules.mjs";

const echoes = (...types) => types.map((type, index) => ({ id: `e${index}`, type, expires: 4 }));

test("progressao do armazenamento e duracao do Arauto", () => {
  assert.equal(heraldCapacity(1), 5);
  assert.equal(heraldCapacity(17), 7);
  assert.equal(heraldCapacity(20), 10);
  assert.equal(heraldDuration(10), 2);
  assert.equal(heraldDuration(11), 3);
});

test("limiar de sobrecarga muda nos niveis corretos", () => {
  assert.equal(heraldOverloadThreshold(1), 4);
  assert.equal(heraldOverloadThreshold(11), 5);
  assert.equal(heraldOverloadThreshold(20), Infinity);
});

test("contagem e concordancias reconhecem as tres frequencias", () => {
  const stored = echoes("vida", "equilibrio", "ruptura", "vida");
  assert.deepEqual(resonanceCounts(stored), { vida: 2, equilibrio: 1, ruptura: 1 });
  assert.deepEqual(availableConcordances(stored).sort(), ["er", "ve", "vr"]);
  assert.deepEqual(availableConcordances(echoes("vida", "vida")), []);
});

test("composicoes consomem apenas os ecos exigidos", () => {
  const stored = echoes("vida", "vida", "vida", "equilibrio", "ruptura");
  assert.equal(canPayComposition(stored, "pura", "vida"), true);
  const pure = removeComposition(stored, "pura", "vida");
  assert.deepEqual(pure.spent.map(entry => entry.type), ["vida", "vida", "vida"]);
  assert.deepEqual(pure.remaining.map(entry => entry.type), ["equilibrio", "ruptura"]);
  assert.equal(canPayComposition(stored, "triade", "vida"), true);
});

test("Harmonia Absoluta reduz o custo sem permitir custo zero", () => {
  const stored = echoes("vida", "vida");
  assert.equal(canPayComposition(stored, "pura", "vida", 1), true);
  assert.equal(removeComposition(stored, "pura", "vida", 1).spent.length, 2);
  assert.equal(removeComposition(echoes("vida"), "modulacao", "vida", 1).spent.length, 1);
});

test("normalizacao limita ecos e concordancias pelo nivel", () => {
  const state = normalizeHeraldState({ resonances: echoes("vida", "vida", "vida", "vida", "vida", "vida"), concordances: [{ key: "ve", expires: 2 }, { key: "er", expires: 2 }] }, 12);
  assert.equal(state.resonances.length, 5);
  assert.equal(state.concordances.length, 1);
  assert.equal(normalizeHeraldState({ concordances: [{ key: "ve", expires: 2 }, { key: "er", expires: 2 }] }, 13).concordances.length, 2);
});

test("fim de turno expira ecos individualmente", () => {
  const state = normalizeHeraldState({ turn: 2, resonances: [{ id: "old", type: "vida", expires: 2 }, { id: "new", type: "ruptura", expires: 4 }] }, 5);
  const next = expireHeraldTurn(state, 5);
  assert.equal(next.turn, 3);
  assert.deepEqual(next.resonances.map(entry => entry.id), ["new"]);
});

test("Harmonia Absoluta conserva ecos enquanto sua duracao estiver ativa", () => {
  const state = normalizeHeraldState({ turn: 2, absoluteTurns: 2, resonances: [{ id: "old", type: "equilibrio", expires: 2 }] }, 20);
  const next = expireHeraldTurn(state, 20);
  assert.equal(next.absoluteTurns, 1);
  assert.equal(next.resonances.length, 1);
});
