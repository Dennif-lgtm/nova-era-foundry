import { MODULE_ID } from "../constants.mjs";
import { ALCHEMIST_PR } from "../content/alchemist-data.mjs";
import { applyAlchemistPrinciple, planAlchemistTransmutation } from "./transmuter-automation.mjs";
import { alchemistPlatformModules } from "./artificer-automation.mjs";
import { applyAlchemistDamageInterception } from "./damage-interception.mjs";

const STATE_FLAG = "alchemistState";
const SOCKET_TYPE = "alchemistAction";
const ICON = "icons/consumables/potions/bottle-corked-labeled-green.webp";

function keyOf(item) { return item?.getFlag?.(MODULE_ID,"contentKey") ?? ""; }
function classItem(actor) { return actor?.items?.find(item => item.type === "class" && (item.system?.identifier === "alchemist-nova-era" || keyOf(item) === "alchemist")); }
export function isNovaEraAlchemist(actor) { return !!classItem(actor); }
export function alchemistLevel(actor) { return Number(classItem(actor)?.system?.levels ?? 0); }
export function alchemistProficiency(actor) { return Number(actor?.system?.attributes?.prof ?? 2); }
export function alchemistIntelligence(actor) { return Number(actor?.system?.abilities?.int?.mod ?? 0); }
export function alchemistDC(actor) { return 8 + alchemistProficiency(actor) + alchemistIntelligence(actor); }
export function alchemistMaximum(actor) { return ALCHEMIST_PR[Math.clamp(alchemistLevel(actor),0,20)] ?? 0; }
export function alchemistLaboratoryCapacity(actor) { return 3 + alchemistProficiency(actor); }
export function alchemistReserveCapacity(actor) { const level=alchemistLevel(actor); return level >= 18 ? 3 : level >= 9 ? 2 : 0; }
export function hasAlchemistFeature(actor,key) { return actor?.items?.some(item => keyOf(item) === key); }
export function alchemistSchool(actor) { return actor?.items?.find(item => item.type === "subclass" && item.system?.classIdentifier === "alchemist-nova-era") ?? null; }

function clamp(value,min,max) { return Math.max(min,Math.min(max,Number(value)||0)); }
function normalizeFormula(entry) { return entry && typeof entry === "object" ? { label:String(entry.label??entry.projectName??""), projectKey:String(entry.projectKey??""), projectName:String(entry.projectName??""), compound:String(entry.compound??""), convertedType:String(entry.convertedType??""), container:String(entry.container??"flask"), option:String(entry.option??""), modifiers:Array.isArray(entry.modifiers)?entry.modifiers.map(String):[], cost:Math.max(0,Number(entry.cost)||0), improvised:Boolean(entry.improvised), recalibrated:Boolean(entry.recalibrated) } : null; }
function normalizeActive(entry) { return entry && typeof entry === "object" ? { id:String(entry.id??""), kind:String(entry.kind??""), targetActorUuid:String(entry.targetActorUuid??""), targetTokenUuid:String(entry.targetTokenUuid??""), sceneId:String(entry.sceneId??""), originX:Number(entry.originX??0), originY:Number(entry.originY??0), linkedSlot:Number.isInteger(entry.linkedSlot)?entry.linkedSlot:null, trigger:String(entry.trigger??""), formula:normalizeFormula(entry.formula), dueAt:Math.max(0,Number(entry.dueAt)||0), dueCombatId:String(entry.dueCombatId??""), dueRound:Math.max(0,Number(entry.dueRound)||0), charges:Math.max(0,Number(entry.charges)||0), expiresAt:Math.max(0,Number(entry.expiresAt)||0), lastTurn:String(entry.lastTurn??"") } : null; }
export function alchemistState(actor) {
  const raw=actor?.getFlag(MODULE_ID,STATE_FLAG) ?? {}, maximum=alchemistMaximum(actor), capacity=alchemistLaboratoryCapacity(actor), reserveMaximum=alchemistReserveCapacity(actor);
  const prepared=Array.from({length:capacity},(_,i)=>normalizeFormula(raw.prepared?.[i]));
  return { points:clamp(raw.points ?? maximum,0,maximum), maximum, prepared, capacity, reserves:clamp(raw.reserves??0,0,Math.min(reserveMaximum,capacity-prepared.filter(Boolean).length)), reserveMaximum, active:Array.isArray(raw.active)?raw.active.map(normalizeActive).filter(Boolean):[], improvised:normalizeFormula(raw.improvised), shortRecoveryUsed:Boolean(raw.shortRecoveryUsed), perfectFormulaSlot:Number.isInteger(raw.perfectFormulaSlot)?raw.perfectFormulaSlot:null };
}

export function alchemistResponsible(actor) {
  const owners=game.users.filter(user=>user.active&&!user.isGM&&actor.testUserPermission(user,"OWNER")).sort((a,b)=>a.id.localeCompare(b.id));
  return owners[0]?.id===game.user.id||(!owners.length&&game.user.isGM&&game.users.activeGM?.id===game.user.id);
}
export function alchemistCanOperate(actor) { return !!actor?.isOwner && (game.user.isGM || alchemistResponsible(actor)); }
function turnKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : ""; }
export async function analyzeAlchemistOrganism(actor) {
  if(!alchemistCanOperate(actor)||!hasAlchemistFeature(actor,"alchemist-biomancer-anatomy"))return false;
  const targets=[...game.user.targets];if(targets.length!==1){ui.notifications.warn("Nova Era: selecione uma criatura para Anatomia Alquímica.");return false;}
  const target=targets[0],source=actor.getActiveTokens?.()[0];if(source&&Number(canvas.grid.measurePath([source.center,target.center]).distance)>9){ui.notifications.warn("Nova Era: o alvo deve estar a até 9 m.");return false;}
  const traits=target.actor.system?.traits??{},has=(value)=>value?.has?.("poison")||value?.value?.has?.("poison")||Array.isArray(value?.value)&&value.value.includes("poison");
  const venom=has(traits.di)?"Imune a Veneno":has(traits.dr)?"Resistente a Veneno":"Sem resistência a Veneno identificada";
  const hp=target.actor.system?.attributes?.hp??{},threshold=Number(hp.value)>Number(hp.max)/2?"Acima da metade dos PV":"Na metade dos PV ou abaixo";
  await actor.setFlag(MODULE_ID,"alchemistAnalyzedTarget",target.actor.uuid);
  await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),whisper:[game.user.id,game.users.activeGM?.id].filter(Boolean),content:`<section class="nova-era alchemist-chat"><h2>Anatomia Alquímica</h2><p><strong>${escape(target.name)}</strong>: ${hp.max?threshold:"PV desconhecidos"}; ${venom}. Condições visíveis: ${escape(Array.from(target.actor.statuses??[]).join(", ")||"nenhuma")}. O bônus de Proficiência agora pode afetar este organismo uma vez por turno.</p></section>`});
  return true;
}
export async function alchemistAnatomyBonus(actor,target) {
  if(!target||!hasAlchemistFeature(actor,"alchemist-biomancer-anatomy")||actor.getFlag(MODULE_ID,"alchemistAnalyzedTarget")!==target.uuid)return 0;
  const turn=turnKey();if(turn&&actor.getFlag(MODULE_ID,"alchemistAnatomyTurn")===turn)return 0;
  if(turn)await actor.setFlag(MODULE_ID,"alchemistAnatomyTurn",turn);
  return alchemistProficiency(actor);
}
function firstRoll(result) { return Array.isArray(result)?result[0]:result; }
function escape(value) { return foundry.utils.escapeHTML(String(value??"")); }
function worldItem(key) { return game.items.find(item=>keyOf(item)===key); }
function component(group,id) { return game.items.find(item=>item.getFlag(MODULE_ID,"group")===group&&keyOf(item).endsWith(`-${id}`)); }
function knownProjects(actor) { return actor.items.filter(item=>Number(item.getFlag(MODULE_ID,"grade")??0)>0 && keyOf(item).includes("project-")); }
function knownModifiers(actor) { return actor.items.filter(item=>item.getFlag(MODULE_ID,"group")==="modifiers"); }

