# Nexor Digital — Landing Page + Sistema de Leads

Projeto completo: LP pública de conversão, formulário com validação, banco de dados SQLite, painel administrativo protegido por login, gerenciamento de leads e integração com WhatsApp.

## O que está incluído

```
nexor-digital/
├── server.js              # Servidor Express (LP + API + admin)
├── database.js            # Banco SQLite (schema criado automaticamente)
├── notify.js              # Notificações: e-mail (SMTP) e webhook (n8n/Make)
├── scripts/create-admin.js# Criação do usuário administrador
├── public/                # Landing page pública
│   ├── index.html
│   ├── css/styles.css
│   ├── js/main.js
│   ├── assets/            # logo, favicon, foto
│   ├── politica-de-privacidade.html
│   ├── termos-de-uso.html
│   └── 404.html
├── admin/                 # Painel administrativo (servido só com login)
├── data/                  # Banco SQLite (nexor.db — criado no 1º start)
├── .env.example           # Modelo de configuração
├── Dockerfile
└── docker-compose.yml
```

## Rodando localmente (teste)

Requisitos: Node.js 18+.

```bash
npm install
cp .env.example .env        # edite se quiser; para teste local pode deixar vazio
npm run create-admin        # cria seu login do painel (você define a senha)
npm start
```

- LP: http://localhost:3000
- Painel: http://localhost:3000/admin (login em /admin/login)

## Deploy na VPS (Docker — recomendado)

```bash
# na VPS, dentro da pasta do projeto:
cp .env.example .env
nano .env    # defina SESSION_SECRET (obrigatório em produção) e NODE_ENV=production

docker compose up -d --build

# criar o administrador (uma vez):
docker exec -it nexor-digital node scripts/create-admin.js
```

O app sobe na porta 3000. Aponte seu proxy reverso (Nginx, Traefik ou o que você já usa para o n8n) para `http://localhost:3000` com HTTPS. **HTTPS é obrigatório em produção** — o cookie de sessão do admin só funciona com `NODE_ENV=production` + HTTPS.

Exemplo de bloco Nginx:

```nginx
server {
    server_name nexordigital.com.br;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

(Depois rode `certbot --nginx` para o SSL.)

O banco fica em `./data/nexor.db` no host — faça backup desse arquivo. Atualizações do container não apagam os dados.

## Configurações (.env)

| Variável | O que faz |
|---|---|
| `SESSION_SECRET` | Chave da sessão do admin. **Obrigatória em produção.** Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NODE_ENV` | `production` na VPS |
| `PORT` | Porta (padrão 3000) |
| `SMTP_HOST/PORT/USER/PASS` + `NOTIFY_EMAIL` | Notificação por e-mail a cada novo lead. Só ativa se tudo estiver preenchido. Com Gmail: `smtp.gmail.com`, porta 587, senha de app |
| `WEBHOOK_URL` | A cada novo lead, envia um POST com o JSON do lead. Ideal para n8n: crie um webhook (ex.: `/webhook/novo-lead-nexor`) e cole a URL aqui — a partir daí você automatiza o que quiser (WhatsApp, Telegram, CRM, planilha) |

## Como editar

- **Textos da LP**: `public/index.html` (tudo em HTML simples, seções comentadas)
- **Cores/fontes**: variáveis no topo de `public/css/styles.css` (`--azul`, etc.)
- **Número e mensagem do WhatsApp**: topo de `public/js/main.js`
- **Analytics**: os snippets do GTM / GA4 / Meta Pixel entram no `<head>` de `public/index.html` (bloco comentado). Os eventos já são disparados para `window.dataLayer`: `clique_whatsapp`, `inicio_formulario`, `envio_formulario`, `clique_cta`, `visualizacao_secao`. No GTM, basta criar acionadores de "Evento personalizado" com esses nomes.

## Segurança

- Painel e API admin exigem login (sessão com cookie httpOnly + senha com bcrypt)
- Rate limit no formulário e no login
- Honeypot anti-spam no formulário
- Dados dos leads nunca são expostos publicamente
- Para trocar a senha do admin: rode `npm run create-admin` de novo com o mesmo e-mail

## Status dos leads

`Novo` → `Em contato` → `Qualificado` → `Reunião agendada` → `Cliente` / `Não convertido`

Cada mudança de status fica registrada no histórico do lead, junto com as observações internas.
