/**
 * subscription-manager.js
 * 
 * Gerenciador de assinaturas e planos do sistema AULA
 * Valida limites, períodos de trial e funcionalidades por plano
 */

// ═══════════════════════════════════════════════════════════════════════════
// DEFINIÇÃO DOS PLANOS
// ═══════════════════════════════════════════════════════════════════════════

const PLANS = {
  free: {
    id: 'free',
    name: 'Grátis',
    description: 'Cronograma básico - Sempre grátis',
    price: {
      monthly: 0,
      annual: 0,
      franchise: 0
    },
    trial: null,
    limits: {
      schools: 1,
      classes: 0,      // ilimitado
      teachers: 0,     // ilimitado
      resources: 0     // ilimitado
    },
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
    price: {
      monthly: 0,
      annual: 120,     // R$ 120/ano após trial
      franchise: 0
    },
    trial: {
      duration: 365,   // 1 ano grátis
      durationUnit: 'days'
    },
    limits: {
      schools: 1,
      classes: 5,
      teachers: 22,
      resources: 0     // ilimitado
    },
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
    price: {
      monthly: 0,
      annual: 320,     // R$ 320/ano após trial
      franchise: 0
    },
    trial: {
      duration: 180,   // 6 meses grátis
      durationUnit: 'days'
    },
    limits: {
      schools: 1,
      classes: 15,
      teachers: 60,
      resources: 0     // ilimitado
    },
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
    price: {
      monthly: 0,
      annual: 820,     // R$ 820/ano (40% desconto no 1º ano)
      franchise: 0,
      firstYearDiscount: 0.40,  // 40% desconto no primeiro ano
      firstYearPrice: 492       // R$ 492/ano no primeiro ano
    },
    trial: null,
    limits: {
      schools: 1,
      classes: 0,      // ilimitado
      teachers: 0,     // ilimitado
      resources: 0     // ilimitado
    },
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
    description: 'Instância dedicada em nuvem com SQLite isolado',
    price: {
      monthly: 150,    // R$ 150/mês
      annual: 1800,    // R$ 150 x 12
      franchise: 400   // R$ 400 franquia (pode parcelar em 12x)
    },
    trial: null,       // Sem trial, paga desde o início
    limits: {
      schools: 1,
      classes: 0,      // ilimitado
      teachers: 0,     // ilimitado
      resources: 0     // ilimitado
    },
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
      espelhamento_local: true,  // opcional
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
    price: {
      monthly: 116.67,   // R$ 1400/ano ÷ 12
      annual: 1400,      // R$ 1400/ano
      franchise: 0
    },
    trial: null,
    limits: {
      schools: 1,
      classes: 0,      // ilimitado
      teachers: 0,     // ilimitado
      resources: 0     // ilimitado
    },
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
    price: {
      monthly: 183.33,   // R$ 2200/ano ÷ 12
      annual: 2200,      // R$ 2200/ano
      franchise: 0
    },
    trial: null,
    limits: {
      schools: 1,
      classes: 0,      // ilimitado
      teachers: 0,     // ilimitado
      resources: 0,    // ilimitado
      lesson_plan_teachers: 0  // ilimitado (incluído no plano)
    },
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

// ═══════════════════════════════════════════════════════════════════════════
// ADD-ONS E PACOTES ADICIONAIS
// ═══════════════════════════════════════════════════════════════════════════

const ADD_ONS = {
  premium_lesson_plans: {
    id: 'premium_lesson_plans',
    name: 'Pacote Premium',
    description: 'Acesso ao editor de planos de aula com biblioteca e templates',
    price: {
      annual: 650     // R$ 650/ano
    },
    applicablePlans: ['pro', 'plus', 'cloud'],  // Disponível para esses planos
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
    this.db = db;
  }

  /**
   * Cria uma assinatura inicial para uma escola
   */
  createSubscription(schoolId, planType = 'free') {
    const plan = PLANS[planType];
    if (!plan) throw new Error(`Plano inválido: ${planType}`);

    const now = new Date().toISOString();
    let trialEndsAt = null;
    let status = 'active';

    // Se tem período de trial
    if (plan.trial) {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + plan.trial.duration);
      trialEndsAt = trialEnd.toISOString();
      status = 'trial';
    }

    const featuresJson = JSON.stringify(plan.features);

    const result = this.db.prepare(`
      INSERT INTO school_subscriptions (
        school_id, plan_type, status,
        max_classes, max_teachers, max_schools,
        trial_started_at, trial_ends_at,
        monthly_price, annual_price, franchise_fee,
        franchise_paid, features_json, activated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      schoolId,
      planType,
      status,
      plan.limits.classes,
      plan.limits.teachers,
      plan.limits.schools,
      plan.trial ? now : null,
      trialEndsAt,
      plan.price.monthly,
      plan.price.annual,
      plan.price.franchise,
      planType === 'cloud' ? 0 : 1,  // Cloud requer pagamento de franquia
      featuresJson,
      now
    );

    // Registrar evento no histórico
    this.addHistoryEvent(result.lastInsertRowid, 'created', planType, 0, 
      `Assinatura criada no plano ${plan.name}`);

    if (plan.trial) {
      this.addHistoryEvent(result.lastInsertRowid, 'trial_started', planType, 0,
        `Período de trial iniciado (${plan.trial.duration} dias)`);
    }

    return result.lastInsertRowid;
  }

  /**
   * Obtém assinatura de uma escola
   */
  getSubscription(schoolId) {
    const sub = this.db.prepare(`
      SELECT * FROM school_subscriptions WHERE school_id = ?
    `).get(schoolId);

    if (!sub) return null;

    // Parse do JSON de features
    if (sub.features_json) {
      try {
        sub.features = JSON.parse(sub.features_json);
      } catch (e) {
        sub.features = {};
      }
    }

    // Adicionar info do plano
    sub.plan = PLANS[sub.plan_type] || PLANS.free;

    return sub;
  }

  /**
   * Valida se uma escola pode criar uma nova turma
   */
  canCreateClass(schoolId) {
    const sub = this.getSubscription(schoolId);
    if (!sub) return { allowed: false, reason: 'Assinatura não encontrada' };

    // Verificar se assinatura está ativa
    if (!this.isActive(sub)) {
      return { allowed: false, reason: 'Assinatura expirada ou inativa' };
    }

    // Se limite é 0, é ilimitado
    if (sub.max_classes === 0) return { allowed: true };

    // Contar turmas existentes
    const count = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM classes WHERE school_id = ?
    `).get(schoolId).cnt;

    if (count >= sub.max_classes) {
      return { 
        allowed: false, 
        reason: `Limite de ${sub.max_classes} turmas atingido. Upgrade necessário.`,
        current: count,
        limit: sub.max_classes
      };
    }

    return { allowed: true, current: count, limit: sub.max_classes };
  }

  /**
   * Valida se uma escola pode criar um novo professor
   */
  canCreateTeacher(schoolId) {
    const sub = this.getSubscription(schoolId);
    if (!sub) return { allowed: false, reason: 'Assinatura não encontrada' };

    if (!this.isActive(sub)) {
      return { allowed: false, reason: 'Assinatura expirada ou inativa' };
    }

    if (sub.max_teachers === 0) return { allowed: true };

    // Contar professores ativos
    const count = this.db.prepare(`
      SELECT COUNT(DISTINCT p.id) as cnt
      FROM people p
      JOIN role_teacher rt ON rt.person_id = p.id
      WHERE p.school_id = ? AND rt.active = 1
    `).get(schoolId).cnt;

    if (count >= sub.max_teachers) {
      return {
        allowed: false,
        reason: `Limite de ${sub.max_teachers} professores atingido. Upgrade necessário.`,
        current: count,
        limit: sub.max_teachers
      };
    }

    return { allowed: true, current: count, limit: sub.max_teachers };
  }

  /**
   * Verifica se uma feature está disponível no plano
   */
  hasFeature(schoolId, featureName) {
    const sub = this.getSubscription(schoolId);
    if (!sub) return false;

    if (!this.isActive(sub)) return false;

    return sub.features && sub.features[featureName] === true;
  }

  /**
   * Verifica se assinatura está ativa
   */
  isActive(subscription) {
    if (!subscription) return false;

    const now = new Date();

    // Trial expirado?
    if (subscription.status === 'trial' && subscription.trial_ends_at) {
      const trialEnd = new Date(subscription.trial_ends_at);
      if (now > trialEnd) {
        // Expirar automaticamente
        this.expireTrial(subscription.id);
        return false;
      }
    }

    // Status inativo?
    if (['expired', 'cancelled'].includes(subscription.status)) {
      return false;
    }

    // Plano cloud requer pagamento de franquia
    if (subscription.plan_type === 'cloud' && !subscription.franchise_paid) {
      return false;
    }

    // Verificar data de expiração
    if (subscription.expires_at) {
      const expiresAt = new Date(subscription.expires_at);
      if (now > expiresAt) {
        return false;
      }
    }

    return true;
  }

  /**
   * Expira o período de trial
   */
  expireTrial(subscriptionId) {
    this.db.prepare(`
      UPDATE school_subscriptions 
      SET status = 'expired', updated_at = datetime('now')
      WHERE id = ?
    `).run(subscriptionId);

    const sub = this.db.prepare(`
      SELECT plan_type FROM school_subscriptions WHERE id = ?
    `).get(subscriptionId);

    this.addHistoryEvent(subscriptionId, 'trial_ended', sub.plan_type, 0,
      'Período de trial expirado');
  }

  /**
   * Registra pagamento e ativa assinatura
   */
  recordPayment(subscriptionId, amount, notes = '') {
    const now = new Date().toISOString();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1); // +1 ano

    this.db.prepare(`
      UPDATE school_subscriptions
      SET status = 'active',
          last_payment_at = ?,
          expires_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, expiresAt.toISOString(), now, subscriptionId);

    const sub = this.db.prepare(`
      SELECT plan_type FROM school_subscriptions WHERE id = ?
    `).get(subscriptionId);

    this.addHistoryEvent(subscriptionId, 'payment_received', sub.plan_type, amount,
      notes || `Pagamento de R$ ${amount.toFixed(2)} recebido`);
  }

  /**
   * Registra pagamento de franquia (plano cloud)
   */
  recordFranchisePayment(subscriptionId, amount) {
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE school_subscriptions
      SET franchise_paid = 1,
          last_payment_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, now, subscriptionId);

    const sub = this.db.prepare(`
      SELECT plan_type FROM school_subscriptions WHERE id = ?
    `).get(subscriptionId);

    this.addHistoryEvent(subscriptionId, 'payment_received', sub.plan_type, amount,
      `Franquia de R$ ${amount.toFixed(2)} paga`);
  }

  /**
   * Faz upgrade de plano
   */
  upgradePlan(subscriptionId, newPlanType) {
    const newPlan = PLANS[newPlanType];
    if (!newPlan) throw new Error(`Plano inválido: ${newPlanType}`);

    const oldSub = this.db.prepare(`
      SELECT plan_type FROM school_subscriptions WHERE id = ?
    `).get(subscriptionId);

    const now = new Date().toISOString();
    const featuresJson = JSON.stringify(newPlan.features);

    this.db.prepare(`
      UPDATE school_subscriptions
      SET plan_type = ?,
          max_classes = ?,
          max_teachers = ?,
          monthly_price = ?,
          annual_price = ?,
          franchise_fee = ?,
          features_json = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      newPlanType,
      newPlan.limits.classes,
      newPlan.limits.teachers,
      newPlan.price.monthly,
      newPlan.price.annual,
      newPlan.price.franchise,
      featuresJson,
      now,
      subscriptionId
    );

    this.addHistoryEvent(subscriptionId, 'plan_upgraded', newPlanType, 0,
      `Upgrade de ${oldSub.plan_type} para ${newPlanType}`);
  }

  /**
   * Adiciona evento no histórico
   */
  addHistoryEvent(subscriptionId, eventType, planType, amount, notes) {
    this.db.prepare(`
      INSERT INTO subscription_history (subscription_id, event_type, plan_type, amount, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(subscriptionId, eventType, planType, amount, notes);
  }

  /**
   * Obtém histórico de uma assinatura
   */
  getHistory(subscriptionId) {
    return this.db.prepare(`
      SELECT * FROM subscription_history
      WHERE subscription_id = ?
      ORDER BY created_at DESC
    `).all(subscriptionId);
  }

  /**
   * Obtém informações de uso atual
   */
  getUsageStats(schoolId) {
    const classCount = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM classes WHERE school_id = ?
    `).get(schoolId).cnt;

    const teacherCount = this.db.prepare(`
      SELECT COUNT(DISTINCT p.id) as cnt
      FROM people p
      JOIN role_teacher rt ON rt.person_id = p.id
      WHERE p.school_id = ? AND rt.active = 1
    `).get(schoolId).cnt;

    const resourceCount = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM resources WHERE school_id = ?
    `).get(schoolId).cnt;

    return {
      classes: classCount,
      teachers: teacherCount,
      resources: resourceCount
    };
  }

  /**
   * Obtém detalhes de um plano específico
   */
  getPlanDetails(planType) {
    const plan = PLANS[planType];
    if (!plan) {
      throw new Error(`Plano inválido: ${planType}`);
    }
    return plan;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  SubscriptionManager,
  PLANS,
  ADD_ONS
};
