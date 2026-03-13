/**
 * src/web/routes/people.routes.js
 *
 * Rotas para a entidade "Pessoas".
 * Corresponde às funcionalidades do módulo de frontend "usuarios.js".
 */

const router = require('express').Router();
const { getDb, hashPassword } = require('../../db/database-web');
const { ok, fail, intParam } = require('../../web/routes/route-helpers');


// GET /api/people?schoolId=X
// Corresponde a window.aula.getPeople()
router.get('/', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId) || req.adminSession?.school_id;
    if (!schoolId) return fail(res, 'schoolId obrigatório.');

    // Query complexa para agregar os papéis de cada pessoa em uma única consulta
    const people = await getDb()('people as p')
      .where('p.school_id', schoolId)
      .leftJoin('teachers as t', 't.person_id', 'p.id')
      .leftJoin('admins as a', 'a.person_id', 'p.id')
      .leftJoin('staff_roles as sr', 'sr.person_id', 'p.id')
      .leftJoin('staff_functions as sf', 'sf.id', 'sr.staff_function_id')
      .select(
        'p.id', 'p.name', 'p.registration', 'p.email', 'p.phone',
        // Usamos bool_or para verificar a existência de um papel
        getDb().raw('bool_or(t.id IS NOT NULL) as is_teacher'),
        getDb().raw('bool_or(a.id IS NOT NULL) as is_admin'),
        // Agrega os nomes das funções de staff em uma string
        getDb().raw('string_agg(sf.name, \', \') as staff_functions')
      )
      .groupBy('p.id') // Agrupa pelo ID da pessoa para consolidar os papéis
      .orderBy('p.name');

    ok(res, people);
  } catch (e) {
    fail(res, `Erro ao buscar pessoas: ${e.message}`, 500);
  }
});

// POST /api/people
// Corresponde a window.aula.createPerson()
router.post('/', async (req, res) => {
  try {
    const { school_id, name, registration, email, phone } = req.body;
    const sid = intParam(school_id) || req.adminSession?.school_id;
    if (!sid || !name?.trim()) return fail(res, 'school_id e name são obrigatórios.');

    const [row] = await getDb()('people').insert({
      school_id: sid,
      name: name.trim(),
      registration: registration?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
    }).returning('*');

    ok(res, row);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// PUT /api/people/:id
// Corresponde a window.aula.updatePerson()
router.put('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID de pessoa inválido.');
    const { name, registration, email, phone } = req.body;
    if (!name?.trim()) return fail(res, 'O nome é obrigatório.');

    const [row] = await getDb()('people').where({ id }).update({
      name: name.trim(),
      registration: registration?.trim() || null,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
    }, '*');

    ok(res, row);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// GET /api/people/:id/roles
// Corresponde a window.aula.getPersonRoles()
router.get('/:id/roles', async (req, res) => {
  try {
    const personId = intParam(req.params.id);
    if (!personId) return fail(res, 'ID de pessoa inválido.');

    const [teacher, admin, staff] = await Promise.all([
      getDb()('teachers').where({ person_id: personId }).first(),
      getDb()('admins').where({ person_id: personId }).first(),
      getDb()('staff_roles as sr')
        .join('staff_functions as sf', 'sf.id', 'sr.staff_function_id')
        .where('sr.person_id', personId)
        .select('sr.*', 'sf.name as function_name', 'sf.category'),
    ]);

    ok(res, { teacher, admin, staff });
  } catch (e) {
    fail(res, `Erro ao buscar papéis: ${e.message}`, 500);
  }
});

// Adicione aqui outras rotas relacionadas a papéis (POST, DELETE, etc.)

module.exports = router;