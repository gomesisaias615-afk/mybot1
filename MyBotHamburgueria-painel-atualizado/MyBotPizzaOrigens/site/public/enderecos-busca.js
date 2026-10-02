(() => {
  const memoria = new Map();
  function chave(texto) {
    const mapa = {r:"rua",av:"avenida",ave:"avenida",tv:"travessa",trav:"travessa",dr:"doutor",dra:"doutora",rod:"rodovia",est:"estrada",estr:"estrada",pc:"praca",pca:"praca",jd:"jardim",prof:"professor",profa:"professora",cel:"coronel",gov:"governador",pres:"presidente",dep:"deputado"};
    return String(texto || "").replace(/\b(primeiro|1[º°o]?)\s+de\s+maio\b/gi,"1 de maio")
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\s]/g," ")
      .split(/\s+/).filter(p=>p && !["de","da","do","das","dos"].includes(p)).map(p=>mapa[p] || p).join(" ");
  }
  function areaUrl(area) {
    return "cidade="+encodeURIComponent(area.cidade || "")+"&estado="+encodeURIComponent(area.estado || "");
  }
  async function carregar(area) {
    const id=areaUrl(area),antigo=memoria.get(id);
    if(antigo && antigo.ate>Date.now())return antigo.promise;
    const promise=fetch("/api/enderecos/catalogo?"+id,{cache:"no-store"}).then(async resposta=>{
      if(!resposta.ok)throw new Error("Catálogo indisponível");
      const itens=await resposta.json();
      return Array.isArray(itens)?itens:[];
    }).catch(()=>{memoria.delete(id);return [];});
    memoria.set(id,{promise,ate:Date.now()+300000});return promise;
  }
  function filtrar(itens,busca) {
    const termos=chave(busca).split(" ").filter(Boolean);
    return termos.length?itens.filter(item=>[item.rua,...(item.aliases || [])].some(nome=>{
      const alvo=chave(nome+" "+item.bairro);
      return termos.every(termo=>alvo.includes(termo));
    })).slice(0,8):[];
  }
  function criar({obterArea,renderizar}) {
    let versao=0,timer,controlador;
    function cancelar(){versao++;clearTimeout(timer);controlador?.abort();}
    async function buscar(busca) {
      cancelar();
      const atual=versao,area=obterArea();
      if(busca.trim().length<2 || !area.cidade || !area.estado){renderizar([]);return;}
      const locais=filtrar(await carregar(area),busca);
      if(atual!==versao)return;
      renderizar(locais);
      if(busca.trim().length<3)return;
      timer=setTimeout(async()=>{
        controlador=new AbortController();
        try {
          const resposta=await fetch("/api/enderecos/sugestoes?q="+encodeURIComponent(busca)+"&"+areaUrl(area),{signal:controlador.signal,cache:"no-store"});
          if(!resposta.ok)throw new Error("Busca externa indisponível");
          const itens=await resposta.json();
          if(atual===versao && Array.isArray(itens))renderizar(itens.length?itens:locais);
        }catch{/* Resultados locais permanecem disponíveis. */}
      },600);
    }
    return {buscar,cancelar,precarregar:()=>carregar(obterArea())};
  }
  window.MyBotEnderecos={criar,chave,filtrar,limpar:()=>memoria.clear()};
})();
