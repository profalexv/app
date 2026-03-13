/**
 * src/web/routes/tutor-roles.routes.js
 *
 * Rotas para a entidade "Papéis de Tutor" (TutorRoles).
 * Campos: id, school_id, name, color, active
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');

function ok(res, data)              { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)                { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// GET /tutor-roles?schoolId=X
router.get('/', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('tutor_roles').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q.select('*'));
  } catch (e) { fail(res, e.message, 500); }
});

// POST /tutor-roles
router.post('/', async (req, res) => {
  try {
    const { school_id, name, color = '#6366f1' } = req.body;
    if (!intParam(school_id) || !name?.trim()) return fail(res, 'Dados inválidos. Campos: school_id, name.');
    const [row] = await getDb()('tutor_roles')
      .insert({ school_id, name: name.trim(), color, active: true })
      .returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /tutor-roles/:id
router.put('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    const { name, color, active } = req.body;
    const patch = {};
    if (name !== undefined)   patch.name   = name?.trim();
    if (color !== undefined)  patch.color  = color;
    if (active !== undefined) patch.active = active;
    if (!patch.name && patch.name !== undefined) return fail(res, 'Nome não pode ser vazio.');
    if (Object.keys(patch).length === 0) return fail(res, 'Nenhum campo para atualizar.');
    await getDb()('tutor_roles').where({ id }).update(patch);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /tutor-roles/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('tutor_roles').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;
