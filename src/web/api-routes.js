/**
 * src/web/api-routes.js
 *
 * Router Express com todos os endpoints REST.
 * O frontend usa web-bridge.js para chamar estas rotas via fetch().
 *
 * Todas as respostas seguem o formato:
 *   { success: boolean, data?: any, error?: string }
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { getDb, hashPassword, verifyPassword } = require('../db/database-web');
const { isValidCredentials, isValidPositiveInt, isValidTeacherData, isValidSchoolData } = require('../utils/validators');
const { SubscriptionManager } = require('../utils/subscription-manager');

// ─── Módulos de licença disponíveis ──────────────────────────────────────────
const AVAILABLE_MODULES = {
  cronograma: { id: 'cronograma', name: 'Cronograma', description: 'Criação e gerenciamento de grades de horários escolares.', icon: '📅' },
  aula:       { id: 'aula',       name: 'Registro de Aulas', description: 'Registro e controle de aulas ministradas por professor.', icon: '📝' },
  plano:      { id: 'plano',      name: 'Plano de Aula', description: 'Criação e gerenciamento de planos de aula estruturados.', icon: '📋' },
};

const SESSION_TTL_HOURS = 8;
const DEV_MODE = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

function generateToken() { return crypto.randomBytes(32).toString('hex'); }
function ok(res, data) { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v) { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// ─── App ──────────────────────────────────────────────────────────────────────
router.get('/app/dataPath', (req, res) => {
  const { DB_PATH } = require('../db/database-web');
  ok(res, DB_PATH);
});

// ════════════════════════════════════════════════════════════════════════════════
// DETECÇÃO DE SERVIDOR (Multi-Modal: Local, VPN, Cloud)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/health
 * Simples health check para detecção de servidor
 */
