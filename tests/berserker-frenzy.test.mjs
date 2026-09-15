import test from "node:test";
import assert from "node:assert/strict";
import { MODULE_ID } from "../scripts/constants.mjs";
import { bloodState, gainBlood, registerBerserkerAutomation } from "../scripts/berserker/core-automation.mjs";

Math.clamp ??= (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
globalThis.CONST = { ACTIVE_EFFECT_MODES: { ADD: 2 } };
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async () => ({}) };
globalThis.Hooks = {
  handlers: new Map(),
  on(name, callback) { this.handlers.set(name, [...(this.handlers.get(name) ?? []), callback]); },
  callAll() {}
};
const gm = { id: "gm", active: true, isGM: true };
globalThis.game = { user: gm, users: Object.assign([gm], { activeGM: gm }), combat: null, time: { worldTime: 0 } };

function berserker(name) {
  const effects = [];
  const actor = {
    uuid: `Actor.${name}`, name, isOwner: true, effects,
    items: [{ type: "class", system: { identifier: "berserker-nova-era", levels: 1 }, getFlag: () => null }],
    system: { attributes: { prof: 2 }, abilities: { con: { mod: 2 } } },
    flags: { [MODULE_ID]: {} },
    testUserPermission: () => false,
    getFlag(scope, key) { return this.flags[scope]?.[key]; },
    async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; },
    async createEmbeddedDocuments(type, entries) {
      for (const data of entries) {
        const effect = {
          getFlag(scope, key) { return data.flags?.[scope]?.[key]; },
          async delete() { effects.splice(effects.indexOf(effect), 1); }
        };
        effects.push(effect);
      }
    }
  };
  return actor;
}

registerBerserkerAutomation();
const originalTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalNow = Date.now;
let timeoutCallback;
globalThis.setTimeout = callback => { timeoutCallback = callback; return 1; };
globalThis.clearTimeout = () => {};

test("em combate, 60 segundos reais não encerram o Frenesi antes de 10 rodadas", async () => {
  const actor = berserker("Rodadas"), combat = { id: "combate-1", started: true, round: 1, turn: 0, combatant: { actor }, combatants: [{ actor }] };
  game.combat = combat;
  let currentTime = 1_000_000;
  Date.now = () => currentTime;
  try {
    await gainBlood(actor, 2);
    assert.equal(bloodState(actor).frenzy, true);
    assert.equal(actor.effects.length, 1);
    currentTime += 90_000;
    await timeoutCallback();
    assert.equal(bloodState(actor).points, 2);
    combat.round = 10;
    for (const hook of Hooks.handlers.get("updateCombat")) hook(combat, { round: 10, turn: 0 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(bloodState(actor).frenzy, true);
    combat.round = 11;
    for (const hook of Hooks.handlers.get("updateCombat")) hook(combat, { round: 11, turn: 0 });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(bloodState(actor).points, 0);
    assert.equal(actor.effects.length, 0);
  } finally {
    Date.now = originalNow;
    game.combat = null;
  }
});

test("fora de combate, um minuto real sem violência ainda reduz os PS", async () => {
  const actor = berserker("Relogio");
  game.combat = null;
  let currentTime = 2_000_000;
  Date.now = () => currentTime;
  try {
    await gainBlood(actor, 2);
    currentTime += 61_000;
    await timeoutCallback();
    assert.equal(bloodState(actor).points, 0);
    assert.equal(actor.effects.length, 0);
  } finally {
    Date.now = originalNow;
    globalThis.setTimeout = originalTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
