/**
 * server.js
 *
 * Servidor Express para modo auto-hospedado (planos PRO).
 * Serve os arquivos estáticos do renderer e expõe a API REST.
 * Suporta login com Google e Microsoft (OAuth 2.0) via Passport.js.
 *
 * Uso:
 *   node server.js          → modo produção (porta 3000)
 *   node server.js --dev    → modo desenvolvimento
 *   PORT=8080 node server.js → porta customizada
 *
 * Variáveis de ambiente opcionais para OAuth:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
 *   APP_URL            (ex: https://app.alexandre.pro.br)
 *   SESSION_SECRET     (segredo da sessão — use um valor longo aleatório)
 *
 * Variáveis para e-mail de verificação:
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

'use strict';

// Carrega .env em desenvolvimento (produção usa variáveis de ambiente do sistema)
if (process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config(); } catch (_) { /* dotenv opcional */ }
}

const express      = require('express');
const path         = require('path');
const crypto       = require('crypto');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const session      = require('express-session');
const passport     = require('passport');

const { setupDatabase, getDb } = require('./src/db/database-web');

// ─── Configura o servidor ─────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares globais ──────────────────────────────────────────────────────
// Helmet: cabeçalhos de segurança HTTP (X-Frame-Options, X-Content-Type-Options, etc.)
app.use(helmet({ contentSecurityPolicy: false }));

// O webhook do Mercado Pago precisa do body cru (raw) para verificação HMAC.
// Deve ser registrado ANTES do express.json() global.
app.use('/api/webhooks/mercadopago', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(cookieParser());

// express-session é usado APENAS para guardar o state OAuth (CSRF) durante o
// redirect de autorização. A sessão real da aplicação usa cookie httpOnly próprio.
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 10 * 60 * 1000, sameSite: 'lax', httpOnly: true },
}));

app.use(passport.initialize());
app.use(passport.session());
passport.serializeUser((u, done) => done(null, u));
passport.deserializeUser((u, done) => done(null, u));

// CORS — restrito ao domínio configurado em CORS_ORIGIN.
// Em desenvolvimento (sem a variável), permite qualquer origem.
const corsOrigin = process.env.CORS_ORIGIN || (process.env.NODE_ENV !== 'production' ? '*' : '');
app.use((req, res, next) => {
  if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-aula-token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── AULA.app (App do Professor — PWA) ───────────────────────────────────────
app.use('/app', express.static(path.join(__dirname, 'aula-app')));
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'aula-app', 'index.html'));
});

// ─── Rotas da API ─────────────────────────────────────────────────────────────
const apiRouter = require('./src/web/api-routes');
app.use('/api', apiRouter);

// ─── Arquivos estáticos (renderer, módulos, estilos, etc.) ───────────────────
app.use(express.static(path.join(__dirname)));

// ─── Helper: cria token de sessão e seta cookie httpOnly ─────────────────────
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

async function _createOAuthSession(res, admin) {
  const token = crypto.randomBytes(32).toString('hex');
  await getDb()('admin_sessions').insert({
    school_id: admin.school_id,
    admin_id:  admin.id,
    token,
  });
  res.cookie('aula_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   SESSION_TTL_MS,
  });
  return token;
}

// ─── Helper: localiza ou cria admin via OAuth ─────────────────────────────────
async function _resolveOAuthAdmin(providerId, providerField, email, displayName) {
  const db = getDb();

  // 1. Localizar pelo ID do provedor
  let admin = await db('admins').where({ [providerField]: providerId }).first();

  // 2. Localizar pelo e-mail e vincular o ID
  if (!admin && email) {
    admin = await db('admins').where({ email }).first();
    if (admin) {
      await db('admins').where({ id: admin.id }).update({ [providerField]: providerId });
    }
  }

  // 3. Criar primeiro admin (somente se ainda não houver nenhum)
  if (!admin) {
    const school = await db('schools').first();
    if (!school) return { error: 'no_school' };

    const [{ cnt }] = await db('admins').where({ school_id: school.id }).count('id as cnt');
    if (parseInt(cnt) > 0) return { error: 'not_registered' };

    // Gera username único a partir do e-mail
    let username = (email || displayName || 'user').split('@')[0]
      .replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    let base = username, c = 1;
    while (await db('admins').where({ username }).select('id').first()) {
      username = `${base}${c++}`;
    }

    const [row] = await db('admins').insert({
      school_id:      school.id,
      name:           displayName,
      email:          email || null,
      username,
      password:       '',
      [providerField]: providerId,
      auth_provider:  providerField === 'google_id' ? 'google' : 'microsoft',
      email_verified: true,
      active:         true,
    }).returning('*');
    admin = row;
  }

  if (!admin.active) return { error: 'inactive' };
  return { admin };
}

// ─── Inicia o servidor (DB primeiro, depois OAuth) ────────────────────────────
(async () => {
  await setupDatabase();

  const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
  const CALLBACK_BASE = `${APP_URL}/auth`;

  // ── OAuth: Google ───────────────────────────────────────────────────────────
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

    passport.use(new GoogleStrategy({
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  `${CALLBACK_BASE}/google/callback`,
    }, async (_at, _rt, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const result = await _resolveOAuthAdmin(profile.id, 'google_id', email, profile.displayName);
        if (result.error) return done(null, false, { message: result.error });
        done(null, result.admin);
      } catch (e) { done(e); }
    }));

    app.get('/auth/google',
      passport.authenticate('google', { scope: ['profile', 'email'] }));

    app.get('/auth/google/callback',
      passport.authenticate('google', { session: false, failWithError: true }),
      async (req, res) => {
        try {
          await _createOAuthSession(res, req.user);
          res.redirect('/src/renderer/index.html?auth=ok');
        } catch (e) { res.redirect('/src/renderer/index.html?auth_error=server'); }
      },
      (err, req, res, _next) => {
        const msg = err?.message || 'google';
        res.redirect(`/src/renderer/index.html?auth_error=${encodeURIComponent(msg)}`);
      }
    );

    console.log('  ✓ OAuth Google habilitado');
  }

  // ── OAuth: Microsoft ────────────────────────────────────────────────────────
  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    const MicrosoftStrategy = require('passport-microsoft');

    passport.use(new MicrosoftStrategy({
      clientID:     process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      callbackURL:  `${CALLBACK_BASE}/microsoft/callback`,
      scope:        ['user.read'],
    }, async (_at, _rt, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value
          || profile._json?.mail
          || profile._json?.userPrincipalName;
        const result = await _resolveOAuthAdmin(profile.id, 'microsoft_id', email, profile.displayName);
        if (result.error) return done(null, false, { message: result.error });
        done(null, result.admin);
      } catch (e) { done(e); }
    }));

    app.get('/auth/microsoft',
      passport.authenticate('microsoft'));

    app.get('/auth/microsoft/callback',
      passport.authenticate('microsoft', { session: false, failWithError: true }),
      async (req, res) => {
        try {
          await _createOAuthSession(res, req.user);
          res.redirect('/src/renderer/index.html?auth=ok');
        } catch (e) { res.redirect('/src/renderer/index.html?auth_error=server'); }
      },
      (err, req, res, _next) => {
        const msg = err?.message || 'microsoft';
        res.redirect(`/src/renderer/index.html?auth_error=${encodeURIComponent(msg)}`);
      }
    );

    console.log('  ✓ OAuth Microsoft habilitado');
  }

  // ─── Inicia o servidor ──────────────────────────────────────────────────────
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
