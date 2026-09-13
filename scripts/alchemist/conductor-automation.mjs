import { MODULE_ID } from "../constants.mjs";
import { alchemistDocumentAction, alchemistResponsible, applyAlchemistDamage, postAlchemist, rollAlchemist } from "./core-automation.mjs";

const processing=new Set();
const ROUND=()=>game.combat?.started?`${game.combat.id}:${game.combat.round}`:`free:${Math.floor(Date.now()/6000)}`;
function amount(part){return Math.max(0,Number(part?.value??part?.damage??0));}
function distance(a,b){try{return Number(canvas.grid.measurePath([a.center,b.center]).distance);}catch{return Infinity;}}

export async function applyAlchemistConductor(token,{damageItem}={}){
  const target=token?.actor??token?.document?.actor,details=damageItem?.damageDetail;
  if(!target||!Array.isArray(details)||!details.length)return false;
  const targetToken=token?.center?token:target.getActiveTokens?.()[0];
  if(!targetToken)return false;
  for(const active of [...(target.effects??[])]){
    if(active.disabled)continue;
    const type=active.getFlag(MODULE_ID,"alchemistConductorType"),charges=Number(active.getFlag(MODULE_ID,"alchemistConductorCharges")??0),round=ROUND();
    if(!type||charges<1||active.getFlag(MODULE_ID,"alchemistConductorRound")===round||!details.some(part=>part.type===type&&amount(part)>0))continue;
    const source=await fromUuid(active.getFlag(MODULE_ID,"sourceUuid"));
    if(!source||!alchemistResponsible(source))continue;
    const guard=active.uuid??active.id;
    if(processing.has(guard))continue;
    processing.add(guard);
    try{
      const candidates=(canvas.tokens?.placeables??[]).filter(other=>other.actor&&other.actor.uuid!==target.uuid&&other.visible!==false&&distance(targetToken,other)<=3);
      if(!candidates.length)continue;
      const selected=await Dialog.prompt({title:"Agente Condutor",content:`<form class="nova-era alchemist-choice"><p>${foundry.utils.escapeHTML(target.name)} sofreu dano de ${foundry.utils.escapeHTML(type)}. Escolha outra criatura a até 3 m para receber 1d6 do mesmo tipo.</p><select name="target">${candidates.map(other=>`<option value="${foundry.utils.escapeHTML(other.document?.uuid??other.id)}">${foundry.utils.escapeHTML(other.name)}</option>`).join("")}</select></form>`,label:"Propagar",callback:html=>String(html.find("[name='target']").val()),rejectClose:false});
      const secondary=candidates.find(other=>(other.document?.uuid??other.id)===selected);
      if(!secondary)return false;
      await alchemistDocumentAction(target,"effect-flag",{id:active.id,key:"alchemistConductorRound",value:round});
      if(charges===1)await alchemistDocumentAction(target,"effect-delete",{id:active.id});
      else await alchemistDocumentAction(target,"effect-flag",{id:active.id,key:"alchemistConductorCharges",value:charges-1});
      const damage=await rollAlchemist(source,"1d6","Agente Condutor");
      await applyAlchemistDamage(secondary.actor,damage,type,source,{propagation:true});
      await postAlchemist(source,"Agente Condutor",`${foundry.utils.escapeHTML(target.name)} propagou ${foundry.utils.escapeHTML(type)} para ${foundry.utils.escapeHTML(secondary.name)}. Restam ${charges-1} ativações.`);
      return true;
    }finally{processing.delete(guard);}
  }
  return false;
}
