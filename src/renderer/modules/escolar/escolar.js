/**
 * Módulo Escolar — Chamada · Diário do Professor · Ocorrências · Alunos
 *
 * Addon ESCOLAR: Lite (≤10 turmas, R$560/mês +R$50 exc.) | Basic (≤30 turmas, R$980/mês +R$42 exc.)
 *                Flex (≤60 turmas, R$1.790/mês +R$28 exc.) | Total (ilimitado/rede, R$2.600/mês +R$23 exc.)
 */

window.ModuleEscolar = (() => {
  let _schoolId = null;
  let _tab      = 'chamada';
  let _classes  = [];
  let _teachers = [];

  const E = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
  }

  const SEVERITY_BADGE = {
    baixa:  { bg: '#dcfce7', color: '#16a34a', label: 'Baixa'  },
    media:  { bg: '#fef3c7', color: '#d97706', label: 'Média'  },
    alta:   { bg: '#fee2e2', color: '#dc2626', label: 'Alta'   },
  };
  const TYPE_ICONS = { student: '👤', class: '🏫', teacher: '👨‍🏫' };
  const TYPE_LABELS = { student: 'Aluno', class: 'Turma', teacher: 'Professor' };
  const STATUS_BADGE = {
    presente:    { bg: '#dcfce7', color: '#16a34a' },
    ausente:     { bg: '#fee2e2', color: '#dc2626' },
    justificado: { bg: '#fef3c7', color: '#d97706' },
  };

  function sevBadge(sev) {
    const s = SEVERITY_BADGE[sev] || SEVERITY_BADGE.media;
    return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:${s.color};background:${s.bg}">${s.label}</span>`;
  }
  function statusBadge(status) {
    const s = STATUS_BADGE[status] || { bg: '#f3f4f6', color: '#6b7280' };
    return `<span style="display:inline-block;padding:1px 6px;border-radius:10px;font-size:11px;font-weight:600;color:${s.color};background:${s.bg}">${E(status)}</span>`;
  }

  // ── Shell principal ──────────────────────────────────────────────────────
  function renderShell() {
    return `
      <div class="escolar-module">
        <div class="page-header" style="margin-bottom:0">
          <div><h1>🎓 Escolar</h1>
            <p class="subtitle">Chamada · Diário do Professor · Ocorrências · Alunos</p></div>
        </div>
        <nav class="module-tabs" style="margin:16px 0 0">
          <button class="module-tab${_tab==='chamada'?' active':''}" data-t="chamada">🏫 Chamada</button>
          <button class="module-tab${_tab==='diario'?' active':''}"  data-t="diario" >📓 Diário</button>
          <button class="module-tab${_tab==='ocorrencias'?' active':''}" data-t="ocorrencias">⚠️ Ocorrências</button>
          <button class="module-tab${_tab==='alunos'?' active':''}"  data-t="alunos" >👨‍🎓 Alunos</button>
          <button class="module-tab${_tab==='assinatura'?' active':''}" data-t="assinatura">💳 Assinatura</button>
        </nav>
        <div id="escolar-content" style="margin-top:20px"></div>
      </div>
    `;
  }

  // ════════════════════════════════════════════════════════════════════════
  // ABA: CHAMADA
  // ════════════════════════════════════════════════════════════════════════

  async function renderChamada(el) {
    const today = new Date().toISOString().slice(0,10);
    el.innerHTML = `
      <div style="max-width:800px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;align-items:flex-end">
          <div class="form-group" style="margin:0;flex:1;min-width:200px">
            <label>Turma</label>
            <select id="c-class" class="form-control">
              <option value="">Selecione uma turma…</option>
              ${_classes.map(c => `<option value="${E(c.id)}">${E(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;min-width:160px">
            <label>Data</label>
            <input type="date" id="c-date" class="form-control" value="${today}">
          </div>
          <div class="form-group" style="margin:0;min-width:160px">
            <label>Período / Aula</label>
            <select id="c-period" class="form-control">
              ${[1,2,3,4,5,6].map(n=>`<option value="${n}">${n}º tempo</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-ghost" id="c-load" style="white-space:nowrap">🔍 Carregar</button>
        </div>
        <div id="c-form"></div>
      </div>`;

    document.getElementById('c-load').addEventListener('click', () => loadAttendanceForm(el));
  }

  async function loadAttendanceForm(el) {
    const classId = document.getElementById('c-class').value;
    const date    = document.getElementById('c-date').value;
    const period  = document.getElementById('c-period').value;
    const formEl  = document.getElementById('c-form');
    if (!classId) { formEl.innerHTML = '<p class="form-error">Selecione uma turma.</p>'; return; }
    if (!date)    { formEl.innerHTML = '<p class="form-error">Selecione uma data.</p>'; return; }

    formEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary)">Carregando…</div>';

    try {
      const [students, existing] = await Promise.all([
        window.aula.getEscolarStudents(_schoolId, classId),
        window.aula.getAttendance(_schoolId, classId, date),
      ]);
      const record = (existing || []).find(r => r.period == period);
      const existingStudents = record ? (
        Array.isArray(record.students_json) ? record.students_json : JSON.parse(record.students_json || '[]')
      ) : [];
      const existingMap = Object.fromEntries(existingStudents.map(s => [s.student_id, s]));

      if (!students.length) {
        formEl.innerHTML = `<div class="empty-state" style="padding:32px;text-align:center;background:var(--bg-secondary,#f8f9fa);border-radius:8px">
          <p>📭 Nenhum aluno matriculado nesta turma.</p>
          <p style="font-size:13px;color:var(--text-secondary)">Cadastre alunos na aba <strong>Alunos</strong>.</p></div>`;
        return;
      }

      formEl.innerHTML = `
        <div class="notification-panel" style="background:#fff;border:1px solid var(--border-color);border-radius:8px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <h3 style="margin:0;font-size:16px">Chamada — ${E(date.split('-').reverse().join('/'))} · ${period}º tempo</h3>
            <div style="display:flex;gap:8px">
              <button class="btn btn-ghost btn-sm" id="c-mark-all-p">✅ Todos presentes</button>
              <button class="btn btn-ghost btn-sm" id="c-mark-all-a">❌ Todos ausentes</button>
            </div>
          </div>
          <table class="module-table" style="width:100%">
            <thead><tr><th>Aluno</th><th style="width:180px">Status</th><th>Observação</th></tr></thead>
            <tbody>
              ${students.map(s => {
                const prev = existingMap[s.id] || {};
                const status = prev.status || 'presente';
                return `<tr>
                  <td><strong>${E(s.name)}</strong>${s.registration ? `<span style="font-size:11px;color:var(--text-secondary);margin-left:6px">${E(s.registration)}</span>` : ''}</td>
                  <td>
                    <select class="form-control s-status" data-sid="${E(s.id)}" style="padding:4px 8px;font-size:13px">
                      <option value="presente"    ${status==='presente'    ? 'selected' : ''}>✅ Presente</option>
                      <option value="ausente"     ${status==='ausente'     ? 'selected' : ''}>❌ Ausente</option>
                      <option value="justificado" ${status==='justificado' ? 'selected' : ''}>📋 Justificado</option>
                    </select>
                  </td>
                  <td><input type="text" class="form-control s-note" data-sid="${E(s.id)}" value="${E(prev.note || '')}" placeholder="obs…" style="font-size:13px;padding:4px 8px"></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <div style="margin-top:16px">
            <label style="font-size:13px;font-weight:600">Conteúdo trabalhado <span style="font-weight:400;color:var(--text-secondary)">(Diário do Professor)</span></label>
            <textarea id="c-content" class="form-control" rows="3" placeholder="Descreva o conteúdo trabalhado nesta aula…" style="margin-top:4px">${E(record?.lesson_content || '')}</textarea>
          </div>
          <div style="margin-top:8px">
            <label style="font-size:13px;font-weight:600">Disciplina</label>
            <input type="text" id="c-subject" class="form-control" value="${E(record?.subject || '')}" placeholder="Ex: Matemática, Português…" style="margin-top:4px">
          </div>
          <div id="c-save-error" class="form-error" style="min-height:16px"></div>
          <div style="display:flex;gap:10px;margin-top:14px;align-items:center">
            <button class="btn btn-primary" id="c-save">💾 Salvar Chamada</button>
            ${record ? `<button class="btn btn-danger btn-sm" id="c-delete">🗑️ Excluir</button>` : ''}
            <span style="font-size:12px;color:var(--text-secondary)">${students.length} aluno(s)</span>
          </div>
        </div>`;

      document.getElementById('c-mark-all-p').addEventListener('click', () =>
        document.querySelectorAll('.s-status').forEach(s => s.value = 'presente'));
      document.getElementById('c-mark-all-a').addEventListener('click', () =>
        document.querySelectorAll('.s-status').forEach(s => s.value = 'ausente'));

      document.getElementById('c-save').addEventListener('click', async () => {
        const errEl = document.getElementById('c-save-error');
        errEl.textContent = '';
        const studentsData = students.map(s => ({
          student_id: s.id,
          name: s.name,
          status: document.querySelector(`.s-status[data-sid="${s.id}"]`).value,
          note:   document.querySelector(`.s-note[data-sid="${s.id}"]`).value.trim(),
        }));
        try {
          const btn = document.getElementById('c-save');
          btn.disabled = true; btn.textContent = 'Salvando…';
          await window.aula.saveAttendance({
            school_id: _schoolId, class_id: classId,
            teacher_id: null, date, period,
            subject: document.getElementById('c-subject').value.trim(),
            lesson_content: document.getElementById('c-content').value.trim(),
            students: studentsData,
          });
          window.showToast('Chamada salva!', 'success');
          btn.textContent = '✅ Salvo';
        } catch(e) {
          errEl.textContent = e.message;
          document.getElementById('c-save').disabled = false;
          document.getElementById('c-save').textContent = '💾 Salvar Chamada';
        }
      });

      document.getElementById('c-delete')?.addEventListener('click', async () => {
        if (!await window.confirmDialog('Excluir esta chamada?')) return;
        try {
          await window.aula.deleteAttendance(record.id);
          window.showToast('Chamada excluída.', 'success');
          formEl.innerHTML = '';
        } catch(e) { window.showToast(e.message, 'error'); }
      });
    } catch(e) {
      formEl.innerHTML = `<p class="form-error">Erro: ${E(e.message)}</p>`;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ABA: DIÁRIO
  // ════════════════════════════════════════════════════════════════════════

  async function renderDiario(el) {
    el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-secondary)">Carregando diário…</div>';
    try {
      const classId = null; // mostra todos
      const records = await window.aula.getAttendance(_schoolId, classId, null);
      if (!records.length) {
        el.innerHTML = `<div style="padding:48px;text-align:center;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px dashed var(--border-color)">
          <div style="font-size:40px;margin-bottom:12px">📓</div>
          <h3 style="margin:0 0 8px">Nenhum registro no diário</h3>
          <p style="color:var(--text-secondary);margin:0">Use a aba <strong>Chamada</strong> para registrar presenças e conteúdo das aulas.</p></div>`;
        return;
      }

      const filterHtml = `
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-end">
          <div class="form-group" style="margin:0;flex:1;min-width:180px">
            <label style="font-size:12px">Filtrar por turma</label>
            <select id="d-filter-class" class="form-control" style="padding:6px 8px;font-size:13px">
              <option value="">Todas as turmas</option>
              ${_classes.map(c => `<option value="${E(c.id)}">${E(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;min-width:150px">
            <label style="font-size:12px">Filtrar período</label>
            <input type="month" id="d-filter-month" class="form-control" style="padding:6px 8px;font-size:13px">
          </div>
        </div>`;

      const tableRows = records.map(r => `
        <tr data-class="${E(r.class_id)}" data-date="${E(r.date || '')}">
          <td>${E(r.date ? fmtDate(r.date) : '—')}</td>
          <td><strong>${E(r.class_name)}</strong></td>
          <td style="font-size:13px">${E(r.subject || '—')}</td>
          <td>${E(r.teacher_name)}</td>
          <td style="text-align:center">
            <span style="color:var(--text-secondary);font-size:13px">${r.total_students ?? '?'} alunos</span>
            ${r.absences ? `<br><span style="color:#dc2626;font-size:11px">${r.absences} falta(s)</span>` : ''}
          </td>
          <td style="font-size:12px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            ${E(r.lesson_content || '—')}</td>
        </tr>`).join('');

      el.innerHTML = `
        <div style="max-width:1000px">
          ${filterHtml}
          <div class="table-wrap">
            <table class="module-table" id="d-table">
              <thead><tr><th>Data</th><th>Turma</th><th>Disciplina</th><th>Professor</th><th>Alunos</th><th>Conteúdo</th></tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>`;

      function applyFilter() {
        const cls = document.getElementById('d-filter-class').value;
        const mon = document.getElementById('d-filter-month').value; // YYYY-MM
        document.querySelectorAll('#d-table tbody tr').forEach(tr => {
          const matchC = !cls || tr.dataset.class === cls;
          const matchM = !mon || (tr.dataset.date || '').startsWith(mon);
          tr.style.display = matchC && matchM ? '' : 'none';
        });
      }
      document.getElementById('d-filter-class').addEventListener('change', applyFilter);
      document.getElementById('d-filter-month').addEventListener('change', applyFilter);
    } catch(e) {
      el.innerHTML = `<p class="form-error">Erro ao carregar diário: ${E(e.message)}</p>`;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ABA: OCORRÊNCIAS
  // ════════════════════════════════════════════════════════════════════════

  async function renderOcorrencias(el) {
    el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-secondary)">Carregando…</div>';
    try {
      const occurrences = await window.aula.getOccurrences(_schoolId);
      renderOcorrenciasView(el, occurrences);
    } catch(e) {
      el.innerHTML = `<p class="form-error">Erro: ${E(e.message)}</p>`;
    }
  }

  function renderOcorrenciasView(el, occurrences) {
    const filters = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px">
        <select id="oc-f-type" class="form-control" style="min-width:140px;font-size:13px;padding:6px 8px">
          <option value="">Todos os tipos</option>
          <option value="student">👤 Aluno</option>
          <option value="class">🏫 Turma</option>
          <option value="teacher">👨‍🏫 Professor</option>
        </select>
        <select id="oc-f-sev" class="form-control" style="min-width:130px;font-size:13px;padding:6px 8px">
          <option value="">Todas as severidades</option>
          <option value="baixa">Baixa</option>
          <option value="media">Média</option>
          <option value="alta">Alta</option>
        </select>
        <select id="oc-f-status" class="form-control" style="min-width:120px;font-size:13px;padding:6px 8px">
          <option value="">Todos os status</option>
          <option value="aberta">Aberta</option>
          <option value="resolvida">Resolvida</option>
        </select>
        <button class="btn btn-primary" id="oc-new">+ Nova Ocorrência</button>
      </div>`;

    const rows = occurrences.map(o => `
      <tr data-type="${E(o.type)}" data-sev="${E(o.severity)}" data-status="${E(o.status)}">
        <td>${E(fmtDate(o.created_at?.slice(0,10)))}</td>
        <td>${TYPE_ICONS[o.type] || '?'} <span style="font-size:12px">${TYPE_LABELS[o.type] || o.type}</span></td>
        <td><strong>${E(o.title)}</strong></td>
        <td>${E(o.student_name || o.class_name || o.teacher_name || '—')}</td>
        <td>${sevBadge(o.severity)}</td>
        <td><span class="badge ${o.status==='resolvida'?'badge-success':'badge-warning'}">${E(o.status)}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" data-oc-edit="${E(o.id)}">✏️</button>
          ${o.status==='aberta' ? `<button class="btn btn-success btn-sm" data-oc-resolve="${E(o.id)}" title="Marcar como resolvida">✅</button>` : ''}
          <button class="btn btn-danger btn-sm" data-oc-del="${E(o.id)}">🗑️</button>
        </td>
      </tr>`).join('');

    el.innerHTML = `
      <div style="max-width:1000px">
        ${filters}
        ${occurrences.length ? `
          <div class="table-wrap"><table class="module-table" id="oc-table">
            <thead><tr><th>Data</th><th>Tipo</th><th>Título</th><th>Referência</th><th>Severidade</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>` : `
          <div style="padding:40px;text-align:center;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px dashed var(--border-color)">
            <div style="font-size:36px;margin-bottom:8px">⚠️</div>
            <p style="margin:0;color:var(--text-secondary)">Nenhuma ocorrência registrada.</p></div>`}
      </div>`;

    // Filtros
    ['oc-f-type','oc-f-sev','oc-f-status'].forEach(id =>
      document.getElementById(id)?.addEventListener('change', () => {
        const type   = document.getElementById('oc-f-type').value;
        const sev    = document.getElementById('oc-f-sev').value;
        const status = document.getElementById('oc-f-status').value;
        document.querySelectorAll('#oc-table tbody tr').forEach(tr => {
          tr.style.display = ((!type || tr.dataset.type===type) && (!sev || tr.dataset.sev===sev) && (!status || tr.dataset.status===status)) ? '' : 'none';
        });
      })
    );

    document.getElementById('oc-new').addEventListener('click', () => openOcorrenciaModal(null, el));

    el.querySelectorAll('[data-oc-edit]').forEach(btn =>
      btn.addEventListener('click', () => {
        const oc = occurrences.find(o => o.id == btn.dataset.ocEdit);
        if (oc) openOcorrenciaModal(oc, el);
      })
    );
    el.querySelectorAll('[data-oc-resolve]').forEach(btn =>
      btn.addEventListener('click', async () => {
        try {
          await window.aula.updateOccurrence(Number(btn.dataset.ocResolve), { status: 'resolvida' });
          window.showToast('Ocorrência resolvida.', 'success');
          const fresh = await window.aula.getOccurrences(_schoolId);
          renderOcorrenciasView(el, fresh);
        } catch(e) { window.showToast(e.message, 'error'); }
      })
    );
    el.querySelectorAll('[data-oc-del]').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!await window.confirmDialog('Excluir esta ocorrência?')) return;
        try {
          await window.aula.deleteOccurrence(Number(btn.dataset.ocDel));
          window.showToast('Ocorrência excluída.', 'success');
          const fresh = await window.aula.getOccurrences(_schoolId);
          renderOcorrenciasView(el, fresh);
        } catch(e) { window.showToast(e.message, 'error'); }
      })
    );
  }

  async function openOcorrenciaModal(existing, parentEl) {
    const allStudents = await window.aula.getEscolarStudents(_schoolId).catch(() => []);
    const studentOptions = allStudents.map(s => `<option value="${E(s.id)}" ${existing?.student_id==s.id?'selected':''}>${E(s.name)}</option>`).join('');
    const classOptions   = _classes.map(c => `<option value="${E(c.id)}" ${existing?.class_id==c.id?'selected':''}>${E(c.name)}</option>`).join('');
    const teacherOptions = _teachers.map(t => `<option value="${E(t.id)}" ${existing?.teacher_id==t.id?'selected':''}>${E(t.name)}</option>`).join('');

    const typeV    = existing?.type     || 'student';
    const sevV     = existing?.severity || 'media';

    window.openModal({
      title: existing ? '✏️ Editar Ocorrência' : '⚠️ Nova Ocorrência',
      bodyHtml: `
        <div class="form-group">
          <label>Tipo *</label>
          <select id="oc-type" class="form-control">
            <option value="student"  ${typeV==='student'  ? 'selected':''}>👤 Aluno</option>
            <option value="class"    ${typeV==='class'    ? 'selected':''}>🏫 Turma</option>
            <option value="teacher"  ${typeV==='teacher'  ? 'selected':''}>👨‍🏫 Professor</option>
          </select>
        </div>
        <div class="form-group" id="oc-ref-student" style="${typeV==='student'?'':'display:none'}">
          <label>Aluno</label>
          <select id="oc-student" class="form-control"><option value="">Selecione…</option>${studentOptions}</select>
        </div>
        <div class="form-group" id="oc-ref-class" style="${typeV==='class'?'':'display:none'}">
          <label>Turma</label>
          <select id="oc-class" class="form-control"><option value="">Selecione…</option>${classOptions}</select>
        </div>
        <div class="form-group" id="oc-ref-teacher" style="${typeV==='teacher'?'':'display:none'}">
          <label>Professor</label>
          <select id="oc-teacher" class="form-control"><option value="">Selecione…</option>${teacherOptions}</select>
        </div>
        <div class="form-group">
          <label>Título *</label>
          <input type="text" id="oc-title" class="form-control" value="${E(existing?.title||'')}" placeholder="Ex: Indisciplina em sala, Briga no intervalo…" maxlength="200">
        </div>
        <div class="form-group">
          <label>Descrição</label>
          <textarea id="oc-desc" class="form-control" rows="3" placeholder="Detalhes da ocorrência…">${E(existing?.description||'')}</textarea>
        </div>
        <div class="form-group">
          <label>Severidade</label>
          <select id="oc-sev" class="form-control">
            <option value="baixa" ${sevV==='baixa'?'selected':''}>🟢 Baixa</option>
            <option value="media" ${sevV==='media'?'selected':''}>🟡 Média</option>
            <option value="alta"  ${sevV==='alta' ?'selected':''}>🔴 Alta</option>
          </select>
        </div>`,
      onConfirm: async (overlay, close) => {
        const type  = overlay.querySelector('#oc-type').value;
        const title = overlay.querySelector('#oc-title').value.trim();
        if (!title) { window.showToast('Informe o título.', 'warning'); return; }
        const data = {
          school_id: _schoolId, type, title,
          description: overlay.querySelector('#oc-desc').value.trim(),
          severity: overlay.querySelector('#oc-sev').value,
          student_id: overlay.querySelector('#oc-student')?.value || null,
          class_id:   overlay.querySelector('#oc-class')?.value   || null,
          teacher_id: overlay.querySelector('#oc-teacher')?.value || null,
        };
        try {
          existing
            ? await window.aula.updateOccurrence(existing.id, data)
            : await window.aula.createOccurrence(data);
          close();
          window.showToast(existing ? 'Ocorrência atualizada.' : 'Ocorrência registrada!', 'success');
          const fresh = await window.aula.getOccurrences(_schoolId);
          renderOcorrenciasView(parentEl, fresh);
        } catch(e) { window.showToast(e.message, 'error'); }
      },
    });

    // Toggle visibilidade dos campos de referência
    setTimeout(() => {
      document.getElementById('oc-type')?.addEventListener('change', function() {
        document.getElementById('oc-ref-student').style.display = this.value==='student' ? '' : 'none';
        document.getElementById('oc-ref-class').style.display   = this.value==='class'   ? '' : 'none';
        document.getElementById('oc-ref-teacher').style.display = this.value==='teacher' ? '' : 'none';
      });
    }, 50);
  }

  // ════════════════════════════════════════════════════════════════════════
  // ABA: ALUNOS
  // ════════════════════════════════════════════════════════════════════════

  async function renderAlunos(el) {
    el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-secondary)">Carregando…</div>';
    try {
      const students = await window.aula.getEscolarStudents(_schoolId);
      renderAlunosView(el, students);
    } catch(e) {
      el.innerHTML = `<p class="form-error">Erro: ${E(e.message)}</p>`;
    }
  }

  function renderAlunosView(el, students) {
    const rows = students.map(s => `
      <tr>
        <td><strong>${E(s.name)}</strong></td>
        <td style="font-size:13px">${E(s.registration||'—')}</td>
        <td style="font-size:13px">${E(s.email||'—')}</td>
        <td style="font-size:13px">${E(s.phone||'—')}</td>
        <td style="font-size:13px">${E(s.parent_name||'—')}</td>
        <td><span class="badge ${s.active?'badge-success':'badge-inactive'}">${s.active?'Ativo':'Inativo'}</span></td>
        <td style="white-space:nowrap">
          <button class="btn btn-ghost btn-sm" data-a-edit="${E(s.id)}">✏️</button>
          <button class="btn btn-danger btn-sm" data-a-del="${E(s.id)}">🗑️</button>
        </td>
      </tr>`).join('');

    el.innerHTML = `
      <div style="max-width:1000px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <div class="form-group" style="margin:0;flex:1;max-width:320px">
            <input type="search" id="a-search" class="form-control" placeholder="Buscar aluno…" style="padding:6px 10px;font-size:13px">
          </div>
          <button class="btn btn-primary" id="a-new">+ Novo Aluno</button>
        </div>
        ${students.length ? `
          <div class="table-wrap"><table class="module-table" id="a-table">
            <thead><tr><th>Nome</th><th>Matrícula</th><th>E-mail</th><th>Telefone</th><th>Responsável</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>` : `
          <div style="padding:48px;text-align:center;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px dashed var(--border-color)">
            <div style="font-size:40px;margin-bottom:8px">👨‍🎓</div>
            <h3 style="margin:0 0 6px">Nenhum aluno cadastrado</h3>
            <p style="margin:0;color:var(--text-secondary)">Clique em <strong>+ Novo Aluno</strong> para começar.</p></div>`}
      </div>`;

    document.getElementById('a-search')?.addEventListener('input', function() {
      const q = this.value.toLowerCase();
      document.querySelectorAll('#a-table tbody tr').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });
    document.getElementById('a-new').addEventListener('click', () => openAlunoModal(null, el));
    el.querySelectorAll('[data-a-edit]').forEach(btn =>
      btn.addEventListener('click', () => {
        const s = students.find(a => a.id == btn.dataset.aEdit);
        if (s) openAlunoModal(s, el);
      })
    );
    el.querySelectorAll('[data-a-del]').forEach(btn =>
      btn.addEventListener('click', async () => {
        if (!await window.confirmDialog('Excluir este aluno e suas matrículas?')) return;
        try {
          await window.aula.deleteEscolarStudent(Number(btn.dataset.aDel));
          window.showToast('Aluno excluído.', 'success');
          const fresh = await window.aula.getEscolarStudents(_schoolId);
          renderAlunosView(el, fresh);
        } catch(e) { window.showToast(e.message, 'error'); }
      })
    );
  }

  function openAlunoModal(existing, parentEl) {
    window.openModal({
      title: existing ? '✏️ Editar Aluno' : '👨‍🎓 Novo Aluno',
      bodyHtml: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="margin:0;grid-column:1/-1">
            <label>Nome completo *</label>
            <input type="text" id="al-name" class="form-control" value="${E(existing?.name||'')}" placeholder="Nome do aluno">
          </div>
          <div class="form-group" style="margin:0">
            <label>Matrícula</label>
            <input type="text" id="al-reg" class="form-control" value="${E(existing?.registration||'')}" placeholder="Nº matrícula">
          </div>
          <div class="form-group" style="margin:0">
            <label>E-mail</label>
            <input type="email" id="al-email" class="form-control" value="${E(existing?.email||'')}" placeholder="email@aluno.com">
          </div>
          <div class="form-group" style="margin:0">
            <label>Telefone</label>
            <input type="text" id="al-phone" class="form-control" value="${E(existing?.phone||'')}" placeholder="(00) 00000-0000">
          </div>
          <div class="form-group" style="margin:0">
            <label>Nome do responsável</label>
            <input type="text" id="al-parent" class="form-control" value="${E(existing?.parent_name||'')}" placeholder="Nome do pai/mãe/responsável">
          </div>
          <div class="form-group" style="margin:0;grid-column:1/-1">
            <label>Telefone do responsável</label>
            <input type="text" id="al-parent-phone" class="form-control" value="${E(existing?.parent_phone||'')}" placeholder="(00) 00000-0000">
          </div>
        </div>`,
      onConfirm: async (overlay, close) => {
        const name = overlay.querySelector('#al-name').value.trim();
        if (!name) { window.showToast('Nome obrigatório.', 'warning'); return; }
        const data = {
          school_id: _schoolId,
          name,
          registration:  overlay.querySelector('#al-reg').value.trim() || null,
          email:         overlay.querySelector('#al-email').value.trim() || null,
          phone:         overlay.querySelector('#al-phone').value.trim() || null,
          parent_name:   overlay.querySelector('#al-parent').value.trim() || null,
          parent_phone:  overlay.querySelector('#al-parent-phone').value.trim() || null,
          active: true,
        };
        try {
          existing
            ? await window.aula.updateEscolarStudent(existing.id, data)
            : await window.aula.createEscolarStudent(data);
          close();
          window.showToast('Aluno salvo!', 'success');
          const fresh = await window.aula.getEscolarStudents(_schoolId);
          renderAlunosView(parentEl, fresh);
        } catch(e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // ABA: ASSINATURA
  // ════════════════════════════════════════════════════════════════════════

  async function renderAssinatura(el) {
    el.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-secondary)">Carregando…</div>';
    try {
      const st = await window.aula.getEscolarStatus(_schoolId);
      const plans = [
        { key: 'lite',  label: 'ESCOLAR LITE',  price: 'R$560/mês',   extra: '+R$50/turma exc.', maxClasses: 10,  desc: 'Ideal para escolas com até 10 turmas' },
        { key: 'basic', label: 'ESCOLAR BASIC',  price: 'R$980/mês',   extra: '+R$42/turma exc.', maxClasses: 30,  desc: 'Escolas com até 30 turmas' },
        { key: 'flex',  label: 'ESCOLAR FLEX',   price: 'R$1.790/mês', extra: '+R$28/turma exc.', maxClasses: 60,  desc: 'Escolas com até 60 turmas' },
        { key: 'total', label: 'ESCOLAR TOTAL',  price: 'R$2.600/mês', extra: '+R$23/turma exc. (redes)', maxClasses: 0, desc: 'Ilimitado por unidade · Redes: até 100 turmas incluídas' },
      ];

      const plansHtml = plans.map(p => {
        const isCurrent = st?.active && st.plan === p.key;
        return `
          <div style="border:2px solid ${isCurrent ? '#6366f1':'var(--border-color)'};border-radius:10px;padding:20px;flex:1;min-width:220px">
            <div style="font-size:18px;font-weight:700;color:${isCurrent?'#6366f1':'inherit'}">${E(p.label)}</div>
            <div style="font-size:24px;font-weight:800;margin:8px 0">${E(p.price)}</div>
            <div style="font-size:12px;color:#6366f1;font-weight:600;margin-bottom:6px">${E(p.extra)}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">${E(p.desc)}</div>
            <ul style="font-size:13px;padding-left:18px;margin:0 0 16px">
              <li>${p.maxClasses ? `Até ${p.maxClasses} turmas incluídas` : 'Turmas ilimitadas (unidade)'}</li>
              <li>Chamada diária com diário</li>
              <li>Histórico de presença por aluno</li>
              <li>Ocorrências por aluno/turma/professor</li>
            </ul>
            ${isCurrent
              ? `<span class="badge badge-success">✅ Plano atual</span>`
              : `<button class="btn btn-primary btn-sm" data-subscribe="${E(p.key)}">${st?.active ? '🔄 Mudar para este' : '▶️ Contratar'}</button>`}
          </div>`;
      }).join('');

      el.innerHTML = `
        <div style="max-width:800px">
          <h3 style="margin:0 0 20px">💳 Addon ESCOLAR</h3>
          ${st?.active ? `
            <div class="notification-panel" style="margin-bottom:24px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px">
              <strong style="color:#16a34a">✅ Addon ativo — ${E(st.plan.toUpperCase())}</strong>
              <p style="margin:6px 0 0;font-size:13px;color:var(--text-secondary)">
                ${st.maxClasses ? `Até ${st.maxClasses} turmas` : 'Turmas ilimitadas'} · ${st.classCount} turma(s) cadastrada(s)
              </p>
              <button class="btn btn-ghost btn-sm" id="esc-cancel" style="margin-top:12px;color:#dc2626">Cancelar addon</button>
            </div>` : `
            <div class="notification-panel" style="margin-bottom:24px;background:#fafafa;border:1px solid var(--border-color);border-radius:8px;padding:16px">
              <strong>ℹ️ Addon não contratado</strong>
              <p style="font-size:13px;color:var(--text-secondary);margin:6px 0 0">Contrate um plano abaixo para habilitar Chamada, Diário e Ocorrências.</p>
            </div>`}
          <div style="display:flex;gap:16px;flex-wrap:wrap">${plansHtml}</div>
        </div>`;

      el.querySelectorAll('[data-subscribe]').forEach(btn =>
        btn.addEventListener('click', async () => {
          const plan = btn.dataset.subscribe;
          if (!await window.confirmDialog(`Contratar ESCOLAR ${plan.toUpperCase()}?`)) return;
          try {
            await window.aula.subscribeEscolar({ school_id: _schoolId, plan_type: plan });
            window.showToast('Addon ESCOLAR ativado!', 'success');
            renderAssinatura(el);
          } catch(e) { window.showToast(e.message, 'error'); }
        })
      );
      document.getElementById('esc-cancel')?.addEventListener('click', async () => {
        if (!await window.confirmDialog('Cancelar o addon ESCOLAR? O acesso será revogado.')) return;
        try {
          await window.aula.cancelEscolar({ school_id: _schoolId });
          window.showToast('Addon cancelado.', 'success');
          renderAssinatura(el);
        } catch(e) { window.showToast(e.message, 'error'); }
      });
    } catch(e) {
      el.innerHTML = `<p class="form-error">Erro: ${E(e.message)}</p>`;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // MOUNT
  // ════════════════════════════════════════════════════════════════════════

  async function mount(container) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Carregando módulo Escolar…</div>';

    // Carrega dados base
    try {
      [_classes, _teachers] = await Promise.all([
        window.aula.getClasses(_schoolId).catch(() => []),
        window.aula.getTeachers(_schoolId).catch(() => []),
      ]);
    } catch(_) {}

    container.innerHTML = renderShell();

    // Bind tabs
    container.querySelectorAll('.module-tab').forEach(btn =>
      btn.addEventListener('click', () => {
        _tab = btn.dataset.t;
        container.querySelectorAll('.module-tab').forEach(b => b.classList.toggle('active', b.dataset.t === _tab));
        switchTab(container.querySelector('#escolar-content'));
      })
    );

    switchTab(container.querySelector('#escolar-content'));
  }

  function switchTab(el) {
    if (!el) return;
    el.innerHTML = '';
    if (_tab === 'chamada')      renderChamada(el);
    else if (_tab === 'diario')  renderDiario(el);
    else if (_tab === 'ocorrencias') renderOcorrencias(el);
    else if (_tab === 'alunos')  renderAlunos(el);
    else if (_tab === 'assinatura') renderAssinatura(el);
  }

  return {
    async initialize(schoolId) { _schoolId = schoolId; },
    mount,
  };
})();
