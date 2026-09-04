const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { garantirArquivo } = require("../services/dadosPersistentes.service");
const precos = require("../services/precos.service");
const { montarCardapio } = require("./cardapio.server");
const imagensProdutos = require("../services/imagemProduto.service");
const { atualizarProdutos, recarregarEstoque, definirQuantidadeProduto } = require("../services/estoque.service");
const { obterClienteWhatsApp } = require("../services/whatsappRuntime.service");
const { buscarContatoCliente } = require("../services/marketing.service");
const {
  obterConfiguracaoPainel,
  atualizarConfiguracaoPainel,
  obterDadosPainel
} = require("../services/painel.service");

const router = express.Router();
const publicDir = path.join(__dirname, "admin-public");
const sessoes = new Map();
const DURACAO_SESSAO = 24 * 60 * 60 * 1000;
const COOKIE_PAINEL = "mybot_painel_seguro";
const cacheLocalizacaoReversa = new Map();
const LIMITE_CACHE_LOCALIZACAO = 300;

function tokenAdministrador() {
  return String(process.env.PANEL_ADMIN_TOKEN || "").trim();
}

function hash(valor) {
  return crypto.createHash("sha256").update(String(valor)).digest("hex");
}

function compararSeguro(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map(item => {
    const indice = item.indexOf("=");
    if (indice < 0) return ["", ""];
    return [item.slice(0, indice).trim(), decodeURIComponent(item.slice(indice + 1))];
  }).filter(([chave]) => chave));
}

function criarSessao(res) {
  const id = crypto.randomBytes(32).toString("base64url");
  sessoes.set(hash(id), Date.now() + DURACAO_SESSAO);
  res.clearCookie("mybot_painel", { path: "/" });
  res.cookie(COOKIE_PAINEL, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: DURACAO_SESSAO,
    path: "/api/painel"
  });
}

function autenticado(req) {
  const id = cookies(req)[COOKIE_PAINEL];
  if (!id) return false;
  const chave = hash(id);
  const expira = sessoes.get(chave);
  if (!expira || expira < Date.now()) {
    sessoes.delete(chave);
    return false;
  }
  return true;
}

function exigirAutenticacao(req, res, next) {
  if (!autenticado(req)) return res.status(401).json({ erro: "Acesso expirado ou não autorizado." });
  res.set("Cache-Control", "no-store");
  next();
}

router.get("/painel/acesso/:token", (req, res) => {
  const esperado = tokenAdministrador();
  if (!esperado || !compararSeguro(req.params.token, esperado)) {
    return res.status(404).send("Acesso não encontrado.");
  }
  criarSessao(res);
  res.redirect(302, "/painel/");
});

router.use("/painel", express.static(publicDir, {
  index: "index.html",
  fallthrough: false,
  etag: false,
  lastModified: false,
  setHeaders: res => res.set("Cache-Control", "no-store, no-cache, must-revalidate")
}));

router.get("/api/painel/sessao", (req, res) => {
  res.json({ autenticado: autenticado(req), configurado: Boolean(tokenAdministrador()) });
});

router.post("/api/painel/entrar", (req, res) => {
  const esperado = tokenAdministrador();
  if (!esperado || !compararSeguro(req.body?.token || "", esperado)) {
    return res.status(401).json({ erro: "Código de acesso incorreto." });
  }
  criarSessao(res);
  res.json({ autenticado: true });
});

router.post("/api/painel/sair", exigirAutenticacao, (req, res) => {
  const id = cookies(req)[COOKIE_PAINEL];
  if (id) sessoes.delete(hash(id));
  res.clearCookie(COOKIE_PAINEL, { path: "/api/painel" });
  res.clearCookie("mybot_painel", { path: "/" });
  res.sendStatus(204);
});

