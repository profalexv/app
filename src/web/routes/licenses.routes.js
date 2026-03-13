/**
 * src/web/routes/licenses.routes.js
 *
 * Rotas para a entidade "Licenças".
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');
const { ok, fail } = require('./route-helpers');

const AVAILABLE_MODULES = {
  cronograma: { id: 'cronograma', name: 'Cronograma',              description: 'Criação e gerenciamento de grades de horários escolares.',      icon: '📅' },
  aula:       { id: 'aula',       name: 'Registro de Aulas',       description: 'Registro e controle de aulas ministradas por professor.',        icon: '📝' },
  plano:      { id: 'plano',      name: 'Plano de Aula',           description: 'Criação e gerenciamento de planos de aula estruturados.',       icon: '📋' },
  ponto:      { id: 'ponto',      name: 'Registro de Ponto',       description: 'Controle de presença e jornada de funcionários com GPS.',       icon: '🕐' },
};

const DEV_MODE = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

// GET /licenses/status
router.get('/status', async (req, res) => {
  try {
    if (DEV_MODE) {
      const data = Object.fromEntries(
        Object.entries(AVAILABLE_MODULES).map(([id, mod]) => [id, { ...mod, licensed: true, devMode: true, expiresAt: null }])
      );
      return ok(res, data);
    }

    const rows = await getDb()('licenses').select('module_id', 'expires_at');
    const licenseMap = Object.fromEntries(rows.map(r => [r.module_id, r]));
    const data = Object.fromEntries(
      Object.entries(AVAILABLE_MODULES).map(([id, mod]) => {
        const lic = licenseMap[id];
        const isExpired = lic?.expires_at ? new Date(lic.expires_at) < new Date() : false;
        return [id, { ...mod, licensed: !!lic && !isExpired, expiresAt: lic?.expires_at ?? null }];
      })
    );
    ok(res, data);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /licenses/activate
router.post('/activate', async (req, res) => {
  try {
    const { moduleId, licenseKey } = req.body;
    if (!AVAILABLE_MODULES[moduleId]) return fail(res, 'Módulo inválido.');
    const pattern = new RegExp(`^AULA-${moduleId.toUpperCase()}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$`, 'i');
    if (!pattern.test(licenseKey?.trim() || ''))
      return fail(res, 'Chave de licença inválida. Formato esperado: AULA-MODULO-XXXX-XXXX-XXXX');

    const { error: upsertErr } = await getDb().upsert(
      'licenses',
      { module_id: moduleId, license_key: licenseKey.trim().toUpperCase(), expires_at: null },
      { onConflict: 'module_id' }
    );
    if (upsertErr) throw new Error(upsertErr.message);
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /licenses/deactivate
router.post('/deactivate', async (req, res) => {
  try {
    const { moduleId } = req.body;
    await getDb()('licenses').where({ module_id: moduleId }).del();
    ok(res);
  } catch (e) { fail(res, e.message, 500); }
});

module.exports = router;