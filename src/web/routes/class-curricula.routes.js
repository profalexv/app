/**
 * src/web/routes/class-curricula.routes.js
 *
 * Rotas para a entidade "Grade" (Componentes por Turma).
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');

// Funções auxiliares
function ok(res, data)   { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)     { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// GET /class-curricula
router.get('/', async (req, res) => {
  try {
    const classId = intParam(req.query.classId);
    if (!classId) return fail(res, 'classId obrigatório.');
    ok(res, await getDb()('class_curricula').where({ class_id: classId }));
  } catch (e) { fail(res, e.message, 500); }
});

// POST /class-curricula
router.post('/', async (req, res) => {
  try {
    const { class_id, curricula_id, weekly_lessons = 0, modalities = [], remote_allowed = false } = req.body;
    if (!intParam(class_id) || !intParam(curricula_id)) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('class_curricula').insert({
      class_id, curricula_id,
      weekly_lessons: parseInt(weekly_lessons) || 0,
      modalities: JSON.stringify(modalities),
      remote_allowed: !!remote_allowed,
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) {
    fail(res, e.message?.includes('unique') || e.message?.includes('UNIQUE') ? 'Componente já associado à turma.' : e.message);
  }
});

// PUT /class-curricula/:id
router.put('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const { weekly_lessons = 0, modalities = [], remote_allowed = false } = req.body;
    await getDb()('class_curricula').where({ id }).update({
      weekly_lessons: parseInt(weekly_lessons) || 0,
      modalities: JSON.stringify(modalities),
      remote_allowed: !!remote_allowed,
    });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /class-curricula/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('class_curricula').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;