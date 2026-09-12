import { MODULE_ID } from "../constants.mjs";
import { alchemistCanOperate, alchemistDocumentAction, alchemistIntelligence, alchemistLevel, alchemistProficiency, alchemistResponsible, applyAlchemistHealing, hasAlchemistFeature, postAlchemist, spendReagentPoints } from "./core-automation.mjs";

const ICON=`modules/${MODULE_ID}/assets/icons/alchemist/biomante.webp`;
const BASIC={muscular:"Muscular · +3 m deslocamento",dermal:"Dérmica · +1 CA",sensory:"Sensorial · +2 Percepção",metabolic:"Metabólica · vantagem contra Veneno/Doença"};
const SUPERIOR={regenerative:"Regenerativa · PB PV por turno",predatory:"Predatória · +1d6 corpo a corpo",carapace:"Carapaça · resistência elemental",amphibious:"Anfíbia · natação/respiração"};
const now=()=>Number(game.time?.worldTime??0);
function turnKey(){return game.combat?.started?`${game.combat.id}:${game.combat.round}:${game.combat.turn}`:"";}
function escape(value){return foundry.utils.escapeHTML(String(value??""));}
function adaptations(target,source){return [...(target.effects??[])].filter(effect=>effect.getFlag(MODULE_ID,"alchemistAdaptationSource")===source.uuid&&!effect.disabled);}
function affectedCount(source){return game.actors.filter(actor=>adaptations(actor,source).length>0).length;}

async function addAdaptation(source,target,kind,{chimera=false}={}){
  const superior=kind in SUPERIOR,level=alchemistLevel(source);
  if(superior&&level<11)return false;
  const present=adaptations(target,source),limit=level>=15?2:1;
  if(!chimera&&!present.length&&affectedCount(source)>=alchemistProficiency(source)){ui.notifications.warn("Nova Era: o limite de criaturas adaptadas (PB) foi atingido.");return false;}
  const changes=[],extra={alchemistAdaptationSource:source.uuid,alchemistAdaptation:kind,...(chimera?{alchemistChimera:true}:{})};
  if(kind==="muscular")changes.push({key:"system.attributes.movement.walk",mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:"3",priority:20});
  if(kind==="dermal")changes.push({key:"system.attributes.ac.bonus",mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:"1",priority:20});
  if(kind==="sensory")changes.push({key:"system.skills.prc.bonuses.check",mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:"2",priority:20});
  if(kind==="regenerative")extra.alchemistRegenerationCharges=Math.max(1,alchemistIntelligence(source));
  if(kind==="predatory")extra.alchemistPredatory=true;
  if(kind==="carapace"){
    const type=await Dialog.prompt({title:"Carapaça",content:'<form><select name="type"><option value="acid">Ácido</option><option value="cold">Frio</option><option value="fire">Fogo</option><option value="poison">Veneno</option></select></form>',label:"Aplicar",callback:html=>String(html.find("[name='type']").val()),rejectClose:false});
    if(!type)return false;changes.push({key:"system.traits.dr.value",mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:type,priority:20});extra.alchemistCarapaceType=type;
  }
  if(kind==="amphibious")changes.push({key:"system.attributes.movement.swim",mode:CONST.ACTIVE_EFFECT_MODES.OVERRIDE,value:String(target.system?.attributes?.movement?.walk??9),priority:20});
  if(superior&&!chimera&&!await spendReagentPoints(source,1,"Reescrita Orgânica"))return false;
  if(!chimera&&present.length>=limit){const old=present[0];await alchemistDocumentAction(target,"effect-delete",{id:old.id});}
  const duration=chimera||superior?60:600;
  await alchemistDocumentAction(target,"effect",{effect:{name:`${chimera?"Forma Quimérica — ":"Adaptação "}${BASIC[kind]??SUPERIOR[kind]}`,img:ICON,origin:source.uuid,disabled:false,duration:{seconds:duration,startTime:now(),rounds:duration/6,startRound:game.combat?.round,startTurn:game.combat?.turn},changes,flags:{[MODULE_ID]:{alchemistEffect:`${chimera?"chimera":"adaptation"}:${source.id}:${kind}`, ...extra}}}});
  await postAlchemist(source,chimera?"Forma Quimérica":"Adaptação Induzida",`<strong>${escape(target.name)}</strong> recebe ${escape(BASIC[kind]??SUPERIOR[kind])} por ${duration/60} minuto${duration===60?"":"s"}.${["metabolic","amphibious"].includes(kind)?" A vantagem específica ou a respiração devem ser observadas na resolução do teste.":""}`);
  return true;
}

