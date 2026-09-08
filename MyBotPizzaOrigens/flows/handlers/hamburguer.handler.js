const { respostaSim, respostaNao, normalizar } = require("../../utils/texto");
const { catalogoPublico } = require("../../services/hamburgueriaCatalogo.service");
const { interpretarComGroq } = require("../../services/groqCardapio.service");
const { gerarResumo } = require("../resumo");

function dinheiro(valor) { return Number(valor || 0).toFixed(2).replace(".", ","); }
function nomes(lista) { return lista.map(item => `• ${item.nome} — R$ ${dinheiro(item.preco)}`).join("\n"); }
function localizar(texto, lista) {
  const pedido = normalizar(texto);
  return lista.find(item => pedido.includes(normalizar(item.nome)) || normalizar(item.nome).includes(pedido));
}
async function interpretar(texto, lista, tipo) {
  const opcoes = lista.map(item => ({ nome: item.nome, chave: item.id }));
  try {
    const retorno = await interpretarComGroq(texto, opcoes, tipo);
    return (retorno.itens || []).map(item => {
      const encontrado = lista.find(produto => produto.id === item.chave || normalizar(produto.nome) === normalizar(item.nome));
      return encontrado && { ...encontrado, quantidade: Math.max(1, Number(item.quantidade) || 1) };
    }).filter(Boolean);
  } catch { return []; }
}
function adicionarAoCarrinho(carrinho, itens) {
  for (const item of itens) {
    const existente = carrinho.find(atual => atual.id === item.id);
    if (existente) existente.quantidade += item.quantidade;
    else carrinho.push({ id: item.id, nome: item.nome, preco: item.preco, valor: item.preco, quantidade: item.quantidade, categoria: item.categoria, sabor: item.nome, tamanho: "" });
  }
}
async function tratarHamburguer({ msg, user, contexto }) {
  const estado = contexto.estados[user];
  const catalogo = catalogoPublico();
  if (estado === "pedido_hamburguer") {
    if (!catalogo.produtos.length) {
      await msg.reply("O cardápio ainda não possui itens disponíveis. Peça para a empresa cadastrá-los no painel."); return true;
    }
    const itens = await interpretar(msg.body, catalogo.produtos, "produto");
    if (!itens.length) {
      await msg.reply("Não consegui identificar um item disponível. Informe quantidade e nome, por exemplo: *2 hambúrgueres e 1 bebida*."); return true;
    }
    contexto.carrinhoPizza[user] ||= [];
    adicionarAoCarrinho(contexto.carrinhoPizza[user], itens);
    const temHamburguer = contexto.carrinhoPizza[user].some(item => item.categoria === "hamburgueres");
    if (temHamburguer && catalogo.adicionais.length) {
      contexto.estados[user] = "perguntar_adicionais";
      await msg.reply(`🧀 Deseja adicionar extras ao seu hambúrguer?\n\n${nomes(catalogo.adicionais)}\n\nResponda *sim* para escolher ou *não* para continuar.`);
    } else {
      contexto.estados[user] = "perguntar_observacao_hamburguer";
      await msg.reply("📝 Deseja adicionar alguma observação ao pedido? Responda *sim* ou *não*.");
    }
    return true;
  }
  if (estado === "perguntar_adicionais") {
    if (respostaNao(msg.body)) { contexto.estados[user] = "perguntar_observacao_hamburguer"; await msg.reply("📝 Deseja adicionar alguma observação ao pedido? Responda *sim* ou *não*."); return true; }
    if (respostaSim(msg.body)) { contexto.estados[user] = "pedido_adicionais"; await msg.reply(`Digite os extras desejados:\n\n${nomes(catalogo.adicionais)}`); return true; }
    await msg.reply("Responda *sim* para escolher extras ou *não* para continuar."); return true;
  }
  if (estado === "pedido_adicionais") {
    const itens = await interpretar(msg.body, catalogo.adicionais, "adicional");
    if (!itens.length) { await msg.reply("Não identifiquei esse adicional. Escreva o nome exatamente como aparece na lista ou responda *não* para continuar sem extras."); return true; }
    contexto.carrinhoBebida[user] ||= []; adicionarAoCarrinho(contexto.carrinhoBebida[user], itens);
    contexto.estados[user] = "perguntar_observacao_hamburguer";
    await msg.reply("📝 Deseja adicionar alguma observação ao pedido? Responda *sim* ou *não*."); return true;
  }
  if (estado === "perguntar_observacao_hamburguer") {
    if (respostaNao(msg.body)) { contexto.observacoesPizza[user] = ""; contexto.estados[user] = "confirmar_resumo"; await msg.reply(gerarResumo(user, contexto.carrinhoPizza, contexto.carrinhoBebida)); return true; }
    if (respostaSim(msg.body)) { contexto.estados[user] = "digitar_observacao_hamburguer"; await msg.reply("Digite sua observação agora (por exemplo: sem cebola). "); return true; }
    await msg.reply("Responda *sim* ou *não*."); return true;
  }
  if (estado === "digitar_observacao_hamburguer") {
    contexto.observacoesPizza[user] = String(msg.body || "").trim().slice(0, 500);
    contexto.estados[user] = "confirmar_resumo";
    await msg.reply(gerarResumo(user, contexto.carrinhoPizza, contexto.carrinhoBebida)); return true;
  }
  return false;
}
module.exports = { tratarHamburguer };
