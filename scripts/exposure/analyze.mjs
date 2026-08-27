import { MODULE_ID } from "../constants.mjs";
import { ExposureStore } from "./exposure-store.mjs";
import { postExposureCard } from "./exposure-chat.mjs";

function isAnalyzeActivity(activity) {
  return activity?.item?.getFlag(MODULE_ID, "contentKey") === "exposicao"
    && activity.name === "Analisar";
}

function targetLevel(actor) {
  const value = actor.type === "character"
    ? actor.system.details?.level
    : actor.system.details?.cr;
  if (typeof value === "string" && value.includes("/")) {
    const [numerator, denominator] = value.split("/").map(Number);
    return denominator ? numerator / denominator : 0;
  }
  return Number(value) || 0;
}

function selectedTarget() {
  const targets = [...game.user.targets];
  if (targets.length !== 1) {
    ui.notifications.warn("Nova Era: selecione exatamente um alvo antes de usar Analisar.");
    return null;
  }
  return targets[0].actor;
}

async function applySuccessfulAnalysis(sourceActor, targetActor, dc, total) {
  const previous = ExposureStore.get(targetActor, sourceActor);
  const value = await ExposureStore.add(targetActor, sourceActor, 1);
  const firstReading = previous === 0
    ? "Primeira leitura: o Mestre revela uma Resistência, Imunidade ou Vulnerabilidade relevante; se não houver, revela essa ausência."
    : "A leitura foi aprofundada.";
  await postExposureCard({
    sourceActor,
    targetActor,
    value,
    reason: `Analisar: ${total} contra CD ${dc} — sucesso. ${firstReading}`
  });
}

async function analyze(activity) {
  const sourceActor = activity.actor;
  const targetActor = selectedTarget();
  if (!sourceActor || !targetActor) return;

  const dc = Math.ceil(10 + targetLevel(targetActor));
  const rolls = await sourceActor.rollSkill({ skill: "inv" });
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  if (!roll) return;

  if (roll.total >= dc) {
    if (game.user.isGM || targetActor.isOwner) {
      await applySuccessfulAnalysis(sourceActor, targetActor, dc, roll.total);
    } else {
      game.socket.emit(`module.${MODULE_ID}`, {
        type: "successfulAnalysis",
        sourceActorUuid: sourceActor.uuid,
        targetActorUuid: targetActor.uuid,
        dc,
        total: roll.total
      });
    }
  } else {
    await postExposureCard({
      sourceActor,
      targetActor,
      value: ExposureStore.get(targetActor, sourceActor),
      reason: `Analisar: ${roll.total} contra CD ${dc} — falha.`
    });
  }
}

async function handleSocket(payload) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  if (payload?.type !== "successfulAnalysis") return;
  const sourceActor = await fromUuid(payload.sourceActorUuid);
  const targetActor = await fromUuid(payload.targetActorUuid);
  if (!sourceActor || !targetActor) return;
  await applySuccessfulAnalysis(sourceActor, targetActor, payload.dc, payload.total);
}

export function registerAnalyzeAutomation() {
  Hooks.on("dnd5e.postUseActivity", activity => {
    if (isAnalyzeActivity(activity)) void analyze(activity);
  });
  game.socket.on(`module.${MODULE_ID}`, payload => void handleSocket(payload));
}
