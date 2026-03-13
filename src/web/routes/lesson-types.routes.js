/**
 * src/web/routes/lesson-types.routes.js
 *
 * Rotas para a entidade "Tipos de Aula".
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');
const { ok, fail, intParam } = require('./route-helpers');

// GET /lesson-types
router.get('/', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('lesson_types').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /lesson-types
router.post('/', async (req, res) => {
  try {
    const { school_id, name, is_synchronous = 1, color = '#6b7280' } = req.body;
    if (!intParam(school_id) || !name?.trim()) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('lesson_types').insert({
      school_id, name: name.trim(),
      is_synchronous: parseInt(is_synchronous),
      color, active: 1,
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /lesson-types/:id
router.put('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const fields = {};
    if (req.body.name !== undefined) fields.name = req.body.name.trim();
    if (req.body.is_synchronous !== undefined) fields.is_synchronous = parseInt(req.body.is_synchronous);
    if (req.body.color !== undefined) fields.color = req.body.color;
    if (req.body.active !== undefined) fields.active = parseInt(req.body.active);
    if (!Object.keys(fields).length) return fail(res, 'Nenhum campo para atualizar.');
    await getDb()('lesson_types').where({ id }).update(fields);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /lesson-types/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('lesson_types').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;