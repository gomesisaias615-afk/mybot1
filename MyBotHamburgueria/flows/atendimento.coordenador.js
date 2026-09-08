const textos = require("./textosFlows");
const {
  contexto,
  resetarUsuario
} = require("./contextoAtendimento");
const {
  estoque,
  recarregarEstoque
} = require("../services/estoque.service");
const { normalizar } = require("../utils/texto");
const {
  mostrarMenu: mostrarMenuBase,
  tratarMenu,
  tratarAtalhoMenu
} = require("./handlers/menu.handler");
const { tratarHamburguer } = require("./handlers/hamburguer.handler");
const { tratarResumo } = require("./handlers/resumo.handler");
const { tratarEndereco } = require("./handlers/endereco.handler");
const {
  finalizarPedido
} = require("./handlers/finalizacaoPedido.handler");

function mostrarMenu(msg, user) {
  return mostrarMenuBase(msg, user, contexto);
}

const ESTADOS_TEXTO_LIVRE = new Set([
  "pedido_hamburguer", "perguntar_adicionais", "pedido_adicionais", "perguntar_observacao_hamburguer", "digitar_observacao_hamburguer",
  "confirmar_resumo", "conf_contato", "conf_rua", "conf_numero", "conf_bairro",
  "complemento_pergunta", "referencia_pergunta", "confirmar_endereco",
  "endereco_contato", "endereco_rua", "endereco_numero", "endereco_bairro",
  "endereco_complemento", "endereco_referencia", "pagamento_tipo"
]);

async function tratarComandoGlobal(msg, client, user, texto) {
  const iniciarAtendimento =
    ["menu", "oi", "oi bot", "ola", "ola bot", "hamburguer", "lanche", "bom dia", "boa tarde", "boa noite"]
      .includes(texto) ||
    texto === "quero hamburguer" || texto === "quero um hamburguer" || texto === "quero lanche";

  if (iniciarAtendimento) {
    resetarUsuario(user);
    await mostrarMenu(msg, user);
    return true;
  }

  return false;
}

async function atendimento(msg, client) {
  const user = msg.from;
  const texto = normalizar(msg.body);
  const estadoAtual = contexto.estados[user];

  // "menu" sempre vence qualquer outro fluxo, inclusive pedido, endereço e pagamento.
  if (texto === "menu") {
    resetarUsuario(user);
    await mostrarMenu(msg, user);
    return;
  }

  if (estadoAtual === "aguardando_atendente") {
    await msg.reply("👩‍💼 Aguarde a resposta da atendente ou envie *menu* para voltar ao atendimento automático.");
    return;
  }

  const aguardandoTextoLivre = ESTADOS_TEXTO_LIVRE.has(estadoAtual);
  const respostaPorBotao = Boolean(msg._data?.isButtonResponse);

  const parametros = {
    msg,
    client,
    user,
    contexto,
    estoque,
    recarregarEstoque,
    resetarUsuario,
    mostrarMenu
  };

  // Textos/IDs dos quatro botões do menu têm prioridade sobre o cardápio.
  // Isso impede que "Instagram" ou "Promoções" seja tratado como produto.
  if (await tratarAtalhoMenu(parametros)) return;

  if (!aguardandoTextoLivre && await tratarComandoGlobal(msg, client, user, texto)) {
    return;
  }

  if (!aguardandoTextoLivre && !respostaPorBotao) {
    resetarUsuario(user);
    await mostrarMenu(msg, user);
    return;
  }

  if (!contexto.estados[user]) {
    await mostrarMenu(msg, user);
    return;
  }

  if (await tratarMenu(parametros)) return;
  if (await tratarHamburguer(parametros)) return;
  if (await tratarResumo(parametros)) return;
  if (await tratarEndereco(parametros)) return;

  recarregarEstoque();

  if (await finalizarPedido(parametros)) return;

  console.warn(
    `Estado desconhecido para ${user}:`,
    contexto.estados[user]
  );

  resetarUsuario(user);
  await msg.reply(textos.menuErro);
  await mostrarMenu(msg, user);
}

module.exports = {
  atendimento,
  mostrarMenu
};


