import { MODULE_ID } from "../constants.mjs";
import { alchemistDocumentAction, alchemistProficiency, alchemistResponsible, postAlchemist } from "./core-automation.mjs";
import { alchemistHasPlatformModule, applyAlchemistReactivePlatform } from "./artificer-automation.mjs";
import { applyAlchemistContainment } from "./containment-automation.mjs";
import { applyAlchemistConductor } from "./conductor-automation.mjs";

const consumed=new Set();
const roundUse=new Map();
const coatingUse=new Map();
const matrixEvents=new WeakMap();
const ELEMENTAL=new Set(["acid","lightning","fire","cold"]);
const PHYSICAL=new Set(["bludgeoning","piercing","slashing"]);
const MATRIX=new Set(["acid","fire","cold","poison"]);
function key(){return game.combat?.started?`${game.combat.id}:${game.combat.round}`:`free:${Math.floor(Date.now()/6000)}`;}
function resolver(actor){return alchemistResponsible(actor)||game.user.isGM&&game.users.activeGM?.id===game.user.id;}
function amount(detail){return Math.max(0,Number(detail?.value??detail?.damage??0));}
function reduce(details,predicate,limit){
  let remaining=Math.max(0,Number(limit)||0),total=0;
  for(const detail of details){if(!predicate(detail)||remaining<=0)continue;const taken=Math.min(remaining,amount(detail));detail.value=amount(detail)-taken;remaining-=taken;total+=taken;}
  return total;
}
function removeWard(actor,effect){if(game.user.isGM||effect.isOwner!==false)void effect.delete();else void alchemistDocumentAction(actor,"effect-delete",{id:effect.id});}
function flagWard(actor,effect,name,value){if(game.user.isGM||effect.isOwner!==false)void effect.setFlag(MODULE_ID,name,value);else void alchemistDocumentAction(actor,"effect-flag",{id:effect.id,key:name,value});}
export function applyAlchemistDamageInterception(token,{damageItem,force=false}={}){
  const actor=token?.actor??token?.document?.actor;if(!actor||!force&&!resolver(actor))return;
  const details=damageItem?.damageDetail;if(!Array.isArray(details)||!details.length)return;
  const armorKey=`${actor.uuid}:reactiveArmor`;
  if(alchemistHasPlatformModule(actor,"reactiveArmor")&&roundUse.get(armorKey)!==key()){
    const prevented=reduce(details,part=>["acid","fire","cold","poison"].includes(part.type),alchemistProficiency(actor));
    if(prevented){roundUse.set(armorKey,key());damageItem.details??=[];damageItem.details.push(`Blindagem Reativa reduziu ${prevented} de dano elemental.`);}
  }
  for(const effect of [...(actor.effects??[])]){
    if(effect.disabled)continue;
    const id=effect.uuid??effect.id,ward=effect.getFlag(MODULE_ID,"alchemistDamageWard");
    const conductivity=Number(effect.getFlag(MODULE_ID,"alchemistConductivity")??0);
    if(conductivity>0&&!consumed.has(id)){
      const part=details.find(detail=>ELEMENTAL.has(detail.type)&&amount(detail)>0);
      if(part){part.value=amount(part)+conductivity;consumed.add(id);removeWard(actor,effect);damageItem.details??=[];damageItem.details.push(`Condutividade acrescentou ${conductivity} de dano ${part.type}.`);}
    }
    const hardening=Number(effect.getFlag(MODULE_ID,"alchemistHardening")??0);
    if(hardening>0&&roundUse.get(id)!==key()){
      const prevented=reduce(details,part=>PHYSICAL.has(part.type),hardening);
      if(prevented){roundUse.set(id,key());damageItem.details??=[];damageItem.details.push(`Endurecimento reduziu ${prevented} de dano físico.`);}
    }
    if(ward==="prism"&&!consumed.has(id)){
      const prevented=reduce(details,part=>["acid","fire","cold"].includes(part.type),effect.getFlag(MODULE_ID,"alchemistWardAmount"));
      if(prevented){consumed.add(id);removeWard(actor,effect);damageItem.details??=[];damageItem.details.push(`Cristal Prismático reduziu ${prevented} de dano.`);}
    }
    if(ward==="coating"&&!consumed.has(id)){
      const type=effect.getFlag(MODULE_ID,"alchemistCoatingType");
      const item=(actor.items??[]).find(value=>value.uuid===effect.getFlag(MODULE_ID,"alchemistCoatingItemUuid"));
      const prevented=item&&item.system?.equipped!==false?reduce(details,part=>part.type===type,effect.getFlag(MODULE_ID,"alchemistWardAmount")):0;
      if(prevented){consumed.add(id);removeWard(actor,effect);damageItem.details??=[];damageItem.details.push(`Revestimento Protetor reduziu ${prevented} de dano ${type}.`);}
    }
    if(ward==="prophylactic"&&!effect.getFlag(MODULE_ID,"alchemistWardUsed")&&!consumed.has(id)){
      const prevented=reduce(details,part=>part.type==="poison",effect.getFlag(MODULE_ID,"alchemistWardAmount"));
      if(prevented){consumed.add(id);flagWard(actor,effect,"alchemistWardUsed",true);damageItem.details??=[];damageItem.details.push(`Neutralizante reduziu ${prevented} de dano de Veneno.`);}
    }
    if(effect.getFlag(MODULE_ID,"alchemistMutagen")==="skin"&&roundUse.get(id)!==key()){
      const source=game.actors.get(effect.getFlag(MODULE_ID,"sourceUuid")?.split(".").at(-1))??actor;
      const prevented=reduce(details,part=>PHYSICAL.has(part.type),alchemistProficiency(source));
      if(prevented){roundUse.set(id,key());damageItem.details??=[];damageItem.details.push(`Epiderme Mutagênica reduziu ${prevented} de dano físico.`);}
    }
    const converter=effect.getFlag(MODULE_ID,"alchemistConverterType");
    if(converter&&roundUse.get(id)!==key()){
      const prevented=reduce(details,part=>part.type===converter,effect.getFlag(MODULE_ID,"alchemistWardAmount"));
      if(prevented){roundUse.set(id,key());flagWard(actor,effect,"alchemistConverterStored",true);damageItem.details??=[];damageItem.details.push(`Conversor Alquímico armazenou ${prevented} de ${converter}.`);}
    }
    if(effect.getFlag(MODULE_ID,"alchemistAdaptiveMatrix")){
      const seen=matrixEvents.get(damageItem)??new Set();
      if(seen.has(id))continue;
      const sourceUuid=effect.getFlag(MODULE_ID,"sourceUuid"),source=game.actors.get(sourceUuid?.split(".").at(-1));
      const type=details.find(part=>MATRIX.has(part.type)&&amount(part)>=alchemistProficiency(source??actor))?.type;
      if(type){seen.add(id);matrixEvents.set(damageItem,seen);setTimeout(()=>void alchemistDocumentAction(actor,"effect",{effect:{name:`Matriz Adaptativa — Resistência a ${type}`,img:effect.img,origin:sourceUuid,disabled:false,duration:{rounds:1,seconds:6,startTime:game.time?.worldTime,startRound:game.combat?.round,startTurn:game.combat?.turn},changes:[{key:"system.traits.dr.value",mode:CONST.ACTIVE_EFFECT_MODES.ADD,value:type,priority:20}],flags:{[MODULE_ID]:{alchemistEffect:`matrix-resistance:${sourceUuid}`,alchemistMatrixType:type}}}}),0);}
    }
  }
}

