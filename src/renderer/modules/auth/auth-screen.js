/**
 * auth-screen.js
 *
 * Tela de autenticação: login (e-mail/usuário, Google, Microsoft),
 * cadastro com verificação de e-mail e primeiro acesso.
 *
 * Expõe: window.showAuthScreen(hasAdmin, { onSuccess, onSetupSchool })
 */

// ── Injeta HTML da tela ────────────────────────────────────────────────────────
document.getElementById('auth-screen').innerHTML = `
  <div class="auth-overlay"></div>
  <div class="auth-container">

    <!-- Marca -->
    <div class="auth-brand">
      <div class="auth-brand-icon">🎓</div>
      <h1 class="auth-brand-name">Aula</h1>
      <p class="auth-brand-sub">Sistema de Gestão Escolar</p>
    </div>

    <!-- Card principal -->
    <div class="auth-card">

      <!-- Abas -->
      <div class="auth-tabs" id="auth-tabs">
        <button class="auth-tab active" data-tab="login"    type="button">Entrar</button>
        <button class="auth-tab"        data-tab="register" type="button">Cadastrar-se</button>
      </div>

      <!-- Painel: Login -->
      <div class="auth-panel" id="auth-panel-login">
        <form id="auth-login-form" class="auth-form" autocomplete="on" novalidate>
          <div class="form-group">
            <label for="auth-login-username">E-mail ou usuário</label>
            <input type="text" id="auth-login-username" name="username"
              required autocomplete="username" placeholder="seu@email.com ou nome_usuario">
          </div>
          <div class="form-group">
            <label for="auth-login-password">Senha</label>
            <div class="input-password-wrap">
              <input type="password" id="auth-login-password" name="password"
                required autocomplete="current-password" placeholder="Sua senha">
              <button type="button" class="btn-eye" aria-label="Mostrar senha" tabindex="-1">👁</button>
            </div>
          </div>
          <div class="auth-error" id="auth-login-error"></div>
          <button type="submit" class="btn btn-primary" id="auth-login-btn">Entrar</button>
        </form>

        <!-- Divisor OAuth (oculto até carregar provedores) -->
        <div class="auth-divider" id="auth-oauth-divider">
          <span>ou continue com</span>
        </div>

        <!-- Botões OAuth (ocultos até carregar provedores) -->
        <div class="auth-oauth-buttons" id="auth-oauth-buttons">
          <a href="/auth/google" class="btn-oauth btn-google" id="btn-google" aria-label="Entrar com Google">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
            </svg>
            Google
          </a>
          <a href="/auth/microsoft" class="btn-oauth btn-microsoft" id="btn-microsoft" aria-label="Entrar com Microsoft">
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true" focusable="false">
              <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
              <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
              <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            Microsoft
          </a>
        </div>
      </div><!-- #auth-panel-login -->

      <!-- Painel: Cadastrar-se (nova conta, escola existente) -->
      <div class="auth-panel" id="auth-panel-register" style="display:none">
        <form id="auth-register-form" class="auth-form" autocomplete="on" novalidate>
          <div class="form-group">
            <label for="auth-reg-name">Nome completo</label>
            <input type="text" id="auth-reg-name" name="name"
              required autocomplete="name" placeholder="Seu nome completo">
          </div>
          <div class="form-group">
            <label for="auth-reg-email">E-mail</label>
            <input type="email" id="auth-reg-email" name="email"
              required autocomplete="email" placeholder="seu@email.com">
          </div>
          <div class="form-group">
            <label for="auth-reg-pass">Senha</label>
            <div class="input-password-wrap">
              <input type="password" id="auth-reg-pass" name="password"
                required autocomplete="new-password" placeholder="Mínimo 6 caracteres">
              <button type="button" class="btn-eye" aria-label="Mostrar senha" tabindex="-1">👁</button>
            </div>
          </div>
          <div class="form-group">
            <label for="auth-reg-pass2">Confirmar senha</label>
            <div class="input-password-wrap">
              <input type="password" id="auth-reg-pass2" name="password2"
                required autocomplete="new-password" placeholder="Repita a senha">
              <button type="button" class="btn-eye" aria-label="Mostrar senha" tabindex="-1">👁</button>
            </div>
          </div>
          <div class="auth-error" id="auth-register-error"></div>
          <button type="submit" class="btn btn-primary" id="auth-register-btn">Criar conta</button>
        </form>
      </div><!-- #auth-panel-register -->

      <!-- Painel: Primeiro acesso (nenhum admin cadastrado) -->
      <div class="auth-panel" id="auth-panel-first" style="display:none">
        <p class="auth-panel-hint">
          Configure o primeiro administrador desta escola para começar.
        </p>
        <form id="auth-first-form" class="auth-form" autocomplete="on" novalidate>
          <div class="form-group">
            <label for="auth-first-name">Nome completo</label>
            <input type="text" id="auth-first-name" name="name"
              required autocomplete="name" placeholder="Seu nome completo">
          </div>
          <div class="form-group">
            <label for="auth-first-user">Usuário</label>
            <input type="text" id="auth-first-user" name="username"
              required autocomplete="username" placeholder="Nome de usuário (sem espaços)">
          </div>
          <div class="form-group">
            <label for="auth-first-pass">Senha</label>
            <div class="input-password-wrap">
              <input type="password" id="auth-first-pass" name="password"
                required autocomplete="new-password" placeholder="Mínimo 6 caracteres">
              <button type="button" class="btn-eye" aria-label="Mostrar senha" tabindex="-1">👁</button>
            </div>
          </div>
          <div class="form-group">
            <label for="auth-first-pass2">Confirmar senha</label>
            <div class="input-password-wrap">
              <input type="password" id="auth-first-pass2" name="password2"
                required autocomplete="new-password" placeholder="Repita a senha">
              <button type="button" class="btn-eye" aria-label="Mostrar senha" tabindex="-1">👁</button>
            </div>
          </div>
          <div class="auth-error" id="auth-first-error"></div>
          <button type="submit" class="btn btn-primary" id="auth-first-btn">Criar administrador</button>
        </form>
      </div><!-- #auth-panel-first -->

      <!-- Painel: Verificar e-mail -->
      <div class="auth-panel" id="auth-panel-verify" style="display:none">
        <div class="auth-verify-box">
          <div class="auth-verify-icon">📧</div>
          <h3>Verifique seu e-mail</h3>
          <p id="auth-verify-msg">Enviamos um link de confirmação. Clique no link para ativar sua conta.</p>
          <button class="btn btn-ghost" id="auth-back-login" type="button">← Voltar ao login</button>
        </div>
      </div>

      <!-- Loading -->
      <div class="auth-loading" id="auth-loading" style="display:none">
        <div class="spinner"></div>
        <p>Aguarde...</p>
      </div>

    </div><!-- .auth-card -->

    <!-- Rodapé: link para cadastrar escola -->
    <div class="auth-card-footer">
      <a href="#" id="auth-setup-school-link">🏫 Cadastrar minha escola</a>
    </div>

  </div><!-- .auth-container -->
`;

