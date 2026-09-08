const fs = require("fs");
const { garantirArquivo } = require("./dadosPersistentes.service");

const arquivo = garantirArquivo("cardapio-hamburgueria.json", "data/cardapio-hamburgueria.json", {
  produtos: [], adicionais: []
});
const categorias = ["hamburgueres", "combos", "acompanhamentos", "bebidas"];

function normalizar(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function ler() {
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo, "utf8"));
    return { produtos: Array.isArray(dados.produtos) ? dados.produtos : [], adicionais: Array.isArray(dados.adicionais) ? dados.adicionais : [] };
  } catch { return { produtos: [], adicionais: [] }; }
}
function salvar(dados) { fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), "utf8"); }
function validarItem(item, adicional = false) {
  const nome = String(item?.nome || "").trim();
  const preco = Number(item?.preco);
  if (!nome || nome.length > 80) throw new Error("Informe o nome do item (até 80 caracteres).");
  if (!Number.isFinite(preco) || preco <= 0) throw new Error("Informe um preço maior que zero.");
  const categoria = adicional ? "adicionais" : String(item?.categoria || "");
  if (!adicional && !categorias.includes(categoria)) throw new Error("Escolha uma categoria válida.");
  return { nome, preco: Number(preco.toFixed(2)), categoria, descricao: String(item?.descricao || "").trim().slice(0, 500), chave: normalizar(nome) };
}
function adicionar(item, adicional = false) {
  const dados = ler(); const novo = validarItem(item, adicional); const lista = adicional ? dados.adicionais : dados.produtos;
  if (lista.some(atual => normalizar(atual.nome) === novo.chave)) throw new Error("Já existe um item com esse nome.");
  novo.id = `${adicional ? "ad" : "item"}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  novo.disponivel = true; lista.push(novo); salvar(dados); return novo;
}
function remover(id, adicional = false) {
  const dados = ler(); const chave = String(id || ""); const lista = adicional ? dados.adicionais : dados.produtos;
  const indice = lista.findIndex(item => item.id === chave);
  if (indice < 0) throw new Error("Item não encontrado.");
  const [removido] = lista.splice(indice, 1); salvar(dados); return removido;
}
function catalogoPublico() {
  const dados = ler();
  return { categorias, produtos: dados.produtos.filter(item => item.disponivel !== false), adicionais: dados.adicionais.filter(item => item.disponivel !== false) };
}
module.exports = { categorias, ler, adicionar, remover, catalogoPublico, normalizar };
