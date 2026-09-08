const fs=require("fs");
const{garantirArquivo}=require("./dadosPersistentes.service");
const arquivo=garantirArquivo("cardapio-hamburgueria.json","data/cardapio-hamburgueria.json",{produtos:[],adicionais:[]});
const categorias=["hamburgueres","combos","complementos","bebidas"];
const normalizar=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function ler(){try{const d=JSON.parse(fs.readFileSync(arquivo,"utf8"));return{produtos:Array.isArray(d.produtos)?d.produtos:[],adicionais:Array.isArray(d.adicionais)?d.adicionais:[]}}catch{return{produtos:[],adicionais:[]}}}
function salvar(d){fs.writeFileSync(arquivo,JSON.stringify(d,null,2),"utf8")}
function adicionar(item,adicional=false){const d=ler(),nome=String(item?.nome||"").trim(),preco=Number(item?.preco),categoria=adicional?"complementos":String(item?.categoria||"");if(!nome||nome.length>80)throw Error("Informe o nome do item.");if(!Number.isFinite(preco)||preco<=0)throw Error("Informe um preço maior que zero.");if(!adicional&&!categorias.includes(categoria))throw Error("Escolha uma categoria válida.");const lista=adicional?d.adicionais:d.produtos;if(lista.some(x=>normalizar(x.nome)===normalizar(nome)))throw Error("Já existe um item com esse nome.");const novo={id:`${adicional?"comp":"item"}-${Date.now()}`,nome,preco:Number(preco.toFixed(2)),categoria,descricao:String(item?.descricao||"").trim(),disponivel:true};lista.push(novo);salvar(d);return novo}
function remover(id,adicional=false){const d=ler(),lista=adicional?d.adicionais:d.produtos,i=lista.findIndex(x=>x.id===String(id));if(i<0)throw Error("Item não encontrado.");const[r]=lista.splice(i,1);salvar(d);return r}
function catalogoPublico(){const d=ler();return{categorias,produtos:d.produtos.filter(x=>x.disponivel!==false),adicionais:d.adicionais.filter(x=>x.disponivel!==false)}}
module.exports={categorias,ler,adicionar,remover,catalogoPublico,normalizar};
