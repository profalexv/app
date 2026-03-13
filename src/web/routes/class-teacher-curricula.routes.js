/**
 * src/web/routes/class-teacher-curricula.routes.js
 *
 * Rotas para a entidade "Professor por Componente e Turma".
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');

// Funções auxiliares
function ok(res, data)   { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)     { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// GET /class-teacher-curricula
router.get('/', async (req, res) => {
  try {
    const classId = intParam(req.query.classId);
    if (!classId) return fail(res, 'classId obrigatório.');
    ok(res, await getDb()('class_teacher_curricula').where({ class_id: classId }));
  } catch (e) { fail(res, e.message, 500); }
});

// POST /class-teacher-curricula
router.post('/', async (req, res) => {
  try {
    const { class_id, curricula_id, teacher_id } = req.body;
    if (!intParam(class_id) || !intParam(curricula_id) || !intParam(teacher_id)) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('class_teacher_curricula').insert({ class_id, curricula_id, teacher_id }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) {
    fail(res, e.message?.includes('unique') || e.message?.includes('UNIQUE') ? 'Associação já existe.' : e.message);
  }
});

// DELETE /class-teacher-curricula/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('class_teacher_curricula').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;