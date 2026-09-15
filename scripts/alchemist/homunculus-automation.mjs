import { MODULE_ID } from "../constants.mjs";
import { activateAlchemistFormula, alchemistCanOperate, alchemistDocumentAction, alchemistIntelligence, alchemistLevel, alchemistProficiency, alchemistResponsible, alchemistState, applyAlchemistHealing, hasAlchemistFeature, isNovaEraAlchemist, postAlchemist } from "./core-automation.mjs";

const SOCKET_TYPE="alchemistHomunculus";
const ICON="icons/creatures/magical/construct-golem-stone-blue.webp";
const LOAD_SECONDS=6;
function escape(value){return foundry.utils.escapeHTML(String(value??""));}
function homunculus(actor){return game.actors.find(other=>other.getFlag(MODULE_ID,"alchemistHomunculusMaster")===actor.uuid)??null;}
function sourceToken(actor){return actor.getActiveTokens?.()[0]??null;}
function bodyExists(actor){return game.scenes?.some(scene=>scene.tokens?.some(token=>token.actorId===actor.id))??false;}
function distance(a,b){try{return Number(canvas.grid.measurePath([a.center,b.center]).distance??Infinity);}catch{return Infinity;}}
function turnKey(){return game.combat?.started?`${game.combat.id}:${game.combat.round}:${game.combat.turn}`:"";}
export function alchemistHomunculusDeliveryReady(servant,{worldTime=Number(game.time?.worldTime??0),combat=game.combat}={}){
  const readyAt=Number(servant?.getFlag?.(MODULE_ID,"alchemistCarriedReadyAt")??0);
  const readyRound=Number(servant?.getFlag?.(MODULE_ID,"alchemistCarriedReadyRound")??0);
  const readyCombat=String(servant?.getFlag?.(MODULE_ID,"alchemistCarriedCombatId")??"");
  if(worldTime>=readyAt)return true;
  return Boolean(readyCombat&&combat?.started&&combat.id===readyCombat&&Number(combat.round)>=readyRound);
}
async function applyDodge(master,servant){
  await alchemistDocumentAction(servant,"effect",{effect:{name:"Homúnculo — Esquiva",img:ICON,origin:master.uuid,disabled:false,duration:{seconds:6,rounds:1,startTime:game.time?.worldTime,startRound:game.combat?.round,startTurn:game.combat?.turn},changes:[{key:"flags.midi-qol.grants.disadvantage.attack.all",mode:CONST.ACTIVE_EFFECT_MODES.OVERRIDE,value:"1",priority:20}],flags:{[MODULE_ID]:{alchemistEffect:"homunculus-dodge",alchemistHomunculusDodge:true}}}});
  await postAlchemist(master,"Homúnculo — Esquiva",`${escape(servant.name)} busca segurança; ataques contra ele têm desvantagem até o início de seu próximo turno.`);
}
async function clearDodge(servant){for(const effect of [...(servant.effects??[])].filter(value=>value.getFlag(MODULE_ID,"alchemistHomunculusDodge")))await alchemistDocumentAction(servant,"effect-delete",{id:effect.id});}

