/**
 * src/web/routes/resources.routes.js
 *
 * Rotas para a entidade "Recursos" (Resources).
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');

// Funções auxiliares
function ok(res, data)   { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)     { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// GET /resources
router.get('/', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const q = getDb()('resources').orderBy('name');
    if (schoolId) q.where({ school_id: schoolId });
    ok(res, await q);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /resources
router.post('/', async (req, res) => {
  try {
    const { school_id, name, type, capacity = null, description = '' } = req.body;
    if (!intParam(school_id) || !name?.trim() || !type?.trim()) return fail(res, 'Dados inválidos.');
    const [row] = await getDb()('resources').insert({
      school_id, name: name.trim(), type: type.trim(), capacity, description: description.trim()
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /resources/:id
router.put('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { name, type, capacity, description } = req.body;
    if (!id || !name?.trim() || !type?.trim()) return fail(res, 'Dados inválidos.');
    await getDb()('resources').where({ id }).update({ name: name.trim(), type: type.trim(), capacity, description: description?.trim() || '' });
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// DELETE /resources/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('resources').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;