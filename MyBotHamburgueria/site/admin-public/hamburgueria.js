(() => {
  const base = "/api/painel/hamburgueria";
  const customTabs = ["itens", "ingredientes", "adicionaisHamb"];
  const customSections = ["catalogoHamb", "descricaoHamb", "adicionaisHamb"];
  const $ = selector => document.querySelector(selector);

  async function api(url, options = {}) {
    const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.erro || "Não foi possível concluir.");
    return data;
  }

  function esconderHamburgueria() {
    customSections.forEach(id => { const section = $("#" + id); if (section) section.hidden = true; });
  }

  function abrirHamburgueria(tab) {
    document.querySelectorAll(".secao-painel").forEach(section => section.hidden = true);
    esconderHamburgueria();
    const destino = { itens: "catalogoHamb", ingredientes: "descricaoHamb", adicionaisHamb: "adicionaisHamb" }[tab];
    const section = $("#" + destino);
    if (section) section.hidden = false;
    document.querySelectorAll(".guia-principal").forEach(button => button.classList.toggle("ativa", button.dataset.guia === tab));
  }

  function linhas(items, adicional = false) {
    if (!items.length) return "<p class='muted'>Nenhum item cadastrado.</p>";
    return items.map(item => `<div class="linha-preco"><span><strong>${item.nome}</strong><small>${item.categoria || "Adicional"} · R$ ${Number(item.preco).toFixed(2)}</small></span><button class="btn discreto" data-remover="${item.id}" data-adicional="${adicional}">Remover</button></div>`).join("");
  }

  function montar() {
    const main = $("main"), grade = $(".grade-principal");
    if (!main || !grade || $("#catalogoHamb")) return;

    const criar = (id, titulo, conteudo) => {
      const section = document.createElement("section");
      section.id = id; section.className = "card controles"; section.hidden = true;
      section.innerHTML = `<div class="titulo-card"><div><p class="eyebrow">HAMBURGUERIA</p><h2>${titulo}</h2></div></div>${conteudo}`;
      main.insertBefore(section, grade);
      return section;
    };

    const produtos = criar("catalogoHamb", "Adicionar itens", `<form id="formProdutoHamb" class="grade-entrega"><label>Categoria<select name="categoria"><option value="hamburgueres">Hambúrgueres</option><option value="combos">Combos</option><option value="acompanhamentos">Acompanhamentos</option><option value="bebidas">Bebidas</option></select></label><label>Nome<input name="nome" required></label><label>Descrição<input name="descricao" placeholder="Ex.: pão, carne e queijo"></label><label>Preço (R$)<input name="preco" type="number" min="0.01" step="0.01" required></label><button class="btn primario largura">Adicionar item</button></form><div id="listaProdutosHamb"></div>`);
    const descricao = criar("descricaoHamb", "Descrição", `<p>Descrições exibidas no cardápio público.</p><div id="listaDescricaoHamb"></div>`);
    const adicionais = criar("adicionaisHamb", "Adicionais", `<p>Extras oferecidos após o cliente pedir um hambúrguer.</p><form id="formAdicionalHamb" class="grade-entrega"><label>Nome do adicional<input name="nome" required></label><label>Preço (R$)<input name="preco" type="number" min="0.01" step="0.01" required></label><button class="btn primario largura">Adicionar adicional</button></form><div id="listaAdicionaisHamb"></div>`);

    async function atualizar() {
      const dados = await api(base + "/catalogo");
      $("#listaProdutosHamb").innerHTML = linhas(dados.produtos);
      $("#listaDescricaoHamb").innerHTML = dados.produtos.length ? dados.produtos.map(item => `<div class="linha-preco"><strong>${item.nome}</strong><small>${item.descricao || "Sem descrição cadastrada."}</small></div>`).join("") : "<p class='muted'>Nenhum produto cadastrado.</p>";
      $("#listaAdicionaisHamb").innerHTML = linhas(dados.adicionais, true);
      produtos.querySelectorAll("[data-remover]").forEach(button => button.onclick = async () => { await api(base + "/itens/" + button.dataset.remover, { method: "DELETE" }); atualizar(); });
      adicionais.querySelectorAll("[data-remover]").forEach(button => button.onclick = async () => { await api(base + "/adicionais/" + button.dataset.remover, { method: "DELETE" }); atualizar(); });
    }

    [["#formProdutoHamb", "/itens"], ["#formAdicionalHamb", "/adicionais"]].forEach(([form, route]) => $(form).onsubmit = async event => { event.preventDefault(); await api(base + route, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); event.target.reset(); atualizar(); });

    document.addEventListener("click", event => {
      const button = event.target.closest("[data-guia]");
      if (!button) return;
      if (customTabs.includes(button.dataset.guia)) {
        event.preventDefault(); event.stopImmediatePropagation(); abrirHamburgueria(button.dataset.guia);
      } else {
        // Deixa o painel original abrir Pedido, Histórico, Estoque, Promoções etc.,
        // mas remove antes qualquer tela de hamburgueria que estivesse visível.
        esconderHamburgueria();
      }
    }, true);
    atualizar();
  }
  window.addEventListener("load", () => setTimeout(montar, 500));
})();
