# Endereços por município — configuração geral

Aplicado no MyBot1 e nos dois códigos originais. O MyBot2 permanece como exemplo de Estância.

## Preparar e importar

1. Gere um JSON no formato de `base-enderecos.exemplo.json` (os dados desse modelo são fictícios: não use em produção). Também é aceito um array simples com rua/logradouro, bairro/localidade, cidade, uf, latitude, longitude e cep opcional. Rua e coordenadas são obrigatórias; locais sem bairro ficam sinalizados e o cliente precisa completar o endereço. Cada arquivo contém uma cidade/UF. Coordenadas podem ser aproximadas, não são localização exata de uma casa.
2. Entre no portal ADM, na área de taxa e localização, e selecione o arquivo em **Base de endereços da cidade**. Município/UF e centro/zoom são preenchidos pelos metadados quando disponíveis. Arquivo máximo: 4 MB; máximo: 50 mil registros. JSON apenas (CSV, PostgreSQL e PostGIS devem ser exportados/conver­tidos antes).
3. Confira município, UF e centro. Se não informar centro, ele é calculado pela média dos pontos — isso não é o centro oficial da cidade. O zoom padrão é 15; aceita inteiro de 1 a 19. O mapa administrativo e a confirmação do mapa do cliente respeitam esse zoom, sem forçar 18/19.
4. Clique em **Importar base e configurar município**. Se mudar a cidade, confirme novamente o endereço da loja no mapa. A importação substitui a base ativa; uma cópia anterior é preservada em arquivo backup com timestamp. Não é feita reinicialização do bot.

## Persistência e implantação

A base importada fica em `BOT_DATA_DIR/catalogo-enderecos.json`, no mesmo diretório persistente dos pedidos. Para sobreviver a deploys/recriações no Render, esse diretório precisa estar em disco persistente montado. Sem disco, o upload pode se perder. Alternativa: incluir uma base inicial em `site/data/catalogo-enderecos.json` no repositório; ela só é usada se não existir upload persistido. Após instalar uma base nova por arquivo no repositório, importe/configure cidade/UF pelo ADM também. As chaves não fazem parte da base.

## Sugestões e APIs

O navegador carrega a base filtrada por cidade/UF, atualiza sugestões durante a digitação e consulta o serviço externo após 600 ms de pausa. Abreviações, caixa e acentos são normalizados. Nomes antigos podem ir em `aliases`. O cliente pode digitar sem selecionar se rua e bairro/localidade corresponderem unicamente à base. Homônimos não são escolhidos arbitrariamente.

Configure `GEOAPIFY_API_KEY` no Render para complementar com autocomplete externo. Sem chave ou em falha, a busca local continua. A chave só fica no servidor. Resultados externos são filtrados por município/UF; seleções expiram após uma hora ou reinício. O Nominatim público não é utilizado no autocomplete automático; a busca manual/reversa já existente permanece como recurso adicional do mapa.

- GET `/api/enderecos/catalogo?cidade=...&estado=UF`
- GET `/api/enderecos/sugestoes?q=...&cidade=...&estado=UF`
- GET `/api/enderecos/local/:placeId`
- GET/POST `/api/painel/enderecos/base` (gerenciamento exclusivo do administrador autenticado). POST: `{base,cidade,uf,mapa:{latitude,longitude,zoom}}`.

GPS/reversa local utiliza o ponto cadastrado mais próximo até 4 km, mantendo a coordenada real escolhida e sinalizando endereço aproximado. Isso não comprova limites municipais nem número de residência. A área máxima de entrega da loja continua sendo aplicada. Para endereços exatos use um geocodificador apropriado e dados atualizados. Mapas/tiles dependem do provedor configurado; a lista local não é uma cópia offline do mapa.

Mantenha atribuições/licenças da fonte importada, OpenStreetMap e Geoapify. Se a fonte inclui IBGE, mantenha essa identificação na distribuição/documentação. Não importe números de casas ou dados pessoais desnecessários.

Validação: `node --test site/enderecos-geral.test.js`. Testes usam filesystem e rede simulados, sem alterar pedidos/configuração do usuário.
