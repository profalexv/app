'use strict';

/**
 * Testes unitários para subscription-manager.js
 * Utiliza mock do banco de dados para evitar connecting ao Supabase.
 */

const { SubscriptionManager } = require('../utils/subscription-manager');

// ─── Factory de mock DB ───────────────────────────────────────────────────────
function makeMockDb(overrides = {}) {
  const defaults = {
    subscription: { plan_type: 'starter', status: 'active', expires_at: null, max_classes: 5, max_teachers: 22 },
    classCount: 2,
    teacherCount: 10,
  };
  const cfg = { ...defaults, ...overrides };

  return (table) => ({
    where: () => ({
      first:  async () => {
        if (table === 'school_subscriptions') return cfg.subscription;
        return null;
      },
      select: () => ({ first: async () => null }),
      count:  () => ({ first: async () => null }),
    }),
    count: (alias) => {
      const key = (alias || 'id as cnt').split(' as ')[1] || 'cnt';
      return [{
        then: (resolve) => resolve([{ [key]: table === 'classes' ? cfg.classCount : cfg.teacherCount }]),
        [Symbol.asyncIterator]: undefined,
      }];
    },
    orderBy: () => ({ first: async () => null }),
  });
}

// Cria um mock funcional que suporta .count(alias) como promessa
function buildDb(sub, classCount = 0, teacherCount = 0) {
  return (table) => {
    const q = {
      where:   () => q,
      select:  () => q,
      orderBy: () => q,
      first:   async () => {
        if (table === 'school_subscriptions') return sub;
        return null;
      },
      count: (alias = 'id as cnt') => {
        const key = alias.split(' as ').pop().trim();
        const val = table === 'classes' ? classCount : teacherCount;
        return [Promise.resolve({ [key]: val })];
      },
    };
    return q;
  };
}

// ─── getPlanDetails ───────────────────────────────────────────────────────────
describe('SubscriptionManager.getPlanDetails', () => {
  const sm = new SubscriptionManager(() => ({}));

  test('retorna plano free', () => {
    const plan = sm.getPlanDetails('free');
    expect(plan).toBeDefined();
    expect(plan.name).toBe('Free');
    expect(plan.price.annual).toBe(0);
  });

  test('retorna plano starter', () => {
    const plan = sm.getPlanDetails('starter');
    expect(plan.name).toBe('Starter');
    expect(plan.limits.classes).toBe(5);
    expect(plan.limits.teachers).toBe(22);
  });

  test('lança erro para plano inexistente', () => {
    expect(() => sm.getPlanDetails('inexistente')).toThrow('Plano inválido');
  });

  test('plano plus não limita turmas (0 = ilimitado)', () => {
    const plan = sm.getPlanDetails('plus');
    expect(plan.limits.classes).toBe(0);
    expect(plan.limits.teachers).toBe(0);
  });
});

// ─── isActive ─────────────────────────────────────────────────────────────────
describe('SubscriptionManager.isActive', () => {
  test('retorna true para status active sem data de expiração', async () => {
    const sm = new SubscriptionManager(buildDb(null));
    const result = await sm.isActive({ status: 'active', expires_at: null });
    expect(result).toBe(true);
  });

  // isActive bloqueia apenas 'expired' e 'cancelled' — status válidos do sistema
  test('retorna false para status cancelled', async () => {
    const sm = new SubscriptionManager(buildDb(null));
    const result = await sm.isActive({ status: 'cancelled', expires_at: null });
    expect(result).toBe(false);
  });

  test('retorna false para status expired', async () => {
    const sm = new SubscriptionManager(buildDb(null));
    const result = await sm.isActive({ status: 'expired', expires_at: null });
    expect(result).toBe(false);
  });

  test('retorna false para assinatura expirada (expires_at no passado)', async () => {
    const sm = new SubscriptionManager(buildDb(null));
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // ontem
    const result = await sm.isActive({ status: 'active', expires_at: pastDate });
    expect(result).toBe(false);
  });

  test('retorna true para assinatura com expiração futura', async () => {
    const sm = new SubscriptionManager(buildDb(null));
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // amanhã
    const result = await sm.isActive({ status: 'active', expires_at: futureDate });
    expect(result).toBe(true);
  });

  test('retorna false para assinatura nula', async () => {
    const sm = new SubscriptionManager(buildDb(null));
    const result = await sm.isActive(null);
    expect(result).toBe(false);
  });
});

// ─── canCreateClass ───────────────────────────────────────────────────────────
describe('SubscriptionManager.canCreateClass', () => {
  test('bloqueia quando assinatura não encontrada', async () => {
    const db = buildDb(null);
    const sm = new SubscriptionManager(db);
    const result = await sm.canCreateClass(1);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/assinatura/i);
  });

  test('permite quando ilimitado (max_classes = 0)', async () => {
    const sub = { plan_type: 'plus', status: 'active', expires_at: null, max_classes: 0, max_teachers: 0 };
    const db = buildDb(sub, 999);
    const sm = new SubscriptionManager(db);
    const result = await sm.canCreateClass(1);
    expect(result.allowed).toBe(true);
  });
});
