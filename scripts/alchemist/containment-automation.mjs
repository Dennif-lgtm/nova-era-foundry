import { MODULE_ID } from "../constants.mjs";
import { alchemistResponsible, alchemistState, isNovaEraAlchemist, rollAlchemist, spendReagentPoints } from "./core-automation.mjs";

const processing=new Set();
const TYPE_LABEL={fire:"Fogo",acid:"Ácido",poison:"Veneno"};
const ROUND=()=>game.combat?.started?`${game.combat.id}:${game.combat.round}`:`free:${Math.floor(Date.now()/6000)}`;
function amount(part){return Math.max(0,Number(part?.value??part?.damage??0));}
function compatible(formula,type){return formula?.projectKey==="alchemist-project-containment"&&formula.option===type;}
function activeToken(actor){return actor?.getActiveTokens?.()[0]??null;}
function distance(source,target){try{return Number(canvas.grid.measurePath([source.center,target.center]).distance);}catch{return Infinity;}}

export async function applyAlchemistContainment(token,{damageItem}={}){
  const target=token?.actor??token?.document?.actor,details=damageItem?.damageDetail;
  if(!target||!Array.isArray(details)||!details.length)return false;
  const targetToken=token?.center?token:activeToken(target);
  if(!targetToken)return false;
  for(const source of game.actors.filter(isNovaEraAlchemist)){
    if(!alchemistResponsible(source))continue;
    const sourceToken=activeToken(source),round=ROUND();
    if(!sourceToken||distance(sourceToken,targetToken)>9||source.getFlag(MODULE_ID,"alchemistContainmentUsedRound")===round)continue;
    const state=alchemistState(source);
    const formula=state.prepared.find(entry=>TYPE_LABEL[entry?.option]&&compatible(entry,entry.option)&&details.some(part=>part.type===entry.option&&amount(part)>0)&&state.points>=entry.cost);
    if(!formula)continue;
    const type=formula.option,guard=`${source.uuid}:${round}`;
    if(processing.has(guard))continue;
    processing.add(guard);
    try{
      const accept=await Dialog.confirm({title:"Reação de Contenção",content:`<p>${foundry.utils.escapeHTML(target.name)} receberá dano de ${TYPE_LABEL[type]}. Usar sua Reação e gastar ${formula.cost} PR para reduzir <strong>2d8 + INT</strong>?</p>`,yes:()=>true,no:()=>false,defaultYes:false});
      if(!accept)continue;
      if(!await spendReagentPoints(source,formula.cost,"Reação de Contenção"))continue;
      await source.setFlag(MODULE_ID,"alchemistContainmentUsedRound",round);
      let remaining=Math.max(0,await rollAlchemist(source,"2d8 + @abilities.int.mod","Reação de Contenção")),prevented=0;
      for(const part of details){if(part.type!==type||remaining<=0)continue;const reduction=Math.min(remaining,amount(part));part.value=amount(part)-reduction;remaining-=reduction;prevented+=reduction;}
      damageItem.details??=[];
      damageItem.details.push(`Reação de Contenção reduziu ${prevented} de dano de ${TYPE_LABEL[type]}.`);
      return prevented>0;
    }finally{processing.delete(guard);}
  }
  return false;
}
