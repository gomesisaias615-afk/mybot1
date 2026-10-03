const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

test("validação externa manual exige rua, bairro, cidade, UF e CEP compatíveis",async()=>{
  const {modulo:m}=ambiente();
  const item={rua:"Rua Nova",bairro:"Centro",cidade:"Aracaju",uf:"SE",cep:"49000000",latitude:-10.91,longitude:-37.07};
  const validar=itens=>m.validarExterno("r nova","CENTRO","Aracaju","SE","49000-000",{},async()=>itens);
  assert.equal(await validar([item]),item);
  for(const mudanca of [{rua:"Rua Nova Dois"},{bairro:"Outro"},{cidade:"Estância"},{uf:"BA"},{cep:"49200000"},{latitude:100}])
    assert.equal(await validar([{...item,...mudanca}]),null);
  assert.equal(await validar([item,{...item,longitude:-37.09}]),null);
  assert.equal(await validar([]),null);
});

test("busca ao mudar de campo tenta sem resultados e termina em um minuto", () => {
  const fonte=fs.readFileSync(path.join(__dirname,"public/checkout.js"),"utf8");
  const nomes=["encerrarBuscaPersistente","tentarSugestaoPersistente","manterPrimeiraSugestaoAoSair"];
  const trechos=nomes.map(nome=>fonte.match(new RegExp("function "+nome+"\\([^]*?\\n\\}"))[0]).join("\n");
  const timers=[];
  let buscas=0,cancelamentos=0;
  const campos={rua:{value:"Rua Nova"},bairro:{value:"Centro"},cidadeEntrega:{value:"Aracaju"},estadoEntrega:{value:"SE"}};
  const contexto={primeiraSugestaoAte:0,enderecoSelecionado:{},modalidadeSelecionada:"entrega",sugestoesEnderecoItens:[],
    sugestoesEnderecoTimer:null,buscaPersistenteTimer:null,Date:{now:()=>1000},
    $:id=>campos[id],clearTimeout:()=>{},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},
    buscaRapidaCheckout:{ocupada:()=>false,cancelar:()=>cancelamentos++},
    buscarSugestoesEndereco:()=>buscas++,esconderSugestoes:()=>{contexto.primeiraSugestaoAte=0;}};
  vm.createContext(contexto);vm.runInContext(trechos,contexto);
  contexto.manterPrimeiraSugestaoAoSair({target:{closest:()=>null}});
  assert.equal(buscas,1);assert.equal(contexto.primeiraSugestaoAte,61000);
  assert.ok(timers.some(t=>t.ms===5000));
  timers.find(t=>t.ms===60000).fn();
  assert.equal(cancelamentos,1);assert.equal(contexto.primeiraSugestaoAte,0);
  contexto.tentarSugestaoPersistente();assert.equal(buscas,1);
});

test("painel fecha sugestões sem recursão", () => {
  const fonte = fs.readFileSync(path.join(__dirname, "admin-public", "app.js"), "utf8");
  const trecho = fonte.match(/function fecharSugestoesLocalPizzaria\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(trecho);
  const caixa = {classList:{add: valor => assert.equal(valor, "hidden")},innerHTML:"antigo"};
  const contexto = {clearTimeout:()=>{},sugestoesLocalTimer:null,$:()=>caixa};
  vm.runInNewContext(trecho + "\nfecharSugestoesLocalPizzaria();", contexto);
  assert.equal(caixa.innerHTML, "");
});

function ambiente() {
  const arquivos=new Map(),rotas=new Map();
  let cfg={cidadeAtendida:"Cidade Antiga",estadoAtendido:"BA",enderecoPizzaria:"Loja antiga"};
  const mockFs={
    existsSync:p=>arquivos.has(p),
    statSync:p=>({mtimeMs:1,size:arquivos.get(p).length}),
    readFileSync:p=>arquivos.get(p),
    mkdirSync:()=>{},
    writeFileSync:(p,v)=>arquivos.set(p,v),
    copyFileSync:(a,b)=>arquivos.set(b,arquivos.get(a)),
    renameSync:(a,b)=>{arquivos.set(b,arquivos.get(a));arquivos.delete(a);}
  };
  const painel={obterConfiguracaoPainel:()=>({entrega:cfg}),atualizarConfiguracaoPainel:x=>{cfg={...cfg,...x.entrega};return {entrega:cfg};}};
  const contexto={module:{exports:{}},exports:{},__dirname:path.join(__dirname),process:{env:{}},URL,Date,Map,Set,Number,AbortSignal,fetch:async()=>{throw Error("Não deve consultar rede");}};
  contexto.require=nome=>nome==="fs"?mockFs:nome==="../services/dadosPersistentes.service"?{diretorioDados:"/teste"}:
    nome==="../services/painel.service"?painel:nome==="express"?{json:()=>((req,res,next)=>next())}:require(nome);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"enderecos-geral.js"),"utf8"),contexto);
  const modulo=contexto.module.exports;
  const router={get:(rota,...handlers)=>rotas.set("GET "+rota,handlers.at(-1)),post:(rota,...handlers)=>rotas.set("POST "+rota,handlers.at(-1))};
  modulo.registrarAdmin(router);modulo.registrarPublico(router,()=>cfg);
  return {modulo,arquivos,rotas,cfg:()=>cfg};
}
const ruas=()=>[
  {rua:"RUA DOUTOR JOSE",bairro:"Centro",cidade:"Aracaju",uf:"SE",latitude:-10.91,longitude:-37.07,cep:"49000-000",aliases:["Rua Antiga"]},
  {rua:"Avenida 1 de Maio",bairro:"Jardim",cidade:"Aracaju",uf:"SE",latitude:-10.92,longitude:-37.06,cep:"49000000"}
];
function resposta(){
  return {codigo:200,dados:null,status(n){this.codigo=n;return this;},set(){return this;},json(x){this.dados=x;return this;}};
}

