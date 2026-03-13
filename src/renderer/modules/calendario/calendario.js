/**
 * Módulo Calendário Acadêmico
 * Feature 6 — datas letivas, feriados, eventos, reposições
 */

window.ModuleCalendario = (() => {
  let _schoolId = null;
  const E = window._esc;

  const TYPES = {
    feriado:    { label: 'Feriado',    icon: '🏛️', bg: '#fee2e2', color: '#dc2626' },
    recesso:    { label: 'Recesso',    icon: '🏖️', bg: '#fef3c7', color: '#d97706' },
    evento:     { label: 'Evento',     icon: '🎉', bg: '#dbeafe', color: '#2563eb' },
    reposicao:  { label: 'Reposição',  icon: '📚', bg: '#d1fae5', color: '#16a34a' },
    reuniao:    { label: 'Reunião',    icon: '🤝', bg: '#ede9fe', color: '#7c3aed' },
    outro:      { label: 'Outro',      icon: '📌', bg: '#f3f4f6', color: '#6b7280' },
  };

  function typeBadge(type) {
    const t = TYPES[type] || TYPES.outro;
    return `<span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${t.bg};color:${t.color}">${t.icon} ${t.label}</span>`;
  }

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  async function mount(container) {
    const year = new Date().getFullYear();
    container.innerHTML = `
      <div class="calendar-module module-container">
        <div class="page-header">
          <div>
            <h1>📆 Calendário Acadêmico</h1>
            <p class="subtitle">Feriados, eventos, reposições e recessos</p>
          </div>
          <div class="page-header-actions">
            <select id="cal-year" class="form-control year-selector">
              ${[year-1, year, year+1].map(y => `<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}
            </select>
            <button class="btn btn-primary" id="btn-novo-evento">+ Novo Evento</button>
          </div>
        </div>
        <div id="cal-content"><div class="loading"><span class="loading-dots">Carregando</span></div></div>
      </div>

      <!-- Modal novo/editar evento -->
      <div id="modal-evento" class="modal-overlay" style="display:none;">
        <div class="modal large" role="dialog">
          <div class="modal-header"><h3 id="evento-modal-title">Novo Evento</h3><button class="modal-close">✕</button></div>
          <div class="modal-body">
            <input type="hidden" id="evento-id">
            <div class="form-row">
              <div class="form-group">
                <label for="evento-type">Tipo *</label>
                <select id="evento-type" name="type" class="form-control">
                  ${Object.entries(TYPES).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label for="evento-date">Data *</label>
                <input type="date" id="evento-date" name="date" class="form-control" required>
              </div>
              <div class="form-group">
                <label for="evento-end-date">Data final (opcional)</label>
                <input type="date" id="evento-end-date" name="end_date" class="form-control">
              </div>
            </div>
            <div class="form-group">
              <label for="evento-title">Título *</label>
              <input type="text" id="evento-title" name="title" class="form-control" placeholder="Ex: Feriado Municipal" required>
            </div>
            <div class="form-group">
              <label for="evento-desc">Descrição</label>
              <textarea id="evento-desc" name="description" class="form-control" rows="2" placeholder="Detalhes adicionais..."></textarea>
            </div>
            <div class="form-group">
              <label for="evento-affects" style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="evento-affects" name="affects_classes" checked>
                Afeta aulas (dia letivo é cancelado/alterado)
              </label>
            </div>
            <div id="evento-error" class="form-error"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" id="evento-cancel">Cancelar</button>
            <button class="btn btn-primary" id="evento-save">Salvar</button>
          </div>
        </div>
      </div>
    `;

    await loadCalendar(container, year);

    document.getElementById('cal-year').addEventListener('change', (e) => {
      loadCalendar(container, parseInt(e.target.value));
    });

    document.getElementById('btn-novo-evento').addEventListener('click', () => {
      openEventModal(null);
    });
    document.querySelector('#modal-evento .modal-close').addEventListener('click', closeModal);
    document.getElementById('evento-cancel').addEventListener('click', closeModal);
    document.getElementById('evento-save').addEventListener('click', () => saveEvent(container));
  }

  async function loadCalendar(container, year) {
    const content = document.getElementById('cal-content');
    content.innerHTML = '<div class="loading"><span class="loading-dots">Carregando</span></div>';
    try {
      const events = await window.aula.getCalendar(_schoolId, year);
      renderCalendar(events, year);
    } catch (e) {
      content.innerHTML = `<p class="error-message">Erro: ${E(e.message)}</p>`;
    }
  }

  function renderCalendar(events, year) {
    // Agrupa por mês
    const byMonth = {};
    events.forEach(ev => {
      const month = parseInt(ev.date.slice(5, 7)) - 1;
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push(ev);
    });

    const content = document.getElementById('cal-content');
    if (!events.length) {
      content.innerHTML = '<div class="empty-state">Nenhum evento cadastrado para este ano.</div>';
      return;
    }

    content.innerHTML = Object.entries(byMonth).map(([monthIdx, evs]) => `
      <div class="calendar-month-group">
        <h3 class="calendar-month-title">${MONTHS[monthIdx]}</h3>
        ${evs.map(ev => `
          <div class="calendar-event-row">
            <div class="calendar-event-info">
              <div class="calendar-event-date">
                ${ev.date.slice(8)}${ev.end_date && ev.end_date !== ev.date ? `–${ev.end_date.slice(8)}` : ''}
              </div>
              <div>
                ${typeBadge(ev.type)}
                <div class="event-title">${E(ev.title)}</div>
                ${ev.description ? `<div class="event-description">${E(ev.description)}</div>` : ''}
                ${ev.affects_classes === false ? '<div class="event-meta">Não afeta aulas</div>' : ''}
              </div>
            </div>
            <div class="event-actions">
              <button class="btn btn-sm btn-ghost ev-edit-btn" data-id="${ev.id}" title="Editar">✏️</button>
              <button class="btn btn-sm btn-ghost ev-delete-btn" data-id="${ev.id}" title="Excluir">✕</button>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');

    // Bind editar
    document.querySelectorAll('.ev-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ev = events.find(e => String(e.id) === btn.dataset.id);
        if (ev) openEventModal(ev);
      });
    });
    // Bind deletar
    document.querySelectorAll('.ev-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir este evento do calendário?')) return;
        await window.aula.deleteCalendarEvent(btn.dataset.id);
        window.showToast('Evento removido.', 'info');
        const year = parseInt(document.getElementById('cal-year').value);
        await loadCalendar(null, year);
      });
    });
  }

  function openEventModal(ev) {
    const modal = document.getElementById('modal-evento');
    document.getElementById('evento-id').value    = ev?.id || '';
    document.getElementById('evento-type').value  = ev?.type || 'feriado';
    document.getElementById('evento-date').value  = ev?.date || new Date().toISOString().slice(0,10);
    document.getElementById('evento-end-date').value = ev?.end_date || '';
    document.getElementById('evento-title').value = ev?.title || '';
    document.getElementById('evento-desc').value  = ev?.description || '';
    document.getElementById('evento-affects').checked = ev?.affects_classes !== false;
    document.getElementById('evento-error').textContent = '';
    document.getElementById('evento-modal-title').textContent = ev ? 'Editar Evento' : 'Novo Evento';
    modal.style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('modal-evento').style.display = 'none';
  }

  async function saveEvent(container) {
    const errEl = document.getElementById('evento-error');
    errEl.textContent = '';
    const id       = document.getElementById('evento-id').value;
    const type     = document.getElementById('evento-type').value;
    const date     = document.getElementById('evento-date').value;
    const end_date = document.getElementById('evento-end-date').value || null;
    const title    = document.getElementById('evento-title').value.trim();
    const description = document.getElementById('evento-desc').value.trim();
    const affects_classes = document.getElementById('evento-affects').checked;

    if (!date || !title) { errEl.textContent = 'Data e título são obrigatórios.'; return; }

    try {
      if (id) {
        await window.aula.updateCalendarEvent(id, { date, end_date, type, title, description, affects_classes });
      } else {
        await window.aula.createCalendarEvent({ school_id: _schoolId, date, end_date, type, title, description, affects_classes });
      }
      window.showToast('Evento salvo.', 'success');
      closeModal();
      const year = parseInt(document.getElementById('cal-year').value);
      await loadCalendar(container, year);
    } catch (e) { errEl.textContent = e.message; }
  }

  return {
    async initialize(schoolId) { _schoolId = schoolId; },
    mount,
  };
})();
