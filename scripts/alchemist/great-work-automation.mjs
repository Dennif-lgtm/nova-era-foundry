import { MODULE_ID } from "../constants.mjs";
import { alchemistCanOperate, alchemistLevel, alchemistState, hasAlchemistFeature, postAlchemist, spendReagentPoints } from "./core-automation.mjs";

const WORKS={
  "alchemist-great-work-rebirth":{hours:8,pr:10,gp:500,target:true},
  "alchemist-great-work-metamorphosis":{hours:24,pr:12,gp:750,target:true},
  "alchemist-great-work-forge":{hours:12,pr:10,gp:500},
  "alchemist-great-work-core":{hours:24,pr:15,gp:1000},
  "alchemist-great-work-panacea":{hours:12,pr:12,gp:1000,target:true},
  "alchemist-great-work-genesis":{hours:56,pr:20,gp:1500}
};
const FLAG="alchemistGreatWork";
function keyOf(item){return item?.getFlag?.(MODULE_ID,"contentKey")??"";}
function escape(value){return foundry.utils.escapeHTML(String(value??""));}
function knownWorks(actor){return actor.items.filter(item=>WORKS[keyOf(item)]);}
function pending(actor){return actor.getFlag(MODULE_ID,FLAG)??null;}
function currency(actor){return Number(actor.system?.currency?.gp??0);}

export async function openAlchemistGreatWorks(actor){
  if(!alchemistCanOperate(actor)||alchemistLevel(actor)<17||!hasAlchemistFeature(actor,"alchemist-great-works"))return false;
  const current=pending(actor);
  if(current){
    const item=actor.items.find(entry=>keyOf(entry)===current.key),ready=Number(game.time?.worldTime??0)>=Number(current.dueAt);
    const action=await Dialog.prompt({title:"Grande Obra em andamento",content:`<form><p><strong>${escape(item?.name??current.key)}</strong> — ${escape(current.description)}</p><p>${ready?"Tempo de pesquisa concluído.":"O tempo de trabalho ainda não terminou."}</p><select name="action"><option value="view">Ver andamento</option>${game.user.isGM?'<option value="finish">Concluir com validação do Mestre</option><option value="cancel">Cancelar sem consumir recursos</option>':""}</select></form>`,label:"Continuar",callback:html=>String(html.find("[name='action']").val()),rejectClose:false});
    if(action==="cancel"&&game.user.isGM){await actor.unsetFlag(MODULE_ID,FLAG);return true;}
    if(action==="finish"&&game.user.isGM)return finishGreatWork(actor,current);
    return true;
  }
  const entries=knownWorks(actor);if(!entries.length){ui.notifications.warn("Nova Era: nenhuma Grande Obra foi registrada no Diário.");return false;}
  const selected=await Dialog.prompt({title:"Iniciar Grande Obra",content:`<form><p>Grandes Obras exigem materiais, tempo de trabalho e validação do Mestre. Não são Fórmulas.</p><select name="key">${entries.map(item=>`<option value="${escape(keyOf(item))}">${escape(item.name)} · ${WORKS[keyOf(item)].pr} PR · ${WORKS[keyOf(item)].gp} PO</option>`).join("")}</select><p>Descreva o resultado pretendido:</p><input name="description" maxlength="240" required></form>`,label:"Iniciar pesquisa",callback:html=>({key:String(html.find("[name='key']").val()),description:String(html.find("[name='description']").val()).trim()}),rejectClose:false});
  if(!selected?.description||!WORKS[selected.key])return false;
  const rule=WORKS[selected.key];let targetUuid="";
  if(rule.target){const targets=[...game.user.targets];if(targets.length!==1){ui.notifications.warn("Nova Era: selecione exatamente uma criatura para esta Grande Obra.");return false;}targetUuid=targets[0].actor.uuid;}
  if(selected.key.endsWith("genesis")&&!game.actors.some(other=>other.getFlag(MODULE_ID,"alchemistHomunculusMaster")===actor.uuid)){ui.notifications.warn("Nova Era: crie um Homúnculo antes da Gênese.");return false;}
  if(alchemistState(actor).points<rule.pr||currency(actor)<rule.gp){ui.notifications.warn(`Nova Era: reserve ao menos ${rule.pr} PR e ${rule.gp} PO para concluir a Obra.`);return false;}
  const startedAt=Number(game.time?.worldTime??0),record={key:selected.key,description:selected.description,targetUuid,startedAt,dueAt:startedAt+(selected.key.endsWith("genesis")?7*86400:rule.hours*3600)};
  await actor.setFlag(MODULE_ID,FLAG,record);
  await postAlchemist(actor,"Grande Obra iniciada",`<strong>${escape(entries.find(item=>keyOf(item)===selected.key)?.name)}</strong>: ${escape(selected.description)}. Tempo previsto: ${rule.hours} horas de trabalho; ${rule.pr} PR e ${rule.gp} PO serão cobrados somente na conclusão validada pelo Mestre.`);
  return true;
}

