import { MODULE_ID } from "../constants.mjs";
import {
  activateAlchemistFormula, alchemistAnatomyBonus, alchemistDocumentAction, alchemistProficiency, alchemistResponsible, alchemistState, applyAlchemistHealing,
  isNovaEraAlchemist, postAlchemist, resolveDelayedAlchemistFormula, rollAlchemist, updateAlchemistState
} from "./core-automation.mjs";

const processing = new Set();
const turnSeen = new Set();
const beforeHp = new Map();
const endingCombatants = new Map();
const symbiosisUsed=new Set();
const now = () => Number(game.time?.worldTime ?? 0);

async function handleSymbiosis({actor,project,targets}){
  if(!alchemistResponsible(actor)||project.getFlag(MODULE_ID,"contentKey")==="alchemist-project-symbiotic-catalyst")return;
  const role=project.getFlag(MODULE_ID,"role");
  if(!["healing","support","defense"].includes(role))return;
  const turn=game.combat?.started?`${game.combat.id}:${game.combat.round}`:`free:${Math.floor(Date.now()/6000)}`;
  for(const token of targets){
    const target=token.actor,active=[...(target?.effects??[])].find(effect=>effect.getFlag(MODULE_ID,"sourceUuid")===actor.uuid&&effect.getFlag(MODULE_ID,"alchemistSymbiosis"));if(!active)continue;
    const mode=active.getFlag(MODULE_ID,"alchemistSymbiosis");
    if(mode==="restorative"&&role!=="healing")continue;
    const key=`${active.uuid}:${turn}`;if(symbiosisUsed.has(key))continue;symbiosisUsed.add(key);
    if(mode==="restorative"&&role==="healing"){
      await alchemistDocumentAction(target,"hp",{mode:"temp",amount:alchemistProficiency(actor)});
      await postAlchemist(actor,"Simbiose Restauradora",`${foundry.utils.escapeHTML(target.name)} recebe ${alchemistProficiency(actor)} PV temporários.`);
    }
    else if(mode==="stabilizer"){
      await alchemistDocumentAction(target,"effect",{effect:{name:"Simbiose Estabilizadora — próxima salvaguarda +2",img:active.img,origin:actor.uuid,disabled:false,duration:{rounds:1,seconds:6,startTime:now(),startRound:game.combat?.round,startTurn:game.combat?.turn},changes:[{key:"system.bonuses.abilities.save",mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:"2",priority:20}],flags:{[MODULE_ID]:{alchemistEffect:`symbiotic-save:${actor.uuid}`,alchemistSymbioticSave:true}}}});
    }
    else if(mode==="stimulant")await postAlchemist(actor,"Simbiose Estimulante",`${foundry.utils.escapeHTML(target.name)} pode mover-se até 1,5 m sem Ataque de Oportunidade. Mova seu token se desejar.`);
  }
  if(symbiosisUsed.size>200)symbiosisUsed.clear();
}

async function revise(actor,record,changes,reason) {
  const active=alchemistState(actor).active.map(entry => entry.id===record.id?{...entry,...changes}:entry).filter(entry=>entry.charges>0);
  await updateAlchemistState(actor,{active},reason);
}