export async function activateAlchemistChimera(actor){
  if(!alchemistCanOperate(actor)||!hasAlchemistFeature(actor,"alchemist-biomancer-chimera"))return false;
  if(actor.getFlag(MODULE_ID,"alchemistChimeraUsed")){ui.notifications.warn("Nova Era: Forma Quimérica já foi usada desde o último Descanso Longo.");return false;}
  const target=[...game.user.targets][0];if(game.user.targets.size!==1||!target?.actor){ui.notifications.warn("Nova Era: selecione uma criatura voluntária ao alcance de toque.");return false;}
  const source=actor.getActiveTokens?.()[0];if(source&&Number(canvas.grid.measurePath([source.center,target.center]).distance)>1.5){ui.notifications.warn("Nova Era: Forma Quimérica exige toque.");return false;}
  const consent=await Dialog.confirm({title:"Forma Quimérica",content:`<p>${escape(target.name)} aceita receber três Adaptações por 1 minuto?</p>`,yes:()=>true,no:()=>false,defaultYes:false});if(!consent)return false;
  const choices={...BASIC,...SUPERIOR},selected=[];
  for(let i=0;i<3;i++){
    const kind=await Dialog.prompt({title:"Forma Quimérica",content:`<form><p>Adaptação ${i+1} de 3</p><select name="kind">${Object.entries(choices).filter(([id])=>!selected.includes(id)).map(([id,label])=>`<option value="${id}">${escape(label)}</option>`).join("")}</select></form>`,label:"Escolher",callback:html=>String(html.find("[name='kind']").val()),rejectClose:false});
    if(!kind)return false;selected.push(kind);
  }
  for(const kind of selected)if(!await addAdaptation(actor,target.actor,kind,{chimera:true}))return false;
  await actor.setFlag(MODULE_ID,"alchemistChimeraUsed",true);
  return true;
}

async function rotateChimera(combat,changed){
  if(changed.turn===undefined&&changed.round===undefined)return;
  const target=combat.combatant?.actor;if(!target)return;
  for(const active of [...(target.effects??[])].filter(value=>value.getFlag(MODULE_ID,"alchemistChimera"))){
    const source=await fromUuid(active.getFlag(MODULE_ID,"alchemistAdaptationSource"));if(!source||!alchemistResponsible(source))continue;
    const turn=turnKey();if(turn&&source.getFlag(MODULE_ID,"alchemistChimeraTurn")===turn)return;
    if(turn)await source.setFlag(MODULE_ID,"alchemistChimeraTurn",turn);
    const swap=await Dialog.confirm({title:"Forma Quimérica",content:`<p>Trocar uma Adaptação de ${escape(target.name)} neste início de turno?</p>`,yes:()=>true,no:()=>false,defaultYes:false});if(!swap)return;
    const present=[...target.effects].filter(value=>value.getFlag(MODULE_ID,"alchemistChimera"));
    const old=await Dialog.prompt({title:"Substituir Adaptação",content:`<form><select name="id">${present.map(value=>`<option value="${value.id}">${escape(value.name)}</option>`).join("")}</select></form>`,label:"Substituir",callback:html=>String(html.find("[name='id']").val()),rejectClose:false});if(!old)return;
    const current=present.map(value=>value.getFlag(MODULE_ID,"alchemistAdaptation"));
    const kind=await Dialog.prompt({title:"Nova Adaptação",content:`<form><select name="kind">${Object.entries({...BASIC,...SUPERIOR}).filter(([id])=>!current.includes(id)).map(([id,label])=>`<option value="${id}">${escape(label)}</option>`).join("")}</select></form>`,label:"Aplicar",callback:html=>String(html.find("[name='kind']").val()),rejectClose:false});if(!kind)return;
    await alchemistDocumentAction(target,"effect-delete",{id:old});await addAdaptation(source,target,kind,{chimera:true});
    return;
  }
}

