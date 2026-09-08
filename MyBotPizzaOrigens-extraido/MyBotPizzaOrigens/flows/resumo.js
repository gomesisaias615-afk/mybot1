function gerarResumo(user, itensPorUsuario, adicionaisPorUsuario) {
  const itens = itensPorUsuario[user] || [];
  const adicionais = adicionaisPorUsuario[user] || [];
  let total = 0;
  const linha = item => {
    const valor = Number(item.valor ?? item.preco ?? 0);
    const subtotal = Number(item.quantidade || 1) * valor;
    total += subtotal;
    return `${item.quantidade || 1}x ${item.nome || item.sabor}\n💰 R$ ${subtotal.toFixed(2).replace(".", ",")}`;
  };
  let texto = "🧾 *RESUMO DO PEDIDO*\n\n";
  if (itens.length) texto += `🍔 *ITENS*\n\n${itens.map(linha).join("\n\n")}\n\n`;
  if (adicionais.length) texto += `➕ *ADICIONAIS*\n\n${adicionais.map(linha).join("\n\n")}\n\n`;
  texto += `💵 *TOTAL: R$ ${total.toFixed(2).replace(".", ",")}*\n\nDeseja continuar?\n\n1️⃣ Sim\n2️⃣ Não`;
  return texto;
}
module.exports = { gerarResumo };
