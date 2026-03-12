/**
 * app.js — Script principal do renderer.
 * Gerencia a navegação entre abas, licenças, autenticação e funções utilitárias globais.
 */

// ─── Detecção Automática de Servidor ─────────────────────────────────────────
// Inicializa detecção de servidor (local, VPN ou cloud) no startup
window.AppServerDetection = {
  type: null,
  url: null,
  initialized: false,

  async initialize() {
    if (this.initialized) return;

    try {
      const serverInfo = await window.ServerDetector.detect();
      this.type = serverInfo.type;
      this.url = serverInfo.url;
      this.initialized = true;

      console.log(`[AULA] Servidor detectado: ${serverInfo.type.toUpperCase()} (${serverInfo.url})`);
      console.log(`[AULA] Latência: ${serverInfo.latency}ms | Prioridade: ${serverInfo.priority}`);

      // Mostrar no console detalhes dos endpoints
      const allEndpoints = window.ServerDetector.getAllEndpoints();
      if (allEndpoints.length > 1) {
        console.log('[AULA] Endpoints alternativos disponíveis:');
        allEndpoints.forEach((ep, i) => {
          console.log(`  ${i === 0 ? '✓' : '•'} ${ep.type}: ${ep.url} (${ep.latency}ms)`);
        });
      }

      // Mostrar indicador visual no título da page
      const original = document.title;
      const indicator = serverInfo.type === 'local' ? '🟢' : (serverInfo.type === 'vpn' ? '🟣' : '🔵');
      document.title = `${indicator} ${original}`;

      // Iniciar monitoramento de failover (teste a cada 30 segundos)
      const stopMonitoring = window.ServerDetector.startMonitoring(30000);
      window.addEventListener('beforeunload', stopMonitoring);

      return serverInfo;
    } catch (e) {
      console.error('[AULA] Erro na detecção de servidor:', e);
      // Continuar mesmo com erro (user pode estar offline)
      this.initialized = true;
      return { type: 'unknown', url: window.location.origin };
    }
  },

  /**
   * Obtém URL base da API (considerando o servidor detectado)
   */
  getApiBaseUrl() {
    if (!this.initialized) {
      console.warn('[AULA] Detector não inicializado, usando origem atual');
      return `${window.location.origin}/api`;
    }
    return `${this.url}/api`;
  },

  /**
   * Obtém informações sobre a conexão atual
   */
  getConnectionInfo() {
    return {
      serverType: this.type,
      serverUrl: this.url,
      endpoints: window.ServerDetector.getAllEndpoints(),
      initialized: this.initialized
    };
  }
};

// ─── Mapa de módulos disponíveis ─────────────────────────────────────────────
const MODULES = {
  cronograma: window.ModuleCronograma,
  aula:       window.ModuleAula,
  dados:      { mount(c) { window.ModuleCronograma.openDataManagement(c, window.__dmInitialTab || null); window.__dmInitialTab = null; } },
  usuarios: {
    mount(container) {
      window.UserManagementModule.init(container, window.AppContext?.schoolId);
    }
  },
  licencas:   { mount(c) { window.LicenseManager.renderManagementScreen(c); } },
};

let currentTab = 'cronograma';
window.__authManager = null;

/**
 * Função para registrar módulos dinâmicos
 */
window.registerModule = function(module) {
  MODULES[module.name] = {
    initialize: module.initialize,
    render: module.render,
    afterRender: module.afterRender,
    beforeDestroy: module.beforeDestroy,
    mount(container) {
      container.innerHTML = this.render();
      if (this.afterRender) this.afterRender();
    }
  };
};

