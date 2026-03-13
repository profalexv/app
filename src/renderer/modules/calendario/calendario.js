/**
 * Módulo Calendário Acadêmico
 * Feature 6 — datas letivas, feriados, eventos, reposições
 */

window.ModuleCalendario = (() => {
  let _schoolId = null;
  const E = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

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
      <div style="padding:24px;overflow-y:auto;height:100%">
        <div class="page-header" style="margin-bottom:20px">
          <div>
            <h1 style="margin:0;font-size:22px">📆 Calendário Acadêmico</h1>
            <p class="subtitle" style="margin:4px 0 0">Feriados, eventos, reposições e recessos</p>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="cal-year" class="form-control" style="width:100px">
              ${[year-1, year, year+1].map(y => `<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}
            </select>
            <button class="btn btn-primary" id="btn-novo-evento">+ Novo Evento</button>
          </div>
        </div>
        <div id="cal-content"><div class="loading"><span class="loading-dots">Carregando</span></div></div>
      </div>

      <!-- Modal novo/editar evento -->
      <div id="modal-evento" class="modal-overlay" style="display:none">
        <div class="modal large" role="dialog">
          <div class="modal-header"><h3 id="evento-modal-title">Novo Evento</h3><button class="modal-close">✕</button></div>
          <div class="modal-body">
            <input type="hidden" id="evento-id">
            <div class="form-row">
              <div class="form-group">
                <label>Tipo *</label>
                <select id="evento-type" class="form-control">
                  ${Object.entries(TYPES).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label>Data *</label>
                <input type="date" id="evento-date" class="form-control" required>
              </div>
              <div class="form-group">
                <label>Data final (opcional)</label>
                <input type="date" id="evento-end-date" class="form-control">
              </div>
            </div>
            <div class="form-group">
              <label>Título *</label>
              <input type="text" id="evento-title" class="form-control" placeholder="Ex: Feriado Municipal" required>
            </div>
            <div class="form-group">
              <label>Descrição</label>
              <textarea id="evento-desc" class="form-control" rows="2" placeholder="Detalhes adicionais..."></textarea>
            </div>
            <div class="form-group">
              <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="evento-affects" checked>
                Afeta aulas (dia letivo é cancelado/alterado)
              </label>
            </div>
            <div id="evento-error" style="color:#dc2626;font-size:13px"></div>
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
      content.innerHTML = `<p style="color:#dc2626">Erro: ${E(e.message)}</p>`;
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
      content.innerHTML = '<div style="text-align:center;padding:40px;color:#6b7280">Nenhum evento cadastrado para este ano.</div>';
      return;
    }

    content.innerHTML = Object.entries(byMonth).map(([monthIdx, evs]) => `
      <div style="background:#fff;border-radius:10px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
        <h3 style="margin:0 0 16px;font-size:15px;color:#374151">${MONTHS[monthIdx]}</h3>
        ${evs.map(ev => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f3f4f6">
            <div style="display:flex;gap:12px;align-items:center">
              <div style="width:60px;text-align:right;font-size:12px;color:#6b7280;font-weight:600">
                ${ev.date.slice(8)}${ev.end_date && ev.end_date !== ev.date ? `–${ev.end_date.slice(8)}` : ''}
              </div>
              <div>
                ${typeBadge(ev.type)}
                <div style="font-size:14px;font-weight:500;margin-top:4px">${E(ev.title)}</div>
                ${ev.description ? `<div style="font-size:12px;color:#6b7280">${E(ev.description)}</div>` : ''}
                ${ev.affects_classes === false ? '<div style="font-size:11px;color:#6b7280">Não afeta aulas</div>' : ''}
              </div>
            </div>
            <div style="display:flex;gap:4px">
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