async function executeDocument(uuid,type,data={}) {
  const document=await fromUuid(uuid); if(!document)return false;
  const actor=document.documentName==="Actor"?document:document.actor;
  if(type==="hp") {
    const hp=actor.system.attributes.hp,amount=Math.max(0,Number(data.amount)||0);
    if(data.mode==="heal") await actor.update({"system.attributes.hp.value":Math.min(Number(hp.max??0),Number(hp.value??0)+amount)},{novaEraAlchemist:true});
    else if(data.mode==="temp") await actor.update({"system.attributes.hp.temp":Math.max(Number(hp.temp??0),amount)},{novaEraAlchemist:true});
    else { const absorbed=Math.min(Number(hp.temp??0),amount); await actor.update({"system.attributes.hp.temp":Number(hp.temp??0)-absorbed,"system.attributes.hp.value":Math.max(0,Number(hp.value??0)-amount+absorbed)},{novaEraAlchemist:true}); }
  }
  if(type==="effect") {
    const old=actor.effects.find(effect=>effect.getFlag(MODULE_ID,"alchemistEffect")===data.effect.flags?.[MODULE_ID]?.alchemistEffect); if(old)await old.delete({novaEraAlchemist:true});
    await actor.createEmbeddedDocuments("ActiveEffect",[data.effect],{novaEraAlchemist:true});
  }
  if(type==="effect-delete"){const selected=actor.effects.get(data.id);if(selected)await selected.delete({novaEraAlchemist:true});}
  if(type==="effect-flag"){const selected=actor.effects.get(data.id);if(selected)await selected.setFlag(MODULE_ID,data.key,data.value);}
  if(type==="token-update") await document.update(data.change??{},{novaEraAlchemist:true});
  return true;
}
export async function alchemistDocumentAction(document,type,data={}) {
  if(!document)return false;
  if(game.user.isGM||document.isOwner)return executeDocument(document.uuid,type,data);
  game.socket.emit(`module.${MODULE_ID}`,{type:SOCKET_TYPE,uuid:document.uuid,action:type,data}); return true;
}
function traitIncludes(trait,type){const value=trait?.value??trait;return value?.has?.(type)||Array.isArray(value)&&value.includes(type);}
export async function applyAlchemistDamage(actor,amount,type=""){
  let final=Math.max(0,Number(amount)||0);
  if(type){const traits=actor.system?.traits??{};if(traitIncludes(traits.di,type))final=0;else if(traitIncludes(traits.dr,type))final=Math.floor(final/2);else if(traitIncludes(traits.dv,type))final*=2;}
  if(type&&final>0){const damageItem={damageDetail:[{type,value:final}],details:[]};applyAlchemistDamageInterception({actor},{damageItem,force:true});final=Math.max(0,Number(damageItem.damageDetail[0].value)||0);}
  return alchemistDocumentAction(actor,"hp",{mode:"damage",amount:final});
}
export async function applyAlchemistHealing(actor,amount){return alchemistDocumentAction(actor,"hp",{mode:"heal",amount});}

