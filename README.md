# Nova Era / KY'rassel para Foundry VTT

Módulo de regras e automações para:

- Foundry VTT 13.351
- D&D5e 5.3.3

## Estado atual

Esta versão oferece armazenamento de Exposição por alvo e por Ladino, automatiza a ação **Analisar**, adiciona um painel de Exposição à ficha e instala no mundo a pasta **Nova Era — Ladino**, contendo a classe, as três subclasses e todas as características consolidadas por nível.

### v0.25.0 — Relógio Vivo

- Adiciona um medalhão exclusivo para a classe Cronomante.
- Adiciona símbolos próprios para os Tratados da Precedência, das Possibilidades e da Continuidade.
- Integra o ícone da classe à Visão Essencial do relógio.
- Troca automaticamente o medalhão inferior conforme o Tratado escolhido pelo personagem.
- Fornece versões WebP de 512 px com transparência real para uso eficiente no Foundry.
- Alinha Leis, categorias, atalhos, Tratado e Reação aos centros reais dos adornos.
- Faz o ponteiro percorrer fisicamente as cinco posições do relógio ao usar o scroll.
- Remove o fundo opaco da janela e da Linha do Tempo para revelar o cenário do Foundry.

### v0.24.0 — Relógio Funcional v7 do Cronomante

- Redesenha a base do relógio como uma interface funcional sem abandonar sua identidade visual.
- Distribui as cinco Leis de Rastro e as cinco possibilidades de Confluência em arcos espelhados com encaixes próprios.
- Cria medalhões dedicados para Fundamentos, Disciplinas, Grandes Teorias, Paradoxos, Tratado e Reação Temporal.
- Integra os três atalhos XI, XII e I diretamente à geometria da arte.
- Mantém o núcleo de Pontos Temporais limpo e sem painéis opacos cobrindo a ilustração.
- Faz o ponteiro percorrer as categorias em ordem circular natural ao usar a roda do mouse.
- Usa transparência real fora da moldura para integração limpa ao Foundry.

### v0.23.6 — Arcos Concêntricos

- Reconstrói os dois arcos em torno do centro real do relógio.
- Distribui as cinco Leis por toda a altura útil dos segmentos de Rastros e Confluências.
- Mantém cada ícone a uma distância consistente do núcleo temporal.
- Faz ícones destacados avançarem diagonalmente em direção ao centro de acordo com sua posição orbital.

### v0.23.5 — Lapidação das Órbitas

- Aumenta os ícones de Rastros e Confluências para melhorar a leitura durante o jogo.
- Refina a curvatura e o espaçamento vertical dos dois arcos.
- Mantém maior destaque para a Lei ativa e para as Confluências disponíveis.
- Preserva o núcleo central e os encaixes rápidos sem sobreposição.

### v0.23.4 — Geometria e Ícones do Relógio

- Fixa Rastros e Confluências em arcos espelhados mesmo quando o Foundry conserva CSS anterior em cache.
- Usa os ícones oficiais do pack nas Intervenções rápidas de Fundamentos.
- Centraliza o ícone do Tratado no encaixe inferior do relógio.
- Preserva estados, brilhos, tooltips e automações do painel.

### v0.23.3 — Órbitas das Cinco Leis

- Distribui os cinco Rastros em um arco suave à esquerda do núcleo temporal.
- Espelha as cinco possibilidades de Confluência em um arco à direita.
- Mantém a ordem Precedência, Atraso, Repetição, Continuidade e Ruptura nos dois lados.
- Faz a Lei ativa avançar em direção ao núcleo com brilho azul.
- Faz Confluências disponíveis avançarem em direção ao núcleo com brilho violeta.
- Diferencia visualmente ícones normais, disponíveis e indisponíveis por tamanho e opacidade.

### v0.23.2 — Ponteiro e Atalhos Visuais do Cronomante

- Adiciona um ponteiro temporal completo, com haste, ponta luminosa e pivô central.
- Move o ponteiro suavemente entre as cinco posições principais ao girar a roda do mouse.
- Mantém o encaixe automático em Visão Essencial, Fundamentos, Disciplinas, Grandes Teorias e Paradoxos.
- Substitui os nomes nos atalhos XI, XII e I pelos ícones das Intervenções equipadas.
- Exibe nome e custo da Intervenção no tooltip, preservando a leitura limpa da arte.

