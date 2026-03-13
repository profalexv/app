/**
 * src/web/routes/ponto.routes.js
 *
 * Rotas para o addon Ponto — Registro de Ponto de Funcionário.
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');
const { ok, fail, intParam } = require('./route-helpers');
const bcrypt = require('bcryptjs');
const express = require('express');
const fs = require('fs');
const path = require('path');

const DEV_MODE = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

/** Middleware: verifica se a escola tem o addon ponto ativo */
async function requirePontoAccess(req, res, next) {
  try {
    const schoolId = intParam(req.query.schoolId || req.body?.school_id || req.params?.schoolId);
    if (!schoolId) return fail(res, 'schoolId obrigatório.', 400);
    if (DEV_MODE) return next();
    const sub = await getDb()('ponto_addon_subscriptions')
      .where({ school_id: schoolId, status: 'active' }).first();
    if (!sub) return fail(res, 'Addon Ponto não contratado.', 403);
    req.pontoSub = sub;
    next();
  } catch (e) { fail(res, e.message, 500); }
}

// GET /status?schoolId=X — verifica acesso + info do plano
router.get('/status', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    if (!schoolId) return fail(res, 'schoolId obrigatório.');
    const sub = await getDb()('ponto_addon_subscriptions')
      .where({ school_id: schoolId }).first();
    const [{ cnt }] = await getDb()('ponto_employees')
      .where({ school_id: schoolId, active: true }).count('id as cnt');
    const employeeCount = parseInt(cnt, 10);
    if (!sub || sub.status !== 'active') {
      if (DEV_MODE) {
        return ok(res, { active: true, devMode: true, plan: 'maximo', maxEmployees: 0, employeeCount });
      }
      return ok(res, { active: false, plan: null, maxEmployees: 0, employeeCount });
    }
    ok(res, { active: true, plan: sub.plan_type, maxEmployees: sub.max_employees, employeeCount, expiresAt: sub.expires_at });
  } catch (e) { fail(res, e.message, 500); }
});

