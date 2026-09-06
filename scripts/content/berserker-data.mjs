const paragraphs = (...parts) => parts.map(text => `<p>${text}</p>`).join("");
const feature = (key, name, level, description, group = "berserker") => ({ key, name, level, description, group });
const technique = (key, name, level, family, cost, trigger, description) => ({
  key: `berserker-tecnica-${key}`,
  name,
  level,
  group: `tecnicas-${family.toLowerCase()}`,
  bloodCost: Number.parseInt(cost, 10),
  sacrifice: family === "Hemotecnia",
  trigger,
  description: `<p><strong>${family} • ${cost} • ${trigger}</strong></p>${description}`
});

export const BERSERKER_CLASS = {
  key: "berserker",
  name: "Berserker — Nova Era",
  description: `<h2>Berserker</h2><blockquote>“O sangue derramado não é uma fraqueza. É um recurso.”</blockquote>
  ${paragraphs("Você transforma a violência da batalha em Pontos de Sangue e entra automaticamente em Frenesi ao alcançar seu Limiar.", "Atributos principais: Força e Constituição. Dado de Vida: d12. CD de Sangue = 8 + Proficiência + Constituição; Ataque de Sangue = Proficiência + Constituição.")}
  <h3>Legados de Sangue</h3><p>No nível 3, escolha Imortal, Carniceiro, Frenético ou Besta.</p>`
};

const improvement = level => feature(`berserker-aprimoramento-${level}`, `Talento / Aumento de Atributo — Nível ${level}`, level, paragraphs("Receba um Talento ou Aumento de Atributo conforme as regras gerais de Nova Era."));

export const BERSERKER_FEATURES = [
  feature("berserker-sangue-massacre", "Sangue do Massacre", 1, `<p>Seu máximo de Pontos de Sangue (PS) é <strong>Proficiência + Constituição</strong>, mínimo 3. Você normalmente inicia o combate com 0 PS.</p><ul><li><strong>Violência Causada:</strong> uma vez por turno, ao causar dano hostil com ataque corpo a corpo, +1 PS; crítico concede +1 adicional, uma vez por turno.</li><li><strong>Violência Sofrida:</strong> uma vez por turno, ao sofrer dano hostil, +1 PS; crítico concede +1 adicional, uma vez por turno.</li><li><strong>Fim da Violência:</strong> após 1 minuto sem causar ou sofrer dano hostil, PS tornam-se 0.</li></ul>`),
  feature("berserker-frenesi", "Frenesi", 1, `<p>Você entra automaticamente em Frenesi ao alcançar metade dos PS máximos, arredondada para cima, e sai depois da resolução que o deixar abaixo do Limiar.</p><ul><li>Resistência a Cortante, Perfurante e Concussão, mágicos ou não.</li><li>+3 m de deslocamento.</li><li>Uma vez por turno, dano corpo a corpo adicional igual à Proficiência.</li></ul>`),
  feature("berserker-golpe-brutal", "Golpe Brutal", 1, `<p>Depois de confirmar um acerto corpo a corpo, uma vez por rodada, gaste de 1 PS até sua Proficiência. Acrescente um dado por PS: d6 nos níveis 1–4, d8 nos 5–10, d10 nos 11–16 e d12 nos 17–20. Os dados dobram no crítico.</p>`),
  feature("berserker-tecnicas-sangue", "Técnicas de Sangue", 2, `<p>Aprenda duas Técnicas entre Carnificina e Hemotecnia. Aprenda mais uma nos níveis 5, 9, 13 e 17. Ao ganhar nível, pode trocar uma conhecida por outra cujo requisito cumpra.</p><p>Hemotecnias também exigem Sacrifício: perda de PV igual ao custo em PS × Proficiência. Não é dano, não pode ser reduzida, não gera PS e não pode deixar você abaixo de 1 PV.</p>`),
  improvement(4),
  feature("berserker-ataque-extra", "Ataque Extra", 5, paragraphs("Ao realizar a ação Atacar em seu turno, ataque duas vezes em vez de uma.")),
  feature("berserker-frenesi-aprimorado", "Frenesi Aprimorado", 7, paragraphs("Em Frenesi, tenha vantagem em testes e salvaguardas de Força, ignore terreno difícil não mágico e gaste apenas 1,5 m para levantar-se de Caído.")),
  improvement(8),
  feature("berserker-frenesi-superior", "Frenesi Superior — Retaliação Brutal", 11, paragraphs("Em Frenesi, quando criatura em seu alcance corpo a corpo causar dano em você, use sua Reação para atacá-la. Esse ataque não pode usar Golpe Brutal nem Técnicas de Sangue.")),
  improvement(12),
  feature("berserker-frenesi-irrestrito", "Frenesi Irrestrito", 15, paragraphs("Em Frenesi, ao falhar em salvaguarda que causaria Amedrontado, Atordoado, Enfeitiçado ou Paralisado, gaste 2 PS para transformar a falha em sucesso, uma vez por rodada.")),
  improvement(16),
  feature("berserker-frenesi-eterno", "Frenesi Eterno", 19, paragraphs("Após 1 minuto sem violência hostil, seus PS tornam-se Limiar − 1 em vez de 0. Ao rolar Iniciativa, aumente-os até esse valor se estiverem abaixo dele.")),
  feature("berserker-supremacia", "Supremacia Berserk", 20, `<p><strong>Sangue Inesgotável:</strong> em Frenesi, após resolver o primeiro gasto de PS de cada rodada, recupere 1 PS.</p><p><strong>Violência Absoluta:</strong> Golpe Brutal ignora resistência ao tipo da arma, mas não imunidade.</p>`)
];

