/**
 * src/web/routes/teacher-days.routes.js
 *
 * Rotas para a entidade "Dias de Trabalho do Professor".
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');

// Funções auxiliares
function ok(res, data)   { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)     { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// GET /teacher-days/:teacherId
router.get('/:teacherId', async (req, res) => {
  try {
    const id = intParam(req.params.teacherId);
    if (!id) return fail(res, 'ID inválido.');
    ok(res, await getDb()('teacher_days').where({ teacher_id: id }).orderBy('weekday'));
  } catch (e) { fail(res, e.message, 500); }
});

// POST /teacher-days
router.post('/', async (req, res) => {
  try {
    const { teacher_id, weekday } = req.body;
    if (!intParam(teacher_id) || !intParam(weekday)) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('teacher_days').insert({ teacher_id, weekday }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) {
    fail(res, e.message?.includes('unique') || e.message?.includes('UNIQUE') ? 'Dia já cadastrado.' : e.message);
  }
});

// DELETE /teacher-days/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('teacher_days').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;