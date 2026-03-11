/**
 * server.js
 *
 * Servidor Express para modo auto-hospedado (planos PRO).
 * Serve os arquivos estáticos do renderer e expõe a API REST.
 *
 * Uso:
 *   node server.js          → modo produção (porta 3000)
 *   node server.js --dev    → modo desenvolvimento (licenças liberadas)
 *   PORT=8080 node server.js → porta customizada
 *
 * Em produção hospedada, o motor (Fly.io) serve o frontend diretamente.
 * Este servidor é usado apenas para planos PRO (auto-hospedados via Cloudflare Tunnel).
 */

const express = require('express');
const path = require('path');

const { setupDatabase } = require('./src/db/database-web');

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
(async () => {
  await setupDatabase();

  app.listen(PORT, () => {
    const devMode = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
    const dbUrl   = (process.env.DATABASE_URL || '').replace(/:([^:@]+)@/, ':***@');
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║         Aula — Servidor Web                  ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  URL:    http://localhost:${PORT}                ║`);
    console.log(`║  Banco:  ${dbUrl.slice(-38).padEnd(38)}  ║`);
    console.log(`║  Modo:   ${devMode ? 'desenvolvimento (licenças livres) ' : 'produção                        '}  ║`);
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
  });
})().catch(err => {
  console.error('Falha ao inicializar servidor:', err.message);
  process.exit(1);
});
