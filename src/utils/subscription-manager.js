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
  free: {
    id: 'free',
    name: 'Grátis',
    description: 'Cronograma básico - Sempre grátis',
    price: { monthly: 0, annual: 0, franchise: 0 },
    trial: null,
    limits: { schools: 1, classes: 0, teachers: 0, resources: 0 },
    features: {
      cronograma: true,
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
    description: 'Avaliação - Grátis por 1 ano',
    price: { monthly: 0, annual: 120, franchise: 0 },
    trial: { duration: 365, durationUnit: 'days' },
    limits: { schools: 1, classes: 5, teachers: 22, resources: 0 },
    features: {
      cronograma: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: true,
      registro_aulas: true,
      relatorios: false,
      backup_cloud: false,
      suporte_prioritario: false
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'Completo - Hospedagem local',
    price: { monthly: 0, annual: 320, franchise: 0 },
    trial: { duration: 180, durationUnit: 'days' },
    limits: { schools: 1, classes: 15, teachers: 60, resources: 0 },
    features: {
      cronograma: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: true,
      registro_aulas: true,
      relatorios: true,
      backup_local: true,
      backup_cloud: false,
      suporte_prioritario: false
    }
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    description: 'Local premium - Sem limitações de capacidade',
    price: { monthly: 0, annual: 820, franchise: 0, firstYearDiscount: 0.40, firstYearPrice: 492 },
    trial: null,
    limits: { schools: 1, classes: 0, teachers: 0, resources: 0 },
    features: {
      cronograma: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: true,
      registro_aulas: true,
      relatorios: true,
      backup_local: true,
      backup_cloud: false,
      suporte_prioritario: false,
      acesso_web: true,
      acesso_mobile: true,
      expansao_local: true
    }
  },
  cloud: {
    id: 'cloud',
    name: 'Cloud',
    description: 'Instância dedicada em nuvem',
    price: { monthly: 150, annual: 1800, franchise: 400 },
    trial: null,
    limits: { schools: 1, classes: 0, teachers: 0, resources: 0 },
    features: {
      cronograma: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: true,
      registro_aulas: true,
      relatorios: true,
      backup_local: true,
      backup_cloud: true,
      suporte_prioritario: true,
      espelhamento_local: true,
      alta_disponibilidade: true,
      escalabilidade_automatica: true,
      instancia_dedicada: true,
      isolamento_total: true,
      compliance_lgpd: true
    }
  },
  online_basic: {
    id: 'online_basic',
    name: 'Online Básico',
    description: 'Multi-tenant em nuvem (PostgreSQL compartilhado)',
    price: { monthly: 116.67, annual: 1400, franchise: 0 },
    trial: null,
    limits: { schools: 1, classes: 0, teachers: 0, resources: 0 },
    features: {
      cronograma: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: true,
      registro_aulas: true,
      relatorios: true,
      backup_cloud: true,
      suporte_prioritario: false,
      multi_tenant: true,
      postgresql: true,
      acesso_web: true,
      acesso_mobile: true
    }
  },
  online_premium: {
    id: 'online_premium',
    name: 'Online Premium',
    description: 'Multi-tenant + Plataforma de Planos de Aula ILIMITADA',
    price: { monthly: 183.33, annual: 2200, franchise: 0 },
    trial: null,
    limits: { schools: 1, classes: 0, teachers: 0, resources: 0, lesson_plan_teachers: 0 },
    features: {
      cronograma: true,
      cadastro_escola: true,
      cadastro_professores: true,
      cadastro_recursos: true,
      agendamento_recursos: true,
      plano_aula: true,
      registro_aulas: true,
      relatorios: true,
      backup_cloud: true,
      suporte_prioritario: true,
      multi_tenant: true,
      postgresql: true,
      acesso_web: true,
      acesso_mobile: true,
      plataforma_planos_ilimitada: true,
      editor_planos_bncc: true,
      biblioteca_planos: true,
      colaboracao_professores: true
    }
  }
};

const ADD_ONS = {
  premium_lesson_plans: {
    id: 'premium_lesson_plans',
    name: 'Pacote Premium',
    description: 'Acesso ao editor de planos de aula com biblioteca e templates',
    price: { annual: 650 },
    applicablePlans: ['pro', 'plus', 'cloud'],
    features: {
      editor_planos_bncc: true,
      biblioteca_planos: true,
      colaboracao_professores: true,
      templates_customizaveis: true,
      sync_multiplas_turmas: true
    }
  }
};

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
      monthly_price:   plan.price.monthly,
      annual_price:    plan.price.annual,
      franchise_fee:   plan.price.franchise,
      franchise_paid:  planType !== 'cloud',
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
    if (subscription.plan_type === 'cloud' && !subscription.franchise_paid) return false;
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
      plan_type:     newPlanType,
      max_classes:   newPlan.limits.classes,
      max_teachers:  newPlan.limits.teachers,
      monthly_price: newPlan.price.monthly,
      annual_price:  newPlan.price.annual,
      franchise_fee: newPlan.price.franchise,
      features_json: JSON.stringify(newPlan.features),
      updated_at:    new Date().toISOString()
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

module.exports = { SubscriptionManager, PLANS, ADD_ONS };
