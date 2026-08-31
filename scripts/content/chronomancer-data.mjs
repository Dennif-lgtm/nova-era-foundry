const p = (...parts) => parts.map(text => `<p>${text}</p>`).join("");
const feature = (key, name, level, description, group = "cronomante") => ({ key, name, level, description, group });
const intervention = (key, name, category, laws, cost, execution, range, description) => ({
  key: `crono-intervencao-${key}`,
  name,
  level: 0,
  group: `biblioteca-${category}`,
  description: `<p><strong>${laws} • ${category} • ${cost} • ${execution} • ${range}</strong></p>${description}`
});

export const CHRONOMANCER_CLASS = {
  key: "cronomante",
  name: "Cronomante — Nova Era",
  description: `
    <h2>Cronomante</h2>
    <blockquote>“Todo acontecimento é apenas uma possibilidade até que alguém escolha qual aconteceu.”</blockquote>
    ${p("Você reconhece Fraturas no fluxo do tempo e realiza Intervenções capazes de alterar o destino de acontecimentos breves.", "Magias resolvem problemas maiores. Intervenções resolvem momentos: um movimento que chega cedo, uma reação que chega tarde ou uma oportunidade que ecoa.")}
    <h3>Criação da Classe</h3>
    <ul>
      <li><strong>Dado de Vida:</strong> d8</li>
      <li><strong>Atributo Principal:</strong> Inteligência</li>
      <li><strong>Armaduras:</strong> nenhuma</li>
      <li><strong>Armas:</strong> armas simples</li>
      <li><strong>Testes de Resistência:</strong> Inteligência e Sabedoria</li>
      <li><strong>Perícias:</strong> escolha duas entre Arcanismo, História, Investigação, Intuição, Medicina e Percepção.</li>
      <li><strong>CD de Intervenção:</strong> 8 + Proficiência + Inteligência.</li>
      <li><strong>Ataque de Intervenção:</strong> Proficiência + Inteligência.</li>
    </ul>
    <h3>Conjuração</h3>
    <p>Você é um conjurador completo e utiliza Inteligência como atributo de conjuração.</p>
    <h3>Tratados</h3>
    <p>Escolha um Tratado no nível 3. Ele concede características nos níveis 3, 10, 15 e 18.</p>
  `
};

const improvement = level => feature(`crono-aprimoramento-${level}`, `Aprimoramento — Nível ${level}`, level, p("Aplique as regras gerais de Aprimoramento de Nova Era."));

