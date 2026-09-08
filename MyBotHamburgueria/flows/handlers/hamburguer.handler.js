const { respostaSim, respostaNao, normalizar } = require("../../utils/texto");
const { catalogoPublico } = require("../../services/hamburgueriaCatalogo.service");
const { interpretarComGroq } = require("../../services/groqCardapio.service");
const { gerarResumo } = require("../resumo");

const dinheiro = valor => Number(valor || 0).toFixed(2).replace(".", ",");
const listar = lista => lista.map(item => `• ${item.nome} — R$ ${dinheiro(item.preco)}`).join("\n");
const numeros = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };

function quantidadeAntesDoNome(texto, nome) {
  const inicio = texto.indexOf(nome);
  const trecho = inicio >= 0 ? texto.slice(Math.max(0, inicio - 28), inicio) : "";
  const numero = trecho.match(/(\d+)\s*(?:x|unidades?|hamburgueres?|combos?|bebidas?)?\s*$/i)?.[1];
  if (numero) return Math.max(1, Number(numero));
  const palavra = Object.keys(numeros).find(chave => new RegExp(`\\b${chave}\\b`, "i").test(trecho));
  return palavra ? numeros[palavra] : 1;
}

function interpretarLocal(texto, lista) {
  const mensagem = normalizar(texto);
  return lista.filter(item => {
    const nome = normalizar(item.nome);
    return nome.length > 2 && mensagem.includes(nome);
  }).map(item => ({ ...item, quantidade: quantidadeAntesDoNome(mensagem, normalizar(item.nome)) }));
}

async function interpretar(texto, lista, tipo) {
  try {
    const resposta = await interpretarComGroq(texto, lista.map(item => ({ nome: item.nome, chave: item.id })), tipo);
    const itens = (resposta.itens || []).map(item => {
      const produto = lista.find(valor => valor.id === item.chave || normalizar(valor.nome) === normalizar(item.nome));
      return produto && { ...produto, quantidade: Math.max(1, Number(item.quantidade) || 1) };
    }).filter(Boolean);
    if (itens.length) return itens;
  } catch { /* O reconhecimento local abaixo continua disponível. */ }
  return interpretarLocal(texto, lista);
}

function adicionar(carrinho, itens) {
  for (const item of itens) {
    const existente = carrinho.find(valor => valor.id === item.id);
    if (existente) existente.quantidade += item.quantidade;
    else carrinho.push({ id: item.id, nome: item.nome, sabor: item.nome, preco: item.preco, valor: item.preco, quantidade: item.quantidade, categoria: item.categoria });
  }
}

async function tratarHamburguer({ msg, user, contexto }) {
  const estado = contexto.estados[user];
  const catalogo = catalogoPublico();
  if (estado === "pedido_hamburguer") {
    if (!catalogo.produtos.length) { await msg.reply("O cardápio ainda não possui itens disponíveis. Peça para a empresa cadastrá-los no painel."); return true; }
    const itens = await interpretar(msg.body, catalogo.produtos, "produto");
    if (!itens.length) { await msg.reply("Não consegui identificar o item. Informe quantidade e nome, por exemplo: *2 hambúrgueres e 1 bebida*."); return true; }
    contexto.carrinhoPizza[user] ||= [];
    adicionar(contexto.carrinhoPizza[user], itens);
    if (contexto.carrinhoPizza[user].some(item => item.categoria === "hamburgueres") && catalogo.adicionais.length) {
      contexto.estados[user] = "perguntar_adicionais";
      await msg.reply(`🧀 Deseja adicionar complementos ao hambúrguer?\n\n${listar(catalogo.adicionais)}\n\nResponda *sim* ou *não*.`);
    } else {
      contexto.estados[user] = "perguntar_observacao_hamburguer";
      await msg.reply("📝 Deseja adicionar uma observação? Responda *sim* ou *não*.");
    }
    return true;
  }
  if (estado === "perguntar_adicionais") {
    if (respostaSim(msg.body)) { contexto.estados[user] = "pedido_adicionais"; await msg.reply(`Digite os complementos desejados:\n\n${listar(catalogo.adicionais)}`); }
    else if (respostaNao(msg.body)) { contexto.estados[user] = "perguntar_observacao_hamburguer"; await msg.reply("📝 Deseja adicionar uma observação? Responda *sim* ou *não*."); }
    else await msg.reply("Responda *sim* ou *não*.");
    return true;
  }
  if (estado === "pedido_adicionais") {
    const itens = await interpretar(msg.body, catalogo.adicionais, "complemento");
    if (!itens.length) { await msg.reply("Não identifiquei esse complemento. Digite o nome como está na lista."); return true; }
    contexto.carrinhoBebida[user] ||= [];
    adicionar(contexto.carrinhoBebida[user], itens);
    contexto.estados[user] = "perguntar_observacao_hamburguer";
    await msg.reply("📝 Deseja adicionar uma observação? Responda *sim* ou *não*.");
    return true;
  }
  if (estado === "perguntar_observacao_hamburguer") {
    if (respostaNao(msg.body)) { contexto.observacoesPizza[user] = ""; contexto.estados[user] = "confirmar_resumo"; await msg.reply(gerarResumo(user, contexto.carrinhoPizza, contexto.carrinhoBebida)); }
    else if (respostaSim(msg.body)) { contexto.estados[user] = "digitar_observacao_hamburguer"; await msg.reply("Digite sua observação agora."); }
    else await msg.reply("Responda *sim* ou *não*.");
    return true;
  }
  if (estado === "digitar_observacao_hamburguer") {
    contexto.observacoesPizza[user] = String(msg.body || "").trim().slice(0, 500);
    contexto.estados[user] = "confirmar_resumo";
    await msg.reply(gerarResumo(user, contexto.carrinhoPizza, contexto.carrinhoBebida));
    return true;
  }
  return false;
}
module.exports = { tratarHamburguer, interpretarLocal };