// ─── Navegação de abas ────────────────────────────────────────────────────────
window._activateTab = async function activateTab(name) {
  // Módulos travados redirecionam para ativação
  if (name !== 'licencas' && !window.LicenseManager.isLicensed(name)) {
    window.LicenseManager.openActivationScreen(name);
    return;
  }

  const mod = MODULES[name];
  if (!mod) return;

  currentTab = name;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.module === name);
  });

  const content = document.getElementById('app-content');
  content.innerHTML = '<div class="loading"><span class="loading-dots">Carregando</span></div>';

  try {
    // Inicializa o módulo se tiver um método initialize
    if (mod.initialize) {
      await mod.initialize(window.AppContext.schoolId);
    }
    mod.mount(content);
  } catch (e) {
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;color:var(--color-text-muted)">
        <span style="font-size:40px">⚠️</span>
        <p style="font-weight:600;color:var(--color-text)">Erro ao carregar módulo</p>
        <p style="font-size:13px">${e.message}</p>
        <button class="btn btn-ghost btn-sm" onclick="window._activateTab('${name}')">Tentar novamente</button>
      </div>`;
  }
};

// ─── Toast de notificações ────────────────────────────────────────────────────
window.showToast = function(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Anima entrada
  toast.style.animation = 'slideInUp 0.3s ease-out';

  // Remove após duração
  setTimeout(() => {
    toast.style.animation = 'slideOutDown 0.3s ease-out';
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
};

// ─── Modal utilitário ─────────────────────────────────────────────────────────
window.openModal = function({ title, bodyHtml, onConfirm, confirmLabel = 'Salvar', confirmClass = 'btn-primary', size = 'normal' }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${size === 'large' ? 'large' : ''}" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" aria-label="Fechar">✕</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="modal-cancel">Cancelar</button>
        <button class="btn ${confirmClass}" id="modal-confirm">${confirmLabel}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('#modal-cancel').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  overlay.querySelector('#modal-confirm').addEventListener('click', () => {
    onConfirm(overlay, close);
  });

  // Foco no primeiro input
  setTimeout(() => {
    const first = overlay.querySelector('input, select, textarea');
    if (first) first.focus();
  }, 50);

  return overlay;
};

window.confirmDialog = function(message, { confirmLabel = 'Excluir', confirmClass = 'btn-danger', title = 'Confirmar' } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" style="max-width:360px">
        <div class="modal-header"><h3>${title}</h3></div>
        <div class="modal-body"><p>${message}</p></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="cd-cancel">Cancelar</button>
          <button class="btn ${confirmClass}" id="cd-confirm">${confirmLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#cd-cancel').addEventListener('click',  () => { overlay.remove(); resolve(false); });
    overlay.querySelector('#cd-confirm').addEventListener('click', () => { overlay.remove(); resolve(true);  });
  });
};

// ─── AppContext — escola única ───────────────────────────────────────────────
/**
 * Na versão desktop, o app opera com UMA única escola.
 * AppContext carrega essa escola no boot e a disponibiliza globalmente.
 * Todos os módulos usam window.AppContext.schoolId — sem seletor.
 */
window.AppContext = {
  school: null,
  get schoolId() { return this.school?.id ?? null; },
  get schoolName() { return this.school?.name ?? ''; },

  async load() {
    const schools = await window.DB.getSchools().catch(() => []);
    if (schools.length > 0) {
      this.school = schools[0];
      this._updateHeader();
      return true;
    }
    return false; // primeira execução
  },

  /** Atualiza o nome da escola no cabeçalho do app. */
  _updateHeader() {
    const el = document.querySelector('.app-school-name');
    if (el) el.textContent = this.school?.name ?? '';
  },

  /** Abre o formulário de edição dos dados da escola. */
  openEditor(onSaved) {
    const s = this.school;
    window.openModal({
      title: s ? '⚙️ Dados da Escola' : '🏫 Configurar Escola',
      bodyHtml: `
        <div class="form-group">
          <label>Nome *</label>
          <input type="text" id="f-sname" value="${_esc(s?.name ?? '')}" placeholder="Nome completo da escola">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Sigla</label>
            <input type="text" id="f-acronym" value="${_esc(s?.acronym ?? '')}" placeholder="Ex: EEA">
          </div>
          <div class="form-group">
            <label>INEP</label>
            <input type="text" id="f-inep" value="${_esc(s?.inep_code ?? '')}" placeholder="Código INEP">
          </div>
        </div>
        <div class="form-group">
          <label>Endereço</label>
          <input type="text" id="f-address" value="${_esc(s?.address ?? '')}" placeholder="Rua, número, bairro">
        </div>
        <div class="form-group">
          <label>CNPJ</label>
          <input type="text" id="f-cnpj" value="${_esc(s?.cnpj ?? '')}" placeholder="00.000.000/0000-00">
        </div>
      `,
      confirmLabel: s ? 'Salvar' : 'Criar Escola',
      onConfirm: async (overlay, close) => {
        const name = overlay.querySelector('#f-sname').value.trim();
        if (!name) { window.showToast('Informe o nome da escola.', 'warning'); return; }
        const data = {
          name,
          acronym:   overlay.querySelector('#f-acronym').value.trim(),
          address:   overlay.querySelector('#f-address').value.trim(),
          cnpj:      overlay.querySelector('#f-cnpj').value.trim(),
          inep_code: overlay.querySelector('#f-inep').value.trim(),
        };
        try {
          if (s) {
            await window.DB.updateSchool(s.id, data);
          } else {
            const res = await window.DB.createSchool(data);
            data.id = res.id;
          }
          this.school = { ...this.school, ...data };
          this._updateHeader();
          close();
          window.showToast('Dados da escola salvos.', 'success');
          if (onSaved) onSaved();
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  },
};

/** Escapa HTML — disponível globalmente para os módulos. */
window._esc = function(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Banner de consentimento de cookies (LGPD)
  if (!localStorage.getItem('aula_cookies')) {
    const banner = document.getElementById('cookie-banner');
    if (banner) {
      banner.style.display = 'flex';
      banner.querySelector('#cookie-accept').addEventListener('click', () => {
        localStorage.setItem('aula_cookies', 'accepted');
        banner.style.display = 'none';
      });
      const policyLink = banner.querySelector('#cookie-policy-link');
      if (policyLink) policyLink.addEventListener('click', e => e.preventDefault());
    }
  }

  // Inicializa a detecção automática de servidor (local, VPN ou cloud)
  await window.AppServerDetection.initialize();

  // Inicializa o data provider
  window.DB.init();

  // Carrega licenças e aplica cadeados nas abas
  await window.LicenseManager.load();

  // Registra cliques nas abas
  document.querySelectorAll('.tab-btn[data-module]').forEach(btn => {
    btn.addEventListener('click', () => window._activateTab(btn.dataset.module));
  });

  // Tenta carregar escola existente; independente do resultado, vai para a autenticação.
  // O editor de escola só abre quando o usuário clica em "Cadastrar minha escola" na tela de login.
  await window.AppContext.load();
  await initializeAuth();
});

/**
 * Inicializa o sistema de autenticação
 */
async function initializeAuth() {
  const schoolId = window.AppContext.schoolId;

  // Se não há escola configurada ainda, mostra a tela de login com a opção de cadastrar.
  if (!schoolId) {
    window.__authManager = new window.AuthManager();
    window.showAuthScreen(true, {
      onSuccess: () => {
        document.getElementById('auth-screen').classList.add('hidden');
        setupMainApp();
      },
      onSetupSchool: () => {
        document.getElementById('auth-screen').classList.add('hidden');
        window.AppContext.openEditor(async () => {
          await window.AppContext.load();
          await initializeAuth();
        });
      },
    });
    return;
  }

  try {
    // 1. Verificar sessão via cookie httpOnly (sobrevive ao recarregar a página)
    const meResult = await window.aula.auth.me().catch(() => null);
    if (meResult?.success && meResult?.authenticated) {
      window.__authManager = new window.AuthManager();
      window.__authManager.currentSchool  = schoolId;
      window.__authManager.token          = meResult.token;
      window.__authManager.currentAdmin   = meResult.admin;
      localStorage.setItem(`school_${schoolId}_token`, meResult.token);
      document.getElementById('auth-screen').classList.add('hidden');
      setupMainApp();
      return;
    }

    // 2. Fallback: verificar token no localStorage
    window.__authManager = new window.AuthManager();
    await window.__authManager.initialize(schoolId);

    const hasAdmin = await window.__authManager.checkFirstAdmin();

    if (!window.__authManager.isAuthenticated()) {
      window.showAuthScreen(hasAdmin, {
        onSuccess: () => {
          document.getElementById('auth-screen').classList.add('hidden');
          setupMainApp();
        },
        onSetupSchool: () => {
          document.getElementById('auth-screen').classList.add('hidden');
          window.AppContext.openEditor(async () => {
            await window.AppContext.load();
            await initializeAuth();
          });
        },
      });
    } else {
      document.getElementById('auth-screen').classList.add('hidden');
      setupMainApp();
    }
  } catch (e) {
    document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:20px;background:var(--color-bg);color:var(--color-text)">
        <span style="font-size:56px">💥</span>
        <h2 style="margin:0">Falha ao iniciar o aplicativo</h2>
        <p style="color:var(--color-text-muted);max-width:400px;text-align:center">${e.message}</p>
        <button class="btn btn-primary" onclick="location.reload()">Reiniciar</button>
      </div>`;
  }
}