async function coatingAttack(workflow){
  const actor=workflow?.actor??workflow?.item?.actor,item=workflow?.item;
  if(!actor||!item||item.system?.equipped===false||!resolver(actor)||![...(workflow.hitTargets??[])].length||typeof workflow.setBonusDamageRolls!=="function")return;
  const active=[...(actor.effects??[])].find(effect=>!effect.disabled&&effect.getFlag(MODULE_ID,"alchemistCoatingMode")==="elemental"&&effect.getFlag(MODULE_ID,"alchemistCoatingItemUuid")===item.uuid);
  const ammo=workflow.novaEraAlchemistAmmo;if(!active&&!ammo)return;
  const turn=game.combat?.started?`${game.combat.id}:${game.combat.round}:${game.combat.turn}`:`free:${Math.floor(Date.now()/6000)}`;
  const id=ammo?.effectId??active?.uuid;
  if(coatingUse.get(id)===turn)return;
  coatingUse.set(id,turn);
  const type=ammo?.type??active?.getFlag(MODULE_ID,"alchemistCoatingType");
  const roll=await new CONFIG.Dice.DamageRoll(workflow.isCritical?"2d4":"1d4",actor.getRollData(),{type,flavor:"Revestimento Alquímico"}).evaluate();
  await workflow.setBonusDamageRolls([...(workflow.bonusDamageRolls??[]),roll]);
}