export const BERSERKER_LEGACIES = [
  { key: "legado-imortal", name: "Legado do Imortal", description: paragraphs("Feridas aceleram sua reserva e cada turno oferece uma chance de recompor o corpo."), features: [
    feature("imortal-essencia", "Essência Imortal", 3, paragraphs("Resistência a Necrótico. Com metade ou menos dos PV máximos, você está no Limiar da Morte; a primeira vez por rodada que sofrer dano hostil nesse estado concede +1 PS adicional."), "legado-imortal"),
    feature("imortal-regeneracao", "Regeneração Sangrenta", 6, paragraphs("No início do turno no Limiar da Morte, gaste 1 PS para recuperar 1d8 + CON PV; em Frenesi, 1d12 + CON."), "legado-imortal"),
    feature("imortal-vontade", "Vontade Inquebrável", 10, paragraphs("Ao ser reduzido a 0 PV, gaste 2 PS para permanecer com 1 PV e entrar em Frenesi até o fim do próximo turno. Uma vez por Descanso Curto ou Longo."), "legado-imortal"),
    feature("imortal-corpo", "Corpo Indestrutível", 14, paragraphs("No Limiar da Morte e em Frenesi, depois da resistência, reduza o dano Cortante, Perfurante ou Concussão restante em sua Proficiência."), "legado-imortal"),
    feature("imortal-ascensao", "Ascensão Imortal", 18, paragraphs("Uma vez por Descanso Longo ao entrar no Limiar da Morte ou cair a 0 PV: recupere 25% dos PV e, por 1 minuto, Frenesi não termina abaixo do limiar, resista a tudo exceto Psíquico/Radiante, cure 1d12+CON no início do turno e permaneça com 1 PV na primeira queda."), "legado-imortal"),
    feature("imortal-imortalidade", "Imortalidade", 20, paragraphs("Em Frenesi, a primeira Regeneração Sangrenta de cada rodada não custa PS."), "legado-imortal")
  ]},
  { key: "legado-carniceiro", name: "Legado do Carniceiro", description: paragraphs("Abra sangramentos, persiga os feridos e prepare execuções."), features: [
    feature("carniceiro-carnificina", "Carnificina", 3, `<p>Uma vez por turno, um acerto corpo a corpo aplica <strong>Sangrando</strong> sem PS. No início do turno, o alvo sofre dano igual à Proficiência ignorando resistência a Cortante e faz CON contra sua CD de Sangue para encerrar; máximo 1 minuto. Não acumula nem gera PS.</p><p>Ao mover-se em direção a um alvo Sangrando, outros alvos Sangrando por você não fazem ataques de oportunidade.</p>`, "legado-carniceiro"),
    feature("carniceiro-profundo", "Sangramento Profundo", 6, paragraphs("Sangrando recupera metade dos PV. Uma vez por rodada, dano corpo a corpo contra alvo Sangrando enquanto abaixo do Limiar concede +1 PS."), "legado-carniceiro"),
    feature("carniceiro-predador", "Predador Escarlate", 10, paragraphs("Ataques corpo a corpo contra Sangrando obtêm crítico em 19–20. Você percebe se ele está abaixo de metade dos PV e tem vantagem no primeiro ataque corpo a corpo do turno contra ele."), "legado-carniceiro"),
    feature("carniceiro-execucao", "Execução Brutal", 14, paragraphs("Contra Sangrando com 25% ou menos de PV, ao usar Golpe Brutal gaste 2 PS adicionais para maximizar seus dados normais. Se o alvo cair a 0, recupere 2 PS e mova metade do deslocamento em direção a outro hostil sem ataques de oportunidade."), "legado-carniceiro"),
    feature("carniceiro-ceifador", "Ceifador Carmesim", 18, paragraphs("Em Frenesi, ao reduzir Sangrando a 0, use Reação para mover metade sem ataques de oportunidade e atacar outro alvo, uma vez por turno. Quando Sangrando morrer a 9 m, uma vez por turno, ganhe 1 PS ou cure CON + Proficiência."), "legado-carniceiro"),
    feature("carniceiro-avatar", "Avatar da Carnificina", 20, paragraphs("Em Frenesi, o Limiar de Execução passa a 1/3 dos PV e seus ataques corpo a corpo aplicam Sangrando sem limite por turno."), "legado-carniceiro")
  ]},
  { key: "legado-frenetico", name: "Legado do Frenético", description: paragraphs("Alterne entradas e saídas de Frenesi para obter movimento e pressão."), features: [
    feature("frenetico-impeto", "Ímpeto Frenético", 3, paragraphs("Ao entrar em Frenesi, até o fim do próximo turno: +3 m adicionais, ignore terreno difícil e, após mover 3 m, vantagem no primeiro ataque corpo a corpo."), "legado-frenetico"),
    feature("frenetico-embalo", "Embalo da Carnificina", 6, paragraphs("Uma vez por turno, um acerto corpo a corpo em Frenesi permite mover 3 m sem ataque de oportunidade do alvo; se alcançar outro hostil, o próximo ataque contra ele causa +2 dano."), "legado-frenetico"),
    feature("frenetico-ruptura", "Ruptura Frenética", 10, paragraphs("Uma vez por turno quando gastar PS e cair abaixo do Limiar, escolha: mover metade sem ataques de oportunidade; suprimir ataques de oportunidade e reduzir 3 m do deslocamento de um alvo atingido; ou receber PV temporários iguais a Proficiência + PS gastos."), "legado-frenetico"),
    feature("frenetico-devastador", "Frenesi Devastador", 14, paragraphs("Uma vez por rodada ao reentrar em Frenesi após perdê-lo, a próxima Técnica antes do fim do próximo turno custa 1 PS a menos, mínimo 1."), "legado-frenetico"),
    feature("frenetico-danca", "Dança da Destruição", 18, paragraphs("Uma vez por rodada, ao reentrar após Ruptura, mova metade sem ataques de oportunidade ou use imediatamente Técnica conhecida de custo base 1 PS sem sua ação, pagando todos os custos."), "legado-frenetico"),
    feature("frenetico-absoluto", "Frenesi Absoluto", 20, paragraphs("Ímpeto permanece em Frenesi. Ruptura escolhe dois efeitos diferentes. Toda passagem de abaixo para o Limiar conta como nova entrada."), "legado-frenetico")
  ]},
  { key: "legado-besta", name: "Legado da Besta", description: paragraphs("Assuma forma predatória e adapte o corpo com Mutações Bestiais."), features: [
    feature("besta-despertar", "Despertar Bestial", 3, paragraphs("Em Frenesi, Arma Natural 1d8 + FOR. Se todos os ataques da ação Atacar forem naturais, faça um ataque natural como ação bônus. Uma vez por turno, acerto natural: impede ataque de oportunidade, dá vantagem para agarrar ou força FOR para empurrar 1,5 m."), "legado-besta"),
    feature("besta-mutacao", "Mutação Predatória", 6, paragraphs("Escolha uma Mutação Bestial."), "legado-besta"),
    feature("besta-forma", "Forma Predatória", 10, paragraphs("Em Frenesi ao alcançar PS máximos, entre na Forma enquanto o Frenesi durar. Arma Natural 1d10. No início do turno escolha +3 m, PV temporários = Proficiência ou um empurrão natural de 1,5 m sem salvaguarda."), "legado-besta"),
    feature("besta-evolucao", "Evolução Monstruosa", 14, paragraphs("Escolha uma segunda Mutação. Em Forma Predatória, todas usam a versão Evoluída."), "legado-besta"),
    feature("besta-primordial", "Besta Primordial", 18, paragraphs("Escolha terceira Mutação. O Limiar já ativa Forma Predatória; Arma Natural 1d12, supera defesa contra ataques não mágicos e Mutações ficam Evoluídas."), "legado-besta"),
    feature("besta-perfeito", "Monstro Perfeito", 20, paragraphs("Em Frenesi, no início do turno troque uma Mutação por qualquer outra; em Forma, ela é Evoluída."), "legado-besta")
  ]}
];

