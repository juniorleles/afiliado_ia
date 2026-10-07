# UX Improvements

Validation label: AI Affiliate Platform v3.1
Phase: UX Research, execution 05

Correções para a implementação. Esta execução não altera telas.

## Fechar antes de construir o fluxo

1. Incluir Análise como tela própria, entre Product e a campanha. A ação primária é Criar campanha. Se faltar fato observado, o botão fica indisponível e a frase diz qual campo falta.
2. Landing page passa a abrir Análise, não a campanha e não a oportunidade como destino principal. Oportunidade continua acessível, e a recomendação entra na Análise como apoio.
3. No Product, Ver Landing page pode permanecer como caminho de leitura. Não pode ser o único botão que avança, nem Criar campanha pode saltar Análise.

## Alinhar linguagem e status

4. Usar só os seis badges de negócio. Pausada entra no card do Ad como estado do rascunho, não como badge de gate. Monitorar fica na recomendação. Faltando vira Atenção na prontidão, com a frase do que falta.
5. Se a Keyword digitada não for o caso simulado, o resultado diz isso. Não mostra Dynamic Joint como se a busca nova tivesse ocorrido.
6. Cada métrica de Relatórios leva o rótulo simulado até existir leitura real. O número não fica sozinho.

## Acessibilidade e densidade

7. O console do operador precisa de `lang="pt-BR"` no documento, sem mudar o idioma das páginas públicas em inglês.
8. Manter o aviso de protótipo, menor que o H1, e não repeti-lo como primeiro bloco de todas as telas quando a pessoa já está no fluxo.
9. Relatórios permanece uma tela. O título pode ser Monitoramento. Não criar uma segunda rota só porque a jornada cita as duas palavras.

## O que não mudar

A sidebar com as sete áreas, o breadcrumb, Ver detalhes técnicos fechado, o inglês de Keyword, Product, Landing page, Headline, Description e Ad, e a separação entre publicar a presell e enviar o Ad.
