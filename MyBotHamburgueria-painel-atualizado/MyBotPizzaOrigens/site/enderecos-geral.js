const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { diretorioDados } = require("../services/dadosPersistentes.service");
const destino = path.join(diretorioDados, "catalogo-enderecos.json");
const distribuido = path.join(__dirname, "data", "catalogo-enderecos.json");
const UFS = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
const cache = new Map(), pendentes = new Map(), selecoes = new Map();
let memoria = null, assinatura = "";
const normalizar = texto => String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
function chave(texto) {
  const abreviacoes = {r:"rua",av:"avenida",ave:"avenida",tv:"travessa",trav:"travessa",dr:"doutor",dra:"doutora",rod:"rodovia",est:"estrada",estr:"estrada",pc:"praca",pca:"praca",jd:"jardim",prof:"professor",profa:"professora",cel:"coronel",gov:"governador",pres:"presidente",dep:"deputado"};
  return normalizar(String(texto || "").replace(/\b(primeiro|1[º°o]?)\s+de\s+maio\b/gi, "1 de maio"))
    .split(" ").map(p => abreviacoes[p] || p).filter(p => p && !["de","da","do","das","dos"].includes(p)).join(" ");
}
function formatar(texto) {
  return String(texto || "").trim().split(/\s+/).map((p,i) => {
    const v=p.toLocaleLowerCase("pt-BR");
    if(i && ["de","da","do","das","dos","e"].includes(v)) return v;
    if(/^(br|se|uf|cep|ibge)$/i.test(p) || /^[IVXLCDM]+$/i.test(p)) return p.toUpperCase();
    return v.charAt(0).toLocaleUpperCase("pt-BR")+v.slice(1);
  }).join(" ");
}
function coordenada(valor, limite) {
  if(valor === "" || valor === null || valor === undefined) throw new Error("Informe coordenadas válidas em todas as ruas.");
  const n=Number(valor);
  if(!Number.isFinite(n) || Math.abs(n)>limite) throw new Error("Coordenada inválida na base.");
  return n;
}
function validarBase(dados, config = {}) {
  const linhas = Array.isArray(dados) ? dados : dados?.enderecos;
  if(!Array.isArray(linhas) || !linhas.length || linhas.length>50000) throw new Error("Envie uma lista JSON com 1 a 50.000 endereços.");
  const cidade=String(config.cidade || dados.cidade || linhas[0].cidade || linhas[0].municipio || "").trim();
  const uf=String(config.uf || dados.uf || linhas[0].uf || linhas[0].estado || "").trim().toUpperCase();
  if(!cidade || cidade.length>120 || !UFS.has(uf)) throw new Error("Informe município e UF válidos.");
  const vistos=new Set();
  const enderecos=linhas.map((item,indice)=>{
    if(!item || typeof item!=="object") throw new Error("Registro inválido: "+(indice+1));
    const rua=String(item.rua || item.logradouro || "").trim(), bairro=String(item.bairro || item.localidade || "").trim();
    if(!rua || rua.length>200 || bairro.length>200) throw new Error("Rua obrigatória ou nome/localidade excedendo 200 caracteres: registro "+(indice+1));
    if((item.cidade && normalizar(item.cidade)!==normalizar(cidade)) || (item.uf && String(item.uf).toUpperCase()!==uf) ||
       (!item.uf && item.estado && /^[A-Za-z]{2}$/.test(item.estado) && item.estado.toUpperCase()!==uf))
      throw new Error("A base deve pertencer à cidade/UF informadas: registro "+(indice+1));
    const latitude=coordenada(item.latitude ?? item.lat,90), longitude=coordenada(item.longitude ?? item.lon,180);
    const cep=String(item.cep || "").replace(/\D/g,"");
    if(cep && cep.length!==8) throw new Error("CEP inválido: registro "+(indice+1));
    const identidade=normalizar(rua)+"|"+normalizar(bairro);
    if(vistos.has(identidade)) return null;
    vistos.add(identidade);
    return {placeId:"local:"+crypto.createHash("sha256").update(cidade+"|"+uf+"|"+identidade).digest("hex").slice(0,24),
      rua:formatar(rua),logradouro:formatar(rua),bairro:formatar(bairro),cidade,estado:uf,uf,cep,latitude,longitude,
      aliases:Array.isArray(item.aliases)?item.aliases.filter(v=>typeof v==="string").map(v=>v.slice(0,200)).slice(0,20):[],
      fonte:String(item.fonte || "").slice(0,250),coordenadaAproximada:item.coordenadaAproximada!==false,
      localidadeNaoInformada:!bairro,
      texto:[formatar(bairro),cidade+" - "+uf,cep?"CEP "+cep:""].filter(Boolean).join(" — ")};
  }).filter(Boolean);
  const mapa={...(dados.mapa || {}),...(config.mapa || {})};
  const latitude=mapa.latitude == null || mapa.latitude === "" ? enderecos.reduce((s,x)=>s+x.latitude,0)/enderecos.length : coordenada(mapa.latitude,90);
  const longitude=mapa.longitude == null || mapa.longitude === "" ? enderecos.reduce((s,x)=>s+x.longitude,0)/enderecos.length : coordenada(mapa.longitude,180);
  const zoom=Number(mapa.zoom ?? 15);
  if(!Number.isInteger(zoom) || zoom<1 || zoom>19) throw new Error("O zoom deve ser um inteiro entre 1 e 19.");
  return {versao:1,cidade,uf,mapa:{latitude,longitude,zoom},enderecos};
}
function lerBase() {
  const arquivo=fs.existsSync(destino)?destino:distribuido;
  if(!fs.existsSync(arquivo)) return null;
  const stat=fs.statSync(arquivo), atual=arquivo+"|"+stat.mtimeMs+"|"+stat.size;
  if(memoria && assinatura===atual) return memoria;
  try {memoria=validarBase(JSON.parse(fs.readFileSync(arquivo,"utf8")));assinatura=atual;return memoria;}
  catch {memoria=null;return null;}
}
function catalogo(cidade,uf) {
  const base=lerBase();
  return base && normalizar(base.cidade)===normalizar(cidade) && base.uf===String(uf).toUpperCase()?base.enderecos:[];
}
function filtrar(lista,busca,limite=8) {
  const termos=chave(busca).split(" ").filter(Boolean);
  if(!termos.length) return [];
  return lista.filter(item=>[item.rua,...(item.aliases || [])].some(nome=>{
    const alvo=chave(nome+" "+item.bairro);return termos.every(p=>alvo.includes(p));
  })).slice(0,limite);
}
function resolverLocal(rua,bairro,cidade,uf) {
  const itens=catalogo(cidade,uf).filter(item=>[item.rua,...item.aliases].some(nome=>chave(nome)===chave(rua)) && (!bairro || chave(item.bairro)===chave(bairro)));
  return itens.length===1?itens[0]:null;
}
function distancia(a,b) {
  const r=x=>x*Math.PI/180;
  const x=Math.sin(r(b.latitude-a.latitude)/2)**2+Math.cos(r(a.latitude))*Math.cos(r(b.latitude))*Math.sin(r(b.longitude-a.longitude)/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,x)));
}
function maisProximo(latitude,longitude,cidade,uf) {
  const ponto={latitude,longitude};
  let melhor=null,menor=Infinity;
  for(const item of catalogo(cidade,uf)){const d=distancia(ponto,item);if(d<menor){menor=d;melhor=item;}}
  return menor<=4?{...melhor,latitude,longitude,distanciaReferenciaKm:menor,localizacaoAproximada:true}:null;
}
function guardar(mapa,k,v){if(mapa.size>=500)mapa.delete(mapa.keys().next().value);mapa.set(k,v);}
async function buscarExterno(busca,cidade,uf,config={}) {
  const apiKey=process.env.GEOAPIFY_API_KEY;
  if(!apiKey || busca.length<3 || busca.length>160 || !cidade || !UFS.has(uf)) return [];
  const id=normalizar(busca)+"|"+normalizar(cidade)+"|"+uf;
  const salvo=cache.get(id);if(salvo && salvo.ate>Date.now())return salvo.itens;
  if(pendentes.has(id))return pendentes.get(id);
  const tarefa=(async()=>{
    try {
      const url=new URL("https://api.geoapify.com/v1/geocode/autocomplete");
      for(const [k,v] of Object.entries({text:busca+", "+cidade+", "+uf+", Brasil",filter:"countrycode:br",lang:"pt",format:"json",type:"street",limit:"8",apiKey}))url.searchParams.set(k,v);
      const lat=config.latitudeMapaInicial,lon=config.longitudeMapaInicial;
      if(Number.isFinite(lat)&&Number.isFinite(lon))url.searchParams.set("bias","proximity:"+lon+","+lat);
      const resposta=await fetch(url,{signal:AbortSignal.timeout(2500)});
      if(!resposta.ok)throw new Error("Serviço indisponível");
      const dados=await resposta.json();
      const itens=(dados.results || []).filter(item=>{
        const cidadeItem=item.city || item.town || item.municipality || item.county || "";
        const estado=String(item.state_code || "").toUpperCase().replace(/^BR-/,"");
        return item.country_code==="br" && normalizar(cidadeItem)===normalizar(cidade) && estado===uf &&
          item.street && typeof item.lat==="number" && typeof item.lon==="number" && Number.isFinite(item.lat)&&Number.isFinite(item.lon);
      }).map(item=>{
        const rua=formatar(item.street),bairro=formatar(item.suburb || item.district || item.quarter || item.neighbourhood || "");
        const obj={placeId:"geoapify:"+String(item.place_id || item.lat+","+item.lon),rua,logradouro:rua,bairro,cidade,estado:uf,uf,
          cep:String(item.postcode || "").replace(/\D/g,""),latitude:item.lat,longitude:item.lon,fonte:"Geoapify",
          texto:[bairro,cidade+" - "+uf].filter(Boolean).join(" — ")};
        guardar(selecoes,obj.placeId,{item:obj,ate:Date.now()+3600000});return obj;
      });
      guardar(cache,id,{itens,ate:Date.now()+600000});return itens;
    }catch {guardar(cache,id,{itens:[],ate:Date.now()+30000});return [];}
  })();
  pendentes.set(id,tarefa);try{return await tarefa;}finally{pendentes.delete(id);}
}
function resolverExterno(placeId,rua,bairro,cidade,uf) {
  const dado=selecoes.get(placeId);
  if(!dado || dado.ate<Date.now())return null;
  const item=dado.item;
  return normalizar(item.cidade)===normalizar(cidade) && item.uf===uf && chave(item.rua)===chave(rua) &&
    (!item.bairro || chave(item.bairro)===chave(bairro))?item:null;
}
async function validarExterno(rua,bairro,cidade,uf,cep,config={},buscar=buscarExterno) {
  const itens=await buscar(rua,cidade,uf,config);
  const candidatos=itens.filter(item=>chave(item.rua)===chave(rua) && chave(item.bairro)===chave(bairro) &&
    normalizar(item.cidade)===normalizar(cidade) && item.uf===uf &&
    Math.abs(item.latitude)<=90 && Math.abs(item.longitude)<=180 &&
    (!/^\d{8}$/.test(item.cep || "") || item.cep===String(cep || "").replace(/\D/g,"")));
  const unicos=[...new Map(candidatos.map(item=>[item.latitude+","+item.longitude,item])).values()];
  return unicos.length===1?unicos[0]:null;
}
function mesclar(locais,externos) {
  const itens=[...locais];
  for(const item of externos)if(!itens.some(x=>chave(x.rua)===chave(item.rua)&&(!x.bairro||!item.bairro||chave(x.bairro)===chave(item.bairro))))itens.push(item);
  return itens.slice(0,16);
}
function registrarPublico(app,configuracao) {
  app.get("/api/enderecos/local/:placeId",(req,res)=>{
    const cfg=configuracao();
    const item=catalogo(cfg.cidadeAtendida,cfg.estadoAtendido).find(x=>x.placeId===req.params.placeId);
    if(!item)return res.status(404).json({erro:"Endereço não encontrado na base configurada."});
    res.json(item);
  });
  app.get("/api/enderecos/catalogo",(req,res)=>{
    const cfg=configuracao(), cidade=String(req.query.cidade || cfg.cidadeAtendida || ""),uf=String(req.query.estado || cfg.estadoAtendido || "").toUpperCase();
    res.set("Cache-Control","no-store").json(catalogo(cidade,uf));
  });
  app.get("/api/enderecos/sugestoes",async(req,res)=>{
    const cfg=configuracao(),busca=String(req.query.q || "").trim();
    const cidade=String(req.query.cidade || cfg.cidadeAtendida || "").trim(),uf=String(req.query.estado || cfg.estadoAtendido || "").toUpperCase();
    if(busca.length<2 || busca.length>160)return res.json([]);
    const locais=filtrar(catalogo(cidade,uf),busca);
    res.set("Cache-Control","no-store").json(mesclar(locais,await buscarExterno(busca,cidade,uf,cfg)));
  });
}
function registrarAdmin(router) {
  router.get("/api/painel/localizacao/reversa",(req,res,next)=>{
    const latitude=Number(req.query.lat),longitude=Number(req.query.lon);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return next();
    const cfg=require("../services/painel.service").obterConfiguracaoPainel().entrega;
    const item=maisProximo(latitude,longitude,cfg.cidadeAtendida,cfg.estadoAtendido);
    if(!item)return next();
    res.json({...item,texto:[item.rua,item.bairro,item.cidade,item.estado].filter(Boolean).join(", "),
      enderecoEncontrado:true,localizacaoAproximada:true});
  });
  router.get("/api/painel/enderecos/base",(req,res)=>{
    if(req.perfilPainel!=="administrador")return res.status(403).json({erro:"Somente o administrador pode gerenciar a base."});
    const base=lerBase();res.json(base?{cidade:base.cidade,uf:base.uf,mapa:base.mapa,total:base.enderecos.length}:{total:0});
  });
  router.post("/api/painel/enderecos/base",require("express").json({limit:"5mb"}),(req,res)=>{
    if(req.perfilPainel!=="administrador")return res.status(403).json({erro:"Somente o administrador pode importar a base."});
    try {
      const base=validarBase(req.body?.base,{cidade:req.body?.cidade,uf:req.body?.uf,mapa:req.body?.mapa});
      const {obterConfiguracaoPainel,atualizarConfiguracaoPainel}=require("../services/painel.service");
      const atual=obterConfiguracaoPainel().entrega;
      const mudou=normalizar(atual.cidadeAtendida)!==normalizar(base.cidade)||atual.estadoAtendido!==base.uf;
      fs.mkdirSync(diretorioDados,{recursive:true});
      if(fs.existsSync(destino))fs.copyFileSync(destino,destino+".backup-"+Date.now()+".json");
      const temporario=destino+".tmp-"+crypto.randomBytes(8).toString("hex");
      fs.writeFileSync(temporario,JSON.stringify(base),"utf8");fs.renameSync(temporario,destino);memoria=null;
      atualizarConfiguracaoPainel({entrega:{cidadeAtendida:base.cidade,estadoAtendido:base.uf,
        latitudeMapaInicial:base.mapa.latitude,longitudeMapaInicial:base.mapa.longitude,zoomMapaInicial:base.mapa.zoom,
        ...(mudou?{enderecoPizzaria:"",latitudePizzaria:base.mapa.latitude,longitudePizzaria:base.mapa.longitude}:{})}});
      cache.clear();selecoes.clear();res.json({total:base.enderecos.length,cidade:base.cidade,uf:base.uf,mapa:base.mapa,reconfirmarEndereco:mudou});
    }catch(e){res.status(400).json({erro:e.message || "Não foi possível importar a base."});}
  });
}
module.exports={validarBase,lerBase,catalogo,filtrar,chave,resolverLocal,resolverExterno,validarExterno,maisProximo,mesclar,registrarPublico,registrarAdmin};