// POST /subscribe — ativa/cria assinatura do addon
router.post('/subscribe', async (req, res) => {
  try {
    const { school_id, plan_type = 'mini' } = req.body;
    if (!intParam(school_id)) return fail(res, 'school_id obrigatório.');
    const VALID = ['per_employee', 'mini', 'pronto', 'maximo'];
    if (!VALID.includes(plan_type)) return fail(res, `Plano inválido. Opções: ${VALID.join(', ')}.`);
    const maxMap = { per_employee: 0, mini: 30, pronto: 80, maximo: 0 };
    const existing = await getDb()('ponto_addon_subscriptions').where({ school_id }).first();
    if (existing) {
      await getDb()('ponto_addon_subscriptions').where({ school_id })
        .update({ plan_type, max_employees: maxMap[plan_type], status: 'active', activated_at: new Date().toISOString() });
      return ok(res, { message: 'Assinatura atualizada.' });
    }
    const [row] = await getDb()('ponto_addon_subscriptions').insert({
      school_id, plan_type, max_employees: maxMap[plan_type], status: 'active',
    }).returning('id');
    ok(res, { id: row.id ?? row, message: 'Addon Ponto ativado.' });
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /subscribe/cancel — cancela assinatura
router.put('/subscribe/cancel', async (req, res) => {
  try {
    const { school_id } = req.body;
    if (!intParam(school_id)) return fail(res, 'school_id obrigatório.');
    await getDb()('ponto_addon_subscriptions').where({ school_id }).update({ status: 'inactive' });
    ok(res, { message: 'Assinatura cancelada.' });
  } catch (e) { fail(res, e.message, 500); }
});

// ── Funcionários ─────────────────────────────────────────────────────────────

router.get('/employees', requirePontoAccess, async (req, res) => {
  try {
    const schoolId      = intParam(req.query.schoolId);
    const includeDeleted = req.query.includeDeleted === 'true';
    let q = getDb()('ponto_employees')
      .where({ school_id: schoolId })
      .orderBy('name')
      .select('id','name','cpf','email','role','department','active','gps_consent','gps_consent_at','created_at');
    if (!includeDeleted) q = q.whereNull('deleted_at');
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/employees', requirePontoAccess, async (req, res) => {
  try {
    const { school_id, name, cpf = '', email = '', role = '', department = '', pin = '' } = req.body;
    if (!intParam(school_id) || !name?.trim()) return fail(res, 'name obrigatório.');

    // Verifica limite do plano
    if (!DEV_MODE && req.pontoSub?.max_employees > 0) {
      const [{ cnt }] = await getDb()('ponto_employees')
        .where({ school_id, active: true }).count('id as cnt');
      if (parseInt(cnt, 10) >= req.pontoSub.max_employees)
        return fail(res, `Limite de ${req.pontoSub.max_employees} funcionários atingido no plano atual.`, 403);
    }

    // Hash do PIN se informado (bcrypt)
    let pinHash = null;
    if (pin?.trim()) {
      pinHash = await bcrypt.hash(String(pin).trim(), 10);
    }

    const [row] = await getDb()('ponto_employees').insert({
      school_id, name: name.trim(), cpf: cpf.trim(), email: email.trim(),
      role: role.trim(), department: department.trim(),
      pin: pinHash,
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/employees/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const { name, cpf, email, role, department, active, gps_consent } = req.body;
    const fields = {};
    if (name !== undefined)        fields.name        = name.trim();
    if (cpf !== undefined)         fields.cpf         = cpf.trim();
    if (email !== undefined)       fields.email       = email.trim();
    if (role !== undefined)        fields.role        = role.trim();
    if (department !== undefined)  fields.department  = department.trim();
    if (active !== undefined)      fields.active      = !!active;
    // LGPD: registra data/hora do consentimento para GPS
    if (gps_consent !== undefined) {
      fields.gps_consent    = !!gps_consent;
      fields.gps_consent_at = gps_consent ? new Date().toISOString() : null;
    }
    // Hash do PIN se informado
    if (req.body.pin !== undefined && req.body.pin !== null) {
      fields.pin = req.body.pin?.trim() ? await bcrypt.hash(String(req.body.pin).trim(), 10) : null;
    }
    if (!Object.keys(fields).length) return fail(res, 'Nenhum campo para atualizar.');
    await getDb()('ponto_employees').where({ id }).update(fields);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// Soft-delete: nunca exclui fisicamente para garantir retenção de 5 anos (CLT Art. 11)
// e integridade dos registros de ponto vinculados (RESTRICT no FK).
router.delete('/employees/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const emp = await getDb()('ponto_employees').where({ id }).first();
    if (!emp) return fail(res, 'Funcionário não encontrado.', 404);
    await getDb()('ponto_employees').where({ id }).update({ active: false, deleted_at: new Date().toISOString() });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ── Registros de Ponto ────────────────────────────────────────────────────────
// ATENÇÃO: registros de ponto são IMUTÁVEIS conforme CLT Art. 74 / Portaria 671.
// Nunca deletar — apenas cancelar com motivo documentado via PUT /records/:id/cancel

router.get('/records', async (req, res) => {
  try {
    const schoolId       = intParam(req.query.schoolId);
    const employeeId     = intParam(req.query.employeeId);
    const dateFrom       = req.query.dateFrom;
    const dateTo         = req.query.dateTo;
    const includeCancelled = req.query.includeCancelled === 'true';
    if (!schoolId) return fail(res, 'schoolId obrigatório.');

    let q = getDb()('ponto_records as r')
      .join('ponto_employees as e', 'e.id', 'r.employee_id')
      .where('r.school_id', schoolId)
      .select(
        'r.id','r.employee_id','e.name as employee_name',
        'r.type','r.punched_at','r.source','r.notes',
        'r.cancelled','r.cancelled_at','r.cancelled_by','r.cancel_reason',
        // GPS só retorna se funcionário deu consentimento (LGPD)
        getDb().raw('CASE WHEN e.gps_consent THEN r.latitude  ELSE NULL END as latitude'),
        getDb().raw('CASE WHEN e.gps_consent THEN r.longitude ELSE NULL END as longitude'),
      )
      .orderBy('r.punched_at', 'desc');

    if (!includeCancelled) q = q.where('r.cancelled', false);
    if (employeeId) q = q.where('r.employee_id', employeeId);
    if (dateFrom)   q = q.where('r.punched_at', '>=', dateFrom);
    if (dateTo)     q = q.where('r.punched_at', '<=', dateTo + 'T23:59:59Z');

    ok(res, await q.limit(500));
  } catch (e) { fail(res, e.message, 500); }
});

// POST /records — bater ponto
// Portaria 671: sistema deve identificar o trabalhador (PIN hash verificado).
router.post('/records', async (req, res) => {
  try {
    const { employee_id, school_id, type, pin, latitude = null, longitude = null, source = 'browser', notes = '' } = req.body;
    const VALID_TYPES = ['entrada', 'saida', 'pausa_inicio', 'pausa_fim'];
    if (!intParam(employee_id) || !intParam(school_id) || !VALID_TYPES.includes(type))
      return fail(res, 'Dados inválidos. type deve ser: ' + VALID_TYPES.join(', '));

    // Valida funcionário ativo
    const emp = await getDb()('ponto_employees')
      .where({ id: employee_id, school_id, active: true })
      .whereNull('deleted_at')
      .first();
    if (!emp) return fail(res, 'Funcionário não encontrado.', 404);

    // Verifica PIN se o funcionário possui um cadastrado (Portaria 671: identificação)
    if (emp.pin) {
      if (!pin) return fail(res, 'PIN obrigatório para este funcionário.', 401);
      const valid  = await bcrypt.compare(String(pin), emp.pin);
      if (!valid) return fail(res, 'PIN incorreto.', 401);
    }

    // Validação de sequência: evita saída sem entrada, dupla entrada, etc.
    const lastRecord = await getDb()('ponto_records')
      .where({ employee_id, school_id, cancelled: false })
      .orderBy('punched_at', 'desc')
      .first();
    const lastType = lastRecord?.type ?? null;
    const SEQUENCE_ERROR = {
      entrada:      lastType === 'entrada'      ? 'Já há uma entrada em aberto. Registre saída ou pausa primeiro.' : null,
      saida:        lastType === 'saida'        ? 'Já há uma saída registrada.' :
                    lastType === null            ? 'Não há entrada registrada para encerrar.' : null,
      pausa_inicio: lastType !== 'entrada'      ? 'Pausa só pode ser registrada após uma entrada.' : null,
      pausa_fim:    lastType !== 'pausa_inicio' ? 'Fim de pausa só pode ser registrado após início de pausa.' : null,
    };
    const seqErr = SEQUENCE_ERROR[type];
    if (seqErr) return fail(res, seqErr, 422);

    // GPS: só armazena se funcionário deu consentimento (LGPD Art. 7)
    const storeGps = emp.gps_consent;

    const [row] = await getDb()('ponto_records').insert({
      employee_id, school_id, type,
      punched_at: new Date().toISOString(),
      latitude:  (storeGps && latitude  != null) ? parseFloat(latitude)  : null,
      longitude: (storeGps && longitude != null) ? parseFloat(longitude) : null,
      source, notes: notes.trim(),
    }).returning('id');
    ok(res, { id: row.id ?? row, punched_at: new Date().toISOString() });
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /records/:id/cancel — cancela registro com motivo documentado
// Registros NUNCA são deletados (CLT Art. 74 / Portaria 671 — imutabilidade).
// Apenas gestores autorizados podem cancelar; motivo é obrigatório para auditoria.
router.put('/records/:id/cancel', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const { cancelled_by, cancel_reason } = req.body;
    if (!cancelled_by?.trim() || !cancel_reason?.trim())
      return fail(res, 'cancelled_by e cancel_reason são obrigatórios para cancelamento.', 400);

    const record = await getDb()('ponto_records').where({ id }).first();
    if (!record)                return fail(res, 'Registro não encontrado.', 404);
    if (record.cancelled)       return fail(res, 'Registro já está cancelado.');

    await getDb()('ponto_records').where({ id }).update({
      cancelled:    true,
      cancelled_at: new Date().toISOString(),
      cancelled_by: cancelled_by.trim(),
      cancel_reason: cancel_reason.trim(),
    });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// GET /records/export-afd?schoolId=X&dateFrom=Y&dateTo=Z
// Exporta arquivo AFD (Arquivo Fonte de Dados) simplificado para fiscalização MTP
// conforme Portaria 671/2021. Formato de referência: NSR | tipo | data | funcionário
router.get('/records/export-afd', requirePontoAccess, async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const dateFrom = req.query.dateFrom;
    const dateTo   = req.query.dateTo;
    if (!schoolId) return fail(res, 'schoolId obrigatório.');

    const school = await getDb()('app_schools').where({ id: schoolId }).first();
    const records = await getDb()('ponto_records as r')
      .join('ponto_employees as e', 'e.id', 'r.employee_id')
      .where('r.school_id', schoolId)
      .where('r.cancelled', false)
      .modify(q => {
        if (dateFrom) q.where('r.punched_at', '>=', dateFrom);
        if (dateTo)   q.where('r.punched_at', '<=', dateTo + 'T23:59:59Z');
      })
      .orderBy('r.punched_at', 'asc')
      .select('r.id','r.type','r.punched_at','r.source','e.name','e.cpf');

    // Cabeçalho
    const lines = [
      `010${String(schoolId).padStart(8,'0')}${(school?.name || 'Escola').substring(0,150).padEnd(150)}`.substring(0, 170),
    ];
    // Registros (tipo 3 = marcação de ponto — simplificado)
    records.forEach((r, i) => {
      const nsr    = String(i + 1).padStart(9, '0');
      const dt     = new Date(r.punched_at);
      const data   = `${String(dt.getDate()).padStart(2,'0')}${String(dt.getMonth()+1).padStart(2,'0')}${dt.getFullYear()}`;
      const hora   = `${String(dt.getHours()).padStart(2,'0')}${String(dt.getMinutes()).padStart(2,'0')}`;
      const cpf    = (r.cpf || '').replace(/\D/g, '').padStart(11, '0').substring(0, 11);
      const nome   = (r.name || '').substring(0, 52).padEnd(52);
      const tipo   = r.type.substring(0, 12).padEnd(12);
      lines.push(`3${nsr}${data}${hora}${cpf}${nome}${tipo}`);
    });
    // Rodapé
    lines.push(`9${String(records.length).padStart(9,'0')}`);

    const content = lines.join('\r\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="AFD_${schoolId}_${dateFrom || 'all'}.txt"`);
    res.send(content);
  } catch (e) { fail(res, e.message, 500); }
});

// GET /today?schoolId=X — resumo do dia
router.get('/today', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    if (!schoolId) return fail(res, 'schoolId obrigatório.');
    const today = new Date().toISOString().slice(0, 10);
    const records = await getDb()('ponto_records as r')
      .join('ponto_employees as e', 'e.id', 'r.employee_id')
      .where('r.school_id', schoolId)
      .whereRaw(`DATE(r.punched_at) = ?`, [today])
      .select('r.id','r.employee_id','e.name as employee_name','r.type','r.punched_at','r.source','r.latitude','r.longitude')
      .orderBy('r.punched_at', 'asc');
    ok(res, records);
  } catch (e) { fail(res, e.message, 500); }
});

// ── Vistos Diários de Supervisão ────────────────────────────────────

// GET /verifications?schoolId=X&employeeId=Y&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
router.get('/verifications', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    if (!schoolId) return fail(res, 'schoolId obrigatório.');
    const q = getDb()('ponto_record_verifications as v')
      .join('ponto_employees as e', 'e.id', 'v.employee_id')
      .where('v.school_id', schoolId)
      .select('v.*', 'e.name as employee_name')
      .orderBy('v.record_date', 'desc');
    if (req.query.employeeId) q.where('v.employee_id', intParam(req.query.employeeId));
    if (req.query.dateFrom)   q.where('v.record_date', '>=', req.query.dateFrom);
    if (req.query.dateTo)     q.where('v.record_date', '<=', req.query.dateTo);
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /verifications — cria ou atualiza visto diário (upsert por employee+date)
router.post('/verifications', async (req, res) => {
  try {
    const { school_id, employee_id, record_date, verified_by, status, notes } = req.body;
    if (!school_id || !employee_id || !record_date || !verified_by || !status)
      return fail(res, 'Campos obrigatórios: school_id, employee_id, record_date, verified_by, status.');
    if (!['pendente','validado','inconsistente'].includes(status))
      return fail(res, 'Status inválido. Use: pendente, validado ou inconsistente.');
    if (status === 'inconsistente' && !notes?.trim())
      return fail(res, 'Justificativa obrigatória quando status é "inconsistente".');
    const payload = {
      school_id, employee_id, record_date, verified_by, status,
      notes: notes?.trim() || null, verified_at: new Date(),
    };
    const existing = await getDb()('ponto_record_verifications')
      .where({ employee_id, record_date }).first();
    let row;
    if (existing) {
      await getDb()('ponto_record_verifications').where('id', existing.id).update(payload);
      row = await getDb()('ponto_record_verifications').where('id', existing.id).first();
    } else {
      [row] = await getDb()('ponto_record_verifications').insert(payload).returning('*');
    }
    ok(res, row);
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /verifications/:id — atualiza visto existente
router.put('/verifications/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { status, notes, verified_by } = req.body;
    if (status && !['pendente','validado','inconsistente'].includes(status))
      return fail(res, 'Status inválido.');
    if (status === 'inconsistente' && !notes?.trim())
      return fail(res, 'Justificativa obrigatória quando status é "inconsistente".');
    const update = { verified_at: new Date() };
    if (status)      update.status      = status;
    if (notes)       update.notes       = notes.trim();
    if (verified_by) update.verified_by = verified_by;
    await getDb()('ponto_record_verifications').where('id', id).update(update);
    ok(res, await getDb()('ponto_record_verifications').where('id', id).first());
  } catch (e) { fail(res, e.message, 500); }
});

// ── Assinaturas Mensais da Folha ────────────────────────────────────

// GET /signatures?schoolId=X&employeeId=Y&periodMonth=YYYY-MM
router.get('/signatures', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    if (!schoolId) return fail(res, 'schoolId obrigatório.');
    const q = getDb()('ponto_signatures as s')
      .join('ponto_employees as e', 'e.id', 's.employee_id')
      .where('s.school_id', schoolId)
      .select('s.*', 'e.name as employee_name')
      .orderBy(['s.period_month', 'e.name']);
    if (req.query.employeeId)  q.where('s.employee_id', intParam(req.query.employeeId));
    if (req.query.periodMonth) q.where('s.period_month', req.query.periodMonth);
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /signatures — cria registro pendente para um mês (idempotente)
router.post('/signatures', async (req, res) => {
  try {
    const { school_id, employee_id, period_month } = req.body;
    if (!school_id || !employee_id || !period_month)
      return fail(res, 'Campos obrigatórios: school_id, employee_id, period_month.');
    if (!/^\d{4}-\d{2}$/.test(period_month))
      return fail(res, 'period_month deve estar no formato YYYY-MM.');
    const existing = await getDb()('ponto_signatures').where({ employee_id, period_month }).first();
    if (existing) return ok(res, existing);
    const [row] = await getDb()('ponto_signatures')
      .insert({ school_id, employee_id, period_month })
      .returning('*');
    ok(res, row);
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /signatures/:id/electronic-sign
// Aceite eletrônico: grava o próprio funcionário como validador + horário do clique
router.put('/signatures/:id/electronic-sign', async (req, res) => {
  try {
    const id  = intParam(req.params.id);
    const sig = await getDb()('ponto_signatures').where('id', id).first();
    if (!sig) return fail(res, 'Registro não encontrado.', 404);
    if (sig.method) return fail(res, 'Esta folha já foi assinada.');
    // Funcionário é o próprio validador do aceite eletrônico
    const emp = await getDb()('ponto_employees').where('id', sig.employee_id).first();
    if (!emp) return fail(res, 'Funcionário não encontrado.', 404);
    const now = new Date();
    await getDb()('ponto_signatures').where('id', id).update({
      method:                'electronic',
      signed_at:             now,
      signed_by_name:        emp.name,
      signed_by_employee_id: emp.id,
      validates_all_records: true,
    });
    ok(res, await getDb()('ponto_signatures').where('id', id).first());
  } catch (e) { fail(res, e.message, 500); }
});

// POST /signatures/:id/upload — envio do scan físico (base64 no body)
router.post('/signatures/:id/upload', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { fileData, fileName, uploadedBy } = req.body;
    if (!fileData || !fileName || !uploadedBy)
      return fail(res, 'Campos obrigatórios: fileData (base64), fileName, uploadedBy.');
    const sig = await getDb()('ponto_signatures').where('id', id).first();
    if (!sig) return fail(res, 'Registro não encontrado.', 404);
    if (sig.method) return fail(res, 'Esta folha já foi assinada.');
    const dir  = path.join(__dirname, '..', '..', 'uploads', 'ponto-scans',
      String(sig.school_id), String(sig.employee_id));
    fs.mkdirSync(dir, { recursive: true });
    const safeName   = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    const filePath   = path.join(dir, `${sig.period_month}_${safeName}`);
    const fileBuffer = Buffer.from(fileData, 'base64');
    fs.writeFileSync(filePath, fileBuffer);
    const relPath = path.relative(path.join(__dirname, '..', '..'), filePath);
    const now = new Date();
    await getDb()('ponto_signatures').where('id', id).update({
      method:               'physical',
      file_path:            relPath,
      uploaded_by:          uploadedBy,
      uploaded_at:          now,
      validates_all_records: true,
    });
    ok(res, await getDb()('ponto_signatures').where('id', id).first());
  } catch (e) { fail(res, e.message, 500); }
});

// ── Configurações de Assinatura da Escola ───────────────────────────

// GET /settings?schoolId=X
router.get('/settings', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    if (!schoolId) return fail(res, 'schoolId obrigatório.');
    let settings = await getDb()('ponto_school_settings').where('school_id', schoolId).first();
    if (!settings) {
      // Retorna defaults sem persistir
      settings = { school_id: schoolId, allow_electronic_signature: true, allow_physical_signature: true };
    }
    ok(res, settings);
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /settings — atualiza configurações (upsert)
router.put('/settings', async (req, res) => {
  try {
    const { school_id, allow_electronic_signature, allow_physical_signature } = req.body;
    if (!school_id) return fail(res, 'school_id obrigatório.');
    const allowElectronic = allow_electronic_signature !== false;
    const allowPhysical   = allow_physical_signature   !== false;
    if (!allowElectronic && !allowPhysical)
      return fail(res, 'Pelo menos um método de assinatura deve ser permitido.');
    const payload = {
      allow_electronic_signature: allowElectronic,
      allow_physical_signature:   allowPhysical,
      updated_at: new Date(),
    };
    const existing = await getDb()('ponto_school_settings').where('school_id', school_id).first();
    if (existing) {
      await getDb()('ponto_school_settings').where('school_id', school_id).update(payload);
    } else {
      await getDb()('ponto_school_settings').insert({ school_id, ...payload });
    }
    ok(res, await getDb()('ponto_school_settings').where('school_id', school_id).first());
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;