export const CHRONOMANCER_FEATURES = [
  feature("crono-conjuracao", "Conjuração do Cronomante", 1, p("Você é um conjurador completo. Inteligência é seu atributo de conjuração.", "CD para resistir às suas magias = 8 + Proficiência + Inteligência. Ataque mágico = Proficiência + Inteligência.")),
  feature("crono-pontos-temporais", "Pontos Temporais", 1, `<p>Seu máximo de Pontos Temporais (PT) é igual ao <strong>Bônus de Proficiência + modificador de Inteligência</strong>, mínimo 1.</p><ul><li><strong>Descanso Curto:</strong> recupere metade do máximo, arredondada para cima.</li><li><strong>Descanso Longo:</strong> recupere todos os PT.</li><li><strong>Fratura Crítica:</strong> recupere 1 PT, no máximo uma vez por turno, quando criatura visível obtiver ou sofrer Acerto Crítico ou for reduzida a 0 PV.</li></ul><p>O custo é pago ao declarar a Intervenção e não é devolvido se ela falhar. Salvo indicação contrária, realize uma Intervenção por turno.</p>`),
  feature("crono-biblioteca-pessoal", "Biblioteca Pessoal", 1, `<p>No 1º nível, escolha dois Fundamentos. Sempre que a progressão indicar novo conhecimento, registre uma entrada da categoria correspondente. Ao ganhar um nível, pode substituir uma Intervenção por outra da mesma categoria.</p><p>A Biblioteca pode servir como foco de conjuração. Se perdida, reconstrua-a durante um Descanso Longo.</p>`),
  feature("crono-intervencoes", "Intervenções Temporais", 1, `<p>Uma Intervenção é uma alteração breve e não-mágica realizada sobre um acontecimento. Declare-a, verifique os requisitos, pague PT, resolva o efeito, resolva uma Confluência compatível, consuma o Rastro anterior e gere o novo Rastro.</p><p>Intervenções não exigem componentes e não impedem conjuração no mesmo turno. Salvo indicação contrária, apenas uma pode ser usada por turno; Paralelismo pode permitir uma segunda, nunca uma terceira.</p>`),
  feature("crono-afinidade-1", "Afinidade I — Percepção Fraturada", 1, p("Você identifica alterações temporais perceptíveis e pode realizar Intervenções antes de agir pela primeira vez em combate, desde que não esteja Surpreendido.")),
  feature("crono-confluencias", "Confluências Temporais", 2, `<p>Toda Intervenção gera um Rastro correspondente à sua Lei. Você mantém apenas um Rastro, até ser consumido, substituído ou até o início do seu próximo turno. Uma Lei diferente compatível com o Rastro gera uma Confluência e consome o Rastro anterior.</p><ul><li><strong>Precedência + Atraso — Equilíbrio Causal:</strong> você ou aliado a 9m move 1,5m sem Ataques de Oportunidade.</li><li><strong>Precedência + Repetição — Impulso Temporal:</strong> oportunidade repetida ocorre imediatamente; movimento recebe +1,5m.</li><li><strong>Precedência + Continuidade — Instante Preservado:</strong> benefício dura até o início do seu próximo turno.</li><li><strong>Precedência + Ruptura — Causalidade Invertida:</strong> criatura afetada não realiza Reações durante a resolução.</li><li><strong>Atraso + Repetição — Horizonte Ecoante:</strong> novo Rastro permanece até o final do seu próximo turno.</li><li><strong>Atraso + Continuidade — Horizonte Suspenso:</strong> consequência não-danosa começa ao final do turno do afetado.</li><li><strong>Atraso + Ruptura — Instante Perdido:</strong> Reação ou efeito secundário é perdido.</li><li><strong>Repetição + Continuidade — Linha Convergente:</strong> beneficiado mantém ou retorna à posição inicial do turno.</li><li><strong>Repetição + Ruptura — Eco Fraturado:</strong> em nova rolagem, escolha o resultado original ou o novo.</li><li><strong>Continuidade + Ruptura — Ponto de Ruptura:</strong> efeito temporário de até 1 rodada não pode ser prolongado.</li></ul>`),
  improvement(4),
  feature("crono-reflexos-temporais", "Reflexos Temporais", 5, `<p><strong>Reação • Custo: 2 PT • Uma vez por rodada</strong></p><p>Quando criatura realizar ataque contra você, antes da rolagem, mova até 3m. Se sair do alcance, o ataque falha. Se permanecer alvo válido, recebe +2 CA contra o ataque e vantagem em qualquer resistência exigida por ele ou pelo efeito.</p>`),
  feature("crono-afinidade-2", "Afinidade II — Visão das Possibilidades", 6, p("Você possui vantagem em Iniciativa. Ao rolar Iniciativa, escolha aliado visível; ele adiciona seu modificador de Inteligência à própria Iniciativa.")),
  feature("crono-paralelismo-1", "Paralelismo Temporal I", 7, p("Uma vez por turno, após resolver Intervenção baseada em Fundamento, pode realizar uma segunda Intervenção baseada em Fundamento. Ela deve usar Lei diferente, consome PT normalmente e pode gerar Rastro.")),
  improvement(8),
  feature("crono-leitura-fraturas", "Leitura das Fraturas", 9, p("Sempre que uma Confluência ocorrer, escolha: recuperar 1 PT; mover até 3m sem Ataques de Oportunidade; ou conceder a aliado a até 9m +2 na próxima jogada de ataque ou resistência antes do início do seu próximo turno. Recupere PT assim no máximo uma vez por rodada.")),
  feature("crono-fluxo-continuo", "Fluxo Contínuo", 10, p("Ao utilizar Intervenção como Reação, pode substituir o Rastro gerado por Rastro de qualquer outra Lei. A Intervenção conserva a Lei original para os demais efeitos.")),
  feature("crono-dominio-relacoes", "Domínio das Relações", 11, p("Você acessa Grandes Teorias e aprende uma nova Intervenção. Quando uma Disciplina participar de Confluência, pode conservar o Rastro em vez de consumi-lo, uma vez até o início do seu próximo turno.")),
  improvement(12),
  feature("crono-afinidade-3", "Afinidade III — Olhos da Continuidade", 13, p("Você não pode ser Surpreendido enquanto consciente e percebe quando acontecimento visível foi repetido, adiado, preservado ou rompido por efeito sobrenatural.")),
  feature("crono-presenca-atemporal", "Presença Atemporal", 13, p("Você possui vantagem em testes para evitar ficar Contido, Paralisado ou ter o deslocamento reduzido. Pode realizar Intervenções mesmo quando efeito impedir Reações, desde que não esteja Incapacitado.")),
  feature("crono-paralelismo-2", "Paralelismo Temporal II", 14, p("Paralelismo pode incluir Disciplinas. A segunda Intervenção exige Lei diferente e custos normais. Uma vez por turno, uma das duas custa 1 PT a menos, mínimo 1.")),
  improvement(16),
  feature("crono-conhecimento-proibido", "Conhecimento Proibido", 17, p("Você obtém acesso aos Paradoxos e aprende uma Grande Teoria. Paradoxos exigem descoberta ou fonte singular definida pelo Mestre.")),
  feature("crono-existencia-paradoxal", "Existência Paradoxal", 18, p("Uma vez por Descanso Longo, quando falhar em ataque, teste ou resistência, ou sofrer Acerto Crítico, escolha outro resultado válido que naturalmente poderia ter ocorrido: fracasso pode se tornar sucesso, crítico pode se tornar acerto normal ou ataque contra você pode errar. Não cria resultado impossível nem altera acontecimento anterior.")),
  improvement(19),
  feature("crono-quebra-tempo", "Quebra do Tempo", 20, `<p><strong>Ação Bônus • 1/Descanso Longo • 1 minuto</strong></p><ul><li>Cada Intervenção gera automaticamente uma Confluência apropriada.</li><li>Paralelismo pode incluir qualquer categoria.</li><li>Cada Intervenção custa 1 PT a menos, mínimo 1.</li><li>Ao ativar, recupere até 4 PT.</li></ul><p>Cada Intervenção ainda ativa apenas uma Confluência.</p>`)
];

