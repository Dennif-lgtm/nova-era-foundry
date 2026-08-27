# Nova Era / KY'rassel para Foundry VTT

Módulo de regras e automações para:

- Foundry VTT 13.351
- D&D5e 5.3.3

## Estado atual

Esta versão oferece armazenamento de Exposição por alvo e por Ladino e instala no mundo a pasta **Nova Era — Ladino**, contendo a classe, as três subclasses e todas as características consolidadas por nível.

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

## Próximo marco

Criar a interface de alvo, o fluxo de Analisar e a integração com Ataque Furtivo.
