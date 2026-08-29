import { MODULE_ID } from "../constants.mjs";
import { requestSneakAttack } from "../exposure/sneak-attack.mjs";
import { requestTestBlade, useBlindSpot, useDecipheredStrike } from "./base-features.mjs";
import { useCalculatedEvasion, useFatalFlaw, useFirstImpression, useNoticedError } from "./advanced-base-features.mjs";

function selectedActor() {
  const controlled = canvas.tokens?.controlled ?? [];
  return controlled.length === 1 ? controlled[0].actor : game.user.character;
}

function selectedTarget() {
  const targets = [...game.user.targets];
  return targets.length === 1 ? targets[0].actor : null;
}

async function analyze() {
  const actor = selectedActor();
  const exposure = actor?.items?.find(item => item.getFlag(MODULE_ID, "contentKey") === "exposicao");
  const activity = exposure?.system.activities?.find(entry => entry.name === "Analisar");
  if (!activity) return ui.notifications.warn("Nova Era: atividade Analisar não encontrada na habilidade Exposição.");
  await activity.use();
}

export const baseMacroApi = {
  analyze,
  sneakAttack: () => requestSneakAttack(selectedActor(), selectedTarget()),
  precisePiercing: () => requestSneakAttack(selectedActor(), selectedTarget(), "perfuracao-precisa"),
  breakRhythm: () => requestSneakAttack(selectedActor(), selectedTarget(), "quebra-ritmo"),
  cutStride: () => requestSneakAttack(selectedActor(), selectedTarget(), "corte-passo"),
  testBlade: () => requestTestBlade(selectedActor(), selectedTarget()),
  blindSpotHide: () => useBlindSpot(selectedActor(), "hide"),
  blindSpotDisengage: () => useBlindSpot(selectedActor(), "disengage"),
  evasion: () => useCalculatedEvasion(selectedActor(), selectedTarget()),
  decipheredStrike: () => useDecipheredStrike(selectedActor(), selectedTarget()),
  firstImpression: () => useFirstImpression(selectedActor(), selectedTarget()),
  noticedError: () => useNoticedError(selectedActor(), selectedTarget()),
  fatalFlaw: () => useFatalFlaw(selectedActor(), selectedTarget())
};