// ── Referências DOM ────────────────────────────────────────────────────────────
const _el = id => document.getElementById(id);

// ── Botões olhinho (toggle senha) ──────────────────────────────────────────────
document.getElementById('auth-screen').addEventListener('click', e => {
  const btn = e.target.closest('.btn-eye');
  if (!btn) return;
  const input = btn.closest('.input-password-wrap')?.querySelector('input');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  btn.classList.toggle('visible');
});

// ── Botões olhinho (toggle senha) ─────────────────────────────────────────────
document.querySelectorAll('.btn-eye').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = btn.previousElementSibling;
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.classList.toggle('visible');
  });
});

// ── Troca de abas ──────────────────────────────────────────────────────────────
_el('auth-tabs').addEventListener('click', e => {
  const btn = e.target.closest('.auth-tab[data-tab]');
  if (!btn) return;
  const tab = btn.dataset.tab;
  document.querySelectorAll('#auth-tabs .auth-tab').forEach(b =>
    b.classList.toggle('active', b === btn));
  _el('auth-panel-login').style.display    = tab === 'login'    ? 'block' : 'none';
  _el('auth-panel-register').style.display = tab === 'register' ? 'block' : 'none';
  _el('auth-panel-first').style.display    = 'none';
  _el('auth-panel-verify').style.display   = 'none';
  _el('auth-loading').style.display        = 'none';
  _clearError('auth-login-error');
  _clearError('auth-register-error');
});

