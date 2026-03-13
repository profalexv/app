/**
 * src/web/routes/escolar.routes.js
 *
 * ADDON ESCOLAR — Chamada de Presença, Diário do Professor, Ocorrências
 *
 * Planos:
 *   lite  — até 10 turmas  — R$ 560/mês   + R$50/turma excedente
 *   basic — até 30 turmas  — R$ 980/mês   + R$42/turma excedente
 *   flex  — até 60 turmas  — R$ 1.790/mês + R$28/turma excedente
 *   total — ilimitado (unidade) · rede: até 100 turmas — R$ 2.600/mês + R$23/turma excedente
 *
 * Tabelas (migrations em motor/supabase/migrations/):
 *   escolar_addon_subscriptions  — assinatura do addon por escola
 *   students                     — alunos da escola
 *   class_students               — matrícula (aluno ↔ turma)
 *   attendance_records           — chamada diária + diário do professor
 *   occurrence_records           — ocorrências por aluno / turma / professor
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');
const { ok, fail, intParam } = require('./route-helpers');

const DEV_MODE = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

const ESCOLAR_PLANS = {
  lite:  { maxClasses: 10,  basePrice: 56000,  extraPricePerClass: 4300 },
  basic: { maxClasses: 30,  basePrice: 98000,  extraPricePerClass: 3400 },
  flex:  { maxClasses: 60,  basePrice: 179000, extraPricePerClass: 2800 },
  total: { maxClasses: 0,   basePrice: 260000, extraPricePerClass: 2300, networkMaxClasses: 100 },
};

// ── Middleware: exige addon ativo ────────────────────────────────────────────
async function requireEscolar(req, res, next) {
  try {
    const schoolId = intParam(
      req.query.schoolId || req.body?.school_id || req.params?.schoolId
    );
    if (!schoolId) return fail(res, 'schoolId obrigatório.', 400);
    if (DEV_MODE) return next();
    const sub = await getDb()('escolar_addon_subscriptions')
      .where({ school_id: schoolId, status: 'active' }).first();
    if (!sub) return fail(res, 'Addon Escolar não contratado.', 403);
    req.escolarSub = sub;
    next();
  } catch (e) { fail(res, e.message, 500); }
}

// ════════════════════════════════════════════════════════════════════════════
// ASSINATURA
// ════════════════════════════════════════════════════════════════════════════

// GET /escolar/status?schoolId=X
router.get('/status', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    if (!schoolId) return fail(res, 'schoolId obrigatório.');
    const sub = await getDb()('escolar_addon_subscriptions')
      .where({ school_id: schoolId }).first();
    const [{ cnt }] = await getDb()('classes')
      .where({ school_id: schoolId, active: true }).count('id as cnt');
    const classCount = parseInt(cnt, 10);
    if (!sub || sub.status !== 'active') {
      if (DEV_MODE) return ok(res, { active: true, devMode: true, plan: 'total', maxClasses: 0, classCount });
      return ok(res, { active: false, plan: null, maxClasses: 0, classCount });
    }
    ok(res, {
      active: true, plan: sub.plan_type,
      maxClasses: sub.max_classes, classCount,
      activatedAt: sub.activated_at, expiresAt: sub.expires_at,
    });
  } catch (e) { fail(res, e.message, 500); }
});

// POST /escolar/subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const { school_id, plan_type = 'lite' } = req.body;
    if (!intParam(school_id)) return fail(res, 'school_id obrigatório.');
    if (!ESCOLAR_PLANS[plan_type]) return fail(res, `Plano inválido. Opções: lite, basic, total.`);
    const plan = ESCOLAR_PLANS[plan_type];
    const existing = await getDb()('escolar_addon_subscriptions').where({ school_id }).first();
    if (existing) {
      await getDb()('escolar_addon_subscriptions').where({ school_id }).update({
        plan_type, status: 'active', max_classes: plan.maxClasses,
        activated_at: new Date().toISOString(), expires_at: null,
      });
    } else {
      await getDb()('escolar_addon_subscriptions').insert({
        school_id, plan_type, status: 'active',
        max_classes: plan.maxClasses,
        activated_at: new Date().toISOString(), expires_at: null,
      });
    }
    ok(res, { plan: plan_type, maxClasses: plan.maxClasses });
  } catch (e) { fail(res, e.message, 500); }
});

// POST /escolar/cancel
router.post('/cancel', async (req, res) => {
  try {
    const { school_id } = req.body;
    if (!intParam(school_id)) return fail(res, 'school_id obrigatório.');
    await getDb()('escolar_addon_subscriptions')
      .where({ school_id }).update({ status: 'inactive' });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// ALUNOS
// ════════════════════════════════════════════════════════════════════════════

// GET /escolar/students?schoolId=X&classId=Y
router.get('/students', requireEscolar, async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const classId  = intParam(req.query.classId);
    if (!schoolId) return fail(res, 'schoolId obrigatório.');

    if (classId) {
      // Alunos matriculados na turma específica
      const rows = await getDb()('class_students as cs')
        .join('students as s', 's.id', 'cs.student_id')
        .where('cs.class_id', classId)
        .where('s.school_id', schoolId)
        .select(
          's.id', 's.name', 's.registration', 's.email', 's.phone',
          's.parent_name', 's.parent_phone', 's.active',
          'cs.id as enrollment_id', 'cs.status as enrollment_status',
          'cs.academic_year',
        )
        .orderBy('s.name');
      return ok(res, rows);
    }

    // Todos os alunos da escola
    const rows = await getDb()('students')
      .where({ school_id: schoolId })
      .orderBy('name')
      .select('*');
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /escolar/students
router.post('/students', requireEscolar, async (req, res) => {
  try {
    const { school_id, name, registration, email, phone, parent_name, parent_phone } = req.body;
    const sid = intParam(school_id);
    if (!sid || !name?.trim()) return fail(res, 'school_id e name são obrigatórios.');
    const [row] = await getDb()('students').insert({
      school_id: sid,
      name: name.trim(),
      registration: registration?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      parent_name: parent_name?.trim() || null,
      parent_phone: parent_phone?.trim() || null,
      active: true,
    }).returning('*');
    ok(res, row);
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /escolar/students/:id
router.put('/students/:id', requireEscolar, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const { name, registration, email, phone, parent_name, parent_phone, active } = req.body;
    if (!name?.trim()) return fail(res, 'Nome obrigatório.');
    const [row] = await getDb()('students').where({ id }).update({
      name: name.trim(),
      registration: registration?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      parent_name: parent_name?.trim() || null,
      parent_phone: parent_phone?.trim() || null,
      active: active !== undefined ? active : true,
    }, '*');
    ok(res, row);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /escolar/students/:id
router.delete('/students/:id', requireEscolar, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    // Remove matrículas antes
    await getDb()('class_students').where({ student_id: id }).del();
    await getDb()('students').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// MATRÍCULAS (class_students)
// ════════════════════════════════════════════════════════════════════════════

// POST /escolar/enrollments — matricular aluno em turma
router.post('/enrollments', requireEscolar, async (req, res) => {
  try {
    const { student_id, class_id, school_id, academic_year } = req.body;
    if (!intParam(student_id) || !intParam(class_id)) return fail(res, 'student_id e class_id são obrigatórios.');
    // Evita duplicata
    const exists = await getDb()('class_students')
      .where({ student_id, class_id }).first();
    if (exists) return fail(res, 'Aluno já está matriculado nesta turma.');
    const [row] = await getDb()('class_students').insert({
      student_id, class_id,
      school_id: intParam(school_id),
      academic_year: academic_year || new Date().getFullYear(),
      status: 'ativo',
      enrolled_at: new Date().toISOString(),
    }).returning('*');
    ok(res, row);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /escolar/enrollments/:id
router.delete('/enrollments/:id', requireEscolar, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('class_students').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// CHAMADA E DIÁRIO DO PROFESSOR (attendance_records)
// ════════════════════════════════════════════════════════════════════════════

// GET /escolar/attendance?schoolId=X&classId=Y&date=YYYY-MM-DD
router.get('/attendance', requireEscolar, async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const classId  = intParam(req.query.classId);
    const { date } = req.query;
    if (!schoolId) return fail(res, 'schoolId obrigatório.');

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 'Formato inválido. Use YYYY-MM-DD.');
      // Retorna o registro do dia (pode ser null — chamada ainda não feita)
      const q = getDb()('attendance_records').where({ school_id: schoolId, date });
      if (classId) q.where({ class_id: classId });
      const rows = await q.orderBy('created_at', 'desc').select('*');
      return ok(res, rows);
    }

    // Listagem para o diário — últimos 60 registros
    const q = getDb()('attendance_records').where({ school_id: schoolId }).orderBy('date', 'desc').limit(60);
    if (classId) q.where({ class_id: classId });
    const rows = await q.select('*');

    // Enriquece com nomes de turma e professor
    const classIds   = [...new Set(rows.map(r => r.class_id).filter(Boolean))];
    const teacherIds = [...new Set(rows.map(r => r.teacher_id).filter(Boolean))];
    const [classes, teachers] = await Promise.all([
      classIds.length   ? getDb()('classes').whereIn('id', classIds).select('id', 'name') : [],
      teacherIds.length ? getDb()('teachers').whereIn('id', teacherIds).select('id', 'name') : [],
    ]);
    const cMap = Object.fromEntries(classes.map(c => [c.id, c.name]));
    const tMap = Object.fromEntries(teachers.map(t => [t.id, t.name]));
    ok(res, rows.map(r => ({
      ...r,
      class_name:   cMap[r.class_id]   ?? '—',
      teacher_name: tMap[r.teacher_id] ?? '—',
      // Expande contadores do JSON para não reenviar o payload completo na listagem
      total_students: Array.isArray(r.students_json) ? r.students_json.length
        : (typeof r.students_json === 'string' ? JSON.parse(r.students_json || '[]').length : 0),
      absences: (() => {
        const arr = Array.isArray(r.students_json) ? r.students_json
          : JSON.parse(r.students_json || '[]');
        return arr.filter(s => s.status === 'ausente').length;
      })(),
    })));
  } catch (e) { fail(res, e.message, 500); }
});

// GET /escolar/attendance/student/:studentId?schoolId=X — histórico por aluno
router.get('/attendance/student/:studentId', requireEscolar, async (req, res) => {
  try {
    const studentId = intParam(req.params.studentId);
    const schoolId  = intParam(req.query.schoolId);
    if (!studentId || !schoolId) return fail(res, 'studentId e schoolId obrigatórios.');
    // Busca todos os registros onde o aluno aparece no students_json
    // Usa JSONB @> para checar presença eficiente no Postgres
    const rows = await getDb()('attendance_records')
      .where({ school_id: schoolId })
      .whereRaw(`students_json @> ?::jsonb`, [JSON.stringify([{ student_id: studentId }])])
      .orderBy('date', 'desc')
      .limit(90)
      .select('id', 'class_id', 'date', 'period', 'subject', 'students_json');
    ok(res, rows.map(r => {
      const arr = Array.isArray(r.students_json) ? r.students_json : JSON.parse(r.students_json || '[]');
      const entry = arr.find(s => s.student_id === studentId);
      return { ...r, students_json: undefined, status: entry?.status ?? 'presente', note: entry?.note ?? '' };
    }));
  } catch (e) { fail(res, e.message, 500); }
});

// POST /escolar/attendance — salva/atualiza chamada de um dia
router.post('/attendance', requireEscolar, async (req, res) => {
  try {
    const {
      school_id, class_id, teacher_id, date, period = '1',
      subject = '', lesson_content = '', students,
    } = req.body;
    const sid = intParam(school_id);
    const cid = intParam(class_id);
    if (!sid || !cid || !date || !Array.isArray(students))
      return fail(res, 'Campos obrigatórios: school_id, class_id, date, students[].');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 'Formato: YYYY-MM-DD.');

    const VALID_STATUS = ['presente', 'ausente', 'justificado'];
    for (const s of students) {
      if (!intParam(s.student_id)) return fail(res, 'students[].student_id inválido.');
      if (!VALID_STATUS.includes(s.status)) return fail(res, `Status inválido "${s.status}". Use: presente, ausente, justificado.`);
    }

    const payload = {
      school_id: sid, class_id: cid, date, period: String(period).slice(0, 20),
      teacher_id: intParam(teacher_id) || null,
      subject: subject.slice(0, 200),
      lesson_content: lesson_content.slice(0, 2000),
      students_json: JSON.stringify(students),
      updated_at: new Date().toISOString(),
    };

    // Upsert: um registro por turma/data/período
    const existing = await getDb()('attendance_records')
      .where({ school_id: sid, class_id: cid, date, period: payload.period }).first();
    let row;
    if (existing) {
      [row] = await getDb()('attendance_records').where({ id: existing.id }).update(payload, '*');
    } else {
      payload.created_at = new Date().toISOString();
      [row] = await getDb()('attendance_records').insert(payload).returning('*');
    }
    ok(res, row);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /escolar/attendance/:id
router.delete('/attendance/:id', requireEscolar, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('attendance_records').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// ════════════════════════════════════════════════════════════════════════════
// OCORRÊNCIAS
// ════════════════════════════════════════════════════════════════════════════

// GET /escolar/occurrences?schoolId=X&type=student&refId=Y&status=aberta
router.get('/occurrences', requireEscolar, async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    if (!schoolId) return fail(res, 'schoolId obrigatório.');
    const q = getDb()('occurrence_records').where({ school_id: schoolId }).orderBy('created_at', 'desc').limit(200);
    if (req.query.type)   q.where({ type: req.query.type });
    if (req.query.status) q.where({ status: req.query.status });
    if (req.query.refId) {
      const refId = intParam(req.query.refId);
      if (refId) {
        const type = req.query.type;
        if (type === 'student') q.where({ student_id: refId });
        else if (type === 'class') q.where({ class_id: refId });
        else if (type === 'teacher') q.where({ teacher_id: refId });
      }
    }
    const rows = await q.select('*');

    // Enriquece nomes
    const sIds = [...new Set(rows.map(r => r.student_id).filter(Boolean))];
    const cIds = [...new Set(rows.map(r => r.class_id).filter(Boolean))];
    const tIds = [...new Set(rows.map(r => r.teacher_id).filter(Boolean))];
    const [students, classes, teachers] = await Promise.all([
      sIds.length ? getDb()('students').whereIn('id', sIds).select('id', 'name') : [],
      cIds.length ? getDb()('classes').whereIn('id', cIds).select('id', 'name') : [],
      tIds.length ? getDb()('teachers').whereIn('id', tIds).select('id', 'name') : [],
    ]);
    const sMap = Object.fromEntries(students.map(s => [s.id, s.name]));
    const cMap = Object.fromEntries(classes.map(c => [c.id, c.name]));
    const tMap = Object.fromEntries(teachers.map(t => [t.id, t.name]));
    ok(res, rows.map(r => ({
      ...r,
      student_name: sMap[r.student_id] ?? null,
      class_name:   cMap[r.class_id]   ?? null,
      teacher_name: tMap[r.teacher_id] ?? null,
    })));
  } catch (e) { fail(res, e.message, 500); }
});

// POST /escolar/occurrences
router.post('/occurrences', requireEscolar, async (req, res) => {
  try {
    const {
      school_id, type, student_id, class_id, teacher_id,
      title, description = '', severity = 'media', created_by_id,
    } = req.body;
    const sid = intParam(school_id);
    if (!sid || !title?.trim()) return fail(res, 'school_id e title são obrigatórios.');
    const TYPES = ['student', 'class', 'teacher'];
    if (!TYPES.includes(type)) return fail(res, 'type deve ser: student, class ou teacher.');
    const SEVERITIES = ['baixa', 'media', 'alta'];
    if (!SEVERITIES.includes(severity)) return fail(res, 'severity deve ser: baixa, media ou alta.');
    const [row] = await getDb()('occurrence_records').insert({
      school_id: sid, type,
      student_id: intParam(student_id) || null,
      class_id:   intParam(class_id)   || null,
      teacher_id: intParam(teacher_id) || null,
      title: title.trim().slice(0, 200),
      description: description.slice(0, 2000),
      severity, status: 'aberta',
      created_by_id: intParam(created_by_id) || null,
      created_at: new Date().toISOString(),
    }).returning('*');
    ok(res, row);
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /escolar/occurrences/:id
router.put('/occurrences/:id', requireEscolar, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const { title, description, severity, status, resolved_by_id } = req.body;
    const patch = {};
    if (title       !== undefined) patch.title       = title?.trim().slice(0, 200);
    if (description !== undefined) patch.description = description.slice(0, 2000);
    if (severity    !== undefined) {
      if (!['baixa','media','alta'].includes(severity)) return fail(res, 'severity inválido.');
      patch.severity = severity;
    }
    if (status !== undefined) {
      if (!['aberta','resolvida'].includes(status)) return fail(res, 'status deve ser: aberta ou resolvida.');
      patch.status = status;
      if (status === 'resolvida') {
        patch.resolved_at      = new Date().toISOString();
        patch.resolved_by_id   = intParam(resolved_by_id) || null;
      }
    }
    if (!patch.title && patch.title !== undefined) return fail(res, 'Título não pode ser vazio.');
    await getDb()('occurrence_records').where({ id }).update(patch);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /escolar/occurrences/:id
router.delete('/occurrences/:id', requireEscolar, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('occurrence_records').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;
