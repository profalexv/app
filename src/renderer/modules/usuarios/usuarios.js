/**
 * Módulo de Colaboradores — Pessoas e suas funções
 *
 * Aba "Funções": gerencia os tipos de função (staff_functions) — editáveis.
 * Aba "Pessoas": cadastro de pessoas independente de função; gerencia papéis por pessoa.
 */

window.UserManagementModule = (() => {
  let _schoolId  = null;
  let _editPersonId   = null;
  let _editFuncId     = null;
  let _rolesPersonId  = null;
  let _cachedFunctions = []; // cache das staff_functions para o modal de papéis
  const E = s => window._esc(s); // Helper para escapar HTML, usando a função global

  function setError(formId, msg) {
    const el = document.querySelector(`#${formId} .form-error`);
    if (el) el.textContent = msg || '';
  }

  const CAT_LABELS = {
    pedagogico:    { label: 'Pedagógico',    color: '#bfdbfe' },
    administrativo:{ label: 'Administrativo',color: '#d1fae5' },
    operacional:   { label: 'Operacional',   color: '#fef3c7' },
    outro:         { label: 'Outro',         color: '#e5e7eb' },
  };

  function catBadge(cat) {
    const c = CAT_LABELS[cat] || CAT_LABELS.outro;
    return `<span class="badge" style="background:${c.color}">${c.label}</span>`;
  }

  function roleBadges(person) {
    const parts = [];
    if (person.is_teacher) parts.push('<span class="badge badge-teacher">Professor</span>');
    if (person.is_admin)   parts.push('<span class="badge badge-admin">Admin</span>');
    if (person.staff_functions) {
      person.staff_functions.split(', ').forEach(fnName =>
        parts.push(`<span class="badge badge-staff">${E(fnName)}</span>`)
      );
    }
    if (parts.length === 0) parts.push('<span class="badge badge-inactive">Sem papel ativo</span>');
    return parts.join(' ');
  }

  // ── HTML principal ──────────────────────────────────────────────────────────

  function render() {
    return `
      <div class="gestao-usuarios">
        <div class="page-header">
          <h1>Colaboradores</h1>
          <p class="subtitle">Gerencie funções, pessoas e seus papéis na escola</p>
        </div>

        <div class="tabs-section">
          <button class="tab-btn active" data-tab="functions">🏷️ Funções</button>
          <button class="tab-btn" data-tab="people">👤 Pessoas</button>
        </div>

        <!-- ── Aba: Funções ── -->
        <div id="tab-functions" class="tab-content active">
          <div class="section-header">
            <h2>Funções de Colaborador</h2>
            <button class="btn btn-primary" id="btn-new-func">+ Nova Função</button>
          </div>
          <div id="functions-list" class="users-list loading">
            <div class="loading-spinner">Carregando...</div>
          </div>
        </div>

        <!-- ── Aba: Pessoas ── -->
        <div id="tab-people" class="tab-content">
          <div class="section-header">
            <h2>Pessoas</h2>
            <button class="btn btn-primary" id="btn-new-person">+ Nova Pessoa</button>
          </div>
          <div id="people-list" class="users-list loading">
            <div class="loading-spinner">Carregando...</div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Aba Funções ─────────────────────────────────────────────────────────────

  async function loadFunctions() {
    const list = document.getElementById('functions-list');
    try {
      const data = await window.aula.getStaffFunctions(_schoolId);
      if (!data.success) throw new Error(data.error);
      list.classList.remove('loading');
      if (!data.data.length) {
        list.innerHTML = `<p class="empty-state">Nenhuma função cadastrada.<br>
          Clique em "+ Nova Função" para começar.<br>
          <small>Exemplos: Segurança, Portaria, Limpeza, Cozinha, Manutenção, Jardinagem...</small></p>`;
        return;
      }
      // Agrupa por categoria
      const byCategory = {};
      for (const fn of data.data) {
        if (!byCategory[fn.category]) byCategory[fn.category] = [];
        byCategory[fn.category].push(fn);
      }
      const catOrder = ['pedagogico','administrativo','operacional','outro'];
      let html = '';
      for (const cat of catOrder) {
        const items = byCategory[cat];
        if (!items) continue;
        const c = CAT_LABELS[cat];
        html += `<div class="func-category-group">
          <h3 class="func-category-title">${c.label}</h3>
          ${items.map(fn => `
            <div class="user-card ${fn.active ? '' : 'inactive'}">
              <div class="user-info">
                <h3>${fn.name}</h3>
                ${catBadge(fn.category)}
                ${!fn.active ? '<span class="badge badge-inactive">Inativa</span>' : ''}
              </div>
              <div class="user-actions">
                <button class="btn btn-small btn-info" data-action="edit-func"
                  data-id="${fn.id}" data-name="${fn.name}" data-category="${fn.category}">
                  ✏️ Editar
                </button>
                <button class="btn btn-small ${fn.active ? 'btn-warning' : 'btn-success'}"
                  data-action="toggle-func" data-id="${fn.id}" data-active="${fn.active ? 0 : 1}">
                  ${fn.active ? 'Desativar' : 'Reativar'}
                </button>
                <button class="btn btn-small btn-danger" data-action="delete-func" data-id="${fn.id}">
                  🗑️
                </button>
              </div>
            </div>
          `).join('')}
        </div>`;
      }
      list.innerHTML = html;
    } catch (e) {
      list.innerHTML = `<p class="error">Erro: ${e.message}</p>`;
    }
  }

  function openFuncModal(func = null) {
    const isEditing = func != null;
    const title = isEditing ? 'Editar Função' : 'Nova Função';

    const bodyHtml = `
      <form id="form-func-dynamic" class="form">
        <div class="form-group">
          <label>Nome da função *</label>
          <input type="text" name="name" required placeholder="Ex: Segurança, Cozinheiro(a)..." value="${isEditing ? E(func.name) : ''}">
        </div>
        <div class="form-group">
          <label>Categoria *</label>
          <select name="category" required>
            <option value="pedagogico" ${isEditing && func.category === 'pedagogico' ? 'selected' : ''}>Pedagógico</option>
            <option value="administrativo" ${!isEditing || func.category === 'administrativo' ? 'selected' : ''}>Administrativo</option>
            <option value="operacional" ${isEditing && func.category === 'operacional' ? 'selected' : ''}>Operacional</option>
            <option value="outro" ${isEditing && func.category === 'outro' ? 'selected' : ''}>Outro</option>
          </select>
        </div>
        <div class="form-error"></div>
      </form>
    `;

    window.openModal({
      title: title,
      bodyHtml: bodyHtml,
      confirmLabel: 'Salvar',
      onConfirm: async (overlay, close) => {
        const form = overlay.querySelector('#form-func-dynamic');
        const errorEl = form.querySelector('.form-error');
        errorEl.textContent = '';

        const data = {
          school_id: _schoolId,
          name: form.name.value.trim(),
          category: form.category.value,
        };

        if (!data.name) {
          errorEl.textContent = 'O nome da função é obrigatório.';
          return; // Não fecha o modal
        }

        try {
          const res = isEditing
            ? await window.aula.updateStaffFunction(func.id, data)
            : await window.aula.createStaffFunction(data);
          if (!res.success) throw new Error(res.error);
          close();
          loadFunctions();
        } catch (e) {
          errorEl.textContent = e.message;
        }
      }
    });
  }

  function handleFunctionListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, name, category, active } = btn.dataset;
    const numId = parseInt(id);
    if (action === 'edit-func') {
      openFuncModal({ id: numId, name, category });
    } else if (action === 'toggle-func') {
      window.aula.toggleStaffFunction(numId, parseInt(active) === 1)
        .then(r => { if (r.success) loadFunctions(); });
    } else if (action === 'delete-func') {
      if (!confirm('Excluir esta função? Só é possível se nenhuma pessoa a utilizar.')) return;
      window.aula.deleteStaffFunction(numId).then(r => {
        if (r.success) loadFunctions();
        else alert(r.error);
      });
    }
  }

  // ── Aba Pessoas ─────────────────────────────────────────────────────────────

  async function loadPeople() {
    const list = document.getElementById('people-list');
    try {
      const data = await window.aula.getPeople(_schoolId);
      if (!data.success) throw new Error(data.error);
      list.classList.remove('loading');
      if (!data.data.length) {
        list.innerHTML = '<p class="empty-state">Nenhuma pessoa cadastrada</p>';
        return;
      }
      list.innerHTML = data.data.map(p => `
        <div class="user-card">
          <div class="user-info">
            <h3>${E(p.name)}</h3>
            <div class="role-badges">${roleBadges(p)}</div>
            ${p.registration ? `<p class="meta">Matrícula: ${E(p.registration)}</p>` : ''}
            ${p.email ? `<p class="meta">📧 ${E(p.email)}</p>` : ''}
            ${p.phone ? `<p class="meta">📞 ${E(p.phone)}</p>` : ''}
          </div>
          <div class="user-actions">
            <button class="btn btn-small btn-info" data-action="edit-person"
              data-id="${p.id}" data-name="${p.name}"
              data-registration="${p.registration || ''}" data-email="${p.email || ''}" data-phone="${p.phone || ''}">
              ✏️ Editar
            </button>
            <button class="btn btn-small btn-secondary" data-action="manage-roles"
              data-id="${p.id}" data-name="${p.name}">
              🔑 Papéis
            </button>
          </div>
        </div>
      `).join('');
    } catch (e) {
      list.innerHTML = `<p class="error">Erro: ${e.message}</p>`;
    }
  }

  function openPersonModal(person = null) {
    const isEditing = person != null;
    const title = isEditing ? 'Editar Pessoa' : 'Nova Pessoa';

    const bodyHtml = `
      <form id="form-person-dynamic" class="form">
        <div class="form-group">
          <label>Nome Completo *</label>
          <input type="text" name="name" required placeholder="Nome completo" value="${isEditing ? E(person.name) : ''}">
        </div>
        <div class="form-group">
          <label>Matrícula (opcional)</label>
          <input type="text" name="registration" placeholder="Número de matrícula" value="${isEditing && person.registration ? E(person.registration) : ''}">
        </div>
        <div class="form-group">
          <label>E-mail (opcional)</label>
          <input type="email" name="email" placeholder="email@escola.edu" value="${isEditing && person.email ? E(person.email) : ''}">
        </div>
        <div class="form-group">
          <label>Telefone (opcional)</label>
          <input type="tel" name="phone" placeholder="(xx) 9xxxx-xxxx" value="${isEditing && person.phone ? E(person.phone) : ''}">
        </div>
        <div class="form-error"></div>
      </form>
    `;

    window.openModal({
      title: title,
      bodyHtml: bodyHtml,
      confirmLabel: 'Salvar',
      onConfirm: async (overlay, close) => {
        const form = overlay.querySelector('#form-person-dynamic');
        const errorEl = form.querySelector('.form-error');
        errorEl.textContent = '';

        const data = {
          school_id: _schoolId,
          name: form.name.value.trim(),
          registration: form.registration.value.trim() || null,
          email: form.email.value.trim() || null,
          phone: form.phone.value.trim() || null,
        };

        if (!data.name) {
          errorEl.textContent = 'O nome é obrigatório.';
          return;
        }

        try {
          const res = isEditing
            ? await window.aula.updatePerson(person.id, data)
            : await window.aula.createPerson(data);
          if (!res.success) throw new Error(res.error);
          close();
          loadPeople();
        } catch (e) {
          errorEl.textContent = e.message;
        }
      }
    });
  }

  function handlePeopleListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, name, registration, email, phone } = btn.dataset;
    if (action === 'edit-person') {
      openPersonModal({ id: parseInt(id), name, registration, email, phone });
    } else if (action === 'manage-roles') {
      openRolesModal(parseInt(id), name);
    }
  }

  // ── Modal de Papéis ─────────────────────────────────────────────────────────

  async function handleRoleAction({ action, active, roleId, workMode }, closeCurrentModal) {
    try {
      if (action === 'enable-teacher') {
        window.openModal({
          title: '👨‍🏫 Atribuir papel de professor',
          bodyHtml: `
            <div class="form-group">
              <label>Modalidade de atuação</label>
              <select id="f-wm-enable">
                <option value="presencial">🏢 Presencial</option>
                <option value="remoto">🌐 Remoto (EAD)</option>
                <option value="hibrido">🔄 Híbrido</option>
              </select>
            </div>`,
          confirmLabel: 'Atribuir',
          onConfirm: async (overlay, close) => {
            const wm = overlay.querySelector('#f-wm-enable').value;
            const r = await window.aula.setTeacherRole(_rolesPersonId, true, wm);
            if (!r.success) throw new Error(r.error);
            close();
            closeCurrentModal();
            const person = await window.aula.getPerson(_rolesPersonId);
            if (person.success) openRolesModal(person.data.id, person.data.name);
            loadPeople();
          },
        });
        return;
      } else if (action === 'edit-workmode') {
        window.openModal({
          title: '🔄 Modalidade do professor',
          bodyHtml: `
            <div class="form-group">
              <label>Modalidade de atuação</label>
              <select id="f-wm-edit">
                <option value="presencial" ${workMode==='presencial'?'selected':''}>🏢 Presencial</option>
                <option value="remoto" ${workMode==='remoto'?'selected':''}>🌐 Remoto (EAD)</option>
                <option value="hibrido" ${workMode==='hibrido'?'selected':''}>🔄 Híbrido</option>
              </select>
            </div>`,
          confirmLabel: 'Salvar',
          onConfirm: async (overlay, close) => {
            const wm = overlay.querySelector('#f-wm-edit').value;
            const r = await window.aula.setTeacherRole(_rolesPersonId, true, wm);
            if (!r.success) throw new Error(r.error);
            close();
            closeCurrentModal();
            const person = await window.aula.getPerson(_rolesPersonId);
            if (person.success) openRolesModal(person.data.id, person.data.name);
            loadPeople();
          },
        });
        return;
      } else if (action === 'toggle-teacher') {
        const r = await window.aula.setTeacherRole(_rolesPersonId, parseInt(active) === 1, workMode || 'presencial');
        if (!r.success) throw new Error(r.error);
      } else if (action === 'toggle-staff') {
        const r = await window.aula.toggleStaffRole(parseInt(roleId), parseInt(active) === 1);
        if (!r.success) throw new Error(r.error);
      } else if (action === 'remove-staff') {
        if (!confirm('Remover esta função da pessoa?')) return;
        const r = await window.aula.removeStaffRole(parseInt(roleId));
        if (!r.success) throw new Error(r.error);
      }
      // Recarrega o modal de papéis para refletir a mudança
      closeCurrentModal();
      const person = await window.aula.getPerson(_rolesPersonId);
      if (person.success) openRolesModal(person.data.id, person.data.name);
      loadPeople();
    } catch (e) {
      alert('Erro: ' + e.message);
    }
  }

  async function handleAddStaffRole() {
    const sel = document.querySelector('.roles-modal-container #new-staff-func-select');
    const sfId = parseInt(sel.value);
    if (!sfId) { alert('Selecione uma função.'); return; }
    try {
      const r = await window.aula.addStaffRole(_rolesPersonId, sfId);
      if (!r.success) throw new Error(r.error);
      sel.value = '';
      // Recarrega o modal
      document.querySelector('.modal-overlay.active .modal-close-btn')?.click();
      const person = await window.aula.getPerson(_rolesPersonId);
      if (person.success) openRolesModal(person.data.id, person.data.name);
      loadPeople();
    } catch (e) {
      alert('Erro: ' + e.message);
    }
  }

  async function handleAddAdminRole(e) {
    e.preventDefault();
    const form = e.target;
    const username = form.querySelector('#admin-username').value.trim();
    const password = form.querySelector('#admin-password').value;
    const errorEl = form.querySelector('.form-error');
    if (!username || !password) {
      setError('form-add-admin', 'Preencha usuário e senha.');
      return;
    }
    try {
      const r = await window.aula.auth.promoteToAdmin({
        personId: _rolesPersonId, username, password
      });
      if (!r.success) throw new Error(r.error);
      form.querySelector('#admin-username').value = '';
      form.querySelector('#admin-password').value = '';
      document.querySelector('.modal-overlay.active .modal-close-btn')?.click();
      const person = await window.aula.getPerson(_rolesPersonId);
      if (person.success) openRolesModal(person.data.id, person.data.name);
      loadPeople();
    } catch (e) {
      if (errorEl) errorEl.textContent = e.message;
      else alert(e.message);
    }
  }

  async function handleSetPortalPassword(e) {
    e.preventDefault();
    const password = e.target.querySelector('#portal-password').value;
    const errorEl = document.getElementById('portal-form-error');
    errorEl.textContent = '';
    if (!password || password.length < 6) {
      errorEl.textContent = 'A senha deve ter pelo menos 6 caracteres.';
      return;
    }
    try {
      const r = await window.aula.setTeacherPortalPassword({ personId: _rolesPersonId, password });
      if (!r.success) throw new Error(r.error);
      e.target.querySelector('#portal-password').value = '';
      window.showToast?.('Senha do portal definida com sucesso!', 'success') || alert('Senha definida!');
    } catch (e) {
      errorEl.textContent = 'Erro: ' + e.message;
    }
  }

  // ── Setup de eventos ─────────────────────────────────────────────────────────

  function setupEventListeners() {
    const container = document.querySelector('.gestao-usuarios');
    if (!container) return;

    // Abas internas
    const tabsSection = container.querySelector('.tabs-section');
    if (tabsSection) {
      tabsSection.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn[data-tab]');
        if (!btn) return;

        const tab = btn.dataset.tab;
        container.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
        container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        container.querySelector(`#tab-${tab}`)?.classList.add('active');
      });
    }

    // Funções
    container.querySelector('#btn-new-func')?.addEventListener('click', () => openFuncModal(null));
    container.querySelector('#functions-list')?.addEventListener('click', handleFunctionListClick);

    // Pessoas
    container.querySelector('#btn-new-person')?.addEventListener('click', () => openPersonModal(null));
    container.querySelector('#people-list')?.addEventListener('click', handlePeopleListClick);

    // Delegação de eventos para o modal de papéis (que é totalmente dinâmico)
    document.body.addEventListener('click', e => {
      const rolesContainer = e.target.closest('.roles-modal-container');
      if (!rolesContainer) return;

      const actionBtn = e.target.closest('button[data-action], a[data-action]');
      if (actionBtn) {
        const closeCurrentModal = () => e.target.closest('.modal-overlay')?.querySelector('.modal-close-btn')?.click();
        if (actionBtn.dataset.action === 'add-staff-role') {
          handleAddStaffRole();
        } else if (actionBtn.dataset.action === 'go-functions') {
          e.preventDefault();
          closeCurrentModal();
          container.querySelector('.tab-btn[data-tab="functions"]')?.click();
        } else {
          handleRoleAction(actionBtn.dataset, closeCurrentModal);
        }
      }
    });

    document.body.addEventListener('submit', e => {
      const rolesContainer = e.target.closest('.roles-modal-container');
      if (!rolesContainer) return;

      const form = e.target.closest('form[data-action]');
      if (form) {
        e.preventDefault();
        if (form.dataset.action === 'add-admin-role') handleAddAdminRole(e);
        if (form.dataset.action === 'set-portal-password') handleSetPortalPassword(e);
      }
    });

    document.body.addEventListener('change', async e => {
      const rolesContainer = e.target.closest('.roles-modal-container');
      if (!rolesContainer || e.target.dataset.action !== 'change-admin-role') return;

      const sel = e.target;
      const adminId = parseInt(sel.dataset.adminId);
      const role = sel.value;
      try {
        const r = await window.aula.updateAdminRole(adminId, role);
        if (!r.success) throw new Error(r.error);
        window.showToast?.('Papel atualizado!', 'success') || alert('Papel atualizado!');
      } catch (err) {
        alert('Erro: ' + err.message);
        // Recarrega o modal
        sel.closest('.modal-overlay')?.querySelector('.modal-close-btn')?.click();
        const person = await window.aula.getPerson(_rolesPersonId);
        if (person.success) openRolesModal(person.data.id, person.data.name);
      }
    });
  }

  // ── init ─────────────────────────────────────────────────────────────────────

  function init(container, school) {
    _schoolId = (school && typeof school === 'object') ? school.id : school;
    container.innerHTML = render();
    setupEventListeners();
    loadFunctions();
    loadPeople();
  }

  return { init };

})();
