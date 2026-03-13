/**
 * src/web/routes/lessons.routes.js
 *
 * Rotas para a entidade "Aulas" (Lessons).
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');

// Funções auxiliares
function ok(res, data)   { res.json({ success: true, data }); }
function fail(res, error, status = 400) { res.status(status).json({ success: false, error }); }
function intParam(v)     { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; }

// GET /lessons
router.get('/', async (req, res) => {
  try {
    const scheduleId = intParam(req.query.scheduleId);
    if (!scheduleId) return fail(res, 'scheduleId obrigatório.');
    const lessons = await getDb()('lessons')
      .where({ schedule_id: scheduleId })
      .orderBy('weekday').orderBy('period')
      .select('id', 'schedule_id', 'resource_id', 'teacher_id', 'weekday', 'period', 'subject', 'classroom', 'notes', 'created_at');
    // Busca nomes dos professores vinculados para enriquecer a resposta
    const teacherIds = [...new Set(lessons.map(l => l.teacher_id).filter(Boolean))];
    const teacherMap = {};
    if (teacherIds.length) {
      const teachers = await getDb()('teachers').whereIn('id', teacherIds).select('id', 'name');
      teachers.forEach(t => { teacherMap[t.id] = t.name; });
    }
    const rows = lessons.map(l => ({ ...l, teacher_name: teacherMap[l.teacher_id] ?? null }));
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /lessons
router.post('/', async (req, res) => {
  try {
    const { schedule_id, resource_id = null, teacher_id = null, weekday, period, subject, classroom = '', notes = '' } = req.body;
    if (!intParam(schedule_id) || !intParam(weekday) || !intParam(period) || !subject?.trim())
      return fail(res, 'Dados inválidos.');

    if (resource_id) {
      const conflict = await getDb()('lessons').where({ schedule_id, resource_id, weekday, period }).select('id').first();
      if (conflict) return fail(res, 'Este recurso já está ocupado neste período.');
    }
    if (teacher_id) {
      const conflict = await getDb()('lessons')
        .where({ schedule_id, teacher_id, weekday, period })
        .select('id', 'resource_id').first();
      if (conflict) {
        const resource = conflict.resource_id
          ? await getDb()('resources').where({ id: conflict.resource_id }).select('name').first()
          : null;
        const where = resource?.name ? ` (${resource.name})` : '';
        return fail(res, `Professor já possui agendamento neste período${where}.`);
      }
    }

    const [row] = await getDb()('lessons').insert({
      schedule_id, resource_id, teacher_id, weekday, period,
      subject: subject.trim(), classroom: classroom.trim(), notes
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message); }
});

// PUT /lessons/:id
router.put('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const { schedule_id, resource_id = null, teacher_id = null, weekday, period, subject, classroom = '', notes = '' } = req.body;
    if (!id || !intParam(weekday) || !intParam(period) || !subject?.trim()) return fail(res, 'Dados inválidos.');

    if (resource_id && schedule_id) {
      const conflict = await getDb()('lessons').where({ schedule_id, resource_id, weekday, period }).whereNot({ id }).select('id').first();
      if (conflict) return fail(res, 'Este recurso já está ocupado neste período.');
    }
    if (teacher_id && schedule_id) {
      const conflict = await getDb()('lessons')
        .where({ schedule_id, teacher_id, weekday, period })
        .whereNot({ id })
        .select('id', 'resource_id')
        .first();
      if (conflict) {
        const resource = conflict.resource_id
          ? await getDb()('resources').where({ id: conflict.resource_id }).select('name').first()
          : null;
        const where = resource?.name ? ` (${resource.name})` : '';
        return fail(res, `Professor já possui agendamento neste período${where}.`);
      }
    }

    await getDb()('lessons').where({ id }).update({ teacher_id, weekday, period, subject: subject.trim(), classroom: classroom.trim(), notes });
    ok(res);
  } catch (e) { fail(res, e.message); }
});

// DELETE /lessons/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = intParam(req.params.id);
    if (!id) return fail(res, 'ID inválido.');
    await getDb()('lessons').where({ id }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;