test("validação, aliases e abreviações para outra cidade, sem fixar Estância",()=>{
  const {modulo:m}=ambiente(),base=m.validarBase({cidade:"Aracaju",uf:"SE",mapa:{zoom:17},enderecos:ruas()});
  assert.equal(base.mapa.zoom,17);
  assert.equal(m.filtrar(base.enderecos,"r dr jose")[0].rua,"Rua Doutor Jose");
  assert.equal(m.filtrar(base.enderecos,"RÚA ANTIGA")[0].bairro,"Centro");
  assert.equal(m.filtrar(base.enderecos,"av primeiro de maio")[0].bairro,"Jardim");
  assert.throws(()=>m.validarBase({cidade:"Salvador",uf:"BA",enderecos:ruas()}),/cidade/);
  assert.throws(()=>m.validarBase({cidade:"Aracaju",uf:"SE",mapa:{zoom:21},enderecos:ruas()}),/zoom/);
  const invalida=ruas();invalida[0].latitude=null;
  assert.throws(()=>m.validarBase(invalida),/coordenadas/);
});

test("importação protegida, persistência, backup e isolamento municipal",()=>{
  const a=ambiente(),importar=a.rotas.get("POST /api/painel/enderecos/base");
  const body={base:{cidade:"Aracaju",uf:"SE",mapa:{latitude:-10.91,longitude:-37.07,zoom:16},enderecos:ruas()}};
  const negada=resposta();importar({perfilPainel:"atendente",body},negada);
  assert.equal(negada.codigo,403);assert.equal(a.arquivos.size,0);
  const ok=resposta();importar({perfilPainel:"administrador",body},ok);
  assert.equal(ok.codigo,200);assert.equal(ok.dados.total,2);
  assert.equal(a.cfg().cidadeAtendida,"Aracaju");assert.equal(a.cfg().estadoAtendido,"SE");
  assert.equal(a.cfg().enderecoPizzaria,"");assert.equal(a.cfg().zoomMapaInicial,16);
  assert.equal(a.modulo.catalogo("Estância","SE").length,0);
  assert.equal(a.modulo.catalogo("Aracaju","BA").length,0);
  assert.equal(a.modulo.resolverLocal("r antiga","CENTRO","Aracaju","SE").latitude,-10.91);
  assert.equal(a.modulo.resolverLocal("r antiga","Jardim","Aracaju","SE"),null);
  const anterior=JSON.stringify([...a.arquivos.entries()]);
  const erro=resposta();importar({perfilPainel:"administrador",body:{base:[]}},erro);
  assert.equal(erro.codigo,400);assert.equal(JSON.stringify([...a.arquivos.entries()]),anterior);
  importar({perfilPainel:"administrador",body},resposta());
  assert.ok([...a.arquivos.keys()].some(k=>k.includes(".backup-")));
});

test("API responde local sem chave e não expõe dados de outra cidade",async()=>{
  const a=ambiente();
  a.rotas.get("POST /api/painel/enderecos/base")({perfilPainel:"administrador",body:{base:ruas()}},resposta());
  const handler=a.rotas.get("GET /api/enderecos/sugestoes"),r=resposta();
  await handler({query:{q:"dr jose",cidade:"Aracaju",estado:"SE"}},r);
  assert.equal(r.dados.length,1);
  const outro=resposta();await handler({query:{q:"dr jose",cidade:"Salvador",estado:"BA"}},outro);
  assert.equal(outro.dados.length,0);
});

test("navegador renderiza locais antes do serviço externo e cancela busca antiga",async()=>{
  let chamadas=0;const filas=[],renders=[];
  const contexto={window:{},Map,Date,AbortController,encodeURIComponent,
    setTimeout:(fn,ms)=>{filas.push({fn,ms});return filas.length;},clearTimeout:()=>{},
    fetch:async url=>{chamadas++;return {ok:true,json:async()=>url.includes("catalogo")?ruas():[]};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"public/enderecos-busca.js"),"utf8"),contexto);
  const motor=contexto.window.MyBotEnderecos.criar({obterArea:()=>({cidade:"Aracaju",estado:"SE"}),renderizar:itens=>renders.push(itens)});
  await motor.buscar("dr jose");
  assert.equal(chamadas,1);assert.equal(renders.at(-1)[0].rua,"RUA DOUTOR JOSE");
  assert.equal(filas[0].ms,250);
  motor.cancelar();await filas[0].fn();
  // Mesmo que um timer já despachado conclua, não deve substituir a escolha.
  assert.equal(renders.length,1);
  await motor.buscar("av primeiro de maio");
  assert.equal(renders.at(-1)[0].bairro,"Jardim");
});