router.get("/api/painel/localizacao/reversa", exigirAutenticacao, async (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return res.status(400).json({ erro: "Coordenadas inválidas." });
  }

  const chaveCache = latitude.toFixed(5) + "," + longitude.toFixed(5);
  const armazenado = cacheLocalizacaoReversa.get(chaveCache);
  if (armazenado?.enderecoEncontrado) return res.json(armazenado);

  const contato = String(process.env.GEOCODING_CONTACT_EMAIL || "gomesisaias615@gmail.com").trim();
  const agente = "MyBot-Pizzarias/1.0 (https://github.com/gomesisaias615-afk/mybotserver; contato: " + contato + ")";

  const montarTexto = (...valores) => [...new Set(
    valores.flat().map(valor => String(valor || "").trim()).filter(Boolean)
  )].join(", ");

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("zoom", "18");
    url.searchParams.set("accept-language", "pt-BR");
    if (contato.includes("@")) url.searchParams.set("email", contato);

    const resposta = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "pt-BR,pt;q=0.9",
        "User-Agent": agente,
        Referer: process.env.PUBLIC_BASE_URL || "https://mybotserver-m5or.onrender.com/"
      },
      signal: AbortSignal.timeout(12000)
    });
    if (!resposta.ok) throw new Error(`OpenStreetMap respondeu HTTP ${resposta.status}`);

    const dados = await resposta.json();
    const endereco = dados.address || {};
    const logradouro = endereco.road || endereco.pedestrian || endereco.residential ||
      endereco.footway || endereco.path || endereco.cycleway || "";
    const rua = montarTexto(logradouro, endereco.house_number);
    const bairro = endereco.suburb || endereco.neighbourhood || endereco.quarter ||
      endereco.city_district || endereco.hamlet || "";
    const cidade = endereco.city || endereco.town || endereco.municipality ||
      endereco.village || endereco.county || "";
    const estado = endereco.state || "";
    const texto = montarTexto(rua, bairro, cidade, estado, endereco.postcode, endereco.country || "Brasil");

    if (!texto || (!rua && !bairro)) {
      throw new Error("O OpenStreetMap não encontrou rua ou bairro neste ponto.");
    }

    const resultado = {
      texto,
      rua,
      bairro,
      cidade,
      estado,
      cep: endereco.postcode || "",
      latitude,
      longitude,
      enderecoEncontrado: true,
      fonte: "OpenStreetMap",
      atribuicao: "© OpenStreetMap contributors"
    };

    if (cacheLocalizacaoReversa.size >= LIMITE_CACHE_LOCALIZACAO) {
      cacheLocalizacaoReversa.delete(cacheLocalizacaoReversa.keys().next().value);
    }
    cacheLocalizacaoReversa.set(chaveCache, resultado);
    res.set("Cache-Control", "private, max-age=300");
    return res.json(resultado);
  } catch (erroNominatim) {
    console.warn("Consulta reversa principal falhou:", erroNominatim.message);
  }

  try {
    const url = new URL("https://photon.komoot.io/reverse");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));

    const resposta = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": agente },
      signal: AbortSignal.timeout(12000)
    });
    if (!resposta.ok) throw new Error(`Photon respondeu HTTP ${resposta.status}`);

    const dados = await resposta.json();
    const endereco = dados.features?.[0]?.properties || {};
    const rua = montarTexto(endereco.street || endereco.name, endereco.housenumber);
    const bairro = montarTexto(endereco.locality, endereco.district, endereco.suburb);
    const cidade = endereco.city || endereco.county || "";
    const estado = endereco.state || "";
    const texto = montarTexto(rua, bairro, cidade, estado, endereco.postcode, endereco.country || "Brasil");

    if (!texto || (!rua && !bairro)) {
      throw new Error("A consulta reserva não encontrou rua ou bairro.");
    }

    const resultado = {
      texto,
      rua,
      bairro,
      cidade,
      estado,
      cep: endereco.postcode || "",
      latitude,
      longitude,
      enderecoEncontrado: true,
      fonte: "Photon/Komoot",
      atribuicao: "© OpenStreetMap contributors"
    };

    if (cacheLocalizacaoReversa.size >= LIMITE_CACHE_LOCALIZACAO) {
      cacheLocalizacaoReversa.delete(cacheLocalizacaoReversa.keys().next().value);
    }
    cacheLocalizacaoReversa.set(chaveCache, resultado);
    res.set("Cache-Control", "private, max-age=300");
    return res.json(resultado);
  } catch (erroReserva) {
    console.warn("Consulta reversa reserva falhou:", erroReserva.message);
    return res.status(503).json({
      erro: "Não foi possível identificar rua e bairro neste ponto. Toque exatamente sobre uma rua ou pesquise o endereço pelo nome.",
      enderecoEncontrado: false
    });
  }
});