const mutationEntries = [
  ["pernas", "Pernas do Predador", "+3 m em Frenesi, escalada igual ao deslocamento e levantar custa 1,5 m.", "Saltos sem corrida, ignore 6 m de queda e terreno difícil em inclinações naturais."],
  ["carapaca", "Carapaça Óssea", "+1 CA em Frenesi.", "Após resistência, reduza em 2 o dano físico restante."],
  ["sentidos", "Sentidos Selvagens", "Visão no escuro +18 m, vantagem em Percepção por audição/olfato; Invisibilidade percebida não concede vantagem uma vez por turno.", "Não pode ser Surpreendido consciente e detecta Invisíveis a 3 m sem cobertura total."],
  ["apendice", "Apêndice Predatório", "Alcance de Armas Naturais +1,5 m no turno.", "Reação para atacar criatura que entra no alcance natural."],
  ["massa", "Massa Monstruosa", "Conte como um tamanho maior para carga, empurrar e agarrar; vantagem contra empurrão/queda.", "Agarre até duas categorias maiores com vantagem."],
  ["asas", "Asas Vestigiais", "Em Frenesi, Reação para zerar queda e planar 3 m por 3 m caídos.", "Voo igual ao deslocamento em Forma Predatória."],
  ["branquias", "Brânquias Abissais", "Respire ar/água, natação igual ao deslocamento e sem penalidades comuns submersas com Arma Natural.", "Submerso: +3 m, vantagem para agarrar e alvo tem desvantagem para escapar."],
  ["pele", "Pele Mimética", "Imóvel até o próximo turno concede vantagem em Furtividade visual.", "Ação bônus em Forma para camuflar até atacar ou mover mais da metade; não é Invisível."],
  ["glandulas", "Glândulas Tóxicas", "Uma vez por turno, acerto natural força CON; em falha, alvo não cura até seu próximo turno.", "Em falha, também Envenenado."],
  ["espinhos", "Espinhos Reativos", "Atacante corpo a corpo sofre Proficiência em dano, uma vez por turno por criatura; não gera PS.", "Também perde 3 m até o fim do turno."],
  ["membros", "Membros Escavadores", "Escavação 3 m em materiais naturais soltos.", "Escavação = metade do deslocamento; emergir adjacente suprime ataque de oportunidade uma vez por turno."],
  ["cauda", "Cauda Preênsil", "Manipule objetos; uma vez por turno some Proficiência a agarrar, empurrar ou equilíbrio se ainda não somada.", "Mantenha um alvo agarrado com a cauda e mãos livres."]
];
export const BERSERKER_MUTATIONS = mutationEntries.map(([key, name, base, evolved]) => feature(`berserker-mutacao-${key}`, name, 6, `<p><strong>Base:</strong> ${base}</p><p><strong>Evoluída:</strong> ${evolved}</p>`, "mutacoes"));

