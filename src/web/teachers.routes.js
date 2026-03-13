/**
 * src/web/routes/teachers.routes.js
 *
 * Rotas para a entidade "Professores".
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');
const { isValidTeacherData } = require('../../utils/validators');
const { SubscriptionManager } = require('../../utils/subscription-manager');

// Funções auxiliares
function ok(res, data)   { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)     { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// GET /teachers?schoolId=X
router.get('/', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('teachers').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /teachers
router.post('/', async (req, res) => {
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

// PUT /teachers/:id
router.put('/:id', async (req, res) => {
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

// DELETE /teachers/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('teachers').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// GET /teachers/:id/availability
router.get('/:id/availability', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const rows = await getDb()('teacher_availability').where({ teacher_id: id }).orderBy(['weekday', 'period']).select('weekday', 'period');
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /teachers/:id/availability
router.put('/:id/availability', async (req, res) => {
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

// GET /teachers/:id/lessons (para o AULA.app)
router.get('/:id/lessons', async (req, res) => {
  try {
    const teacherId = intParam(req.params.id);
    if (!teacherId) return fail(res, 'Professor ID inválido.');

    const { data: rows, error: rpcErr } = await getDb().rpc('app_get_teacher_schedule', { p_teacher_id: teacherId });
    if (rpcErr) throw new Error(rpcErr.message);
    ok(res, rows || []);
  } catch (e) { fail(res, 'Erro ao carregar horários: ' + e.message, 500); }
});

module.exports = router;