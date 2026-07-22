// server.js — Nexor Digital: LP pública + API de leads + painel admin protegido
require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { db, STATUS_VALIDOS, SqliteSessionStore } = require('./database');
const { notificarNovoLead } = require('./notify');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.set('trust proxy', 1); // atrás de Nginx/Traefik
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));

// ---------- Sessão ----------
app.use(session({
  name: 'nexor.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  store: new SqliteSessionStore(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD, // exige HTTPS em produção
    maxAge: 1000 * 60 * 60 * 12 // 12h
  }
}));

// ---------- Rate limit simples (em memória) ----------
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const rec = hits.get(key) || { count: 0, reset: now + windowMs };
    if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs; }
    rec.count++;
    hits.set(key, rec);
    if (rec.count > max) {
      return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Aguarde alguns minutos.' });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
}, 60 * 1000).unref();

// ---------- Helpers ----------
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const limpa = (s, max = 200) => String(s || '').trim().slice(0, max);

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ ok: false, erro: 'Não autenticado.' });
  return res.redirect('/admin/login');
}

// =========================================================
// API PÚBLICA — recebimento de leads
// =========================================================
app.post('/api/leads', rateLimit(8, 10 * 60 * 1000), (req, res) => {
  const b = req.body || {};

  // honeypot anti-spam (campo invisível no form)
  if (b.website) return res.json({ ok: true });

  const nome = limpa(b.nome, 120);
  const whatsapp = soDigitos(b.whatsapp);
  const empresa = limpa(b.empresa, 150);
  const segmento = limpa(b.segmento, 100);
  const instagram = limpa(b.instagram, 100).replace(/^@/, '');
  const cidade = limpa(b.cidade, 100);
  const estado = limpa(b.estado, 2).toUpperCase();

  const erros = [];
  if (!nome) erros.push('Nome é obrigatório.');
  if (!whatsapp || whatsapp.length < 10 || whatsapp.length > 13) erros.push('Informe um WhatsApp válido com DDD.');
  if (!empresa) erros.push('Empresa é obrigatória.');
  if (!segmento) erros.push('Segmento é obrigatório.');
  if (!cidade) erros.push('Cidade é obrigatória.');
  if (!/^[A-Z]{2}$/.test(estado)) erros.push('Estado é obrigatório.');
  if (erros.length) return res.status(400).json({ ok: false, erros });

  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO leads (nome, whatsapp, empresa, segmento, instagram, cidade, estado, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Novo')
    `).run(nome, whatsapp, empresa, segmento, instagram || null, cidade, estado);
    db.prepare(`
      INSERT INTO lead_status_historico (lead_id, status_anterior, status_novo, alterado_por)
      VALUES (?, NULL, 'Novo', 'sistema')
    `).run(info.lastInsertRowid);
    return info.lastInsertRowid;
  });

  let leadId;
  try {
    leadId = tx();
  } catch (e) {
    console.error('Erro ao salvar lead:', e);
    return res.status(500).json({ ok: false, erro: 'Erro ao salvar. Tente novamente.' });
  }

  // Notificação (e-mail e/ou webhook) — assíncrona, não bloqueia a resposta
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
  notificarNovoLead(lead).catch((e) => console.error('Falha na notificação:', e.message));

  res.status(201).json({ ok: true });
});

// =========================================================
// AUTENTICAÇÃO ADMIN
// =========================================================
app.post('/api/admin/login', rateLimit(10, 15 * 60 * 1000), (req, res) => {
  const email = limpa(req.body.email, 150).toLowerCase();
  const senha = String(req.body.senha || '');
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin || !bcrypt.compareSync(senha, admin.senha_hash)) {
    return res.status(401).json({ ok: false, erro: 'E-mail ou senha incorretos.' });
  }
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ ok: false, erro: 'Erro de sessão.' });
    req.session.adminId = admin.id;
    req.session.adminNome = admin.nome;
    res.json({ ok: true, nome: admin.nome });
  });
});

app.post('/api/admin/logout', requireAuth, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// =========================================================
// API ADMIN — protegida
// =========================================================
app.get('/api/admin/me', requireAuth, (req, res) => {
  res.json({ ok: true, nome: req.session.adminNome });
});

app.get('/api/admin/stats', requireAuth, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM leads').get().c;
  const porStatus = {};
  for (const s of STATUS_VALIDOS) {
    porStatus[s] = db.prepare('SELECT COUNT(*) c FROM leads WHERE status = ?').get(s).c;
  }
  res.json({ ok: true, total, porStatus, statusValidos: STATUS_VALIDOS });
});

app.get('/api/admin/leads', requireAuth, (req, res) => {
  const { busca, status, segmento, de, ate, ordem } = req.query;
  const where = [];
  const params = [];

  if (busca) {
    where.push('(nome LIKE ? OR empresa LIKE ? OR whatsapp LIKE ?)');
    const q = `%${limpa(busca, 100)}%`;
    params.push(q, q, soDigitos(busca) ? `%${soDigitos(busca)}%` : q);
  }
  if (status && STATUS_VALIDOS.includes(status)) { where.push('status = ?'); params.push(status); }
  if (segmento) { where.push('segmento LIKE ?'); params.push(`%${limpa(segmento, 100)}%`); }
  if (de) { where.push("date(criado_em) >= date(?)"); params.push(limpa(de, 10)); }
  if (ate) { where.push("date(criado_em) <= date(?)"); params.push(limpa(ate, 10)); }

  const dir = ordem === 'antigos' ? 'ASC' : 'DESC';
  const sql = `SELECT * FROM leads ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY criado_em ${dir} LIMIT 500`;
  res.json({ ok: true, leads: db.prepare(sql).all(...params) });
});

app.get('/api/admin/leads/:id', requireAuth, (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ ok: false, erro: 'Lead não encontrado.' });
  const historico = db.prepare('SELECT * FROM lead_status_historico WHERE lead_id = ? ORDER BY criado_em DESC').all(lead.id);
  const observacoes = db.prepare('SELECT * FROM lead_observacoes WHERE lead_id = ? ORDER BY criado_em DESC').all(lead.id);
  res.json({ ok: true, lead, historico, observacoes });
});

app.patch('/api/admin/leads/:id/status', requireAuth, (req, res) => {
  const novo = limpa(req.body.status, 40);
  if (!STATUS_VALIDOS.includes(novo)) return res.status(400).json({ ok: false, erro: 'Status inválido.' });
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ ok: false, erro: 'Lead não encontrado.' });
  if (lead.status === novo) return res.json({ ok: true });

  db.transaction(() => {
    db.prepare("UPDATE leads SET status = ?, atualizado_em = datetime('now','localtime') WHERE id = ?").run(novo, lead.id);
    db.prepare('INSERT INTO lead_status_historico (lead_id, status_anterior, status_novo, alterado_por) VALUES (?, ?, ?, ?)')
      .run(lead.id, lead.status, novo, req.session.adminNome || 'admin');
  })();
  res.json({ ok: true });
});

app.post('/api/admin/leads/:id/observacoes', requireAuth, (req, res) => {
  const texto = limpa(req.body.texto, 2000);
  if (!texto) return res.status(400).json({ ok: false, erro: 'Observação vazia.' });
  const lead = db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ ok: false, erro: 'Lead não encontrado.' });
  db.prepare('INSERT INTO lead_observacoes (lead_id, texto, autor) VALUES (?, ?, ?)')
    .run(lead.id, texto, req.session.adminNome || 'admin');
  res.status(201).json({ ok: true });
});

// =========================================================
// PÁGINAS
// =========================================================
// Painel admin (protegido) — login é a única página livre
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.adminId) return res.redirect('/admin');
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});
app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});
app.use('/admin/static', express.static(path.join(__dirname, 'admin', 'static')));

// LP pública
app.use(express.static(path.join(__dirname, 'public'), { maxAge: IS_PROD ? '7d' : 0, index: 'index.html' }));

app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.listen(PORT, () => {
  console.log(`Nexor Digital rodando em http://localhost:${PORT}`);
  const admins = db.prepare('SELECT COUNT(*) c FROM admins').get().c;
  if (!admins) console.log('⚠  Nenhum admin cadastrado. Rode: npm run create-admin');
});
