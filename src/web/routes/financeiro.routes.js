/**
 * src/web/routes/financeiro.routes.js
 *
 * ADDON FINANCEIRO — Cobranças de Mensalidades Escolares
 * Requer: addon ESCOLAR ativo na escola
 *
 * Modelo de cobrança Scholar:
 *   R$0,30 por aluno ativo por mês (debitado na fatura mensal Scholar)
 *   + 0,5% por transação processada via gateway Scholar (modo scholar_managed)
 *
 * Modos de gateway:
 *   scholar_managed — Scholar usa seu próprio MP; retém 0,5% via split
 *   client_gateway  — credenciais do cliente; Scholar só gerencia o fluxo
 *
 * Tabelas (migrations em motor/supabase/migrations/):
 *   billing_addon_subscriptions  — assinatura do addon por escola
 *   billing_gateways             — gateways configurados (credenciais criptografadas)
 *   billing_plans                — planos/mensalidades da escola
 *   billing_contracts            — contrato por aluno
 *   billing_invoices             — faturas individuais
 *   billing_negotiations         — renegociações de débito
 */

const router = require('express').Router();
const { getDb } = require('../../db/database-web');
const { ok, fail, intParam } = require('./route-helpers');

const DEV_MODE = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

const SCHOLAR_FEE_PER_STUDENT = 30;   // R$0,30 em centavos
const SCHOLAR_COMMISSION_RATE = 0.005; // 0,5% por transação (scholar_managed)

// ── Middleware: exige addon FINANCEIRO ativo ─────────────────────────────────
async function requireFinanceiro(req, res, next) {
  if (DEV_MODE) return next();
  try {
    const schoolId = intParam(
      req.query.schoolId || req.body?.school_id || req.params?.schoolId
    );
    if (!schoolId) return fail(res, 'schoolId obrigatório', 400);
    const sub = await getDb()('billing_addon_subscriptions')
      .where({ school_id: schoolId, status: 'active' }).first();
    if (!sub) return fail(res, 'Addon Financeiro não contratado.', 403);
    req.financSub = sub;
    next();
  } catch (e) { fail(res, e.message, 500); }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function calcLateCharges(amountCents, dueDateStr, finePct = 2, interestDailyPct = 0.0333) {
  const due   = new Date(dueDateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLate = Math.max(0, Math.floor((today - due) / 86400000));
  if (daysLate === 0) return { fine: 0, interest: 0, daysLate: 0 };
  const fine     = Math.round(amountCents * (finePct / 100));
  const interest = Math.round(amountCents * (interestDailyPct / 100) * daysLate);
  return { fine, interest, daysLate };
}

// ══════════════════════════════════════════════════════════════════════════════
// STATUS / ASSINATURA
// ══════════════════════════════════════════════════════════════════════════════

// GET /financeiro/status?schoolId=
router.get('/status', async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    if (!schoolId) return fail(res, 'schoolId obrigatório', 400);

    const sub = await getDb()('billing_addon_subscriptions')
      .where({ school_id: schoolId }).first();

    const [{ cnt: contracts }] = await getDb()('billing_contracts')
      .where({ school_id: schoolId, status: 'ativo' }).count('id as cnt');

    const activeContracts = parseInt(contracts, 10);
    const monthlyScholarFee = activeContracts * SCHOLAR_FEE_PER_STUDENT;

    if (!sub) {
      if (DEV_MODE) return ok(res, {
        active: true, devMode: true,
        gateway_mode: 'scholar_managed', activeContracts, monthlyScholarFee,
      });
      return ok(res, { active: false, activeContracts: 0, monthlyScholarFee: 0 });
    }
    ok(res, {
      active: sub.status === 'active',
      gateway_mode: sub.gateway_mode,
      activeContracts, monthlyScholarFee,
    });
  } catch (e) { fail(res, e.message, 500); }
});