router.get('/health', (req, res) => {
  try {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch (e) {
    res.status(500).json({ success: false, status: 'error' });
  }
});

/**
 * GET /api/server-info
 * Retorna informações sobre este servidor (tipo, saúde, recursos)
 */
router.get('/server-info', (req, res) => {
  try {
    const db = getDb();
    
    // Contar estatísticas do banco
    const userCount = db.prepare('SELECT COUNT(*) as cnt FROM people').get().cnt;
    const schoolCount = db.prepare('SELECT COUNT(*) as cnt FROM schools').get().cnt;
    const classCount = db.prepare('SELECT COUNT(*) as cnt FROM classes').get().cnt;
    
    // Determinar tipo de servidor baseado em variáveis de ambiente
    const serverType = process.env.SERVER_TYPE || 'local'; // local, vpn, cloud
    const isCloud = serverType === 'cloud' || process.env.CLOUD_PROVIDER;
    
    ok(res, {
      serverType: serverType,
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      
      health: {
        status: 'healthy',
        database: 'ok',
        storage: 'ok'
      },
      
      statistics: {
        users: userCount,
        schools: schoolCount,
        classes: classCount
      },
      
      features: {
        offlineMode: !isCloud,
        pushNotifications: true,
        advancedReports: isCloud,
        multiTenant: true,
        api: {
          version: '1.0.0',
          endpoints: 100
        }
      },
      
      configuration: {
        mode: process.env.NODE_ENV || 'production',
        database: process.env.AULA_DB_PATH || 'default',
        https: !!process.env.HTTPS_ENABLED,
        cors: process.env.CORS_ORIGIN || '*'
      }
    });
  } catch (e) {
    fail(res, `Erro ao obter informações do servidor: ${e.message}`, 500);
  }
});

/**
 * GET /api/server-endpoints
 * Retorna lista de endpoints disponíveis (para failover)
 * Usado pelo frontend para detectar qual servidor usar
 */
router.get('/server-endpoints', (req, res) => {
  try {
    const serverType = process.env.SERVER_TYPE || 'local';
    const currentUrl = `${req.protocol}://${req.get('host')}`;
    
    // Montar lista de endpoints disponíveis
    const endpoints = [
      {
        type: serverType,
        url: currentUrl,
        latency: 0, // Servidor atual sempre tem latência 0
        priority: serverType === 'local' ? 1 : (serverType === 'vpn' ? 2 : 3),
        available: true,
        description: `Servidor ${serverType} (conexão atual)`
      }
    ];
    
    // Adicionar endpoints alternativos se configurados
    const fallbackServers = [
      process.env.FALLBACK_LOCAL_SERVER,
      process.env.FALLBACK_VPN_SERVER,
      process.env.FALLBACK_CLOUD_SERVER
    ].filter(Boolean);
    
    fallbackServers.forEach((url, index) => {
      endpoints.push({
        type: ['local', 'vpn', 'cloud'][index] || 'unknown',
        url: url,
        latency: null, // Será testado pelo cliente
        priority: index + 2,
        available: false, // Cliente testará disponibilidade
        description: `Servidor alternativo via ${['local', 'vpn', 'cloud'][index]}`
      });
    });
    
    ok(res, {
      current: {
        type: serverType,
        url: currentUrl,
        latency: 0,
        priority: serverType === 'local' ? 1 : (serverType === 'vpn' ? 2 : 3)
      },
      available: endpoints,
      detection: {
        enabled: true,
        strategy: 'latency-based',
        cacheTime: 5 * 60 * 1000 // 5 minutos
      }
    });
  } catch (e) {
    fail(res, `Erro ao obter endpoints: ${e.message}`, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO
// ════════════════════════════════════════════════════════════════════════════════

router.get('/auth/checkFirstAdmin/:schoolId', (req, res) => {
  try {
    const schoolId = intParam(req.params.schoolId);
    if (!schoolId) return fail(res, 'School ID inválido.');
    const admin = getDb().prepare('SELECT id FROM admins WHERE school_id = ? LIMIT 1').get(schoolId);
    res.json({ success: true, hasAdmin: !!admin });
  } catch (e) {
    fail(res, e.message, 500);
  }
});

router.post('/auth/registerFirstAdmin', async (req, res) => {
  try {
    const { schoolId, name, username, password } = req.body;
    if (!intParam(schoolId) || !name?.trim() || !isValidCredentials(username, password)) {
      return fail(res, 'Dados inválidos.');
    }
    const existing = getDb().prepare('SELECT id FROM admins WHERE school_id = ? LIMIT 1').get(schoolId);
    if (existing) return fail(res, 'Já existe um admin cadastrado para esta escola.');

    const hashed = await hashPassword(password);
    const result = getDb()
      .prepare('INSERT INTO admins (school_id, name, username, password, active) VALUES (?, ?, ?, ?, 1)')
      .run(schoolId, name.trim(), username.trim(), hashed);

    // Auto-login
    const token = generateToken();
    getDb().prepare('INSERT INTO admin_sessions (school_id, admin_id, token) VALUES (?, ?, ?)').run(schoolId, result.lastInsertRowid, token);
    res.json({
      success: true,
      data: {
        token,
        admin: { id: result.lastInsertRowid, name: name.trim(), username: username.trim(), role: 'admin', schoolId }
      }
    });
  } catch (e) {
    const msg = e.message.includes('UNIQUE') ? 'Nome de usuário já existe.' : e.message;
    fail(res, msg);
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { schoolId, username, password } = req.body;
    if (!intParam(schoolId) || !username?.trim() || !password?.trim()) {
      return fail(res, 'Credenciais inválidas.');
    }
    const admin = getDb().prepare(
      'SELECT id, name, username, active, password FROM admins WHERE school_id = ? AND username = ?'
    ).get(schoolId, username.trim());

    if (!admin) return fail(res, 'Usuário ou senha incorretos.');
    if (!admin.active) return fail(res, 'Usuário inativo.');

    const valid = await verifyPassword(password, admin.password);
    if (!valid) return fail(res, 'Usuário ou senha incorretos.');

    // Limpa sessões expiradas
    getDb().prepare(`DELETE FROM admin_sessions WHERE created_at < datetime('now', '-${SESSION_TTL_HOURS} hours')`).run();

    const token = generateToken();
    getDb().prepare('INSERT INTO admin_sessions (school_id, admin_id, token) VALUES (?, ?, ?)').run(schoolId, admin.id, token);

    res.json({
      success: true,
      data: {
        token,
        admin: { id: admin.id, name: admin.name, username: admin.username, role: 'admin', schoolId }
      }
    });
  } catch (e) {
    fail(res, e.message, 500);
  }
});

router.post('/auth/verifySession', (req, res) => {
  try {
    const { schoolId, token } = req.body;
    if (!intParam(schoolId) || !token?.trim()) return res.json({ success: true, valid: false });

    getDb().prepare(`DELETE FROM admin_sessions WHERE created_at < datetime('now', '-${SESSION_TTL_HOURS} hours')`).run();

    const session = getDb().prepare(
      `SELECT admin_id FROM admin_sessions WHERE school_id = ? AND token = ? AND created_at >= datetime('now', '-${SESSION_TTL_HOURS} hours')`
    ).get(schoolId, token);

    if (!session) return res.json({ success: true, valid: false });

    const admin = getDb().prepare('SELECT id, name, username, active FROM admins WHERE id = ? AND active = 1').get(session.admin_id);
    if (!admin) return res.json({ success: true, valid: false });

    res.json({ success: true, valid: true, admin: { id: admin.id, name: admin.name, username: admin.username, role: 'admin', schoolId } });
  } catch (e) {
    fail(res, e.message, 500);
  }
});

router.post('/auth/logout', (req, res) => {
  try {
    const { token } = req.body;
    if (token?.trim()) getDb().prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
    ok(res);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

router.post('/auth/deactivateAdmin', (req, res) => {
  try {
    const { adminId } = req.body;
    if (!intParam(adminId)) return fail(res, 'ID inválido.');
    const admin = getDb().prepare('SELECT school_id FROM admins WHERE id = ?').get(adminId);
    if (!admin) return fail(res, 'Admin não encontrado.');
    const { count } = getDb().prepare('SELECT COUNT(*) as count FROM admins WHERE school_id = ? AND active = 1').get(admin.school_id);
    if (count <= 1) return fail(res, 'Não é possível desativar o único admin ativo da escola.');
    getDb().prepare('UPDATE admins SET active = 0 WHERE id = ?').run(adminId);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/activateAdmin', (req, res) => {
  try {
    const { adminId } = req.body;
    if (!intParam(adminId)) return fail(res, 'ID inválido.');
    getDb().prepare('UPDATE admins SET active = 1 WHERE id = ?').run(adminId);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/deactivateTeacher', (req, res) => {
  try {
    const { teacherId } = req.body;
    if (!intParam(teacherId)) return fail(res, 'ID inválido.');
    getDb().prepare('UPDATE teachers SET active = 0 WHERE id = ?').run(teacherId);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/activateTeacher', (req, res) => {
  try {
    const { teacherId } = req.body;
    if (!intParam(teacherId)) return fail(res, 'ID inválido.');
    getDb().prepare('UPDATE teachers SET active = 1 WHERE id = ?').run(teacherId);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/auth/promoteTeacherToAdmin', async (req, res) => {
  try {
    const { teacherId, password } = req.body;
    if (!intParam(teacherId) || !password?.trim()) return fail(res, 'Dados inválidos.');
    const teacher = getDb().prepare('SELECT id, school_id, name, email FROM teachers WHERE id = ?').get(teacherId);
    if (!teacher) return fail(res, 'Professor não encontrado.');

    let username = teacher.email?.split('@')[0] || teacher.name.replace(/\s+/g, '').toLowerCase();
    let counter = 1;
    let base = username;
    while (getDb().prepare('SELECT id FROM admins WHERE username = ?').get(username)) {
      username = `${base}${counter++}`;
    }

    const hashed = await hashPassword(password);
    const result = getDb()
      .prepare('INSERT INTO admins (school_id, name, username, password, active) VALUES (?, ?, ?, ?, 1)')
      .run(teacher.school_id, teacher.name, username, hashed);

    ok(res, { adminId: result.lastInsertRowid, username });
  } catch (e) {
    const msg = e.message.includes('UNIQUE') ? 'Nome de usuário já existe.' : e.message;
    fail(res, msg);
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// SUPERADMINS
// ════════════════════════════════════════════════════════════════════════════════

router.get('/superadmins', (req, res) => {
  try {
    const rows = getDb().prepare('SELECT id, name, username, created_at FROM superadmins').all();
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/superadmins', async (req, res) => {
  try {
    const { name, username, password } = req.body;
    if (!name?.trim() || !isValidCredentials(username, password)) {
      return fail(res, 'Nome, usuário e senha são obrigatórios. Senha deve ter pelo menos 6 caracteres.');
    }
    const hashed = await hashPassword(password);
    const result = getDb()
      .prepare('INSERT INTO superadmins (name, username, password) VALUES (?, ?, ?)')
      .run(name.trim(), username.trim(), hashed);
    ok(res, { id: result.lastInsertRowid });
  } catch (e) {
    const msg = e.message.includes('UNIQUE') ? 'Nome de usuário já existe.' : e.message;
    fail(res, msg);
  }
});

router.post('/superadmins/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!isValidCredentials(username, password)) return fail(res, 'Usuário e senha são obrigatórios.');
    const row = getDb().prepare('SELECT id, name, username, password FROM superadmins WHERE username = ?').get(username.trim());
    if (!row) return fail(res, 'Usuário ou senha incorretos.');
    const valid = await verifyPassword(password, row.password);
    if (!valid) return fail(res, 'Usuário ou senha incorretos.');
    const { password: _, ...safe } = row;
    ok(res, safe);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/superadmins/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM superadmins WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// ESCOLAS
// ════════════════════════════════════════════════════════════════════════════════

router.get('/schools', (req, res) => {
  try {
    ok(res, getDb().prepare('SELECT * FROM schools ORDER BY name').all());
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/schools', (req, res) => {
  try {
    if (!isValidSchoolData(req.body)) return fail(res, 'Dados da escola inválidos.');
    const { name, acronym = '', address = '', cnpj = '', inep_code = '' } = req.body;
    const result = getDb()
      .prepare('INSERT INTO schools (name, acronym, address, cnpj, inep_code) VALUES (?, ?, ?, ?, ?)')
      .run(name.trim(), acronym.trim(), address.trim(), cnpj.trim(), inep_code.trim());
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/schools/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id || !isValidSchoolData(req.body)) return fail(res, 'Dados inválidos.');
    const { name, acronym = '', address = '', cnpj = '', inep_code = '' } = req.body;
    getDb()
      .prepare('UPDATE schools SET name=?, acronym=?, address=?, cnpj=?, inep_code=? WHERE id=?')
      .run(name.trim(), acronym.trim(), address.trim(), cnpj.trim(), inep_code.trim(), id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/schools/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM schools WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// ADMINS
// ════════════════════════════════════════════════════════════════════════════════

router.get('/admins', (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const rows = schoolId
      ? getDb().prepare('SELECT id, school_id, name, username, active, created_at FROM admins WHERE school_id = ?').all(schoolId)
      : getDb().prepare('SELECT id, school_id, name, username, active, created_at FROM admins').all();
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/admins', async (req, res) => {
  try {
    const { school_id, name, username, password } = req.body;
    if (!intParam(school_id) || !name?.trim() || !isValidCredentials(username, password)) {
      return fail(res, 'Dados inválidos.');
    }
    const hashed = await hashPassword(password);
    const result = getDb()
      .prepare('INSERT INTO admins (school_id, name, username, password) VALUES (?, ?, ?, ?)')
      .run(school_id, name.trim(), username.trim(), hashed);
    ok(res, { id: result.lastInsertRowid });
  } catch (e) {
    const msg = e.message.includes('UNIQUE') ? 'Nome de usuário já existe.' : e.message;
    fail(res, msg);
  }
});

router.delete('/admins/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM admins WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/admins/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!isValidCredentials(username, password)) return fail(res, 'Dados inválidos.');
    const row = getDb().prepare(
      `SELECT admins.id, admins.name, admins.username, admins.school_id, admins.password,
              schools.name as school_name
       FROM admins JOIN schools ON schools.id = admins.school_id
       WHERE admins.username = ?`
    ).get(username.trim());
    if (!row) return fail(res, 'Usuário ou senha incorretos.');
    const valid = await verifyPassword(password, row.password);
    if (!valid) return fail(res, 'Usuário ou senha incorretos.');
    const { password: _, ...safe } = row;
    ok(res, safe);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// PROFESSORES
// ════════════════════════════════════════════════════════════════════════════════

router.get('/teachers', (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const rows = schoolId
      ? getDb().prepare('SELECT * FROM teachers WHERE school_id = ? ORDER BY name').all(schoolId)
      : getDb().prepare('SELECT * FROM teachers ORDER BY name').all();
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/teachers', (req, res) => {
  try {
    const { school_id, name, registration = '', email = '', subjects = '' } = req.body;
    if (!intParam(school_id) || !isValidTeacherData({ name, email, registration })) {
      return fail(res, 'Dados inválidos.');
    }
    
    // Verifica limite de professores do plano de assinatura
    const subscriptionManager = new SubscriptionManager(getDb());
    const check = subscriptionManager.canCreateTeacher(school_id);
    if (!check.allowed) {
      return fail(res, check.reason, 403);
    }
    
    const result = getDb()
      .prepare('INSERT INTO teachers (school_id, name, registration, email, subjects) VALUES (?, ?, ?, ?, ?)')
      .run(school_id, name.trim(), registration.trim(), email.trim(), subjects);
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/teachers/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id || !isValidTeacherData(req.body)) return fail(res, 'Dados inválidos.');
    const { name, registration = '', email = '', subjects = '' } = req.body;
    getDb()
      .prepare('UPDATE teachers SET name=?, registration=?, email=?, subjects=? WHERE id=?')
      .run(name.trim(), registration.trim(), email.trim(), subjects, id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/teachers/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM teachers WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.get('/teachers/:id/availability', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const rows = getDb()
      .prepare('SELECT weekday, period FROM teacher_availability WHERE teacher_id = ? ORDER BY weekday, period')
      .all(id);
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/teachers/:id/availability', (req, res) => {
  try {
    const id = intParam(req.params.id);
    const slots = req.body.slots;
    if (!id || !Array.isArray(slots)) return fail(res, 'Dados inválidos.');
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM teacher_availability WHERE teacher_id = ?').run(id);
      const ins = db.prepare('INSERT INTO teacher_availability (teacher_id, weekday, period) VALUES (?, ?, ?)');
      for (const { weekday, period } of slots) {
        if (intParam(weekday) && intParam(period)) ins.run(id, weekday, period);
      }
    });
    tx();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// CRONOGRAMAS
// ════════════════════════════════════════════════════════════════════════════════

router.get('/schedules', (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const rows = schoolId
      ? getDb().prepare('SELECT * FROM schedules WHERE school_id = ? ORDER BY year DESC, semester DESC').all(schoolId)
      : getDb().prepare('SELECT * FROM schedules ORDER BY year DESC, semester DESC').all();
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/schedules', (req, res) => {
  try {
    const { school_id, name, year, semester } = req.body;
    if (!intParam(school_id) || !name?.trim() || !intParam(year) || !intParam(semester)) {
      return fail(res, 'Dados inválidos.');
    }
    const result = getDb()
      .prepare('INSERT INTO schedules (school_id, name, year, semester) VALUES (?, ?, ?, ?)')
      .run(school_id, name.trim(), year, semester);
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/schedules/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name, year, semester, active } = req.body;
    if (!id || !name?.trim() || !intParam(year) || !intParam(semester)) return fail(res, 'Dados inválidos.');
    getDb()
      .prepare('UPDATE schedules SET name=?, year=?, semester=?, active=? WHERE id=?')
      .run(name.trim(), year, semester, active ? 1 : 0, id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/schedules/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM schedules WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// AULAS
// ════════════════════════════════════════════════════════════════════════════════

router.get('/lessons', (req, res) => {
  try {
    const scheduleId = intParam(req.query.scheduleId);
    if (!scheduleId) return fail(res, 'scheduleId obrigatório.');
    const rows = getDb().prepare(
      `SELECT lessons.*, teachers.name as teacher_name
       FROM lessons LEFT JOIN teachers ON teachers.id = lessons.teacher_id
       WHERE lessons.schedule_id = ? ORDER BY weekday, period`
    ).all(scheduleId);
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/lessons', (req, res) => {
  try {
    const { schedule_id, resource_id = null, teacher_id = null, weekday, period, subject, classroom = '', notes = '' } = req.body;
    if (!intParam(schedule_id) || !intParam(weekday) || !intParam(period) || !subject?.trim()) {
      return fail(res, 'Dados inválidos.');
    }
    if (resource_id) {
      const conflict = getDb().prepare(
        'SELECT id FROM lessons WHERE schedule_id=? AND resource_id=? AND weekday=? AND period=?'
      ).get(schedule_id, resource_id, weekday, period);
      if (conflict) return fail(res, 'Este recurso já está ocupado neste período.');
    }
    if (teacher_id) {
      const conflict = getDb().prepare(
        `SELECT l.id, r.name as resource_name FROM lessons l LEFT JOIN resources r ON r.id=l.resource_id
         WHERE l.schedule_id=? AND l.teacher_id=? AND l.weekday=? AND l.period=?`
      ).get(schedule_id, teacher_id, weekday, period);
      if (conflict) {
        const where = conflict.resource_name ? ` (${conflict.resource_name})` : '';
        return fail(res, `Professor já possui agendamento neste período${where}.`);
      }
    }
    const result = getDb()
      .prepare('INSERT INTO lessons (schedule_id, resource_id, teacher_id, weekday, period, subject, classroom, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(schedule_id, resource_id, teacher_id, weekday, period, subject.trim(), classroom.trim(), notes);
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message); }
});

router.put('/lessons/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { schedule_id, resource_id = null, teacher_id = null, weekday, period, subject, classroom = '', notes = '' } = req.body;
    if (!id || !intParam(weekday) || !intParam(period) || !subject?.trim()) return fail(res, 'Dados inválidos.');
    if (resource_id && schedule_id) {
      const conflict = getDb().prepare(
        'SELECT id FROM lessons WHERE schedule_id=? AND resource_id=? AND weekday=? AND period=? AND id!=?'
      ).get(schedule_id, resource_id, weekday, period, id);
      if (conflict) return fail(res, 'Este recurso já está ocupado neste período.');
    }
    if (teacher_id && schedule_id) {
      const conflict = getDb().prepare(
        `SELECT l.id, r.name as resource_name FROM lessons l LEFT JOIN resources r ON r.id=l.resource_id
         WHERE l.schedule_id=? AND l.teacher_id=? AND l.weekday=? AND l.period=? AND l.id!=?`
      ).get(schedule_id, teacher_id, weekday, period, id);
      if (conflict) {
        const where = conflict.resource_name ? ` (${conflict.resource_name})` : '';
        return fail(res, `Professor já possui agendamento neste período${where}.`);
      }
    }
    getDb()
      .prepare('UPDATE lessons SET teacher_id=?, weekday=?, period=?, subject=?, classroom=?, notes=? WHERE id=?')
      .run(teacher_id, weekday, period, subject.trim(), classroom.trim(), notes, id);
    ok(res);
  } catch (e) { fail(res, e.message); }
});

router.delete('/lessons/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM lessons WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// PLANOS DE AULA
// ════════════════════════════════════════════════════════════════════════════════

router.get('/lesson-plans', (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    if (!schoolId) return fail(res, 'School ID é obrigatório.', 400);
    
    // Verifica se o plano tem acesso ao recurso de planos de aula
    const subscriptionManager = new SubscriptionManager(getDb());
    if (!subscriptionManager.hasFeature(schoolId, 'plano_aula')) {
      return fail(res, 'Recurso indisponível no seu plano. Faça upgrade para acessar planos de aula.', 403);
    }
    
    const rows = getDb().prepare('SELECT * FROM lesson_plans WHERE school_id = ? ORDER BY created_at DESC').all(schoolId);
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/lesson-plans', (req, res) => {
  try {
    const { school_id, teacher_id = null, subject, title, objectives = '', content = '', methodology = '', resources = '', evaluation = '', duration_minutes = null, date = null } = req.body;
    if (!intParam(school_id) || !subject?.trim() || !title?.trim()) return fail(res, 'Dados inválidos.');
    
    // Verifica se o plano tem acesso ao recurso de planos de aula
    const subscriptionManager = new SubscriptionManager(getDb());
    if (!subscriptionManager.hasFeature(school_id, 'plano_aula')) {
      return fail(res, 'Recurso indisponível no seu plano. Faça upgrade para acessar planos de aula.', 403);
    }
    
    const result = getDb()
      .prepare('INSERT INTO lesson_plans (school_id, teacher_id, subject, title, objectives, content, methodology, resources, evaluation, duration_minutes, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(school_id, teacher_id, subject.trim(), title.trim(), objectives, content, methodology, resources, evaluation, duration_minutes, date);
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/lesson-plans/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const { teacher_id = null, subject, title, objectives = '', content = '', methodology = '', resources = '', evaluation = '', duration_minutes = null, date = null } = req.body;
    if (!subject?.trim() || !title?.trim()) return fail(res, 'Dados inválidos.');
    getDb()
      .prepare('UPDATE lesson_plans SET teacher_id=?, subject=?, title=?, objectives=?, content=?, methodology=?, resources=?, evaluation=?, duration_minutes=?, date=? WHERE id=?')
      .run(teacher_id, subject.trim(), title.trim(), objectives, content, methodology, resources, evaluation, duration_minutes, date, id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/lesson-plans/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM lesson_plans WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// RECURSOS
// ════════════════════════════════════════════════════════════════════════════════

router.get('/resources', (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const rows = schoolId
      ? getDb().prepare('SELECT * FROM resources WHERE school_id = ? ORDER BY name').all(schoolId)
      : getDb().prepare('SELECT * FROM resources ORDER BY name').all();
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/resources', (req, res) => {
  try {
    const { school_id, name, type, capacity = null, description = '' } = req.body;
    if (!intParam(school_id) || !name?.trim() || !type?.trim()) return fail(res, 'Dados inválidos.');
    const result = getDb()
      .prepare('INSERT INTO resources (school_id, name, type, capacity, description) VALUES (?, ?, ?, ?, ?)')
      .run(school_id, name.trim(), type.trim(), capacity, description.trim());
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/resources/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name, type, capacity, description } = req.body;
    if (!id || !name?.trim() || !type?.trim()) return fail(res, 'Dados inválidos.');
    getDb()
      .prepare('UPDATE resources SET name=?, type=?, capacity=?, description=? WHERE id=?')
      .run(name.trim(), type.trim(), capacity, description?.trim() || '', id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/resources/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM resources WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// TURNOS
// ════════════════════════════════════════════════════════════════════════════════

router.get('/shifts', (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const rows = schoolId
      ? getDb().prepare('SELECT * FROM shifts WHERE school_id = ? ORDER BY name').all(schoolId)
      : getDb().prepare('SELECT * FROM shifts ORDER BY name').all();
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/shifts', (req, res) => {
  try {
    const { school_id, name } = req.body;
    if (!intParam(school_id) || !name?.trim()) return fail(res, 'Dados inválidos.');
    const result = getDb()
      .prepare('INSERT INTO shifts (school_id, name) VALUES (?, ?)')
      .run(school_id, name.trim());
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/shifts/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name } = req.body;
    if (!id || !name?.trim()) return fail(res, 'Dados inválidos.');
    getDb().prepare('UPDATE shifts SET name=? WHERE id=?').run(name.trim(), id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/shifts/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM shifts WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// TURMAS
// ════════════════════════════════════════════════════════════════════════════════

router.get('/classes', (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const rows = schoolId
      ? getDb().prepare('SELECT * FROM classes WHERE school_id = ? ORDER BY name').all(schoolId)
      : getDb().prepare('SELECT * FROM classes ORDER BY name').all();
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/classes', (req, res) => {
  try {
    const { school_id, shift_id, name, year } = req.body;
    if (!intParam(school_id) || !intParam(shift_id) || !name?.trim()) return fail(res, 'Dados inválidos.');
    
    // Verifica limite de turmas do plano de assinatura
    const subscriptionManager = new SubscriptionManager(getDb());
    const check = subscriptionManager.canCreateClass(school_id);
    if (!check.allowed) {
      return fail(res, check.reason, 403);
    }
    
    const result = getDb()
      .prepare('INSERT INTO classes (school_id, shift_id, name, year) VALUES (?, ?, ?, ?)')
      .run(school_id, shift_id, name.trim(), year);
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/classes/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name, year } = req.body;
    if (!id || !name?.trim()) return fail(res, 'Dados inválidos.');
    getDb().prepare('UPDATE classes SET name=?, year=? WHERE id=?').run(name.trim(), year, id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/classes/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM classes WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// COMPONENTES CURRICULARES
// ════════════════════════════════════════════════════════════════════════════════

router.get('/curricula', (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const rows = schoolId
      ? getDb().prepare('SELECT * FROM curricula WHERE school_id = ? ORDER BY name').all(schoolId)
      : getDb().prepare('SELECT * FROM curricula ORDER BY name').all();
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/curricula', (req, res) => {
  try {
    const { school_id, name, code = '', description = '' } = req.body;
    if (!intParam(school_id) || !name?.trim()) return fail(res, 'Dados inválidos.');
    const result = getDb()
      .prepare('INSERT INTO curricula (school_id, name, code, description) VALUES (?, ?, ?, ?)')
      .run(school_id, name.trim(), code.trim(), description.trim());
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/curricula/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name, code, description } = req.body;
    if (!id || !name?.trim()) return fail(res, 'Dados inválidos.');
    getDb()
      .prepare('UPDATE curricula SET name=?, code=?, description=? WHERE id=?')
      .run(name.trim(), code?.trim() || '', description?.trim() || '', id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/curricula/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM curricula WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// HORÁRIOS (TIME SLOTS)
// ════════════════════════════════════════════════════════════════════════════════

router.get('/time-slots', (req, res) => {
  try {
    const shiftId = intParam(req.query.shiftId);
    const rows = shiftId
      ? getDb().prepare('SELECT * FROM time_slots WHERE shift_id = ? ORDER BY period').all(shiftId)
      : getDb().prepare('SELECT * FROM time_slots ORDER BY period').all();
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/time-slots', (req, res) => {
  try {
    const { shift_id, period, start_time = null, end_time = null } = req.body;
    if (!intParam(shift_id) || !intParam(period)) return fail(res, 'Dados inválidos.');
    const result = getDb()
      .prepare('INSERT INTO time_slots (shift_id, period, start_time, end_time) VALUES (?, ?, ?, ?)')
      .run(shift_id, period, start_time, end_time);
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/time-slots/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { period, start_time = null, end_time = null } = req.body;
    if (!id || !intParam(period)) return fail(res, 'Dados inválidos.');
    getDb()
      .prepare('UPDATE time_slots SET period=?, start_time=?, end_time=? WHERE id=?')
      .run(period, start_time, end_time, id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/time-slots/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM time_slots WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// GRADE: COMPONENTES POR TURMA
// ════════════════════════════════════════════════════════════════════════════════

router.get('/class-curricula', (req, res) => {
  try {
    const classId = intParam(req.query.classId);
    if (!classId) return fail(res, 'classId obrigatório.');
    const rows = getDb().prepare('SELECT * FROM class_curricula WHERE class_id = ?').all(classId);
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/class-curricula', (req, res) => {
  try {
    const { class_id, curricula_id } = req.body;
    if (!intParam(class_id) || !intParam(curricula_id)) return fail(res, 'Dados inválidos.');
    const result = getDb()
      .prepare('INSERT INTO class_curricula (class_id, curricula_id) VALUES (?, ?)')
      .run(class_id, curricula_id);
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message.includes('UNIQUE') ? 'Componente já associado à turma.' : e.message); }
});

router.delete('/class-curricula/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM class_curricula WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// PROFESSOR POR COMPONENTE E TURMA
// ════════════════════════════════════════════════════════════════════════════════

router.get('/class-teacher-curricula', (req, res) => {
  try {
    const classId = intParam(req.query.classId);
    if (!classId) return fail(res, 'classId obrigatório.');
    const rows = getDb().prepare('SELECT * FROM class_teacher_curricula WHERE class_id = ?').all(classId);
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/class-teacher-curricula', (req, res) => {
  try {
    const { class_id, curricula_id, teacher_id } = req.body;
    if (!intParam(class_id) || !intParam(curricula_id) || !intParam(teacher_id)) return fail(res, 'Dados inválidos.');
    const result = getDb()
      .prepare('INSERT INTO class_teacher_curricula (class_id, curricula_id, teacher_id) VALUES (?, ?, ?)')
      .run(class_id, curricula_id, teacher_id);
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message.includes('UNIQUE') ? 'Associação já existe.' : e.message); }
});

router.delete('/class-teacher-curricula/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM class_teacher_curricula WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// DIAS DE TRABALHO DO PROFESSOR
// ════════════════════════════════════════════════════════════════════════════════

router.get('/teacher-days/:teacherId', (req, res) => {
  try {
    const id = intParam(req.params.teacherId);
    if (!id) return fail(res, 'ID inválido.');
    const rows = getDb().prepare('SELECT * FROM teacher_days WHERE teacher_id = ? ORDER BY weekday').all(id);
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/teacher-days', (req, res) => {
  try {
    const { teacher_id, weekday } = req.body;
    if (!intParam(teacher_id) || !intParam(weekday)) return fail(res, 'Dados inválidos.');
    const result = getDb()
      .prepare('INSERT INTO teacher_days (teacher_id, weekday) VALUES (?, ?)')
      .run(teacher_id, weekday);
    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, e.message.includes('UNIQUE') ? 'Dia já cadastrado.' : e.message); }
});

router.delete('/teacher-days/:id', (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    getDb().prepare('DELETE FROM teacher_days WHERE id = ?').run(id);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// LICENÇAS
// ════════════════════════════════════════════════════════════════════════════════

router.get('/licenses/status', (req, res) => {
  try {
    if (DEV_MODE) {
      const data = Object.fromEntries(
        Object.entries(AVAILABLE_MODULES).map(([id, mod]) => [
          id, { ...mod, licensed: true, devMode: true, expiresAt: null }
        ])
      );
      return ok(res, data);
    }

    const rows = getDb().prepare('SELECT module_id, expires_at FROM licenses').all();
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

router.post('/licenses/activate', (req, res) => {
  try {
    const { moduleId, licenseKey } = req.body;
    if (!AVAILABLE_MODULES[moduleId]) return fail(res, 'Módulo inválido.');
    const pattern = new RegExp(`^AULA-${moduleId.toUpperCase()}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`, 'i');
    if (!pattern.test(licenseKey?.trim() || '')) {
      return fail(res, 'Chave de licença inválida. Formato esperado: AULA-MODULO-XXXX-XXXX-XXXX');
    }
    getDb().prepare(
      `INSERT INTO licenses (module_id, license_key) VALUES (?, ?)
       ON CONFLICT(module_id) DO UPDATE SET license_key=excluded.license_key, activated_at=datetime('now'), expires_at=NULL`
    ).run(moduleId, licenseKey.trim().toUpperCase());
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/licenses/deactivate', (req, res) => {
  try {
    const { moduleId } = req.body;
    getDb().prepare('DELETE FROM licenses WHERE module_id = ?').run(moduleId);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// APP PROFESSOR - AULA.app
// ════════════════════════════════════════════════════════════════════════════════

// GET /api/teachers/:id/lessons - Horários do professor
router.get('/teachers/:id/lessons', (req, res) => {
  try {
    const teacherId = intParam(req.params.id);
    if (!teacherId) return fail(res, 'Professor ID inválido.');

    const rows = getDb().prepare(`
      SELECT DISTINCT
        l.id,
        l.weekday,
        l.period,
        cc.class_id,
        c.name as class_name,
        curr.name as curriculum_name,
        cur.name as discipline_name,
        l.classroom as room,
        l.notes
      FROM lessons l
      JOIN class_teacher_curricula ctc ON l.id = l.id
      JOIN class_curricula cc ON ctc.class_curricula_id = cc.id
      JOIN classes c ON cc.class_id = c.id
      JOIN curricula curr ON cc.curricula_id = curr.id
      JOIN curricula cur ON ctc.curricula_id = cur.id
      WHERE l.person_id = ?
      ORDER BY l.weekday, l.period
    `).all(teacherId);

    ok(res, rows || []);
  } catch (e) { fail(res, 'Erro ao carregar horários: ' + e.message, 500); }
});

// GET /api/classes/:id/lessons - Horários de uma turma
router.get('/classes/:id/lessons', (req, res) => {
  try {
    const classId = intParam(req.params.id);
    if (!classId) return fail(res, 'Turma ID inválido.');

    const rows = getDb().prepare(`
      SELECT 
        l.id,
        l.weekday,
        l.period,
        c.name as class_name,
        curr.name as curriculum_name,
        p.name as teacher_name,
        l.classroom as room,
        l.notes
      FROM lessons l
      JOIN class_teacher_curricula ctc ON l.id = l.id
      JOIN class_curricula cc ON ctc.class_curricula_id = cc.id
      JOIN classes c ON cc.class_id = c.id
      JOIN curricula curr ON cc.curricula_id = curr.id
      LEFT JOIN people p ON l.person_id = p.id
      WHERE c.id = ?
      ORDER BY l.weekday, l.period
    `).all(classId);

    ok(res, rows || []);
  } catch (e) { fail(res, 'Erro ao carregar horários: ' + e.message, 500); }
});

// GET /api/schools/:id/classes - Todas as turmas de uma escola
router.get('/schools/:schoolId/classes', (req, res) => {
  try {
    const schoolId = intParam(req.params.schoolId);
    if (!schoolId) return fail(res, 'Escola ID inválido.');

    const rows = getDb().prepare(`
      SELECT c.id, c.name, c.year, s.name as shift_name
      FROM classes c
      JOIN shifts s ON c.shift_id = s.id
      WHERE c.school_id = ?
      ORDER BY c.name
    `).all(schoolId);

    ok(res, rows || []);
  } catch (e) { fail(res, 'Erro ao carregar turmas: ' + e.message, 500); }
});

// GET /api/schools/:id/resources - Recursos disponíveis para agendamento
router.get('/schools/:schoolId/resources', (req, res) => {
  try {
    const schoolId = intParam(req.params.schoolId);
    if (!schoolId) return fail(res, 'Escola ID inválido.');

    const rows = getDb().prepare(`
      SELECT id, name, type, capacity, description
      FROM resources
      WHERE school_id = ?
      ORDER BY type, name
    `).all(schoolId);

    ok(res, rows || []);
  } catch (e) { fail(res, 'Erro ao carregar recursos: ' + e.message, 500); }
});

// POST /api/bookings - Criar agendamento de recurso
router.post('/bookings', (req, res) => {
  try {
    const { resource_id, teacher_id, class_id, weekday, period, date, description } = req.body;
    
    if (!intParam(resource_id) || !intParam(teacher_id) || !intParam(class_id)) {
      return fail(res, 'Dados inválidos.');
    }

    // Verifica se já existe agendamento no mesmo slot
    const existing = getDb().prepare(`
      SELECT id FROM bookings 
      WHERE resource_id = ? AND weekday = ? AND period = ? AND date = ?
      LIMIT 1
    `).get(resource_id, weekday, period, date);

    if (existing) {
      return fail(res, 'Este recurso já está agendado neste horário.');
    }

    const result = getDb().prepare(`
      INSERT INTO bookings (resource_id, teacher_id, class_id, weekday, period, date, description, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmado')
    `).run(resource_id, teacher_id, class_id, weekday, period, date, description || '');

    ok(res, { id: result.lastInsertRowid });
  } catch (e) { fail(res, 'Erro ao agendar recurso: ' + e.message, 500); }
});

// GET /api/bookings/teacher/:id - Agendamentos de um professor
router.get('/bookings/teacher/:teacherId', (req, res) => {
  try {
    const teacherId = intParam(req.params.teacherId);
    if (!teacherId) return fail(res, 'Professor ID inválido.');

    const rows = getDb().prepare(`
      SELECT 
        b.id, b.resource_id, b.class_id, b.weekday, b.period, b.date, b.description, b.status,
        r.name as resource_name, r.type as resource_type,
        c.name as class_name,
        b.created_at
      FROM bookings b
      JOIN resources r ON b.resource_id = r.id
      JOIN classes c ON b.class_id = c.id
      WHERE b.teacher_id = ?
      ORDER BY b.date DESC, b.period DESC
      LIMIT 50
    `).all(teacherId);

    ok(res, rows || []);
  } catch (e) { fail(res, 'Erro ao carregar agendamentos: ' + e.message, 500); }
});

// DELETE /api/bookings/:id - Cancelar agendamento
router.delete('/bookings/:id', (req, res) => {
  try {
    const bookingId = intParam(req.params.id);
    if (!bookingId) return fail(res, 'Agendamento ID inválido.');

    const booking = getDb().prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) return fail(res, 'Agendamento não encontrado.');

    // Verifica permissão (apenas o professor pode cancelar seu próprio agendamento)
    const token = req.headers['x-aula-token'];
    if (!token) return fail(res, 'Token não fornecido.', 401);

    const session = getDb().prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    if (!session || session.person_id !== booking.teacher_id) {
      return fail(res, 'Sem permissão para cancelar este agendamento.', 403);
    }

    getDb().prepare('UPDATE bookings SET status = ? WHERE id = ?').run('cancelado', bookingId);
    ok(res);
  } catch (e) { fail(res, 'Erro ao cancelar agendamento: ' + e.message, 500); }
});

// GET /api/resources/:id/schedule - Agendamentos de um recurso
router.get('/resources/:id/schedule', (req, res) => {
  try {
    const resourceId = intParam(req.params.id);
    if (!resourceId) return fail(res, 'Recurso ID inválido.');

    const rows = getDb().prepare(`
      SELECT 
        b.id, b.weekday, b.period, b.date, b.status,
        p.name as teacher_name,
        c.name as class_name,
        b.description
      FROM bookings b
      LEFT JOIN people p ON b.teacher_id = p.id
      LEFT JOIN classes c ON b.class_id = c.id
      WHERE b.resource_id = ? AND b.status = 'confirmado'
      ORDER BY b.date, b.period
    `).all(resourceId);

    ok(res, rows || []);
  } catch (e) { fail(res, 'Erro ao carregar schedule: ' + e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS - AULA.app
// ════════════════════════════════════════════════════════════════════════════════

const PushNotificationManager = require('../utils/push-notifications');
const pushManager = new PushNotificationManager(getDb);

// POST /api/notifications/subscribe - Registrar device para notificações
router.post('/notifications/subscribe', (req, res) => {
  try {
    const { teacherId, subscription } = req.body;
    if (!intParam(teacherId) || !subscription) {
      return fail(res, 'Dados inválidos.');
    }

    const result = pushManager.subscribe(intParam(teacherId), JSON.stringify(subscription));
    if (result.success) {
      ok(res, { subscribed: true });
    } else {
      fail(res, result.error);
    }
  } catch (e) { fail(res, 'Erro ao registrar notificações: ' + e.message, 500); }
});

// POST /api/notifications/unsubscribe - Desregistrar device
router.post('/notifications/unsubscribe', (req, res) => {
  try {
    const { teacherId, subscription } = req.body;
    if (!intParam(teacherId) || !subscription) {
      return fail(res, 'Dados inválidos.');
    }

    const result = pushManager.unsubscribe(intParam(teacherId), JSON.stringify(subscription));
    ok(res, { unsubscribed: result.success });
  } catch (e) { fail(res, 'Erro ao desregistrar notificações: ' + e.message, 500); }
});

// POST /api/notifications/test - Enviar notificação de teste
router.post('/notifications/test', (req, res) => {
  try {
    const { teacherId } = req.body;
    if (!intParam(teacherId)) return fail(res, 'Professor ID inválido.');

    pushManager.sendNotification(
      intParam(teacherId),
      '🧪 Notificação de Teste',
      'Parabéns! Suas notificações estão funcionando.'
    ).then(() => {
      ok(res, { sent: true });
    }).catch(e => {
      fail(res, e.message);
    });
  } catch (e) { fail(res, 'Erro ao enviar notificação: ' + e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════════
// ASSINATURAS E PLANOS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/subscription/:schoolId
 * Retorna informações da assinatura atual e estatísticas de uso
 */
router.get('/subscription/:schoolId', (req, res) => {
  try {
    const schoolId = intParam(req.params.schoolId);
    if (!schoolId) return fail(res, 'School ID inválido.');
    
    const subscriptionManager = new SubscriptionManager(getDb());
    const subscription = subscriptionManager.getSubscription(schoolId);
    
    if (!subscription) {
      return fail(res, 'Assinatura não encontrada.', 404);
    }
    
    const usage = subscriptionManager.getUsageStats(schoolId);
    const isActive = subscriptionManager.isActive(subscription);
    
    ok(res, {
      subscription,
      usage,
      isActive,
      planDetails: subscriptionManager.getPlanDetails(subscription.plan_type)
    });
  } catch (e) { fail(res, e.message, 500); }
});

/**
 * POST /api/subscription/create
 * Cria uma nova assinatura para uma escola
 * Body: { schoolId, planType }
 */
router.post('/subscription/create', (req, res) => {
  try {
    const { schoolId, planType } = req.body;
    if (!intParam(schoolId) || !planType) {
      return fail(res, 'Dados inválidos. schoolId e planType são obrigatórios.');
    }
    
    const validPlans = ['free', 'starter', 'pro', 'plus', 'cloud', 'online_basic', 'online_premium'];
    if (!validPlans.includes(planType)) {
      return fail(res, `Plano inválido. Opções: ${validPlans.join(', ')}.`);
    }
    
    const subscriptionManager = new SubscriptionManager(getDb());
    const subscriptionId = subscriptionManager.createSubscription(schoolId, planType);
    
    ok(res, {
      subscriptionId,
      message: 'Assinatura criada com sucesso.'
    });
  } catch (e) { fail(res, e.message, 500); }
});

/**
 * POST /api/subscription/upgrade
 * Faz upgrade do plano de uma assinatura
 * Body: { subscriptionId, newPlanType }
 */
router.post('/subscription/upgrade', (req, res) => {
  try {
    const { subscriptionId, newPlanType } = req.body;
    if (!intParam(subscriptionId) || !newPlanType) {
      return fail(res, 'Dados inválidos.');
    }
    
    const subscriptionManager = new SubscriptionManager(getDb());
    subscriptionManager.upgradePlan(subscriptionId, newPlanType);
    
    ok(res, { message: 'Plano atualizado com sucesso.' });
  } catch (e) { fail(res, e.message, 500); }
});

/**
 * POST /api/subscription/payment
 * Registra um pagamento de mensalidade/anuidade
 * Body: { subscriptionId, amount, notes }
 */
router.post('/subscription/payment', (req, res) => {
  try {
    const { subscriptionId, amount, notes = '' } = req.body;
    if (!intParam(subscriptionId) || !amount || amount <= 0) {
      return fail(res, 'Dados inválidos. subscriptionId e amount são obrigatórios.');
    }
    
    const subscriptionManager = new SubscriptionManager(getDb());
    subscriptionManager.recordPayment(subscriptionId, amount, notes);
    
    ok(res, { message: 'Pagamento registrado com sucesso.' });
  } catch (e) { fail(res, e.message, 500); }
});

/**
 * POST /api/subscription/franchise-payment
 * Registra pagamento da franquia (plano Cloud)
 * Body: { subscriptionId, amount }
 */
router.post('/subscription/franchise-payment', (req, res) => {
  try {
    const { subscriptionId, amount } = req.body;
    if (!intParam(subscriptionId) || !amount || amount <= 0) {
      return fail(res, 'Dados inválidos.');
    }
    
    const subscriptionManager = new SubscriptionManager(getDb());
    subscriptionManager.recordFranchisePayment(subscriptionId, amount);
    
    ok(res, { message: 'Pagamento de franquia registrado com sucesso.' });
  } catch (e) { fail(res, e.message, 500); }
});

/**
 * GET /api/subscription/history/:subscriptionId
 * Retorna histórico de mudanças da assinatura
 */
router.get('/subscription/history/:subscriptionId', (req, res) => {
  try {
    const subscriptionId = intParam(req.params.subscriptionId);
    if (!subscriptionId) return fail(res, 'Subscription ID inválido.');
    
    const subscriptionManager = new SubscriptionManager(getDb());
    const history = subscriptionManager.getHistory(subscriptionId);
    
    ok(res, history);
  } catch (e) { fail(res, e.message, 500); }
});

/**
 * GET /api/subscription/plans
 * Retorna informações de todos os planos disponíveis
 */
router.get('/subscription/plans', (req, res) => {
  try {
    const subscriptionManager = new SubscriptionManager(getDb());
    const plans = ['free', 'starter', 'pro', 'plus', 'cloud', 'online_basic', 'online_premium'].map(planType => 
      subscriptionManager.getPlanDetails(planType)
    );
    
    ok(res, plans);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;