async function createHomunculus(data){
  if(!game.user.isGM||game.users.activeGM?.id!==game.user.id)return false;
  const master=await fromUuid(data.masterUuid),requester=game.users.get?.(data.userId)??game.users.find(user=>user.id===data.userId);
  if(!isNovaEraAlchemist(master)||alchemistLevel(master)<10||homunculus(master)||!requester?.active||!master.testUserPermission(requester,"OWNER"))return false;
  const reconstruction=Boolean(master.getFlag(MODULE_ID,"alchemistHomunculusCreated")),price=25*alchemistProficiency(master),gold=Number(master.system?.currency?.gp??0);
  if(reconstruction&&gold<price){ui.notifications.warn(`Nova Era: reconstrução do Homúnculo exige ${price} PO.`);return false;}
  const owners=Object.fromEntries(Object.entries(master.ownership??{}).filter(([id,level])=>id!=="default"&&Number(level)>=CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
  const hp=5+4*alchemistLevel(master),prof=alchemistProficiency(master);
  const created=await Actor.create({name:`Homúnculo de ${master.name}`,type:"npc",img:ICON,
    system:{details:{type:{value:"construct"},cr:0},abilities:{str:{value:8,proficient:1},dex:{value:14,proficient:1},con:{value:14,proficient:1},int:{value:6,proficient:1},wis:{value:10,proficient:1},cha:{value:6,proficient:1}},skills:{prc:{value:1}},attributes:{ac:{flat:12+prof,calc:"flat"},hp:{value:hp,max:hp},movement:{walk:9,units:"m"},senses:{darkvision:18,units:"m"}},traits:{di:{value:["poison"]},ci:{value:["poisoned"]}}},
    ownership:{...owners,[data.userId]:CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER},flags:{[MODULE_ID]:{alchemistHomunculusMaster:master.uuid,alchemistCarriedSlot:null}}});
  if(canvas?.scene&&Number.isFinite(data.x)&&Number.isFinite(data.y)){
    const token=created.prototypeToken.toObject();Object.assign(token,{actorId:created.id,name:created.name,x:data.x,y:data.y,disposition:data.disposition??CONST.TOKEN_DISPOSITIONS.FRIENDLY});
    await canvas.scene.createEmbeddedDocuments("Token",[token]);
  }
  if(reconstruction)await master.update({"system.currency.gp":gold-price});
  await master.setFlag(MODULE_ID,"alchemistHomunculusCreated",true);
  await postAlchemist(master,"Homúnculo Alquímico",`<strong>${escape(created.name)}</strong> foi criado com ${hp} PV e CA ${12+prof}. Não possui ataque próprio.`);
  return true;
}

async function reconstructHomunculus(data){
  if(!game.user.isGM||game.users.activeGM?.id!==game.user.id)return false;
  const master=await fromUuid(data.masterUuid),requester=game.users.get?.(data.userId)??game.users.find(user=>user.id===data.userId);
  if(!master||!requester?.active||!master.testUserPermission(requester,"OWNER"))return false;
  const servant=homunculus(master);
  if(!servant||bodyExists(servant)||!canvas?.scene)return false;
  const price=25*alchemistProficiency(master),gold=Number(master.system?.currency?.gp??0);
  if(gold<price){ui.notifications.warn(`Nova Era: reconstrução do Homúnculo exige ${price} PO.`);return false;}
  const token=servant.prototypeToken.toObject();Object.assign(token,{actorId:servant.id,name:servant.name,x:data.x,y:data.y,disposition:data.disposition??CONST.TOKEN_DISPOSITIONS.FRIENDLY});
  await canvas.scene.createEmbeddedDocuments("Token",[token]);
  await servant.update({"system.attributes.hp.value":Number(servant.system?.attributes?.hp?.max??0)});
  await master.update({"system.currency.gp":gold-price});
  await postAlchemist(master,"Homúnculo reconstruído",`Um novo corpo foi construído por ${price} PO e retorna com todos os PV.`);
  return true;
}

export async function openHomunculusControl(actor){
  if(!alchemistCanOperate(actor)||!hasAlchemistFeature(actor,"alchemist-homunculus"))return false;
  let servant=homunculus(actor);
  if(!servant){
    const first=!actor.getFlag(MODULE_ID,"alchemistHomunculusCreated"),price=25*alchemistProficiency(actor);
    const make=await Dialog.confirm({title:"Homúnculo Alquímico",content:`<p>${first?"Criar o primeiro Homúnculo sem custo":"Reconstruir o Homúnculo perdido por "+price+" PO"} e colocar seu token ao lado do Alquimista?</p>`,yes:()=>true,no:()=>false,defaultYes:false});if(!make)return false;
    const token=sourceToken(actor);const data={masterUuid:actor.uuid,userId:game.user.id,x:token?.document?.x??null,y:token?.document?.y??null,disposition:token?.document?.disposition};
    if(game.user.isGM)return createHomunculus(data);
    game.socket.emit(`module.${MODULE_ID}`,{type:SOCKET_TYPE,action:"create",data});ui.notifications.info("Nova Era: criação do Homúnculo solicitada ao GM ativo.");return true;
  }
  if(!sourceToken(servant)){
    if(bodyExists(servant)){ui.notifications.warn("Nova Era: o Homúnculo ainda possui um token em outra cena. Traga-o para a cena atual antes de comandá-lo.");return false;}
    const price=25*alchemistProficiency(actor);
    const make=await Dialog.confirm({title:"Homúnculo perdido",content:`<p>O Homúnculo não possui corpo na cena. Reconstruí-lo por ${price} PO?</p>`,yes:()=>true,no:()=>false,defaultYes:false});if(!make)return false;
    const token=sourceToken(actor),data={masterUuid:actor.uuid,userId:game.user.id,x:token?.document?.x??0,y:token?.document?.y??0,disposition:token?.document?.disposition};
    if(game.user.isGM)return reconstructHomunculus(data);
    game.socket.emit(`module.${MODULE_ID}`,{type:SOCKET_TYPE,action:"reconstruct",data});return true;
  }
  if(Number(servant.system?.attributes?.hp?.value??0)<=0){ui.notifications.warn("Nova Era: o Homúnculo está Inerte. Repare-o ou conclua um Descanso Longo.");return false;}
  const state=alchemistState(actor),slot=servant.getFlag(MODULE_ID,"alchemistCarriedSlot");
  const choice=await Dialog.prompt({title:`Homúnculo — ${actor.name}`,content:`<form class="nova-era alchemist-choice"><p>PV ${servant.system.attributes.hp.value}/${servant.system.attributes.hp.max} · Fórmula carregada: ${slot===null?"nenhuma":escape(state.prepared[slot]?.label??"encaixe vazio")}</p><select name="action"><option value="deliver">Entregar Fórmula carregada (Ação Bônus de comando)</option><option value="load">Trocar Fórmula carregada (pronta na próxima rodada)</option><option value="move">Mover ou Interagir (Ação Bônus de comando)</option><option value="dodge">Esquiva / buscar segurança</option></select></form>`,label:"Continuar",callback:html=>String(html.find("[name='action']").val()),rejectClose:false});
  if(!choice)return false;
  const turn=turnKey();if(["deliver","move"].includes(choice)&&turn&&actor.getFlag(MODULE_ID,"alchemistHomunculusCommandTurn")===turn){ui.notifications.warn("Nova Era: o Homúnculo já recebeu uma ordem com Ação Bônus neste turno.");return false;}
  if(choice==="load"){
    const entries=state.prepared.flatMap((entry,index)=>entry?[[String(index),`${index+1}. ${entry.label}`]]:[]);if(!entries.length)return ui.notifications.warn("Nova Era: não há Fórmula preparada para carregar.");
    const selected=await Dialog.prompt({title:"Carregar Fórmula",content:`<form><p>A Fórmula ficará pronta na próxima rodada (6 segundos).</p><select name="slot">${entries.map(([value,label])=>`<option value="${value}">${escape(label)}</option>`).join("")}</select></form>`,label:"Carregar",callback:html=>Number(html.find("[name='slot']").val()),rejectClose:false});
    if(selected===null)return false;await servant.setFlag(MODULE_ID,"alchemistCarriedSlot",selected);await servant.setFlag(MODULE_ID,"alchemistCarriedReadyAt",Number(game.time?.worldTime??0)+LOAD_SECONDS);await servant.setFlag(MODULE_ID,"alchemistCarriedReadyRound",game.combat?.started?Number(game.combat.round)+1:0);await servant.setFlag(MODULE_ID,"alchemistCarriedCombatId",game.combat?.started?game.combat.id:"");await postAlchemist(actor,"Homúnculo preparado",`O Homúnculo começou a carregar <strong>${escape(state.prepared[selected]?.label)}</strong>. A entrega estará disponível na próxima rodada.`);return true;
  }
  if(choice==="deliver"){
    if(slot===null||!state.prepared[slot])return ui.notifications.warn("Nova Era: carregue uma Fórmula primeiro.");
    if(!alchemistHomunculusDeliveryReady(servant)){ui.notifications.warn("Nova Era: a Fórmula do Homúnculo ficará pronta na próxima rodada.");return false;}
    const masterToken=sourceToken(actor),servantToken=sourceToken(servant);if(masterToken&&servantToken&&distance(masterToken,servantToken)>18)return ui.notifications.warn("Nova Era: o Homúnculo deve estar a até 18 m do Alquimista.");
    if(!servantToken){ui.notifications.warn("Nova Era: coloque o token do Homúnculo na cena antes de entregar uma Fórmula.");return false;}
    const delivered=await activateAlchemistFormula(actor,slot,{sourceToken:servantToken});if(delivered){await clearDodge(servant);if(turn)await actor.setFlag(MODULE_ID,"alchemistHomunculusCommandTurn",turn);}return delivered;
  }
  if(choice==="move"){await clearDodge(servant);if(turn)await actor.setFlag(MODULE_ID,"alchemistHomunculusCommandTurn",turn);await postAlchemist(actor,"Ordem ao Homúnculo","O Homúnculo pode mover-se ou Interagir com Objeto. Mova o token para registrar a posição final.");return true;}
  await applyDodge(actor,servant);return true;
}

async function automaticDodge(combat,changed){
  if(changed.turn===undefined&&changed.round===undefined)return;
  const servant=combat.combatant?.actor,master=servant?.getFlag(MODULE_ID,"alchemistHomunculusMaster")?await fromUuid(servant.getFlag(MODULE_ID,"alchemistHomunculusMaster")):null;
  if(!master||!alchemistResponsible(master))return;
  const command=String(master.getFlag(MODULE_ID,"alchemistHomunculusCommandTurn")??"");
  if(command.startsWith(`${combat.id}:${combat.round}:`))return;
  await applyDodge(master,servant);
}

async function rest(actor,result,config={}){
  if(!isNovaEraAlchemist(actor)||!alchemistResponsible(actor))return;
  const long=result?.longRest===true||result?.type==="long"||config.type==="long",short=long||result?.shortRest===true||result?.type==="short"||config.type==="short";
  if(!short)return;const servant=homunculus(actor);if(!servant)return;
  if(long){await servant.update({"system.attributes.hp.value":servant.system.attributes.hp.max});await actor.unsetFlag(MODULE_ID,"alchemistHomunculusRepairUsed");return;}
  if(actor.getFlag(MODULE_ID,"alchemistHomunculusRepairUsed"))return;
  const accept=await Dialog.confirm({title:"Reparar Homúnculo",content:`<p>Usar o Kit durante o Descanso Curto para reparar ${alchemistLevel(actor)+alchemistIntelligence(actor)} PV?</p>`,yes:()=>true,no:()=>false,defaultYes:false});
  if(!accept)return;await actor.setFlag(MODULE_ID,"alchemistHomunculusRepairUsed",true);await applyAlchemistHealing(servant,Math.max(0,alchemistLevel(actor)+alchemistIntelligence(actor)));
}

export function registerAlchemistHomunculusAutomation(){
  game.socket.on(`module.${MODULE_ID}`,payload=>{if(payload?.type!==SOCKET_TYPE)return;if(payload.action==="create")void createHomunculus(payload.data);if(payload.action==="reconstruct")void reconstructHomunculus(payload.data);});
  Hooks.on("dnd5e.restCompleted",(actor,result,config)=>void rest(actor,result,config));
  Hooks.on("updateCombat",(combat,changed)=>void automaticDodge(combat,changed));
}
