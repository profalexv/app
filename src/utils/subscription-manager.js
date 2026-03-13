/**
 * subscription-manager.js
 *
 * Gerenciador de assinaturas e planos do sistema AULA.
 * Todos os métodos são async — usa Knex (PostgreSQL).
 */

// ═══════════════════════════════════════════════════════════════════════════
// DEFINIÇÃO DOS PLANOS
// ═══════════════════════════════════════════════════════════════════════════

const PLANS = {
  // ── Hospedados (gerenciados pela plataforma) ───────────────────────────────
  free: {
    id: 'free',
    name: 'Free',
    description: 'Cronograma básico — Sempre grátis',
    hosted: true,
    price: { annual: 0, firstYearPrice: 0 },
    trial: null,
    limits: { schools: 1, classes: 0, teachers: 0, resources: 0 },
    features: {
      cronograma: true,
      sugestao_automatica: false,
      exportacao_pdf: false,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: false,
      registro_aulas: false,
      relatorios: false,
      backup_cloud: false,
      suporte_prioritario: false
    }
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'Escola pequena — até 5 turmas',
    hosted: true,
    price: { annual: 315, firstYearPrice: 189 },
    trial: { duration: 14, durationUnit: 'days' },
    limits: { schools: 1, classes: 5, teachers: 22, resources: 0 },
    features: {
      cronograma: true,
      sugestao_automatica: true,
      exportacao_pdf: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: false,
      registro_aulas: true,
      relatorios: false,
      backup_cloud: false,
      suporte_implantacao: true,
      suporte_prioritario: false
    }
  },
  multi: {
    id: 'multi',
    name: 'Multi',
    description: 'Escola média — até 15 turmas',
    hosted: true,
    price: { annual: 540, firstYearPrice: 324 },
    trial: { duration: 14, durationUnit: 'days' },
    limits: { schools: 1, classes: 15, teachers: 60, resources: 0 },
    features: {
      cronograma: true,
      sugestao_automatica: true,
      exportacao_pdf: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: false,
      registro_aulas: true,
      relatorios: false,
      backup_cloud: false,
      suporte_prioritario: true
    }
  },
  maxxi: {
    id: 'maxxi',
    name: 'Maxxi',
    description: 'Escola grande — até 35 turmas',
    hosted: true,
    price: { annual: 980, firstYearPrice: 588 },
    trial: { duration: 14, durationUnit: 'days' },
    limits: { schools: 1, classes: 35, teachers: 90, resources: 0 },
    features: {
      cronograma: true,
      sugestao_automatica: true,
      exportacao_pdf: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: false,
      registro_aulas: true,
      relatorios: false,
      backup_cloud: false,
      suporte_dedicado: true,
      suporte_prioritario: true
    }
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    description: 'Turmas e professores ilimitados',
    hosted: true,
    price: { annual: 1260, firstYearPrice: 756 },
    trial: { duration: 14, durationUnit: 'days' },
    limits: { schools: 1, classes: 0, teachers: 0, resources: 0 },
    features: {
      cronograma: true,
      sugestao_automatica: true,
      exportacao_pdf: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: false,
      registro_aulas: true,
      relatorios: true,
      backup_cloud: false,
      suporte_dedicado: true,
      suporte_prioritario: true
    }
  },
  plus_premium: {
    id: 'plus_premium',
    name: 'Plus Premium',
    description: 'Plataforma pedagógica completa — ilimitado',
    hosted: true,
    price: { annual: 4390, firstYearPrice: 2634 },
    trial: { duration: 14, durationUnit: 'days' },
    limits: { schools: 1, classes: 0, teachers: 0, resources: 0 },
    features: {
      cronograma: true,
      sugestao_automatica: true,
      exportacao_pdf: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: true,
      editor_planos_bncc: true,
      registro_aulas: true,
      relatorios: true,
      backup_cloud: false,
      suporte_dedicado: true,
      suporte_prioritario: true
    }
  },

  // ── Auto-hospedados (PRO — dados na infraestrutura do cliente) ─────────────
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Controle total, compliance LGPD — auto-hospedado',
    hosted: false,
    price: { annual: 1050, firstYearPrice: 630 },
    trial: { duration: 14, durationUnit: 'days' },
    limits: { schools: 1, classes: 0, teachers: 0, resources: 0 },
    features: {
      cronograma: true,
      sugestao_automatica: true,
      exportacao_pdf: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: false,
      registro_aulas: true,
      relatorios: true,
      backup_local: true,
      backup_cloud: false,
      bd_proprio: true,
      cloudflare_tunnel: true,
      compliance_lgpd: true,
      suporte_prioritario: false
    }
  },
  pro_premium: {
    id: 'pro_premium',
    name: 'Pro Premium',
    description: 'Plataforma pedagógica + LGPD — auto-hospedado',
    hosted: false,
    price: { annual: 4110, firstYearPrice: 2466 },
    trial: { duration: 14, durationUnit: 'days' },
    limits: { schools: 1, classes: 0, teachers: 0, resources: 0 },
    features: {
      cronograma: true,
      sugestao_automatica: true,
      exportacao_pdf: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: true,
      editor_planos_bncc: true,
      registro_aulas: true,
      relatorios: true,
      backup_local: true,
      backup_cloud: false,
      bd_proprio: true,
      cloudflare_tunnel: true,
      compliance_lgpd: true,
      suporte_prioritario: false
    }
  }
};

