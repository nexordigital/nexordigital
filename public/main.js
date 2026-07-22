// =====================================================
// NEXOR DIGITAL — main.js
// =====================================================

// ---------- Config ----------
const WHATSAPP_NUMERO = '5521973191403';
const WHATSAPP_MSG = 'Olá! Conheci a Nexor Digital e gostaria de entender como vocês podem ajudar minha empresa a gerar mais oportunidades e clientes.';

// ---------- Analytics helper ----------
// Todos os eventos vão para window.dataLayer (compatível com GTM).
// Se o Meta Pixel estiver instalado, também dispara eventos correspondentes.
function rastrear(evento, dados = {}) {
  window.dataLayer.push({ event: evento, ...dados });
  if (typeof fbq === 'function') {
    if (evento === 'envio_formulario') fbq('track', 'Lead');
    if (evento === 'clique_whatsapp') fbq('trackCustom', 'CliqueWhatsApp', dados);
  }
}

// ---------- WhatsApp ----------
const urlWhats = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(WHATSAPP_MSG)}`;
document.querySelectorAll('.js-whatsapp').forEach((el) => {
  el.setAttribute('href', urlWhats);
  el.setAttribute('target', '_blank');
  el.setAttribute('rel', 'noopener');
  el.addEventListener('click', () => rastrear('clique_whatsapp', { origem: el.dataset.origem || 'desconhecida' }));
});

// ---------- Cliques em CTA ----------
document.querySelectorAll('[data-cta]').forEach((el) => {
  el.addEventListener('click', () => rastrear('clique_cta', { cta: el.dataset.cta }));
});

// ---------- Menu mobile ----------
const nav = document.getElementById('nav');
const toggle = document.getElementById('navToggle');
toggle.addEventListener('click', () => {
  const aberto = nav.classList.toggle('aberto');
  toggle.setAttribute('aria-expanded', aberto);
});
nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
  nav.classList.remove('aberto');
  toggle.setAttribute('aria-expanded', 'false');
}));

// ---------- Animações de entrada + visualização de seções ----------
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('visivel');
      io.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

const secoesVistas = new Set();
const ioSecoes = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    const nome = e.target.dataset.secao;
    if (e.isIntersecting && !secoesVistas.has(nome)) {
      secoesVistas.add(nome);
      rastrear('visualizacao_secao', { secao: nome });
    }
  });
}, { threshold: 0.35 });
document.querySelectorAll('[data-secao]').forEach((el) => ioSecoes.observe(el));

// ---------- Máscara de WhatsApp ----------
const campoWhats = document.getElementById('f-whatsapp');
campoWhats.addEventListener('input', () => {
  let v = campoWhats.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
  else if (v.length > 0) v = `(${v}`;
  campoWhats.value = v;
});

// ---------- Formulário ----------
const form = document.getElementById('formLead');
const erroBox = document.getElementById('formErro');
const botao = document.getElementById('formBotao');
let formIniciado = false;

form.addEventListener('input', () => {
  if (!formIniciado) {
    formIniciado = true;
    rastrear('inicio_formulario');
  }
});

function validar() {
  const erros = [];
  const obrig = [
    ['f-nome', 'Informe seu nome.'],
    ['f-empresa', 'Informe o nome da empresa.'],
    ['f-segmento', 'Informe o segmento.'],
    ['f-cidade', 'Informe a cidade.'],
    ['f-estado', 'Selecione o estado.']
  ];
  form.querySelectorAll('.invalido').forEach((el) => el.classList.remove('invalido'));

  obrig.forEach(([id, msg]) => {
    const el = document.getElementById(id);
    if (!el.value.trim()) { erros.push(msg); el.classList.add('invalido'); }
  });

  const dig = campoWhats.value.replace(/\D/g, '');
  if (dig.length < 10) { erros.push('Informe um WhatsApp válido com DDD.'); campoWhats.classList.add('invalido'); }

  return erros;
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  erroBox.hidden = true;

  const erros = validar();
  if (erros.length) {
    erroBox.textContent = erros[0];
    erroBox.hidden = false;
    return;
  }

  botao.disabled = true;
  botao.textContent = 'Enviando…';

  try {
    const resp = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: document.getElementById('f-nome').value,
        whatsapp: campoWhats.value,
        empresa: document.getElementById('f-empresa').value,
        segmento: document.getElementById('f-segmento').value,
        instagram: document.getElementById('f-instagram').value,
        cidade: document.getElementById('f-cidade').value,
        estado: document.getElementById('f-estado').value,
        website: form.querySelector('.hp').value
      })
    });
    const dados = await resp.json();

    if (resp.ok && dados.ok) {
      rastrear('envio_formulario');
      form.hidden = true;
      const sucesso = document.getElementById('formSucesso');
      sucesso.hidden = false;
      sucesso.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      erroBox.textContent = (dados.erros && dados.erros[0]) || dados.erro || 'Erro ao enviar. Tente novamente.';
      erroBox.hidden = false;
    }
  } catch {
    erroBox.textContent = 'Não foi possível enviar agora. Tente novamente ou fale conosco pelo WhatsApp.';
    erroBox.hidden = false;
  } finally {
    botao.disabled = false;
    botao.textContent = 'Solicitar minha análise';
  }
});

// ---------- Ano no footer ----------
document.getElementById('ano').textContent = new Date().getFullYear();