async function offerAdaptation({actor,targets}){
  if(!hasAlchemistFeature(actor,"alchemist-biomancer-adaptation")||!alchemistCanOperate(actor)||targets.length!==1)return;
  const target=targets[0]?.actor;if(!target||Number(target.system?.attributes?.hp?.value??0)<1)return;
  const turn=turnKey();if(turn&&actor.getFlag(MODULE_ID,"alchemistAdaptationTurn")===turn)return;
  const consent=await Dialog.confirm({title:"Adaptação Induzida",content:`<p>${escape(target.name)} é voluntário e deseja receber uma Adaptação?</p>`,yes:()=>true,no:()=>false,defaultYes:false});if(!consent)return;
  const choices={...BASIC,...(hasAlchemistFeature(actor,"alchemist-biomancer-rewrite")?SUPERIOR:{})};
  const chosen=await Dialog.prompt({title:"Adaptação Induzida",content:`<form><select name="kind">${Object.entries(choices).map(([id,label])=>`<option value="${id}">${escape(label)}</option>`).join("")}</select></form>`,label:"Aplicar",callback:html=>String(html.find("[name='kind']").val()),rejectClose:false});
  if(!choices[chosen])return;
  if(await addAdaptation(actor,target,chosen)&&turn)await actor.setFlag(MODULE_ID,"alchemistAdaptationTurn",turn);
}

async function regeneration(combat,changed){
  if(changed.turn===undefined&&changed.round===undefined)return;
  const target=combat.combatant?.actor;if(!target||!game.user.isGM||game.users.activeGM?.id!==game.user.id||Number(target.system?.attributes?.hp?.value??0)<1)return;
  for(const effect of [...(target.effects??[])].filter(value=>Number(value.getFlag(MODULE_ID,"alchemistRegenerationCharges")??0)>0)){
    const charges=Number(effect.getFlag(MODULE_ID,"alchemistRegenerationCharges")??0);if(charges<1)continue;
    const source=await fromUuid(effect.getFlag(MODULE_ID,"alchemistAdaptationSource"));if(!source)continue;
    await applyAlchemistHealing(target,alchemistProficiency(source));
    if(charges===1)await effect.delete();else await effect.setFlag(MODULE_ID,"alchemistRegenerationCharges",charges-1);
  }
}

async function predatory(workflow){
  const actor=workflow?.actor??workflow?.item?.actor;if(!actor||!alchemistResponsible(actor))return;
  const effect=[...(actor.effects??[])].find(value=>value.getFlag(MODULE_ID,"alchemistPredatory"));if(!effect)return;
  const activity=workflow.activity??workflow,item=activity?.item??workflow.item,type=activity?.attack?.type?.value??activity?.attack?.type??item?.system?.actionType;
  if(!["mwak","melee"].includes(type)&&!["simpleM","martialM","natural"].includes(item?.system?.type?.value))return;
  const turn=turnKey();if(turn&&actor.getFlag(MODULE_ID,"alchemistPredatoryTurn")===turn)return;
  if(turn)await actor.setFlag(MODULE_ID,"alchemistPredatoryTurn",turn);
  const roll=await new CONFIG.Dice.DamageRoll(workflow.isCritical?"2d6":"1d6",actor.getRollData(),{flavor:"Adaptação Predatória"}).evaluate();
  if(typeof workflow.setBonusDamageRolls==="function")await workflow.setBonusDamageRolls([...(workflow.bonusDamageRolls??[]),roll]);
}

export function registerAlchemistSchoolAutomation(){
  Hooks.on("novaEraAlchemistBiomanticFormula",data=>void offerAdaptation(data));
  Hooks.on("updateCombat",(combat,changed)=>void regeneration(combat,changed));
  Hooks.on("updateCombat",(combat,changed)=>void rotateChimera(combat,changed));
  Hooks.on("midi-qol.DamageRollComplete",workflow=>void predatory(workflow));
  Hooks.on("dnd5e.restCompleted",(actor,result,config)=>{if((result?.longRest===true||result?.type==="long"||config?.type==="long")&&alchemistResponsible(actor))void actor.unsetFlag(MODULE_ID,"alchemistChimeraUsed");});
}