async function trigger(actor,record,targetActor,targetToken,kind,turn="",previousHp=null) {
  const tokenUuid=targetToken?.document?.uuid??targetToken?.uuid??"";
  if(processing.has(record.id)||record.expiresAt<=now())return;
  if(record.kind==="mist"){
    if(kind!=="turn"||record.sceneId!==canvas.scene?.id||record.lastTurn===turn)return;
    const center=targetToken?.object?.center??targetToken?.center;let distance=Infinity;
    try{distance=Number(canvas.grid.measurePath([{x:record.originX,y:record.originY},center]).distance);}catch{return;}
    if(!center||distance>3||Number(targetActor.system?.attributes?.hp?.value??0)<1)return;
    processing.add(record.id);
    try{
      const accept=await Dialog.confirm({title:"Névoa Terapêutica",content:`<p>${foundry.utils.escapeHTML(targetActor.name)} começou o turno na Névoa. Consumir uma das ${record.charges} cargas para curar 1d6 + INT?</p>`,yes:()=>true,no:()=>false,defaultYes:false});
      if(accept){await revise(actor,record,{charges:record.charges-1,lastTurn:turn},"Carga da Névoa consumida");const amount=await rollAlchemist(actor,"1d6 + @abilities.int.mod","Névoa Terapêutica");await applyAlchemistHealing(targetActor,Math.max(0,amount+await alchemistAnatomyBonus(actor,targetActor)));}
    }finally{processing.delete(record.id);}return;
  }
  if(record.targetActorUuid!==targetActor.uuid&&(!record.targetTokenUuid||record.targetTokenUuid!==tokenUuid))return;
  if(record.kind==="coagulant"&&kind!=="damage")return;
  if(record.kind==="regeneration"&&kind!=="turn")return;
  if(record.kind==="catalyst"&&record.trigger!==kind)return;
  if(record.lastTurn&&record.lastTurn===turn)return;
  processing.add(record.id);
  try {
    if(record.kind==="coagulant") {
      const hp=targetActor.system?.attributes?.hp;
      const threshold=Math.floor(Number(hp?.max??0)/2);
      if(!hp||previousHp===null||previousHp<=threshold||Number(hp.value)>threshold)return;
      await revise(actor,record,{charges:0},"Coagulante disparado");
      const amount=await rollAlchemist(actor,"2d8 + @abilities.int.mod","Coagulante de Emergência")+await alchemistAnatomyBonus(actor,targetActor);
      await applyAlchemistHealing(targetActor,Math.max(0,amount));
      await postAlchemist(actor,"Coagulante de Emergência",`A preparação reagiu à queda de ${foundry.utils.escapeHTML(targetActor.name)} e restaurou ${Math.max(0,amount)} PV.`);
      return;
    }
    if(record.kind==="regeneration") {
      if(Number(targetActor.system?.attributes?.hp?.value??0)<1)return;
      await revise(actor,record,{charges:record.charges-1,lastTurn:turn},"Soro de Regeneração");
      const amount=await rollAlchemist(actor,"1d4","Soro de Regeneração")+await alchemistAnatomyBonus(actor,targetActor);
      await applyAlchemistHealing(targetActor,Math.max(0,amount));
      return;
    }
    if(record.kind==="catalyst") {
      const selected=targetToken?.object??targetToken?.token?.object??targetActor.getActiveTokens?.()[0];
      if(!selected){ui.notifications.warn("Nova Era: o alvo do Catalisador Reativo não possui token ativo; a preparação permanece armada.");return;}
      const accept=await Dialog.confirm({title:"Catalisador Reativo",content:`<p>O gatilho de <strong>${foundry.utils.escapeHTML(targetActor.name)}</strong> ocorreu. Ativar a Fórmula vinculada e pagar seus PR?</p>`,yes:()=>true,no:()=>false,defaultYes:false});
      if(!accept)return;
      const used=await activateAlchemistFormula(actor,record.linkedSlot,{triggered:true,targetsOverride:[selected],skipConfirm:true});
      if(used)await revise(actor,record,{charges:0},"Catalisador disparado");
    }
  } catch(error) {
    console.error(`${MODULE_ID} | Falha no gatilho alquímico`,error);
    ui.notifications.error("Nova Era: não foi possível resolver a Preparação Ativa; consulte o console.");
  } finally { processing.delete(record.id); }
}

async function handle(kind,targetActor,targetToken=null,turn="",previousHp=null) {
  if(!targetActor)return;
  for(const actor of game.actors.filter(isNovaEraAlchemist)) {
    if(!alchemistResponsible(actor))continue;
    for(const record of alchemistState(actor).active) await trigger(actor,record,targetActor,targetToken,kind,turn,previousHp);
  }
}

async function expire() {
  for(const actor of game.actors.filter(isNovaEraAlchemist)) {
    if(!alchemistResponsible(actor))continue;
    const state=alchemistState(actor),active=state.active.filter(entry=>entry.charges>0&&entry.expiresAt>now());
    if(active.length!==state.active.length)await updateAlchemistState(actor,{active},"Preparações expiradas");
  }
}

