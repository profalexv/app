/**
 * src/web/api-routes.js
 *
 * Router Express com todos os endpoints REST.
 * Usa Knex (PostgreSQL) — todos os handlers são async.
 *
 * Respostas: { success: boolean, data?: any, error?: string }
 */

const express    = require('express');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const router     = express.Router();

const { getDb, hashPassword, verifyPassword } = require('../db/database-web');
const { isValidCredentials, isValidPositiveInt, isValidTeacherData, isValidSchoolData } = require('../utils/validators');
const { SubscriptionManager } = require('../utils/subscription-manager');

const AVAILABLE_MODULES = {
  cronograma: { id: 'cronograma', name: 'Cronograma',        description: 'Criação e gerenciamento de grades de horários escolares.',        icon: '📅' },
  aula:       { id: 'aula',       name: 'Registro de Aulas', description: 'Registro e controle de aulas ministradas por professor.',          icon: '📝' },
  plano:      { id: 'plano',      name: 'Plano de Aula',     description: 'Criação e gerenciamento de planos de aula estruturados.',           icon: '📋' },
};

const SESSION_TTL_HOURS = 8;
const DEV_MODE = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

function generateToken() { return crypto.randomBytes(32).toString('hex'); }
function ok(res, data)   { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)     { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

function setSessionCookie(res) {
  return (token) => {
    res.cookie('aula_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      maxAge:   SESSION_TTL_HOURS * 60 * 60 * 1000,
    });
    return token;
  };
}

async function sendVerificationEmail(email, name, token) {
  if (!process.env.SMTP_HOST) return;
  const transport = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  await transport.sendMail({
    from:    process.env.SMTP_FROM || process.env.SMTP_USER,
    to:      email,
    subject: 'Confirme seu e-mail — Aula',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#2a5298">🎓 Aula — Confirme seu e-mail</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Clique no botão abaixo para verificar seu e-mail e ativar sua conta:</p>
        <p style="text-align:center;margin:32px 0">
          <a href="${appUrl}/api/auth/verify-email/${token}"
             style="background:#3498db;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600">
            Verificar e-mail
          </a>
        </p>
        <p style="color:#888;font-size:13px">O link expira em 24 horas.<br>Se você não solicitou este cadastro, ignore este e-mail.</p>
      </div>
    `,
  });
}

// ─── Informações do servidor ────────────────────────────────────────────────
router.get('/app/dataPath', (req, res) => {
  const url = process.env.DATABASE_URL || '';
  ok(res, url.replace(/:([^:@]+)@/, ':***@')); // mascara senha
});

router.get('/health', (req, res) => {
  res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString(), version: '1.0.0' });
});

router.get('/server-info', async (req, res) => {
  try {
    const db = getDb();
    const [[{ cnt: users }], [{ cnt: schools }], [{ cnt: classes }]] = await Promise.all([
      db('teachers').count('id as cnt'),
      db('schools').count('id as cnt'),
      db('classes').count('id as cnt')
    ]);

    const serverType = process.env.SERVER_TYPE || 'local';
    const isCloud    = serverType === 'cloud' || !!process.env.CLOUD_PROVIDER;

    ok(res, {
      serverType, version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      health: { status: 'healthy', database: 'ok', storage: 'ok' },
      statistics: { users: parseInt(users), schools: parseInt(schools), classes: parseInt(classes) },
      features: { offlineMode: !isCloud, pushNotifications: true, advancedReports: isCloud, multiTenant: true },
      configuration: { mode: process.env.NODE_ENV || 'production', https: !!process.env.HTTPS_ENABLED, cors: process.env.CORS_ORIGIN || '*' }
    });
  } catch (e) { fail(res, `Erro ao obter informações do servidor: ${e.message}`, 500); }
});

router.get('/server-endpoints', (req, res) => {
  const serverType  = process.env.SERVER_TYPE || 'local';
  const currentUrl  = `${req.protocol}://${req.get('host')}`;
  const endpoints   = [{ type: serverType, url: currentUrl, latency: 0, priority: serverType === 'local' ? 1 : 2, available: true }];
  ok(res, { current: { type: serverType, url: currentUrl, latency: 0 }, available: endpoints });
});

// ════════════════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO
// ════════════════════════════════════════════════════════════════════════════

// GET /auth/providers — provedores OAuth configurados
router.get('/auth/providers', (req, res) => {
  res.json({
    success: true,
    data: {
      google:    !!(process.env.GOOGLE_CLIENT_ID    && process.env.GOOGLE_CLIENT_SECRET),
      microsoft: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    },
  });
});

// GET /auth/me — verifica sessão via cookie httpOnly
router.get('/auth/me', async (req, res) => {
  try {
    const token = req.cookies?.aula_session;
    if (!token) return res.json({ success: true, authenticated: false });

    await getDb()('admin_sessions')
      .whereRaw(`created_at < NOW() - INTERVAL '${SESSION_TTL_HOURS} hours'`).del();

    const session = await getDb()('admin_sessions')
      .where({ token }).select('admin_id', 'school_id').first();
    if (!session) return res.json({ success: true, authenticated: false });

    const admin = await getDb()('admins')
      .where({ id: session.admin_id, active: true })
      .select('id', 'name', 'username', 'email').first();
    if (!admin) return res.json({ success: true, authenticated: false });

    res.json({
      success: true,
      authenticated: true,
      token,
      admin: { id: admin.id, name: admin.name, username: admin.username, email: admin.email, role: 'admin', schoolId: session.school_id },
    });
  } catch (e) { fail(res, e.message, 500); }
});

// POST /auth/register — cadastro por e-mail com verificação
router.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password?.trim())
      return fail(res, 'Nome, e-mail e senha são obrigatórios.');
    if (password.length < 6)
      return fail(res, 'Senha deve ter pelo menos 6 caracteres.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return fail(res, 'E-mail inválido.');

    const school = await getDb()('schools').first();
    if (!school) return fail(res, 'Nenhuma escola configurada. Configure a escola primeiro.');

    const existing = await getDb()('admins').where({ email: email.trim() }).first();
    if (existing) return fail(res, 'Este e-mail já está cadastrado.');

    const hashed = await hashPassword(password);
    let username = email.trim().split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    let base = username, c = 1;
    while (await getDb()('admins').where({ username }).select('id').first()) {
      username = `${base}${c++}`;
    }

    const [row] = await getDb()('admins').insert({
      school_id: school.id, name: name.trim(), email: email.trim(), username,
      password: hashed, auth_provider: 'local', email_verified: false, active: true,
    }).returning('id');
    const adminId = row.id ?? row;

    const verifyToken = generateToken();
    await getDb()('email_verification_tokens').insert({ admin_id: adminId, token: verifyToken });

    sendVerificationEmail(email.trim(), name.trim(), verifyToken)
      .catch(err => console.warn('[AUTH] Falha ao enviar e-mail de verificação:', err.message));

    ok(res, { requiresVerification: true });
  } catch (e) { fail(res, e.message, 500); }
});