router.get("/cardapio/imagem/:tipo/:chave", (req, res) => {
  try {
    const imagem = imagensProdutos.caminhoImagem(req.params.tipo, req.params.chave);
    if (!imagem) return res.sendStatus(404);
    res.type(imagem.mime).set("Cache-Control", "public, max-age=86400").sendFile(imagem.arquivo);
  } catch {
    res.sendStatus(404);
  }
});

router.get("/api/painel/imagens", exigirAutenticacao, (req, res) => {
  const catalogo = precos.catalogo();
  const pizzas = Object.keys(catalogo.pizzas || {}).map(chave => ({ tipo: "pizzas", chave, nome: chave, imagem: imagensProdutos.urlImagem("pizzas", chave) }));
  const bebidas = Object.entries(catalogo.nomesBebidas || {}).map(([chave, dados]) => ({ tipo: "bebidas", chave, nome: dados.nome || chave, imagem: imagensProdutos.urlImagem("bebidas", chave) }));
  res.json([...pizzas, ...bebidas]);
});
router.put("/api/painel/imagens/:tipo/:chave", exigirAutenticacao, (req, res) => {
  try {
    const item = imagensProdutos.salvarImagem(req.params.tipo, req.params.chave, req.body?.imagem);
    res.json({ sucesso: true, imagem: imagensProdutos.urlImagem(req.params.tipo, req.params.chave), atualizadoEm: item.atualizadoEm });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});
router.delete("/api/painel/imagens/:tipo/:chave", exigirAutenticacao, (req, res) => {
  try {
    imagensProdutos.removerImagem(req.params.tipo, req.params.chave);
    res.sendStatus(204);
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

router.get("/api/painel/dados", exigirAutenticacao, (req, res) => {
  res.json(obterDadosPainel());
});

router.post("/api/painel/catalogo/item", exigirAutenticacao, (req,res)=>{try{
  const tipo=String(req.body?.tipo||""),nome=String(req.body?.nome||"").trim(),categoria=String(req.body?.categoria||""),ingredientes=String(req.body?.ingredientes||"").trim();
  if(!nome||nome.length>80)throw Error("Informe o nome do item.");
  const ler=p=>JSON.parse(fs.readFileSync(p,"utf8")),salvar=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2));
  if(tipo==="pizza"){
    if(!["tradicionais","especiais","doces"].includes(categoria))throw Error("Escolha a categoria da pizza.");
    if(!ingredientes||ingredientes.length>500)throw Error("Informe os ingredientes da pizza (até 500 caracteres).");
    const valores=req.body?.precos||{},tamanhos={};
    for(const tamanho of ["P","M","G","F"]){const valor=Number(valores[tamanho]);if(!Number.isFinite(valor)||valor<=0)throw Error(`Informe um preço válido para o tamanho ${tamanho}.`);tamanhos[tamanho]=valor}
    const p=garantirArquivo("precospizzas.json","data/precospizzas.json",{}),c=garantirArquivo("configuracaoCardapio.json","data/configuracaoCardapio.json",{}),e=garantirArquivo("estoque.json","services/monitoramento/estoque.json",{pizzas:{},bebidas:{}}),pre=ler(p),conf=ler(c),est=ler(e);
    if(pre[nome])throw Error("Já existe uma pizza com esse nome.");pre[nome]=tamanhos;conf.pizzasPorCategoria[categoria]||=[];conf.pizzasPorCategoria[categoria].push(nome);salvar(p,pre);salvar(c,conf);salvar(e,est);precos.atualizarIngredientesPizza(nome,ingredientes)
  }else if(tipo==="bebida"){
    const preco=Number(req.body?.preco);if(!Number.isFinite(preco)||preco<=0)throw Error("Informe um preço válido.");
    const k=nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_"),p=garantirArquivo("precosbebidas.json","data/precosbebidas.json",{}),n=garantirArquivo("nomesbebidas.json","data/nomesbebidas.json",{}),e=garantirArquivo("estoque.json","services/monitoramento/estoque.json",{pizzas:{},bebidas:{}}),pre=ler(p),nom=ler(n),est=ler(e);
    if(pre[k])throw Error("Já existe uma bebida com esse nome.");pre[k]=preco;nom[k]={nome,aliases:[k.replaceAll("_"," ")]};salvar(p,pre);salvar(n,nom);salvar(e,est)
  }else throw Error("Tipo inválido.");res.json({ok:true})
}catch(e){res.status(400).json({erro:e.message})}});
router.get("/api/painel/precos", exigirAutenticacao, (req,res)=>res.json(precos.catalogo()));
router.get("/api/painel/ingredientes", exigirAutenticacao, (req,res)=>res.json(montarCardapio().pizzas.map(({nome,ingredientes})=>({nome,ingredientes}))));
router.patch("/api/painel/ingredientes/pizza", exigirAutenticacao, (req,res)=>{try{res.json({nome:String(req.body?.nome||""),ingredientes:precos.atualizarIngredientesPizza(String(req.body?.nome||""),req.body?.ingredientes)})}catch(e){res.status(400).json({erro:e.message})}});
router.patch("/api/painel/precos/pizza", exigirAutenticacao, (req,res)=>{try{res.json({preco:precos.atualizarPrecoPizza(String(req.body?.nome||""),String(req.body?.tamanho||""),req.body?.preco)})}catch(e){res.status(400).json({erro:e.message})}});
router.patch("/api/painel/precos/bebida", exigirAutenticacao, (req,res)=>{try{res.json({preco:precos.atualizarPrecoBebida(String(req.body?.chave||""),req.body?.preco)})}catch(e){res.status(400).json({erro:e.message})}});
router.put("/api/painel/promocoes", exigirAutenticacao, (req,res)=>{try{const dados=req.body||{};if(String(dados.tipo)==="pizza"){const estoque=recarregarEstoque();const chave=String(dados.chave||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();if(Number(estoque.pizzas?.[chave]||0)<=0)throw Error("Não é possível aplicar promoção em uma pizza indisponível.");}res.json(precos.salvarPromocao(dados))}catch(e){res.status(400).json({erro:e.message})}});
router.delete("/api/painel/promocoes", exigirAutenticacao, (req,res)=>{try{res.json(precos.removerPromocao(String(req.body?.tipo||""),String(req.body?.chave||""),String(req.body?.tamanho||"")))}catch(e){res.status(400).json({erro:e.message})}});
router.patch("/api/painel/configuracao", exigirAutenticacao, (req, res) => {
  res.json(atualizarConfiguracaoPainel(req.body || {}));
});

router.patch("/api/painel/estoque", exigirAutenticacao, (req, res) => {
  const tipo = String(req.body?.tipo || "");
  const chave = String(req.body?.chave || "");
  const quantidade = Number(req.body?.quantidade);
  const estoque = recarregarEstoque();
  if (!["pizzas", "bebidas"].includes(tipo) || !Object.prototype.hasOwnProperty.call(estoque[tipo], chave)) {
    return res.status(404).json({ erro: "Produto não encontrado." });
  }
  if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > 10000) {
    return res.status(400).json({ erro: "Informe uma quantidade entre 0 e 10.000." });
  }
  const atual = Number(estoque[tipo][chave]) || 0;
  if (quantidade === atual) {
    return res.json({ tipo, chave, anterior: atual, atual });
  }

  // Sempre grava no mesmo arquivo persistente usado pelo bot e pelo cardápio.
  const atualizada = definirQuantidadeProduto(tipo, chave, quantidade);
  res.json({ tipo, chave, anterior: atual, atual: atualizada });
});

function mensagemStatusCliente(pedido, status) {
  const id = pedido.id;
  const modalidade = pedido.recebimento?.modalidade || "entrega";
  const mensagens = {
    confirmado: {
      entrega: `✅ *Pedido #${id} confirmado!*\n\nRecebemos seu pedido para entrega e a cozinha já foi avisada. Você receberá uma nova mensagem assim que o preparo começar.`,
      retirada: `✅ *Pedido #${id} confirmado!*\n\nSeu pedido para retirada foi recebido. Avisaremos por aqui quando estiver pronto para você buscar.`,
      salao: `✅ *Pedido #${id} confirmado!*\n\nSeu pedido no salão foi enviado à cozinha. Em breve iniciaremos o preparo.`
    },
    em_preparo: {
      entrega: `🍕 *Pedido #${id} em preparo!*\n\nEstamos preparando seu pedido. Avisaremos assim que estiver pronto para sair para entrega.`,
      retirada: `🍕 *Pedido #${id} em preparo!*\n\nJá estamos preparando seu pedido. Aguarde nosso aviso antes de ir buscá-lo.`,
      salao: `🍕 *Pedido #${id} em preparo!*\n\nA cozinha já começou a preparar seu pedido. Logo ele estará pronto para ser servido.`
    },
    pronto: {
      entrega: `✅ *Pedido #${id} pronto!*\n\nSeu pedido foi finalizado e está aguardando o entregador. Avisaremos quando ele sair para entrega.`,
      retirada: `🥡 *Pedido #${id} pronto para retirada!*\n\nVocê já pode vir buscá-lo. Ao chegar, informe o código *#${id}*.`,
      salao: `🍽️ *Pedido #${id} pronto!*\n\nSeu pedido foi finalizado e está pronto.`
    }
  };
  if (mensagens[status]) return mensagens[status][modalidade] || mensagens[status].entrega;
  return {
    saiu_entrega: `🛵 *Pedido #${id} saiu para entrega!*\n\nSeu pedido está a caminho e chegará em breve.`,
    cancelado: `❌ *Pedido #${id} cancelado.*\n\nA pizzaria não conseguiu prosseguir com o pedido. Se houve pagamento online, entre em contato para receber as orientações.`
  }[status] || null;
}

async function notificarStatusCliente(pedido, status) {
  const texto = mensagemStatusCliente(pedido, status);
  if (!texto) return { enviada: false, motivo: "sem_mensagem" };
  const normalizarContato = valor => {
    const original = String(valor || "").trim();
    if (!original || original.includes("@")) return original;
    const digitos = original.replace(/\D/g, "");
    return digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  };
  const contatoSalvo = buscarContatoCliente(pedido.cliente);
  // O telefone confirmado no checkout é mais confiável que um identificador
  // interno @lid. O chat original permanece como último recurso.
  const candidatos = [
    pedido.recebimento?.contato,
    pedido.contato,
    contatoSalvo,
    pedido.cliente
  ];
  const destinos = candidatos.map(normalizarContato)
    .filter((valor, indice, lista) => valor && lista.indexOf(valor) === indice);
  if (!destinos.length) return { enviada: false, motivo: "cliente_sem_contato" };
  let ultimoErro = null;
  for (const destino of destinos) {
    try {
      await obterClienteWhatsApp().sendMessage(destino, texto);
      console.log(`[PAINEL] Cliente avisado sobre pedido ${pedido.id}: ${status} (${destino})`);
      return { enviada: true, destino };
    } catch (erro) {
      ultimoErro = erro;
      console.error(`[PAINEL] Falha ao avisar ${destino} sobre pedido ${pedido.id}:`, erro.message);
    }
  }
  return { enviada: false, motivo: ultimoErro?.message || "falha_no_envio" };
}
router.patch("/api/painel/pedidos/:id/status", exigirAutenticacao, async (req, res) => {
  const permitidos = new Set(["aguardando_pagamento", "pago", "confirmado", "em_preparo", "pronto", "compartilhado", "saiu_entrega", "concluido", "cancelado"]);
  const status = String(req.body?.status || "");
  if (!permitidos.has(status)) return res.status(400).json({ erro: "Status inválido." });

  const arquivo = garantirArquivo("pedidos.json", "services/monitoramento/relatorio/pedidos.json", []);
  const pedidos = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  const pedido = pedidos.find(item => String(item.id) === req.params.id);
  if (!pedido) return res.status(404).json({ erro: "Pedido não encontrado." });
  const statusAnterior = pedido.status;
  pedido.status = status;
  pedido.atualizadoEm = new Date().toISOString();
  if (status === "pago" && !pedido.pagoEm) pedido.pagoEm = pedido.atualizadoEm;
  const pedidoCompleto = obterDadosPainel().pedidos.find(item => String(item.id) === String(pedido.id));
  const notificacao = statusAnterior === status
    ? { enviada: false, motivo: "status_inalterado" }
    : await notificarStatusCliente({ ...(pedidoCompleto || pedido), status }, status);
  if (status === "saiu_entrega" && !notificacao.enviada) {
    pedido.status = statusAnterior;
    return res.status(502).json({
      erro: `Não foi possível avisar o cliente: ${notificacao.motivo}. O pedido continua em Pronto para você tentar novamente.`
    });
  }
  fs.writeFileSync(arquivo, JSON.stringify(pedidos, null, 2), "utf8");
  res.json({ ...pedido, notificacao });
});

router.get("/api/painel/configuracao-publica", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(obterConfiguracaoPainel());
});

module.exports = router;