export const CHRONOMANCER_TREATISES = [
  { key: "tratado-precedencia", name: "Tratado da Precedência", description: p("Estudo da ordem dos acontecimentos. Domina Precedência e Atraso."), features: [
    feature("crono-mestre-precedencia", "Mestre da Precedência", 3, p("Ao usar Intervenção de Precedência ou Atraso, escolha aumentar o alcance em 3m ou permitir que uma criatura afetada mova 1,5m sem Ataques de Oportunidade."), "tratado-precedencia"),
    feature("crono-sequencia-preferencial", "Sequência Preferencial", 10, p("Uma vez por Confluência envolvendo Precedência ou Atraso, recupere 1 PT, no máximo uma vez por rodada, ou permita que aliado a 9m mova 3m sem Ataques de Oportunidade."), "tratado-precedencia"),
    feature("crono-primeiro-instante", "Primeiro Instante", 15, `<p><strong>4 PT • Ação Bônus • 1 minuto</strong></p><p>Receba segunda Reação por rodada, apenas para Intervenções. A primeira Intervenção de Precedência em cada turno custa 1 PT a menos, mínimo 1. Uma vez por turno, aliado que iniciar turno a 9m move metade do deslocamento sem Ataques de Oportunidade.</p>`, "tratado-precedencia"),
    feature("crono-tese-precedencia", "Tese da Precedência", 18, p("Uma vez por Descanso Longo, ao iniciar combate, até o fim dele: não pode ser Surpreendido; a primeira Intervenção de cada rodada não custa PT; aliado que iniciar turno a 9m move 3m sem Ataques de Oportunidade ou adiciona sua Inteligência ao primeiro ataque ou resistência do turno."), "tratado-precedencia")
  ]},
  { key: "tratado-possibilidades", name: "Tratado das Possibilidades", description: p("Estudo de linhas temporais alternativas. Domina Repetição e Ruptura."), features: [
    feature("crono-eco-possibilidade", "Eco de Possibilidade", 3, p("Ao usar Intervenção de Repetição ou Ruptura, escolha aumentar o alcance em 3m ou manter o Rastro até o final do seu próximo turno."), "tratado-possibilidades"),
    feature("crono-probabilidades-paralelas", "Probabilidades Paralelas", 10, p("Uma vez por Confluência envolvendo Repetição ou Ruptura, recupere 1 PT, no máximo uma vez por rodada, ou repita antes do fim do próximo turno um teste de atributo ou resistência feito por você, usando o novo resultado."), "tratado-possibilidades"),
    feature("crono-clone-temporal-tratado", "Clone Temporal", 15, `<p><strong>5 PT • Ação • 9m • Concentração, até 1 minuto</strong></p><p>Crie Clone em espaço desocupado. Ele ocupa espaço, não possui PV, ações ou ataques e não pode ser alvo. Truques e Intervenções podem originar-se dele; mova-o 6m no início do turno. Desaparece além de 18m.</p>`, "tratado-possibilidades"),
    feature("crono-incontaveis-possibilidades", "Incontáveis Possibilidades", 18, p("Uma vez por Descanso Longo, ao ativar Clone Temporal, escolha: criar dois Clones; dispensar Concentração por 1 minuto; ou trocar de posição com um Clone como Reação, uma vez por rodada."), "tratado-possibilidades")
  ]},
  { key: "tratado-continuidade", name: "Tratado da Continuidade", description: p("Estudo da estabilidade da linha temporal. Domina Continuidade e Precedência."), features: [
    feature("crono-linha-estavel", "Linha Estável", 3, p("Ao usar Intervenção de Continuidade ou Precedência, escolha aumentar o alcance em 3m ou conceder +1 CA a criatura afetada até o início do próximo turno dela."), "tratado-continuidade"),
    feature("crono-continuidade-compartilhada", "Continuidade Compartilhada", 10, p("Uma vez por Confluência envolvendo Continuidade ou Precedência, recupere 1 PT, no máximo uma vez por rodada, ou conceda a aliado a 9m redução do próximo dano em 1d8 + Inteligência até o início do seu próximo turno."), "tratado-continuidade"),
    feature("crono-tempo-imutavel-tratado", "Tempo Imutável", 15, `<p><strong>5 PT • Ação • Raio 6m • Concentração, até 1 minuto</strong></p><p>Aliados na área não sofrem deslocamento forçado, têm vantagem contra Derrubado, Contido e Paralisado, ignoram terreno difícil mágico e, uma vez durante a duração, permanecem com 1 PV quando seriam reduzidos a 0.</p>`, "tratado-continuidade"),
    feature("crono-tese-continuidade", "Tese da Continuidade", 18, p("Uma vez por Descanso Longo, ao ativar Tempo Imutável, escolha durante a duração: aliados não sofrem críticos; primeira Intervenção de Continuidade por rodada não custa PT; ou, uma vez por criatura, use Reação quando aliado cairia a 0 PV para deixá-lo com 1 PV, movê-lo 3m e encerrar Contido, Derrubado ou Amedrontado."), "tratado-continuidade")
  ]}
];

