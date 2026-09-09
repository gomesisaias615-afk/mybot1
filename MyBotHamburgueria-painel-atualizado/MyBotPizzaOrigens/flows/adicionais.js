const fs = require("fs");
const { garantirArquivo } = require("../services/dadosPersistentes.service");
const { normalizar } = require("../utils/texto");
const { obterConfiguracaoCardapio } = require("./cardapio");

const caminhoAdicionais = garantirArquivo("adicionais.json", "data/adicionais.json", {});

function lerAdicionais() {
  try {
    const dados = JSON.parse(fs.readFileSync(caminhoAdicionais, "utf8"));
    return dados && typeof dados === "object" && !Array.isArray(dados) ? dados : {};
  } catch {
    return {};
  }
}

function categoriaDoProduto(nome) {
  const categorias = obterConfiguracaoCardapio().pizzasPorCategoria || {};
  for (const [categoria, produtos] of Object.entries(categorias)) {
    if ((produtos || []).some(produto => normalizar(produto) === normalizar(nome))) return categoria;
  }
  return "";
}

function nomeDoItem(item) {
  return item?.sabor || item?.sabores?.[0] || "";
}

function adicionaisDisponiveis(carrinho = []) {
  const cadastrados = lerAdicionais();
  const produtos = new Map();
  for (const item of carrinho) {
    const produto = nomeDoItem(item);
    const categoria = categoriaDoProduto(produto);
    if (!produto || !["tradicionais", "doces"].includes(categoria)) continue;
    const chave = Object.keys(cadastrados).find(nome => normalizar(nome) === normalizar(produto));
    const extras = (chave ? cadastrados[chave] : [])
      .filter(extra => String(extra?.nome || "").trim() && Number(extra?.preco) > 0)
      .map(extra => ({ produto, nome: String(extra.nome).trim(), valor: Number(extra.preco) }));
    if (extras.length) produtos.set(normalizar(produto), extras);
  }
  return [...produtos.values()].flat();
}

function formatarAdicionais(adicionais) {
  const porProduto = new Map();
  for (const adicional of adicionais) {
    const lista = porProduto.get(adicional.produto) || [];
    lista.push(adicional);
    porProduto.set(adicional.produto, lista);
  }
  return [...porProduto.entries()].map(([produto, lista]) =>
    `*${produto}*\n${lista.map(item => `• ${item.nome} — R$ ${item.valor.toFixed(2).replace(".", ",")}`).join("\n")}`
  ).join("\n\n");
}

function localizarAdicional(texto, adicionais) {
  const entrada = normalizar(texto);
  const encontrados = adicionais.filter(adicional =>
    entrada.includes(normalizar(adicional.produto)) && entrada.includes(normalizar(adicional.nome))
  );
  return encontrados.length === 1 ? encontrados[0] : null;
}

module.exports = { adicionaisDisponiveis, formatarAdicionais, localizarAdicional };