### v0.23.1 — Relógio do Cronomante v6

- Substitui a base anterior pela arte transparente v6 com rótulos corrigidos.
- Separa visualmente as cinco Leis de Rastro das cinco possibilidades de Confluência.
- Reposiciona os seletores de categoria conforme os setores definitivos da ilustração.
- Usa o ícone correspondente ao Tratado escolhido pelo personagem.
- Impede que a seleção manual de um Rastro gere uma Confluência indevida.
- Preserva Pontos Temporais, atalhos, Biblioteca, Paralelismo, gatilhos e demais automações.

### v0.23.0 — Relógio Limpo do Cronomante

- Adota a nova arte limpa e transparente v4 criada para o painel do Foundry.
- Usa os quatro medalhões laterais para Fundamentos, Disciplinas, Grandes Teorias e Paradoxos.
- Reserva os três nichos superiores para os atalhos XI, XII e I.
- Reúne as cinco Leis na faixa inferior, com brilho distinto para Rastro ativo, Confluência disponível e opção bloqueada.
- Usa os dois medalhões inferiores para Tratado e Reação Temporal.
- Abre sempre na visão Essencial, sem Biblioteca lateral, e preserva toda a automação existente.

### v0.22.1 — Acabamento do Relógio Circular

- Torna invisíveis as áreas clicáveis dos quatro setores, eliminando retângulos sobre a ilustração.
- Remove títulos e algarismos duplicados que já fazem parte da arte.
- Centraliza os ícones dinâmicos das cinco Leis nos encaixes de Rastros e Confluências.
- Mantém apenas o nome dinâmico das Intervenções nos encaixes XI, XII e I.
- Oculta completamente a Biblioteca no modo Essencial e centraliza o relógio nessa visualização.

### v0.22.0 — Grande Relógio das Cinco Leis

- Reconstrói a janela independente do Cronomante com a arte circular aprovada.
- Gira o ponteiro por roda do mouse, arraste ou clique entre Essencial, Fundamentos, Disciplinas, Grandes Teorias e Paradoxos.
- Usa XI, XII e I como três atalhos configuráveis da categoria ativa; a Biblioteca continua oferecendo todas as Intervenções conhecidas.
- Mostra as cinco Leis em Rastros e destaca a Lei ativa.
- Mostra as cinco combinações possíveis em Confluências, distinguindo utilizável, válida mas bloqueada e indisponível.
- Aplica o Icon Pack do Cronomante e organiza os itens em subpastas para os três Tratados.
- Automatiza o limite de Intervenções por turno e a segunda Intervenção permitida por Paralelismo I/II, incluindo a redução do Paralelismo II.
- Preserva os gatilhos, janelas de confirmação, PT, Reação Temporal, versos no chat e progressão já existentes.

### v0.19.0 — Relógio Integrado

- Incorpora o Relógio do Cronomante à barra lateral da própria ficha, junto ao retrato.
- Remove a ampliação automática da janela e reduz o mostrador para um medalhão compacto.
- Mantém a rotação por clique, roda do mouse, arraste e setas.
- Transforma o centro do relógio e a faixa inferior em controles para abrir uma gaveta de comandos.
- A gaveta apresenta descrição, custo, Leis, Confluência prevista, execução e Biblioteca da categoria sem ocupar espaço quando fechada.
- Exibe PT e Intervenção selecionada em uma faixa compacta, com destaque quando a Reação Temporal está disponível.
- Inclui encaixe alternativo e comportamento responsivo para outras variações da ficha D&D5e.

### v0.18.0 — Biblioteca e Fraturas Reativas

- Abre uma janela de escolha da Biblioteca Pessoal quando o Cronomante conquista uma nova Intervenção.
- Respeita a progressão: Fundamentos nos níveis 1, 2, 5 e 9; Disciplina no 11; Grande Teoria no 17; Paradoxo no 20.
- Exclui conhecimentos já registrados e adiciona a escolha diretamente à ficha.
- Reconhece escolhas pendentes em fichas antigas sem duplicar Intervenções.
- Oferece janelas contextuais para Acelerar, Reflexos Temporais, Reverberação, Suspensão Temporal, Lacuna Temporal, Linha Restaurada, Linha Alternativa e Horizonte Congelado.
- Reconhece Fratura Crítica em acertos críticos e quando uma criatura chega a 0 PV, respeitando o limite de uma recuperação por turno.
- Verifica dono da ficha, alcance, PT e Reação antes de oferecer uma habilidade.
- Adiciona versos originais de Cronomancia ao chat, variando conforme a Lei temporal utilizada.