export async function rollAlchemist(actor,formula,flavor) { const result=await new Roll(formula,actor.getRollData()).evaluate(); await result.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor}); return Number(result.total); }
const roll=rollAlchemist;
async function save(actor,ability) { return Number(firstRoll(await actor.rollSavingThrow({ability}))?.total??0); }
export async function postAlchemist(actor,title,text) { return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<section class="nova-era alchemist-chat"><h2>${title}</h2><p>${text}</p><blockquote>“Toda descoberta começa como uma hipótese.”</blockquote></section>`}); }
const post=postAlchemist;
async function choose(title,prompt,entries) {
  if(!entries.length)return null;
  return Dialog.prompt({title,content:`<form class="nova-era alchemist-choice"><p>${prompt}</p><div class="form-group"><select name="choice">${entries.map(([value,label])=>`<option value="${escape(value)}">${escape(label)}</option>`).join("")}</select></div></form>`,label:"Confirmar",callback:html=>String(html.find("[name='choice']").val()),rejectClose:false});
}
async function confirm(title,text){return Dialog.confirm({title,content:`<p>${text}</p>`,yes:()=>true,no:()=>false,defaultYes:true});}

export async function updateAlchemistState(actor,patch,reason="Atualização") {
  if(!isNovaEraAlchemist(actor)||!actor.isOwner)return alchemistState(actor);
  const before=alchemistState(actor),next={...before,...patch};
  next.points=clamp(next.points,0,next.maximum); next.prepared=Array.from({length:next.capacity},(_,i)=>normalizeFormula(next.prepared?.[i])); next.reserves=clamp(next.reserves,0,Math.min(next.reserveMaximum,next.capacity-next.prepared.filter(Boolean).length)); next.active=Array.isArray(next.active)?next.active.map(normalizeActive).filter(Boolean):[];
  await actor.setFlag(MODULE_ID,STATE_FLAG,next); const after=alchemistState(actor); Hooks.callAll("novaEraAlchemistChanged",{actor,before,after,reason}); return after;
}
export async function setReagentPoints(actor,value,reason="Ajuste de PR"){return updateAlchemistState(actor,{points:value},reason);}
export async function spendReagentPoints(actor,amount,reason="Ativação de Fórmula") {
  const state=alchemistState(actor),cost=Math.max(0,Number(amount)||0); if(state.points<cost){ui.notifications.warn(`Nova Era: ${actor.name} não possui ${cost} PR.`);return false;} await setReagentPoints(actor,state.points-cost,reason); return true;
}
export async function gainReagentPoints(actor,amount=1,reason="Recuperação"){const state=alchemistState(actor);return setReagentPoints(actor,state.points+amount,reason);}

function formulaCost(project,containerId,modifierIds) {
  return Math.max(0,Number(project.getFlag(MODULE_ID,"reagentCost")??0)+Number(component("containers",containerId)?.getFlag(MODULE_ID,"reagentCost")??0)+modifierIds.reduce((sum,id)=>sum+Number(component("modifiers",id)?.getFlag(MODULE_ID,"reagentCost")??0),0));
}
function compatibleModifier(id,project,container,improvised,selected){
  const role=project.getFlag(MODULE_ID,"role"),area=["grenade","mine","diffuser"].includes(container),hasDice=!!project.getFlag(MODULE_ID,"dice");
  if(id==="catalyzed"||id==="unstable")return hasDice&&["damage","healing"].includes(role);
  if(id==="fragmentation")return area&&role==="damage";
  if(id==="expanded")return area;
  if(id==="penetrating")return !area&&["damage","debuff"].includes(role);
  if(id==="persistent")return ["support","debuff","defense","control","utility"].includes(role);
  if(id==="stable")return improvised||selected.includes("unstable");
  if(id==="delayed")return !area&&!keyOf(project).includes("coagulant")&&!keyOf(project).includes("regeneration")&&role!=="reaction"&&role!=="trigger";
  return true;
}

export async function buildAlchemistFormula(actor,{improvised=false}={}) {
  const projects=knownProjects(actor); if(!projects.length){ui.notifications.warn("Nova Era: nenhum Projeto foi registrado no Diário deste Alquimista.");return null;}
  const projectKey=await choose(improvised?"Experimentação Perigosa":"Preparar Fórmula","Escolha um Projeto registrado no Diário.",projects.map(item=>[keyOf(item),`${item.name} — Grau ${["","I","II","III","IV"][Number(item.getFlag(MODULE_ID,"grade"))]}`])); if(!projectKey)return null;
  const project=actor.items.find(item=>keyOf(item)===projectKey),compatible=project.getFlag(MODULE_ID,"containers")??[];
  const allContainers=game.items.filter(item=>item.getFlag(MODULE_ID,"group")==="containers");const choices=allContainers.filter(item=>compatible.some(id=>keyOf(item).endsWith(`-${id}`)));
  const containerKey=compatible.length?await choose("Recipiente","Como a Fórmula será entregue?",choices.map(item=>[keyOf(item).replace("alchemist-container-",""),`${item.name} • +${item.getFlag(MODULE_ID,"reagentCost")??0} PR`])):"none";if(!containerKey)return null;
  const compounds=project.getFlag(MODULE_ID,"compounds")??[]; let compound="";
  if(compounds.length){compound=await choose("Composto","Escolha o princípio ativo.",compounds.map(id=>{const item=component("compounds",id);return[id,item?.name??id];}));if(!compound)return null;}
  const maxModifiers=alchemistLevel(actor)>=10?2:alchemistLevel(actor)>=5?1:0,modifiers=[]; const known=knownModifiers(actor);
  for(let index=0;index<maxModifiers&&known.length;index++){
    const selected=await choose("Modificadores",index?"Escolha o segundo Modificador ou finalize.":"Escolha um Modificador ou prepare sem alteração.",[["","Nenhum / finalizar"],...known.filter(item=>{const id=keyOf(item).replace("alchemist-modifier-","");return !modifiers.includes(id)&&compatibleModifier(id,project,containerKey,improvised,modifiers);}).map(item=>[keyOf(item).replace("alchemist-modifier-",""),`${item.name} • +${item.getFlag(MODULE_ID,"reagentCost")??0} PR`])]);
    if(!selected)break; modifiers.push(selected);
  }
  const option=["alchemist-project-stimulant","alchemist-project-suppressor"].includes(projectKey)?await choose("Atributo do Projeto","Escolha o atributo durante a preparação.",Object.entries(CONFIG.DND5E.abilities).map(([id,label])=>[id,game.i18n.localize(label.label??label)])):"";
  if(["alchemist-project-stimulant","alchemist-project-suppressor"].includes(projectKey)&&!option)return null;
  let convertedType="";
  if(hasAlchemistFeature(actor,"alchemist-transmuter-conversion")&&["igneous","cryogenic","corrosive"].includes(compound)){
    convertedType=await choose("Conversão Elemental — preparo","Escolha o tipo de dano da Fórmula preparada, sem custo adicional.",[["acid","Ácido"],["lightning","Elétrico"],["fire","Fogo"],["cold","Frio"]]);if(!convertedType)return null;
  }
  const formula={projectKey,projectName:project.name,compound,convertedType,container:containerKey,option,modifiers,cost:formulaCost(project,containerKey,modifiers),improvised};
  const compoundName=component("compounds",compound)?.name; formula.label=`${project.name}${compoundName?` • ${compoundName}`:""}`; return formula;
}

export async function prepareAlchemistFormula(actor,slot=null) {
  const state=alchemistState(actor),index=Number.isInteger(slot)?slot:state.prepared.findIndex(entry=>!entry); if(index<0||index>=state.capacity){ui.notifications.warn("Nova Era: o Laboratório está completo.");return false;}
  if(!state.prepared[index]&&state.prepared.filter(Boolean).length+state.reserves>=state.capacity){ui.notifications.warn("Nova Era: as Reservas Catalíticas já ocupam os encaixes livres. Finalize ou libere uma Reserva.");return false;}
  const formula=await buildAlchemistFormula(actor); if(!formula)return false; const prepared=[...state.prepared]; prepared[index]=formula; await updateAlchemistState(actor,{prepared},`Fórmula preparada: ${formula.label}`); await post(actor,"Fórmula preparada",`O espaço ${index+1} do Laboratório agora contém <strong>${escape(formula.label)}</strong> (${formula.cost} PR).`); return true;
}
export async function clearAlchemistFormula(actor,slot) { const state=alchemistState(actor),prepared=[...state.prepared]; prepared[slot]=null; return updateAlchemistState(actor,{prepared},"Espaço liberado"); }
export async function prepareDangerousExperiment(actor) { if(alchemistLevel(actor)<2)return false; const formula=await buildAlchemistFormula(actor,{improvised:true}); if(!formula)return false; await updateAlchemistState(actor,{improvised:formula},"Experimentação Perigosa"); await post(actor,"Experimentação Perigosa",`<strong>${escape(formula.label)}</strong> foi improvisada e permanece até o final do próximo turno.`); return true; }

export async function recalibrateAlchemistExperiment(actor){
  if(!alchemistCanOperate(actor)||!hasAlchemistFeature(actor,"alchemist-reactive-recalibration"))return false;
  const current=alchemistState(actor).improvised;
  if(!current||current.recalibrated){ui.notifications.warn("Nova Era: prepare um improviso ainda não recalibrado.");return false;}
  const project=actor.items.find(item=>keyOf(item)===current.projectKey)??worldItem(current.projectKey);if(!project)return false;
  const kind=await choose("Recalibração Reativa","Substitua o Recipiente ou um Modificador; o custo anterior não é reembolsado.",[["container","Recipiente"],...(current.modifiers.length?[["modifier","Modificador"]]:[])]);if(!kind)return false;
  const next={...current,modifiers:[...current.modifiers],recalibrated:true};
  if(kind==="container"){
    const containers=project.getFlag(MODULE_ID,"containers")??[];
    const compatible=containers.filter(id=>id!==current.container&&current.modifiers.every(modifier=>compatibleModifier(modifier,project,id,true,current.modifiers)));
    const selected=await choose("Novo Recipiente","Escolha um Recipiente compatível.",compatible.map(id=>[id,component("containers",id)?.name??id]));if(!selected)return false;
    next.container=selected;next.cost+=Number(component("containers",selected)?.getFlag(MODULE_ID,"reagentCost")??0);
  }else{
    const indexChoice=await choose("Modificador a substituir","Escolha o Modificador original.",current.modifiers.map((id,i)=>[String(i),component("modifiers",id)?.name??id]));
    if(indexChoice===null)return false;
    const index=Number(indexChoice);
    if(!Number.isInteger(index)||index<0||index>=current.modifiers.length)return false;
    const remaining=current.modifiers.filter((_,i)=>i!==index);
    const available=knownModifiers(actor).map(item=>keyOf(item).replace("alchemist-modifier-","")).filter(id=>id!==current.modifiers[index]&&!remaining.includes(id)&&compatibleModifier(id,project,current.container,true,remaining));
    const selected=await choose("Novo Modificador","Escolha um Modificador compatível.",available.map(id=>[id,component("modifiers",id)?.name??id]));if(!selected)return false;
    next.modifiers[index]=selected;next.cost+=Number(component("modifiers",selected)?.getFlag(MODULE_ID,"reagentCost")??0);
  }
  await updateAlchemistState(actor,{improvised:next},"Recalibração Reativa");
  await post(actor,"Recalibração Reativa",`<strong>${escape(next.label)}</strong> foi recalibrada; novo custo de ativação: ${next.cost} PR. Os custos anteriores não foram devolvidos.`);
  return true;
}

export async function configureAlchemistEngineering(actor){
  if(!alchemistCanOperate(actor)||!hasAlchemistFeature(actor,"alchemist-engineering"))return false;
  const eligible=knownModifiers(actor).filter(item=>Number(item.getFlag(MODULE_ID,"reagentCost")??0)>=1);
  if(eligible.length<2){ui.notifications.warn("Nova Era: Engenharia Alquímica exige dois Modificadores conhecidos de custo-base 1+.");return false;}
  const first=await choose("Engenharia Alquímica","Escolha o primeiro Modificador.",eligible.map(item=>[keyOf(item).replace("alchemist-modifier-",""),item.name]));if(!first)return false;
  const second=await choose("Engenharia Alquímica","Escolha o segundo Modificador.",eligible.filter(item=>!keyOf(item).endsWith(`-${first}`)).map(item=>[keyOf(item).replace("alchemist-modifier-",""),item.name]));if(!second)return false;
  await actor.setFlag(MODULE_ID,"alchemistEngineeredModifiers",[first,second]);
  await post(actor,"Engenharia Alquímica",`Modificadores calibrados: <strong>${escape(first)}</strong> e <strong>${escape(second)}</strong>. Até ${alchemistProficiency(actor)} reduções por Descanso Longo.`);
  return true;
}

function currentWorldTime() { return Number(game.time?.worldTime ?? 0); }
async function queueActive(actor,entry) {
  const state=alchemistState(actor);
  const active=state.active.filter(record=>record.charges>0&&record.expiresAt>currentWorldTime());
  if(active.length>=alchemistProficiency(actor)){ui.notifications.warn(`Nova Era: limite de ${alchemistProficiency(actor)} Preparações Ativas atingido.`);return false;}
  active.push({id:foundry.utils.randomID(),...entry});
  await updateAlchemistState(actor,{active},"Preparação Ativa registrada");
  return true;
}
async function planPersistentProject(actor,project,targets,slot) {
  const key=keyOf(project),target=targets[0];
  if(targets.length!==1||!target?.actor){ui.notifications.warn("Nova Era: selecione exatamente um alvo para a Preparação Ativa.");return false;}
  if(key==="alchemist-project-emergency-coagulant" || key==="alchemist-school-project-regeneration") {
    if(target.actor.system?.attributes?.hp?.value<=0){ui.notifications.warn("Nova Era: o alvo precisa ter ao menos 1 PV ao preparar este efeito.");return false;}
    const kind=key==="alchemist-project-emergency-coagulant"?"coagulant":"regeneration";
    return {entry:{kind,targetActorUuid:target.actor.uuid,targetTokenUuid:target.document?.uuid??"",charges:kind==="regeneration"?2:1,expiresAt:currentWorldTime()+(kind==="regeneration"?60:3600)},message:`Preparação Ativa aplicada a <strong>${escape(target.name)}</strong>. ${kind==="coagulant"?"Dispara ao cair à metade dos PV.":"Recupera 1d4 PV no início de até dois turnos."}`};
  }
  if(key==="alchemist-project-reactive-catalyst") {
    const entries=alchemistState(actor).prepared.flatMap((entry,index)=>entry&&index!==slot&&entry.projectKey!==key&&entry.container!=="mine"?[[String(index),`${index+1}. ${entry.label}`]]:[]);
    if(!entries.length){ui.notifications.warn("Nova Era: prepare outra Fórmula para vincular ao Catalisador Reativo.");return false;}
    const linked=await choose("Catalisador Reativo","Qual Fórmula será disparada?",entries);if(linked===null)return false;
    const trigger=await choose("Gatilho físico","Escolha o evento observado pelo Catalisador.",[["damage","O alvo sofre dano"],["movement","O token do alvo se move"],["turn","Começa o turno do alvo"]]);if(!trigger)return false;
    return {entry:{kind:"catalyst",targetActorUuid:target.actor.uuid,targetTokenUuid:target.document?.uuid??"",linkedSlot:Number(linked),trigger,charges:1,expiresAt:currentWorldTime()+28800},message:`Vinculado a <strong>${escape(target.name)}</strong>; a Fórmula no encaixe ${Number(linked)+1} será oferecida quando o gatilho ocorrer. Custos da Fórmula vinculada serão pagos no disparo.`};
  }
  if(key==="alchemist-project-healing-mist"){
    const center=target.center??target.document?.object?.center;if(!center||!canvas.scene){ui.notifications.warn("Nova Era: escolha um token para posicionar a Névoa Terapêutica na cena.");return false;}
    return {entry:{kind:"mist",sceneId:canvas.scene.id,originX:center.x,originY:center.y,charges:3,expiresAt:currentWorldTime()+60},message:`Névoa Terapêutica instalada na posição de <strong>${escape(target.name)}</strong>: raio de 3 m, três cargas, duração de 1 minuto. No início do turno de uma criatura voluntária na área, será oferecida a cura.`};
  }
  return false;
}

function damageType(formula,project,options={}) { const key=keyOf(project);if(key==="alchemist-school-project-frag-grenade")return"piercing";if(key==="alchemist-school-project-breach")return"bludgeoning";return options.conversionType||formula.convertedType||({igneous:"fire",cryogenic:"cold",corrosive:"acid",toxic:"poison"})[formula.compound]||"force"; }
function extraDice(formula) { return Number(formula.modifiers.includes("catalyzed"))+Number(formula.modifiers.includes("unstable")); }
function addDice(formulaText,extra) { if(!extra)return formulaText; const match=String(formulaText).match(/^(\d+)d(\d+)/); return match?`${Number(match[1])+extra}d${match[2]}`:formulaText; }
async function effect(target,key,name,rounds=10,changes=[],extra={}) { return alchemistDocumentAction(target,"effect",{effect:{name,img:ICON,origin:target.uuid,disabled:false,duration:{rounds,seconds:rounds*6,startTime:game.time?.worldTime,startRound:game.combat?.round,startTurn:game.combat?.turn},changes,flags:{[MODULE_ID]:{alchemistEffect:key,...extra}}}}); }
function tokenDistance(a,b){try{return Number(canvas.grid.measurePath([a.center,b.center]).distance??Infinity);}catch{return null;}}
async function targetsFor(actor,formula,role,sourceToken=null,rangeBonus=0) {
  const selected=[...game.user.targets],source=sourceToken??actor.getActiveTokens?.()[0]??null;
  if(role!=="utility"&&role!=="meta"&&selected.length<1){ui.notifications.warn("Nova Era: selecione um alvo no tabuleiro.");return [];}
  if(role==="movement"&&selected.length!==2){ui.notifications.warn("Nova Era: selecione exatamente dois alvos para a Transposição.");return [];}
  if(!["grenade","mine","diffuser"].includes(formula.container)&&!(["control","utility","meta","movement"].includes(role))&&selected.length!==1){ui.notifications.warn("Nova Era: selecione exatamente um alvo.");return [];}
  const baseRange=({flask:9,grenade:12,syringe:1.5,ointment:1.5,diffuser:9,mine:1.5})[formula.container],range=baseRange===undefined?undefined:baseRange+rangeBonus;
  if(source&&range!==undefined&&selected.some(token=>{const distance=tokenDistance(source,token);return distance!==null&&distance>range})){ui.notifications.warn(`Nova Era: o recipiente exige alcance de até ${range} m a partir do usuário da Fórmula.`);return [];}
  if(selected.length>1&&["grenade","diffuser","mine"].includes(formula.container)&&selected.slice(1).some(token=>{const distance=tokenDistance(selected[0],token);return distance!==null&&distance>3})){ui.notifications.warn("Nova Era: os alvos selecionados precisam estar na mesma área de 3 m.");return [];}
  if(role==="damage"&&["grenade","mine"].includes(formula.container)&&selected[0]?.center&&canvas.tokens?.placeables){
    const center=selected[0];
    const nearby=canvas.tokens.placeables.filter(token=>{const distance=token.actor?tokenDistance(center,token):null;return distance!==null&&distance<=3;});
    return nearby.length?nearby:selected;
  }
  return selected;
}
async function resolveDamage(actor,formula,project,targets,options={}) {
  const dice=addDice(project.getFlag(MODULE_ID,"dice")||"2d6",extraDice(formula)),type=damageType(formula,project,options),area=["grenade","mine"].includes(formula.container);
  const damage=await roll(actor,dice,`${project.name} — ${type}`),failed=[],affected=[];
  for(const token of targets){let amount=damage;if(area){const total=await save(token.actor,"dex");if(total>=alchemistDC(actor))amount=Math.floor(damage/2);else failed.push(token);}else if(formula.container!=="dart"&&!options.deliveryConfirmed){const attack=await roll(actor,"1d20 + @abilities.int.mod + @attributes.prof",`${project.name} — Ataque de Fórmula`);if(attack<Number(token.actor.system.attributes.ac.value??10)){await post(actor,"Fórmula evitada",`${token.name} não foi atingido.`);continue;}}amount+=await alchemistAnatomyBonus(actor,token.actor);await applyAlchemistDamage(token.actor,amount,type);affected.push(token);}
  if(formula.modifiers.includes("fragmentation")&&failed.length){const bonus=await roll(actor,dice.replace(/^\d+/,"1"),"Fragmentação");await applyAlchemistDamage(failed[0].actor,bonus,type);}
  return area?failed:affected;
}
async function resolveHealing(actor,formula,project,targets) {
  const base=project.getFlag(MODULE_ID,"dice")||"1d8",dice=addDice(base,extraDice(formula)),addInt=!keyOf(project).includes("regeneration"),amount=await roll(actor,`${dice}${addInt?" + @abilities.int.mod":""}`,project.name);
  for(const token of targets)await applyAlchemistHealing(token.actor,amount+await alchemistAnatomyBonus(actor,token.actor));
  return targets;
}
async function resolveSupport(actor,formula,project,targets,options={}) {
  const key=keyOf(project),target=targets[0]?.actor;if(!target)return post(actor,project.name,"A Fórmula foi ativada; resolva a propriedade narrativa descrita no Projeto.");
  if(project.getFlag(MODULE_ID,"role")==="debuff"){
    if(formula.container==="dart"){
      if(options.dartHit!==true&&!await confirm("Entrega por Dardo",`O ataque da arma acertou ${escape(target.name)}? A Fórmula não realiza um segundo ataque.`))return false;
    }else if(!options.deliveryConfirmed){
      const attack=await roll(actor,"1d20 + @abilities.int.mod + @attributes.prof",`${project.name} — Ataque de Fórmula`);
      if(attack<Number(target.system?.attributes?.ac?.value??10)){await post(actor,"Fórmula evitada",`${escape(target.name)} não foi atingido.`);return false;}
    }
  }
  if(key.endsWith("stimulant")||key.endsWith("suppressor")){const ability=formula.option;if(!CONFIG.DND5E.abilities[ability])return false;const value=key.endsWith("stimulant")?2:-2;await effect(target,keyOf(project),project.name,10,[{key:`system.abilities.${ability}.bonuses.check`,mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:String(value),priority:20}],value<0?{saveEndTurn:{ability:"con",dc:alchemistDC(actor)}}:{});}
  else if(key==="alchemist-project-regeneration-inhibitor")await effect(target,key,project.name,10,[],{healingReduction:2*alchemistProficiency(actor),saveEndTurn:{ability:"con",dc:alchemistDC(actor)}});
  else if(key==="alchemist-school-project-prism")await effect(target,key,project.name,10,[],{alchemistDamageWard:"prism",alchemistWardAmount:await roll(actor,"1d6",`${project.name} — redução preparada`),sourceUuid:actor.uuid});
  else if(key==="alchemist-project-adaptive-matrix")await effect(target,key,project.name,10,[],{alchemistAdaptiveMatrix:true,sourceUuid:actor.uuid});
  else if(key==="alchemist-project-converter"){
    const type=options.converterType??await choose(project.name,"Escolha o tipo de dano armazenado.",[["acid","Ácido"],["lightning","Elétrico"],["fire","Fogo"],["cold","Frio"]]);if(!type)return false;
    await effect(target,key,project.name,10,[],{alchemistConverterType:type,alchemistWardAmount:Math.max(0,await roll(actor,"2d6 + @abilities.int.mod",`${project.name} — redução preparada`)),sourceUuid:actor.uuid});
  }
  else if(key==="alchemist-project-neutralizer"){
    const option=options.neutralizerMode??await choose(project.name,"Escolha a aplicação.",[["antidote","Antídoto — repetir resistência contra Veneno com +2"],["prophylactic","Profilático — proteção por 10 minutos"]]);if(!option)return false;
    if(option==="prophylactic")await effect(target,key,`${project.name} — Profilático`,100,[],{alchemistDamageWard:"prophylactic",alchemistWardAmount:Math.max(0,await roll(actor,"1d6 + @abilities.int.mod",`${project.name} — redução preparada`)),sourceUuid:actor.uuid,alchemistPoisonSaveBonus:2});
    else{
      const dc=options.antidoteDC??await Dialog.prompt({title:"Antídoto",content:`<form><p>Informe a CD original do Veneno que afeta ${escape(target.name)}.</p><input name="dc" type="number" min="1" max="40" value="${alchemistDC(actor)}"></form>`,label:"Rolar",callback:html=>Number(html.find("[name='dc']").val()),rejectClose:false});if(!dc)return false;
      const total=await save(target,"con")+2;await post(actor,"Antídoto",`${escape(target.name)} totalizou ${total} na salvaguarda com +2 contra CD ${dc}. ${total>=dc?"No sucesso, o efeito de Veneno correspondente termina.":"O Veneno permanece."}`);
      if(total>=dc){const poisons=[...target.effects].filter(active=>active.statuses?.has?.("poisoned")||/veneno|poison/i.test(active.name));if(poisons.length===1)await alchemistDocumentAction(target,"effect-delete",{id:poisons[0].id});}
    }
  }
  else if(key==="alchemist-school-project-neural"){
    const saved=await save(target,"con");if(saved>=alchemistDC(actor)){await post(actor,project.name,`${escape(target.name)} resistiu ao Inibidor Neural.`);return [];}
    await effect(target,key,project.name,1,[],{noReactions:true,alchemistExpireAtTurnStart:target.uuid});
  }
  else if(key.includes("mutagen")){const option=options.mutagenMode??await choose("Agente Mutagênico","Escolha a mutação.",[["str","Musculatura (+2 FOR)"],["dex","Reflexos (+2 DES)"],["skin","Epiderme (redução física)"],["organs","Órgãos Adaptativos"],["senses","Sentidos Predatórios"]]);if(!option)return false;const changes=option==="str"||option==="dex"?[{key:`system.abilities.${option}.bonuses.check`,mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:"2",priority:20}]:[];await effect(target,`${key}:${option}`,`${project.name} — ${option}`,100,changes,{alchemistMutagen:option,sourceUuid:actor.uuid});if(["organs","senses"].includes(option))await post(actor,project.name,`A vantagem específica de ${escape(option)} está marcada na ficha de ${escape(target.name)}; confirme o tipo de teste ao rolar.`);}
  else if(key==="alchemist-project-symbiotic-catalyst"){
    const mode=options.symbiosisMode??await choose(project.name,"Escolha uma Simbiose.",[["restorative","Restauradora — PB PV temporários após cura"],["stimulant","Estimulante — 1,5 m após Fórmula benéfica"],["stabilizer","Estabilizadora — +2 na próxima salvaguarda"]]);if(!mode)return false;
    await effect(target,`${key}:${mode}`,`${project.name} — ${mode}`,10,[],{alchemistSymbiosis:mode,sourceUuid:actor.uuid});
  }
  else await post(actor,project.name,`A aplicação em ${escape(target.name)} exige escolha ou arbitragem específica: ${project.system.description.value}`);
  return targets;
}
async function resolveCoating(actor,project,targets,options){
  const target=targets[0]?.actor;if(!target||!options.coatingMode||!options.coatingItemUuid||!options.coatingType)return [];
  const item=target.items.find(value=>value.uuid===options.coatingItemUuid);if(!item)return [];
  const key=`alchemist-coating:${item.uuid}`;
  const extra={alchemistCoatingMode:options.coatingMode,alchemistCoatingItemUuid:item.uuid,alchemistCoatingType:options.coatingType,sourceUuid:actor.uuid};
  if(options.coatingMode==="protective")Object.assign(extra,{alchemistDamageWard:"coating",alchemistWardAmount:Math.max(0,await roll(actor,"1d6 + @abilities.int.mod",`${project.name} — proteção preparada`))});
  await effect(target,key,`${project.name} — ${item.name}`,10,[],extra);
  await post(actor,project.name,`<strong>${escape(item.name)}</strong> recebeu Revestimento ${options.coatingMode==="protective"?"Protetor":"Elemental"} de ${escape(options.coatingType)} por 1 minuto.`);
  return targets;
}
async function resolveTransposition(actor,targets){if(targets.length!==2)return ui.notifications.warn("Nova Era: selecione exatamente dois alvos para a Transposição.");const [a,b]=targets,distance=tokenDistance(a,b);if(distance!==null&&distance>18)return ui.notifications.warn("Nova Era: os dois alvos devem estar a até 18 m um do outro.");if(a.document?.width!==b.document?.width||a.document?.height!==b.document?.height)ui.notifications.info("Nova Era: confirme que os dois espaços comportam os alvos após a troca.");const first={x:a.document.x,y:a.document.y},second={x:b.document.x,y:b.document.y};await alchemistDocumentAction(a.document,"token-update",{change:second});await alchemistDocumentAction(b.document,"token-update",{change:first});}
async function resolveFormula(actor,formula,project,targets,options={}) {
  const role=project.getFlag(MODULE_ID,"role"),key=keyOf(project);
  if(role==="damage"&&["alchemist-project-charge","alchemist-school-project-frag-grenade"].includes(key))return resolveDamage(actor,formula,project,targets,options);
  if(role==="healing"&&key==="alchemist-project-restorative")return resolveHealing(actor,formula,project,targets);
  if(["support","debuff","defense"].includes(role))return resolveSupport(actor,formula,project,targets,options);
  if(key==="alchemist-project-coating")return resolveCoating(actor,project,targets,options);
  if(key==="alchemist-project-transposition")return resolveTransposition(actor,targets);
  return post(actor,project.name,`A Fórmula foi registrada, mas esta propriedade ainda requer resolução guiada pelo Mestre: ${project.system.description.value}`);
}
export async function resolveDelayedAlchemistFormula(actor,formula,target){
  const project=actor.items.find(item=>keyOf(item)===formula?.projectKey)??worldItem(formula?.projectKey);
  if(!project||!target)return false;
  await resolveFormula(actor,formula,project,[target]);
  await post(actor,"Fórmula Retardada",`<strong>${escape(formula.label)}</strong> atingiu o momento programado.`);
  return true;
}
async function unstableBacklash(actor,formula,project) {
  if(!formula.modifiers.includes("unstable"))return;let results=[await roll(actor,"1d6","Instabilidade")];if(formula.modifiers.includes("stable"))results.push(await roll(actor,"1d6","Instabilidade — Estável"));if(Math.max(...results)<=2)await applyAlchemistDamage(actor,await roll(actor,`${project.getFlag(MODULE_ID,"grade")}d6`,`Falha Instável — ${actor.name}`));
}
async function experimentationResult(actor,cost,formula) {
  let results=[await roll(actor,"1d6","Experimentação Perigosa")];if(formula.modifiers.includes("stable"))results.push(await roll(actor,"1d6","Experimentação — Estável"));const result=Math.max(...results);
  if(result===1&&alchemistState(actor).points)await spendReagentPoints(actor,1,"Reação Instável");
  if(result===5)await gainReagentPoints(actor,1,"Resultado Favorável");
  if(result===6)await gainReagentPoints(actor,Math.min(2,cost),"Descoberta — Eficiência");
  await post(actor,"Resultado da Experimentação",({1:"Reação Instável: −1 PR adicional.",2:"Reação Estável.",3:"Reação Estável.",4:"Reação Estável.",5:"Favorável: +1 PR.",6:"Descoberta: até 2 PR recuperados."})[result]);
}

async function planFormulaChoices(actor,formula,project,targets){
  const key=keyOf(project),choices={};
  if(["debuff","damage"].includes(project.getFlag(MODULE_ID,"role"))&&formula.container==="dart"){
    if(!await confirm("Entrega por Dardo",`O ataque da arma acertou ${escape(targets[0]?.name)}? A Fórmula não realiza um segundo ataque.`))return null;
    choices.dartHit=true;
  }
  if(key==="alchemist-project-converter"){
    choices.converterType=await choose(project.name,"Escolha o tipo de dano armazenado.",[["acid","Ácido"],["lightning","Elétrico"],["fire","Fogo"],["cold","Frio"]]);
    if(!choices.converterType)return null;
  }
  if(key==="alchemist-project-neutralizer"){
    choices.neutralizerMode=await choose(project.name,"Escolha a aplicação.",[["antidote","Antídoto — repetir resistência contra Veneno com +2"],["prophylactic","Profilático — proteção por 10 minutos"]]);
    if(!choices.neutralizerMode)return null;
    if(choices.neutralizerMode==="antidote"){
      choices.antidoteDC=await Dialog.prompt({title:"Antídoto",content:`<form><p>Informe a CD original do Veneno que afeta ${escape(targets[0]?.name)}.</p><input name="dc" type="number" min="1" max="40" value="${alchemistDC(actor)}"></form>`,label:"Continuar",callback:html=>Number(html.find("[name='dc']").val()),rejectClose:false});
      if(!Number.isFinite(choices.antidoteDC)||choices.antidoteDC<1)return null;
    }
  }
  if(key==="alchemist-project-mutagen"){
    choices.mutagenMode=await choose(project.name,"Escolha a mutação.",[["str","Musculatura (+2 FOR)"],["dex","Reflexos (+2 DES)"],["skin","Epiderme (redução física)"],["organs","Órgãos Adaptativos"],["senses","Sentidos Predatórios"]]);
    if(!choices.mutagenMode)return null;
  }
  if(key==="alchemist-project-symbiotic-catalyst"){
    choices.symbiosisMode=await choose(project.name,"Escolha uma Simbiose.",[["restorative","Restauradora — PB PV temporários após cura"],["stimulant","Estimulante — 1,5 m após Fórmula benéfica"],["stabilizer","Estabilizadora — +2 na próxima salvaguarda"]]);
    if(!choices.symbiosisMode)return null;
  }
  if(key==="alchemist-project-coating"){
    const target=targets[0]?.actor;
    if(!target)return null;
    choices.coatingMode=await choose(project.name,"Escolha a aplicação do Revestimento.",[["elemental","Elemental — +1d4 na arma"],["protective","Protetor — reduz primeiro dano do tipo"]]);if(!choices.coatingMode)return null;
    const items=target.items.filter(item=>choices.coatingMode==="elemental"?item.type==="weapon":item.type==="equipment"&&["light","medium","heavy","shield"].includes(item.system?.type?.value??item.system?.type));
    choices.coatingItemUuid=await choose("Equipamento revestido","Escolha a arma, armadura ou escudo em contato com o Unguento.",items.map(item=>[item.uuid,item.name]));if(!choices.coatingItemUuid)return null;
    choices.coatingType=await choose("Composto do Revestimento","Escolha o tipo elemental.",[["acid","Ácido"],["fire","Fogo"],["cold","Frio"],["poison","Veneno"]]);if(!choices.coatingType)return null;
  }
  return choices;
}

export async function activateAlchemistFormula(actor,slot,{improvised=false,triggered=false,targetsOverride=null,sourceToken=null,skipConfirm=false,platformItemUuid=null,deliveryConfirmed=false}={}) {
  if(!isNovaEraAlchemist(actor)||!alchemistCanOperate(actor))return false;const state=alchemistState(actor),formula=improvised?state.improvised:state.prepared[slot];if(!formula)return false;
  const project=actor.items.find(item=>keyOf(item)===formula.projectKey)??worldItem(formula.projectKey);if(!project)return ui.notifications.warn("Nova Era: Projeto da Fórmula não encontrado.");
  const turn=turnKey();if(!triggered&&turn&&actor.getFlag(MODULE_ID,"alchemistCatalysisTurn")===turn)return ui.notifications.warn("Nova Era: somente uma Fórmula pode ser ativada voluntariamente por turno.");
  const modules=platformItemUuid?alchemistPlatformModules(actor,platformItemUuid):[];
  if(platformItemUuid&&!modules.length){ui.notifications.warn("Nova Era: a Plataforma escolhida não está configurada ou equipada.");return false;}
  if(deliveryConfirmed&&(!modules.includes("injector")||formula.container!=="syringe")){ui.notifications.warn("Nova Era: a entrega sem segundo ataque exige Injetor e Fórmula de Seringa.");return false;}
  const rangeBonus=modules.includes("launcher")&&["flask","grenade"].includes(formula.container)?6:0;
  const targets=targetsOverride??await targetsFor(actor,formula,project.getFlag(MODULE_ID,"role"),sourceToken,rangeBonus);if(!targets.length&&!['utility','meta','control'].includes(project.getFlag(MODULE_ID,"role")))return false;
  const mechanical=new Set(["alchemist-project-charge","alchemist-project-restorative","alchemist-project-stimulant","alchemist-project-suppressor","alchemist-project-reactive-catalyst","alchemist-project-emergency-coagulant","alchemist-project-regeneration-inhibitor","alchemist-project-healing-mist","alchemist-project-transposition","alchemist-project-neutralizer","alchemist-project-converter","alchemist-project-adaptive-matrix","alchemist-project-symbiotic-catalyst","alchemist-project-coating","alchemist-school-project-regeneration","alchemist-school-project-neural","alchemist-school-project-frag-grenade","alchemist-school-project-prism"]);
  if(["alchemist-project-converter","alchemist-project-adaptive-matrix","alchemist-school-project-prism","alchemist-project-coating"].includes(keyOf(project))&&!game.modules.get("midi-qol")?.active){ui.notifications.warn("Nova Era: este efeito automático exige Midi QOL ativo.");return false;}
  if(!mechanical.has(keyOf(project))&&!await confirm("Resolução guiada",`<strong>${escape(project.name)}</strong> ainda exige decisões mecânicas do Mestre no Foundry. Continuar e gastar PR para resolver conforme a descrição do Projeto?`))return false;
  const delayed=formula.modifiers.includes("delayed"),persistent=delayed||["alchemist-project-emergency-coagulant","alchemist-school-project-regeneration","alchemist-project-reactive-catalyst","alchemist-project-healing-mist"].includes(keyOf(project));
  if(persistent&&state.active.filter(entry=>entry.charges>0&&entry.expiresAt>currentWorldTime()).length>=alchemistProficiency(actor)){ui.notifications.warn("Nova Era: o limite de Preparações Ativas já foi atingido.");return false;}
  let plan=null;
  if(delayed){
    if(targets.length!==1||!targets[0]?.actor){ui.notifications.warn("Nova Era: Retardado exige exatamente um alvo selecionado.");return false;}
    const seconds=await Dialog.prompt({title:"Modificador Retardado",content:'<form><p>Adie o efeito de 1 rodada (6 segundos) a 10 minutos.</p><input name="seconds" type="number" min="6" max="600" value="6" required></form>',label:"Programar",callback:html=>Number(html.find("[name='seconds']").val()),rejectClose:false});
    if(!Number.isFinite(seconds)||seconds<6||seconds>600)return false;
    const dueAt=currentWorldTime()+seconds;
    plan={entry:{kind:"delayed",formula,targetActorUuid:targets[0].actor.uuid,targetTokenUuid:targets[0].document?.uuid??"",dueAt,dueCombatId:game.combat?.started?game.combat.id:"",dueRound:game.combat?.started?Number(game.combat.round)+Math.ceil(seconds/6):0,charges:1,expiresAt:dueAt+3600},message:`<strong>${escape(formula.label)}</strong> foi programada para disparar em ${seconds} segundos sobre ${escape(targets[0].name)}.`};
  }else if(persistent)plan=await planPersistentProject(actor,project,targets,slot);
  if(persistent&&!plan)return false;
  const choices=delayed||plan?{}:await planFormulaChoices(actor,formula,project,targets);
  if(choices===null)return false;
  choices.deliveryConfirmed=deliveryConfirmed;
  const transmutation=delayed||plan?{principles:[],extraCost:0,conversionType:""}:await planAlchemistTransmutation(actor,formula,project,targets);
  if(transmutation===null)return false;
  Object.assign(choices,{conversionType:transmutation.conversionType});
  let cost=formula.cost,perfect=hasAlchemistFeature(actor,"alchemist-perfect-formula")&&state.perfectFormulaSlot===slot&&!actor.getFlag(MODULE_ID,"perfectFormulaUsed");if(perfect)cost=Math.max(0,Number(component("containers",formula.container)?.getFlag(MODULE_ID,"reagentCost")??0));
  cost+=transmutation.extraCost;
  const engineered=actor.getFlag(MODULE_ID,"alchemistEngineeredModifiers")??[];
  const engineeringSpent=Number(actor.getFlag(MODULE_ID,"alchemistEngineeringSpent")??0);
  let engineering=false;
  if(!perfect&&cost>0&&hasAlchemistFeature(actor,"alchemist-engineering")&&engineeringSpent<alchemistProficiency(actor)&&formula.modifiers.some(id=>engineered.includes(id))){
    engineering=await confirm("Engenharia Alquímica",`Reduzir esta ativação em 1 PR? Restam ${alchemistProficiency(actor)-engineeringSpent} usos antes do Descanso Longo.`);
    if(engineering)cost=Math.max(0,cost-1);
  }
  const chamberSpent=Number(actor.getFlag(MODULE_ID,"alchemistChamberUsed")??0);
  let chamber=false;
  if(!perfect&&!engineering&&modules.includes("chamber")&&cost>1&&chamberSpent<alchemistProficiency(actor)){
    chamber=await confirm("Câmara Catalítica",`Reduzir esta Fórmula pela Plataforma em 1 PR (mínimo 1)? Restam ${alchemistProficiency(actor)-chamberSpent} usos neste Descanso Longo.`);
    if(chamber)cost=Math.max(1,cost-1);
  }
  if(state.points<cost){ui.notifications.warn(`Nova Era: ${actor.name} não possui ${cost} PR.`);return false;}
  if(!skipConfirm&&!await confirm("Ativar Fórmula",`Usar <strong>${escape(formula.label??formula.projectName)}</strong> por <strong>${cost} PR</strong>?`))return false;
  if(!await spendReagentPoints(actor,cost,formula.projectName))return false;if(!triggered&&turn)await actor.setFlag(MODULE_ID,"alchemistCatalysisTurn",turn);if(perfect)await actor.setFlag(MODULE_ID,"perfectFormulaUsed",true);if(engineering)await actor.setFlag(MODULE_ID,"alchemistEngineeringSpent",engineeringSpent+1);if(chamber)await actor.setFlag(MODULE_ID,"alchemistChamberUsed",chamberSpent+1);
  let affected=[];
  if(plan){if(!await queueActive(actor,plan.entry))return false;await post(actor,project.name,plan.message);}else affected=await resolveFormula(actor,formula,project,targets,choices);
  if(!plan&&mechanical.has(keyOf(project))&&Array.isArray(affected)){
    for(const principle of transmutation.principles)await applyAlchemistPrinciple(actor,affected[0]?.actor,principle);
    Hooks.callAll("novaEraAlchemistFormulaResolved",{actor,formula,project,targets:affected});
  }
  if(project.getFlag(MODULE_ID,"school")==="school-biomancer"&&!triggered)Hooks.callAll("novaEraAlchemistBiomanticFormula",{actor,formula,project,targets});
  await unstableBacklash(actor,formula,project);if(improvised){await experimentationResult(actor,cost,formula);await updateAlchemistState(actor,{improvised:null},"Experimentação resolvida");}
  else Hooks.callAll("novaEraAlchemistChanged",{actor,before:state,after:alchemistState(actor),reason:"Fórmula ativada"});return true;
}

export async function toggleAlchemistReserve(actor,index) { const state=alchemistState(actor);if(index>=state.reserveMaximum)return false;const next=index<state.reserves?index:index+1;if(state.prepared.filter(Boolean).length+next>state.capacity){ui.notifications.warn("Nova Era: não há encaixe livre para esta Reserva.");return false;}return updateAlchemistState(actor,{reserves:next},"Reservas Catalíticas"); }
export async function finalizeAlchemistReserve(actor){
  if(!alchemistCanOperate(actor))return false;const state=alchemistState(actor);if(state.reserves<1)return ui.notifications.warn("Nova Era: nenhuma Reserva Catalítica disponível.");
  const slot=state.prepared.findIndex(entry=>!entry);if(slot<0)return false;
  const formula=await buildAlchemistFormula(actor);if(!formula)return false;
  const prepared=[...state.prepared];prepared[slot]=formula;
  await updateAlchemistState(actor,{prepared,reserves:state.reserves-1},"Reserva Catalítica finalizada");
  await post(actor,"Reserva Catalítica finalizada",`O encaixe ${slot+1} agora contém <strong>${escape(formula.label)}</strong>. ${alchemistLevel(actor)>=18?"Ação Bônus, uma vez por turno.":"Ação."}`);
  return true;
}

async function recoverRest(actor,result,config) {
  if(!isNovaEraAlchemist(actor)||!alchemistResponsible(actor))return;const long=result?.longRest===true||result?.type==="long"||config?.type==="long",short=long||result?.shortRest===true||result?.type==="short"||config?.type==="short";if(!short)return;
  const state=alchemistState(actor);if(long){await actor.unsetFlag(MODULE_ID,"perfectFormulaUsed");await actor.setFlag(MODULE_ID,"alchemistEngineeringSpent",0);await updateAlchemistState(actor,{points:state.maximum,shortRecoveryUsed:false,improvised:null},"Descanso Longo");}
  else if(!state.shortRecoveryUsed)await updateAlchemistState(actor,{points:Math.min(state.maximum,state.points+Math.floor(state.maximum/2)),shortRecoveryUsed:true},"Descanso Curto");
}

export function registerAlchemistAutomation() {
  game.socket.on(`module.${MODULE_ID}`,data=>{if(!game.user.isGM||data?.type!==SOCKET_TYPE)return;void executeDocument(data.uuid,data.action,data.data);});
  Hooks.on("dnd5e.restCompleted",(actor,result,config)=>void recoverRest(actor,result,config));
  Hooks.on("updateItem",(item,changed)=>{if(item.type==="class"&&item.system?.identifier==="alchemist-nova-era"&&foundry.utils.getProperty(changed,"system.levels")!==undefined)setTimeout(()=>void updateAlchemistState(item.parent,{},"Progressão"),200);});
  for(const actor of game.actors.filter(isNovaEraAlchemist))setTimeout(()=>void updateAlchemistState(actor,{},"Sincronização"),1200);
}
