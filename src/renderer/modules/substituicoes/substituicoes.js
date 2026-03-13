/**
 * Módulo Substituições de Professores
 * Feature 2 — registro de ausências e alocação de substitutos
 */

window.ModuleSubstituicoes = (() => {
  let _schoolId = null;
  const E = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const STATUS_LABELS = {
    pendente: { label: 'Pendente',   bg: '#fee2e2', color: '#dc2626' },
    coberta:  { label: 'Coberta',    bg: '#d1fae5', color: '#16a34a' },
    cancelada:{ label: 'Cancelada',  bg: '#f3f4f6', color: '#6b7280' },
  };
  const WEEKDAY_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  function statusBadge(status) {
    const s = STATUS_LABELS[status] || STATUS_LABELS.pendente;
    return `<span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${s.bg};color:${s.color}">${s.label}</span>`;
  }

  async function load(container) {
    container.innerHTML = '<div class="loading"><span class="loading-dots">Carregando</span></div>';
    try {
      const [subs, teachers] = await Promise.all([
        window.aula.getSubstitutions(_schoolId),
        window.aula.getTeachers(_schoolId),
      ]);
      renderList(container, subs, teachers);
    } catch (e) {
      container.innerHTML = `<p style="color:#dc2626;padding:20px">Erro: ${E(e.message)}</p>`;
    }
  }

  function renderList(container, subs, teachers) {
    const teacherOptions = teachers.map(t => `<option value="${E(t.id)}">${E(t.name)}</option>`).join('');

    container.innerHTML = `
      <div class="substituicoes-module" style="padding:24px;overflow-y:auto;height:100%">
        <div class="page-header" style="margin-bottom:20px">
          <div>
            <h1 style="margin:0;font-size:22px">🔄 Substituições</h1>
            <p class="subtitle" style="margin:4px 0 0">Controle de ausências e substitutos</p>
          </div>
          <button class="btn btn-primary" id="btn-nova-sub">+ Nova Substituição</button>
        </div>

        <!-- Filtro por data -->
        <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center">
          <label style="font-size:13px;font-weight:500">Filtrar por data:</label>
          <input type="date" id="sub-filter-date" class="form-control" style="width:160px">
          <button class="btn btn-ghost btn-sm" id="sub-clear-filter">Limpar filtro</button>
        </div>

        <!-- Lista -->
        <div id="sub-list">
          ${subs.length === 0
            ? '<div style="text-align:center;padding:40px;color:#6b7280">Nenhuma substituição registrada.</div>'
            : subs.map(s => `
              <div class="sub-card" data-id="${s.id}" style="
                background:#fff;border-radius:10px;padding:16px;margin-bottom:10px;
                box-shadow:0 1px 3px rgba(0,0,0,.08);
                border-left:4px solid ${STATUS_LABELS[s.status]?.color || '#6b7280'}
              ">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
                  <div style="flex:1">
                    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
                      ${statusBadge(s.status)}
                      <span style="font-size:12px;color:#6b7280">${s.date} — ${WEEKDAY_LABELS[s.weekday] || s.weekday}º período ${s.period}</span>
                    </div>
                    <div style="font-size:14px;font-weight:600">${E(s.subject) || 'Sem disciplina definida'}</div>
                    <div style="font-size:13px;color:#374151;margin-top:4px">
                      Ausente: <strong>${E(s.original_teacher_name)}</strong>
                      ${s.substitute_teacher_name && s.substitute_teacher_name !== 'A definir'
                        ? `→ Substituto: <strong>${E(s.substitute_teacher_name)}</strong>`
                        : '<span style="color:#dc2626"> — Substituto não definido</span>'}
                    </div>
                    ${s.class_name ? `<div style="font-size:12px;color:#6b7280;margin-top:2px">Turma: ${E(s.class_name)}</div>` : ''}
                    ${s.notes ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;font-style:italic">"${E(s.notes)}"</div>` : ''}
                  </div>
                  <div style="display:flex;gap:6px;flex-shrink:0">
                    ${s.status === 'pendente' ? `<button class="btn btn-sm btn-primary sub-assign-btn" data-id="${s.id}" title="Definir substituto">Definir</button>` : ''}
                    <button class="btn btn-sm btn-ghost sub-delete-btn" data-id="${s.id}" title="Remover">✕</button>
                  </div>
                </div>
              </div>
            `).join('')}
        </div>
      </div>

      <!-- Modal nova substituição -->
      <div id="modal-nova-sub" class="modal-overlay" style="display:none">
        <div class="modal large" role="dialog">
          <div class="modal-header">
            <h3>Nova Substituição</h3>
            <button class="modal-close">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-row">
              <div class="form-group">
                <label>Professor Ausente *</label>
                <select id="sub-original" class="form-control" required>
                  <option value="">Selecione...</option>
                  ${teacherOptions}
                </select>
              </div>
              <div class="form-group">
                <label>Substituto</label>
                <select id="sub-substitute" class="form-control">
                  <option value="">A definir</option>
                  ${teacherOptions}
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Data *</label>
                <input type="date" id="sub-date" class="form-control" value="${new Date().toISOString().slice(0,10)}" required>
              </div>
              <div class="form-group">
                <label>Dia da Semana *</label>
                <select id="sub-weekday" class="form-control">
                  ${WEEKDAY_LABELS.map((d,i) => `<option value="${i}">${d}</option>`)}
                </select>
              </div>
              <div class="form-group">
                <label>Período *</label>
                <input type="number" id="sub-period" class="form-control" min="1" max="10" value="1" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Disciplina</label>
                <input type="text" id="sub-subject" class="form-control" placeholder="Ex: Matemática">
              </div>
            </div>
            <div class="form-group">
              <label>Observações</label>
              <textarea id="sub-notes" class="form-control" rows="2" placeholder="Informações adicionais..."></textarea>
            </div>
            <div id="sub-error" style="color:#dc2626;font-size:13px;margin-top:4px"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" id="sub-modal-cancel">Cancelar</button>
            <button class="btn btn-primary" id="sub-modal-save">Registrar</button>
          </div>
        </div>
      </div>

      <!-- Modal atribuir substituto -->
      <div id="modal-assign-sub" class="modal-overlay" style="display:none">
        <div class="modal" role="dialog">
          <div class="modal-header"><h3>Definir Substituto</h3><button class="modal-close assign-close">✕</button></div>
          <div class="modal-body">
            <input type="hidden" id="assign-sub-id">
            <div class="form-group">
              <label>Substituto *</label>
              <select id="assign-teacher" class="form-control">
                <option value="">Selecione...</option>
                ${teacherOptions}
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost assign-close">Cancelar</button>
            <button class="btn btn-primary" id="assign-save">Salvar</button>
          </div>
        </div>
      </div>
    `;

    // --- Eventos ---
    const handleSaveNewSub = async () => {
      const errEl = document.getElementById('sub-error');
      errEl.textContent = '';
      const original    = document.getElementById('sub-original').value;
      const substitute  = document.getElementById('sub-substitute').value;
      const date        = document.getElementById('sub-date').value;
      const weekday     = document.getElementById('sub-weekday').value;
      const period      = document.getElementById('sub-period').value;
      const subject     = document.getElementById('sub-subject').value;
      const notes       = document.getElementById('sub-notes').value;
      if (!original || !date || !period) { errEl.textContent = 'Preencha os campos obrigatórios.'; return; }
      try {
        await window.aula.createSubstitution({
          school_id: _schoolId, original_teacher_id: original,
          substitute_teacher_id: substitute || null,
          date, weekday: parseInt(weekday), period: parseInt(period), subject, notes,
        });
        window.showToast('Substituição registrada.', 'success');
        document.getElementById('modal-nova-sub').style.display = 'none';
        await load(container);
      } catch (e) { errEl.textContent = e.message; }
    };

    const handleSaveAssign = async () => {
      const id      = document.getElementById('assign-sub-id').value;
      const teacher = document.getElementById('assign-teacher').value;
      if (!teacher) { window.showToast('Selecione um substituto.', 'warning'); return; }
      await window.aula.updateSubstitution(id, { substitute_teacher_id: teacher });
      window.showToast('Substituto definido.', 'success');
      document.getElementById('modal-assign-sub').style.display = 'none';
      await load(container);
    };

    // Usar delegação de eventos para performance e simplicidade
    container.addEventListener('click', async (e) => {
      const target = e.target;

      // Botões principais
      if (target.matches('#btn-nova-sub')) {
        document.getElementById('modal-nova-sub').style.display = 'flex';
      } else if (target.matches('#sub-modal-save')) {
        await handleSaveNewSub();
      } else if (target.matches('#assign-save')) {
        await handleSaveAssign();
      } else if (target.matches('#sub-clear-filter')) {
        document.getElementById('sub-filter-date').value = '';
        load(container);
      }

      // Fechar modais
      else if (target.matches('.modal-close, #sub-modal-cancel, .assign-close')) {
        target.closest('.modal-overlay').style.display = 'none';
      }

      // Ações nos cards
      else if (target.matches('.sub-delete-btn')) {
        if (!confirm('Remover esta substituição?')) return;
        await window.aula.deleteSubstitution(target.dataset.id);
        window.showToast('Substituição removida.', 'info');
        await load(container);
      } else if (target.matches('.sub-assign-btn')) {
        document.getElementById('assign-sub-id').value = target.dataset.id;
        document.getElementById('modal-assign-sub').style.display = 'flex';
      }
    });

    // Filtro por data
    document.getElementById('sub-filter-date').addEventListener('change', async (e) => {
      const date = e.target.value;
      if (!date) return; // Evita recarregar se o campo for limpo sem o botão
      const subs = await window.aula.getSubstitutions(_schoolId, date);
      const listEl = document.getElementById('sub-list');
      listEl.innerHTML = subs.length === 0
        ? `<div style="text-align:center;padding:40px;color:#6b7280">Nenhuma substituição para ${date}.</div>`
        : subs.map(s => renderSubCard(s)).join('');
    });
  }

  function renderSubCard(s) {
    return `
      <div class="sub-card" data-id="${s.id}" style="background:#fff;border-radius:10px;padding:16px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);border-left:4px solid ${STATUS_LABELS[s.status]?.color || '#6b7280'}">
        <div style="display:flex;justify-content:space-between">
          <div>
            ${statusBadge(s.status)}
            <span style="font-size:12px;color:#6b7280;margin-left:8px">${s.date}</span>
            <div style="font-size:14px;font-weight:600;margin-top:6px">${E(s.subject) || '—'}</div>
            <div style="font-size:13px;color:#374151;margin-top:2px">Ausente: <strong>${E(s.original_teacher_name)}</strong></div>
          </div>
        </div>
      </div>`;
  }

  return {
    async initialize(schoolId) { _schoolId = schoolId; },
    mount(container) { return load(container); },
  };
})();
