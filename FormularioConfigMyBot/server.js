const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const destinatario = "mybot563@gmail.com";
let ultimoEnvio = 0;

app.use(express.json({ limit: "6mb" }));
app.use(express.static(__dirname));

app.post("/api/formulario-empresa", async (req, res) => {
  if (Date.now() - ultimoEnvio < 10000) return res.status(429).json({ erro: "Aguarde alguns segundos antes de enviar novamente." });
  const apiKey = process.env.BREVO_API_KEY;
  const remetente = process.env.BREVO_SENDER_EMAIL || destinatario;
  const campos = req.body?.campos;
  const arquivos = Array.isArray(req.body?.arquivos) ? req.body.arquivos : [];
  if (!apiKey) return res.status(503).json({ erro: "O servidor de e-mail ainda não foi configurado." });
  if (!campos?.empresa || !campos?.telefone || !campos?.emailEmpresa || !campos?.estado || !campos?.municipio) return res.status(400).json({ erro: "Preencha nome, telefone, e-mail, estado e município da empresa." });
  const anexos = arquivos.filter(arquivo => arquivo?.nome && arquivo?.conteudo).map(arquivo => ({ name: String(arquivo.nome).replace(/[^a-z0-9._-]/gi, "-"), content: String(arquivo.conteudo) }));
  if (anexos.some(arquivo => arquivo.content.length > 4_200_000)) return res.status(400).json({ erro: "Cada arquivo pode ter no máximo 3 MB." });
  const texto = Object.entries(campos).map(([chave, valor]) => `${chave}: ${String(valor || "-").trim() || "-"}`).join("\n");
  try {
    const resposta = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": apiKey, "content-type": "application/json" }, body: JSON.stringify({ sender: { name: "MyBot - Cadastro", email: remetente }, to: [{ email: destinatario }], subject: `Novo cadastro: ${campos.empresa}`, textContent: texto, attachment: [{ name: `cadastro-${String(campos.empresa).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.txt`, content: Buffer.from(texto, "utf8").toString("base64") }, ...anexos] }) });
    if (!resposta.ok) return res.status(502).json({ erro: "O Brevo recusou o envio. Confirme o remetente e a chave API." });
    await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": apiKey, "content-type": "application/json" }, body: JSON.stringify({ sender: { name: "MyBot", email: remetente }, to: [{ email: campos.emailEmpresa }], subject: "Recebemos seu cadastro na MyBot", textContent: `Olá! Recebemos o cadastro da ${campos.empresa}. Nossa equipe analisará as informações e enviará a confirmação e os próximos passos por este e-mail.` }) }).catch(() => null);
    ultimoEnvio = Date.now();
    res.json({ ok: true });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ erro: "Não foi possível enviar o e-mail agora." });
  }
});

app.get("*", (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.listen(port, () => console.log(`Formulário disponível na porta ${port}`));
