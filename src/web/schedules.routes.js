/**
 * src/web/routes/schedules.routes.js
 *
 * Rotas para a entidade "Cronogramas" (Schedules).
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');

// Funções auxiliares
function ok(res, data)   { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)     { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// GET /schedules
router.get('/', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('schedules').orderBy([{ column: 'year', order: 'desc' }, { column: 'semester', order: 'desc' }]);
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /schedules
router.post('/', async (req, res) => {
  try {
    const { school_id, name, year, semester } = req.body;
    if (!intParam(school_id) || !name?.trim() || !intParam(year) || !intParam(semester))
      return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('schedules').insert({ school_id, name: name.trim(), year, semester }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /schedules/:id
router.put('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name, year, semester, active } = req.body;
    if (!id || !name?.trim() || !intParam(year) || !intParam(semester)) return fail(res, 'Dados inválidos.');
    await getDb()('schedules').where({ id }).update({ name: name.trim(), year, semester, active: !!active });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /schedules/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('schedules').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;