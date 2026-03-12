/**
 * Módulo: Cronograma
 *
 * Sistema de agendamento de recursos (salas, laboratórios, bibliotecas, etc).
 * Self-contained — pode ser extraído como repositório independente.
 * Usa window.DB (DataProvider) e window.AppContext para acesso a dados.
 *
 * Estrutura prevista para versão web independente:
 *   github.com/aula-app/cronograma
 */

window.ModuleCronograma = (() => {
  // ─── Estado interno ─────────────────────────────────────────────────────────
  let state = {
    resources: [],
    teachers: [],
    lessons: [],        // todas as aulas do schedule (todos os recursos)
    resourceLessons: [], // aulas filtradas pelo recurso selecionado
    selectedResourceId: null,
    defaultScheduleId: null,
    teacherAvailability: {}, // teacherId → [{weekday, period}]
  };

  const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const RESOURCE_TYPES = ['Sala', 'Laboratório', 'Biblioteca', 'Quadra', 'Auditório', 'Outro'];

  // ─── Ponto de entrada ────────────────────────────────────────────────────────
  async function mount(container) {
    container.innerHTML = `
      <div class="module-header">
        <div>
          <div class="module-title">📅 Cronograma</div>
          <div class="module-subtitle">Agendamento de recursos — ${escHtml(window.AppContext?.schoolName ?? '')}</div>
        </div>
        <div>
          <button class="btn btn-ghost btn-sm" id="btn-manage-resources">🏛️ Gerenciar Recursos</button>
        </div>
      </div>

      <div class="context-bar">
        <label>Recurso</label>
        <select id="resource-select"><option value="">— Selecione um recurso —</option></select>
      </div>

      <div id="schedule-content"></div>
    `;

    bindEvents(container);
    await loadResources(container);
  }

  function bindEvents(container) {
    container.querySelector('#resource-select').addEventListener('change', async e => {
      state.selectedResourceId = Number(e.target.value) || null;
      await loadLessons(container);
    });
    container.querySelector('#btn-manage-resources')?.addEventListener('click', () => {
      window.__dmInitialTab = 'resources';
      window._activateTab('dados');
    });
  }

  // ─── Carregamentos ──────────────────────────────────────────────────────────
  async function loadResources(container) {
    const schoolId = window.AppContext.schoolId;
    try {
      // Garante que existe um schedule padrão para agendamentos
      let schedules = await window.DB.getSchedules(schoolId);
      if (schedules.length === 0) {
        await window.DB.createSchedule({
          school_id: schoolId,
          name: 'Agendamentos',
          year: new Date().getFullYear(),
          semester: 1,
        });
        schedules = await window.DB.getSchedules(schoolId);
      }
      state.defaultScheduleId = schedules[0]?.id;

      [state.resources, state.teachers] = await Promise.all([
        window.DB.getResources(schoolId),
        window.DB.getTeachers(schoolId),
      ]);
      state.teachers = state.teachers.map(t => ({ ...t, id: t.person_id ?? t.id }));

      // Carrega disponibilidade de todos os professores
      await loadAllTeacherAvailability();
    } catch { state.resources = []; state.teachers = []; }

    const resourceSel = container.querySelector('#resource-select');
    resourceSel.innerHTML = '<option value="">— Selecione um recurso —</option>' +
      state.resources.map(r => `<option value="${r.id}">${escHtml(r.name)} (${r.type})</option>`).join('');

    if (state.selectedResourceId) {
      resourceSel.value = state.selectedResourceId;
    }
    await loadLessons(container);
  }

  // Carrega disponibilidade de todos os professores do estado atual
  async function loadAllTeacherAvailability() {
    const map = {};
    await Promise.all(state.teachers.map(async t => {
      try {
        map[t.id] = (await window.DB.getTeacherAvailability(t.id)) || [];
      } catch {
        map[t.id] = [];
      }
    }));
    state.teacherAvailability = map;
  }

  // Verifica se um professor tem disponibilidade configurada e se aceita o slot
  function isTeacherAvailable(teacherId, weekday, period) {
    const slots = state.teacherAvailability[teacherId] || [];
    if (slots.length === 0) return true; // sem restrição configurada
    return slots.some(s => s.weekday === weekday && s.period === period);
  }

  async function loadLessons(container) {
    if (!state.defaultScheduleId) {
      renderGrid(container);
      return;
    }
    try {
      // Carrega TODAS as aulas do schedule (necessário para detectar conflitos de professor)
      state.lessons = await window.DB.getLessons(state.defaultScheduleId);
      // Filtra pelo recurso selecionado para exibição na grade
      state.resourceLessons = state.selectedResourceId
        ? state.lessons.filter(l => l.resource_id === state.selectedResourceId)
        : [];
    } catch { state.lessons = []; state.resourceLessons = []; }
    renderGrid(container);
  }

  // ─── Grade de horários ──────────────────────────────────────────────────────
  function renderGrid(container) {
    const el = container.querySelector('#schedule-content');

    if (!state.selectedResourceId) {
      el.innerHTML = `
        <div class="empty-state">
          <div class="icon">📅</div>
          <p>Selecione um recurso para visualizar e gerenciar o agendamento.</p>
        </div>`;
      return;
    }

    const resource = state.resources.find(r => r.id === state.selectedResourceId);
    if (!resource) {
      el.innerHTML = '<div class="empty-state"><div class="icon">❌</div><p>Recurso não encontrado.</p></div>';
      return;
    }

    const maxPeriod = Math.max(6, ...state.resourceLessons.map(l => l.period || 0));

    const lessonMap = {};
    state.resourceLessons.forEach(l => { lessonMap[`${l.weekday}_${l.period}`] = l; });

    let html = `<div style="margin-bottom:16px">
      <div style="font-size:14px;color:var(--color-text-muted)">
        <strong>${escHtml(resource.name)}</strong> • ${resource.type}
        ${resource.capacity ? ` • Capacidade: ${resource.capacity} pessoas` : ''}
      </div>
      ${resource.description ? `<div style="font-size:12px;margin-top:4px;color:var(--color-text-muted)">${escHtml(resource.description)}</div>` : ''}
    </div>`;

    html += `<div class="schedule-grid"><table>
      <thead><tr>
        <th>Período</th>
        ${WEEKDAYS.map(d => `<th>${d}</th>`).join('')}
      </tr></thead>
      <tbody>`;

    for (let p = 1; p <= maxPeriod; p++) {
      html += `<tr><td>${p}º</td>`;
      for (let d = 1; d <= WEEKDAYS.length; d++) {
        const lesson = lessonMap[`${d}_${p}`];
        if (lesson) {
          html += `<td data-day="${d}" data-period="${p}" title="Clique para editar" style="cursor:pointer">
            <div class="lesson-cell">
              ${escHtml(lesson.subject)}
              ${lesson.teacher_name ? `<div class="teacher-name">${escHtml(lesson.teacher_name)}</div>` : ''}
            </div>
          </td>`;
        } else {
          html += `<td class="empty-cell" data-day="${d}" data-period="${p}" title="Clique para agendar" style="cursor:pointer"></td>`;
        }
      }
      html += '</tr>';
    }

    html += `</tbody></table></div>`;

    html += `<div style="margin-top:10px;display:flex;gap:8px;align-items:center">
      <button class="btn btn-ghost btn-sm" id="btn-add-period">+ Período</button>
      <button class="btn btn-ghost btn-sm" id="btn-print-schedule">🖨️ Imprimir</button>
      <span style="color:var(--color-text-muted);font-size:12px">${state.resourceLessons.length} agendamento(s)</span>
    </div>`;

    el.innerHTML = html;

    // Cliques nas células
    el.querySelectorAll('td[data-day]').forEach(cell => {
      cell.addEventListener('click', () => {
        if (window.AppContext.currentUserRole !== 'admin') {
          window.showToast('Apenas administradores podem editar o cronograma.', 'warning');
          return;
        }
        const day = Number(cell.dataset.day);
        const period = Number(cell.dataset.period);
        const existing = lessonMap[`${day}_${period}`];
        openLessonForm(day, period, existing, container);
      });
    });

    el.querySelector('#btn-add-period')?.addEventListener('click', () => {
      if (window.AppContext.currentUserRole !== 'admin') {
        window.showToast('Apenas administradores podem editar o cronograma.', 'warning');
        return;
      }
      const newPeriod = maxPeriod + 1;
      window.showToast(`Período ${newPeriod}º adicionado. Clique nas células para agendar.`, 'info');
      state.resourceLessons.push({ weekday: 0, period: newPeriod, subject: '', resource_id: state.selectedResourceId, _placeholder: true });
      renderGrid(container);
      state.resourceLessons = state.resourceLessons.filter(l => !l._placeholder);
    });

    el.querySelector('#btn-print-schedule')?.addEventListener('click', () => {
      printSchedule(resource, lessonMap, maxPeriod);
    });
  }

  // ─── Impressão / exportação ───────────────────────────────────────────────
  function printSchedule(resource, lessonMap, maxPeriod) {
    const schoolName = escHtml(window.AppContext?.schoolName ?? '');
    const resourceName = escHtml(resource.name);
    const resourceType = escHtml(resource.type);

    let tableRows = '';
    for (let p = 1; p <= maxPeriod; p++) {
      tableRows += `<tr><td class="period">${p}º</td>`;
      for (let d = 1; d <= WEEKDAYS.length; d++) {
        const lesson = lessonMap[`${d}_${p}`];
        if (lesson) {
          tableRows += `<td class="has-lesson">
            <strong>${escHtml(lesson.subject)}</strong>
            ${lesson.teacher_name ? `<br><small>${escHtml(lesson.teacher_name)}</small>` : ''}
            ${lesson.notes ? `<br><em class="notes">${escHtml(lesson.notes)}</em>` : ''}
          </td>`;
        } else {
          tableRows += `<td class="empty"></td>`;
        }
      }
      tableRows += '</tr>';
    }

    const printHtml = `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>Cronograma — ${resourceName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; padding: 20px; color: #000; }
    .header { margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 10px; }
    .header h1 { font-size: 16px; }
    .header p { font-size: 11px; color: #555; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #333; color: #fff; padding: 6px 8px; font-size: 10px; text-align: center; }
    td { border: 1px solid #ccc; padding: 5px 7px; vertical-align: top; min-height: 36px; }
    td.period { background: #f0f0f0; font-weight: bold; text-align: center; width: 48px; }
    td.has-lesson { background: #fff; }
    td.empty { background: #fafafa; }
    small { color: #555; font-size: 10px; }
    em.notes { color: #777; font-size: 9px; }
    .footer { margin-top: 12px; font-size: 10px; color: #777; text-align: right; }
    @media print { body { padding: 10px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Cronograma — ${resourceName} (${resourceType})</h1>
    <p>${schoolName} &nbsp;·&nbsp; Impresso em ${new Date().toLocaleDateString('pt-br')}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th>Per.</th>
        ${WEEKDAYS.map(d => `<th>${d}</th>`).join('')}
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">Gerado pelo Aula</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(printHtml);
    win.document.close();
  }

  // ─── Formulários ────────────────────────────────────────────────────────────
  function openLessonForm(day, period, existing, container) {
    const teacherOptions = state.teachers
      .map(t => `<option value="${t.id}" ${existing?.teacher_id === t.id ? 'selected' : ''}>${escHtml(t.name)}</option>`)
      .join('');

    window.openModal({
      title: existing ? 'Editar Agendamento' : `Agendar — ${WEEKDAYS[day - 1]}, ${period}º período`,
      bodyHtml: `
        <div class="form-row">
          <div class="form-group">
            <label>Componente Curricular *</label>
            <input type="text" id="f-subject" value="${escHtml(existing?.subject ?? '')}" placeholder="Ex: Matemática, Física">
          </div>
        </div>
        <div class="form-group">
          <label>Professor</label>
          <select id="f-teacher">
            <option value="">— Sem professor designado —</option>
            ${teacherOptions}
          </select>
          <div id="avail-warning" style="display:none;margin-top:6px;padding:8px 10px;border-radius:6px;
            background:var(--color-warning-bg,#fff8e1);border:1px solid var(--color-warning,#f59e0b);
            color:var(--color-warning-text,#92400e);font-size:12px;line-height:1.4">
            ⚠️ <strong>Fora da disponibilidade:</strong> este professor não tem disponibilidade configurada para este período.
            Você pode continuar, mas verifique com o professor.
          </div>
        </div>
        <div class="form-group">
          <label>Observações</label>
          <textarea id="f-notes" rows="2" placeholder="Ex: Experimental">${escHtml(existing?.notes ?? '')}</textarea>
        </div>
        ${existing ? `<div style="margin-top:8px">
          <button class="btn btn-danger btn-sm" id="btn-delete-lesson">🗑️ Remover agendamento</button>
        </div>` : ''}
      `,
      confirmLabel: existing ? 'Salvar' : 'Agendar',
      onConfirm: async (overlay, close) => {
        const subject = overlay.querySelector('#f-subject').value.trim();
        if (!subject) { window.showToast('Informe o componente curricular.', 'warning'); return; }

        const data = {
          schedule_id: state.defaultScheduleId,
          resource_id: state.selectedResourceId,
          weekday: day,
          period,
          subject,
          teacher_id: Number(overlay.querySelector('#f-teacher').value) || null,
          notes: overlay.querySelector('#f-notes').value.trim(),
        };

        try {
          existing
            ? await window.DB.updateLesson(existing.id, data)
            : await window.DB.createLesson(data);
          close();
          await loadLessons(container);
          window.showToast('Agendamento salvo.', 'success');
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });

    setTimeout(() => {
      // Aviso de disponibilidade ao selecionar professor
      const teacherSel = document.querySelector('#f-teacher');
      const availWarn  = document.querySelector('#avail-warning');
      const checkAvailability = () => {
        const tid = Number(teacherSel?.value) || null;
        if (!tid || !availWarn) return;
        const available = isTeacherAvailable(tid, day, period);
        availWarn.style.display = available ? 'none' : 'block';
      };
      teacherSel?.addEventListener('change', checkAvailability);
      checkAvailability(); // verifica ao abrir se já há professor selecionado

      document.querySelector('#btn-delete-lesson')?.addEventListener('click', async () => {
        if (await window.confirmDialog(`Remover agendamento de ${WEEKDAYS[day - 1]}, ${period}º período?`, { confirmLabel: 'Remover', title: 'Remover Agendamento' })) {
          try {
            await window.DB.deleteLesson(existing.id);
            document.querySelector('.modal-overlay')?.remove();
            await loadLessons(container);
            window.showToast('Agendamento removido.', 'success');
          } catch (e) { window.showToast(e.message, 'error'); }
        }
      });
    }, 100);
  }

  // ─── Gerenciador de Professores ──────────────────────────────────────────────
  async function openTeachersManager(container) {
    const teachers = state.teachers;

    window.openModal({
      title: '👨‍🏫 Professores',
      bodyHtml: `
        <div style="margin-bottom:16px">
          <button class="btn btn-primary btn-sm" id="btn-add-teacher">+ Novo Professor</button>
        </div>
        <div id="teachers-list">
          ${teachers.length === 0
            ? '<p style="color:var(--color-text-muted)">Nenhum professor cadastrado.</p>'
            : `<div class="table-wrap"><table>
                <thead><tr><th>Nome</th><th>Componentes Curriculares</th><th>E-mail</th><th></th></tr></thead>
                <tbody>
                  ${teachers.map(t => `
                    <tr>
                      <td><strong>${escHtml(t.name)}</strong></td>
                      <td>${escHtml(t.subjects || '—')}</td>
                      <td>${escHtml(t.email || '—')}</td>
                      <td style="display:flex;gap:4px">
                        <button class="btn btn-ghost btn-sm" data-avail="${t.id}" title="Disponibilidade">🗓️</button>
                        <button class="btn btn-ghost btn-sm" data-edit="${t.id}">✏️</button>
                        <button class="btn btn-danger btn-sm" data-del="${t.id}">🗑️</button>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table></div>`}
        </div>
      `,
      confirmLabel: 'Fechar',
      confirmClass: 'btn-ghost',
      onConfirm: (_, close) => close(),
    });

    setTimeout(() => {
      document.querySelector('#btn-add-teacher')?.addEventListener('click', () => openTeacherForm(null, container));
      document.querySelectorAll('[data-avail]').forEach(btn => {
        btn.addEventListener('click', () => {
          const t = teachers.find(x => x.id === Number(btn.dataset.avail));
          if (t) openTeacherAvailability(t);
        });
      });
      document.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const t = teachers.find(x => x.id === Number(btn.dataset.edit));
          openTeacherForm(t, container);
        });
      });
      document.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const t = teachers.find(x => x.id === Number(btn.dataset.del));
          if (await window.confirmDialog(`Excluir o professor "${t.name}"?`)) {
            try {
              await window.DB.deleteTeacher(t.id);
              document.querySelector('.modal-overlay')?.remove();
              state.teachers = state.teachers.filter(x => x.id !== t.id);
              window.showToast('Professor excluído.', 'success');
            } catch (e) { window.showToast(e.message, 'error'); }
          }
        });
      });
    }, 100);
  }

  function openTeacherForm(existing, container) {
    document.querySelector('.modal-overlay')?.remove();
    window.openModal({
      title: existing ? 'Editar Professor' : 'Novo Professor',
      bodyHtml: `
        <div class="form-group">
          <label>Nome *</label>
          <input type="text" id="f-tname" value="${escHtml(existing?.name ?? '')}" placeholder="Nome completo">
        </div>
        <div class="form-group">
          <label>Componentes Curriculares</label>
          <input type="text" id="f-subjects" value="${escHtml(existing?.subjects ?? '')}" placeholder="Ex: Matemática, Física">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>E-mail</label>
            <input type="email" id="f-email" value="${escHtml(existing?.email ?? '')}" placeholder="professor@escola.edu.br">
          </div>
          <div class="form-group">
            <label>Matrícula</label>
            <input type="text" id="f-reg" value="${escHtml(existing?.registration ?? '')}" placeholder="Matrícula">
          </div>
        </div>
      `,
      onConfirm: async (overlay, close) => {
        const name = overlay.querySelector('#f-tname').value.trim();
        if (!name) { window.showToast('Informe o nome do professor.', 'warning'); return; }
        const data = {
          school_id:    window.AppContext.schoolId,
          name,
          subjects:     overlay.querySelector('#f-subjects').value.trim(),
          email:        overlay.querySelector('#f-email').value.trim(),
          registration: overlay.querySelector('#f-reg').value.trim(),
        };
        try {
          existing
            ? await window.DB.updateTeacher(existing.id, data)
            : await window.DB.createTeacher(data);
          close();
          state.teachers = (await window.DB.getTeachers(window.AppContext.schoolId).catch(() => []))
            .map(t => ({ ...t, id: t.person_id ?? t.id }));
          window.showToast('Professor salvo.', 'success');
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  // ─── Disponibilidade do Professor ───────────────────────────────────────────
  async function openTeacherAvailability(teacher) {
    const MAX_PERIODS = 10;
    let currentSlots = [];
    try {
      currentSlots = (await window.DB.getTeacherAvailability(teacher.id)) || [];
    } catch { /* segue com vazio */ }

    const isChecked = (wd, p) => currentSlots.some(s => s.weekday === wd && s.period === p);

    const gridHtml = `
      <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:12px">
        Marque os períodos em que o professor está disponível para ser agendado.<br>
        Se <strong>nenhum período</strong> for marcado, o professor será considerado <strong>sem restrição</strong>.
      </p>
      <div style="overflow-x:auto">
        <table class="avail-grid" style="border-collapse:collapse;min-width:100%">
          <thead>
            <tr>
              <th style="padding:4px 8px;text-align:center;font-size:12px">Período</th>
              ${WEEKDAYS.map(d => `<th style="padding:4px 8px;text-align:center;font-size:12px;white-space:nowrap">${d}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${Array.from({ length: MAX_PERIODS }, (_, i) => i + 1).map(p => `
              <tr>
                <td style="padding:4px 8px;text-align:center;font-size:12px;font-weight:600;color:var(--color-text-muted)">${p}º</td>
                ${WEEKDAYS.map((_, wi) => {
                  const wd = wi + 1;
                  return `<td style="padding:4px 8px;text-align:center">
                    <input type="checkbox" data-wd="${wd}" data-p="${p}" ${isChecked(wd, p) ? 'checked' : ''}
                      style="width:16px;height:16px;cursor:pointer;accent-color:var(--color-primary)">
                  </td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="btn-avail-all">Marcar todos</button>
        <button class="btn btn-ghost btn-sm" id="btn-avail-none">Desmarcar todos</button>
      </div>
    `;

    document.querySelector('.modal-overlay')?.remove();
    window.openModal({
      title: `🗓️ Disponibilidade — ${escHtml(teacher.name)}`,
      bodyHtml: gridHtml,
      confirmLabel: 'Salvar',
      onConfirm: async (overlay, close) => {
        const slots = [];
        overlay.querySelectorAll('input[data-wd]').forEach(cb => {
          if (cb.checked) {
            slots.push({ weekday: Number(cb.dataset.wd), period: Number(cb.dataset.p) });
          }
        });
        try {
          await window.DB.setTeacherAvailability(teacher.id, slots);
          // Atualiza cache local
          state.teacherAvailability[teacher.id] = slots;
          close();
          window.showToast('Disponibilidade salva.', 'success');
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });

    setTimeout(() => {
      document.querySelector('#btn-avail-all')?.addEventListener('click', () => {
        document.querySelectorAll('input[data-wd]').forEach(cb => cb.checked = true);
      });
      document.querySelector('#btn-avail-none')?.addEventListener('click', () => {
        document.querySelectorAll('input[data-wd]').forEach(cb => cb.checked = false);
      });
    }, 80);
  }

  // ─── Gerenciador de Recursos ────────────────────────────────────────────────
  async function openResourcesManager(container) {
    const resources = state.resources;

    window.openModal({
      title: '🏛️ Recursos',
      bodyHtml: `
        <div style="margin-bottom:16px">
          <button class="btn btn-primary btn-sm" id="btn-add-resource">+ Novo Recurso</button>
        </div>
        <div id="resources-list">
          ${resources.length === 0
            ? '<p style="color:var(--color-text-muted)">Nenhum recurso cadastrado.</p>'
            : `<div class="table-wrap"><table>
                <thead><tr><th>Nome</th><th>Tipo</th><th>Capacidade</th><th>Descrição</th><th></th></tr></thead>
                <tbody>
                  ${resources.map(r => `
                    <tr>
                      <td><strong>${escHtml(r.name)}</strong></td>
                      <td>${escHtml(r.type)}</td>
                      <td style="text-align:center">${r.capacity || '—'}</td>
                      <td style="font-size:12px;color:var(--color-text-muted)">${escHtml(r.description || '')}</td>
                      <td style="display:flex;gap:4px;white-space:nowrap">
                        <button class="btn btn-ghost btn-sm" data-edit="${r.id}">✏️</button>
                        <button class="btn btn-danger btn-sm" data-del="${r.id}">🗑️</button>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table></div>`}
        </div>
      `,
      confirmLabel: 'Fechar',
      confirmClass: 'btn-ghost',
      onConfirm: (_, close) => close(),
    });

    setTimeout(() => {
      document.querySelector('#btn-add-resource')?.addEventListener('click', () => openResourceForm(null, container));
      document.querySelectorAll('[data-edit]').forEach(btn => {
        btn.addEventListener('click', () => {
          const resource = resources.find(r => r.id === Number(btn.dataset.edit));
          openResourceForm(resource, container);
        });
      });
      document.querySelectorAll('[data-del]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const resource = resources.find(r => r.id === Number(btn.dataset.del));
          if (await window.confirmDialog(`Excluir o recurso "${resource.name}" e todos seus agendamentos?`)) {
            try {
              await window.DB.deleteResource(resource.id);
              document.querySelector('.modal-overlay')?.remove();
              await loadResources(container);
              window.showToast('Recurso excluído.', 'success');
            } catch (e) { window.showToast(e.message, 'error'); }
          }
        });
      });
    }, 100);
  }

  function openResourceForm(existing, container) {
    document.querySelector('.modal-overlay')?.remove();
    window.openModal({
      title: existing ? 'Editar Recurso' : 'Novo Recurso',
      bodyHtml: `
        <div class="form-group">
          <label>Nome *</label>
          <input type="text" id="f-name" value="${escHtml(existing?.name ?? '')}" placeholder="Ex: Sala 101, Laboratório de Informática">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo *</label>
            <select id="f-type">
              <option value="">— Selecione —</option>
              ${RESOURCE_TYPES.map(t => `<option value="${t}" ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Capacidade</label>
            <input type="number" id="f-capacity" value="${existing?.capacity ?? ''}" min="1" placeholder="Quantas pessoas">
          </div>
        </div>
        <div class="form-group">
          <label>Descrição</label>
          <textarea id="f-description" rows="2" placeholder="Ex: Equipado com projetor e quadro branco">${escHtml(existing?.description ?? '')}</textarea>
        </div>
      `,
      onConfirm: async (overlay, close) => {
        const name = overlay.querySelector('#f-name').value.trim();
        const type = overlay.querySelector('#f-type').value.trim();
        if (!name || !type) { window.showToast('Informe nome e tipo.', 'warning'); return; }
        const data = {
          name,
          type,
          capacity: Number(overlay.querySelector('#f-capacity').value) || null,
          description: overlay.querySelector('#f-description').value.trim(),
        };
        try {
          existing
            ? await window.DB.updateResource(existing.id, data)
            : await window.DB.createResource({ ...data, school_id: window.AppContext.schoolId });
          close();
          await loadResources(container);
          window.showToast('Recurso salvo.', 'success');
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  // ─── Gestão de Dados da Escola ──────────────────────────────────────────────
  async function openDataManagement(container, initialTab = null) {
    const schoolId = window.AppContext.schoolId;

    // Carrega dados iniciais
    let shifts = [], classes = [], curricula = [], resources = [], teachers = [], tutorRoles = [], lessonTypes = [];
    try {
      [shifts, classes, curricula, resources, teachers, tutorRoles, lessonTypes] = await Promise.all([
        window.DB.getShifts(schoolId),
        window.DB.getClasses(schoolId),
        window.DB.getCurricula(schoolId),
        window.DB.getResources(schoolId),
        window.DB.getTeachers(schoolId).catch(() => []),
        window.DB.getTutorRoles(schoolId).catch(() => []),
        window.DB.getLessonTypes(schoolId).catch(() => []),
      ]);
      // Normaliza: getTeachers retorna person_id; garante que t.id sempre existe
      teachers = teachers.map(t => ({ ...t, id: t.person_id ?? t.id }));
    } catch (e) {
      window.showToast('Erro ao carregar dados: ' + e.message, 'error');
      return;
    }

    // Renderiza inline no container (aba dedicada)
    container.innerHTML = `
      <div class="module-header">
        <div>
          <div class="module-title">📊 Gestão de Dados</div>
          <div class="module-subtitle">Turnos · Turmas · Componentes · Horários · Grades · Recursos — ${escHtml(window.AppContext?.schoolName ?? '')}</div>
        </div>
      </div>
      <div class="data-management">
        <div class="dm-tabs">
          <button class="dm-tab-btn active" data-dm-tab="shifts">📅 Turnos</button>
          <button class="dm-tab-btn" data-dm-tab="classes">👥 Turmas</button>
          <button class="dm-tab-btn" data-dm-tab="curricula">📖 Componentes</button>
          <button class="dm-tab-btn" data-dm-tab="timeslots">⏰ Horários</button>
          <button class="dm-tab-btn" data-dm-tab="grades">📝 Grades</button>
          <button class="dm-tab-btn" data-dm-tab="lessontypes">⏰ Tipos de Aula</button>
          <button class="dm-tab-btn" data-dm-tab="resources">🏛️ Recursos</button>
          <button class="dm-tab-btn" data-dm-tab="tutorroles">🏷️ Papéis</button>
          <button class="dm-tab-btn" data-dm-tab="teachers">👨‍🏫 Professores</button>
        </div>

        <div id="tab-shifts" class="dm-tab-content active">
          <div style="margin-bottom:12px;">
            <button class="btn btn-primary btn-sm" id="btn-add-shift">+ Novo Turno</button>
          </div>
          <div id="shifts-list"></div>
        </div>

        <div id="tab-classes" class="dm-tab-content">
          <div style="margin-bottom:12px;">
            <button class="btn btn-primary btn-sm" id="btn-add-class">+ Nova Turma</button>
          </div>
          <div id="classes-list"></div>
        </div>

        <div id="tab-curricula" class="dm-tab-content">
          <div style="margin-bottom:12px;">
            <button class="btn btn-primary btn-sm" id="btn-add-curricula">+ Novo Componente</button>
          </div>
          <div id="curricula-list"></div>
        </div>

        <div id="tab-timeslots" class="dm-tab-content">
          <div style="margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:6px">
              <label>Selecione um turno:</label>
              <select id="timeslot-shift-select" style="padding:4px">
                <option value="">— Selecione —</option>
              </select>
            </div>
            <button class="btn btn-ghost btn-sm" id="btn-go-teacher-avail" title="Configurar quando cada professor está disponível">🗓️ Disponibilidade dos Professores</button>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-add-timeslot">+ Nova Aula</button>
          <div id="timeslots-list" style="margin-top:12px;"></div>
        </div>

        <div id="tab-grades" class="dm-tab-content">
          <div style="margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:6px">
              <label>Selecione uma turma:</label>
              <select id="grade-class-select" style="padding:4px">
                <option value="">— Selecione —</option>
              </select>
            </div>
            <button class="btn btn-ghost btn-sm" id="btn-grades-go-avail" title="Ver/editar disponibilidade semanal dos professores">🗓️ Disponibilidade dos Professores</button>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-add-grade" disabled>+ Adicionar Componente</button>
          <div id="grades-list" style="margin-top:12px;"></div>
          <div id="tutors-section" style="display:none;margin-top:20px;border-top:1px solid var(--color-border);padding-top:14px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <strong>🧑‍🏫 Tutores / Orientadores da Turma</strong>
              <button class="btn btn-primary btn-sm" id="btn-add-tutor">+ Atribuir</button>
            </div>
            <div id="tutors-list"></div>
          </div>
        </div>

        <div id="tab-resources" class="dm-tab-content">
          <div style="margin-bottom:12px;">
            <button class="btn btn-primary btn-sm" id="btn-add-resource-dm">+ Novo Recurso</button>
          </div>
          <div id="dm-resources-list"></div>
        </div>

        <div id="tab-lessontypes" class="dm-tab-content">
          <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
            <button class="btn btn-primary btn-sm" id="btn-add-lessontype">+ Novo Tipo</button>
            <span style="font-size:12px;color:var(--color-text-muted)">
              Defina os tipos de aula da sua instituição. A principal característica é se a aula é
              <strong>síncrona</strong> (professor e aluno no mesmo horário) ou
              <strong>assíncrona</strong> (professor lança, aluno acessa depois).
            </span>
          </div>
          <div id="lessontypes-list"></div>
        </div>

        <div id="tab-tutorroles" class="dm-tab-content">
          <div style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
            <button class="btn btn-primary btn-sm" id="btn-add-tutorrole">+ Novo Papel</button>
            <span style="font-size:12px;color:var(--color-text-muted)">Papéis usados nos vínculos de tutores/orientadores com turmas. A nomenclatura é livre por escola.</span>
          </div>
          <div id="tutorroles-list"></div>
        </div>

        <div id="tab-teachers" class="dm-tab-content">
          <div style="margin-bottom:8px;font-size:12px;color:var(--color-text-muted)">
            Gerencie a disponibilidade semanal de cada professor. Se nenhum período estiver marcado, o professor é tratado como <strong>sem restrição</strong>.
          </div>
          <div id="dm-teachers-list"></div>
        </div>
      </div>
    `;

    // Renderiza listas iniciais
    renderShiftsList(shifts);
    renderClassesList(classes, shifts);
    renderCurriculaList(curricula);
    renderDmResourcesList(resources, container, schoolId);
    renderTutorRolesList(tutorRoles, container, schoolId);
    renderLessonTypesList(lessonTypes, container, schoolId);
    renderDmTeachersList(teachers, container);
    populateSelectsInModal(shifts, classes);

    // Tabs switching — usa .dm-tab-btn para não conflitar com as abas do app
    const switchDmTab = (tabKey) => {
      container.querySelectorAll('.dm-tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.dm-tab-content').forEach(c => c.classList.remove('active'));
      const btn = container.querySelector(`[data-dm-tab="${tabKey}"]`);
      const panel = container.querySelector(`#tab-${tabKey}`);
      if (btn) btn.classList.add('active');
      if (panel) panel.classList.add('active');
    };

    container.querySelectorAll('.dm-tab-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        switchDmTab(btn.dataset.dmTab);
        // Lazy-load de disponibilidade na primeira abertura da aba Professores
        if (btn.dataset.dmTab === 'teachers' && teachers.length &&
            !Object.keys(state.teacherAvailability).length) {
          const map = {};
          await Promise.all(teachers.map(async t => {
            try { map[t.id] = (await window.DB.getTeacherAvailability(t.id)) || []; }
            catch { map[t.id] = []; }
          }));
          state.teacherAvailability = map;
          renderDmTeachersList(teachers, container);
        }
      });
    });

      // Shift buttons
      document.querySelector('#btn-add-shift')?.addEventListener('click', () => openShiftForm(null, schoolId, () => openDataManagement(container)));
      document.querySelectorAll('[data-edit-shift]').forEach(btn => {
        btn.addEventListener('click', () => {
          const shift = shifts.find(s => s.id === Number(btn.dataset.editShift));
          openShiftForm(shift, schoolId, () => openDataManagement(container));
        });
      });
      document.querySelectorAll('[data-del-shift]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const shift = shifts.find(s => s.id === Number(btn.dataset.delShift));
          if (await window.confirmDialog(`Excluir turno "${shift.name}"?`)) {
            try {
              await window.DB.deleteShift(shift.id);
              shifts = shifts.filter(s => s.id !== shift.id);
              renderShiftsList(shifts);
              populateSelectsInModal(shifts, classes);
              window.showToast('Turno excluído.', 'success');
            } catch (e) { window.showToast(e.message, 'error'); }
          }
        });
      });

      // Class buttons
      document.querySelector('#btn-add-class')?.addEventListener('click', () => openClassForm(null, schoolId, shifts, classes, () => openDataManagement(container)));
      document.querySelectorAll('[data-edit-class]').forEach(btn => {
        btn.addEventListener('click', () => {
          const cls = classes.find(c => c.id === Number(btn.dataset.editClass));
          openClassForm(cls, schoolId, shifts, classes, () => openDataManagement(container));
        });
      });
      document.querySelectorAll('[data-del-class]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const cls = classes.find(c => c.id === Number(btn.dataset.delClass));
          if (await window.confirmDialog(`Excluir turma "${cls.name}"?`)) {
            try {
              await window.DB.deleteClass(cls.id);
              classes = classes.filter(c => c.id !== cls.id);
              renderClassesList(classes, shifts);
              populateSelectsInModal(shifts, classes);
              window.showToast('Turma excluída.', 'success');
            } catch (e) { window.showToast(e.message, 'error'); }
          }
        });
      });

      // Curricula buttons
      document.querySelector('#btn-add-curricula')?.addEventListener('click', () => openCurriculaForm(null, schoolId, curricula, () => openDataManagement(container)));
      document.querySelectorAll('[data-edit-curricula]').forEach(btn => {
        btn.addEventListener('click', () => {
          const curr = curricula.find(c => c.id === Number(btn.dataset.editCurricula));
          openCurriculaForm(curr, schoolId, curricula, () => openDataManagement(container));
        });
      });
      document.querySelectorAll('[data-del-curricula]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const curr = curricula.find(c => c.id === Number(btn.dataset.delCurricula));
          if (await window.confirmDialog(`Excluir componente "${curr.name}"?`)) {
            try {
              await window.DB.deleteCurricula(curr.id);
              curricula = curricula.filter(c => c.id !== curr.id);
              renderCurriculaList(curricula);
              window.showToast('Componente excluído.', 'success');
            } catch (e) { window.showToast(e.message, 'error'); }
          }
        });
      });

      // TimeSlot handlers
      document.querySelector('#timeslot-shift-select')?.addEventListener('change', async e => {
        const shiftId = Number(e.target.value);
        if (shiftId) {
          try {
            const slots = await window.DB.getTimeSlots(shiftId);
            renderTimeSlotsList(slots, shifts, shiftId, () => openDataManagement(container));
          } catch { renderTimeSlotsList([], shifts, shiftId, () => openDataManagement(container)); }
        } else {
          document.querySelector('#timeslots-list').innerHTML = '';
        }
      });

      document.querySelector('#btn-add-timeslot')?.addEventListener('click', () => {
        const shiftId = Number(document.querySelector('#timeslot-shift-select').value);
        if (!shiftId) {
          window.showToast('Selecione um turno primeiro.', 'warning');
          return;
        }
        const shift = shifts.find(s => s.id === shiftId);
        openTimeSlotForm(null, shift, shiftId, () => openDataManagement(container));
      });

      // Atalho: Disponibilidade dos Professores (a partir da aba Horários)
      document.querySelector('#btn-go-teacher-avail')?.addEventListener('click', async () => {
        if (teachers.length && !Object.keys(state.teacherAvailability).length) {
          const map = {};
          await Promise.all(teachers.map(async t => {
            try { map[t.id] = (await window.DB.getTeacherAvailability(t.id)) || []; }
            catch { map[t.id] = []; }
          }));
          state.teacherAvailability = map;
          renderDmTeachersList(teachers, container);
        }
        switchDmTab('teachers');
      });

      // Atalho: Disponibilidade dos Professores (a partir da aba Grades)
      document.querySelector('#btn-grades-go-avail')?.addEventListener('click', async () => {
        if (teachers.length && !Object.keys(state.teacherAvailability).length) {
          const map = {};
          await Promise.all(teachers.map(async t => {
            try { map[t.id] = (await window.DB.getTeacherAvailability(t.id)) || []; }
            catch { map[t.id] = []; }
          }));
          state.teacherAvailability = map;
          renderDmTeachersList(teachers, container);
        }
        switchDmTab('teachers');
      });

      // Grade handlers
      document.querySelector('#grade-class-select')?.addEventListener('change', async e => {
        const classId = Number(e.target.value);
        document.querySelector('#btn-add-grade').disabled = !classId;
        if (classId) {
          try {
            const [gradeItems, ctcItems, tutorItems] = await Promise.all([
              window.DB.getClassCurricula(classId),
              window.DB.getClassTeacherCurricula(classId).catch(() => []),
              window.DB.getClassTutors(classId).catch(() => []),
            ]);
            renderGradesList(gradeItems, classes, classId, curricula, teachers, ctcItems, lessonTypes);
            renderTutorsList(tutorItems, classId, teachers, tutorRoles);
            document.querySelector('#tutors-section').style.display = '';
            document.querySelector('#btn-add-tutor').__classId = classId;
          } catch { renderGradesList([], classes, classId, curricula, teachers, [], lessonTypes); }
        } else {
          document.querySelector('#grades-list').innerHTML = '';
          document.querySelector('#tutors-section').style.display = 'none';
        }
      });

      document.querySelector('#btn-add-grade')?.addEventListener('click', () => {
        const classId = Number(document.querySelector('#grade-class-select').value);
        if (!classId) {
          window.showToast('Selecione uma turma primeiro.', 'warning');
          return;
        }
        openGradeForm(null, classId, curricula, teachers, lessonTypes, async () => {
          const [gi, ci] = await Promise.all([
            window.DB.getClassCurricula(classId).catch(() => []),
            window.DB.getClassTeacherCurricula(classId).catch(() => []),
          ]);
          renderGradesList(gi, classes, classId, curricula, teachers, ci, lessonTypes);
        });
      });

      document.querySelector('#btn-add-tutor')?.addEventListener('click', function() {
        const classId = this.__classId;
        if (!classId) return;
        openAssignTutorModal(classId, null, teachers, tutorRoles, async () => {
          const ti = await window.DB.getClassTutors(classId).catch(() => []);
          renderTutorsList(ti, classId, teachers, tutorRoles);
        });
      });

      // Resources handlers
      container.querySelector('#btn-add-resource-dm')?.addEventListener('click', () =>
        openResourceFormDm(null, container, schoolId, resources)
      );

      // TutorRoles handlers
      container.querySelector('#btn-add-tutorrole')?.addEventListener('click', () =>
        openTutorRoleForm(null, container, schoolId, tutorRoles)
      );

      // LessonTypes handlers
      container.querySelector('#btn-add-lessontype')?.addEventListener('click', () =>
        openLessonTypeForm(null, container, schoolId, lessonTypes)
      );

      // Disponibilidade: carrega ao clicar na aba Professores (caso não tenha sido carregada via mount)
      container.querySelector('[data-dm-tab="teachers"]')?.addEventListener('click', async () => {
        if (!Object.keys(state.teacherAvailability).length && teachers.length) {
          const map = {};
          await Promise.all(teachers.map(async t => {
            try { map[t.id] = (await window.DB.getTeacherAvailability(t.id)) || []; }
            catch { map[t.id] = []; }
          }));
          state.teacherAvailability = map;
        }
        renderDmTeachersList(teachers, container);
      });

      // Auto-seleciona aba inicial (ex: botão 'Gerenciar Recursos' do cronograma)
      if (initialTab) {
        const target = container.querySelector(`.dm-tab-btn[data-dm-tab="${initialTab}"]`);
        if (target) target.click();
      }
  }

  function renderShiftsList(shifts) {
    const html = shifts.length === 0
      ? '<p style="color:var(--color-text-muted)">Nenhum turno cadastrado.</p>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Nome</th><th></th></tr></thead>
          <tbody>${shifts.map(s => `
            <tr>
              <td><strong>${escHtml(s.name)}</strong></td>
              <td style="display:flex;gap:4px;white-space:nowrap">
                <button class="btn btn-ghost btn-sm" data-edit-shift="${s.id}">✏️</button>
                <button class="btn btn-danger btn-sm" data-del-shift="${s.id}">🗑️</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
    document.querySelector('#shifts-list').innerHTML = html;
  }

  function renderClassesList(classes, shifts) {
    const html = classes.length === 0
      ? '<p style="color:var(--color-text-muted)">Nenhuma turma cadastrada.</p>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Nome</th><th>Turno</th><th>Ano</th><th></th></tr></thead>
          <tbody>${classes.map(c => {
            const shift = shifts.find(s => s.id === c.shift_id);
            return `<tr>
              <td><strong>${escHtml(c.name)}</strong></td>
              <td>${shift ? escHtml(shift.name) : '—'}</td>
              <td>${c.year || '—'}</td>
              <td style="display:flex;gap:4px;white-space:nowrap">
                <button class="btn btn-ghost btn-sm" data-edit-class="${c.id}">✏️</button>
                <button class="btn btn-danger btn-sm" data-del-class="${c.id}">🗑️</button>
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table></div>`;
    document.querySelector('#classes-list').innerHTML = html;
  }

  function renderCurriculaList(curricula) {
    const html = curricula.length === 0
      ? '<p style="color:var(--color-text-muted)">Nenhum componente cadastrado.</p>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Nome</th><th>Código</th><th>Descrição</th><th></th></tr></thead>
          <tbody>${curricula.map(c => `
            <tr>
              <td><strong>${escHtml(c.name)}</strong></td>
              <td>${escHtml(c.code || '—')}</td>
              <td style="font-size:12px;color:var(--color-text-muted)">${escHtml(c.description || '')}</td>
              <td style="display:flex;gap:4px;white-space:nowrap">
                <button class="btn btn-ghost btn-sm" data-edit-curricula="${c.id}">✏️</button>
                <button class="btn btn-danger btn-sm" data-del-curricula="${c.id}">🗑️</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
    document.querySelector('#curricula-list').innerHTML = html;
  }

  function renderDmResourcesList(resources, container, schoolId) {
    const BADGE = { Sala: '#6b7280', Laboratório: '#7c3aed', Biblioteca: '#0369a1', Quadra: '#15803d', Auditório: '#b45309', Outro: '#9f1239' };
    const html = resources.length === 0
      ? '<p style="color:var(--color-text-muted)">Nenhum recurso cadastrado. Clique em <strong>+ Novo Recurso</strong> para começar.</p>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Nome</th><th>Tipo</th><th>Capacidade</th><th>Descrição</th><th></th></tr></thead>
          <tbody>${resources.map(r => `
            <tr>
              <td><strong>${escHtml(r.name)}</strong></td>
              <td><span style="background:${BADGE[r.type]||'#6b7280'};color:#fff;padding:2px 8px;border-radius:12px;font-size:11px">${escHtml(r.type)}</span></td>
              <td style="text-align:center">${r.capacity ? r.capacity + ' pessoas' : '—'}</td>
              <td style="font-size:12px;color:var(--color-text-muted)">${escHtml(r.description || '')}</td>
              <td style="display:flex;gap:4px;white-space:nowrap">
                <button class="btn btn-ghost btn-sm" data-edit-res="${r.id}">✏️</button>
                <button class="btn btn-danger btn-sm" data-del-res="${r.id}">🗑️</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
    const el = container.querySelector('#dm-resources-list');
    if (el) el.innerHTML = html;

    // rebind buttons após render
    container.querySelectorAll('[data-edit-res]').forEach(btn => {
      btn.addEventListener('click', () => {
        const res = resources.find(r => r.id === Number(btn.dataset.editRes));
        openResourceFormDm(res, container, schoolId, resources, (updated) => {
          Object.assign(resources.find(r => r.id === updated.id) || {}, updated);
        });
      });
    });
    container.querySelectorAll('[data-del-res]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const res = resources.find(r => r.id === Number(btn.dataset.delRes));
        if (!res) return;
        if (await window.confirmDialog(`Excluir o recurso "${res.name}" e todos os seus agendamentos?`)) {
          try {
            await window.DB.deleteResource(res.id);
            resources.splice(resources.indexOf(res), 1);
            renderDmResourcesList(resources, container, schoolId);
            // Atualiza a lista do select no cronograma (se estiver montado)
            const cronContainer = document.getElementById('app-content');
            if (state.resources.length) {
              state.resources = state.resources.filter(r => r.id !== res.id);
              const sel = cronContainer.querySelector('#resource-select');
              if (sel) sel.innerHTML = '<option value="">— Selecione um recurso —</option>' +
                state.resources.map(r => `<option value="${r.id}">${escHtml(r.name)} (${r.type})</option>`).join('');
            }
            window.showToast('Recurso excluído.', 'success');
          } catch (e) { window.showToast(e.message, 'error'); }
        }
      });
    });
  }

  function openResourceFormDm(existing, container, schoolId, resourcesArr, onUpdated) {
    window.openModal({
      title: existing ? '✏️ Editar Recurso' : '🏛️ Novo Recurso',
      bodyHtml: `
        <div class="form-group">
          <label>Nome *</label>
          <input type="text" id="f-res-name" value="${escHtml(existing?.name ?? '')}" placeholder="Ex: Biblioteca Central, Lab. de Informática">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo *</label>
            <select id="f-res-type">
              <option value="">— Selecione —</option>
              ${RESOURCE_TYPES.map(t => `<option value="${t}" ${existing?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Capacidade</label>
            <input type="number" id="f-res-capacity" value="${existing?.capacity ?? ''}" min="1" placeholder="Nº de pessoas">
          </div>
        </div>
        <div class="form-group">
          <label>Descrição</label>
          <textarea id="f-res-desc" rows="2" placeholder="Ex: Equipado com projetor e quadro branco">${escHtml(existing?.description ?? '')}</textarea>
        </div>
      `,
      onConfirm: async (overlay, close) => {
        const name = overlay.querySelector('#f-res-name').value.trim();
        const type = overlay.querySelector('#f-res-type').value.trim();
        if (!name || !type) { window.showToast('Informe nome e tipo.', 'warning'); return; }
        const data = {
          name, type,
          capacity: Number(overlay.querySelector('#f-res-capacity').value) || null,
          description: overlay.querySelector('#f-res-desc').value.trim(),
        };
        try {
          if (existing) {
            await window.DB.updateResource(existing.id, data);
            if (resourcesArr) {
              const idx = resourcesArr.findIndex(r => r.id === existing.id);
              if (idx !== -1) resourcesArr[idx] = { ...existing, ...data };
              renderDmResourcesList(resourcesArr, container, schoolId);
            }
          } else {
            const result = await window.DB.createResource({ ...data, school_id: schoolId });
            if (resourcesArr) {
              resourcesArr.push({ id: result.id, school_id: schoolId, ...data });
              renderDmResourcesList(resourcesArr, container, schoolId);
            }
          }
          close();
          window.showToast('Recurso salvo.', 'success');
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  function renderTimeSlotsList(slots, shifts, shiftId, onSaved) {
    const MOD_LABEL = { presencial: '🏢 Presencial', ead: '📺 EAD', online: '🌐 Online' };
    const MOD_COLOR = { presencial: 'var(--color-primary)', ead: '#7c3aed', online: '#0369a1' };
    const html = slots.length === 0
      ? '<p style="color:var(--color-text-muted)">Nenhum horário cadastrado.</p>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Período</th><th>Início</th><th>Fim</th><th>Modalidade</th><th></th></tr></thead>
          <tbody>${slots.map(ts => `
            <tr>
              <td><strong>${ts.period}º</strong></td>
              <td>${escHtml(ts.start_time)}</td>
              <td>${escHtml(ts.end_time)}</td>
              <td><span style="font-size:11px;background:${MOD_COLOR[ts.lesson_type]||'#6b7280'};color:#fff;padding:2px 7px;border-radius:10px">${MOD_LABEL[ts.lesson_type]||ts.lesson_type}</span></td>
              <td style="display:flex;gap:4px;white-space:nowrap">
                <button class="btn btn-ghost btn-sm" data-edit-timeslot="${ts.id}">✏️</button>
                <button class="btn btn-danger btn-sm" data-del-timeslot="${ts.id}">🗑️</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>`;
    document.querySelector('#timeslots-list').innerHTML = html;

    // Attach timeslot handlers
    setTimeout(() => {
      document.querySelectorAll('[data-edit-timeslot]').forEach(btn => {
        btn.addEventListener('click', () => {
          const ts = slots.find(t => t.id === Number(btn.dataset.editTimeslot));
          const shift = shifts.find(s => s.id === shiftId);
          openTimeSlotForm(ts, shift, shiftId, onSaved);
        });
      });
      document.querySelectorAll('[data-del-timeslot]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ts = slots.find(t => t.id === Number(btn.dataset.delTimeslot));
          if (await window.confirmDialog(`Excluir horário (período ${ts.period}º)?`)) {
            try {
              await window.DB.deleteTimeSlot(ts.id);
              const updatedSlots = slots.filter(t => t.id !== ts.id);
              renderTimeSlotsList(updatedSlots, shifts, shiftId, onSaved);
              window.showToast('Horário excluído.', 'success');
            } catch (e) { window.showToast(e.message, 'error'); }
          }
        });
      });
    }, 50);
  }

  function renderGradesList(gradeItems, classes, classId, curricula, teachers = [], ctcItems = [], lessonTypes = []) {
    // Mapa curricula_id → lista de vínculos professor (múltiplos permitidos)
    const ctcMap = {};
    ctcItems.forEach(ctc => {
      if (!ctcMap[ctc.curricula_id]) ctcMap[ctc.curricula_id] = [];
      ctcMap[ctc.curricula_id].push(ctc);
    });

    // renderModBadges usa nome/cor vindos do JOIN com lesson_types (já resolvidos no backend)
    const renderModBadges = (modalities = []) => {
      const active = modalities.filter(m => m.weekly_lessons > 0);
      if (!active.length) return '<span style="color:var(--color-text-muted);font-size:12px">—</span>';
      return active.map(m => {
        const color = m.lesson_type_color || '#6b7280';
        const label = m.lesson_type_name || `Tipo ${m.lesson_type_id}`;
        const syncBadge = m.is_synchronous
          ? '<span title="Síncrona" style="font-size:10px;margin-left:2px">ὑ2</span>'
          : '<span title="Assíncrona" style="font-size:10px;margin-left:2px">📥</span>';
        return `<span style="background:${color};color:#fff;
          padding:2px 8px;border-radius:12px;font-size:11px;white-space:nowrap">
          ${m.weekly_lessons}× ${escHtml(label)}
          ${m.is_synchronous !== undefined ? (m.is_synchronous ? ' ⇄' : ' ↓') : ''}
        </span>`;
      }).join(' ');
    };

    const cls = classes.find(c => c.id === classId);
    const html = gradeItems.length === 0
      ? '<p style="color:var(--color-text-muted)">Nenhum componente associado a esta turma.</p>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Componente</th><th>Carga Semanal</th><th>Remoto</th><th>Professores</th><th></th></tr></thead>
          <tbody>${gradeItems.map(g => {
            const curr = curricula.find(c => c.id === g.curricula_id);
            const ctcs  = ctcMap[g.curricula_id] || [];
            const teacherCell = `
              <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
                ${ctcs.map(ctc => `
                  <span style="display:inline-flex;align-items:center;gap:3px;background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:12px;padding:2px 8px;font-size:12px">
                    ${escHtml(ctc.teacher_name)}
                    <button class="btn btn-danger btn-sm" style="padding:0 3px;line-height:1;font-size:11px;border-radius:50%"
                      data-del-ctc="${ctc.id}">✕</button>
                  </span>`).join('')}
                <button class="btn btn-primary btn-sm" style="font-size:11px"
                  data-assign-ctc="${g.curricula_id}" data-grade-id="${g.id}">
                  ${ctcs.length > 0 ? '+ Prof' : '+ Atribuir'}
                </button>
              </div>`;
            const remoteCell = g.remote_allowed
              ? `<span title="Trabalho remoto permitido" style="font-size:13px">🌐</span>`
              : `<span style="color:var(--color-text-muted);font-size:12px">—</span>`;
            return `<tr>
              <td><strong>${curr ? escHtml(curr.name) : '—'}</strong></td>
              <td>${renderModBadges(g.modalities || [])}</td>
              <td style="text-align:center">${remoteCell}</td>
              <td>${teacherCell}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-ghost btn-sm" data-edit-grade="${g.id}" title="Editar carga horária">✏️</button>
                <button class="btn btn-danger btn-sm" data-del-grade="${g.id}">🗑️</button>
              </td>
            </tr>`;
          }).join('')}
          </tbody>
        </table></div>`;
    document.querySelector('#grades-list').innerHTML = html;

    // Attach handlers
    setTimeout(() => {
      // Editar carga horária do componente
      document.querySelectorAll('[data-edit-grade]').forEach(btn => {
        btn.addEventListener('click', () => {
          const gradeId = Number(btn.dataset.editGrade);
          const gradeItem = gradeItems.find(g => g.id === gradeId);
          if (!gradeItem) return;
          openGradeForm(gradeItem, classId, curricula, teachers, lessonTypes, async () => {
            const [gi, ci] = await Promise.all([
              window.DB.getClassCurricula(classId).catch(() => []),
              window.DB.getClassTeacherCurricula(classId).catch(() => []),
            ]);
            renderGradesList(gi, classes, classId, curricula, teachers, ci, lessonTypes);
          });
        });
      });
      // Atribuir professor (adicionar mais um)
      document.querySelectorAll('[data-assign-ctc]').forEach(btn => {
        btn.addEventListener('click', () => {
          const curriculaId = Number(btn.dataset.assignCtc);
          const curr        = curricula.find(c => c.id === curriculaId);
          openAssignTeacherModal(classId, curriculaId, null, curr?.name ?? '', teachers, async () => {
            const [gi, ci] = await Promise.all([
              window.DB.getClassCurricula(classId).catch(() => []),
              window.DB.getClassTeacherCurricula(classId).catch(() => []),
            ]);
            renderGradesList(gi, classes, classId, curricula, teachers, ci, lessonTypes);
          });
        });
      });
      // Remover vínculo professor
      document.querySelectorAll('[data-del-ctc]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const ctcId = Number(btn.dataset.delCtc);
          if (await window.confirmDialog('Remover professor deste componente?')) {
            try {
              await window.DB.deleteClassTeacherCurricula(ctcId);
              const [gi, ci] = await Promise.all([
                window.DB.getClassCurricula(classId).catch(() => []),
                window.DB.getClassTeacherCurricula(classId).catch(() => []),
              ]);
              renderGradesList(gi, classes, classId, curricula, teachers, ci, lessonTypes);
              window.showToast('Vínculo removido.', 'success');
            } catch (e) { window.showToast(e.message, 'error'); }
          }
        });
      });
      // Excluir componente da turma
      document.querySelectorAll('[data-del-grade]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const gradeId = Number(btn.dataset.delGrade);
          if (await window.confirmDialog('Remover este componente da turma?')) {
            try {
              await window.DB.deleteClassCurricula(gradeId);
              const [gi, ci] = await Promise.all([
                window.DB.getClassCurricula(classId).catch(() => []),
                window.DB.getClassTeacherCurricula(classId).catch(() => []),
              ]);
              renderGradesList(gi, classes, classId, curricula, teachers, ci, lessonTypes);
              window.showToast('Componente removido.', 'success');
            } catch (e) { window.showToast(e.message, 'error'); }
          }
        });
      });
    }, 50);
  }

  function openAssignTeacherModal(classId, curriculaId, existingCtcId, currName, teachers, onSaved) {
    window.openModal({
      title: `👨‍🏫 Adicionar Professor — ${escHtml(currName)}`,
      bodyHtml: `
        <div class="form-group">
          <label>Professor *</label>
          <select id="f-assign-teacher">
            <option value="">— Selecione —</option>
            ${teachers.filter(t => t.active !== 0).map(t =>
              `<option value="${t.id}">${escHtml(t.name)}</option>`
            ).join('')}
          </select>
        </div>`,
      confirmLabel: 'Adicionar',
      onConfirm: async (overlay, close) => {
        const personId = Number(overlay.querySelector('#f-assign-teacher').value);
        if (!personId) { window.showToast('Selecione um professor.', 'warning'); return; }
        try {
          await window.DB.createClassTeacherCurricula({ class_id: classId, curricula_id: curriculaId, person_id: personId });
          close();
          window.showToast('Professor adicionado.', 'success');
          if (onSaved) onSaved();
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  function renderTutorsList(tutorItems, classId, teachers, tutorRoles = []) {
    const cont = document.querySelector('#tutors-list');
    if (!cont) return;
    if (!tutorItems.length) {
      cont.innerHTML = '<p style="color:var(--color-text-muted);font-size:13px">Nenhum tutor/orientador atribuído a esta turma.</p>';
      return;
    }
    cont.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px">
      ${tutorItems.map(t => {
        const color = t.role_color || '#6b7280';
        const label = t.role_name || '—';
        return `
        <div style="display:flex;align-items:center;gap:6px;background:var(--color-bg-secondary);border:1px solid var(--color-border);border-radius:8px;padding:6px 10px">
          <span style="font-size:11px;background:${color};color:#fff;padding:2px 7px;border-radius:10px">${escHtml(label)}</span>
          <span style="font-size:13px">${escHtml(t.person_name)}</span>
          ${t.notes ? `<span style="font-size:11px;color:var(--color-text-muted)" title="${escHtml(t.notes)}">ℹ️</span>` : ''}
          <button class="btn btn-ghost btn-sm" style="padding:0 4px" data-edit-tutor="${t.id}" data-role-id="${t.role_id||''}" data-notes="${escHtml(t.notes||'')}" data-person-name="${escHtml(t.person_name)}">✏️</button>
          <button class="btn btn-danger btn-sm" style="padding:0 4px" data-del-tutor="${t.id}">✕</button>
        </div>`;
      }).join('')}
    </div>`;
    setTimeout(() => {
      cont.querySelectorAll('[data-edit-tutor]').forEach(btn => {
        btn.addEventListener('click', () => {
          const existing = {
            id: Number(btn.dataset.editTutor),
            role_id: Number(btn.dataset.roleId) || null,
            notes: btn.dataset.notes,
            person_name: btn.dataset.personName,
          };
          openAssignTutorModal(classId, existing, teachers, tutorRoles, async () => {
            const ti = await window.DB.getClassTutors(classId).catch(() => []);
            renderTutorsList(ti, classId, teachers, tutorRoles);
          });
        });
      });
      cont.querySelectorAll('[data-del-tutor]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!await window.confirmDialog('Remover este tutor da turma?')) return;
          try {
            await window.DB.deleteClassTutor(Number(btn.dataset.delTutor));
            const ti = await window.DB.getClassTutors(classId).catch(() => []);
            renderTutorsList(ti, classId, teachers, tutorRoles);
            window.showToast('Tutor removido.', 'success');
          } catch(e) { window.showToast(e.message, 'error'); }
        });
      });
    }, 50);
  }

  function openAssignTutorModal(classId, existing, teachers, tutorRoles = [], onSaved) {
    const activeRoles = tutorRoles.filter(r => r.active !== 0);
    window.openModal({
      title: existing ? '✏️ Editar Tutor' : '🧑‍🏫 Atribuir Tutor / Orientador',
      bodyHtml: `
        ${!existing ? `
        <div class="form-group">
          <label>Pessoa *</label>
          <select id="f-tutor-person">
            <option value="">— Selecione —</option>
            ${teachers.filter(t => t.active !== 0).map(t =>
              `<option value="${t.id}">${escHtml(t.name)}</option>`
            ).join('')}
          </select>
          <p style="font-size:11px;color:var(--color-text-muted);margin-top:4px">Um mesmo orientador pode ser atribuído a múltiplas turmas.</p>
        </div>` : `<p style="margin-bottom:12px">Editando vínculo de <strong>${escHtml(existing.person_name||'')}</strong></p>`}
        <div class="form-group">
          <label>Papel na Turma</label>
          ${activeRoles.length === 0
            ? `<p style="color:var(--color-text-muted);font-size:12px">⚠️ Nenhum papel cadastrado. Acesse a aba <strong>🏷️ Papéis de Tutor</strong> para criar.</p>
               <input type="hidden" id="f-tutor-role" value="">`
            : `<select id="f-tutor-role">
                <option value="">— Sem papel específico —</option>
                ${activeRoles.map(r =>
                  `<option value="${r.id}" style="color:${escHtml(r.color)}" ${Number(existing?.role_id)===r.id?'selected':''}>${escHtml(r.name)}</option>`
                ).join('')}
              </select>`}
        </div>
        <div class="form-group">
          <label>Observações</label>
          <input type="text" id="f-tutor-notes" value="${escHtml(existing?.notes||'')}" placeholder="Opcional — ex: turno vespertino">
        </div>`,
      confirmLabel: existing ? 'Salvar' : 'Atribuir',
      onConfirm: async (overlay, close) => {
        const roleId = Number(overlay.querySelector('#f-tutor-role').value) || null;
        const notes  = overlay.querySelector('#f-tutor-notes').value.trim() || null;
        try {
          if (existing) {
            await window.DB.updateClassTutor(existing.id, { role_id: roleId, notes });
          } else {
            const personId = Number(overlay.querySelector('#f-tutor-person').value);
            if (!personId) { window.showToast('Selecione uma pessoa.', 'warning'); return; }
            await window.DB.createClassTutor({ class_id: classId, person_id: personId, role_id: roleId, notes });
          }
          close();
          window.showToast('Salvo.', 'success');
          if (onSaved) onSaved();
        } catch(e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  function renderTutorRolesList(tutorRolesArr, container, schoolId) {
    const el = container.querySelector('#tutorroles-list');
    if (!el) return;
    if (!tutorRolesArr.length) {
      el.innerHTML = '<p style="color:var(--color-text-muted)">Nenhum papel cadastrado. Clique em &quot;+ Novo Papel&quot; para criar.</p>';
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Cor</th><th>Status</th><th></th></tr></thead>
      <tbody>${tutorRolesArr.map(r => `
        <tr>
          <td><strong>${escHtml(r.name)}</strong></td>
          <td><span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:${escHtml(r.color)};vertical-align:middle"></span> <span style="font-size:11px;color:var(--color-text-muted)">${escHtml(r.color)}</span></td>
          <td><span class="badge ${r.active ? 'badge-success' : 'badge-inactive'}">${r.active ? 'Ativo' : 'Inativo'}</span></td>
          <td style="display:flex;gap:4px;white-space:nowrap">
            <button class="btn btn-ghost btn-sm" data-edit-tr="${r.id}">✏️</button>
            <button class="btn btn-small ${r.active ? 'btn-warning' : 'btn-success'}" data-toggle-tr="${r.id}" data-active="${r.active ? 0 : 1}">${r.active ? 'Desativar' : 'Ativar'}</button>
            <button class="btn btn-danger btn-sm" data-del-tr="${r.id}">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
    setTimeout(() => {
      el.querySelectorAll('[data-edit-tr]').forEach(btn => {
        btn.addEventListener('click', () => {
          const role = tutorRolesArr.find(r => r.id === Number(btn.dataset.editTr));
          openTutorRoleForm(role, container, schoolId, tutorRolesArr);
        });
      });
      el.querySelectorAll('[data-toggle-tr]').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await window.DB.toggleTutorRole(Number(btn.dataset.toggleTr), parseInt(btn.dataset.active) === 1);
            const fresh = await window.DB.getTutorRoles(schoolId);
            tutorRolesArr.splice(0, tutorRolesArr.length, ...fresh);
            renderTutorRolesList(tutorRolesArr, container, schoolId);
          } catch(e) { window.showToast(e.message, 'error'); }
        });
      });
      el.querySelectorAll('[data-del-tr]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!await window.confirmDialog('Excluir este papel?')) return;
          try {
            await window.DB.deleteTutorRole(Number(btn.dataset.delTr));
            const fresh = await window.DB.getTutorRoles(schoolId);
            tutorRolesArr.splice(0, tutorRolesArr.length, ...fresh);
            renderTutorRolesList(tutorRolesArr, container, schoolId);
            window.showToast('Papel excluído.', 'success');
          } catch(e) { window.showToast(e.message, 'error'); }
        });
      });
    }, 50);
  }

  function openTutorRoleForm(existing, container, schoolId, tutorRolesArr) {
    document.querySelector('.modal-overlay')?.remove();
    window.openModal({
      title: existing ? '✏️ Editar Papel' : '🏷️ Novo Papel de Tutor',
      bodyHtml: `
        <div class="form-group">
          <label>Nome *</label>
          <input type="text" id="f-tr-name" value="${escHtml(existing?.name ?? '')}" placeholder="Ex: Orientador de Turma, Tutor, Coordenador...">
        </div>
        <div class="form-group">
          <label>Cor de identificação</label>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="color" id="f-tr-color" value="${existing?.color ?? '#6366f1'}" style="width:48px;height:32px;padding:0;border:none;cursor:pointer">
            <span style="font-size:12px;color:var(--color-text-muted)">Usada no badge de identificação</span>
          </div>
        </div>`,
      onConfirm: async (overlay, close) => {
        const name  = overlay.querySelector('#f-tr-name').value.trim();
        const color = overlay.querySelector('#f-tr-color').value;
        if (!name) { window.showToast('Informe o nome do papel.', 'warning'); return; }
        try {
          existing
            ? await window.DB.updateTutorRole(existing.id, { name, color })
            : await window.DB.createTutorRole({ school_id: schoolId, name, color });
          close();
          const fresh = await window.DB.getTutorRoles(schoolId);
          tutorRolesArr.splice(0, tutorRolesArr.length, ...fresh);
          renderTutorRolesList(tutorRolesArr, container, schoolId);
          window.showToast('Papel salvo.', 'success');
        } catch(e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  function renderDmTeachersList(teachers, container) {
    const el = container.querySelector('#dm-teachers-list');
    if (!el) return;
    const WM = { presencial: '🏢 Presencial', remoto: '🌐 Remoto', hibrido: '🔄 Híbrido' };
    if (!teachers.length) {
      el.innerHTML = '<p style="color:var(--color-text-muted)">Nenhum professor cadastrado. Gerencie professores em Colaboradores.</p>';
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Modalidade</th><th>Disponibilidade</th></tr></thead>
      <tbody>${teachers.map(t => {
        const slots = state.teacherAvailability[t.id] || [];
        const summary = slots.length === 0
          ? '<span style="color:var(--color-text-muted);font-size:12px">Sem restrição</span>'
          : `<span style="font-size:12px">${slots.length} período(s) marcado(s)</span>`;
        return `<tr>
          <td><strong>${escHtml(t.name)}</strong></td>
          <td><span style="font-size:12px">${WM[t.work_mode||'presencial']||t.work_mode||'—'}</span></td>
          <td style="display:flex;align-items:center;gap:8px">
            ${summary}
            <button class="btn btn-ghost btn-sm" data-dm-avail="${t.id}" title="Editar disponibilidade">🗓️ Editar</button>
          </td>
        </tr>`;
      }).join('')}
      </tbody>
    </table></div>`;
    setTimeout(() => {
      el.querySelectorAll('[data-dm-avail]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const t = teachers.find(x => x.id === Number(btn.dataset.dmAvail));
          if (t) {
            await openTeacherAvailability(t);
            // Reload summary after modal closes
            setTimeout(() => renderDmTeachersList(teachers, container), 300);
          }
        });
      });
    }, 50);
  }

  function populateSelectsInModal(shifts, classes) {
    const shiftSelect = document.querySelector('#timeslot-shift-select');
    const classSelect = document.querySelector('#grade-class-select');
    
    if (shiftSelect) {
      shiftSelect.innerHTML = '<option value="">— Selecione —</option>' +
        shifts.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
    }
    if (classSelect) {
      classSelect.innerHTML = '<option value="">— Selecione —</option>' +
        classes.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
    }
  }

  function openShiftForm(existing, schoolId, onSaved) {
    document.querySelector('.modal-overlay')?.remove();
    window.openModal({
      title: existing ? 'Editar Turno' : 'Novo Turno',
      bodyHtml: `
        <div class="form-group">
          <label>Nome do Turno *</label>
          <input type="text" id="f-shift-name" value="${escHtml(existing?.name ?? '')}" placeholder="Ex: Manhã, Tarde, Noite">
        </div>
      `,
      onConfirm: async (overlay, close) => {
        const name = overlay.querySelector('#f-shift-name').value.trim();
        if (!name) { window.showToast('Informe o nome do turno.', 'warning'); return; }
        const data = { name, school_id: schoolId };
        try {
          existing
            ? await window.DB.updateShift(existing.id, data)
            : await window.DB.createShift(data);
          close();
          window.showToast('Turno salvo.', 'success');
          if (onSaved) onSaved();
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  function openClassForm(existing, schoolId, shifts, classes, onSaved) {
    document.querySelector('.modal-overlay')?.remove();
    window.openModal({
      title: existing ? 'Editar Turma' : 'Nova Turma',
      bodyHtml: `
        <div class="form-group">
          <label>Nome da Turma *</label>
          <input type="text" id="f-class-name" value="${escHtml(existing?.name ?? '')}" placeholder="Ex: 1º A, 2º B">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Turno *</label>
            <select id="f-class-shift">
              <option value="">— Selecione —</option>
              ${shifts.map(s => `<option value="${s.id}" ${existing?.shift_id === s.id ? 'selected' : ''}>${escHtml(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Ano</label>
            <input type="number" id="f-class-year" value="${existing?.year ?? ''}" min="1" max="12" placeholder="Ex: 1">
          </div>
        </div>
      `,
      onConfirm: async (overlay, close) => {
        const name = overlay.querySelector('#f-class-name').value.trim();
        const shiftId = Number(overlay.querySelector('#f-class-shift').value);
        if (!name || !shiftId) { window.showToast('Informe nome e turno.', 'warning'); return; }
        const data = { name, shift_id: shiftId, year: Number(overlay.querySelector('#f-class-year').value) || null, school_id: schoolId };
        try {
          existing
            ? await window.DB.updateClass(existing.id, data)
            : await window.DB.createClass(data);
          close();
          window.showToast('Turma salva.', 'success');
          if (onSaved) onSaved();
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  function openCurriculaForm(existing, schoolId, curricula, onSaved) {
    document.querySelector('.modal-overlay')?.remove();
    window.openModal({
      title: existing ? 'Editar Componente' : 'Novo Componente',
      bodyHtml: `
        <div class="form-group">
          <label>Nome do Componente *</label>
          <input type="text" id="f-curr-name" value="${escHtml(existing?.name ?? '')}" placeholder="Ex: Matemática, Português">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Código</label>
            <input type="text" id="f-curr-code" value="${escHtml(existing?.code ?? '')}" placeholder="Ex: MAT01">
          </div>
        </div>
        <div class="form-group">
          <label>Descrição</label>
          <textarea id="f-curr-desc" rows="2" placeholder="Descrição opcional">${escHtml(existing?.description ?? '')}</textarea>
        </div>
      `,
      onConfirm: async (overlay, close) => {
        const name = overlay.querySelector('#f-curr-name').value.trim();
        if (!name) { window.showToast('Informe o nome do componente.', 'warning'); return; }
        const data = {
          name,
          code: overlay.querySelector('#f-curr-code').value.trim(),
          description: overlay.querySelector('#f-curr-desc').value.trim(),
          school_id: schoolId,
        };
        try {
          existing
            ? await window.DB.updateCurricula(existing.id, data)
            : await window.DB.createCurricula(data);
          close();
          window.showToast('Componente salvo.', 'success');
          if (onSaved) onSaved();
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  function openTimeSlotForm(existing, shift, shiftId, onSaved) {
    document.querySelector('.modal-overlay')?.remove();
    window.openModal({
      title: existing ? 'Editar Horário' : 'Novo Horário',
      bodyHtml: `
        <div style="margin-bottom:12px;padding:8px;background:var(--color-bg-secondary);border-radius:4px">
          <strong>Turno:</strong> ${escHtml(shift?.name ?? '')}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Período *</label>
            <input type="number" id="f-ts-period" value="${existing?.period ?? ''}" min="1" max="20" placeholder="1, 2, 3...">
          </div>
          <div class="form-group">
            <label>Modalidade</label>
            <select id="f-ts-type">
              <option value="presencial" ${(existing?.lesson_type??'presencial')==='presencial'?'selected':''}>&#127962; Presencial</option>
              <option value="ead" ${existing?.lesson_type==='ead'?'selected':''}>&#128250; EAD</option>
              <option value="online" ${existing?.lesson_type==='online'?'selected':''}>&#127760; Online</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Horário de Início *</label>
            <input type="time" id="f-ts-start" value="${existing?.start_time ?? ''}">
          </div>
          <div class="form-group">
            <label>Horário de Fim *</label>
            <input type="time" id="f-ts-end" value="${existing?.end_time ?? ''}">
          </div>
        </div>
      `,
      onConfirm: async (overlay, close) => {
        const period = Number(overlay.querySelector('#f-ts-period').value);
        const startTime = overlay.querySelector('#f-ts-start').value.trim();
        const endTime = overlay.querySelector('#f-ts-end').value.trim();
        const lessonType = overlay.querySelector('#f-ts-type').value;
        if (!period || !startTime || !endTime) { window.showToast('Informe período e horários.', 'warning'); return; }
        const data = { shift_id: shiftId, period, start_time: startTime, end_time: endTime, lesson_type: lessonType };
        try {
          existing
            ? await window.DB.updateTimeSlot(existing.id, data)
            : await window.DB.createTimeSlot(data);
          close();
          window.showToast('Horário salvo.', 'success');
          if (onSaved) onSaved();
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  function openGradeForm(existing, classId, curricula, teachers, lessonTypes, onSaved) {
    const isEdit = !!existing;
    const mods = existing?.modalities || [];
    const activeLessonTypes = (lessonTypes || []).filter(lt => lt.active !== 0);
    const getModVal = (ltId) => mods.find(m => m.lesson_type_id === ltId)?.weekly_lessons || 0;
    const initTotal = mods.reduce((s, m) => s + (m.weekly_lessons || 0), 0);
    const noTypes = activeLessonTypes.length === 0;
    const initRemote = !!(existing?.remote_allowed);

    document.querySelector('.modal-overlay')?.remove();
    window.openModal({
      title: isEdit ? `✏️ Editar Carga — ${escHtml(existing.curricula_name||'')}` : 'Adicionar Componente à Turma',
      bodyHtml: `
        ${!isEdit ? `
        <div class="form-group">
          <label>Componente *</label>
          <select id="f-grade-curricula">
            <option value="">— Selecione —</option>
            ${curricula.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="form-group">
          <label style="font-weight:600">🕐 Carga Horária Semanal por Tipo de Aula</label>
          ${noTypes ? `
            <p style="margin-top:8px;color:var(--color-warning,#b45309);font-size:13px">
              ⚠️ Nenhum tipo de aula ativo. Acesse a aba <strong>⏰ Tipos de Aula</strong> para criar.
            </p>` : `
          <div style="margin-top:8px;border:1px solid var(--color-border);border-radius:8px;overflow:hidden">
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="background:var(--color-bg-secondary)">
                  <th style="padding:8px 12px;text-align:left;font-size:12px">Tipo</th>
                  <th style="padding:8px 12px;text-align:center;font-size:12px">Modalidade</th>
                  <th style="padding:8px 12px;text-align:center;font-size:12px">Aulas/sem.</th>
                </tr>
              </thead>
              <tbody>
                ${activeLessonTypes.map(lt => `
                <tr style="border-top:1px solid var(--color-border)">
                  <td style="padding:8px 12px">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${lt.color||'#6b7280'};margin-right:6px"></span>
                    <strong style="font-size:13px">${escHtml(lt.name)}</strong>
                  </td>
                  <td style="padding:8px 12px;text-align:center;font-size:12px;color:var(--color-text-muted)">
                    ${lt.is_synchronous ? '⇄ Síncrona' : '↓ Assíncrona'}
                  </td>
                  <td style="padding:8px 12px;text-align:center">
                    <input type="number" data-lt-id="${lt.id}" min="0" max="99" value="${getModVal(lt.id)}"
                      style="width:64px;text-align:center;padding:4px">
                  </td>
                </tr>`).join('')}
                <tr style="border-top:2px solid var(--color-border);background:var(--color-bg-secondary)">
                  <td colspan="2" style="padding:8px 12px;font-size:13px;font-weight:600">Total</td>
                  <td style="padding:8px 12px;text-align:center;font-weight:600" id="f-mod-total">${initTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>`}
        </div>
        <div class="form-group" style="margin-top:12px">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:normal">
            <input type="checkbox" id="f-remote-allowed" ${initRemote ? 'checked' : ''}
              style="width:16px;height:16px;cursor:pointer">
            <span>
              🌐 <strong>Permitir trabalho remoto</strong>
              <span style="display:block;font-size:11px;color:var(--color-text-muted);font-weight:normal">O profissional pode cumprir as horas não presenciais em regime de trabalho remoto</span>
            </span>
          </label>
        </div>
        ${!isEdit ? `
        <div class="form-group">
          <label>Professor <span style="color:var(--color-text-muted);font-size:11px">(opcional — pode adicionar mais depois)</span></label>
          <select id="f-grade-teacher">
            <option value="">— Sem professor definido —</option>
            ${(teachers||[]).filter(t => t.active !== 0).map(t =>
              `<option value="${t.id}">${escHtml(t.name)}</option>`
            ).join('')}
          </select>
        </div>` : ''}
      `,
      confirmLabel: isEdit ? 'Salvar' : 'Adicionar',
      onConfirm: async (overlay, close) => {
        const curriculaId = isEdit ? existing.curricula_id
          : Number(overlay.querySelector('#f-grade-curricula').value);
        if (!isEdit && !curriculaId) { window.showToast('Selecione um componente.', 'warning'); return; }

        const modalities = [];
        overlay.querySelectorAll('input[data-lt-id]').forEach(inp => {
          const ltId = Number(inp.dataset.ltId);
          const wl   = Number(inp.value) || 0;
          if (ltId && wl > 0) modalities.push({ lesson_type_id: ltId, weekly_lessons: wl });
        });
        const weeklyLessons = modalities.reduce((s, m) => s + m.weekly_lessons, 0);
        const remoteAllowed = !!(overlay.querySelector('#f-remote-allowed')?.checked);

        try {
          if (isEdit) {
            await window.DB.updateClassCurricula(existing.id, { weekly_lessons: weeklyLessons, modalities, remote_allowed: remoteAllowed });
          } else {
            const personId = Number(overlay.querySelector('#f-grade-teacher').value) || null;
            await window.DB.createClassCurricula({ class_id: classId, curricula_id: curriculaId,
              weekly_lessons: weeklyLessons, modalities, remote_allowed: remoteAllowed });
            if (personId) {
              await window.DB.createClassTeacherCurricula({ class_id: classId, curricula_id: curriculaId, person_id: personId });
            }
          }
          close();
          window.showToast('Componente salvo.', 'success');
          if (onSaved) onSaved();
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });

    setTimeout(() => {
      const totalEl = document.querySelector('#f-mod-total');
      const updateTotal = () => {
        if (!totalEl) return;
        let sum = 0;
        document.querySelectorAll('input[data-lt-id]').forEach(inp => { sum += Number(inp.value)||0; });
        totalEl.textContent = sum;
      };
      document.querySelectorAll('input[data-lt-id]').forEach(inp => inp.addEventListener('input', updateTotal));
    }, 80);
  }

  // ─── Tipos de Aula: lista + formulário ─────────────────────────────────────
  function renderLessonTypesList(lessonTypesArr, container, schoolId) {
    const el = container.querySelector('#lessontypes-list');
    if (!el) return;
    if (!lessonTypesArr.length) {
      el.innerHTML = '<p style="color:var(--color-text-muted)">Nenhum tipo cadastrado. Clique em <strong>+ Novo Tipo</strong> para começar.</p>';
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Modalidade</th><th>Cor</th><th>Status</th><th></th></tr></thead>
      <tbody>${lessonTypesArr.map(lt => `
        <tr>
          <td><strong>${escHtml(lt.name)}</strong></td>
          <td style="font-size:12px">${lt.is_synchronous ? '⇄ Síncrona' : '↓ Assíncrona'}</td>
          <td>
            <span style="display:inline-flex;align-items:center;gap:6px">
              <span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:${lt.color||'#6b7280'};border:1px solid #ccc"></span>
              <code style="font-size:11px">${escHtml(lt.color||'')}</code>
            </span>
          </td>
          <td>
            <span style="background:${lt.active!==0?'var(--color-success-bg,#dcfce7)':'var(--color-bg-secondary)'};color:${lt.active!==0?'var(--color-success,#16a34a)':'var(--color-text-muted)'};padding:2px 8px;border-radius:10px;font-size:11px">
              ${lt.active!==0?'Ativo':'Inativo'}
            </span>
          </td>
          <td style="display:flex;gap:4px;white-space:nowrap">
            <button class="btn btn-ghost btn-sm" data-edit-lt="${lt.id}">✏️</button>
            <button class="btn btn-ghost btn-sm" data-toggle-lt="${lt.id}" data-active="${lt.active}">
              ${lt.active!==0?'Desativar':'Ativar'}
            </button>
            <button class="btn btn-danger btn-sm" data-del-lt="${lt.id}">🗑️</button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;

    setTimeout(() => {
      el.querySelectorAll('[data-edit-lt]').forEach(btn => {
        btn.addEventListener('click', () => {
          const lt = lessonTypesArr.find(x => x.id === Number(btn.dataset.editLt));
          if (lt) openLessonTypeForm(lt, container, schoolId, lessonTypesArr);
        });
      });
      el.querySelectorAll('[data-toggle-lt]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const lt = lessonTypesArr.find(x => x.id === Number(btn.dataset.toggleLt));
          if (!lt) return;
          const newActive = lt.active !== 0 ? 0 : 1;
          try {
            await window.DB.toggleLessonType(lt.id, newActive);
            const fresh = await window.DB.getLessonTypes(schoolId).catch(() => []);
            lessonTypesArr.splice(0, lessonTypesArr.length, ...fresh);
            renderLessonTypesList(lessonTypesArr, container, schoolId);
          } catch(e) { window.showToast(e.message, 'error'); }
        });
      });
      el.querySelectorAll('[data-del-lt]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const lt = lessonTypesArr.find(x => x.id === Number(btn.dataset.delLt));
          if (!lt) return;
          if (await window.confirmDialog(`Excluir o tipo "${lt.name}"? Isso só é possível se não estiver em uso.`)) {
            try {
              await window.DB.deleteLessonType(lt.id);
              const fresh = await window.DB.getLessonTypes(schoolId).catch(() => []);
              lessonTypesArr.splice(0, lessonTypesArr.length, ...fresh);
              renderLessonTypesList(lessonTypesArr, container, schoolId);
              window.showToast('Tipo excluído.', 'success');
            } catch(e) { window.showToast(e.message, 'error'); }
          }
        });
      });
    }, 50);
  }

  function openLessonTypeForm(existing, container, schoolId, lessonTypesArr) {
    window.openModal({
      title: existing ? `✏️ Editar Tipo de Aula` : 'Novo Tipo de Aula',
      bodyHtml: `
        <div class="form-group">
          <label>Nome do tipo *</label>
          <input type="text" id="f-lt-name" value="${escHtml(existing?.name??'')}" placeholder="Ex: Presencial, EAD, Aula Prática">
        </div>
        <div class="form-group">
          <label>Modalidade *</label>
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
              <input type="radio" name="f-lt-sync" value="1" ${(existing?.is_synchronous??1)?'checked':''}>
              <span>⇄ <strong>Síncrona</strong> — Professor e aluno no mesmo horário</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">
              <input type="radio" name="f-lt-sync" value="0" ${existing && !existing.is_synchronous?'checked':''}>
              <span>↓ <strong>Assíncrona</strong> — Professor lança conteúdo, aluno acessa depois</span>
            </label>
          </div>
        </div>
        <div class="form-group">
          <label>Cor de identificação</label>
          <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
            <input type="color" id="f-lt-color" value="${existing?.color||'#0369a1'}" style="width:48px;height:36px;cursor:pointer;border:none">
            <span style="font-size:12px;color:var(--color-text-muted)">Usada nos badges na grade de turmas</span>
          </div>
        </div>
      `,
      confirmLabel: existing ? 'Salvar' : 'Criar',
      onConfirm: async (overlay, close) => {
        const name = overlay.querySelector('#f-lt-name').value.trim();
        if (!name) { window.showToast('Informe o nome.', 'warning'); return; }
        const is_synchronous = Number(overlay.querySelector('input[name="f-lt-sync"]:checked')?.value ?? 1);
        const color = overlay.querySelector('#f-lt-color').value;
        try {
          if (existing) {
            await window.DB.updateLessonType(existing.id, { name, is_synchronous, color });
          } else {
            await window.DB.createLessonType({ school_id: schoolId, name, is_synchronous, color });
          }
          close();
          const fresh = await window.DB.getLessonTypes(schoolId).catch(() => []);
          lessonTypesArr.splice(0, lessonTypesArr.length, ...fresh);
          renderLessonTypesList(lessonTypesArr, container, schoolId);
          window.showToast('Tipo salvo.', 'success');
        } catch(e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  // ─── Utilitário ─────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return { mount, openDataManagement };
})();
