/**
 * Módulo Dashboard Analítico
 * Feature 1 — métricas consolidadas da escola em tempo real
 */

window.ModuleDashboard = (() => {
  let _schoolId = null;

  const E = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

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
      <div class="dashboard-module" style="padding:24px;overflow-y:auto;height:100%">
        <div class="page-header" style="margin-bottom:24px">
          <div>
            <h1 style="margin:0;font-size:22px">📊 Dashboard</h1>
            <p class="subtitle" style="margin:4px 0 0">Visão geral da escola</p>
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
      <div class="dash-card" style="
        background:#fff;border-radius:12px;padding:20px;
        border-left:4px solid ${c.color};
        box-shadow:0 1px 3px rgba(0,0,0,.08);
        min-width:0;
      ">
        <div style="font-size:28px;margin-bottom:8px">${c.icon}</div>
        <div style="font-size:32px;font-weight:700;color:${c.color}">${c.value}</div>
        <div style="font-weight:600;font-size:13px">${c.label}</div>
        <div style="color:#6b7280;font-size:12px;margin-top:2px">${c.sub}</div>
      </div>
    `).join('');

    const teacherLoadHtml = teacherLoad.length
      ? teacherLoad.map((t, i) => {
          const max = teacherLoad[0].lessons || 1;
          const pct = Math.round((t.lessons / max) * 100);
          return `
            <div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:13px;font-weight:500">${E(t.name)}</span>
                <span style="font-size:12px;color:#6b7280">${t.lessons} aulas/sem.</span>
              </div>
              <div style="height:8px;background:#f0f0f0;border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:#3B6FD4;border-radius:4px;transition:width .3s"></div>
              </div>
            </div>
          `;
        }).join('')
      : '<p style="color:#6b7280;font-size:13px">Nenhum dado de carga disponível.</p>';

    const subsHtml = pendingSubstitutions.length
      ? pendingSubstitutions.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f0f0">
            <div>
              <div style="font-size:13px;font-weight:500">${E(s.subject) || 'Sem disciplina'}</div>
              <div style="font-size:12px;color:#6b7280">${s.date}</div>
            </div>
            <span style="font-size:11px;background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px">Pendente</span>
          </div>
        `).join('')
      : '<p style="color:#6b7280;font-size:13px">Sem substituições pendentes. ✓</p>';

    const eventsHtml = upcomingEvents.length
      ? upcomingEvents.map(ev => `
          <div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f0f0f0">
            <div style="white-space:nowrap;font-size:12px;color:#6b7280;min-width:80px">${ev.date}</div>
            <div style="flex:1;min-width:0">
              ${typeBadge(ev.type)}
              <div style="font-size:13px;font-weight:500;margin-top:4px">${E(ev.title)}</div>
            </div>
          </div>
        `).join('')
      : '<p style="color:#6b7280;font-size:13px">Sem eventos próximos.</p>';

    const activityHtml = recentActivity.length
      ? recentActivity.map(a => `
          <div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:12px">
            <span style="color:#6b7280;white-space:nowrap">${new Date(a.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>
            <span style="font-weight:500">${E(a.action)}</span>
            <span style="color:#6b7280">${E(a.entity)}</span>
          </div>
        `).join('')
      : '<p style="color:#6b7280;font-size:13px">Nenhuma atividade recente.</p>';

    return `
      <!-- Cards resumo -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:24px">
        ${cardsHtml}
      </div>

      <!-- Linha 2: carga + substituições + próximos eventos -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px">
        <div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
          <h3 style="margin:0 0 16px;font-size:15px">📊 Carga por Professor</h3>
          ${teacherLoadHtml}
        </div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);flex:1">
            <h3 style="margin:0 0 12px;font-size:15px">⚠️ Substituições Pendentes</h3>
            ${subsHtml}
          </div>
          <div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08);flex:1">
            <h3 style="margin:0 0 12px;font-size:15px">📆 Próximos Eventos</h3>
            ${eventsHtml}
          </div>
        </div>
      </div>

      <!-- Atividade recente -->
      <div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <h3 style="margin:0 0 12px;font-size:15px">🔍 Atividade Recente (Auditoria)</h3>
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
        content.innerHTML = `<div style="text-align:center;padding:40px;color:#dc2626">Erro ao carregar dashboard: ${E(e.message)}</div>`;
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
