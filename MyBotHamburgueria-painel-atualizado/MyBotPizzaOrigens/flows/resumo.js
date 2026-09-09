function moeda(valor) {
  return `R$ ${Number(valor || 0).toFixed(2).replace(".", ",")}`;
}

function gerarResumo(user, carrinhoPizza, carrinhoBebida, adicionais = {}) {
  let texto = "🧾 RESUMO DO PEDIDO\n\n";
  let total = 0;
  const pizzas = carrinhoPizza[user] || [];
  const bebidas = carrinhoBebida[user] || [];
  const extras = adicionais[user] || [];

  if (pizzas.length) {
    texto += "🍔 PRODUTOS\n\n";
    for (const produto of pizzas) {
      const subtotal = Number(produto.quantidade || 0) * Number(produto.valor || 0);
      total += subtotal;
      texto += `${produto.quantidade}x ${produto.sabor || produto.sabores?.join(" / ") || "Produto"}\n`;
      texto += `💰 ${moeda(subtotal)}\n\n`;
    }
  }

  if (extras.length) {
    texto += "➕ ADICIONAIS\n\n";
    for (const adicional of extras) {
      total += Number(adicional.valor) || 0;
      texto += `${adicional.nome} em ${adicional.produto}\n`;
      texto += `💰 ${moeda(adicional.valor)}\n\n`;
    }
  }

  if (bebidas.length) {
    texto += "🥤 BEBIDAS\n\n";
    for (const bebida of bebidas) {
      const subtotal = Number(bebida.quantidade || 0) * Number(bebida.valor || 0);
      total += subtotal;
      texto += `${bebida.quantidade}x ${bebida.nome}\n`;
      texto += `💰 ${moeda(subtotal)}\n\n`;
    }
  }

  return `${texto}💵 TOTAL: ${moeda(total)}\n\nDeseja continuar?\n\n1️⃣ Sim\n2️⃣ Não`;
}

module.exports = { gerarResumo };
