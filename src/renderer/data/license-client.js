/**
 * license-client.js (renderer)
 *
 * Gerencia o estado de licença/plano do usuário autenticado.
 * O status vem do servidor (Fly.io → Supabase) após o login
 * e é armazenado em window.LicenseManager._status.
 *
 * Planos disponíveis: FREE, STARTER, MULTI, MAXXI, PLUS,
 *   PLUS PREMIUM, PRO, PRO PREMIUM.
 * ADDON PLANO: PLANNER, TEAM, BASE, SUPERPROF.
 *
 * A validação real acontece no backend (licenseService.js no motor).
 * Este módulo apenas reflete o estado recebido no JWT/sessão.
 */

window.LicenseManager = {
  _status: {
    plan: null,       // null = ainda não carregado → comportamento permissivo
    addonPlano: false,
    lessonPlans: false,
    selfHosted: false,
    trialActive: false,
    trialEndsAt: null,
  },

  /**
   * Inicializa o status de licença a partir dos dados de sessão.
   * Deve ser chamado após o login bem-sucedido.
   * @param {object} sessionData - dados retornados pelo endpoint /auth/login ou /api/license
   */
  load(sessionData = {}) {
    if (sessionData.license) {
      this._status = { ...this._status, ...sessionData.license };
    }
    this._applyToTabs();
    return this._status;
  },

  /** Retorna o plano atual */
  get plan() { return this._status.plan; },

  /** Verifica se o módulo de planos de aula está habilitado */
  get hasLessonPlans() { return this._status.lessonPlans === true; },

  /** Verifica se está em trial */
  get isInTrial() { return this._status.trialActive === true; },

  /**
   * Verifica se um módulo está acessível para o plano atual.
   * 'cronograma' e 'aula' — disponíveis em todos os planos pagos.
   * 'plano' — apenas PLUS PREMIUM, PRO PREMIUM ou ADDON PLANO ativo.
   */
  isLicensed(moduleId) {
    if (moduleId === 'plano') return this._status.lessonPlans === true;
    // Se o plano ainda não foi carregado do servidor, permite acesso (permissivo por padrão).
    // O bloqueio real acontece no backend via SubscriptionManager.
    if (this._status.plan === null) return true;
    // Demais módulos: disponíveis desde que não seja FREE
    return this._status.plan !== 'free';
  },

  /**
   * Exibe mensagem quando módulo está bloqueado pelo plano.
   * Substitui a antiga chamada a openActivationScreen.
   */
  openActivationScreen(moduleId) {
    const names = { plano: 'Planos de Aula', cronograma: 'Cronograma', aula: 'Registro de Aulas', usuarios: 'Usuários' };
    const name = names[moduleId] || moduleId;
    if (window.showToast) {
      window.showToast(`O módulo "${name}" não está disponível no seu plano atual. Faça upgrade para acessá-lo.`, 'warning', 5000);
    }
  },

  /**
   * Atualiza visualmente as abas de acordo com o plano.
   */
  _applyToTabs() {
    document.querySelectorAll('.tab-btn[data-module]').forEach(btn => {
      const id = btn.dataset.module;
      const locked = !this.isLicensed(id);

      if (locked) {
        btn.classList.add('tab-locked');
        btn.title = 'Módulo não disponível no seu plano atual';
        if (!btn.querySelector('.lock-icon')) {
          const lock = document.createElement('span');
          lock.className = 'lock-icon';
          lock.textContent = '🔒';
          btn.appendChild(lock);
        }
      } else {
        btn.classList.remove('tab-locked');
        btn.title = '';
        btn.querySelector('.lock-icon')?.remove();
      }
    });
  },
};