async function processDelayed(combat=null){
  for(const actor of game.actors.filter(isNovaEraAlchemist)){
    if(!alchemistResponsible(actor))continue;
    for(const record of alchemistState(actor).active.filter(entry=>entry.kind==="delayed")){
      const ready=record.dueAt<=now()||combat&&record.dueCombatId===combat.id&&Number(combat.round)>=record.dueRound;
      if(!ready||processing.has(record.id))continue;
      processing.add(record.id);
      try{
        const tokenDocument=record.targetTokenUuid?await fromUuid(record.targetTokenUuid):null;
        const targetActor=tokenDocument?.actor??await fromUuid(record.targetActorUuid);
        const target=tokenDocument?.object??(targetActor?{actor:targetActor,name:targetActor.name}:null);
        if(target)await resolveDelayedAlchemistFormula(actor,record.formula,target);
        else await postAlchemist(actor,"Fórmula Retardada",`O alvo da preparação de ${foundry.utils.escapeHTML(record.formula?.label??"Fórmula")} não está mais disponível.`);
        await revise(actor,record,{charges:0},"Fórmula Retardada disparada");
      }catch(error){console.error(`${MODULE_ID} | Falha ao disparar Fórmula Retardada`,error);ui.notifications.error("Nova Era: erro ao resolver Fórmula Retardada.");}
      finally{processing.delete(record.id);}
    }
  }
}

export function registerAlchemistTriggerAutomation() {
  Hooks.on("novaEraAlchemistFormulaResolved",data=>void handleSymbiosis(data));
  Hooks.on("dnd5e.rollSavingThrow",(rolls,{subject}={})=>{
    if(!subject||!alchemistResponsible(subject))return;
    for(const effect of [...(subject.effects??[])].filter(value=>value.getFlag(MODULE_ID,"alchemistSymbioticSave")))void alchemistDocumentAction(subject,"effect-delete",{id:effect.id});
  });
  Hooks.on("preUpdateActor",(actor,changed)=>{
    const incoming=foundry.utils.getProperty(changed,"system.attributes.hp.value");
    if(incoming===undefined)return;
    const previous=Number(actor.system?.attributes?.hp?.value??0);beforeHp.set(actor.uuid,previous);
    if(Number(incoming)>previous){
      const reduction=actor.effects.reduce((sum,effect)=>sum+Number(effect.getFlag(MODULE_ID,"healingReduction")??0),0);
      if(reduction>0)foundry.utils.setProperty(changed,"system.attributes.hp.value",Math.max(previous,Number(incoming)-reduction));
    }
  });
  Hooks.on("updateActor",(actor,changed,options)=>{
    if(foundry.utils.getProperty(changed,"system.attributes.hp.value")===undefined)return;
    const previous=beforeHp.get(actor.uuid);beforeHp.delete(actor.uuid);
    if(previous===undefined||Number(actor.system?.attributes?.hp?.value??0)>=previous)return;
    void handle("damage",actor,null,"",previous);
  });
  Hooks.on("updateToken",(document,changed,options)=>{
    if(options?.novaEraAlchemist||(changed.x===undefined&&changed.y===undefined))return;
    void handle("movement",document.actor,document);
  });
  Hooks.on("preUpdateCombat",(combat,changed)=>{
    if(changed.round!==undefined||changed.turn!==undefined)endingCombatants.set(combat.id,combat.combatant?.actor??null);
  });
  Hooks.on("updateCombat",(combat,changed)=>{
    if(changed.round===undefined&&changed.turn===undefined)return;
    const ending=endingCombatants.get(combat.id);endingCombatants.delete(combat.id);
    if(ending&&game.user.isGM&&game.users.activeGM?.id===game.user.id)void (async()=>{
      for(const activeEffect of [...ending.effects]){
        const save=activeEffect.getFlag(MODULE_ID,"saveEndTurn");if(!save)continue;
        const rolled=await ending.rollSavingThrow({ability:save.ability??"con"});
        const total=Number((Array.isArray(rolled)?rolled[0]:rolled)?.total??0);
        if(total>=Number(save.dc)){await activeEffect.delete();await postAlchemist(ending,activeEffect.name,`A salvaguarda de ${foundry.utils.escapeHTML(ending.name)} foi bem-sucedida; o efeito terminou.`);}
      }
    })();
    const turn=`${combat.id}:${combat.round}:${combat.turn}`;
    if(turnSeen.has(turn))return;
    turnSeen.add(turn);if(turnSeen.size>50)turnSeen.delete(turnSeen.values().next().value);
    const combatant=combat.combatant;
    const activeActor=combatant?.actor;
    if(activeActor&&game.user.isGM&&game.users.activeGM?.id===game.user.id)void (async()=>{
      for(const activeEffect of [...activeActor.effects])if(activeEffect.getFlag(MODULE_ID,"alchemistExpireAtTurnStart")===activeActor.uuid)await activeEffect.delete();
    })();
    void handle("turn",combatant?.actor,combatant?.token,turn);
    void processDelayed(combat).then(expire);
  });
  Hooks.on("updateWorldTime",()=>void processDelayed().then(expire));
}