// GET /auth/verify-email/:token — confirma e-mail após clique no link
router.get('/auth/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token?.match(/^[a-f0-9]{64}$/i))
      return res.redirect('/src/renderer/index.html?auth_error=invalid_token');

    const row = await getDb()('email_verification_tokens').where({ token }).first();
    if (!row) return res.redirect('/src/renderer/index.html?auth_error=invalid_token');

    await getDb()('admins').where({ id: row.admin_id }).update({ email_verified: true });
    await getDb()('email_verification_tokens').where({ token }).del();

    res.redirect('/src/renderer/index.html?email_verified=1');
  } catch (e) { res.redirect('/src/renderer/index.html?auth_error=server'); }
});

router.get('/auth/checkFirstAdmin/:schoolId', async (req, res) => {
  try {
    const schoolId = intParam(req.params.schoolId);
    if (!schoolId) return fail(res, 'School ID inválido.');
    const admin = await getDb()('admins').where({ school_id: schoolId }).select('id').first();
    res.json({ success: true, hasAdmin: !!admin });
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/registerFirstAdmin', async (req, res) => {
  try {
    const { schoolId, name, username, password } = req.body;
    if (!intParam(schoolId) || !name?.trim() || !isValidCredentials(username, password))
      return fail(res, 'Dados inválidos.');

    const existing = await getDb()('admins').where({ school_id: schoolId }).select('id').first();
    if (existing) return fail(res, 'Já existe um admin cadastrado para esta escola.');

    const hashed = await hashPassword(password);
    const [row] = await getDb()('admins').insert({
      school_id: schoolId, name: name.trim(), username: username.trim(),
      password: hashed, auth_provider: 'local', email_verified: false, active: true,
    }).returning('id');
    const adminId = row.id ?? row;

    const token = generateToken();
    await getDb()('admin_sessions').insert({ school_id: schoolId, admin_id: adminId, token });
    setSessionCookie(res)(token);

    res.json({ success: true, data: { token, admin: { id: adminId, name: name.trim(), username: username.trim(), role: 'admin', schoolId } } });
  } catch (e) {
    fail(res, e.message?.includes('unique') || e.message?.includes('UNIQUE') ? 'Nome de usuário já existe.' : e.message);
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { schoolId, username, password } = req.body;
    if (!intParam(schoolId) || !username?.trim() || !password?.trim()) return fail(res, 'Credenciais inválidas.');

    const input = username.trim();
    let admin;

    if (input.includes('@')) {
      // Login por e-mail
      admin = await getDb()('admins')
        .where({ school_id: schoolId, email: input })
        .select('id', 'name', 'username', 'email', 'active', 'password', 'email_verified', 'auth_provider').first();
      if (admin && admin.email_verified === false)
        return fail(res, 'E-mail não verificado. Cheque sua caixa de entrada.');
    } else {
      // Login por usuário (legado)
      admin = await getDb()('admins')
        .where({ school_id: schoolId, username: input })
        .select('id', 'name', 'username', 'email', 'active', 'password', 'email_verified', 'auth_provider').first();
    }

    if (!admin) return fail(res, 'Usuário ou senha incorretos.');
    if (!admin.active) return fail(res, 'Usuário inativo.');
    if (!admin.password)
      return fail(res, 'Esta conta usa login externo (Google/Microsoft). Clique no botão correspondente.');

    const valid = await verifyPassword(password, admin.password);
    if (!valid) return fail(res, 'Usuário ou senha incorretos.');

    // Limpa sessões expiradas
    await getDb()('admin_sessions')
      .whereRaw(`created_at < NOW() - INTERVAL '${SESSION_TTL_HOURS} hours'`).del();

    const token = generateToken();
    await getDb()('admin_sessions').insert({ school_id: schoolId, admin_id: admin.id, token });
    setSessionCookie(res)(token);

    res.json({ success: true, data: { token, admin: { id: admin.id, name: admin.name, username: admin.username, email: admin.email, role: 'admin', schoolId } } });
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/verifySession', async (req, res) => {
  try {
    const { schoolId, token } = req.body;
    if (!intParam(schoolId) || !token?.trim()) return res.json({ success: true, valid: false });

    await getDb()('admin_sessions')
      .whereRaw(`created_at < NOW() - INTERVAL '${SESSION_TTL_HOURS} hours'`).del();

    const session = await getDb()('admin_sessions')
      .where({ school_id: schoolId, token })
      .whereRaw(`created_at >= NOW() - INTERVAL '${SESSION_TTL_HOURS} hours'`)
      .select('admin_id').first();

    if (!session) return res.json({ success: true, valid: false });

    const admin = await getDb()('admins').where({ id: session.admin_id, active: true })
      .select('id', 'name', 'username').first();
    if (!admin) return res.json({ success: true, valid: false });

    res.json({ success: true, valid: true, admin: { id: admin.id, name: admin.name, username: admin.username, role: 'admin', schoolId } });
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/logout', async (req, res) => {
  try {
    const bodyToken  = req.body.token;
    const cookieToken = req.cookies?.aula_session;
    const tokens = [...new Set([bodyToken, cookieToken].filter(Boolean))];
    for (const t of tokens) await getDb()('admin_sessions').where({ token: t }).del();
    res.clearCookie('aula_session');
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/deactivateAdmin', async (req, res) => {
  try {
    const { adminId } = req.body;
    if (!intParam(adminId)) return fail(res, 'ID inválido.');
    const admin = await getDb()('admins').where({ id: adminId }).select('school_id').first();
    if (!admin) return fail(res, 'Admin não encontrado.');
    const [{ cnt }] = await getDb()('admins').where({ school_id: admin.school_id, active: true }).count('id as cnt');
    if (parseInt(cnt) <= 1) return fail(res, 'Não é possível desativar o único admin ativo da escola.');
    await getDb()('admins').where({ id: adminId }).update({ active: false });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/activateAdmin', async (req, res) => {
  try {
    const { adminId } = req.body;
    if (!intParam(adminId)) return fail(res, 'ID inválido.');
    await getDb()('admins').where({ id: adminId }).update({ active: true });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/deactivateTeacher', async (req, res) => {
  try {
    const { teacherId } = req.body;
    if (!intParam(teacherId)) return fail(res, 'ID inválido.');
    await getDb()('teachers').where({ id: teacherId }).update({ active: false });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/activateTeacher', async (req, res) => {
  try {
    const { teacherId } = req.body;
    if (!intParam(teacherId)) return fail(res, 'ID inválido.');
    await getDb()('teachers').where({ id: teacherId }).update({ active: true });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/promoteTeacherToAdmin', async (req, res) => {
  try {
    const { teacherId, password } = req.body;
    if (!intParam(teacherId) || !password?.trim()) return fail(res, 'Dados inválidos.');

    const teacher = await getDb()('teachers').where({ id: teacherId }).select('id', 'school_id', 'name', 'email').first();
    if (!teacher) return fail(res, 'Professor não encontrado.');

    let username = teacher.email?.split('@')[0] || teacher.name.replace(/\s+/g, '').toLowerCase();
    let base = username, counter = 1;
    while (await getDb()('admins').where({ username }).select('id').first()) {
      username = `${base}${counter++}`;
    }

    const hashed = await hashPassword(password);
    const [row] = await getDb()('admins').insert({
      school_id: teacher.school_id, name: teacher.name, username, password: hashed, active: true
    }).returning('id');
    const adminId = row.id ?? row;

    ok(res, { adminId, username });
  } catch (e) {
    fail(res, e.message?.includes('unique') || e.message?.includes('UNIQUE') ? 'Nome de usuário já existe.' : e.message);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// SUPERADMINS
// ════════════════════════════════════════════════════════════════════════════

router.get('/superadmins', async (req, res) => {
  try {
    const rows = await getDb()('superadmins').select('id', 'name', 'username', 'created_at');
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/superadmins', async (req, res) => {
  try {
    const { name, username, password } = req.body;
    if (!name?.trim() || !isValidCredentials(username, password))
      return fail(res, 'Nome, usuário e senha são obrigatórios. Senha deve ter pelo menos 6 caracteres.');
    const hashed = await hashPassword(password);
    const [row] = await getDb()('superadmins').insert({ name: name.trim(), username: username.trim(), password: hashed }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) {
    fail(res, e.message?.includes('unique') || e.message?.includes('UNIQUE') ? 'Nome de usuário já existe.' : e.message);
  }
});

router.post('/superadmins/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!isValidCredentials(username, password)) return fail(res, 'Usuário e senha são obrigatórios.');
    const row = await getDb()('superadmins').where({ username: username.trim() }).first();
    if (!row) return fail(res, 'Usuário ou senha incorretos.');
    const valid = await verifyPassword(password, row.password);
    if (!valid) return fail(res, 'Usuário ou senha incorretos.');
    const { password: _, ...safe } = row;
    ok(res, safe);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/superadmins/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('superadmins').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// ESCOLAS
// ════════════════════════════════════════════════════════════════════════════

router.get('/schools', async (req, res) => {
  try {
    ok(res, await getDb()('schools').orderBy('name'));
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/schools', async (req, res) => {
  try {
    if (!isValidSchoolData(req.body)) return fail(res, 'Dados da escola inválidos.');
    const { name, acronym = '', address = '', cnpj = '', inep_code = '' } = req.body;
    const [row] = await getDb()('schools').insert({
      name: name.trim(), acronym: acronym.trim(), address: address.trim(), cnpj: cnpj.trim(), inep_code: inep_code.trim()
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/schools/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id || !isValidSchoolData(req.body)) return fail(res, 'Dados inválidos.');
    const { name, acronym = '', address = '', cnpj = '', inep_code = '' } = req.body;
    await getDb()('schools').where({ id }).update({
      name: name.trim(), acronym: acronym.trim(), address: address.trim(), cnpj: cnpj.trim(), inep_code: inep_code.trim()
    });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/schools/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('schools').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// ADMINS
// ════════════════════════════════════════════════════════════════════════════

router.get('/admins', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('admins').select('id', 'school_id', 'name', 'username', 'active', 'created_at');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/admins', async (req, res) => {
  try {
    const { school_id, name, username, password } = req.body;
    if (!intParam(school_id) || !name?.trim() || !isValidCredentials(username, password))
      return fail(res, 'Dados inválidos.');
    const hashed = await hashPassword(password);
    const [row] = await getDb()('admins').insert({
      school_id, name: name.trim(), username: username.trim(), password: hashed
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) {
    fail(res, e.message?.includes('unique') || e.message?.includes('UNIQUE') ? 'Nome de usuário já existe.' : e.message);
  }
});

router.delete('/admins/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('admins').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/admins/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!isValidCredentials(username, password)) return fail(res, 'Dados inválidos.');
    const admin = await getDb()('admins')
      .where({ username: username.trim() })
      .select('id, name, username, school_id, password')
      .first();
    if (!admin) return fail(res, 'Usuário ou senha incorretos.');
    const valid = await verifyPassword(password, admin.password);
    if (!valid) return fail(res, 'Usuário ou senha incorretos.');
    const school = await getDb()('schools').where({ id: admin.school_id }).select('name').first();
    const { password: _, ...safe } = { ...admin, school_name: school?.name ?? null };
    ok(res, safe);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// PROFESSORES
// ════════════════════════════════════════════════════════════════════════════

router.get('/teachers', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('teachers').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/teachers', async (req, res) => {
  try {
    const { school_id, name, registration = '', email = '', subjects = '' } = req.body;
    if (!intParam(school_id) || !isValidTeacherData({ name, email, registration }))
      return fail(res, 'Dados inválidos.');

    const sm = new SubscriptionManager(getDb());
    const check = await sm.canCreateTeacher(school_id);
    if (!check.allowed) return fail(res, check.reason, 403);

    const [row] = await getDb()('teachers').insert({
      school_id, name: name.trim(), registration: registration.trim(), email: email.trim(), subjects
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/teachers/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id || !isValidTeacherData(req.body)) return fail(res, 'Dados inválidos.');
    const { name, registration = '', email = '', subjects = '' } = req.body;
    await getDb()('teachers').where({ id }).update({
      name: name.trim(), registration: registration.trim(), email: email.trim(), subjects
    });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/teachers/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('teachers').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.get('/teachers/:id/availability', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const rows = await getDb()('teacher_availability').where({ teacher_id: id }).orderBy(['weekday', 'period']).select('weekday', 'period');
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/teachers/:id/availability', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const slots = req.body.slots;
    if (!id || !Array.isArray(slots)) return fail(res, 'Dados inválidos.');

    await getDb().transaction(async trx => {
      await trx('teacher_availability').where({ teacher_id: id }).del();
      const valid = slots.filter(s => intParam(s.weekday) && intParam(s.period));
      if (valid.length > 0) {
        await trx('teacher_availability').insert(valid.map(s => ({ teacher_id: id, weekday: s.weekday, period: s.period })));
      }
    });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// CRONOGRAMAS
// ════════════════════════════════════════════════════════════════════════════

router.get('/schedules', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('schedules').orderBy([{ column: 'year', order: 'desc' }, { column: 'semester', order: 'desc' }]);
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/schedules', async (req, res) => {
  try {
    const { school_id, name, year, semester } = req.body;
    if (!intParam(school_id) || !name?.trim() || !intParam(year) || !intParam(semester))
      return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('schedules').insert({ school_id, name: name.trim(), year, semester }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/schedules/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name, year, semester, active } = req.body;
    if (!id || !name?.trim() || !intParam(year) || !intParam(semester)) return fail(res, 'Dados inválidos.');
    await getDb()('schedules').where({ id }).update({ name: name.trim(), year, semester, active: !!active });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/schedules/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('schedules').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// AULAS
// ════════════════════════════════════════════════════════════════════════════

router.get('/lessons', async (req, res) => {
  try {
    const scheduleId = intParam(req.query.scheduleId);
    if (!scheduleId) return fail(res, 'scheduleId obrigatório.');
    const lessons = await getDb()('lessons')
      .where({ schedule_id: scheduleId })
      .orderBy('weekday').orderBy('period')
      .select('id', 'schedule_id', 'resource_id', 'teacher_id', 'weekday', 'period', 'subject', 'classroom', 'notes', 'created_at');
    // Busca nomes dos professores vinculados para enriquecer a resposta
    const teacherIds = [...new Set(lessons.map(l => l.teacher_id).filter(Boolean))];
    const teacherMap = {};
    if (teacherIds.length) {
      const teachers = await getDb()('teachers').whereIn('id', teacherIds).select('id', 'name');
      teachers.forEach(t => { teacherMap[t.id] = t.name; });
    }
    const rows = lessons.map(l => ({ ...l, teacher_name: teacherMap[l.teacher_id] ?? null }));
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/lessons', async (req, res) => {
  try {
    const { schedule_id, resource_id = null, teacher_id = null, weekday, period, subject, classroom = '', notes = '' } = req.body;
    if (!intParam(schedule_id) || !intParam(weekday) || !intParam(period) || !subject?.trim())
      return fail(res, 'Dados inválidos.');

    if (resource_id) {
      const conflict = await getDb()('lessons').where({ schedule_id, resource_id, weekday, period }).select('id').first();
      if (conflict) return fail(res, 'Este recurso já está ocupado neste período.');
    }
    if (teacher_id) {
      const conflict = await getDb()('lessons')
        .where({ schedule_id, teacher_id, weekday, period })
        .select('id', 'resource_id').first();
      if (conflict) {
        const resource = conflict.resource_id
          ? await getDb()('resources').where({ id: conflict.resource_id }).select('name').first()
          : null;
        const where = resource?.name ? ` (${resource.name})` : '';
        return fail(res, `Professor já possui agendamento neste período${where}.`);
      }
    }

    const [row] = await getDb()('lessons').insert({
      schedule_id, resource_id, teacher_id, weekday, period,
      subject: subject.trim(), classroom: classroom.trim(), notes
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message); }
});

router.put('/lessons/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { schedule_id, resource_id = null, teacher_id = null, weekday, period, subject, classroom = '', notes = '' } = req.body;
    if (!id || !intParam(weekday) || !intParam(period) || !subject?.trim()) return fail(res, 'Dados inválidos.');

    if (resource_id && schedule_id) {
      const conflict = await getDb()('lessons').where({ schedule_id, resource_id, weekday, period }).whereNot({ id }).select('id').first();
      if (conflict) return fail(res, 'Este recurso já está ocupado neste período.');
    }
    if (teacher_id && schedule_id) {
      const conflict = await getDb()('lessons')
        .where({ schedule_id, teacher_id, weekday, period })
        .whereNot({ id })
        .select('id, resource_id')
        .first();
      if (conflict) {
        const resource = conflict.resource_id
          ? await getDb()('resources').where({ id: conflict.resource_id }).select('name').first()
          : null;
        const where = resource?.name ? ` (${resource.name})` : '';
        return fail(res, `Professor já possui agendamento neste período${where}.`);
      }
    }

    await getDb()('lessons').where({ id }).update({ teacher_id, weekday, period, subject: subject.trim(), classroom: classroom.trim(), notes });
    ok(res);
  } catch (e) { fail(res, e.message); }
});

router.delete('/lessons/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('lessons').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// PLANOS DE AULA
// ════════════════════════════════════════════════════════════════════════════

router.get('/lesson-plans', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    if (!schoolId) return fail(res, 'School ID é obrigatório.', 400);

    const sm = new SubscriptionManager(getDb());
    if (!await sm.hasFeature(schoolId, 'plano_aula'))
      return fail(res, 'Recurso indisponível no seu plano. Faça upgrade para acessar planos de aula.', 403);

    const rows = await getDb()('lesson_plans').where({ school_id: schoolId }).orderBy('created_at', 'desc');
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/lesson-plans', async (req, res) => {
  try {
    const { school_id, teacher_id = null, subject, title, objectives = '', content = '', methodology = '', resources = '', evaluation = '', duration_minutes = null, date = null } = req.body;
    if (!intParam(school_id) || !subject?.trim() || !title?.trim()) return fail(res, 'Dados inválidos.');

    const sm = new SubscriptionManager(getDb());
    if (!await sm.hasFeature(school_id, 'plano_aula'))
      return fail(res, 'Recurso indisponível no seu plano. Faça upgrade para acessar planos de aula.', 403);

    const [row] = await getDb()('lesson_plans').insert({
      school_id, teacher_id, subject: subject.trim(), title: title.trim(),
      objectives, content, methodology, resources, evaluation, duration_minutes, date
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/lesson-plans/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const { teacher_id = null, subject, title, objectives = '', content = '', methodology = '', resources = '', evaluation = '', duration_minutes = null, date = null } = req.body;
    if (!subject?.trim() || !title?.trim()) return fail(res, 'Dados inválidos.');
    await getDb()('lesson_plans').where({ id }).update({
      teacher_id, subject: subject.trim(), title: title.trim(),
      objectives, content, methodology, resources, evaluation, duration_minutes, date
    });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/lesson-plans/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('lesson_plans').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// RECURSOS
// ════════════════════════════════════════════════════════════════════════════

router.get('/resources', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('resources').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/resources', async (req, res) => {
  try {
    const { school_id, name, type, capacity = null, description = '' } = req.body;
    if (!intParam(school_id) || !name?.trim() || !type?.trim()) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('resources').insert({
      school_id, name: name.trim(), type: type.trim(), capacity, description: description.trim()
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/resources/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name, type, capacity, description } = req.body;
    if (!id || !name?.trim() || !type?.trim()) return fail(res, 'Dados inválidos.');
    await getDb()('resources').where({ id }).update({ name: name.trim(), type: type.trim(), capacity, description: description?.trim() || '' });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/resources/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('resources').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// TURNOS
// ════════════════════════════════════════════════════════════════════════════

router.get('/shifts', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('shifts').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/shifts', async (req, res) => {
  try {
    const { school_id, name } = req.body;
    if (!intParam(school_id) || !name?.trim()) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('shifts').insert({ school_id, name: name.trim() }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/shifts/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name } = req.body;
    if (!id || !name?.trim()) return fail(res, 'Dados inválidos.');
    await getDb()('shifts').where({ id }).update({ name: name.trim() });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/shifts/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('shifts').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// TURMAS
// ════════════════════════════════════════════════════════════════════════════

router.get('/classes', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('classes').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/classes', async (req, res) => {
  try {
    const { school_id, shift_id, name, year } = req.body;
    if (!intParam(school_id) || !intParam(shift_id) || !name?.trim()) return fail(res, 'Dados inválidos.');

    const sm = new SubscriptionManager(getDb());
    const check = await sm.canCreateClass(school_id);
    if (!check.allowed) return fail(res, check.reason, 403);

    const [row] = await getDb()('classes').insert({ school_id, shift_id, name: name.trim(), year }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/classes/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name, year } = req.body;
    if (!id || !name?.trim()) return fail(res, 'Dados inválidos.');
    await getDb()('classes').where({ id }).update({ name: name.trim(), year });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/classes/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('classes').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTES CURRICULARES
// ════════════════════════════════════════════════════════════════════════════

router.get('/curricula', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('curricula').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/curricula', async (req, res) => {
  try {
    const { school_id, name, code = '', description = '' } = req.body;
    if (!intParam(school_id) || !name?.trim()) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('curricula').insert({
      school_id, name: name.trim(), code: code.trim(), description: description.trim()
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/curricula/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name, code, description } = req.body;
    if (!id || !name?.trim()) return fail(res, 'Dados inválidos.');
    await getDb()('curricula').where({ id }).update({ name: name.trim(), code: code?.trim() || '', description: description?.trim() || '' });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/curricula/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('curricula').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// HORÁRIOS (TIME SLOTS)
// ════════════════════════════════════════════════════════════════════════════

router.get('/time-slots', async (req, res) => {
  try {
    const shiftId = intParam(req.query.shiftId);
    const q = getDb()('time_slots').orderBy('period');
    if (shiftId) q.where({ shift_id: shiftId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/time-slots', async (req, res) => {
  try {
    const { shift_id, period, start_time = null, end_time = null } = req.body;
    if (!intParam(shift_id) || !intParam(period)) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('time_slots').insert({ shift_id, period, start_time, end_time }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/time-slots/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { period, start_time = null, end_time = null } = req.body;
    if (!id || !intParam(period)) return fail(res, 'Dados inválidos.');
    await getDb()('time_slots').where({ id }).update({ period, start_time, end_time });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/time-slots/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('time_slots').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// GRADE: COMPONENTES POR TURMA
// ════════════════════════════════════════════════════════════════════════════

router.get('/class-curricula', async (req, res) => {
  try {
    const classId = intParam(req.query.classId);
    if (!classId) return fail(res, 'classId obrigatório.');
    ok(res, await getDb()('class_curricula').where({ class_id: classId }));
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/class-curricula', async (req, res) => {
  try {
    const { class_id, curricula_id, weekly_lessons = 0, modalities = [] } = req.body;
    if (!intParam(class_id) || !intParam(curricula_id)) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('class_curricula').insert({
      class_id, curricula_id,
      weekly_lessons: parseInt(weekly_lessons) || 0,
      modalities: JSON.stringify(modalities),
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) {
    fail(res, e.message?.includes('unique') || e.message?.includes('UNIQUE') ? 'Componente já associado à turma.' : e.message);
  }
});

router.put('/class-curricula/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const { weekly_lessons = 0, modalities = [] } = req.body;
    await getDb()('class_curricula').where({ id }).update({
      weekly_lessons: parseInt(weekly_lessons) || 0,
      modalities: JSON.stringify(modalities),
    });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/class-curricula/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('class_curricula').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// PROFESSOR POR COMPONENTE E TURMA
// ════════════════════════════════════════════════════════════════════════════

router.get('/class-teacher-curricula', async (req, res) => {
  try {
    const classId = intParam(req.query.classId);
    if (!classId) return fail(res, 'classId obrigatório.');
    ok(res, await getDb()('class_teacher_curricula').where({ class_id: classId }));
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/class-teacher-curricula', async (req, res) => {
  try {
    const { class_id, curricula_id, teacher_id } = req.body;
    if (!intParam(class_id) || !intParam(curricula_id) || !intParam(teacher_id)) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('class_teacher_curricula').insert({ class_id, curricula_id, teacher_id }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) {
    fail(res, e.message?.includes('unique') || e.message?.includes('UNIQUE') ? 'Associação já existe.' : e.message);
  }
});

router.delete('/class-teacher-curricula/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('class_teacher_curricula').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// DIAS DE TRABALHO DO PROFESSOR
// ════════════════════════════════════════════════════════════════════════════

router.get('/teacher-days/:teacherId', async (req, res) => {
  try {
    const id = intParam(req.params.teacherId);
    if (!id) return fail(res, 'ID inválido.');
    ok(res, await getDb()('teacher_days').where({ teacher_id: id }).orderBy('weekday'));
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/teacher-days', async (req, res) => {
  try {
    const { teacher_id, weekday } = req.body;
    if (!intParam(teacher_id) || !intParam(weekday)) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('teacher_days').insert({ teacher_id, weekday }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) {
    fail(res, e.message?.includes('unique') || e.message?.includes('UNIQUE') ? 'Dia já cadastrado.' : e.message);
  }
});

router.delete('/teacher-days/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('teacher_days').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// LICENÇAS
// ════════════════════════════════════════════════════════════════════════════

router.get('/licenses/status', async (req, res) => {
  try {
    if (DEV_MODE) {
      const data = Object.fromEntries(
        Object.entries(AVAILABLE_MODULES).map(([id, mod]) => [id, { ...mod, licensed: true, devMode: true, expiresAt: null }])
      );
      return ok(res, data);
    }

    const rows = await getDb()('licenses').select('module_id', 'expires_at');
    const licenseMap = Object.fromEntries(rows.map(r => [r.module_id, r]));
    const data = Object.fromEntries(
      Object.entries(AVAILABLE_MODULES).map(([id, mod]) => {
        const lic = licenseMap[id];
        const isExpired = lic?.expires_at ? new Date(lic.expires_at) < new Date() : false;
        return [id, { ...mod, licensed: !!lic && !isExpired, expiresAt: lic?.expires_at ?? null }];
      })
    );
    ok(res, data);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/licenses/activate', async (req, res) => {
  try {
    const { moduleId, licenseKey } = req.body;
    if (!AVAILABLE_MODULES[moduleId]) return fail(res, 'Módulo inválido.');
    const pattern = new RegExp(`^AULA-${moduleId.toUpperCase()}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`, 'i');
    if (!pattern.test(licenseKey?.trim() || ''))
      return fail(res, 'Chave de licença inválida. Formato esperado: AULA-MODULO-XXXX-XXXX-XXXX');

    const { error: upsertErr } = await getDb().upsert(
      'licenses',
      { module_id: moduleId, license_key: licenseKey.trim().toUpperCase(), expires_at: null },
      { onConflict: 'module_id' }
    );
    if (upsertErr) throw new Error(upsertErr.message);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/licenses/deactivate', async (req, res) => {
  try {
    const { moduleId } = req.body;
    await getDb()('licenses').where({ module_id: moduleId }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// APP PROFESSOR - AULA.app
// ════════════════════════════════════════════════════════════════════════════

router.get('/teachers/:id/lessons', async (req, res) => {
  try {
    const teacherId = intParam(req.params.id);
    if (!teacherId) return fail(res, 'Professor ID inválido.');

    const { data: rows, error: rpcErr } = await getDb().rpc('app_get_teacher_schedule', { p_teacher_id: teacherId });
    if (rpcErr) throw new Error(rpcErr.message);
    ok(res, rows || []);
  } catch (e) { fail(res, 'Erro ao carregar horários: ' + e.message, 500); }
});

router.get('/classes/:id/lessons', async (req, res) => {
  try {
    const classId = intParam(req.params.id);
    if (!classId) return fail(res, 'Turma ID inválido.');

    const { data: rows, error: rpcErr } = await getDb().rpc('app_get_class_schedule', { p_class_id: classId });
    if (rpcErr) throw new Error(rpcErr.message);
    ok(res, rows || []);
  } catch (e) { fail(res, 'Erro ao carregar horários: ' + e.message, 500); }
});

router.get('/schools/:schoolId/classes', async (req, res) => {
  try {
    const schoolId = intParam(req.params.schoolId);
    if (!schoolId) return fail(res, 'Escola ID inválido.');
    const classes = await getDb()('classes').where({ school_id: schoolId }).orderBy('name').select('id, name, year, shift_id');
    const shiftIds = [...new Set(classes.filter(c => c.shift_id).map(c => c.shift_id))];
    const shifts  = shiftIds.length ? await getDb()('shifts').whereIn('id', shiftIds).select('id, name') : [];
    const shiftMap = Object.fromEntries(shifts.map(s => [s.id, s.name]));
    ok(res, classes.map(c => ({ ...c, shift_name: shiftMap[c.shift_id] ?? null })));
  } catch (e) { fail(res, 'Erro ao carregar turmas: ' + e.message, 500); }
});

router.get('/schools/:schoolId/resources', async (req, res) => {
  try {
    const schoolId = intParam(req.params.schoolId);
    if (!schoolId) return fail(res, 'Escola ID inválido.');
    const rows = await getDb()('resources')
      .where({ school_id: schoolId })
      .orderBy(['type', 'name'])
      .select('id', 'name', 'type', 'capacity', 'description');
    ok(res, rows);
  } catch (e) { fail(res, 'Erro ao carregar recursos: ' + e.message, 500); }
});

router.post('/bookings', async (req, res) => {
  try {
    const { resource_id, teacher_id, class_id, weekday, period, date, description } = req.body;
    if (!intParam(resource_id) || !intParam(teacher_id) || !intParam(class_id))
      return fail(res, 'Dados inválidos.');

    const existing = await getDb()('bookings')
      .where({ resource_id, weekday, period, date }).select('id').first();
    if (existing) return fail(res, 'Este recurso já está agendado neste horário.');

    const [row] = await getDb()('bookings').insert({
      resource_id, teacher_id, class_id, weekday, period, date,
      description: description || '', status: 'confirmado'
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, 'Erro ao agendar recurso: ' + e.message, 500); }
});

router.get('/bookings/teacher/:teacherId', async (req, res) => {
  try {
    const teacherId = intParam(req.params.teacherId);
    if (!teacherId) return fail(res, 'Professor ID inválido.');

    const bookings = await getDb()('bookings').where({ teacher_id: teacherId }).orderBy([{ col: 'date', dir: 'desc' }, { col: 'period', dir: 'desc' }]).limit(50).select('id, resource_id, class_id, weekday, period, date, description, status, created_at');
    const resIds   = [...new Set(bookings.filter(b => b.resource_id).map(b => b.resource_id))];
    const clsIds   = [...new Set(bookings.filter(b => b.class_id).map(b => b.class_id))];
    const [resources, cls] = await Promise.all([
      resIds.length ? getDb()('resources').whereIn('id', resIds).select('id, name, type') : [],
      clsIds.length ? getDb()('classes').whereIn('id', clsIds).select('id, name') : [],
    ]);
    const resMap = Object.fromEntries(resources.map(r => [r.id, r]));
    const clsMap = Object.fromEntries(cls.map(c => [c.id, c.name]));
    ok(res, bookings.map(b => ({ ...b, resource_name: resMap[b.resource_id]?.name ?? null, resource_type: resMap[b.resource_id]?.type ?? null, class_name: clsMap[b.class_id] ?? null })));
  } catch (e) { fail(res, 'Erro ao carregar agendamentos: ' + e.message, 500); }
});

router.delete('/bookings/:id', async (req, res) => {
  try {
    const bookingId = intParam(req.params.id);
    if (!bookingId) return fail(res, 'Agendamento ID inválido.');

    const booking = await getDb()('bookings').where({ id: bookingId }).first();
    if (!booking) return fail(res, 'Agendamento não encontrado.');

    const token = req.headers['x-aula-token'];
    if (!token) return fail(res, 'Token não fornecido.', 401);

    const session = await getDb()('sessions').where({ token }).select('person_id').first();
    if (!session || session.person_id !== booking.teacher_id)
      return fail(res, 'Sem permissão para cancelar este agendamento.', 403);

    await getDb()('bookings').where({ id: bookingId }).update({ status: 'cancelado' });
    ok(res);
  } catch (e) { fail(res, 'Erro ao cancelar agendamento: ' + e.message, 500); }
});

router.get('/resources/:id/schedule', async (req, res) => {
  try {
    const resourceId = intParam(req.params.id);
    if (!resourceId) return fail(res, 'Recurso ID inválido.');

    const bookings = await getDb()('bookings').where({ resource_id: resourceId, status: 'confirmado' }).orderBy([{ col: 'date', dir: 'asc' }, { col: 'period', dir: 'asc' }]).select('id, teacher_id, class_id, weekday, period, date, status, description');
    const tIds = [...new Set(bookings.filter(b => b.teacher_id).map(b => b.teacher_id))];
    const cIds = [...new Set(bookings.filter(b => b.class_id).map(b => b.class_id))];
    const [teachers, cls2] = await Promise.all([
      tIds.length ? getDb()('teachers').whereIn('id', tIds).select('id, name') : [],
      cIds.length ? getDb()('classes').whereIn('id', cIds).select('id, name') : [],
    ]);
    const tMap = Object.fromEntries(teachers.map(t => [t.id, t.name]));
    const cMap = Object.fromEntries(cls2.map(c => [c.id, c.name]));
    ok(res, bookings.map(b => ({ ...b, teacher_name: tMap[b.teacher_id] ?? null, class_name: cMap[b.class_id] ?? null })));
  } catch (e) { fail(res, 'Erro ao carregar schedule: ' + e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ════════════════════════════════════════════════════════════════════════════

const PushNotificationManager = require('../utils/push-notifications');
const pushManager = new PushNotificationManager(getDb());

router.post('/notifications/subscribe', (req, res) => {
  try {
    const { teacherId, subscription } = req.body;
    if (!intParam(teacherId) || !subscription) return fail(res, 'Dados inválidos.');
    const result = pushManager.subscribe(intParam(teacherId), JSON.stringify(subscription));
    result.success ? ok(res, { subscribed: true }) : fail(res, result.error);
  } catch (e) { fail(res, 'Erro ao registrar notificações: ' + e.message, 500); }
});

router.post('/notifications/unsubscribe', (req, res) => {
  try {
    const { teacherId, subscription } = req.body;
    if (!intParam(teacherId) || !subscription) return fail(res, 'Dados inválidos.');
    const result = pushManager.unsubscribe(intParam(teacherId), JSON.stringify(subscription));
    ok(res, { unsubscribed: result.success });
  } catch (e) { fail(res, 'Erro ao desregistrar notificações: ' + e.message, 500); }
});

router.post('/notifications/test', (req, res) => {
  try {
    const { teacherId } = req.body;
    if (!intParam(teacherId)) return fail(res, 'Professor ID inválido.');
    pushManager.sendNotification(intParam(teacherId), '🧪 Notificação de Teste', 'Parabéns! Suas notificações estão funcionando.')
      .then(() => ok(res, { sent: true }))
      .catch(e => fail(res, e.message));
  } catch (e) { fail(res, 'Erro ao enviar notificação: ' + e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// ASSINATURAS E PLANOS
// ════════════════════════════════════════════════════════════════════════════

router.get('/subscription/:schoolId', async (req, res) => {
  try {
    const schoolId = intParam(req.params.schoolId);
    if (!schoolId) return fail(res, 'School ID inválido.');

    const sm = new SubscriptionManager(getDb());
    const subscription = await sm.getSubscription(schoolId);
    if (!subscription) return fail(res, 'Assinatura não encontrada.', 404);

    const [usage, isActive] = await Promise.all([sm.getUsageStats(schoolId), sm.isActive(subscription)]);
    ok(res, { subscription, usage, isActive, planDetails: sm.getPlanDetails(subscription.plan_type) });
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/subscription/create', async (req, res) => {
  try {
    const { schoolId, planType } = req.body;
    if (!intParam(schoolId) || !planType) return fail(res, 'Dados inválidos. schoolId e planType são obrigatórios.');

    const validPlans = ['free', 'starter', 'pro', 'plus', 'cloud', 'online_basic', 'online_premium'];
    if (!validPlans.includes(planType)) return fail(res, `Plano inválido. Opções: ${validPlans.join(', ')}.`);

    const sm = new SubscriptionManager(getDb());
    const subscriptionId = await sm.createSubscription(schoolId, planType);
    ok(res, { subscriptionId, message: 'Assinatura criada com sucesso.' });
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/subscription/upgrade', async (req, res) => {
  try {
    const { subscriptionId, newPlanType } = req.body;
    if (!intParam(subscriptionId) || !newPlanType) return fail(res, 'Dados inválidos.');
    const sm = new SubscriptionManager(getDb());
    await sm.upgradePlan(subscriptionId, newPlanType);
    ok(res, { message: 'Plano atualizado com sucesso.' });
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/subscription/payment', async (req, res) => {
  try {
    const { subscriptionId, amount, notes = '' } = req.body;
    if (!intParam(subscriptionId) || !amount || amount <= 0) return fail(res, 'Dados inválidos. subscriptionId e amount são obrigatórios.');
    const sm = new SubscriptionManager(getDb());
    await sm.recordPayment(subscriptionId, amount, notes);
    ok(res, { message: 'Pagamento registrado com sucesso.' });
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/subscription/franchise-payment', async (req, res) => {
  try {
    const { subscriptionId, amount } = req.body;
    if (!intParam(subscriptionId) || !amount || amount <= 0) return fail(res, 'Dados inválidos.');
    const sm = new SubscriptionManager(getDb());
    await sm.recordFranchisePayment(subscriptionId, amount);
    ok(res, { message: 'Pagamento de franquia registrado com sucesso.' });
  } catch (e) { fail(res, e.message, 500); }
});

router.get('/subscription/history/:subscriptionId', async (req, res) => {
  try {
    const subscriptionId = intParam(req.params.subscriptionId);
    if (!subscriptionId) return fail(res, 'Subscription ID inválido.');
    const sm = new SubscriptionManager(getDb());
    ok(res, await sm.getHistory(subscriptionId));
  } catch (e) { fail(res, e.message, 500); }
});

router.get('/subscription/plans', (req, res) => {
  try {
    const sm = new SubscriptionManager(getDb());
    const plans = ['free', 'starter', 'pro', 'plus', 'cloud', 'online_basic', 'online_premium']
      .map(p => sm.getPlanDetails(p));
    ok(res, plans);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// MERCADO PAGO — Pagamentos e Webhook
// ════════════════════════════════════════════════════════════════════════════

/**
 * Preços anuais dos planos (R$).
 * Planos com desconto de 40% no 1º ano são aplicados na frente-end;
 * aqui ficam os preços cheios para validação no servidor.
 */
const MP_PLAN_PRICES = {
  free:          0,
  starter:     315,
  multi:       540,
  maxxi:       980,
  plus:       1260,
  plus_premium: 4390,
  pro:         1050,
  pro_premium: 4110,
};

/**
 * Calcula o valor final considerando parcelamento e perfil do pagador.
 * - Escola, até 5×: sem acréscimo
 * - Escola, 6–10×:  +10%
 * - Professor individual, qualquer parcelamento: +10%
 * - PIX (installments=1, paymentMethod='pix'): -3%
 */
function mpCalculateFinalPrice(basePrice, installments, role, paymentMethod) {
  if (paymentMethod === 'pix') return parseFloat((basePrice * 0.97).toFixed(2));
  if (role === 'teacher') {
    return installments > 1 ? parseFloat((basePrice * 1.10).toFixed(2)) : basePrice;
  }
  // escola (padrão)
  return installments > 5 ? parseFloat((basePrice * 1.10).toFixed(2)) : basePrice;
}

// POST /payments/create-preference — cria preferência de pagamento no MP
router.post('/payments/create-preference', async (req, res) => {
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN) {
    return fail(res, 'Integração com Mercado Pago não configurada. Defina MERCADOPAGO_ACCESS_TOKEN.', 503);
  }

  try {
    const { planType, installments = 1, paymentMethod = 'credit_card', schoolId, role = 'school', firstYear = false } = req.body;

    if (!planType || !MP_PLAN_PRICES.hasOwnProperty(planType))
      return fail(res, `Plano inválido: ${planType}. Planos disponíveis: ${Object.keys(MP_PLAN_PRICES).join(', ')}`);

    let basePrice = MP_PLAN_PRICES[planType];
    if (basePrice === 0) return fail(res, 'O plano FREE não requer pagamento.');

    // Desconto de 40% no primeiro ano
    if (firstYear) basePrice = parseFloat((basePrice * 0.60).toFixed(2));

    const finalPrice = mpCalculateFinalPrice(basePrice, installments, role, paymentMethod);

    const { MercadoPagoConfig, Preference } = require('mercadopago');
    const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const apiUrl = process.env.API_URL || appUrl;
    const isPublicUrl = !appUrl.includes('localhost') && !appUrl.includes('127.0.0.1');

    const preferenceBody = {
      items: [{
        id: planType,
        title: `aula.app — Plano ${planType.toUpperCase()}${firstYear ? ' (1º ano -40%)' : ''} (anual)`,
        quantity: 1,
        unit_price: finalPrice,
        currency_id: 'BRL',
      }],
      payment_methods: {
        installments: Math.min(Math.max(parseInt(installments) || 1, 1), 10),
        excluded_payment_types: [],
      },
      external_reference: String(schoolId || ''),
      notification_url: `${apiUrl}/api/webhooks/mercadopago`,
    };

    // back_urls e auto_return só funcionam com URLs públicas (não localhost)
    if (isPublicUrl) {
      preferenceBody.back_urls = {
        success: `${appUrl}/pagamento/sucesso`,
        failure: `${appUrl}/pagamento/falha`,
        pending: `${appUrl}/pagamento/pendente`,
      };
      preferenceBody.auto_return = 'approved';
    }

    const preference = new Preference(client);
    const mpResponse = await preference.create({ body: preferenceBody });

    ok(res, {
      preferenceId: mpResponse.id,
      initPoint: mpResponse.init_point,       // URL para redirecionar o usuário
      sandboxInitPoint: mpResponse.sandbox_init_point, // URL para testes
      planType,
      finalPrice,
      installments,
    });
  } catch (e) {
    fail(res, `Erro ao criar preferência de pagamento: ${e.message}`, 500);
  }
});

// POST /webhooks/mercadopago — recebe notificações do MP e ativa assinatura
router.post('/webhooks/mercadopago', async (req, res) => {
  try {
    // O body chega como Buffer (express.raw registrado no server.js)
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);

    // ── 1. Verificação HMAC ──────────────────────────────────────────────────
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    if (webhookSecret) {
      const xSignature  = req.headers['x-signature'] || '';
      const xRequestId  = req.headers['x-request-id'] || '';
      const dataId      = req.query['data.id'] || '';

      // Formato do manifest conforme documentação MP
      const tsPart = xSignature.split(',').find(p => p.trim().startsWith('ts='));
      const ts     = tsPart ? tsPart.split('=')[1] : '';
      const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

      const expectedHash = require('crypto')
        .createHmac('sha256', webhookSecret)
        .update(manifest)
        .digest('hex');

      const v1Part = xSignature.split(',').find(p => p.trim().startsWith('v1='));
      const receivedHash = v1Part ? v1Part.split('=')[1] : '';

      if (receivedHash && expectedHash !== receivedHash) {
        return res.status(401).json({ error: 'Assinatura inválida' });
      }
    }

    // ── 2. Parsear payload ───────────────────────────────────────────────────
    let payload;
    try { payload = JSON.parse(rawBody); } catch { return res.sendStatus(200); }

    const { type, data } = payload;
    if (type !== 'payment' || !data?.id) return res.sendStatus(200);

    // ── 3. Buscar detalhes do pagamento na API do MP ─────────────────────────
    if (!process.env.MERCADOPAGO_ACCESS_TOKEN) return res.sendStatus(200);

    const { MercadoPagoConfig, Payment } = require('mercadopago');
    const client  = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN });
    const payment = new Payment(client);
    const mpPayment = await payment.get({ id: data.id });

    if (mpPayment.status !== 'approved') return res.sendStatus(200);

    const schoolId  = mpPayment.external_reference;
    const planType  = mpPayment.items?.[0]?.id;
    const amount    = mpPayment.transaction_amount;
    const payType   = mpPayment.payment_type_id;
    const parcel    = mpPayment.installments || 1;
    const mpId      = String(mpPayment.id);

    if (!schoolId) return res.sendStatus(200);

    const db = getDb();

    // Pagamento já processado? (idempotência)
    const existing = await db('payments').where({ mercado_pago_id: mpId }).first();
    if (existing) return res.sendStatus(200);

    // ── 4. Atualizar ou criar assinatura ─────────────────────────────────────
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const now = new Date().toISOString();

    const sub = await db('school_subscriptions').where({ school_id: schoolId }).first();
    let subscriptionId;

    if (sub) {
      await db('school_subscriptions').where({ school_id: schoolId }).update({
        status: 'active',
        ...(planType && MP_PLAN_PRICES.hasOwnProperty(planType) ? { plan_type: planType } : {}),
        expires_at: expiresAt.toISOString(),
        last_payment_at: now,
        updated_at: now,
      });
      subscriptionId = sub.id;
    } else {
      const [row] = await db('school_subscriptions').insert({
        school_id: schoolId,
        plan_type: planType || 'starter',
        status: 'active',
        expires_at: expiresAt.toISOString(),
        last_payment_at: now,
        created_at: now,
        updated_at: now,
      }).returning('id');
      subscriptionId = row.id ?? row;
    }

    // ── 5. Registrar pagamento ───────────────────────────────────────────────
    await db('payments').insert({
      subscription_id: subscriptionId,
      mercado_pago_id: mpId,
      amount,
      status: 'approved',
      payment_type: payType,
      installments: parcel,
      approved_at: now,
      created_at: now,
    });

    res.sendStatus(200);
  } catch (e) {
    // Retorna 200 para evitar que o MP fique tentando reenviar
    console.error('[WEBHOOK MP] Erro ao processar notificação:', e.message);
    res.sendStatus(200);
  }
});

// GET /payments/status/:schoolId — verifica status do pagamento mais recente
router.get('/payments/status/:schoolId', async (req, res) => {
  try {
    const schoolId = intParam(req.params.schoolId);
    if (!schoolId) return fail(res, 'School ID inválido.');

    const sub = await getDb()('school_subscriptions').where({ school_id: schoolId }).first();
    if (!sub) return fail(res, 'Assinatura não encontrada.', 404);

    const lastPayment = await getDb()('payments')
      .where({ subscription_id: sub.id })
      .orderBy('created_at', 'desc')
      .first();

    ok(res, {
      subscription: { status: sub.status, planType: sub.plan_type, expiresAt: sub.expires_at },
      lastPayment: lastPayment || null,
    });
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// TIPOS DE AULA
// ════════════════════════════════════════════════════════════════════════════

router.get('/lesson-types', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('lesson_types').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/lesson-types', async (req, res) => {
  try {
    const { school_id, name, is_synchronous = 1, color = '#6b7280' } = req.body;
    if (!intParam(school_id) || !name?.trim()) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('lesson_types').insert({
      school_id, name: name.trim(),
      is_synchronous: parseInt(is_synchronous),
      color, active: 1,
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/lesson-types/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const fields = {};
    if (req.body.name !== undefined) fields.name = req.body.name.trim();
    if (req.body.is_synchronous !== undefined) fields.is_synchronous = parseInt(req.body.is_synchronous);
    if (req.body.color !== undefined) fields.color = req.body.color;
    if (req.body.active !== undefined) fields.active = parseInt(req.body.active);
    if (!Object.keys(fields).length) return fail(res, 'Nenhum campo para atualizar.');
    await getDb()('lesson_types').where({ id }).update(fields);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/lesson-types/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('lesson_types').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// PAPÉIS DE TUTOR
// ════════════════════════════════════════════════════════════════════════════

router.get('/tutor-roles', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('tutor_roles').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/tutor-roles', async (req, res) => {
  try {
    const { school_id, name, color = '#6366f1' } = req.body;
    if (!intParam(school_id) || !name?.trim()) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('tutor_roles').insert({
      school_id, name: name.trim(), color, active: 1,
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/tutor-roles/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const fields = {};
    if (req.body.name !== undefined) fields.name = req.body.name.trim();
    if (req.body.color !== undefined) fields.color = req.body.color;
    if (req.body.active !== undefined) fields.active = parseInt(req.body.active);
    if (!Object.keys(fields).length) return fail(res, 'Nenhum campo para atualizar.');
    await getDb()('tutor_roles').where({ id }).update(fields);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/tutor-roles/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('tutor_roles').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// TUTORES DE TURMA
// ════════════════════════════════════════════════════════════════════════════

router.get('/class-tutors', async (req, res) => {
  try {
    const classId = intParam(req.query.classId);
    if (!classId) return fail(res, 'classId obrigatório.');
    ok(res, await getDb()('class_tutors').where({ class_id: classId }));
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/class-tutors', async (req, res) => {
  try {
    const { class_id, teacher_id, tutor_role_id } = req.body;
    if (!intParam(class_id)) return fail(res, 'class_id obrigatório.');
    const [row] = await getDb()('class_tutors').insert({
      class_id,
      teacher_id: intParam(teacher_id) || null,
      tutor_role_id: intParam(tutor_role_id) || null,
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/class-tutors/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const { teacher_id, tutor_role_id } = req.body;
    await getDb()('class_tutors').where({ id }).update({
      teacher_id: intParam(teacher_id) || null,
      tutor_role_id: intParam(tutor_role_id) || null,
    });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/class-tutors/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('class_tutors').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;
