/**
 * src/web/routes/time-slots.routes.js
 *
 * Rotas para a entidade "Horários" (Time Slots).
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');

// Funções auxiliares
function ok(res, data)   { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)     { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// GET /time-slots
router.get('/', async (req, res) => {
  try {
    const shiftId = intParam(req.query.shiftId);
    const q = getDb()('time_slots').orderBy('period');
    if (shiftId) q.where({ shift_id: shiftId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /time-slots
router.post('/', async (req, res) => {
  try {
    const { shift_id, period, start_time = null, end_time = null } = req.body;
    if (!intParam(shift_id) || !intParam(period)) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('time_slots').insert({ shift_id, period, start_time, end_time }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /time-slots/:id
router.put('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { period, start_time = null, end_time = null } = req.body;
    if (!id || !intParam(period)) return fail(res, 'Dados inválidos.');
    await getDb()('time_slots').where({ id }).update({ period, start_time, end_time });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /time-slots/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('time_slots').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;