// ADD-ONs: Plataforma de Planos de Aula (adquiridos separadamente)
const ADD_ONS = {
  addon_planner: {
    id: 'addon_planner',
    name: 'Addon Plano — Planner',
    description: 'Escola no aula.app — até 22 professores',
    price: { annual: 2210, firstYearPrice: 1326 },
    applicablePlans: ['free', 'starter', 'maxxi', 'plus', 'pro'],
    features: { plano_aula: true, editor_planos_bncc: true }
  },
  addon_team: {
    id: 'addon_team',
    name: 'Addon Plano — Team',
    description: 'Escola no aula.app — até 60 professores',
    price: { annual: 3960, firstYearPrice: 2376 },
    applicablePlans: ['multi', 'maxxi', 'pro'],
    features: { plano_aula: true, editor_planos_bncc: true }
  },
  addon_base: {
    id: 'addon_base',
    name: 'Addon Plano — Base',
    description: 'Professor individual em escola que usa o aula.app',
    price: { annual: 180, monthly: 20 },
    applicablePlans: null,
    features: { plano_aula: true, editor_planos_bncc: true }
  },
  addon_superprof: {
    id: 'addon_superprof',
    name: 'Addon Plano — Superprof',
    description: 'Professor individual fora do aula.app',
    price: { annual: 360, monthly: 40 },
    applicablePlans: null,
    features: { plano_aula: true, editor_planos_bncc: true }
  }
};

// ADD-ON PONTO: Registro de Ponto de Funcionário
const PONTO_PLANS = {
  per_employee: {
    id: 'per_employee',
    name: 'Por Funcionário',
    description: 'R$20 pelos 8 primeiros, R$16 do 9º ao 16º, R$10 a partir do 17º',
    maxEmployees: 0,   // ilimitado
    basePrice: 0,
    tiers: [
      { upTo: 8,        pricePerEmployee: 2000 },  // R$20 (1º–8º)
      { upTo: 16,       pricePerEmployee: 1600 },  // R$16 (9º–16º)
      { upTo: Infinity, pricePerEmployee: 1000 },  // R$10 (17º em diante)
    ],
  },
  mini: {
    id: 'mini',
    name: 'Ponto Mini',
    description: 'Até 30 funcionários — R$340/mês (R$10 por funcionário extra)',
    maxEmployees: 30,
    basePrice: 34000,           // R$340 em centavos
    extraPricePerEmployee: 1000, // R$10
  },
  pronto: {
    id: 'pronto',
    name: 'Ponto Pronto',
    description: 'Até 80 funcionários — R$640/mês (R$10 por funcionário extra)',
    maxEmployees: 80,
    basePrice: 64000,           // R$640 em centavos
    extraPricePerEmployee: 1000,
  },
  maximo: {
    id: 'maximo',
    name: 'Ponto Máximo',
    description: 'Funcionários ilimitados — R$980/mês',
    maxEmployees: 0,
    basePrice: 98000,           // R$980 em centavos
    extraPricePerEmployee: 0,
  },
};

