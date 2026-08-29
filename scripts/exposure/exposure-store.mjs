import { EXPOSURE_FLAG, EXPOSURE_MAX, MODULE_ID } from "../constants.mjs";

function assertActor(actor, label) {
  if (!(actor instanceof Actor)) {
    throw new TypeError(`${label} precisa ser um Actor do Foundry.`);
  }
}

function sourceKey(sourceActor) {
  return sourceActor.uuid.replaceAll(".", "__");
}

function exposureTriggerKey() {
  const combat = game.combat;
  if (combat?.started) return `${combat.id}:${combat.round}:${combat.turn}`;
  return `free:${foundry.utils.randomID()}`;
}

/**
 * Stores Exposure on the target Actor, separated by the observing rogue UUID.
 * This prevents two rogues from sharing the same reading of one creature.
 */
export class ExposureStore {
  static get(targetActor, sourceActor) {
    assertActor(targetActor, "Alvo");
    assertActor(sourceActor, "Ladino");
    const ledger = targetActor.getFlag(MODULE_ID, EXPOSURE_FLAG) ?? {};
    return Math.clamp(Number(ledger[sourceKey(sourceActor)] ?? 0), 0, EXPOSURE_MAX);
  }

  static async set(targetActor, sourceActor, value) {
    assertActor(targetActor, "Alvo");
    assertActor(sourceActor, "Ladino");
    const next = Math.clamp(Number(value) || 0, 0, EXPOSURE_MAX);
    const key = sourceKey(sourceActor);
    const path = `flags.${MODULE_ID}.${EXPOSURE_FLAG}`;
    if (next === 0) await targetActor.update({ [`${path}.-=${key}`]: null });
    else await targetActor.update({ [`${path}.${key}`]: next });
    Hooks.callAll("novaEraExposureChanged", { targetActor, sourceActor, value: next });
    return next;
  }

  static async add(targetActor, sourceActor, amount = 1) {
    const current = this.get(targetActor, sourceActor);
    const value = await this.set(targetActor, sourceActor, current + amount);
    if (value > current) await sourceActor.setFlag(MODULE_ID, "pointBlindTrigger", exposureTriggerKey());
    return value;
  }

  static async consume(targetActor, sourceActor, amount = 1) {
    const current = this.get(targetActor, sourceActor);
    if (current < amount) {
      ui.notifications.warn(game.i18n.format("NOVAERA.Exposure.NotEnough", { current, amount }));
      return false;
    }
    await this.set(targetActor, sourceActor, current - amount);
    const trigger = exposureTriggerKey();
    await sourceActor.setFlag(MODULE_ID, "pointBlindTrigger", trigger);
    await sourceActor.setFlag(MODULE_ID, "exposureConsumedTurn", trigger);
    return true;
  }

  static async clearAll() {
    const updates = game.actors
      .filter(actor => actor.getFlag(MODULE_ID, EXPOSURE_FLAG))
      .map(actor => actor.unsetFlag(MODULE_ID, EXPOSURE_FLAG));
    await Promise.all(updates);
  }
}