// ── Carrega provedores OAuth ───────────────────────────────────────────────────
fetch('/api/auth/providers', { credentials: 'include' })
  .then(r => r.json())
  .then(({ data }) => {
    let any = false;
    if (data?.google)    { _el('btn-google').style.display    = 'inline-flex'; any = true; }
    if (data?.microsoft) { _el('btn-microsoft').style.display = 'inline-flex'; any = true; }
    if (any) {
      _el('auth-oauth-divider').style.display  = 'flex';
      _el('auth-oauth-buttons').style.display  = 'flex';
    }
  })
  .catch(() => { /* OAuth não disponível */ });

// ── Lê e limpa params de URL (retorno de OAuth / verificação de e-mail) ────────
(function _parseUrlParams() {
  const p = new URLSearchParams(window.location.search);
  window._authUrlState = {
    oauthOk:       p.get('auth') === 'ok',
    emailVerified: p.get('email_verified') === '1',
    authError:     p.get('auth_error') || null,
  };
  if (p.has('auth') || p.has('auth_error') || p.has('email_verified')) {
    window.history.replaceState({}, '', window.location.pathname);
  }
})();

// ── Helpers de UI ──────────────────────────────────────────────────────────────
function _showError(id, msg) {
  const el = _el(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}
function _clearError(id) {
  const el = _el(id);
  if (!el) return;
  el.textContent = '';
  el.classList.remove('show');
}
function _setLoading(show, formId) {
  _el('auth-loading').style.display = show ? 'block' : 'none';
  if (formId) _el(formId).style.display = show ? 'none' : 'block';
}

// ── Função principal exposta para app.js ──────────────────────────────────────
window.showAuthScreen = function showAuthScreen(hasAdmin, { onSuccess, onSetupSchool } = {}) {
  const screen = _el('auth-screen');
  screen.classList.remove('hidden');

  // Feedback de retorno de OAuth ou verificação de e-mail
  const up = window._authUrlState || {};
  if (up.emailVerified) {
    const hint = document.createElement('div');
    hint.className = 'auth-success-msg';
    hint.textContent = '✅ E-mail verificado con sucesso! Faça login abaixo.';
    const form = _el('auth-login-form');
    form.insertBefore(hint, form.firstChild);
  }
  if (up.authError === 'not_registered') {
    _showError('auth-login-error', 'Sua conta não está registrada. Peça ao administrador para cadastrá-lo.');
  } else if (up.authError === 'no_school') {
    _showError('auth-login-error', 'Nenhuma escola configurada. Configure a escola antes de usar login externo.');
  } else if (up.authError === 'inactive') {
    _showError('auth-login-error', 'Conta inativa. Contate o administrador.');
  } else if (up.authError) {
    _showError('auth-login-error', 'Falha na autenticação externa. Tente novamente.');
  }

  // Exibir painel correto
  if (!hasAdmin) {
    // Primeiro acesso: esconder abas e ir direto ao form inicial
    _el('auth-tabs').style.display         = 'none';
    _el('auth-panel-login').style.display    = 'none';
    _el('auth-panel-register').style.display = 'none';
    _el('auth-panel-first').style.display    = 'block';
  }

  // ── Cadastrar escola ────────────────────────────────────────────────────────
  _el('auth-setup-school-link').addEventListener('click', e => {
    e.preventDefault();
    screen.classList.add('hidden');
    if (onSetupSchool) onSetupSchool();
  });

  // ── Voltar ao login (da tela de verificação) ────────────────────────────────
  _el('auth-back-login').addEventListener('click', () => {
    _el('auth-panel-verify').style.display   = 'none';
    _el('auth-panel-login').style.display    = 'block';
    _el('auth-tabs').style.display           = 'flex';
    document.querySelectorAll('#auth-tabs .auth-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === 'login'));
  });

  // ── Form: Login ─────────────────────────────────────────────────────────────
  _el('auth-login-form').addEventListener('submit', async e => {
    e.preventDefault();
    _clearError('auth-login-error');
    const username = _el('auth-login-username').value.trim();
    const password = _el('auth-login-password').value;
    if (!username || !password) { _showError('auth-login-error', 'Preencha todos os campos.'); return; }

    _setLoading(true, 'auth-login-form');
    try {
      await window.__authManager.login(username, password);
      screen.classList.add('hidden');
      if (onSuccess) onSuccess();
    } catch (err) {
      _setLoading(false, 'auth-login-form');
      _showError('auth-login-error', err.message);
    }
  });

  // ── Form: Cadastrar-se ──────────────────────────────────────────────────────
  _el('auth-register-form').addEventListener('submit', async e => {
    e.preventDefault();
    _clearError('auth-register-error');
    const name  = _el('auth-reg-name').value.trim();
    const email = _el('auth-reg-email').value.trim();
    const pass  = _el('auth-reg-pass').value;
    const pass2 = _el('auth-reg-pass2').value;

    if (!name || !email || !pass) { _showError('auth-register-error', 'Preencha todos os campos.'); return; }
    if (pass !== pass2)           { _showError('auth-register-error', 'As senhas não conferem.'); return; }
    if (pass.length < 6)          { _showError('auth-register-error', 'Senha deve ter ao menos 6 caracteres.'); return; }

    _setLoading(true, 'auth-register-form');
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, password: pass }),
      }).then(res => res.json());

      if (!r.success) throw new Error(r.error || 'Erro ao criar conta.');

      // Mostrar painel de verificação de e-mail
      _setLoading(false);
      _el('auth-tabs').style.display           = 'none';
      _el('auth-panel-register').style.display = 'none';
      _el('auth-panel-verify').style.display   = 'block';
      _el('auth-verify-msg').textContent =
        `Enviamos um link de confirmação para ${email}. Clique no link para ativar sua conta.`;
    } catch (err) {
      _setLoading(false, 'auth-register-form');
      _showError('auth-register-error', err.message);
    }
  });

  // ── Form: Primeiro admin ────────────────────────────────────────────────────
  _el('auth-first-form').addEventListener('submit', async e => {
    e.preventDefault();
    _clearError('auth-first-error');
    const name     = _el('auth-first-name').value.trim();
    const username = _el('auth-first-user').value.trim();
    const pass     = _el('auth-first-pass').value;
    const pass2    = _el('auth-first-pass2').value;
    const schoolId = window.AppContext?.schoolId;

    if (!schoolId)          { _showError('auth-first-error', 'Escola não configurada.'); return; }
    if (!name || !username) { _showError('auth-first-error', 'Preencha todos os campos.'); return; }
    if (pass !== pass2)     { _showError('auth-first-error', 'As senhas não conferem.'); return; }
    if (pass.length < 6)    { _showError('auth-first-error', 'Senha deve ter ao menos 6 caracteres.'); return; }
    if (/\s/.test(username)){ _showError('auth-first-error', 'Usuário não pode ter espaços.'); return; }

    _setLoading(true, 'auth-first-form');
    try {
      await window.__authManager.registerFirstAdmin(name, username, pass);
      screen.classList.add('hidden');
      if (onSuccess) onSuccess();
    } catch (err) {
      _setLoading(false, 'auth-first-form');
      _showError('auth-first-error', err.message);
    }
  });
};