// POST /financeiro/subscribe
router.post('/subscribe', async (req, res) => {
  try {
    const { school_id, gateway_mode = 'scholar_managed' } = req.body;
    const schoolId = intParam(school_id);
    if (!schoolId) return fail(res, 'school_id obrigatório', 400);
    if (!['scholar_managed', 'client_gateway'].includes(gateway_mode))
      return fail(res, 'gateway_mode inválido: use scholar_managed ou client_gateway', 400);

    // Exige ESCOLAR ativo
    const escolar = await getDb()('escolar_addon_subscriptions')
      .where({ school_id: schoolId, status: 'active' }).first();
    if (!escolar && !DEV_MODE)
      return fail(res, 'O addon ESCOLAR deve estar ativo para contratar o Financeiro.', 403);

    const existing = await getDb()('billing_addon_subscriptions')
      .where({ school_id: schoolId }).first();
    const now = new Date().toISOString();

    if (existing) {
      await getDb()('billing_addon_subscriptions').where({ id: existing.id })
        .update({ status: 'active', gateway_mode, updated_at: now });
    } else {
      await getDb()('billing_addon_subscriptions').insert({
        school_id: schoolId, status: 'active', gateway_mode,
        activated_at: now, updated_at: now,
      });
    }
    ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// POST /financeiro/cancel
router.post('/cancel', requireFinanceiro, async (req, res) => {
  try {
    const schoolId = intParam(req.body.school_id);
    await getDb()('billing_addon_subscriptions')
      .where({ school_id: schoolId })
      .update({ status: 'cancelled', updated_at: new Date().toISOString() });
    ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GATEWAYS — credenciais do cliente (NUNCA retornadas nas listagens)
// ══════════════════════════════════════════════════════════════════════════════

router.get('/gateways', requireFinanceiro, async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    // Nunca expõe campo credentials nas respostas
    const rows = await getDb()('billing_gateways')
      .where({ school_id: schoolId })
      .select('id', 'provider', 'label', 'active', 'created_at')
      .orderBy('created_at');
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/gateways', requireFinanceiro, async (req, res) => {
  try {
    const { school_id, provider, label, credentials } = req.body;
    const schoolId = intParam(school_id);
    const validProviders = ['mercadopago', 'sicredi', 'bradesco', 'itau', 'other'];
    if (!validProviders.includes(provider))
      return fail(res, `provider inválido. Use: ${validProviders.join(', ')}`, 400);
    if (!credentials || typeof credentials !== 'object')
      return fail(res, 'credentials obrigatório (objeto com chaves do gateway)', 400);

    const [row] = await getDb()('billing_gateways').insert({
      school_id: schoolId, provider,
      label: label || provider,
      credentials: JSON.stringify(credentials), // TODO: criptografar com pgcrypto em produção
      active: true,
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/gateways/:id', requireFinanceiro, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const schoolId = intParam(req.body.school_id);
    const { label, active, credentials } = req.body;
    const update = {};
    if (label !== undefined) update.label = String(label).trim();
    if (active !== undefined) update.active = !!active;
    if (credentials && typeof credentials === 'object')
      update.credentials = JSON.stringify(credentials);
    await getDb()('billing_gateways').where({ id, school_id: schoolId }).update(update);
    ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/gateways/:id', requireFinanceiro, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const schoolId = intParam(req.query.schoolId);
    await getDb()('billing_gateways').where({ id, school_id: schoolId }).del();
    ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PLANOS DE MENSALIDADE
// ══════════════════════════════════════════════════════════════════════════════

router.get('/plans', requireFinanceiro, async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    ok(res, await getDb()('billing_plans').where({ school_id: schoolId }).orderBy('name'));
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/plans', requireFinanceiro, async (req, res) => {
  try {
    const {
      school_id, name, amount, due_day = 10,
      fine_percent = 2, interest_daily = 0.0333,
      discount_early = 0, discount_days = 0,
    } = req.body;
    const schoolId = intParam(school_id);
    if (!name?.trim()) return fail(res, 'name obrigatório', 400);
    const amt = intParam(amount);
    if (!amt || amt <= 0) return fail(res, 'amount inválido (centavos > 0)', 400);
    const day = intParam(due_day);
    if (day < 1 || day > 28) return fail(res, 'due_day deve ser entre 1 e 28', 400);

    const [row] = await getDb()('billing_plans').insert({
      school_id: schoolId, name: name.trim(), amount: amt, due_day: day,
      fine_percent: Number(fine_percent),
      interest_daily: Number(interest_daily),
      discount_early: intParam(discount_early) || 0,
      discount_days:  intParam(discount_days)  || 0,
      active: true,
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/plans/:id', requireFinanceiro, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const schoolId = intParam(req.body.school_id);
    const allowed = ['name', 'amount', 'due_day', 'fine_percent', 'interest_daily',
                     'discount_early', 'discount_days', 'active'];
    const update = {};
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    if (update.due_day) {
      update.due_day = intParam(update.due_day);
      if (update.due_day < 1 || update.due_day > 28) return fail(res, 'due_day inválido', 400);
    }
    if (update.amount) { update.amount = intParam(update.amount); }
    await getDb()('billing_plans').where({ id, school_id: schoolId }).update(update);
    ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

router.delete('/plans/:id', requireFinanceiro, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const schoolId = intParam(req.query.schoolId);
    const hasActive = await getDb()('billing_contracts')
      .where({ plan_id: id, school_id: schoolId, status: 'ativo' }).first();
    if (hasActive) return fail(res, 'Plano possui contratos ativos. Encerre-os antes de excluir.', 400);
    await getDb()('billing_plans').where({ id, school_id: schoolId }).del();
    ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// ══════════════════════════════════════════════════════════════════════════════
// CONTRATOS POR ALUNO
// ══════════════════════════════════════════════════════════════════════════════

router.get('/contracts', requireFinanceiro, async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const { student_id, status } = req.query;
    let q = getDb()('billing_contracts as c')
      .join('students as s',      's.id', 'c.student_id')
      .join('billing_plans as p', 'p.id', 'c.plan_id')
      .where('c.school_id', schoolId)
      .select(
        'c.*',
        's.name as student_name',
        'p.name as plan_name',
        'p.amount as plan_amount',
        'p.due_day',
      );
    if (student_id) q = q.where('c.student_id', intParam(student_id));
    if (status) q = q.where('c.status', status);
    ok(res, await q.orderBy('s.name'));
  } catch (e) { fail(res, e.message, 500); }
});

router.post('/contracts', requireFinanceiro, async (req, res) => {
  try {
    const {
      school_id, student_id, plan_id,
      responsible_name, responsible_cpf, responsible_email, responsible_phone,
      start_date, notes,
    } = req.body;
    const schoolId = intParam(school_id);
    if (!responsible_name?.trim()) return fail(res, 'responsible_name obrigatório', 400);
    if (!start_date || !/^\d{4}-\d{2}-\d{2}$/.test(start_date))
      return fail(res, 'start_date inválido (YYYY-MM-DD)', 400);

    const now = new Date().toISOString();
    const [row] = await getDb()('billing_contracts').insert({
      school_id: schoolId,
      student_id: intParam(student_id),
      plan_id: intParam(plan_id),
      responsible_name: responsible_name.trim(),
      responsible_cpf:   responsible_cpf   || null,
      responsible_email: responsible_email || null,
      responsible_phone: responsible_phone || null,
      start_date, notes: notes || null,
      status: 'ativo', created_at: now, updated_at: now,
    }).returning('id');
    ok(res, { id: row.id ?? row });
  } catch (e) { fail(res, e.message, 500); }
});

router.put('/contracts/:id', requireFinanceiro, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const schoolId = intParam(req.body.school_id);
    const allowed = [
      'plan_id', 'responsible_name', 'responsible_cpf',
      'responsible_email', 'responsible_phone', 'end_date', 'status', 'notes',
    ];
    const update = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
    await getDb()('billing_contracts').where({ id, school_id: schoolId }).update(update);
    ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// ══════════════════════════════════════════════════════════════════════════════
// FATURAS
// ══════════════════════════════════════════════════════════════════════════════

// GET /financeiro/invoices?schoolId=&month=YYYY-MM&status=&student_id=
router.get('/invoices', requireFinanceiro, async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const { month, status, student_id } = req.query;
    let q = getDb()('billing_invoices as i')
      .join('students as s', 's.id', 'i.student_id')
      .where('i.school_id', schoolId)
      .select('i.*', 's.name as student_name');
    if (month)      q = q.where('i.reference_month', month);
    if (status)     q = q.where('i.status', status);
    if (student_id) q = q.where('i.student_id', intParam(student_id));
    ok(res, await q.orderBy('i.due_date', 'desc').limit(300));
  } catch (e) { fail(res, e.message, 500); }
});

// GET /financeiro/invoices/summary?schoolId=&month=  — totalizadores para dashboard
router.get('/invoices/summary', requireFinanceiro, async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    const [monthStats] = await getDb()('billing_invoices')
      .where({ school_id: schoolId, reference_month: month })
      .select(
        getDb().raw('COUNT(*) as total'),
        getDb().raw("SUM(CASE WHEN status='pago'     THEN 1 ELSE 0 END) as paid_count"),
        getDb().raw("SUM(CASE WHEN status='pendente' THEN 1 ELSE 0 END) as pending_count"),
        getDb().raw("SUM(CASE WHEN status='vencido'  THEN 1 ELSE 0 END) as overdue_count"),
        getDb().raw("SUM(CASE WHEN status='pago' THEN COALESCE(amount_paid, amount) ELSE 0 END) as received_amount"),
        getDb().raw("SUM(CASE WHEN status IN ('pendente','vencido') THEN amount ELSE 0 END) as pending_amount"),
      );

    const [overdueAll] = await getDb()('billing_invoices')
      .where({ school_id: schoolId })
      .whereIn('status', ['pendente', 'vencido'])
      .where('due_date', '<', new Date().toISOString().slice(0, 10))
      .select(getDb().raw('COUNT(*) as count, SUM(amount) as amount'));

    ok(res, {
      month,
      monthStats: {
        total:          parseInt(monthStats.total, 10),
        paid_count:     parseInt(monthStats.paid_count, 10),
        pending_count:  parseInt(monthStats.pending_count, 10),
        overdue_count:  parseInt(monthStats.overdue_count, 10),
        received_amount: parseInt(monthStats.received_amount, 10) || 0,
        pending_amount:  parseInt(monthStats.pending_amount,  10) || 0,
      },
      allOverdue: {
        count:  parseInt(overdueAll.count, 10),
        amount: parseInt(overdueAll.amount, 10) || 0,
      },
    });
  } catch (e) { fail(res, e.message, 500); }
});

// POST /financeiro/invoices/generate — gera faturas mensais para contratos ativos
router.post('/invoices/generate', requireFinanceiro, async (req, res) => {
  try {
    const { school_id, reference_month } = req.body;
    const schoolId = intParam(school_id);
    if (!reference_month || !/^\d{4}-\d{2}$/.test(reference_month))
      return fail(res, 'reference_month deve ser YYYY-MM', 400);

    const [year, month] = reference_month.split('-').map(Number);
    if (year < 2020 || year > 2100 || month < 1 || month > 12)
      return fail(res, 'reference_month fora do intervalo válido', 400);

    const contracts = await getDb()('billing_contracts as c')
      .join('billing_plans as p', 'p.id', 'c.plan_id')
      .where({ 'c.school_id': schoolId, 'c.status': 'ativo' })
      .andWhere('c.start_date', '<=', `${reference_month}-28`)
      .select(
        'c.id as contract_id', 'c.student_id',
        'p.amount', 'p.due_day', 'p.discount_early', 'p.discount_days',
        'p.fine_percent', 'p.interest_daily',
      );

    const now = new Date().toISOString();
    let created = 0, skipped = 0;

    for (const c of contracts) {
      const existing = await getDb()('billing_invoices')
        .where({ school_id: schoolId, contract_id: c.contract_id, reference_month }).first();
      if (existing) { skipped++; continue; }

      const dueDay = String(c.due_day).padStart(2, '0');
      const dueDate = `${year}-${String(month).padStart(2, '0')}-${dueDay}`;

      await getDb()('billing_invoices').insert({
        school_id: schoolId,
        student_id: c.student_id,
        contract_id: c.contract_id,
        reference_month, due_date: dueDate,
        amount: c.amount,
        discount_amount: 0, fine_amount: 0, interest_amount: 0,
        status: 'pendente',
        scholar_fee: SCHOLAR_FEE_PER_STUDENT,
        scholar_commission: 0, // calculado no charge
        created_at: now, updated_at: now,
      });
      created++;
    }

    ok(res, { created, skipped, total: contracts.length });
  } catch (e) { fail(res, e.message, 500); }
});

// POST /financeiro/invoices/:id/charge — gera cobrança PIX no gateway
router.post('/invoices/:id/charge', requireFinanceiro, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const schoolId = intParam(req.body.school_id);

    const invoice = await getDb()('billing_invoices as i')
      .join('billing_contracts as c', 'c.id', 'i.contract_id')
      .join('billing_plans as p', 'p.id', 'c.plan_id')
      .where({ 'i.id': id, 'i.school_id': schoolId })
      .select('i.*', 'p.fine_percent', 'p.interest_daily')
      .first();

    if (!invoice) return fail(res, 'Fatura não encontrada', 404);
    if (invoice.status === 'pago') return fail(res, 'Fatura já está paga', 400);
    if (invoice.status === 'cancelado') return fail(res, 'Fatura cancelada', 400);

    const { fine, interest } = calcLateCharges(
      invoice.amount, invoice.due_date,
      Number(invoice.fine_percent), Number(invoice.interest_daily),
    );

    const discount = invoice.discount_amount || 0;
    const totalAmount = invoice.amount + fine + interest - discount;
    const isLateNow = new Date() > new Date(invoice.due_date + 'T00:00:00');

    // Calcula comissão Scholar (só no modo scholar_managed)
    const sub = req.financSub || {};
    const commission = sub.gateway_mode === 'scholar_managed'
      ? Math.round(totalAmount * SCHOLAR_COMMISSION_RATE)
      : 0;

    // TODO: integrar com MP ou gateway do cliente
    // Por ora gera stub de PIX para demonstração
    const pixCode = `00020126580014br.gov.bcb.pix0136${schoolId}-inv${id}-${Date.now()}` +
      `5204000053039865406${(totalAmount / 100).toFixed(2)}5802BR5913ScholarAULA6009SAO PAULO62070503***6304ABCD`;

    await getDb()('billing_invoices').where({ id }).update({
      fine_amount: fine,
      interest_amount: interest,
      pix_code: pixCode,
      scholar_commission: commission,
      status: isLateNow ? 'vencido' : 'pendente',
      notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    ok(res, { pix_code: pixCode, total_amount: totalAmount, fine, interest, commission });
  } catch (e) { fail(res, e.message, 500); }
});

// PUT /financeiro/invoices/:id — atualização manual (pagamento, cancelamento)
router.put('/invoices/:id', requireFinanceiro, async (req, res) => {
  try {
    const id = intParam(req.params.id);
    const schoolId = intParam(req.body.school_id);
    const { status, amount_paid, paid_at, discount_amount, notes } = req.body;

    const valid = ['pendente', 'pago', 'vencido', 'cancelado'];
    if (status && !valid.includes(status))
      return fail(res, `status inválido. Use: ${valid.join(', ')}`, 400);

    const update = { updated_at: new Date().toISOString() };
    if (status !== undefined)          update.status          = status;
    if (amount_paid !== undefined)     update.amount_paid     = intParam(amount_paid);
    if (paid_at !== undefined)         update.paid_at         = paid_at;
    if (discount_amount !== undefined) update.discount_amount = intParam(discount_amount) || 0;
    if (notes !== undefined)           update.notes           = notes;

    await getDb()('billing_invoices').where({ id, school_id: schoolId }).update(update);
    ok(res, { ok: true });
  } catch (e) { fail(res, e.message, 500); }
});

// ══════════════════════════════════════════════════════════════════════════════
// NEGOCIAÇÕES DE DÉBITO
// ══════════════════════════════════════════════════════════════════════════════

router.get('/negotiations', requireFinanceiro, async (req, res) => {
  try {
    const schoolId = intParam(req.query.schoolId);
    const rows = await getDb()('billing_negotiations as n')
      .join('students as s', 's.id', 'n.student_id')
      .where('n.school_id', schoolId)
      .select('n.*', 's.name as student_name')
      .orderBy('n.created_at', 'desc')
      .limit(100);
    ok(res, rows);
  } catch (e) { fail(res, e.message, 500); }
});

// POST /financeiro/negotiations — consolida faturas em atraso e gera parcelamento
router.post('/negotiations', requireFinanceiro, async (req, res) => {
  try {
    const {
      school_id, student_id, invoice_ids,
      total_negotiated, installments = 1,
      due_dates, notes, created_by_id,
    } = req.body;

    const schoolId    = intParam(school_id);
    const instAll     = intParam(installments);
    const totalNeg    = intParam(total_negotiated);

    if (!Array.isArray(invoice_ids) || !invoice_ids.length)
      return fail(res, 'invoice_ids obrigatório (array)', 400);
    if (!totalNeg || totalNeg <= 0)
      return fail(res, 'total_negotiated inválido', 400);
    if (!instAll || instAll < 1 || instAll > 60)
      return fail(res, 'installments deve ser entre 1 e 60', 400);

    const invoices = await getDb()('billing_invoices')
      .whereIn('id', invoice_ids).where({ school_id: schoolId });
    if (!invoices.length) return fail(res, 'Faturas não encontradas', 404);

    const totalOriginal = invoices.reduce((s, i) =>
      s + i.amount + (i.fine_amount || 0) + (i.interest_amount || 0), 0);

    const now       = new Date().toISOString();
    const studentId = intParam(student_id) || invoices[0].student_id;
    const contractId = invoices[0].contract_id || null;

    // Cria registro de negociação
    const [negRow] = await getDb()('billing_negotiations').insert({
      school_id: schoolId,
      student_id: studentId,
      invoice_ids: JSON.stringify(invoice_ids),
      total_original: totalOriginal,
      total_negotiated: totalNeg,
      installments: instAll,
      notes: notes || null,
      status: 'ativa',
      created_by_id: created_by_id ? intParam(created_by_id) : null,
      created_at: now,
    }).returning('id');
    const negId = negRow.id ?? negRow;

    // Marca faturas originais como 'negociado'
    await getDb()('billing_invoices')
      .whereIn('id', invoice_ids)
      .update({ status: 'negociado', negotiation_id: negId, updated_at: now });

    // Gera parcelas (novas faturas)
    const installmentBase      = Math.floor(totalNeg / instAll);
    const firstInstallmentExtra = totalNeg - installmentBase * instAll; // arredondamento no 1º

    for (let i = 0; i < instAll; i++) {
      let dueDate;
      if (Array.isArray(due_dates) && due_dates[i] && /^\d{4}-\d{2}-\d{2}$/.test(due_dates[i])) {
        dueDate = due_dates[i];
      } else {
        const d = new Date();
        d.setMonth(d.getMonth() + i + 1);
        d.setDate(10);
        dueDate = d.toISOString().slice(0, 10);
      }

      await getDb()('billing_invoices').insert({
        school_id: schoolId,
        student_id: studentId,
        contract_id: contractId,
        reference_month: dueDate.slice(0, 7),
        due_date: dueDate,
        amount: installmentBase + (i === 0 ? firstInstallmentExtra : 0),
        discount_amount: 0, fine_amount: 0, interest_amount: 0,
        status: 'pendente',
        scholar_fee: 0, // já foi cobrado nas faturas originais
        scholar_commission: 0,
        negotiation_id: negId,
        notes: `Parcela ${i + 1}/${instAll} — negociação #${negId}`,
        created_at: now, updated_at: now,
      });
    }

    ok(res, { id: negId, installments: instAll });
  } catch (e) { fail(res, e.message, 500); }
});

// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK — notificação de pagamento do gateway
// ══════════════════════════════════════════════════════════════════════════════

// POST /financeiro/webhook/:schoolId
router.post('/webhook/:schoolId', async (req, res) => {
  // Responde 200 imediatamente — boas práticas de webhook
  res.status(200).json({ ok: true });

  try {
    const schoolId = intParam(req.params.schoolId);
    const body = req.body;

    // MercadoPago: { type: 'payment', data: { id: '...' } }
    if (body?.type === 'payment' && body?.data?.id) {
      const externalId = String(body.data.id);
      const invoice = await getDb()('billing_invoices')
        .where({ school_id: schoolId, external_id: externalId })
        .whereNotIn('status', ['pago', 'cancelado'])
        .first();

      if (invoice) {
        const now = new Date().toISOString();
        await getDb()('billing_invoices')
          .where({ id: invoice.id })
          .update({ status: 'pago', paid_at: now, updated_at: now });

        // Verifica se toda a negociação foi quitada
        if (invoice.negotiation_id) {
          const outstanding = await getDb()('billing_invoices')
            .where({ negotiation_id: invoice.negotiation_id })
            .whereNotIn('status', ['pago', 'cancelado', 'negociado'])
            .count('id as cnt')
            .first();
          if (parseInt(outstanding.cnt, 10) === 0) {
            await getDb()('billing_negotiations')
              .where({ id: invoice.negotiation_id })
              .update({ status: 'quitada' });
          }
        }
      }
    }
  } catch (_) { /* erros de webhook são silenciosos */ }
});

module.exports = router;
