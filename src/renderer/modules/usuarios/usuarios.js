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

  // ── Utilidades ──────────────────────────────────────────────────────────────

  function showModal(id)  { document.getElementById(id).classList.remove('hidden'); }
  function hideModal(id)  { document.getElementById(id).classList.add('hidden'); }

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
      person.staff_functions.split(', ').forEach(fn =>
        parts.push(`<span class="badge badge-staff">${fn}</span>`)
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

        <!-- ── Modal: Criar/Editar Função ── -->
        <div id="modal-func" class="u-modal hidden">
          <div class="u-modal-bg"></div>
          <div class="u-modal-content">
            <div class="u-modal-header">
              <h2 id="modal-func-title">Nova Função</h2>
              <button class="u-modal-close">&times;</button>
            </div>
            <form id="form-func" class="form">
              <div class="form-group">
                <label>Nome da função *</label>
                <input type="text" name="name" required placeholder="Ex: Segurança, Cozinheiro(a)...">
              </div>
              <div class="form-group">
                <label>Categoria *</label>
                <select name="category" required>
                  <option value="pedagogico">Pedagógico</option>
                  <option value="administrativo" selected>Administrativo</option>
                  <option value="operacional">Operacional</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
              <div class="u-modal-actions">
                <button type="button" class="btn btn-secondary" id="btn-cancel-func">Cancelar</button>
                <button type="submit" class="btn btn-primary">Salvar</button>
              </div>
              <div class="form-error"></div>
            </form>
          </div>
        </div>

        <!-- ── Modal: Criar/Editar Pessoa ── -->
        <div id="modal-person" class="u-modal hidden">
          <div class="u-modal-bg"></div>
          <div class="u-modal-content">
            <div class="u-modal-header">
              <h2 id="modal-person-title">Nova Pessoa</h2>
              <button class="u-modal-close">&times;</button>
            </div>
            <form id="form-person" class="form">
              <div class="form-group">
                <label>Nome Completo *</label>
                <input type="text" name="name" required placeholder="Nome completo">
              </div>
              <div class="form-group">
                <label>Matrícula (opcional)</label>
                <input type="text" name="registration" placeholder="Número de matrícula">
              </div>
              <div class="form-group">
                <label>E-mail (opcional)</label>
                <input type="email" name="email" placeholder="email@escola.edu">
              </div>
              <div class="form-group">
                <label>Telefone (opcional)</label>
                <input type="tel" name="phone" placeholder="(xx) 9xxxx-xxxx">
              </div>
              <div class="u-modal-actions">
                <button type="button" class="btn btn-secondary" id="btn-cancel-person">Cancelar</button>
                <button type="submit" class="btn btn-primary">Salvar</button>
              </div>
              <div class="form-error"></div>
            </form>
          </div>
        </div>

        <!-- ── Modal: Gerenciar Papéis ── -->
        <div id="modal-roles" class="u-modal hidden">
          <div class="u-modal-bg"></div>
          <div class="u-modal-content u-modal-wide">
            <div class="u-modal-header">
              <h2>Papéis de <span id="roles-person-name"></span></h2>
              <button class="u-modal-close">&times;</button>
            </div>

            <div id="roles-content" class="roles-content">
              <div class="loading-spinner">Carregando...</div>
            </div>

            <!-- Adicionar função de colaborador -->
            <hr class="roles-divider">
            <div class="form-group">
              <label class="roles-label">Adicionar função de colaborador</label>
              <div class="row-inline">
                <select id="new-staff-func-select">
                  <option value="">Selecione uma função...</option>
                </select>
                <button class="btn btn-primary btn-small" id="btn-add-staff-role">Adicionar</button>
              </div>
              <p class="hint" id="no-functions-hint" style="display:none">
                Nenhuma função cadastrada.
                <a href="#" id="link-go-functions">Cadastre funções primeiro.</a>
              </p>
            </div>

            <!-- Adicionar papel de admin (só aparece se não tiver) -->
            <div id="admin-role-section" style="display:none">
              <hr class="roles-divider">
              <p class="roles-label">Papel de Administrador do Sistema</p>
              <form id="form-add-admin" class="form">
                <div class="form-group">
                  <label>Nome de usuário</label>
                  <input type="text" id="admin-username" placeholder="username" autocomplete="new-password">
                </div>
                <div class="form-group">
                  <label>Senha</label>
                  <input type="password" id="admin-password" placeholder="Senha" autocomplete="new-password">
                </div>
                <button type="submit" class="btn btn-primary btn-small">Atribuir papel de Admin</button>
                <div class="form-error"></div>
              </form>
            </div>

            <div class="u-modal-actions">
              <button type="button" class="btn btn-secondary" id="btn-close-roles">Fechar</button>
            </div>
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

  async function handleFuncSubmit(e) {
    e.preventDefault();
    setError('form-func', '');
    const form = e.target;
    const data = {
      school_id: _schoolId,
      name: form.name.value.trim(),
      category: form.category.value,
    };
    try {
      let res;
      if (_editFuncId) {
        res = await window.aula.updateStaffFunction(_editFuncId, data);
      } else {
        res = await window.aula.createStaffFunction(data);
      }
      if (!res.success) throw new Error(res.error);
      hideModal('modal-func');
      form.reset();
      loadFunctions();
    } catch (e) {
      setError('form-func', e.message);
    }
  }

  function handleFunctionListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, name, category, active } = btn.dataset;
    const numId = parseInt(id);
    if (action === 'edit-func') {
      _editFuncId = numId;
      document.getElementById('modal-func-title').textContent = 'Editar Função';
      const form = document.getElementById('form-func');
      form.name.value = name;
      form.category.value = category;
      showModal('modal-func');
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
            <h3>${p.name}</h3>
            <div class="role-badges">${roleBadges(p)}</div>
            ${p.registration ? `<p class="meta">Matrícula: ${p.registration}</p>` : ''}
            ${p.email ? `<p class="meta">📧 ${p.email}</p>` : ''}
            ${p.phone ? `<p class="meta">📞 ${p.phone}</p>` : ''}
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

  async function handlePersonSubmit(e) {
    e.preventDefault();
    setError('form-person', '');
    const form = e.target;
    const data = {
      school_id: _schoolId,
      name: form.name.value.trim(),
      registration: form.registration.value.trim() || null,
      email: form.email.value.trim() || null,
      phone: form.phone.value.trim() || null,
    };
    try {
      const res = _editPersonId
        ? await window.aula.updatePerson(_editPersonId, data)
        : await window.aula.createPerson(data);
      if (!res.success) throw new Error(res.error);
      hideModal('modal-person');
      form.reset();
      loadPeople();
    } catch (e) {
      setError('form-person', e.message);
    }
  }

  function handlePeopleListClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, name, registration, email, phone } = btn.dataset;
    if (action === 'edit-person') {
      _editPersonId = parseInt(id);
      document.getElementById('modal-person-title').textContent = 'Editar Pessoa';
      const f = document.getElementById('form-person');
      f.name.value = name;
      f.registration.value = registration || '';
      f.email.value = email || '';
      f.phone.value = phone || '';
      showModal('modal-person');
    } else if (action === 'manage-roles') {
      openRolesModal(parseInt(id), name);
    }
  }

  // ── Modal de Papéis ─────────────────────────────────────────────────────────

  async function openRolesModal(personId, personName) {
    _rolesPersonId = personId;
    document.getElementById('roles-person-name').textContent = personName;
    showModal('modal-roles');
    await refreshRolesModal();
  }

  async function refreshRolesModal() {
    const container = document.getElementById('roles-content');
    container.innerHTML = '<div class="loading-spinner">Carregando...</div>';
    try {
      const [rolesRes, funcsRes] = await Promise.all([
        window.aula.getPersonRoles(_rolesPersonId),
        window.aula.getStaffFunctions(_schoolId),
      ]);
      if (!rolesRes.success) throw new Error(rolesRes.error);
      const { teacher, admin, staff } = rolesRes.data;

      // Atualiza o select de funções disponíveis
      _cachedFunctions = funcsRes.success ? funcsRes.data.filter(f => f.active) : [];
      const sel = document.getElementById('new-staff-func-select');
      const assignedIds = new Set(staff.map(s => s.staff_function_id));
      sel.innerHTML = '<option value="">Selecione uma função...</option>' +
        _cachedFunctions
          .filter(f => !assignedIds.has(f.id))
          .map(f => `<option value="${f.id}">${f.name} (${CAT_LABELS[f.category]?.label})</option>`)
          .join('');
      const noHint = document.getElementById('no-functions-hint');
      noHint.style.display = _cachedFunctions.length === 0 ? '' : 'none';
      sel.style.display = _cachedFunctions.length === 0 ? 'none' : '';

      // Exibe/oculta seção de admin
      document.getElementById('admin-role-section').style.display = admin ? 'none' : '';

      // Monta lista de papéis atuais
      const WM = { presencial: '🏢 Presencial', remoto: '🌐 Remoto', hibrido: '🔄 Híbrido' };
      let html = '<div class="roles-list">';

      // Professor
      html += `<div class="role-row">
        <span class="role-label">👨‍🏫 Professor</span>
        ${teacher
          ? `<span class="badge ${teacher.active ? 'badge-teacher' : 'badge-inactive'}">${teacher.active ? 'Ativo' : 'Inativo'}</span>
             <span class="meta" style="font-size:11px;color:var(--color-text-muted)" title="Modalidade de ensino">${WM[teacher.work_mode||'presencial']}</span>
             <button class="btn btn-ghost btn-small" data-action="edit-workmode" data-work-mode="${teacher.work_mode||'presencial'}" title="Alterar modalidade">✏️</button>
             <button class="btn btn-small ${teacher.active ? 'btn-warning' : 'btn-success'}"
               data-action="toggle-teacher" data-active="${teacher.active ? 0 : 1}" data-work-mode="${teacher.work_mode||'presencial'}">
               ${teacher.active ? 'Desativar' : 'Reativar'}
             </button>`
          : `<button class="btn btn-small btn-primary" data-action="enable-teacher">Atribuir papel</button>`
        }
      </div>`;

      // Admin
      if (admin) {
        html += `<div class="role-row">
          <span class="role-label">👨‍💼 Admin</span>
          <span class="badge ${admin.active ? 'badge-admin' : 'badge-inactive'}">${admin.active ? 'Ativo' : 'Inativo'}</span>
          <span class="meta">@${admin.username}</span>
        </div>`;
      }

      // Colaborador
      for (const s of staff) {
        html += `<div class="role-row">
          <span class="role-label">🏷️ ${s.function_name}</span>
          ${catBadge(s.category)}
          <span class="badge ${s.active ? 'badge-staff' : 'badge-inactive'}">${s.active ? 'Ativo' : 'Inativo'}</span>
          <button class="btn btn-small ${s.active ? 'btn-warning' : 'btn-success'}"
            data-action="toggle-staff" data-role-id="${s.id}" data-active="${s.active ? 0 : 1}">
            ${s.active ? 'Desativar' : 'Reativar'}
          </button>
          <button class="btn btn-small btn-danger" data-action="remove-staff" data-role-id="${s.id}">
            Remover
          </button>
        </div>`;
      }
      html += '</div>';
      container.innerHTML = html;

      container.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => handleRoleAction(btn.dataset));
      });
    } catch (e) {
      container.innerHTML = `<p class="error">Erro: ${e.message}</p>`;
    }
  }

  async function handleRoleAction({ action, active, roleId, workMode }) {
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
            await refreshRolesModal();
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
            await refreshRolesModal();
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
      await refreshRolesModal();
      loadPeople();
    } catch (e) {
      alert('Erro: ' + e.message);
    }
  }

  async function handleAddStaffRole() {
    const sel = document.getElementById('new-staff-func-select');
    const sfId = parseInt(sel.value);
    if (!sfId) { alert('Selecione uma função.'); return; }
    try {
      const r = await window.aula.addStaffRole(_rolesPersonId, sfId);
      if (!r.success) throw new Error(r.error);
      sel.value = '';
      await refreshRolesModal();
      loadPeople();
    } catch (e) {
      alert('Erro: ' + e.message);
    }
  }

  async function handleAddAdminRole(e) {
    e.preventDefault();
    const username = document.getElementById('admin-username').value.trim();
    const password = document.getElementById('admin-password').value;
    setError('form-add-admin', '');
    if (!username || !password) {
      setError('form-add-admin', 'Preencha usuário e senha.');
      return;
    }
    try {
      const r = await window.aula.auth.promoteToAdmin({
        personId: _rolesPersonId, username, password
      });
      if (!r.success) throw new Error(r.error);
      document.getElementById('admin-username').value = '';
      document.getElementById('admin-password').value = '';
      await refreshRolesModal();
      loadPeople();
    } catch (e) {
      setError('form-add-admin', e.message);
    }
  }

  // ── Setup de eventos ─────────────────────────────────────────────────────────

  function setupEventListeners() {
    // Abas internas
    document.querySelectorAll('.gestao-usuarios .tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.gestao-usuarios .tab-btn[data-tab]').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.gestao-usuarios .tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');
      });
    });

    // Funções
    document.getElementById('btn-new-func')?.addEventListener('click', () => {
      _editFuncId = null;
      document.getElementById('modal-func-title').textContent = 'Nova Função';
      document.getElementById('form-func').reset();
      showModal('modal-func');
    });
    document.getElementById('btn-cancel-func')?.addEventListener('click', () => hideModal('modal-func'));
    document.getElementById('form-func')?.addEventListener('submit', handleFuncSubmit);
    document.getElementById('functions-list')?.addEventListener('click', handleFunctionListClick);

    // Pessoas
    document.getElementById('btn-new-person')?.addEventListener('click', () => {
      _editPersonId = null;
      document.getElementById('modal-person-title').textContent = 'Nova Pessoa';
      document.getElementById('form-person').reset();
      showModal('modal-person');
    });
    document.getElementById('btn-cancel-person')?.addEventListener('click', () => hideModal('modal-person'));
    document.getElementById('form-person')?.addEventListener('submit', handlePersonSubmit);
    document.getElementById('people-list')?.addEventListener('click', handlePeopleListClick);

    // Papéis
    document.getElementById('btn-close-roles')?.addEventListener('click', () => hideModal('modal-roles'));
    document.getElementById('btn-add-staff-role')?.addEventListener('click', handleAddStaffRole);
    document.getElementById('form-add-admin')?.addEventListener('submit', handleAddAdminRole);
    document.getElementById('link-go-functions')?.addEventListener('click', e => {
      e.preventDefault();
      hideModal('modal-roles');
      document.querySelector('.gestao-usuarios .tab-btn[data-tab="functions"]')?.click();
    });

    // Fechar modais por overlay e X
    document.querySelectorAll('.gestao-usuarios .u-modal-bg').forEach(overlay => {
      overlay.addEventListener('click', e => e.target.parentElement.classList.add('hidden'));
    });
    document.querySelectorAll('.gestao-usuarios .u-modal-close').forEach(btn => {
      btn.addEventListener('click', e => e.target.closest('.u-modal').classList.add('hidden'));
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