export const CHRONOMANCER_INTERVENTIONS = [
  intervention("acelerar", "Acelerar", "Fundamento", "Precedência", "1 PT", "Reação", "9m", p("Gatilho: criatura visível inicia o turno. Ela move imediatamente até 3m sem Ataques de Oportunidade, levanta-se sem gastar deslocamento ou realiza uma Interação com Objeto. Rastro: Precedência.")),
  intervention("antecipacao", "Antecipação", "Fundamento", "Precedência", "1 PT", "Ação Bônus", "9m", p("Escolha sacar ou guardar objeto, abrir ou fechar porta, levantar-se ou iniciar até 3m de deslocamento. O acontecimento ocorre imediatamente. Rastro: Precedência.")),
  intervention("retardar", "Retardar", "Fundamento", "Atraso", "1 PT", "Reação", "9m", p("Gatilho: criatura inicia deslocamento voluntário. Reduza aquele deslocamento em 3m, mínimo 0. Rastro: Atraso.")),
  intervention("inercia-temporal", "Inércia Temporal", "Fundamento", "Atraso", "1 PT", "Reação", "18m", p("Gatilho: criatura visível declara Reação. Resolva primeiro o acontecimento que a ativou. Depois, a Reação ocorre somente se ainda possuir alvo e condições válidas. Rastro: Atraso.")),
  intervention("eco-temporal", "Eco Temporal", "Fundamento", "Repetição", "1 PT", "Reação", "9m", p("Gatilho: você ou aliado falha em ataque, teste de atributo ou resistência. Repita a rolagem e use o novo resultado. Rastro: Repetição.")),
  intervention("reverberacao", "Reverberação", "Fundamento", "Repetição", "1 PT", "Reação", "9m", p("Gatilho: aliado termina deslocamento voluntário. Ele move 1,5m sem Ataques de Oportunidade; não pode usar isso para entrar no alcance corpo a corpo hostil. Rastro: Repetição.")),
  intervention("ancora-temporal", "Âncora Temporal", "Fundamento", "Continuidade", "1 PT", "Reação", "9m", p("Gatilho: criatura sofre deslocamento forçado ou seria Derrubada. Reduza o deslocamento em 3m ou impeça a queda. Rastro: Continuidade.")),
  intervention("permanencia", "Permanência", "Fundamento", "Continuidade", "1 PT", "Reação", "9m", p("Gatilho: benefício temporário não-mágico de até 1 rodada sobre aliado terminaria. Prolongue-o até o início do próximo turno dele. Não prolonga magias, Concentração, recursos, ações preparadas ou efeito já prolongado. Rastro: Continuidade.")),
  intervention("colapso", "Colapso", "Fundamento", "Ruptura", "1 PT", "Reação", "9m", p("Gatilho: hostil recebe benefício temporário não-mágico de até 1 rodada. Em falha na resistência de Inteligência, o benefício termina. Rastro: Ruptura.")),
  intervention("descontinuidade", "Descontinuidade", "Fundamento", "Ruptura", "1 PT", "Reação", "9m", p("Gatilho: ataque ou habilidade hostil geraria consequência secundária. Em falha na resistência de Inteligência, o efeito principal ocorre, mas uma consequência não-danosa não ocorre. Rastro: Ruptura.")),
  intervention("passo-intersticial", "Passo Intersticial", "Disciplina", "Precedência + Atraso", "2 PT", "Ação Bônus", "Pessoal", p("Mova até metade do deslocamento sem Ataques de Oportunidade. Pode atravessar espaços ocupados como terreno difícil, mas não terminar neles.")),
  intervention("eco-antecipado", "Eco Antecipado", "Disciplina", "Precedência + Repetição", "2 PT", "Reação", "9m", p("Quando Eco Temporal provocar nova rolagem, ela é feita imediatamente com vantagem e o novo resultado deve ser aceito.")),
  intervention("estado-adiantado", "Estado Adiantado", "Disciplina", "Precedência + Continuidade", "2 PT", "Ação Bônus", "9m", p("Registre a posição de aliado. Até o início do seu próximo turno, quando ele iniciar deslocamento, pode primeiro ser colocado em espaço desocupado a até 3m da posição registrada e então mover normalmente.")),
  intervention("ruptura-preventiva", "Ruptura Preventiva", "Disciplina", "Precedência + Ruptura", "2 PT", "Reação", "18m", p("Quando criatura declarar Reação, ela faz resistência de Inteligência. Em falha, a Reação é gasta sem efeito.")),
  intervention("eco-tardio", "Eco Tardio", "Disciplina", "Atraso + Repetição", "2 PT", "Reação", "9m", p("Quando aliado tiver sucesso em teste de atributo ou resistência, registre o resultado. Antes do fim do próximo turno dele, pode usá-lo em novo teste do mesmo tipo em vez de rolar.")),
  intervention("suspensao-temporal", "Suspensão Temporal", "Disciplina", "Atraso + Continuidade", "2 PT", "Reação", "9m", p("Quando criatura sofrer dano, suspenda até 2d8 + Inteligência. Ela sofre o dano suspenso ao final do próximo turno; ele não pode ser reduzido novamente.")),
  intervention("lacuna-temporal", "Lacuna Temporal", "Disciplina", "Atraso + Ruptura", "2 PT", "Reação", "9m", p("Quando hostil termina uma ação, ele não pode realizar Reações até o início do próximo turno dele.")),
  intervention("linha-restaurada", "Linha Restaurada", "Disciplina", "Repetição + Continuidade", "3 PT", "Reação", "9m", p("Quando aliado termina o turno, restaure sua posição inicial, até 2d8 + Inteligência PV perdidos no turno, ou remova uma condição adquirida no turno. Não restaura recursos, espaços, usos ou morte.")),
  intervention("eco-fraturado", "Eco Fraturado", "Disciplina", "Repetição + Ruptura", "2 PT", "Reação", "9m", p("Quando criatura repetir rolagem por Cronomancia, depois de ver ambos os resultados, escolha qual permanece.")),
  intervention("continuidade-quebrada", "Continuidade Quebrada", "Disciplina", "Continuidade + Ruptura", "3 PT", "Reação", "9m", p("Quando efeito temporário seria renovado ou prolongado, impeça a renovação. Ele segue até o fim original e não pode ser reaplicado pela mesma fonte até o início do próximo turno da criatura.")),
  intervention("clone-temporal", "Clone Temporal", "Grande Teoria", "Repetição + Ruptura", "4 PT", "Ação Bônus", "9m • 1 minuto", p("Crie Eco em espaço desocupado. Ele não tem turno, PV ou ações; mova-o 6m no início do seu turno. Uma vez por turno, truque ou Fundamento pode originar-se dele. Desaparece além de 18m.")),
  intervention("linha-alternativa", "Linha Alternativa", "Grande Teoria", "Repetição + Continuidade", "4 PT", "Reação", "9m", p("Quando aliado iniciar turno, registre posição, PV e condições. Até o início do próximo turno dele, use sua Reação para restaurar uma dessas propriedades. Não restaura recursos ou morte.")),
  intervention("horizonte-congelado", "Horizonte Congelado", "Grande Teoria", "Atraso + Continuidade", "4 PT", "Reação", "18m • 1/Descanso Curto", p("Quando acontecimento perceptível começar a ser resolvido, suspenda-o até o início do seu próximo turno. Ataque, área e alvos permanecem definidos quando possível; se a resolução se tornar impossível, colapsa sem efeito.")),
  intervention("eco-infinito", "Eco Infinito", "Grande Teoria", "Repetição + Continuidade", "4 PT", "Ação", "Concentração, até 1 minuto", p("Escolha Fundamento conhecido. A primeira vez em cada rodada que usá-lo, seu Eco permanece até o início do seu próximo turno e pode ser usado como Rastro daquela Lei.")),
  intervention("convergencia-absoluta", "Convergência Absoluta", "Grande Teoria", "Quaisquer duas Leis", "5 PT", "Sem ação", "1/Descanso Curto", p("Ao usar Intervenção, escolha segunda Lei diferente. Para Confluência, ela conta como ambas e resolve a combinação normalmente.")),
  intervention("existencia-simultanea", "Existência Simultânea", "Paradoxo", "Paradoxo", "6 PT", "Ação", "9m • 1 minuto • 1/Descanso Longo", p("Crie manifestação a até 9m. Para alcance e origem, use qualquer posição. No início do turno, escolha qual é real; apenas ela pode ser afetada. Como Reação antes de ataque, troque a posição real.")),
  intervention("tempo-imovel", "Tempo Imóvel", "Paradoxo", "Paradoxo", "7 PT", "Ação", "1/Descanso Longo", p("Até o fim do turno atual, receba imediatamente deslocamento completo, uma Ação e uma Ação Bônus. Nesse intervalo, não cause dano, force resistências ou afete diretamente outra criatura.")),
  intervention("destino-reescrito", "Destino Reescrito", "Paradoxo", "Paradoxo", "8 PT", "Reação", "18m • 1/Descanso Longo", p("Após acontecimento visível ser resolvido, antes das consequências permanentes, escolha outro resultado válido que naturalmente poderia ter ocorrido. Não cria resultado impossível, dano inexistente ou habilidade que a criatura não possua."))
];
