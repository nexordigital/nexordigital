// scripts/create-admin.js — cria (ou atualiza) um usuário administrador
// Uso: npm run create-admin
require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { db } = require('../database');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

function askHidden(q) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(q);
    const onData = (char) => {
      char = char.toString();
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        process.stdout.write('\n');
        resolve(buffer);
      } else if (char === '\u0003') {
        process.exit(1);
      } else if (char === '\u007f') {
        buffer = buffer.slice(0, -1);
      } else {
        buffer += char;
      }
    };
    let buffer = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

(async () => {
  console.log('\n=== Criar administrador — Nexor Digital ===\n');
  const nome = (await ask('Nome: ')).trim();
  const email = (await ask('E-mail (login): ')).trim().toLowerCase();
  const senha = await askHidden('Senha (mín. 8 caracteres, não aparece ao digitar): ');

  if (!nome || !email.includes('@') || senha.length < 8) {
    console.error('\nDados inválidos. Nome e e-mail obrigatórios; senha com no mínimo 8 caracteres.');
    process.exit(1);
  }

  const hash = bcrypt.hashSync(senha, 12);
  db.prepare(`
    INSERT INTO admins (email, nome, senha_hash) VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET nome = excluded.nome, senha_hash = excluded.senha_hash
  `).run(email, nome, hash);

  console.log(`\n✔ Administrador "${nome}" pronto. Login em /admin/login com ${email}.\n`);
  rl.close();
  process.exit(0);
})();