/**
 * Configura o app principal (módulos disponíveis)
 */
function setupMainApp() {
  // Mostra o header com abas
  document.querySelector('.tab-bar').style.display = 'flex';
  document.getElementById('app-content').style.display = 'block';

  // Controla visibilidade de abas por papel
  const isAdmin = window.__authManager?.isAdmin() ?? false;
  const usuariosTab = document.querySelector('.tab-btn[data-module="usuarios"]');
  if (usuariosTab) usuariosTab.style.display = isAdmin ? '' : 'none';

  // Expõe o papel globalmente para os módulos
  window.AppContext.currentUserRole = isAdmin ? 'admin' : 'viewer';

  // Inicia verificação periódica de sessão
  if (window.__authManager) {
    window.__authManager.startSessionWatcher();
  }

  // Adiciona botão de logout se ainda não existir
  setupLogoutButton();

  // Carrega primeiro módulo
  window._activateTab('cronograma');
}

/**
 * Adiciona o botão de logout ao header
 */
function setupLogoutButton() {
  const nav = document.querySelector('nav.tabs');
  if (nav && !nav.querySelector('#btn-logout')) {
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'btn-logout';
    logoutBtn.className = 'tab-btn tab-btn-icon';
    logoutBtn.title = 'Sair';
    logoutBtn.innerHTML = '🚪';
    logoutBtn.addEventListener('click', async () => {
      if (confirm('Tem certeza que deseja sair?')) {
        await window.__authManager.logout();
        location.reload();
      }
    });
    nav.appendChild(logoutBtn);
  }
}
