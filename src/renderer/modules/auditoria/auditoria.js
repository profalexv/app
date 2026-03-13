/**
 * Módulo Auditoria LGPD
 * Feature 8 — registro e visualização de auditoria de ações
 */

window.ModuleAuditoria = (() => {
  let _schoolId = null;
  const E = window._esc;

  const ACTION_LABELS = {
    create:                { label: 'Criação',        color: '#16a34a', bg: '#d1fae5' },
    update:                { label: 'Edição',         color: '#2563eb', bg: '#dbeafe' },
    delete:                { label: 'Exclusão',       color: '#dc2626', bg: '#fee2e2' },
    update_role:           { label: 'Alteração de role', color: '#7c3aed', bg: '#ede9fe' },
    set_portal_password:   { label: 'Senha portal',   color: '#d97706', bg: '#fef3c7' },
    export_pdf:            { label: 'Exportação',     color: '#0891b2', bg: '#cffafe' },
    broadcast_notification:{ label: 'Broadcast',      color: '#6b7280', bg: '#f3f4f6' },
    send_notification:     { label: 'Notificação',    color: '#6b7280', bg: '#f3f4f6' },
  };

  const ENTITY_ICONS = {
    substituicao: '🔄', calendario: '📆', teacher: '👨‍🏫', admin: '👤',
    schedule: '📅', 'ponto_mensal': '🕐', 'teacher_load': '📊', default: '📝',
  };

  function actionBadge(action) {
    const a = ACTION_LABELS[action] || { label: action, color: '#6b7280', bg: '#f3f4f6' };
    return `<span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${a.bg};color:${a.color}">${a.label}</span>`;
  }

  async function mount(container) {
    container.innerHTML = `
      <div class="audit-module module-container">
        <div class="page-header">
          <div>
            <h1>🔐 Auditoria LGPD</h1>
            <p class="subtitle">Histórico de ações para conformidade LGPD</p>
          </div>
          <div class="page-header-actions">
            <select id="audit-limit" class="form-control">
              <option value="50">50 registros</option>
              <option value="100">100 registros</option>
              <option value="200">200 registros</option>
            </select>
            <button class="btn btn-ghost" id="audit-refresh">↻ Atualizar</button>
          </div>
        </div>

        <!-- Filtros -->
        <div class="filter-bar">
          <input type="text" id="audit-search" class="form-control" placeholder="Filtrar por ação ou entidade...">
        </div>

        <div id="audit-list">
          <div class="loading"><span class="loading-dots">Carregando</span></div>
        </div>
      </div>
    `;

    await loadAudit(container);

    document.getElementById('audit-refresh').addEventListener('click', () => loadAudit(container));
    document.getElementById('audit-limit').addEventListener('change', () => loadAudit(container));
    document.getElementById('audit-search').addEventListener('input', (e) => filterAudit(e.target.value));
  }

  let _allRows = [];

  async function loadAudit(container) {
    const listEl = document.getElementById('audit-list');
    listEl.innerHTML = '<div class="loading"><span class="loading-dots">Carregando</span></div>';
    try {
      const limit = parseInt(document.getElementById('audit-limit')?.value || '50');
      _allRows = await window.aula.getAuditLog(_schoolId, limit);
      renderRows(_allRows);
    } catch (e) {
      listEl.innerHTML = `<p class="error-message">Erro ao carregar auditoria: ${E(e.message)}</p>`;
    }
  }

  function filterAudit(query) {
    if (!query.trim()) { renderRows(_allRows); return; }
    const q = query.toLowerCase();
    renderRows(_allRows.filter(r =>
      r.action?.toLowerCase().includes(q) ||
      r.entity?.toLowerCase().includes(q) ||
      r.admin_name?.toLowerCase().includes(q)
    ));
  }

  function renderRows(rows) {
    const listEl = document.getElementById('audit-list');
    if (!rows.length) {
      listEl.innerHTML = '<div class="empty-state">Nenhum registro de auditoria encontrado.</div>';
      return;
    }

    listEl.innerHTML = `
      <div class="audit-table-wrapper">
        <table class="audit-table">
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Usuário</th>
              <th>Ação</th>
              <th>Entidade</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const icon = ENTITY_ICONS[r.entity] || ENTITY_ICONS.default;
              const details = typeof r.details === 'object'
                ? Object.entries(r.details).map(([k,v]) => `${k}: ${v}`).join('; ')
                : '';
              return `
                <tr class="audit-row">
                  <td class="col-date">
                    ${new Date(r.created_at).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}
                  </td>
                  <td>${E(r.admin_name || '—')}</td>
                  <td>${actionBadge(r.action)}</td>
                  <td class="col-entity">${icon} <span>${E(r.entity)}${r.entity_id ? ` #${r.entity_id}` : ''}</span></td>
                  <td class="col-details" title="${E(details)}">${E(details)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div class="audit-table-footer">
          ${rows.length} registro(s) exibido(s)
        </div>
      </div>
    `;
  }

  return {
    async initialize(schoolId) { _schoolId = schoolId; },
    mount,
  };
})();
