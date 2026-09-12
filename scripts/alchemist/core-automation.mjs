import { MODULE_ID } from "../constants.mjs";
import { ALCHEMIST_PR } from "../content/alchemist-data.mjs";

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
function normalizeFormula(entry) { return entry && typeof entry === "object" ? { label:String(entry.label??entry.projectName??""), projectKey:String(entry.projectKey??""), projectName:String(entry.projectName??""), compound:String(entry.compound??""), container:String(entry.container??"flask"), modifiers:Array.isArray(entry.modifiers)?entry.modifiers.map(String):[], cost:Math.max(0,Number(entry.cost)||0), improvised:Boolean(entry.improvised) } : null; }
export function alchemistState(actor) {
  const raw=actor?.getFlag(MODULE_ID,STATE_FLAG) ?? {}, maximum=alchemistMaximum(actor), capacity=alchemistLaboratoryCapacity(actor), reserveMaximum=alchemistReserveCapacity(actor);
  const prepared=Array.from({length:capacity},(_,i)=>normalizeFormula(raw.prepared?.[i]));
  return { points:clamp(raw.points ?? maximum,0,maximum), maximum, prepared, capacity, reserves:clamp(raw.reserves??reserveMaximum,0,reserveMaximum), reserveMaximum, improvised:normalizeFormula(raw.improvised), shortRecoveryUsed:Boolean(raw.shortRecoveryUsed), perfectFormulaSlot:Number.isInteger(raw.perfectFormulaSlot)?raw.perfectFormulaSlot:null };
}

function responsible(actor) {
  const owners=game.users.filter(user=>user.active&&!user.isGM&&actor.testUserPermission(user,"OWNER")).sort((a,b)=>a.id.localeCompare(b.id));
  return owners[0]?.id===game.user.id||(!owners.length&&game.user.isGM&&game.users.activeGM?.id===game.user.id);
}
function turnKey() { return game.combat?.started ? `${game.combat.id}:${game.combat.round}:${game.combat.turn}` : `free:${Math.floor(Date.now()/6000)}`; }
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
    else { const absorbed=Math.min(Number(hp.temp??0),amount); await actor.update({"system.attributes.hp.temp":Number(hp.temp??0)-absorbed,"system.attributes.hp.value":Math.max(0,Number(hp.value??0)-amount+absorbed)},{novaEraAlchemist:true}); }
  }
  if(type==="effect") {
    const old=actor.effects.find(effect=>effect.getFlag(MODULE_ID,"alchemistEffect")===data.effect.flags?.[MODULE_ID]?.alchemistEffect); if(old)await old.delete({novaEraAlchemist:true});
    await actor.createEmbeddedDocuments("ActiveEffect",[data.effect],{novaEraAlchemist:true});
  }
  if(type==="token-update") await document.update(data.change??{},{novaEraAlchemist:true});
  return true;
}
export async function alchemistDocumentAction(document,type,data={}) {
  if(!document)return false;
  if(game.user.isGM||document.isOwner)return executeDocument(document.uuid,type,data);
  game.socket.emit(`module.${MODULE_ID}`,{type:SOCKET_TYPE,uuid:document.uuid,action:type,data}); return true;
}
export async function applyAlchemistDamage(actor,amount){return alchemistDocumentAction(actor,"hp",{mode:"damage",amount});}
export async function applyAlchemistHealing(actor,amount){return alchemistDocumentAction(actor,"hp",{mode:"heal",amount});}