### v0.17.0 — Relógio Interativo

- O anel externo gira entre as quatro categorias de Intervenções.
- O anel interno gira apenas entre as Intervenções conhecidas pelo personagem.
- Clique, roda do mouse, arraste e setas oferecem maneiras diferentes de navegar.
- O núcleo mostra a Intervenção selecionada sem gastar recursos.
- Uma área de comando apresenta custo, ação, Leis, descrição e previsão de Confluência antes da execução.
- A execução valida PT e disponibilidade da Reação Temporal.
- Inclui uma lista compacta alternativa para acessibilidade e seleção rápida.

### v0.16.0 — Relógio ilustrado

- Substitui o mostrador desenhado somente em CSS por uma moldura artística própria.
- Usa o código apenas para dados e controles dinâmicos, preservando nitidez e automação.
- Posiciona até 12 Intervenções nos encaixes laterais da arte.
- Mantém Pontos Temporais, Rastro, Confluências, Tratado e Reação como elementos reais da interface.

### v0.15.1 — Acabamento do Relógio

- Reduz o painel do Cronomante e melhora sua proporção em relação à ficha.
- Reposiciona categorias para evitar textos cortados.
- Distribui poucas Intervenções de forma simétrica no arco superior.
- Reforça a leitura do núcleo, do Tratado e da Reação Temporal.

### v0.15.0 — Relógio do Cronomante

- Painel circular próprio para personagens da classe Cronomante — Nova Era.
- Controle de Pontos Temporais com máximo automático de Proficiência + Inteligência.
- Rastros, Confluências e Reação Temporal acompanhados diretamente na ficha.
- Até 12 Intervenções conhecidas aparecem como atalhos no mostrador e podem ser ativadas pelo relógio.
- O custo em PT e o fluxo de Rastros/Confluências são atualizados ao usar uma Intervenção.

### v0.14.0 — Cronomante completo

- Instala a classe Cronomante — Nova Era com progressão do nível 1 ao 20.
- Configura d8, conjuração completa por Inteligência e escolha de Tratado no nível 3.
- Adiciona os Tratados da Precedência, das Possibilidades e da Continuidade.
- Concede automaticamente as características de Tratado nos níveis 3, 10, 15 e 18.
- Instala as 28 Intervenções da Biblioteca como itens individuais.
- Inclui Pontos Temporais, Rastros, Dez Confluências, Cinco Leis e regras completas das Intervenções.
- Expõe a instalação manual em `game.novaEra.content.installChronomancer()`.

### v0.13.2 — Painel ilustrado

- Reconstrói o painel conforme a referência visual aprovada de Nova Era.
- Amplia molduras, olhos de Exposição, tipografia e placas de ação.
- Exibe o retrato do alvo selecionado.
- Separa Hide e Desengajar em controles visuais próprios de Ponto Cego.
- Transforma as três Técnicas de Exploração em botões diretos.
- Reforça visualmente o bloco dinâmico de subclasse e a barra de Reação.

### v0.13.3 — Símbolos de classe e subclasse

- Exibe o ícone oficial do Ladino no brasão do painel.
- Acrescenta um medalhão menor com o ícone da subclasse ativa.
- Alterna automaticamente entre Fantasma, Assassino e Rastreador.

### v0.13.4 — Analisar para jogadores

- Habilita oficialmente o canal de comunicação do módulo no Foundry.
- Permite que o Mestre aplique a Exposição solicitada por um jogador sem permissão sobre o alvo.
- Mostra um aviso quando a ação exige um Mestre conectado.

## Instalação pelo Foundry

Na tela **Instalar Módulo**, cole no campo **URL do Manifesto**:

```text
https://github.com/Dennif-lgtm/nova-era-foundry/releases/latest/download/module.json
```

## Instalação de desenvolvimento

Copie a pasta `nova-era` para a pasta `Data/modules` do Foundry e ative o módulo no mundo D&D5e.

