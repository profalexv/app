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
      <div style="padding:24px;overflow-y:auto;height:100%">
        <div class="page-header" style="margin-bottom:20px">
          <div>
            <h1 style="margin:0;font-size:22px">🔐 Auditoria LGPD</h1>
            <p class="subtitle" style="margin:4px 0 0">Histórico de ações para conformidade LGPD</p>
          </div>
          <div style="display:flex;gap:8px">
            <select id="audit-limit" class="form-control" style="width:120px">
              <option value="50">50 registros</option>
              <option value="100">100 registros</option>
              <option value="200">200 registros</option>
            </select>
            <button class="btn btn-ghost" id="audit-refresh">↻ Atualizar</button>
          </div>
        </div>

        <!-- Filtros -->
        <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
          <input type="text" id="audit-search" class="form-control" style="width:220px" placeholder="Filtrar por ação ou entidade...">
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
      listEl.innerHTML = `<p style="color:#dc2626;padding:20px">Erro ao carregar auditoria: ${E(e.message)}</p>`;
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
      listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280">Nenhum registro de auditoria encontrado.</div>';
      return;
    }

    listEl.innerHTML = `
      <div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="background:#f8fafc;border-bottom:2px solid #e5e7eb">
              <th style="padding:12px 16px;text-align:left;font-weight:600;white-space:nowrap">Data/Hora</th>
              <th style="padding:12px 16px;text-align:left;font-weight:600">Usuário</th>
              <th style="padding:12px 16px;text-align:left;font-weight:600">Ação</th>
              <th style="padding:12px 16px;text-align:left;font-weight:600">Entidade</th>
              <th style="padding:12px 16px;text-align:left;font-weight:600">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const icon = ENTITY_ICONS[r.entity] || ENTITY_ICONS.default;
              const details = typeof r.details === 'object'
                ? Object.entries(r.details).map(([k,v]) => `${k}: ${v}`).join(', ')
                : '';
              return `
                <tr style="border-bottom:1px solid #f0f0f0" class="audit-row">
                  <td style="padding:10px 16px;white-space:nowrap;color:#6b7280">
                    ${new Date(r.created_at).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})}
                  </td>
                  <td style="padding:10px 16px">${E(r.admin_name || '—')}</td>
                  <td style="padding:10px 16px">${actionBadge(r.action)}</td>
                  <td style="padding:10px 16px">${icon} <span style="color:#374151">${E(r.entity)}${r.entity_id ? ` #${r.entity_id}` : ''}</span></td>
                  <td style="padding:10px 16px;color:#6b7280;font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis"
                      title="${E(details)}">${E(details)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div style="padding:12px 16px;border-top:1px solid #f0f0f0;color:#6b7280;font-size:12px">
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
