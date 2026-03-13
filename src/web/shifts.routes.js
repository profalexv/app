/**
 * src/web/routes/shifts.routes.js
 *
 * Rotas para a entidade "Turnos" (Shifts).
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');

// Funções auxiliares
function ok(res, data)   { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)     { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// GET /shifts
router.get('/', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('shifts').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /shifts
router.post('/', async (req, res) => {
  try {
    const { school_id, name } = req.body;
    if (!intParam(school_id) || !name?.trim()) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('shifts').insert({ school_id, name: name.trim() }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /shifts/:id
router.put('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name } = req.body;
    if (!id || !name?.trim()) return fail(res, 'Dados inválidos.');
    await getDb()('shifts').where({ id }).update({ name: name.trim() });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /shifts/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('shifts').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;