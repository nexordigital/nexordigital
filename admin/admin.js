// =====================================================
// NEXOR DIGITAL — admin.js
// =====================================================
const $ = (id) => document.getElementById(id);
let leadAtual = null;

async function api(url, opts = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (r.status === 401) { location.href = '/admin/login'; throw new Error('sem sessão'); }
  return r.json();
}

function classeSelo(status) {
  return 'selo selo--' + status.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-');
}

function fmtData(s) {
  // criado_em vem como "YYYY-MM-DD HH:MM:SS"
  const [d, h] = String(s).split(' ');
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a} ${h ? h.slice(0, 5) : ''}`;
}

// ---------- Sessão ----------
(async () => {
  const me = await api('/api/admin/me');
  $('adminNome').textContent = me.nome || '';
})();

$('btnSair').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  location.href = '/admin/login';
});

// ---------- Stats ----------
async function carregarStats() {
  const d = await api('/api/admin/stats');
  $('st-total').textContent = d.total;
  $('st-novo').textContent = d.porStatus['Novo'];
  $('st-contato').textContent = d.porStatus['Em contato'];
  $('st-qualificado').textContent = d.porStatus['Qualificado'];
  $('st-reuniao').textContent = d.porStatus['Reunião agendada'];
  $('st-cliente').textContent = d.porStatus['Cliente'];
  $('st-nao').textContent = d.porStatus['Não convertido'];
}

// Clicar num card filtra por status
document.querySelectorAll('.stat').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.stat').forEach((c) => c.classList.remove('ativo'));
    card.classList.add('ativo');
    $('fStatus').value = card.dataset.status;
    carregarLeads();
  });
});

// ---------- Tabela ----------
async function carregarLeads() {
  const params = new URLSearchParams();
  if ($('fBusca').value) params.set('busca', $('fBusca').value);
  if ($('fStatus').value) params.set('status', $('fStatus').value);
  if ($('fSegmento').value) params.set('segmento', $('fSegmento').value);
  if ($('fDe').value) params.set('de', $('fDe').value);
  if ($('fAte').value) params.set('ate', $('fAte').value);
  params.set('ordem', $('fOrdem').value);

  const d = await api('/api/admin/leads?' + params.toString());
  const tbody = $('tbody');
  tbody.innerHTML = '';
  $('vazio').hidden = d.leads.length > 0;

  for (const l of d.leads) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-nome"></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td><span class="${classeSelo(l.status)}"></span></td>
      <td><span class="link-detalhe">Ver detalhes</span></td>`;
    const tds = tr.querySelectorAll('td');
    tds[0].textContent = l.nome;
    tds[1].textContent = l.whatsapp;
    tds[2].textContent = l.empresa;
    tds[3].textContent = l.segmento;
    tds[4].textContent = `${l.cidade}/${l.estado}`;
    tds[5].textContent = fmtData(l.criado_em);
    tr.querySelector('.selo').textContent = l.status;
    tr.addEventListener('click', () => abrirModal(l.id));
    tbody.appendChild(tr);
  }
}

let debounce;
['fBusca', 'fSegmento'].forEach((id) => $(id).addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(carregarLeads, 300);
}));
['fStatus', 'fDe', 'fAte', 'fOrdem'].forEach((id) => $(id).addEventListener('change', carregarLeads));

$('btnLimpar').addEventListener('click', () => {
  ['fBusca', 'fStatus', 'fSegmento', 'fDe', 'fAte'].forEach((id) => $(id).value = '');
  $('fOrdem').value = 'recentes';
  document.querySelectorAll('.stat').forEach((c) => c.classList.remove('ativo'));
  carregarLeads();
});

// ---------- Modal ----------
async function abrirModal(id) {
  const d = await api('/api/admin/leads/' + id);
  leadAtual = d.lead;

  const l = d.lead;
  $('modalTitulo').textContent = l.nome;
  const campos = [
    ['WhatsApp', l.whatsapp],
    ['Empresa', l.empresa],
    ['Segmento', l.segmento],
    ['Instagram', l.instagram ? '@' + l.instagram : '—'],
    ['Cidade/UF', `${l.cidade}/${l.estado}`],
    ['Cadastro', fmtData(l.criado_em)]
  ];
  $('modalDados').innerHTML = '';
  for (const [k, v] of campos) {
    const div = document.createElement('div');
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    div.append(dt, dd);
    $('modalDados').appendChild(div);
  }

  $('modalStatus').value = l.status;
  $('modalWhats').href = 'https://wa.me/55' + l.whatsapp;

  renderObs(d.observacoes);
  renderHist(d.historico);

  $('modalFundo').hidden = false;
  document.body.style.overflow = 'hidden';
}

function renderObs(lista) {
  $('obsLista').innerHTML = '';
  if (!lista.length) { $('obsLista').innerHTML = '<li>Nenhuma observação ainda.</li>'; return; }
  for (const o of lista) {
    const li = document.createElement('li');
    const s = document.createElement('strong');
    s.textContent = `${o.autor || 'admin'} — ${fmtData(o.criado_em)}`;
    li.textContent = o.texto;
    li.prepend(s);
    $('obsLista').appendChild(li);
  }
}

function renderHist(lista) {
  $('histLista').innerHTML = '';
  for (const h of lista) {
    const li = document.createElement('li');
    li.innerHTML = h.status_anterior
      ? `<b></b> → <b></b> · ${fmtData(h.criado_em)} · ${h.alterado_por || ''}`
      : `Lead criado com status <b></b> · ${fmtData(h.criado_em)}`;
    const bs = li.querySelectorAll('b');
    if (h.status_anterior) { bs[0].textContent = h.status_anterior; bs[1].textContent = h.status_novo; }
    else bs[0].textContent = h.status_novo;
    $('histLista').appendChild(li);
  }
}

function fecharModal() {
  $('modalFundo').hidden = true;
  document.body.style.overflow = '';
  leadAtual = null;
}
$('modalFechar').addEventListener('click', fecharModal);
$('modalFundo').addEventListener('click', (e) => { if (e.target === $('modalFundo')) fecharModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modalFundo').hidden) fecharModal(); });

// Alterar status
$('modalStatus').addEventListener('change', async () => {
  if (!leadAtual) return;
  await api(`/api/admin/leads/${leadAtual.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: $('modalStatus').value })
  });
  const d = await api('/api/admin/leads/' + leadAtual.id);
  renderHist(d.historico);
  carregarStats();
  carregarLeads();
});

// Adicionar observação
$('btnObs').addEventListener('click', async () => {
  const texto = $('obsTexto').value.trim();
  if (!texto || !leadAtual) return;
  await api(`/api/admin/leads/${leadAtual.id}/observacoes`, {
    method: 'POST',
    body: JSON.stringify({ texto })
  });
  $('obsTexto').value = '';
  const d = await api('/api/admin/leads/' + leadAtual.id);
  renderObs(d.observacoes);
});

// ---------- Init ----------
carregarStats();
carregarLeads();
