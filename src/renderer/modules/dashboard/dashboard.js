/**
 * Módulo Dashboard Analítico
 * Feature 1 — métricas consolidadas da escola em tempo real
 */

window.ModuleDashboard = (() => {
  let _schoolId = null;

  const E = window._esc;

  const WEEKDAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const CALENDAR_COLORS = {
    feriado:   { bg: '#fee2e2', color: '#dc2626' },
    recesso:   { bg: '#fef3c7', color: '#d97706' },
    evento:    { bg: '#dbeafe', color: '#2563eb' },
    reposicao: { bg: '#d1fae5', color: '#16a34a' },
    reuniao:   { bg: '#ede9fe', color: '#7c3aed' },
    outro:     { bg: '#f3f4f6', color: '#6b7280' },
  };

  function typeBadge(type, label) {
    const c = CALENDAR_COLORS[type] || CALENDAR_COLORS.outro;
    return `<span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${c.bg};color:${c.color}">${label || type}</span>`;
  }

  function render() {
    return `
      <div class="dashboard-module module-container">
        <div class="page-header">
          <div>
            <h1>📊 Dashboard</h1>
            <p class="subtitle">Visão geral da escola</p>
          </div>
          <button class="btn btn-ghost" id="dash-refresh" title="Atualizar">↻ Atualizar</button>
        </div>

        <div id="dash-content">
          <div class="loading"><span class="loading-dots">Carregando</span></div>
        </div>
      </div>
    `;
  }

  function renderContent(data) {
    const { summary, activeSchedules, teacherLoad, pendingSubstitutions, upcomingEvents, recentActivity } = data;

    const cards = [
      { icon: '👤', label: 'Professores ativos', value: summary.activeTeachers, sub: `de ${summary.totalTeachers} cadastrados`, color: '#3B6FD4' },
      { icon: '🏫', label: 'Turmas',              value: summary.totalClasses,   sub: 'cadastradas',                              color: '#16a34a' },
      { icon: '📅', label: 'Cronogramas',          value: summary.totalSchedules, sub: 'criados',                                  color: '#d97706' },
      { icon: '⚠️', label: 'Substituições pendentes', value: pendingSubstitutions.length, sub: 'aguardando substituto',           color: '#dc2626' },
    ];

    const cardsHtml = cards.map(c => `
      <div class="dash-card" style="--card-color: ${c.color}">
        <div class="card-icon">${c.icon}</div>
        <div class="card-value">${c.value}</div>
        <div class="card-label">${c.label}</div>
        <div class="card-sub-label">${c.sub}</div>
      </div>
    `).join('');

    const teacherLoadHtml = teacherLoad.length
      ? teacherLoad.map((t, i) => {
          const max = teacherLoad[0].lessons || 1;
          const pct = Math.min(100, Math.round((t.lessons / max) * 100));
          return `
            <div class="teacher-load-item">
              <div class="item-header">
                <span class="name">${E(t.name)}</span>
                <span class="lessons">${t.lessons} aulas/sem.</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar" style="width:${pct}%"></div>
              </div>
            </div>
          `;
        }).join('')
      : '<p class="empty-state" style="padding: 10px 0;">Nenhum dado de carga disponível.</p>';

    const subsHtml = pendingSubstitutions.length
      ? pendingSubstitutions.map(s => `
          <div class="list-item">...</div>
        `).join('')
      : '<p class="empty-state" style="padding: 10px 0;">Sem substituições pendentes. ✓</p>';

    const eventsHtml = upcomingEvents.length
      ? upcomingEvents.map(ev => `
          <div class="list-item">...</div>
        `).join('')
      : '<p class="empty-state" style="padding: 10px 0;">Sem eventos próximos.</p>';

    const activityHtml = recentActivity.length
      ? recentActivity.map(a => `
          <div class="list-item-sm">...</div>
        `).join('')
      : '<p class="empty-state" style="padding: 10px 0;">Nenhuma atividade recente.</p>';

    return `
      <!-- Cards resumo -->
      <div class="dashboard-grid-cards">
        ${cardsHtml}
      </div>

      <!-- Linha 2: carga + substituições + próximos eventos -->
      <div class="dashboard-grid-main">
        <div class="dash-panel">
          <h3 class="panel-title">📊 Carga por Professor</h3>
          ${teacherLoadHtml}
        </div>
        <div class="dash-panel-group">
          <div class="dash-panel">
            <h3 class="panel-title">⚠️ Substituições Pendentes</h3>
            ${subsHtml}
          </div>
          <div class="dash-panel">
            <h3 class="panel-title">📆 Próximos Eventos</h3>
            ${eventsHtml}
          </div>
        </div>
      </div>

      <!-- Atividade recente -->
      <div class="dash-panel">
        <h3 class="panel-title">🔍 Atividade Recente (Auditoria)</h3>
        ${activityHtml}
      </div>
    `;
  }

  async function mount(container) {
    container.innerHTML = render();
    const content = container.querySelector('#dash-content');

    async function load() {
      content.innerHTML = '<div class="loading"><span class="loading-dots">Carregando</span></div>';
      try {
        const data = await window.aula.getDashboard(_schoolId);
        content.innerHTML = renderContent(data);
      } catch (e) {
        content.innerHTML = `<div class="error-message" style="text-align:center">Erro ao carregar dashboard: ${E(e.message)}</div>`;
      }
    }

    container.querySelector('#dash-refresh').addEventListener('click', load);
    await load();
  }

  return {
    async initialize(schoolId) { _schoolId = schoolId; },
    mount,
  };
})();
