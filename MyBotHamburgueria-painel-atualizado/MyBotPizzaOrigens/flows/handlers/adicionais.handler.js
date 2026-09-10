const { respostaSim, respostaNao } = require("../../utils/texto");
const { adicionaisDisponiveis, formatarAdicionais, localizarAdicional } = require("../adicionais");
const { interpretarAdicionaisComGroq } = require("../../services/groqCardapio.service");

async function perguntarObservacao(msg, user, contexto) {
  contexto.estados[user] = "perguntar_observacao_pizza";
  await msg.reply(`📝 *Deseja adicionar alguma observação ao pedido?*

Exemplos: “Sem cebola” ou “Carne mal passada”.

1️⃣ Sim
2️⃣ Não`);
}

async function oferecerAdicionais(msg, user, contexto) {
  const disponiveis = adicionaisDisponiveis(contexto.carrinhoPizza[user] || []);
  contexto.adicionaisDisponiveis[user] = disponiveis;
  if (!disponiveis.length) return perguntarObservacao(msg, user, contexto);

  contexto.estados[user] = "perguntar_adicionais";
  await msg.reply(`➕ *Adicionais disponíveis para os produtos do seu pedido:*

${formatarAdicionais(disponiveis)}

Deseja adicionar algum item?

1️⃣ Sim
2️⃣ Não`);
}

async function tratarAdicionais({ msg, user, contexto }) {
  const estado = contexto.estados[user];
  if (!['perguntar_adicionais', 'escolher_adicional', 'adicionar_outro_adicional'].includes(estado)) return false;

  if (estado === "perguntar_adicionais") {
    if (respostaNao(msg.body)) { await perguntarObservacao(msg, user, contexto); return true; }
    if (respostaSim(msg.body)) {
      contexto.estados[user] = "escolher_adicional";
      await msg.reply(`Digite um ou mais adicionais junto com os produtos.

Exemplos: “Bacon no Hambúrguer X” ou “Bacon no Combo da casa e cheddar no X-Salada”.

${formatarAdicionais(contexto.adicionaisDisponiveis[user] || [])}`);
      return true;
    }
    await msg.reply("Por favor, responda com 1 para Sim ou 2 para Não.");
    return true;
  }

  if (estado === "adicionar_outro_adicional") {
    if (respostaNao(msg.body)) { await perguntarObservacao(msg, user, contexto); return true; }
    if (respostaSim(msg.body)) { contexto.estados[user] = "escolher_adicional"; await msg.reply("Digite o nome do adicional e o nome do produto."); return true; }
    await msg.reply("Por favor, responda com 1 para Sim ou 2 para Não.");
    return true;
  }

  const disponiveis = contexto.adicionaisDisponiveis[user] || [];
  let selecionados = [];
  try {
    selecionados = await interpretarAdicionaisComGroq(msg.body, disponiveis);
  } catch (erro) {
    console.warn(`Groq indisponível para adicionais: ${erro.message}`);
    const adicionalLocal = localizarAdicional(msg.body, disponiveis);
    if (adicionalLocal) selecionados = [adicionalLocal];
  }

  if (!selecionados.length) {
    await msg.reply(`Não consegui identificar o adicional. Escreva o adicional junto com o produto, por exemplo: “Bacon no Combo da casa”.

${formatarAdicionais(disponiveis)}`);
    return true;
  }

  contexto.adicionais[user] ||= [];
  contexto.adicionais[user].push(...selecionados);
  const itensConfirmados = selecionados.map(adicional =>
    `➕ *${adicional.nome}*\n🍔 Produto: *${adicional.produto}*\n💰 Valor: *R$ ${adicional.valor.toFixed(2).replace(".", ",")}*`
  ).join("\n\n━━━━━━━━━━━━━━━━━━━━\n\n");
  await msg.reply(`╭━━━━━━━━━━━━━━━━━━━━╮
     ✅ *ADICIONAL(IS) INCLUÍDO(S)*
╰━━━━━━━━━━━━━━━━━━━━╯

${itensConfirmados}`);
  await perguntarObservacao(msg, user, contexto);
  return true;
}

module.exports = { tratarAdicionais, oferecerAdicionais };