export const BERSERKER_TECHNIQUES = [
  technique("investida", "Investida Carniceira", 2, "Carnificina", "1 PS", "Ao mover-se", paragraphs("Após mover 3 m em direção a hostil, +3 m até o fim do turno apenas para aproximar-se e +2 no próximo ataque corpo a corpo do turno.")),
  technique("quebra-ossos", "Quebra-Ossos", 2, "Carnificina", "1 PS", "Ao acertar corpo a corpo", paragraphs("Alvo salva FOR ou CON; falha reduz deslocamento à metade até seu próximo turno. Segunda falha enquanto ativo também deixa Caído.")),
  technique("carne", "Carne pela Carne", 2, "Carnificina", "1 PS", "Reação ao sofrer dano corpo a corpo", paragraphs("Reduza o dano em 1d10 + CON. Seu primeiro acerto contra o agressor até o fim do próximo turno impede Reações dele até o próximo turno.")),
  technique("recusar", "Recusar a Queda", 2, "Carnificina", "3 PS", "Ao cair a 0 PV • 1/Descanso Longo", paragraphs("Depois de gerar PS pelo dano, permaneça com 1 PV; até o fim do próximo turno, deslocamento não cai abaixo da metade e vantagem no primeiro ataque corpo a corpo.")),
  technique("lamina", "Lâmina Hemática", 2, "Hemotecnia", "1 PS + Prof. PV", "Ação bônus • 1 minuto", paragraphs("Arma corpo a corpo/natural causa uma vez por turno +1d6 Cortante, Perfurante ou Necrótico; d8 no nível 9 e d10 no 17.")),
  technique("puxao", "Puxão Escarlate", 2, "Hemotecnia", "2 PS + 2×Prof. PV", "Ação • 6 m", paragraphs("FOR falha: puxe 3 m. Se terminar no alcance, ataque imediatamente sem Golpe Brutal ou Técnica.")),
  technique("coagulado", "Sangue Coagulado", 2, "Hemotecnia", "1 PS + Prof. PV", "Reação", paragraphs("Reduza dano físico em Proficiência + CON. Em Frenesi, qualquer dano exceto Psíquico.")),
  technique("marca", "Marca Rubra", 2, "Hemotecnia", "1 PS + Prof. PV", "Ao acertar corpo a corpo", paragraphs("Até o fim do próximo turno, conheça a direção a 18 m, ignore benefícios de Invisibilidade e ganhe +3 m ao mover-se em direção ao alvo.")),
  technique("arremesso", "Arremesso Brutal", 5, "Carnificina", "2 PS", "Depois de agarrar", paragraphs("Arremesse alvo até uma categoria maior por 3 m; FOR falha fica Caído. Criatura atingida também salva para não cair.")),
  technique("avanco", "Avanço Implacável", 5, "Carnificina", "1 PS", "Ação bônus", paragraphs("Mova metade em direção a hostil sem ataque de oportunidade dele.")),
  technique("onda", "Onda Hemática", 5, "Hemotecnia", "2 PS + 2×Prof. PV", "Ação • cone 4,5 m", paragraphs("CON: 2d8 Necrótico e empurra 1,5 m; sucesso metade sem empurrão. 3d8 no nível 11, 4d8 no 17.")),
  technique("correntes", "Correntes Carmesins", 5, "Hemotecnia", "2 PS + 2×Prof. PV", "Ação • 9 m", paragraphs("FOR falha: Agarrado até o fim do próximo turno, repetindo salvaguarda no fim do turno.")),
  technique("atravessar", "Atravessar a Dor", 9, "Carnificina", "2 PS", "Quando condição reduzir deslocamento", paragraphs("Até o fim do turno, deslocamento não cai abaixo da metade; não remove a condição.")),
  technique("impacto", "Impacto Demolidor", 9, "Carnificina", "2 PS", "Ao acertar corpo a corpo", paragraphs("FOR falha: empurre 4,5 m e Caído. Colisão impede Reações e dá desvantagem no próximo ataque até o fim do próximo turno.")),
  technique("pacto", "Pacto Carmesim", 9, "Hemotecnia", "2 PS + 2×Prof. PV", "Reação • aliado 6 m", paragraphs("Reduza dano sofrido por aliado em 2d10 + CON; o dano desaparece.")),
  technique("passo", "Passo Rubro", 9, "Hemotecnia", "2 PS + 2×Prof. PV", "Ação bônus • 9 m", paragraphs("Teleporte para espaço visível desocupado.")),
  technique("sismico", "Golpe Sísmico", 13, "Carnificina", "3 PS", "Ataque ao solo • 3 m", paragraphs("Alvos escolhidos salvam FOR; falha: Caído e empurrado 1,5 m. Área é terreno difícil até seu próximo turno.")),
  technique("cacada", "Caçada Impossível", 13, "Carnificina", "2 PS", "Reação • 9 m", paragraphs("Quando alvo visível afastar-se voluntariamente, mova seu deslocamento em direção a ele sem ataques de oportunidade; não concede ataque.")),
  technique("arsenal", "Arsenal Hemático", 13, "Hemotecnia", "3 PS + 3×Prof. PV", "Ação bônus • 1 minuto", paragraphs("Armas de sangue com FOR: Lâmina 1d10; Chicote 1d8 e +1,5 m; Martelo 1d8 e empurra 1,5 m uma vez por turno.")),
  technique("prisao", "Prisão de Sangue", 13, "Hemotecnia", "3 PS + 3×Prof. PV", "Ação • 9 m", paragraphs("CON falha: Contido até fim do próximo turno e não pode curar; repete salvaguarda no fim do turno.")),
  technique("distancia", "Não Existe Distância", 17, "Carnificina", "3 PS", "Ação bônus", paragraphs("Mova todo o deslocamento em direção a hostil percebido sem ataques de oportunidade, atravesse hostis, ignore terreno difícil e corra por paredes se terminar apoiado.")),
  technique("inquebravel", "Quebrar o Inquebrável", 17, "Carnificina", "3 PS", "Ao acertar antes do dano", paragraphs("O ataque ignora resistência e redução fixa; Reações não podem reduzir, transferir ou redirecionar o dano. Imunidade permanece.")),
  technique("diluvio", "Dilúvio Carmesim", 17, "Hemotecnia", "3 PS + 3×Prof. PV", "Ação • raio 6 m", paragraphs("CON: 6d8 Necrótico e deslocamento pela metade; sucesso metade sem redução.")),
  technique("corpo", "Corpo de Sangue", 17, "Hemotecnia", "3 PS + 3×Prof. PV", "Reação ao sofrer dano", paragraphs("Até o início do próximo turno, resistência a tudo exceto Psíquico, incluindo o gatilho; atravesse criaturas e aberturas de 15 cm e não seja agarrado/contido fisicamente."))
];
