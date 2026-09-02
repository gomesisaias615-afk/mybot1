const fs = require("fs");
const path = require("path");

const { garantirArquivo } = require("./dadosPersistentes.service");
const estoquePath = garantirArquivo("estoque.json", "services/monitoramento/estoque.json", { pizzas: {}, bebidas: {} });

const estoque = {
  pizzas: {},
  bebidas: {}
};

function recarregarEstoque() {
  try {
    const dados = JSON.parse(
      fs.readFileSync(estoquePath, "utf8")
    );

    estoque.pizzas = dados.pizzas || {};
    estoque.bebidas = dados.bebidas || {};
  } catch (err) {
    console.error("Erro ao carregar estoque:", err.message);
  }

  return estoque;
}

function normalizar(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function zerarProduto(nomeInformado) {
  const dados = JSON.parse(fs.readFileSync(estoquePath, "utf8"));
  dados.pizzas = dados.pizzas || {};
  dados.bebidas = dados.bebidas || {};
  const procurado = normalizar(nomeInformado);
  const encontrados = [];

  for (const tipo of ["pizzas", "bebidas"]) {
    for (const chave of Object.keys(dados[tipo])) {
      if (normalizar(chave) === procurado) encontrados.push({ tipo, chave });
    }
  }

  if (encontrados.length !== 1) return { sucesso: false, encontrados };
  const produto = encontrados[0];
  const quantidadeAnterior = Number(dados[produto.tipo][produto.chave]) || 0;
  dados[produto.tipo][produto.chave] = 0;
  fs.writeFileSync(estoquePath, JSON.stringify(dados, null, 2), "utf8");
  recarregarEstoque();
  return { sucesso: true, ...produto, quantidadeAnterior };
}

function atualizarProdutos(operacoes) {
  const dados = JSON.parse(fs.readFileSync(estoquePath, "utf8"));
  dados.pizzas = dados.pizzas || {};
  dados.bebidas = dados.bebidas || {};
  const aplicadas = [];
  for (const operacao of operacoes || []) {
    if (!Object.prototype.hasOwnProperty.call(dados[operacao.tipo] || {}, operacao.chave)) throw new Error("Item inexistente no estoque: " + operacao.chave);
    const anterior = Math.max(0, Number(dados[operacao.tipo][operacao.chave]) || 0);
    const atual = operacao.acao === "zerar" ? 0 : anterior + Math.max(1, Number(operacao.quantidade) || 0);
    dados[operacao.tipo][operacao.chave] = atual;
    aplicadas.push({ ...operacao, anterior, atual });
  }
  fs.writeFileSync(estoquePath, JSON.stringify(dados, null, 2), "utf8");
  recarregarEstoque();
  return aplicadas;
}

function definirQuantidadeProduto(tipo, chave, quantidade) {
  if (!["pizzas", "bebidas"].includes(tipo)) throw new Error("Tipo de produto inválido.");
  const valor = Number(quantidade);
  if (!Number.isInteger(valor) || valor < 0 || valor > 10000) {
    throw new Error("A quantidade deve ser um número inteiro entre 0 e 10000.");
  }
  const dados = JSON.parse(fs.readFileSync(estoquePath, "utf8"));
  dados.pizzas = dados.pizzas || {};
  dados.bebidas = dados.bebidas || {};
  if (!Object.prototype.hasOwnProperty.call(dados[tipo], chave)) throw new Error("Produto não encontrado no estoque.");
  dados[tipo][chave] = valor;
  fs.writeFileSync(estoquePath, JSON.stringify(dados, null, 2), "utf8");
  recarregarEstoque();
  return valor;
}
recarregarEstoque();

module.exports = {
  estoque,
  recarregarEstoque,
  zerarProduto,
  atualizarProdutos,
  definirQuantidadeProduto
};