/** Calcula o preço mensal do addon Ponto para um número de funcionários */
function calcPontoPrice(planType, employeeCount) {
  const plan = PONTO_PLANS[planType];
  if (!plan) return 0;
  if (planType === 'per_employee') {
    let total = 0, consumed = 0;
    for (const tier of plan.tiers) {
      if (consumed >= employeeCount) break;
      const tierMax = tier.upTo === Infinity ? employeeCount : Math.min(tier.upTo, employeeCount);
      const inTier  = tierMax - consumed;
      if (inTier > 0) { total += inTier * tier.pricePerEmployee; consumed += inTier; }
    }
    return total;
  }
  const extra = plan.maxEmployees > 0 ? Math.max(0, employeeCount - plan.maxEmployees) : 0;
  return plan.basePrice + extra * (plan.extraPricePerEmployee || 0);
}

// ADD-ON ESCOLAR: Frequência, Diário do Professor, Ocorrências
const ESCOLAR_PLANS = {
  lite: {
    id: 'lite',
    name: 'Escolar Lite',
    description: 'Até 10 turmas — R$560/mês · excedente R$43/turma',
    maxClasses: 10,
    basePrice: 56000,            // R$560 em centavos
    extraPricePerClass: 4300,    // R$43 por turma além do limite
  },
  basic: {
    id: 'basic',
    name: 'Escolar Basic',
    description: 'Até 30 turmas — R$980/mês · excedente R$34/turma',
    maxClasses: 30,
    basePrice: 98000,            // R$980 em centavos
    extraPricePerClass: 3400,    // R$34 por turma além do limite
  },
  flex: {
    id: 'flex',
    name: 'Escolar Flex',
    description: 'Até 60 turmas — R$1.790/mês · excedente R$28/turma',
    maxClasses: 60,
    basePrice: 179000,           // R$1.790 em centavos
    extraPricePerClass: 2800,    // R$28 por turma além do limite
  },
  total: {
    id: 'total',
    name: 'Escolar Total',
    description: 'Ilimitado por unidade · Rede: até 100 turmas — R$2.600/mês · excedente R$23/turma',
    maxClasses: 0,               // 0 = ilimitado (unidade escolar individual)
    networkMaxClasses: 100,      // limite incluído para redes de escolas
    basePrice: 260000,           // R$2.600 em centavos
    extraPricePerClass: 2300,    // R$23 por turma além de 100 (apenas redes)
  },
};

