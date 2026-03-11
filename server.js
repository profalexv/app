/**
 * server.js
 *
 * Servidor web Express para a versão web do sistema Aula.
 * Expõe a mesma lógica de negócio do app Electron via REST API,
 * e serve os arquivos estáticos do renderer.
 *
 * Uso:
 *   node server.js          → modo produção (porta 3000)
 *   node server.js --dev    → modo desenvolvimento (licenças liberadas)
 *   PORT=8080 node server.js → porta customizada
 *
 * O banco de dados compartilhado com o app Electron fica em:
 *   Linux:   ~/.config/aula/aula.db
 *   macOS:   ~/Library/Application Support/aula/aula.db
 *   Windows: %APPDATA%\aula\aula.db
 */

const express = require('express');
const path = require('path');

// ─── Inicializa o banco de dados ──────────────────────────────────────────────
const { setupDatabase, DB_PATH } = require('./src/db/database-web');
setupDatabase();

// ─── Configura o servidor ─────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 3000;

// Parseia JSON no body das requisições
app.use(express.json());

// CORS simples para desenvolvimento local
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-aula-token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Rota raiz: página institucional ────────────────────────────────────────
// Deve vir ANTES do express.static para não ser interceptada pelo index.html.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'aula', 'index.html'));
});

// ─── Portal de login ─────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'aula', 'login.html'));
});

// ─── AULA.app (App do Professor) ─────────────────────────────────────────────
// Serve o app mobile PWA
app.use('/app', express.static(path.join(__dirname, 'aula-app')));
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'aula-app', 'index.html'));
});

// ─── Rotas da API ─────────────────────────────────────────────────────────────
const apiRouter = require('./src/web/api-routes');
app.use('/api', apiRouter);

// Serve arquivos estáticos da raiz do projeto
// (renderer, módulos, estilos, etc.)
app.use(express.static(path.join(__dirname)));

// ─── Inicia o servidor ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const devMode = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         Aula — Servidor Web                  ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  URL:    http://localhost:${PORT}                ║`);
  console.log(`║  Banco:  ${DB_PATH.slice(-38).padEnd(38)}  ║`);
  console.log(`║  Modo:   ${devMode ? 'desenvolvimento (licenças livres) ' : 'produção                        '}  ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});