async function finishGreatWork(actor,record){
  const rule=WORKS[record.key];if(!rule||!game.user.isGM)return false;
  if(Number(game.time?.worldTime??0)<Number(record.dueAt)){const override=await Dialog.confirm({title:"Tempo incompleto",content:"<p>O tempo de trabalho ainda não transcorreu no Foundry. O Mestre confirma que ele passou na ficção?</p>",yes:()=>true,no:()=>false,defaultYes:false});if(!override)return false;}
  if(alchemistState(actor).points<rule.pr||currency(actor)<rule.gp){ui.notifications.warn("Nova Era: PR ou PO insuficientes para concluir a Grande Obra.");return false;}
  const approved=await Dialog.confirm({title:"Validar Grande Obra",content:`<p>Confirma os materiais específicos, os requisitos da Obra e o resultado <strong>${escape(record.description)}</strong>? Serão consumidos ${rule.pr} PR e ${rule.gp} PO.</p>`,yes:()=>true,no:()=>false,defaultYes:false});if(!approved)return false;
  const target=record.targetUuid?await fromUuid(record.targetUuid):null;
  if(rule.target&&!target){ui.notifications.warn("Nova Era: o alvo da Obra não foi encontrado.");return false;}
  if(!await spendReagentPoints(actor,rule.pr,"Grande Obra"))return false;
  await actor.update({"system.currency.gp":currency(actor)-rule.gp});
  if(record.key.endsWith("genesis")){
    const servant=game.actors.find(other=>other.getFlag(MODULE_ID,"alchemistHomunculusMaster")===actor.uuid);
    if(servant){await servant.unsetFlag(MODULE_ID,"alchemistHomunculusMaster");await servant.setFlag(MODULE_ID,"alchemistTrueHomunculus",true);}
  }
  if(record.key.endsWith("metamorphosis"))await target.setFlag(MODULE_ID,"alchemistMetamorphosis",{source:actor.uuid,description:record.description});
  if(record.key.endsWith("panacea")){
    const listed=[...target.effects].filter(effect=>effect.statuses?.has?.("poisoned")||/doença|veneno|toxina|contaminação|mutação/i.test(effect.name));
    if(listed.length){const chosen=await Dialog.prompt({title:"Panaceia Universal",content:`<form><p>Selecione somente o efeito causado pelo agente diagnosticado.</p><select name="effect"><option value="">Nenhum efeito listado corresponde</option>${listed.map(effect=>`<option value="${effect.id}">${escape(effect.name)}</option>`).join("")}</select></form>`,label:"Confirmar",callback:html=>String(html.find("[name='effect']").val()),rejectClose:false});if(chosen)await target.deleteEmbeddedDocuments("ActiveEffect",[chosen]);}
  }
  await actor.unsetFlag(MODULE_ID,FLAG);
  await postAlchemist(actor,"Grande Obra concluída",`<strong>${escape(actor.items.find(item=>keyOf(item)===record.key)?.name)}</strong>: ${escape(record.description)}. ${rule.pr} PR e ${rule.gp} PO consumidos. O Mestre aplica à ficha ou ao mundo as propriedades narrativas e materiais restantes.`);
  return true;
}