/** Calcula o preço mensal do addon Escolar para um número de turmas */
function calcEscolarPrice(planType, classCount, isNetwork = false) {
  const plan = ESCOLAR_PLANS[planType];
  if (!plan) return 0;
  // Total em unidade individual: sem limite, sem excedente
  if (planType === 'total' && !isNetwork) return plan.basePrice;
  const limit = planType === 'total' ? plan.networkMaxClasses : plan.maxClasses;
  const extra = Math.max(0, classCount - limit);
  return plan.basePrice + extra * plan.extraPricePerClass;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLASSE GERENCIADORA
// ═══════════════════════════════════════════════════════════════════════════

class SubscriptionManager {
  constructor(db) {
    this.db = db; // instância knex
  }

  async createSubscription(schoolId, planType = 'free') {
    const plan = PLANS[planType];
    if (!plan) throw new Error(`Plano inválido: ${planType}`);

    const now = new Date();
    let trialEndsAt = null;
    let status = 'active';

    if (plan.trial) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + plan.trial.duration);
      trialEndsAt = trialEnd.toISOString();
      status = 'trial';
    }

    const [row] = await this.db('school_subscriptions').insert({
      school_id:       schoolId,
      plan_type:       planType,
      status,
      max_classes:     plan.limits.classes,
      max_teachers:    plan.limits.teachers,
      max_schools:     plan.limits.schools,
      trial_started_at: plan.trial ? now.toISOString() : null,
      trial_ends_at:   trialEndsAt,
      annual_price:    plan.price.annual,
      first_year_price: plan.price.firstYearPrice,
      franchise_paid:  true,
      features_json:   JSON.stringify(plan.features),
      activated_at:    now.toISOString(),
      updated_at:      now.toISOString()
    }).returning('id');

    const id = row.id ?? row;

    await this.addHistoryEvent(id, 'created', planType, 0,
      `Assinatura criada no plano ${plan.name}`);

    if (plan.trial) {
      await this.addHistoryEvent(id, 'trial_started', planType, 0,
        `Período de trial iniciado (${plan.trial.duration} dias)`);
    }

    return id;
  }

  async getSubscription(schoolId) {
    const sub = await this.db('school_subscriptions').where({ school_id: schoolId }).first();
    if (!sub) return null;

    if (sub.features_json) {
      try { sub.features = JSON.parse(sub.features_json); } catch { sub.features = {}; }
    }
    sub.plan = PLANS[sub.plan_type] || PLANS.free;
    return sub;
  }

  async canCreateClass(schoolId) {
    const sub = await this.getSubscription(schoolId);
    if (!sub) return { allowed: false, reason: 'Assinatura não encontrada' };
    if (!await this.isActive(sub)) return { allowed: false, reason: 'Assinatura expirada ou inativa' };
    if (sub.max_classes === 0) return { allowed: true };

    const [{ cnt }] = await this.db('classes').where({ school_id: schoolId }).count('id as cnt');
    const count = parseInt(cnt, 10);

    if (count >= sub.max_classes) {
      return { allowed: false, reason: `Limite de ${sub.max_classes} turmas atingido. Upgrade necessário.`, current: count, limit: sub.max_classes };
    }
    return { allowed: true, current: count, limit: sub.max_classes };
  }

  async canCreateTeacher(schoolId) {
    const sub = await this.getSubscription(schoolId);
    if (!sub) return { allowed: false, reason: 'Assinatura não encontrada' };
    if (!await this.isActive(sub)) return { allowed: false, reason: 'Assinatura expirada ou inativa' };
    if (sub.max_teachers === 0) return { allowed: true };

    const [{ cnt }] = await this.db('teachers').where({ school_id: schoolId, active: true }).count('id as cnt');
    const count = parseInt(cnt, 10);

    if (count >= sub.max_teachers) {
      return { allowed: false, reason: `Limite de ${sub.max_teachers} professores atingido. Upgrade necessário.`, current: count, limit: sub.max_teachers };
    }
    return { allowed: true, current: count, limit: sub.max_teachers };
  }

  async hasFeature(schoolId, featureName) {
    const sub = await this.getSubscription(schoolId);
    if (!sub) return false;
    if (!await this.isActive(sub)) return false;
    return sub.features && sub.features[featureName] === true;
  }

  async isActive(subscription) {
    if (!subscription) return false;
    const now = new Date();

    if (subscription.status === 'trial' && subscription.trial_ends_at) {
      if (now > new Date(subscription.trial_ends_at)) {
        await this.expireTrial(subscription.id);
        return false;
      }
    }

    if (['expired', 'cancelled'].includes(subscription.status)) return false;
    if (subscription.expires_at && now > new Date(subscription.expires_at)) return false;

    return true;
  }

  async expireTrial(subscriptionId) {
    await this.db('school_subscriptions').where({ id: subscriptionId }).update({
      status: 'expired',
      updated_at: new Date().toISOString()
    });

    const sub = await this.db('school_subscriptions').where({ id: subscriptionId }).select('plan_type').first();
    await this.addHistoryEvent(subscriptionId, 'trial_ended', sub.plan_type, 0, 'Período de trial expirado');
  }

  async recordPayment(subscriptionId, amount, notes = '') {
    const now = new Date().toISOString();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await this.db('school_subscriptions').where({ id: subscriptionId }).update({
      status: 'active',
      last_payment_at: now,
      expires_at: expiresAt.toISOString(),
      updated_at: now
    });

    const sub = await this.db('school_subscriptions').where({ id: subscriptionId }).select('plan_type').first();
    await this.addHistoryEvent(subscriptionId, 'payment_received', sub.plan_type, amount,
      notes || `Pagamento de R$ ${Number(amount).toFixed(2)} recebido`);
  }

  async recordFranchisePayment(subscriptionId, amount) {
    const now = new Date().toISOString();
    await this.db('school_subscriptions').where({ id: subscriptionId }).update({
      franchise_paid: true,
      last_payment_at: now,
      updated_at: now
    });

    const sub = await this.db('school_subscriptions').where({ id: subscriptionId }).select('plan_type').first();
    await this.addHistoryEvent(subscriptionId, 'payment_received', sub.plan_type, amount,
      `Franquia de R$ ${Number(amount).toFixed(2)} paga`);
  }

  async upgradePlan(subscriptionId, newPlanType) {
    const newPlan = PLANS[newPlanType];
    if (!newPlan) throw new Error(`Plano inválido: ${newPlanType}`);

    const oldSub = await this.db('school_subscriptions').where({ id: subscriptionId }).select('plan_type').first();

    await this.db('school_subscriptions').where({ id: subscriptionId }).update({
      plan_type:        newPlanType,
      max_classes:      newPlan.limits.classes,
      max_teachers:     newPlan.limits.teachers,
      annual_price:     newPlan.price.annual,
      first_year_price: newPlan.price.firstYearPrice,
      features_json:    JSON.stringify(newPlan.features),
      updated_at:       new Date().toISOString()
    });

    await this.addHistoryEvent(subscriptionId, 'plan_upgraded', newPlanType, 0,
      `Upgrade de ${oldSub.plan_type} para ${newPlanType}`);
  }

  async addHistoryEvent(subscriptionId, eventType, planType, amount, notes) {
    await this.db('subscription_history').insert({
      subscription_id: subscriptionId,
      event_type: eventType,
      plan_type: planType,
      amount,
      notes
    });
  }

  async getHistory(subscriptionId) {
    return this.db('subscription_history')
      .where({ subscription_id: subscriptionId })
      .orderBy('created_at', 'desc');
  }

  async getUsageStats(schoolId) {
    const [[{ cnt: classes }], [{ cnt: teachers }], [{ cnt: resources }]] = await Promise.all([
      this.db('classes').where({ school_id: schoolId }).count('id as cnt'),
      this.db('teachers').where({ school_id: schoolId, active: true }).count('id as cnt'),
      this.db('resources').where({ school_id: schoolId }).count('id as cnt')
    ]);

    return {
      classes:   parseInt(classes, 10),
      teachers:  parseInt(teachers, 10),
      resources: parseInt(resources, 10)
    };
  }

  getPlanDetails(planType) {
    const plan = PLANS[planType];
    if (!plan) throw new Error(`Plano inválido: ${planType}`);
    return plan;
  }
}

// ── Addon FINANCEIRO ─────────────────────────────────────────────────────────
// R$0,30 por aluno ativo/mês + 0,5% por transação (mode scholar_managed)
const FINANCEIRO_FEE_PER_STUDENT = 30;    // centavos
const FINANCEIRO_COMMISSION_RATE = 0.005; // 0,5%

module.exports = {
  SubscriptionManager, PLANS, ADD_ONS, PONTO_PLANS, ESCOLAR_PLANS, calcEscolarPrice,
  FINANCEIRO_FEE_PER_STUDENT, FINANCEIRO_COMMISSION_RATE,
};