async function roll(actor,formula,flavor) { const result=await new Roll(formula,actor.getRollData()).evaluate(); await result.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor}); return Number(result.total); }
async function save(actor,ability) { return Number(firstRoll(await actor.rollSavingThrow({ability}))?.total??0); }
async function post(actor,title,text) { return ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<section class="nova-era alchemist-chat"><h2>${title}</h2><p>${text}</p><blockquote>“Toda descoberta começa como uma hipótese.”</blockquote></section>`}); }
async function choose(title,prompt,entries) {
  if(!entries.length)return null;
  return Dialog.prompt({title,content:`<form class="nova-era alchemist-choice"><p>${prompt}</p><div class="form-group"><select name="choice">${entries.map(([value,label])=>`<option value="${escape(value)}">${escape(label)}</option>`).join("")}</select></div></form>`,label:"Confirmar",callback:html=>String(html.find("[name='choice']").val()),rejectClose:false});
}
async function confirm(title,text){return Dialog.confirm({title,content:`<p>${text}</p>`,yes:()=>true,no:()=>false,defaultYes:true});}

export async function updateAlchemistState(actor,patch,reason="Atualização") {
  if(!isNovaEraAlchemist(actor)||!actor.isOwner)return alchemistState(actor);
  const before=alchemistState(actor),next={...before,...patch};
  next.points=clamp(next.points,0,next.maximum); next.prepared=Array.from({length:next.capacity},(_,i)=>normalizeFormula(next.prepared?.[i])); next.reserves=clamp(next.reserves,0,next.reserveMaximum);
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

export async function buildAlchemistFormula(actor,{improvised=false}={}) {
  const projects=knownProjects(actor); if(!projects.length){ui.notifications.warn("Nova Era: nenhum Projeto foi registrado no Diário deste Alquimista.");return null;}
  const projectKey=await choose(improvised?"Experimentação Perigosa":"Preparar Fórmula","Escolha um Projeto registrado no Diário.",projects.map(item=>[keyOf(item),`${item.name} — Grau ${["","I","II","III","IV"][Number(item.getFlag(MODULE_ID,"grade"))]}`])); if(!projectKey)return null;
  const project=actor.items.find(item=>keyOf(item)===projectKey),compatible=project.getFlag(MODULE_ID,"containers")??[];
  const allContainers=game.items.filter(item=>item.getFlag(MODULE_ID,"group")==="containers"); const choices=(compatible.length?allContainers.filter(item=>compatible.some(id=>keyOf(item).endsWith(`-${id}`))):allContainers);
  const containerKey=await choose("Recipiente","Como a Fórmula será entregue?",choices.map(item=>[keyOf(item).replace("alchemist-container-",""),`${item.name} • +${item.getFlag(MODULE_ID,"reagentCost")??0} PR`])); if(!containerKey)return null;
  const compounds=project.getFlag(MODULE_ID,"compounds")??[]; let compound="";
  if(compounds.length){compound=await choose("Composto","Escolha o princípio ativo.",compounds.map(id=>{const item=component("compounds",id);return[id,item?.name??id];}));if(!compound)return null;}
  const maxModifiers=alchemistLevel(actor)>=10?2:alchemistLevel(actor)>=5?1:0,modifiers=[]; const known=knownModifiers(actor);
  for(let index=0;index<maxModifiers&&known.length;index++){
    const selected=await choose("Modificadores",index?"Escolha o segundo Modificador ou finalize.":"Escolha um Modificador ou prepare sem alteração.",[["","Nenhum / finalizar"],...known.filter(item=>!modifiers.some(id=>keyOf(item).endsWith(`-${id}`))).map(item=>[keyOf(item).replace("alchemist-modifier-",""),`${item.name} • +${item.getFlag(MODULE_ID,"reagentCost")??0} PR`])]);
    if(!selected)break; modifiers.push(selected);
  }
  const formula={projectKey,projectName:project.name,compound,container:containerKey,modifiers,cost:formulaCost(project,containerKey,modifiers),improvised};
  const compoundName=component("compounds",compound)?.name; formula.label=`${project.name}${compoundName?` • ${compoundName}`:""}`; return formula;
}

export async function prepareAlchemistFormula(actor,slot=null) {
  const state=alchemistState(actor),index=Number.isInteger(slot)?slot:state.prepared.findIndex(entry=>!entry); if(index<0||index>=state.capacity){ui.notifications.warn("Nova Era: o Laboratório está completo.");return false;}
  const formula=await buildAlchemistFormula(actor); if(!formula)return false; const prepared=[...state.prepared]; prepared[index]=formula; await updateAlchemistState(actor,{prepared},`Fórmula preparada: ${formula.label}`); await post(actor,"Fórmula preparada",`O espaço ${index+1} do Laboratório agora contém <strong>${escape(formula.label)}</strong> (${formula.cost} PR).`); return true;
}
export async function clearAlchemistFormula(actor,slot) { const state=alchemistState(actor),prepared=[...state.prepared]; prepared[slot]=null; return updateAlchemistState(actor,{prepared},"Espaço liberado"); }
export async function prepareDangerousExperiment(actor) { if(alchemistLevel(actor)<2)return false; const formula=await buildAlchemistFormula(actor,{improvised:true}); if(!formula)return false; await updateAlchemistState(actor,{improvised:formula},"Experimentação Perigosa"); await post(actor,"Experimentação Perigosa",`<strong>${escape(formula.label)}</strong> foi improvisada e permanece até o final do próximo turno.`); return true; }

function damageType(formula) { return ({igneous:"fire",cryogenic:"cold",corrosive:"acid",toxic:"poison"})[formula.compound]??"force"; }
function extraDice(formula) { return Number(formula.modifiers.includes("catalyzed"))+Number(formula.modifiers.includes("unstable")); }
function addDice(formulaText,extra) { if(!extra)return formulaText; const match=String(formulaText).match(/^(\d+)d(\d+)/); return match?`${Number(match[1])+extra}d${match[2]}`:formulaText; }
async function effect(target,key,name,rounds=10,changes=[]) { return alchemistDocumentAction(target,"effect",{effect:{name,img:ICON,origin:target.uuid,disabled:false,duration:{rounds,startRound:game.combat?.round,startTurn:game.combat?.turn},changes,flags:{[MODULE_ID]:{alchemistEffect:key}}}}); }
async function targetsFor(formula,role) {
  const selected=[...game.user.targets]; if(role==="utility"||role==="meta"||role==="trigger")return selected;
  if(formula.container==="grenade"||formula.container==="mine"||role==="control") { if(!selected.length)ui.notifications.warn("Nova Era: selecione as criaturas na área."); return selected; }
  if(selected.length!==1){ui.notifications.warn("Nova Era: selecione exatamente um alvo.");return [];} return selected;
}
async function resolveDamage(actor,formula,project,targets) {
  const dice=addDice(project.getFlag(MODULE_ID,"dice")||"2d6",extraDice(formula)),type=damageType(formula),area=["grenade","mine"].includes(formula.container);
  const damage=await roll(actor,dice,`${project.name} — ${type}`),failed=[];
  for(const token of targets){let amount=damage;if(area){const total=await save(token.actor,"dex");if(total>=alchemistDC(actor))amount=Math.floor(damage/2);else failed.push(token);}else{const attack=await roll(actor,"1d20 + @abilities.int.mod + @attributes.prof",`${project.name} — Ataque de Fórmula`);if(attack<Number(token.actor.system.attributes.ac.value??10)){await post(actor,"Fórmula evitada",`${token.name} não foi atingido.`);continue;}}await applyAlchemistDamage(token.actor,amount);}
  if(formula.modifiers.includes("fragmentation")&&failed.length){const bonus=await roll(actor,dice.replace(/^\d+/,"1"),"Fragmentação");await applyAlchemistDamage(failed[0].actor,bonus);}
}
async function resolveHealing(actor,formula,project,targets) {
  const base=project.getFlag(MODULE_ID,"dice")||"1d8",dice=addDice(base,extraDice(formula)),addInt=!keyOf(project).includes("regeneration"),amount=await roll(actor,`${dice}${addInt?" + @abilities.int.mod":""}`,project.name);
  for(const token of targets)await applyAlchemistHealing(token.actor,amount);
}
async function resolveSupport(actor,formula,project,targets) {
  const key=keyOf(project),target=targets[0]?.actor;if(!target)return post(actor,project.name,"A Fórmula foi ativada; resolva a propriedade narrativa descrita no Projeto.");
  if(key.endsWith("stimulant")||key.endsWith("suppressor")){const ability=await choose(project.name,"Escolha o atributo.",Object.entries(CONFIG.DND5E.abilities).map(([id,label])=>[id,game.i18n.localize(label.label??label)]));if(!ability)return false;const value=key.endsWith("stimulant")?2:-2;await effect(target,keyOf(project),project.name,10,[{key:`system.abilities.${ability}.bonuses.check`,mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:String(value),priority:20}]);}
  else if(key.includes("mutagen")){const option=await choose("Agente Mutagênico","Escolha a mutação.",[["str","Musculatura (+2 FOR)"],["dex","Reflexos (+2 DES)"],["skin","Epiderme (redução física)"],["organs","Órgãos Adaptativos"],["senses","Sentidos Predatórios"]]);const changes=option==="str"||option==="dex"?[{key:`system.abilities.${option}.bonuses.check`,mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:"2",priority:20}]:[];await effect(target,`${key}:${option}`,`${project.name} — ${option}`,100,changes);}
  else await effect(target,key,project.name,10,[]);
}
async function resolveTransposition(actor,targets){if(targets.length!==2)return ui.notifications.warn("Nova Era: selecione exatamente dois alvos para a Transposição.");const [a,b]=targets;const first={x:a.document.x,y:a.document.y},second={x:b.document.x,y:b.document.y};await alchemistDocumentAction(a.document,"token-update",{change:second});await alchemistDocumentAction(b.document,"token-update",{change:first});}
async function resolveFormula(actor,formula,project,targets) {
  const role=project.getFlag(MODULE_ID,"role");
  if(role==="damage")return resolveDamage(actor,formula,project,targets);
  if(role==="healing")return resolveHealing(actor,formula,project,targets);
  if(["support","debuff","defense"].includes(role))return resolveSupport(actor,formula,project,targets);
  if(keyOf(project)==="alchemist-project-transposition")return resolveTransposition(actor,targets);
  return post(actor,project.name,`Fórmula ativada por <strong>${escape(component("containers",formula.container)?.name??formula.container)}</strong>. ${project.system.description.value}`);
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

export async function activateAlchemistFormula(actor,slot,{improvised=false}={}) {
  if(!isNovaEraAlchemist(actor)||!responsible(actor))return false;const state=alchemistState(actor),formula=improvised?state.improvised:state.prepared[slot];if(!formula)return false;
  const project=actor.items.find(item=>keyOf(item)===formula.projectKey)??worldItem(formula.projectKey);if(!project)return ui.notifications.warn("Nova Era: Projeto da Fórmula não encontrado.");
  const turn=turnKey();if(actor.getFlag(MODULE_ID,"alchemistCatalysisTurn")===turn)return ui.notifications.warn("Nova Era: somente uma Fórmula pode ser ativada voluntariamente por turno.");
  const targets=await targetsFor(formula,project.getFlag(MODULE_ID,"role"));if(!targets.length&&!['utility','meta','trigger','control'].includes(project.getFlag(MODULE_ID,"role")))return false;
  let cost=formula.cost,perfect=hasAlchemistFeature(actor,"alchemist-perfect-formula")&&state.perfectFormulaSlot===slot&&!actor.getFlag(MODULE_ID,"perfectFormulaUsed");if(perfect)cost=Math.max(0,Number(component("containers",formula.container)?.getFlag(MODULE_ID,"reagentCost")??0));
  if(!await confirm("Ativar Fórmula",`Usar <strong>${escape(formula.label??formula.projectName)}</strong> por <strong>${cost} PR</strong>?`))return false;
  if(!await spendReagentPoints(actor,cost,formula.projectName))return false;await actor.setFlag(MODULE_ID,"alchemistCatalysisTurn",turn);if(perfect)await actor.setFlag(MODULE_ID,"perfectFormulaUsed",true);
  await resolveFormula(actor,formula,project,targets);await unstableBacklash(actor,formula,project);if(improvised){await experimentationResult(actor,cost,formula);await updateAlchemistState(actor,{improvised:null},"Experimentação resolvida");}
  else Hooks.callAll("novaEraAlchemistChanged",{actor,before:state,after:alchemistState(actor),reason:"Fórmula ativada"});return true;
}

export async function toggleAlchemistReserve(actor,index) { const state=alchemistState(actor);if(index>=state.reserveMaximum)return false;return updateAlchemistState(actor,{reserves:index<state.reserves?index:index+1},"Reservas Catalíticas"); }

async function recoverRest(actor,result,config) {
  if(!isNovaEraAlchemist(actor)||!responsible(actor))return;const long=result?.longRest===true||result?.type==="long"||config?.type==="long",short=long||result?.shortRest===true||result?.type==="short"||config?.type==="short";if(!short)return;
  const state=alchemistState(actor);if(long){await actor.unsetFlag(MODULE_ID,"perfectFormulaUsed");await updateAlchemistState(actor,{points:state.maximum,shortRecoveryUsed:false,improvised:null},"Descanso Longo");}
  else if(!state.shortRecoveryUsed)await updateAlchemistState(actor,{points:Math.min(state.maximum,state.points+Math.floor(state.maximum/2)),shortRecoveryUsed:true},"Descanso Curto");
}

export function registerAlchemistAutomation() {
  game.socket.on(`module.${MODULE_ID}`,data=>{if(!game.user.isGM||data?.type!==SOCKET_TYPE)return;void executeDocument(data.uuid,data.action,data.data);});
  Hooks.on("dnd5e.restCompleted",(actor,result,config)=>void recoverRest(actor,result,config));
  Hooks.on("updateItem",(item,changed)=>{if(item.type==="class"&&item.system?.identifier==="alchemist-nova-era"&&foundry.utils.getProperty(changed,"system.levels")!==undefined)setTimeout(()=>void updateAlchemistState(item.parent,{},"Progressão"),200);});
  for(const actor of game.actors.filter(isNovaEraAlchemist))setTimeout(()=>void updateAlchemistState(actor,{},"Sincronização"),1200);
}
