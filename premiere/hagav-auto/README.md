# HAGAV AUTO

Painel dentro do Premiere Pro que executa, de uma vez e com conferência, a parte mecânica da edição.
A parte criativa continua fora dele: você escreve o pedido nos marcadores, o Claude lê a timeline,
decide o que fazer e entrega um plano; o painel aplica o plano.

```
você: marcadores na timeline
  └─ painel: 1. Ler timeline      → snapshot.json (faixas, clipes, legendas, marcadores)
       └─ Claude: lê o snapshot, interpreta os marcadores → plan.json
            └─ painel: 2. Conferir plano  (nada é escrito)
                 └─ painel: 3. Aplicar plano → backup, executa, relê, confere, marca CONCLUÍDO
```

## Por que é mais rápido

No fluxo anterior cada operação era uma rodada de IA + uma chamada MCP + uma travessia da ponte
painel↔ExtendScript. Aqui a IA pensa uma vez (um snapshot, um plano) e o plano inteiro roda em
**uma única chamada** dentro do Premiere. O painel grava o tempo de cada operação em `result.json`
e diz se houve operação lenta; é esse registro que mostra se algum atraso é da máquina ou não.

## Instalar (Windows)

1. Feche o Premiere.
2. Rode `installer/INSTALAR_HAGAV_AUTO.cmd`.
3. No Premiere: **Janela > Extensões > HAGAV AUTO**.

## Operações do plano (v0.1)

| Operação | O que faz |
|---|---|
| `place_item` | Coloca imagem/vídeo/áudio numa faixa, com início, fim e ponto de entrada da fonte. |
| `set_marker` / `add_marker` | Renomeia/comenta um marcador (ex.: `CONCLUÍDO - …`) ou cria um novo. |
| `set_enabled` | Ativa/desativa um clipe (troca de câmera já montada). |
| `set_props` | Escala, rotação, opacidade e posição **normalizada** (0,5 = centro). |
| `add_keyframes` | Keyframes de escala/rotação/opacidade, com tempo relativo ao clipe. |
| `set_mogrt_text` | Troca só o texto de uma legenda MOGRT e prova que o estilo não mudou. |
| `remove_clip` | Remove um clipe identificado por faixa + início + nome exato. |
| `clone_mogrt` | *Experimental.* Nova legenda a partir de um master. Só com `allowExperimental`. |

Exemplo real: [`examples/d006.plan.json`](examples/d006.plan.json).

## Regras que o painel impõe

Vêm dos erros já vividos nas edições anteriores.

- O plano inteiro é validado antes de qualquer escrita. Um erro e nada é aplicado.
- Nunca sobrescreve: destino ocupado é recusado. Nunca cria faixa (desloca as existentes).
- Faixa travada, alvo ambíguo, sequência diferente da do plano, posição em pixels: recusados.
- Vídeo com áudio só entra se houver uma faixa de áudio livre no intervalo; o áudio que nasce
  junto é removido. A voz nunca é tocada.
- Backup do `.prproj` antes da primeira escrita, na pasta do trabalho.
- Cada operação é relida depois de aplicada. Se o clipe não ficou no quadro certo, é removido e
  a execução para.
- Recibo por operação: se o Premiere travar no meio, reexecutar continua de onde parou sem repetir.
- No fim, a timeline inteira é comparada com o estado esperado; só então o projeto é salvo.

## O que está validado e o que falta

**Validado aqui (offline, `npm test`):** o mesmo código do painel roda num simulador do Premiere
(sem ES5/JSON, como o ExtendScript), sobre o projeto real do D006.

- O plano do D006 (Glass 47,40–51,60 s em 6 camadas, CTA 51,60–54,03 s, troca de câmera,
  3 marcadores) reproduz o projeto entregue sem nenhuma diferença de clipe, tempo ou marcador.
- Passa nas 24 combinações de defeitos de host conhecidos (borda que não se move, unidade de
  in/out, imagem com quadro a mais, Premiere em português).
- Reexecução não repete nada; falha no meio retoma sem duplicar; 9 tipos de plano perigoso são
  barrados sem escrita; a voz não é sobrescrita.

**Ainda não validado:** nenhuma linha rodou no Premiere real. O simulador prova a lógica, não o
comportamento do host. O primeiro passo na máquina é o botão **Diagnóstico do Premiere** (somente
leitura), com uma legenda e um clipe selecionados; o `diagnostico.json` mostra quais chamadas o
seu Premiere aceita. Depois, aplicar o plano do D006 numa **cópia** do projeto.

**Fora da v0.1:** cortes/ripple (HAGAV CUT), legendas em lote por clonagem (HAGAV TEXT continua
sendo o caminho validado), Lumetri, slip de clipe, exportação.

## Pasta do trabalho

`Documentos/HAGAV-AUTO/<sequência>_<id>/` contém `snapshot.json`, `plan.json` (você coloca),
`receipts.json`, `result.json`, `diagnostico.json` e `backups/`.

## Desenvolvimento

```
npm test                                   # bateria completa no simulador
node tools/prproj-read.js projeto.prproj "SEQUENCIA" --sanitize > snapshot.json
```

- `core/hagav-core.js` — validação do plano, estado esperado, comparação, texto de MOGRT. ES3.
- `panel/jsx/host.jsx` — executor ExtendScript.
- `sim/premiere-sim.js` — simulador com os defeitos de host.
- `tools/prproj-read.js` — lê um `.prproj` e gera o mesmo snapshot do painel (gabaritos de teste).
