// notify.js — notificações de novo lead
// Nada aqui é "fake": cada canal só é ativado se estiver configurado no .env.
// Canais disponíveis:
//   1. E-mail (SMTP)      -> SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_EMAIL
//   2. Webhook (n8n/Make) -> WEBHOOK_URL  (recebe o lead em JSON via POST)
const nodemailer = require('nodemailer');

function emailConfigurado() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.NOTIFY_EMAIL);
}

async function enviarEmail(lead) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  const linhas = [
    `Nome: ${lead.nome}`,
    `WhatsApp: ${lead.whatsapp}`,
    `Empresa: ${lead.empresa}`,
    `Segmento: ${lead.segmento}`,
    `Instagram: ${lead.instagram ? '@' + lead.instagram : '—'}`,
    `Cidade/UF: ${lead.cidade}/${lead.estado}`,
    `Data: ${lead.criado_em}`,
    '',
    `Abrir conversa: https://wa.me/55${lead.whatsapp}`
  ].join('\n');

  await transporter.sendMail({
    from: `"Nexor Digital — Leads" <${process.env.SMTP_USER}>`,
    to: process.env.NOTIFY_EMAIL,
    subject: `Novo lead: ${lead.nome} (${lead.empresa})`,
    text: linhas
  });
}

async function enviarWebhook(lead) {
  await fetch(process.env.WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evento: 'novo_lead', lead })
  });
}

async function notificarNovoLead(lead) {
  const tarefas = [];
  if (emailConfigurado()) tarefas.push(enviarEmail(lead));
  if (process.env.WEBHOOK_URL) tarefas.push(enviarWebhook(lead));
  if (!tarefas.length) return; // nenhum canal configurado — segue sem notificar
  await Promise.allSettled(tarefas);
}

module.exports = { notificarNovoLead };