## API inicial

```js
const ladino = game.actors.getName("Nome do Ladino");
const alvo = game.actors.getName("Nome do Alvo");

await game.novaEra.exposure.add(alvo, ladino, 1);
game.novaEra.exposure.get(alvo, ladino);
await game.novaEra.exposure.consume(alvo, ladino, 1);
await game.novaEra.exposure.postCard({
  sourceActor: ladino,
  targetActor: alvo,
  value: game.novaEra.exposure.get(alvo, ladino),
  reason: "Analisar"
});
```

Um Mestre também pode reconstruir ou atualizar os itens de conteúdo pelo console:

```js
await game.novaEra.content.installRogue();
```

## Analisar

Selecione exatamente um token como alvo e use a atividade **Analisar** dentro da característica **Exposição**. O módulo realiza Investigação contra CD 10 + nível/ND do alvo e registra até 3 Exposições em caso de sucesso.

O painel **Nova Era — Exposição** na ficha mostra o alvo selecionado, a quantidade atual de Exposição e um botão rápido para Analisar.

Depois de confirmar um acerto contra uma criatura Exposta, o botão **Ataque Furtivo** rola automaticamente o dano adequado ao nível do Ladino. Ele é passivo, não consome Exposição e continua limitado a uma vez por turno.

A partir do nível 6, **Exploração Técnica** permite consumir 2 Exposições no Ataque Furtivo e escolher Perfuração Precisa, Quebra de Ritmo ou Corte de Passo. Os efeitos temporários são acompanhados pelo módulo até o início do turno correspondente.

A ficha do Ladino possui tema próprio em grafite, preto e dourado envelhecido. O painel também acompanha Lâmina de Teste, Ponto Cego, Evasão, Leitura Completa e Golpe Decifrado conforme essas características entram na progressão.

A versão 0.10.0 instala a pasta **Nova Era — Macros do Ladino** e adiciona gatilhos de efeitos secundários. Leitura Completa pode preparar +2 para o próximo ataque ou resistência; Antecipar Golpe aplica +4 CA temporário; Antecipar Técnica aplica +4 à próxima resistência; Antecipar Movimento registra a Reação. Os efeitos de ataque e resistência são removidos depois da rolagem correspondente.

A versão 0.11.0 alinha o módulo às regras consolidadas: Ataque Furtivo passivo e gratuito; Evasão padrão do D&D; Ponto Cego liberado ao gerar ou gastar Exposição, com escolha entre Hide e Disengage; Exploração Técnica com custo próprio de 2 Exposições; Brecha Mortal e Falha Fatal adaptadas ao novo núcleo. A migração também atualiza as descrições já presentes nas fichas.

A versão 0.12.0 amplia a pasta **Nova Era — Macros do Ladino** para 31 macros e adiciona controles de subclasse ao painel. O Fantasma recebe Presença Inalcançável, Desvanecer e Forma Fantasma; o Assassino recebe Brecha Mortal de 1 ou 2 Exposições e Paciência Mortal; o Rastreador recebe escolha de Presa, Pressão, dano de Pressão, Caçada Persistente, Pressão Ininterrupta, Leitura Incansável e abandono da caçada. A inicialização do painel também fica isolada das migrações, evitando que um item antigo esconda a interface inteira.

Movimentos que dependem do tabuleiro e decisões do Mestre são apresentados como resoluções guiadas no chat; dados, custos, efeitos, limites de turno, Descanso Longo, Exposição e Pressão são tratados pelo módulo.

A versão 0.13.0 redesenha o painel como uma interface premium de jogo: cabeçalho próprio, cartão de alvo, gemas animadas de Exposição, ações primárias hierarquizadas, seções recolhíveis, cores dinâmicas para cada subclasse e barra de estados. Grupos sem habilidades disponíveis são ocultados automaticamente e o indicador de Reação reflete o estado real de Antecipação.

A versão 0.13.1 calibra o painel a partir do teste em ficha real: aumenta a coluna, tipografia e botões; separa os numerais das gemas; melhora a leitura dos estados bloqueados; e reduz a altura inicial mantendo os grupos secundários recolhidos. A migração deixa de substituir diretamente a coleção interna de atividades do D&D5e em itens existentes, evitando a falha de atualização observada em alguns mundos.
