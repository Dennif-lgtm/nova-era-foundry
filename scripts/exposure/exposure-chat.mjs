import { EXPOSURE_MAX } from "../constants.mjs";

export async function postExposureCard({ sourceActor, targetActor, value, reason = "" }) {
  const filled = "●".repeat(value);
  const empty = "○".repeat(EXPOSURE_MAX - value);
  const content = `
    <section class="nova-era exposure-card">
      <header>${game.i18n.localize("NOVAERA.Exposure.Title")}</header>
      <p><strong>${sourceActor.name}</strong> → <strong>${targetActor.name}</strong></p>
      <p class="exposure-pips" aria-label="${value} de ${EXPOSURE_MAX}">${filled}${empty}</p>
      ${reason ? `<p class="reason">${foundry.utils.escapeHTML(reason)}</p>` : ""}
    </section>`;

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: sourceActor }),
    content
  });
}
