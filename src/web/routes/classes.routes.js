/**
 * src/web/routes/classes.routes.js
 *
 * Rotas para a entidade "Turmas" (Classes).
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');
const { SubscriptionManager } = require('../../utils/subscription-manager');

// Funções auxiliares
function ok(res, data)   { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)     { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// GET /classes
router.get('/', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('classes').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /classes
router.post('/', async (req, res) => {
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

// PUT /classes/:id
router.put('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name, year } = req.body;
    if (!id || !name?.trim()) return fail(res, 'Dados inválidos.');
    await getDb()('classes').where({ id }).update({ name: name.trim(), year });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /classes/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('classes').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// GET /classes/:id/lessons (para o AULA.app)
router.get('/:id/lessons', async (req, res) => {
  try {
    const classId = intParam(req.params.id);
    if (!classId) return fail(res, 'Turma ID inválido.');

    const { data: rows, error: rpcErr } = await getDb().rpc('app_get_class_schedule', { p_class_id: classId });
    if (rpcErr) throw new Error(rpcErr.message);
    ok(res, rows || []);
  } catch (e) { fail(res, 'Erro ao carregar horários: ' + e.message, 500); }
});

module.exports = router;