export async function markAlchemistCoatedAmmunition(workflow){
  const actor=workflow?.actor??workflow?.item?.actor,ammunition=workflow?.ammunition;
  if(!actor||!ammunition||!resolver(actor)||workflow.novaEraAlchemistAmmo)return false;
  const active=[...(actor.effects??[])].find(effect=>!effect.disabled&&effect.getFlag(MODULE_ID,"alchemistCoatingMode")==="ammunition"&&effect.getFlag(MODULE_ID,"alchemistCoatingItemUuid")===ammunition.uuid);
  const charges=Number(active?.getFlag(MODULE_ID,"alchemistAmmoCharges")??0);
  if(!active||charges<1)return false;
  workflow.novaEraAlchemistAmmo={effectId:active.uuid??active.id,type:active.getFlag(MODULE_ID,"alchemistCoatingType")};
  if(charges===1)await alchemistDocumentAction(actor,"effect-delete",{id:active.id});
  else await alchemistDocumentAction(actor,"effect-flag",{id:active.id,key:"alchemistAmmoCharges",value:charges-1});
  return true;
}

async function releaseConverter(workflow){
  const actor=workflow?.actor??workflow?.item?.actor;if(!actor||!resolver(actor))return;
  const effect=[...actor.effects].find(active=>active.getFlag(MODULE_ID,"alchemistConverterStored")===true);if(!effect)return;
  const type=effect.getFlag(MODULE_ID,"alchemistConverterType");if(!ELEMENTAL.has(type))return;
  const accept=await Dialog.confirm({title:"Conversor Alquímico",content:`<p>Liberar a energia armazenada como +2d6 de ${foundry.utils.escapeHTML(type)} neste dano?</p>`,yes:()=>true,no:()=>false,defaultYes:false});if(!accept)return;
  if(typeof workflow.setBonusDamageRolls!=="function")return;
  const roll=await new CONFIG.Dice.DamageRoll("2d6",actor.getRollData(),{type,flavor:"Conversor Alquímico"}).evaluate();
  await workflow.setBonusDamageRolls([...(workflow.bonusDamageRolls??[]),roll]);
  await effect.setFlag(MODULE_ID,"alchemistConverterStored",false);
  await postAlchemist(actor,"Conversor Alquímico","A energia armazenada foi liberada na próxima fonte de dano.");
}

export function registerAlchemistDamageInterception(){
  if(!game.modules.get("midi-qol")?.active)console.warn("Nova Era | Proteções reativas do Alquimista exigem Midi QOL ativo.");
  Hooks.on("midi-qol.preTargetDamageApplication",async(token,context)=>{
    applyAlchemistDamageInterception(token,context);
    if(await applyAlchemistReactivePlatform(token,context))applyAlchemistDamageInterception(token,context);
    await applyAlchemistContainment(token,context);
    await applyAlchemistConductor(token,context);
  });
  Hooks.on("midi-qol.DamageRollComplete",workflow=>void releaseConverter(workflow));
  Hooks.on("midi-qol.DamageRollComplete",workflow=>void coatingAttack(workflow));
  Hooks.on("midi-qol.preAttackRollConfig",workflow=>void markAlchemistCoatedAmmunition(workflow));
}
