const textos = require("../textosFlows");
const { normalizar } = require("../../utils/texto");
const { salvarContexto } = require("../contextoAtendimento");

async function mostrarMenu(msg, user, contexto) {
  contexto.estados[user] = "menu";
  await (typeof msg.replyMenu === "function"
    ? msg.replyMenu(textos.menuInicial)
    : msg.reply(textos.menuInicial));
}

async function tratarMenu({
  msg,
  user,
  contexto,
  estoque,
  recarregarEstoque,
  client
}) {
  if (contexto.estados[user] !== "menu") {
    return false;
  }

  const texto = normalizar(msg.body);

  if (["1", "fazer pedido"].includes(texto)) {
    recarregarEstoque();
    contexto.estados[user] = "pedido_pizza";
    await msg.reply(textos.comoPedirPizza);
    await msg.reply(textos.linkCardapioDigital, undefined, { linkPreview: false });
    return true;
  }

  if (["2", "instagram", "instagram da pizzaria"].includes(texto)) {
    await msg.reply(textos.instagram, undefined, { linkPreview: true });
    return true;
  }

  if (["3", "atendente", "falar com atendente", "fala com atendente"].includes(texto)) {
    contexto.estados[user] = "aguardando_atendente";
    salvarContexto();
    const numeroAtendente = String(process.env.ATENDENTE_WHATSAPP || "").replace(/\D/g, "");
    if (numeroAtendente && client?.sendMessage) {
      try {
        const contatoCliente = String(user || "").replace(/@.*$/, "");
        await client.sendMessage(
          numeroAtendente,
          `🔔 *Solicitação de atendimento humano*\n\nCliente: ${contatoCliente}\nO cliente está aguardando atendimento no WhatsApp.`
        );
      } catch (erro) {
        console.error("Não foi possível avisar a atendente:", erro.message);
      }
    }
    await msg.reply(
      "👩‍💼 *Atendimento humano solicitado.*\n\n" +
      "A atendente foi avisada e responderá assim que possível.\n" +
      "Se quiser voltar ao atendimento automático, envie *menu*."
    );
    return true;
  }

  if (["4", "mybot", "contato mybot", "entrar em contato com a mybot"].includes(texto)) {
    await msg.reply(textos.contatoMyBot, undefined, { linkPreview: true });
    return true;
  }

  await msg.reply(textos.menuErro);
  await mostrarMenu(msg, user, contexto);
  return true;
}

module.exports = {
  mostrarMenu,
  tratarMenu
};

