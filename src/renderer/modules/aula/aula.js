/**
 * Módulo: Aula — Horário de Turma
 *
 * Funcionalidades:
 *  • Visualização do horário atual (grid período × dia)
 *  • Sugestão automática de horário (disponibilidade + conflitos cross-class)
 *    - Refazer sugestão  – nova rodada do algoritmo
 *    - Salvar sugestão   – grava rascunho (type='suggestion')
 *    - Confirmar         – pede JUSTIFICATIVA, grava histórico e aplica ao horário
 *  • Aba "Sugestões Salvas"  – listar / ver / confirmar / excluir rascunhos
 *  • Aba "Histórico"         – horários confirmados com justificativa
 *  • Imprimir: visão por turma ou por professor (abre janela de impressão)
 */

window.ModuleAula = (() => {

  // ─── Estado ────────────────────────────────────────────────────────────────
  let S = {
    classes: [], shifts: [], curricula: [],
    timeSlots: [], classCurricula: [], classTeacherCurricula: [],
    lessons: [], snapshots: [], schoolSnapshots: [],
    selectedClassId: null,
    activeTab: 'current',    // 'current' | 'suggestions' | 'history'
    shiftFilter: { suggestions: null, history: null },
  };

  const W = ['','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const WFULL = ['','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const PAL = ['#0369a1','#7c3aed','#059669','#d97706','#dc2626',
               '#db2777','#0891b2','#65a30d','#9333ea','#ea580c'];

  // ─── Ponto de entrada ──────────────────────────────────────────────────────
  async function mount(container) {
    container.innerHTML = `
      <div class="module-header">
        <div>
          <div class="module-title">📝 Horário de Aulas</div>
          <div class="module-subtitle">${escHtml(window.AppContext?.schoolName ?? '')}</div>
        </div>
        <div>
          <button id="btn-suggest-school" class="btn btn-primary">✨ Sugerir Horário</button>
        </div>
      </div>
      <div id="aula-tabs">
        <div style="display:flex;gap:0;border-bottom:2px solid var(--color-border);margin-bottom:16px">
          <button class="tab-btn active" data-tab="current" >📅 Horário Atual</button>
          <button class="tab-btn"        data-tab="suggestions">💾 Sugestões</button>
          <button class="tab-btn"        data-tab="history"     >📋 Histórico</button>
        </div>
        <div id="tab-current">
          <div class="context-bar" style="margin-bottom:14px">
            <label>Turma</label>
            <select id="class-select"><option value="">— Selecione a turma —</option></select>
          </div>
          <div id="schedule-content"></div>
        </div>
        <div id="tab-suggestions" style="display:none"></div>
        <div id="tab-history"     style="display:none"></div>
      </div>
    `;

    // estilos de aba inline
    container.querySelectorAll('.tab-btn').forEach(btn => {
      Object.assign(btn.style, {
        padding:'8px 18px', border:'none', background:'transparent',
        cursor:'pointer', fontWeight:'600', fontSize:'13px',
        color:'var(--color-text-muted)', borderBottom:'2px solid transparent',
        marginBottom:'-2px', transition:'all .15s',
      });
    });
    container.querySelector('.tab-btn.active').style.cssText +=
      ';color:var(--color-primary);border-bottom-color:var(--color-primary)';

    container.querySelectorAll('.tab-btn').forEach(btn =>
      btn.addEventListener('click', () => switchTab(container, btn.dataset.tab))
    );

    container.querySelector('#class-select').addEventListener('change', async e => {
      S.selectedClassId = Number(e.target.value) || null;
      await refreshAll(container);
    });

    container.querySelector('#btn-suggest-school').addEventListener('click', () => openSchoolSuggestionFlow(container));

    await loadMasterData(container);
  }

  function switchTab(container, tab) {
    S.activeTab = tab;
    container.querySelectorAll('.tab-btn').forEach(b => {
      const active = b.dataset.tab === tab;
      b.style.color = active ? 'var(--color-primary)' : 'var(--color-text-muted)';
      b.style.borderBottomColor = active ? 'var(--color-primary)' : 'transparent';
      b.classList.toggle('active', active);
    });
    ['current','suggestions','history'].forEach(t => {
      container.querySelector(`#tab-${t}`).style.display = t === tab ? '' : 'none';
    });
    if (tab === 'suggestions') renderSchoolSnapsTab(container, 'suggestion');
    if (tab === 'history')     renderSchoolSnapsTab(container, 'confirmed');
  }

  // Extrai o rótulo base removendo " — {NomeTurma}" do final
  function extractBaseLabel(label) {
    for (const cls of S.classes) {
      const suffix = ` — ${cls.name}`;
      if (label.endsWith(suffix)) return label.slice(0, -suffix.length);
    }
    return label;
  }

  // Agrupa snapshots por rótulo base
  function groupSchoolSnaps(snaps) {
    const map = new Map();
    for (const s of snaps) {
      const base = extractBaseLabel(s.label);
      if (!map.has(base)) map.set(base, { label: base, snaps: [], shifts: new Set(), date: null, justification: null });
      const g = map.get(base);
      g.snaps.push(s);
      g.shifts.add(s.shift_name);
      const d = s.confirmed_at || s.created_at;
      if (!g.date || d > g.date) { g.date = d; g.justification = s.justification; }
    }
    return [...map.values()];
  }

  // ─── Carregamento de dados ─────────────────────────────────────────────────
  async function loadMasterData(container) {
    const sid = window.AppContext.schoolId;
    try {
      [S.classes, S.shifts, S.curricula, S.schoolSnapshots] = await Promise.all([
        window.DB.getClasses(sid), window.DB.getShifts(sid), window.DB.getCurricula(sid),
        window.DB.getSchoolSnapshots(sid),
      ]);
    } catch (e) { window.showToast('Erro ao carregar dados: ' + e.message, 'error'); return; }

    const sel = container.querySelector('#class-select');
    sel.innerHTML = '<option value="">— Selecione a turma —</option>' +
      S.classes.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
    renderCurrentTab(container);
  }

  async function refreshClassTab(container) {
    if (!S.selectedClassId) { renderCurrentTab(container); return; }
    const cls   = S.classes.find(c => c.id === S.selectedClassId);
    const shift = S.shifts.find(s => s.id === cls?.shift_id);
    try {
      [S.timeSlots, S.classCurricula, S.classTeacherCurricula, S.lessons] =
        await Promise.all([
          shift ? window.DB.getTimeSlots(shift.id) : Promise.resolve([]),
          window.DB.getClassCurricula(S.selectedClassId),
          window.DB.getClassTeacherCurricula(S.selectedClassId),
          window.DB.getLessons(S.selectedClassId),
        ]);
    } catch (e) {
      window.showToast('Erro ao carregar: ' + e.message, 'error');
      S.timeSlots = []; S.classCurricula = []; S.classTeacherCurricula = []; S.lessons = [];
    }
    renderCurrentTab(container);
  }

  async function refreshSchoolSnapshots(container) {
    try {
      S.schoolSnapshots = await window.DB.getSchoolSnapshots(window.AppContext.schoolId);
    } catch (e) {
      window.showToast('Erro ao carregar snapshots: ' + e.message, 'error');
      S.schoolSnapshots = [];
    }
    if (S.activeTab === 'suggestions') renderSchoolSnapsTab(container, 'suggestion');
    if (S.activeTab === 'history')     renderSchoolSnapsTab(container, 'confirmed');
  }

  async function refreshAll(container) {
    await Promise.all([refreshClassTab(container), refreshSchoolSnapshots(container)]);
  }

  // ─── Aba: Horário Atual ────────────────────────────────────────────────────
  function renderCurrentTab(container) {
    const el  = container.querySelector('#schedule-content');
    if (!el) return; // guard

    if (!S.selectedClassId) {
      el.innerHTML = `<div class="empty-state"><div class="icon">📝</div>
        <p>Selecione uma turma para visualizar o horário.</p></div>`;
      return;
    }

    const cls = S.classes.find(c => c.id === S.selectedClassId);
    const shift = S.shifts.find(s => s.id === cls?.shift_id);

    if (!S.timeSlots.length) {
      el.innerHTML = `<div class="empty-state"><div class="icon">⏰</div>
        <p>Nenhum período configurado para o turno <strong>${escHtml(shift?.name ?? '—')}</strong>.</p></div>`;
      return;
    }

    const periods = [...new Set(S.timeSlots.map(t => t.period))].sort((a,b) => a-b);
    const lmap    = {};
    S.lessons.forEach(l => { lmap[`${l.weekday}_${l.period}`] = l; });

    // botões de ação
    let html = `<div style="display:flex;align-items:center;justify-content:space-between;
        flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div style="font-size:13px;color:var(--color-text-muted)">
        <strong>${escHtml(cls?.name)}</strong> · turno ${escHtml(shift?.name ?? '—')}
        · <strong>${S.lessons.length}</strong> aulas alocadas
      </div>
      ${S.lessons.length ? `<div style="display:flex;gap:8px">
        <button id="btn-print-class" class="btn btn-ghost btn-sm">🖨️ Imprimir</button>
        <button id="btn-clear" class="btn btn-ghost btn-sm" style="color:var(--color-danger,#dc2626)">🗑️ Limpar</button>
      </div>` : ''}
    </div>`;

    // grid
    html += buildGrid(periods, lmap, (day, period) => {
      const l = lmap[`${day}_${period}`];
      if (!l) return null;
      const ctc = S.classTeacherCurricula.find(t => t.curricula_id === l.curricula_id);
      return { label: l.subject || '?', sub: ctc?.teacher_name ?? null, color: null };
    });

    // legenda componentes
    if (S.classCurricula.length) {
      html += `<div style="margin-top:12px;padding:10px 14px;border-radius:8px;
          background:var(--color-bg);font-size:12px">
        <strong style="color:var(--color-text-muted)">Componentes:</strong>
        <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:5px">
          ${S.classCurricula.map(cc => {
            const ctc = S.classTeacherCurricula.find(t => t.curricula_id === cc.curricula_id);
            const n   = S.lessons.filter(l => l.curricula_id === cc.curricula_id).length;
            const ok  = n >= cc.weekly_lessons;
            return `<span style="padding:3px 8px;border-radius:10px;border:1px solid ${ok?'var(--color-success,#16a34a)':'var(--color-border)'};
              background:${ok?'var(--color-success-bg,#dcfce7)':'var(--color-bg-secondary)'}">
              ${escHtml(cc.curricula_name)} <span style="opacity:.65">${n}/${cc.weekly_lessons}
              ${ctc?`· ${escHtml(ctc.teacher_name)}`:'· sem prof.'}</span></span>`;
          }).join('')}
        </div>
      </div>`;
    }

    el.innerHTML = html;

    el.querySelector('#btn-print-class')?.addEventListener('click', () =>
      printSchedule('class', S.selectedClassId, S.lessons, S.timeSlots, S.classTeacherCurricula, S.classes, S.shifts)
    );
    el.querySelector('#btn-clear')?.addEventListener('click', async () => {
      if (!await window.confirmDialog('Remover todas as aulas da turma?')) return;
      try {
        await Promise.all(S.lessons.map(l => window.DB.deleteLesson(l.id)));
        await refreshAll(container);
        window.showToast('Horário limpo.', 'success');
      } catch (e) { window.showToast(e.message, 'error'); }
    });
  }

  // ─── Abas Escola-wide: Sugestões e Histórico ─────────────────────────────
  /**
   * Renderiza a aba de sugestões (type='suggestion') ou histórico (type='confirmed')
   * com dados da escola toda, agrupados por rótulo base, filtrável por turno.
   */
  function renderSchoolSnapsTab(container, type) {
    const tabId = type === 'suggestion' ? 'tab-suggestions' : 'tab-history';
    const el = container.querySelector(`#${tabId}`);
    const sfKey = type === 'suggestion' ? 'suggestions' : 'history';

    // filtra por tipo e turno
    const allSnaps = S.schoolSnapshots.filter(s => s.type === type);
    const filtered = S.shiftFilter[sfKey]
      ? allSnaps.filter(s => s.shift_id === S.shiftFilter[sfKey])
      : allSnaps;

    // pills de turno
    const shiftIds = [...new Set(allSnaps.map(s => s.shift_id))];
    const shifts = shiftIds.map(id => S.shifts.find(sh => sh.id === id)).filter(Boolean);
    const pillsHtml = shifts.length > 1 ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        <button class="pill-shift ${!S.shiftFilter[sfKey] ? 'active' : ''}"
          data-sf-id="" style="padding:4px 12px;border-radius:20px;border:1px solid var(--color-border);
          cursor:pointer;font-size:12px;background:${!S.shiftFilter[sfKey]?'var(--color-primary)':'var(--color-bg-secondary)'};
          color:${!S.shiftFilter[sfKey]?'#fff':'inherit'}">Todos os turnos</button>
        ${shifts.map(sh => `<button class="pill-shift ${S.shiftFilter[sfKey]===sh.id?'active':''}"
          data-sf-id="${sh.id}" style="padding:4px 12px;border-radius:20px;border:1px solid var(--color-border);
          cursor:pointer;font-size:12px;background:${S.shiftFilter[sfKey]===sh.id?'var(--color-primary)':'var(--color-bg-secondary)'};
          color:${S.shiftFilter[sfKey]===sh.id?'#fff':'inherit'}">${escHtml(sh.name)}</button>`).join('')}
      </div>` : '';

    // grupos
    const groups = groupSchoolSnaps(filtered);

    if (!groups.length) {
      const emptyMsg = type === 'suggestion'
        ? 'Nenhuma sugestão salva. Use <strong>✨ Sugerir Horário</strong> para gerar e salvar uma proposta.'
        : 'Nenhum horário confirmado ainda.';
      el.innerHTML = pillsHtml + `<div class="empty-state">
        <div class="icon">${type === 'suggestion' ? '💾' : '📋'}</div>
        <p>${emptyMsg}</p></div>`;
    } else {
      const isHist = type === 'confirmed';
      const rows = groups.map(g => {
        const shiftBadges = [...g.shifts].map(sn =>
          `<span style="padding:2px 7px;border-radius:10px;font-size:11px;
            background:var(--color-bg-secondary);border:1px solid var(--color-border)">${escHtml(sn)}</span>`
        ).join(' ');
        const date = fmtDate(g.date);
        const justCol = isHist
          ? `<td style="padding:8px 12px;font-size:12px;color:var(--color-text-muted);
              max-width:200px;white-space:pre-wrap">${escHtml(g.justification || '—')}</td>` : '';
        const actions = isHist
          ? `<button class="btn btn-ghost btn-sm" data-grp-view="${escHtml(g.label)}">👁️ Ver</button>
             <button class="btn btn-ghost btn-sm" data-grp-reimpl="${escHtml(g.label)}">↩️ Reimplantar</button>
             <button class="btn btn-ghost btn-sm" data-grp-print="${escHtml(g.label)}">🖨️</button>`
          : `<button class="btn btn-ghost btn-sm" data-grp-view="${escHtml(g.label)}">👁️ Ver</button>
             <button class="btn btn-primary btn-sm" data-grp-confirm="${escHtml(g.label)}">✅ Confirmar</button>
             <button class="btn btn-danger btn-sm" data-grp-del="${escHtml(g.label)}">🗑️</button>`;
        return `<tr style="border-top:1px solid var(--color-border)">
          <td style="padding:8px 12px;font-weight:600">${escHtml(g.label)}</td>
          <td style="padding:8px 12px">${shiftBadges}</td>
          <td style="padding:8px 12px;font-size:12px;color:var(--color-text-muted)">${date}</td>
          ${justCol}
          <td style="padding:8px 12px;text-align:right">
            <div style="display:flex;gap:6px;justify-content:flex-end">${actions}</div>
          </td>
        </tr>`;
      });

      const justTh = isHist ? '<th style="padding:8px 12px;text-align:left">Justificativa</th>' : '';
      el.innerHTML = pillsHtml + `<table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--color-bg-secondary);font-size:12px">
          <th style="padding:8px 12px;text-align:left">Rótulo</th>
          <th style="padding:8px 12px;text-align:left">Turnos</th>
          <th style="padding:8px 12px;text-align:left">${isHist ? 'Confirmado em' : 'Criado em'}</th>
          ${justTh}
          <th style="padding:8px 12px"></th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>`;
    }

    // pills: filtro de turno
    el.querySelectorAll('.pill-shift').forEach(btn => {
      btn.addEventListener('click', () => {
        S.shiftFilter[sfKey] = Number(btn.dataset.sfId) || null;
        renderSchoolSnapsTab(container, type);
      });
    });

    // helper: encontra snapshots do grupo pelo label base
    const snapsOfGroup = (label) => S.schoolSnapshots.filter(
      s => s.type === type && extractBaseLabel(s.label) === label
    );

    // 👁️ Ver grupo
    el.querySelectorAll('[data-grp-view]').forEach(btn =>
      btn.addEventListener('click', () => {
        const label = btn.dataset.grpView;
        openSnapshotGroupViewer(snapsOfGroup(label), label, container);
      })
    );

    // ✅ Confirmar grupo (sugestões)
    el.querySelectorAll('[data-grp-confirm]').forEach(btn =>
      btn.addEventListener('click', () => {
        const label = btn.dataset.grpConfirm;
        const snaps = snapsOfGroup(label);
        openConfirmJustificationModal(null, `Confirmar "${label}"`, async (just) => {
          try {
            await Promise.all(snaps.map(s => window.DB.confirmSnapshot(s.id, just)));
            await refreshAll(container);
            switchTab(container, 'history');
            window.showToast('Horário confirmado!', 'success');
          } catch (e) { window.showToast(e.message, 'error'); }
        });
      })
    );

    // 🗑️ Excluir grupo (sugestões)
    el.querySelectorAll('[data-grp-del]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const label = btn.dataset.grpDel;
        const snaps = snapsOfGroup(label);
        if (!await window.confirmDialog(`Excluir todas as ${snaps.length} sugestão(ões) de "${label}"?`)) return;
        try {
          await Promise.all(snaps.map(s => window.DB.deleteScheduleSnapshot(s.id)));
          await refreshSchoolSnapshots(container);
          window.showToast('Sugestão excluída.', 'success');
        } catch (e) { window.showToast(e.message, 'error'); }
      })
    );

    // ↩️ Reimplantar grupo (histórico)
    el.querySelectorAll('[data-grp-reimpl]').forEach(btn =>
      btn.addEventListener('click', async () => {
        const label = btn.dataset.grpReimpl;
        const snaps = snapsOfGroup(label);
        openConfirmJustificationModal(null, `Reimplantar "${label}"`, async (just) => {
          try {
            for (const s of snaps) {
              const full = await window.DB.getScheduleSnapshot(s.id);
              const saved = await window.DB.saveScheduleSnapshot({
                class_id: s.class_id,
                school_id: window.AppContext.schoolId,
                label: `↩️ Reimplantado: ${label} — ${s.class_name}`,
                type: 'suggestion',
                slots: full.slots,
              });
              const newSnaps = await window.DB.getScheduleSnapshots(s.class_id);
              if (newSnaps.length) await window.DB.confirmSnapshot(newSnaps[0].id, just);
            }
            await refreshAll(container);
            switchTab(container, 'current');
            window.showToast('Horário reimplantado!', 'success');
          } catch (e) { window.showToast(e.message, 'error'); }
        });
      })
    );

    // 🖨️ Imprimir grupo (histórico)
    el.querySelectorAll('[data-grp-print]').forEach(btn =>
      btn.addEventListener('click', () => {
        const label = btn.dataset.grpPrint;
        openSnapshotGroupViewer(snapsOfGroup(label), label, container, true);
      })
    );
  }

  // ─── Sugestão Escola-wide ──────────────────────────────────────────────────

  /** Processa TODAS as turmas da escola em sequência, compartilhando o busyCopy entre elas.
   *  Garante que o mesmo professor não seja alocado no mesmo slot em turmas diferentes. */
  function runSchoolSuggestionAlgorithm(schoolData) {
    const { classes: classDataList, teacherData } = schoolData;
    const key = (w, p) => `${w}_${p}`;

    // busyCopy inicial: apenas compromissos externos (outras escolas)
    const busyCopy = {};
    for (const [tid, td] of Object.entries(teacherData)) {
      busyCopy[String(tid)] = new Set(td.busySlots.map(b => key(b.weekday, b.period)));
    }

    const classResults = [];
    for (const { cls, timeSlots, classCurricula, teacherMap } of classDataList) {
      if (!timeSlots.length || !classCurricula.length) {
        classResults.push({
          classId: cls.id, className: cls.name, shiftName: cls.shift_name,
          timeSlots, result: [],
          warnings: [classCurricula.length
            ? `⏰ Turma sem períodos configurados no turno.`
            : `ℹ️ Turma sem componentes curriculares com carga definida.`],
        });
        continue;
      }

      const periods  = [...new Set(timeSlots.map(t => t.period))].sort((a,b) => a-b);
      const allSlots = [];
      for (const w of [1,2,3,4,5,6]) for (const p of periods) allSlots.push({ weekday: w, period: p });
      const classUsed = new Set();
      const result    = [];
      const warnings  = [];

      for (const cc of classCurricula) {
        const teacher = teacherMap.find(t => t.curricula_id === cc.curricula_id);
        const needed  = cc.weekly_lessons;
        let candidates;

        if (teacher) {
          const tid      = String(teacher.person_id);
          if (!busyCopy[tid]) busyCopy[tid] = new Set();
          const busy     = busyCopy[tid];
          const td       = teacherData[tid] || teacherData[teacher.person_id];
          const availSet = td?.hasAvailability
            ? new Set(td.availability.map(a => key(a.weekday, a.period)))
            : null;
          if (!td?.hasAvailability)
            warnings.push(`⚠️ <strong>${escHtml(cc.curricula_name)}</strong>: `
              + `prof. <em>${escHtml(teacher.teacher_name)}</em> sem disponibilidade cadastrada.`);
          candidates = allSlots.filter(s => {
            const k = key(s.weekday, s.period);
            if (classUsed.has(k))            return false;
            if (busy.has(k))                 return false;
            if (availSet && !availSet.has(k)) return false;
            return true;
          });
        } else {
          warnings.push(`ℹ️ <strong>${escHtml(cc.curricula_name)}</strong>: sem professor atribuído.`);
          candidates = allSlots.filter(s => !classUsed.has(key(s.weekday, s.period)));
        }

        const picked   = spreadPick(candidates, needed);
        const unplaced = needed - picked.length;
        for (const s of picked) {
          const k = key(s.weekday, s.period);
          classUsed.add(k);
          if (teacher) busyCopy[String(teacher.person_id)].add(k);
        }
        if (unplaced > 0)
          warnings.push(`❌ <strong>${escHtml(cc.curricula_name)}</strong>: `
            + `${unplaced} aula(s) não alocadas — conflito ou disponibilidade insuficiente.`);

        result.push({
          curricula_id:   cc.curricula_id,
          curricula_name: cc.curricula_name,
          teacher_id:     teacher?.person_id   ?? null,
          teacher_name:   teacher?.teacher_name ?? null,
          weekly_lessons: needed,
          slots:          picked,
          unplaced,
        });
      }
      classResults.push({ classId: cls.id, className: cls.name, shiftName: cls.shift_name, timeSlots, result, warnings });
    }
    return classResults;
  }

  async function openSchoolSuggestionFlow(container) {
    // ── spinner ──────────────────────────────────────────────────────────────
    const spinner = document.createElement('div');
    spinner.id = 'school-sugg-overlay';
    Object.assign(spinner.style, {
      position:'fixed', inset:'0', background:'rgba(0,0,0,.55)',
      zIndex:'9999', display:'flex', alignItems:'center', justifyContent:'center',
    });
    spinner.innerHTML = `<div style="background:var(--color-bg,#fff);border-radius:12px;
      padding:36px 48px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.25)">
      <div style="font-size:40px">⏳</div>
      <p style="margin-top:12px;color:var(--color-text-muted);font-size:14px">
        Verificando disponibilidades de todas as turmas…
      </p>
    </div>`;
    document.body.appendChild(spinner);

    let schoolData;
    try { schoolData = await window.DB.suggestSchoolSchedule(window.AppContext.schoolId); }
    catch (e) { spinner.remove(); window.showToast(e.message, 'error'); return; }
    spinner.remove();

    if (!schoolData?.classes?.length) {
      window.showToast('Nenhuma turma cadastrada na escola.', 'warning'); return;
    }

    const classResults = runSchoolSuggestionAlgorithm(schoolData);
    const validResults = classResults.filter(cr => cr.result.length > 0);

    if (!validResults.length) {
      window.showToast('Nenhuma turma possui componentes com carga semanal definida.', 'warning'); return;
    }

    const totalNeeded = classResults.reduce((s, cr) => s + cr.result.reduce((a,x) => a + x.weekly_lessons, 0), 0);
    const totalPlaced = classResults.reduce((s, cr) => s + cr.result.reduce((a,x) => a + x.slots.length, 0), 0);
    const hasUnplaced = classResults.some(cr => cr.result.some(x => x.unplaced > 0));

    // paleta por curricula_id (global, estável entre turmas)
    const globalColorOf = {};
    let colorIdx = 0;
    classResults.forEach(cr => cr.result.forEach(item => {
      if (!globalColorOf[item.curricula_id])
        globalColorOf[item.curricula_id] = PAL[colorIdx++ % PAL.length];
    }));

    // ── builders de conteúdo ─────────────────────────────────────────────────

    function buildAllClassesView() {
      return classResults.map(cr => {
        const pl = cr.result.reduce((s,x)=>s+x.slots.length,0);
        const nd = cr.result.reduce((s,x)=>s+x.weekly_lessons,0);
        const ok = !cr.result.some(x=>x.unplaced>0) && cr.result.length > 0;
        let inner;
        if (!cr.result.length) {
          inner = `<p style="font-size:12px;color:var(--color-text-muted);padding:8px 0">
            ${cr.warnings.map(w=>w.replace(/<[^>]+>/g,'')).join(' ')}</p>`;
        } else {
          const periods = [...new Set(cr.timeSlots.map(t=>t.period))].sort((a,b)=>a-b);
          const suggMap = {};
          cr.result.forEach(item => item.slots.forEach(s => {
            suggMap[`${s.weekday}_${s.period}`] = { ...item };
          }));
          const colorOf = {};
          cr.result.forEach(item => { colorOf[item.curricula_id] = globalColorOf[item.curricula_id]; });
          const grid = buildColorGrid(periods, cr.timeSlots, suggMap, colorOf);
          const legend = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">
            ${cr.result.map(item => {
              const c = colorOf[item.curricula_id];
              return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;
                padding:2px 7px;border-radius:8px;background:${c}18;border:1px solid ${c}">
                <span style="width:7px;height:7px;border-radius:50%;background:${c};display:inline-block"></span>
                ${escHtml(item.curricula_name)}
                <span style="opacity:.6">${item.slots.length}/${item.weekly_lessons}</span>
                ${item.unplaced>0?`<span style="color:#dc2626;font-weight:600"> ⚠${item.unplaced}</span>`:''}
              </span>`;
            }).join('')}
          </div>`;
          const warns = cr.warnings.length
            ? `<div style="margin-top:6px;padding:5px 10px;background:var(--color-warning-bg,#fef9c3);
                border-radius:6px;font-size:11px;border-left:3px solid #b45309">
                <ul style="margin:0;padding-left:14px">
                  ${cr.warnings.map(w=>`<li>${w}</li>`).join('')}
                </ul></div>` : '';
          inner = grid + legend + warns;
        }
        return `<div style="margin-bottom:28px;padding:16px 18px;border-radius:10px;
            border:1px solid var(--color-border);background:var(--color-bg,#fff)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <span style="font-size:15px;font-weight:700">${escHtml(cr.className)}</span>
            <span style="font-size:11px;color:var(--color-text-muted)">${escHtml(cr.shiftName)}</span>
            <span style="margin-left:auto;font-size:12px;
              color:${ok?'#16a34a':'#b45309'}">${ok?'✅':'⚠️'} ${pl}/${nd} aulas</span>
          </div>
          ${inner}
        </div>`;
      }).join('');
    }

    function buildAllTeachersView() {
      // Agrega slots de todas as turmas por professor
      const byTeacher = {};
      // Precisamos de timeSlots por período: usamos todos os períodos do conjunto
      const allPeriods = new Set();
      classResults.forEach(cr => cr.timeSlots.forEach(t => allPeriods.add(t.period)));
      const periods = [...allPeriods].sort((a,b)=>a-b);
      // mapa período → horário (usa primeiro encontrado)
      const tsMap = {};
      classResults.forEach(cr => cr.timeSlots.forEach(t => { tsMap[t.period] = t; }));

      classResults.forEach(cr => {
        cr.result.forEach(item => {
          const tid   = String(item.teacher_id ?? '__sem__');
          const tname = item.teacher_name || 'Sem professor';
          if (!byTeacher[tid]) byTeacher[tid] = { name: tname, slots: [] };
          item.slots.forEach(s => {
            byTeacher[tid].slots.push({
              weekday:        s.weekday,
              period:         s.period,
              curricula_name: item.curricula_name,
              class_name:     cr.className,
              curricula_id:   item.curricula_id,
            });
          });
        });
      });

      if (!Object.keys(byTeacher).length)
        return `<p style="color:var(--color-text-muted);padding:24px;text-align:center">
          Nenhum professor atribuído nas sugestões.</p>`;

      return Object.entries(byTeacher).sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([, td]) => {
        const slotMap = {};
        td.slots.forEach(s => {
          const k = `${s.weekday}_${s.period}`;
          // um professor pode ter múltiplas turmas — mostra todas
          if (!slotMap[k]) slotMap[k] = [];
          slotMap[k].push(s);
        });

        let tbl = `<div class="schedule-grid" style="margin:0"><table>
          <thead><tr>
            <th style="width:40px;font-size:11px">Per.</th>
            <th style="width:78px;font-size:10px">Horário</th>
            ${[1,2,3,4,5,6].map(d=>`<th style="font-size:11px">${W[d]}</th>`).join('')}
          </tr></thead><tbody>`;
        periods.forEach(p => {
          const ts = tsMap[p];
          tbl += `<tr>
            <td style="font-weight:700;text-align:center;font-size:12px">${p}º</td>
            <td style="font-size:10px;color:var(--color-text-muted);line-height:1.4">
              ${ts?.start_time??''}<br>${ts?.end_time??''}</td>`;
          for (let d=1; d<=6; d++) {
            const items = slotMap[`${d}_${p}`];
            if (items?.length) {
              tbl += `<td style="padding:4px 6px;vertical-align:top">`;
              items.forEach(s => {
                const c = globalColorOf[s.curricula_id] || '#6b7280';
                tbl += `<div style="background:${c}18;border-left:3px solid ${c};
                  border-radius:3px;margin-bottom:2px;padding:2px 5px">
                  <div style="font-size:11px;font-weight:600;color:${c}">${escHtml(s.curricula_name)}</div>
                  <div style="font-size:10px;color:var(--color-text-muted)">${escHtml(s.class_name)}</div>
                </div>`;
              });
              tbl += `</td>`;
            } else {
              tbl += `<td style="background:var(--color-bg-secondary)"></td>`;
            }
          }
          tbl += `</tr>`;
        });
        tbl += `</tbody></table></div>`;

        const total = td.slots.length;
        return `<div style="margin-bottom:28px;padding:16px 18px;border-radius:10px;
            border:1px solid var(--color-border);background:var(--color-bg,#fff)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <span style="font-size:15px;font-weight:700">👤 ${escHtml(td.name)}</span>
            <span style="font-size:12px;color:var(--color-text-muted)">${total} aula(s) na sugestão</span>
          </div>
          ${tbl}
        </div>`;
      }).join('');
    }

    // ── monta overlay fullscreen ─────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = 'school-sugg-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '9998',
      background: 'var(--color-bg,#f5f5f5)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'inherit',
    });

    const btnCss = 'padding:7px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;';
    overlay.innerHTML = `
      <!-- barra de topo fixa -->
      <div style="position:sticky;top:0;z-index:10;
          background:var(--color-bg,#fff);border-bottom:1px solid var(--color-border);
          padding:10px 20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
          box-shadow:0 2px 6px rgba(0,0,0,.08)">
        <span style="font-size:15px;font-weight:700;flex:0 0 auto">✨ Sugestão de Horário</span>
        <span style="font-size:12px;color:var(--color-text-muted);flex:0 0 auto">
          ${escHtml(window.AppContext?.schoolName??'')} &nbsp;·&nbsp;
          <strong>${totalPlaced}</strong>/${totalNeeded} aulas &nbsp;·&nbsp;
          ${hasUnplaced
            ? `<span style="color:#b45309">⚠️ Grade incompleta</span>`
            : `<span style="color:#16a34a">✅ Grade completa</span>`}
        </span>
        <!-- espaçador -->
        <span style="flex:1"></span>
        <!-- toggle de visão -->
        <div style="display:flex;border:1px solid var(--color-border);border-radius:6px;overflow:hidden">
          <button id="view-by-class"
            style="${btnCss}background:var(--color-primary,#1e3a5f);color:#fff;border-radius:0">
            📅 Por Turmas
          </button>
          <button id="view-by-teacher"
            style="${btnCss}background:transparent;color:var(--color-text);border-radius:0">
            👨‍🏫 Por Professores
          </button>
        </div>
        <!-- ações -->
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button id="fs-btn-redo"    style="${btnCss}background:transparent;border:1px solid var(--color-border)">🔄 Refazer</button>
          <button id="fs-btn-print"   style="${btnCss}background:transparent;border:1px solid var(--color-border)">🖨️ Imprimir</button>
          <button id="fs-btn-save"    style="${btnCss}background:transparent;border:1px solid var(--color-border)">💾 Salvar</button>
          <button id="fs-btn-confirm" style="${btnCss}background:var(--color-primary,#1e3a5f);color:#fff">✅ Confirmar tudo</button>
          <button id="fs-btn-close"   style="${btnCss}background:transparent;border:1px solid var(--color-border);font-size:15px;padding:6px 12px">✕</button>
        </div>
      </div>
      <!-- área de conteúdo com scroll -->
      <div id="sugg-fs-content" style="flex:1;overflow-y:auto;padding:20px 24px">
        ${buildAllClassesView()}
      </div>
    `;
    document.body.appendChild(overlay);

    // ── eventos ──────────────────────────────────────────────────────────────
    let currentView = 'class';

    function setView(v) {
      currentView = v;
      const btnClass   = overlay.querySelector('#view-by-class');
      const btnTeacher = overlay.querySelector('#view-by-teacher');
      const active  = 'background:var(--color-primary,#1e3a5f);color:#fff;';
      const passive = 'background:transparent;color:var(--color-text);';
      btnClass.style.cssText   = btnCss + (v==='class'   ? active : passive) + 'border-radius:0';
      btnTeacher.style.cssText = btnCss + (v==='teacher' ? active : passive) + 'border-radius:0';
      overlay.querySelector('#sugg-fs-content').innerHTML =
        v === 'class' ? buildAllClassesView() : buildAllTeachersView();
    }

    overlay.querySelector('#view-by-class').addEventListener('click',   () => setView('class'));
    overlay.querySelector('#view-by-teacher').addEventListener('click', () => setView('teacher'));

    overlay.querySelector('#fs-btn-close').addEventListener('click', () => overlay.remove());

    overlay.querySelector('#fs-btn-redo').addEventListener('click', async () => {
      overlay.remove();
      await openSchoolSuggestionFlow(container);
    });

    overlay.querySelector('#fs-btn-print').addEventListener('click', () => {
      // imprime todas as grades no modo atual
      if (currentView === 'class') {
        // une todos os slots com info de classe e usa modo 'school'
        printSchoolSchedule(classResults, 'class');
      } else {
        printSchoolSchedule(classResults, 'teacher');
      }
    });

    overlay.querySelector('#fs-btn-save').addEventListener('click', () => {
      openSaveLabelModal(null, async (label) => {
        try {
          for (const cr of validResults) {
            const slots = cr.result.flatMap(item =>
              item.slots.map(s => ({
                curricula_id: item.curricula_id, curricula_name: item.curricula_name,
                teacher_id:   item.teacher_id,   teacher_name:   item.teacher_name,
                weekday: s.weekday, period: s.period,
              }))
            );
            await window.DB.saveScheduleSnapshot({
              class_id: cr.classId, school_id: window.AppContext.schoolId,
              label: `${label} — ${escHtml(cr.className)}`, type: 'suggestion', slots,
            });
          }
          if (S.selectedClassId) await refreshClassTab(container);
          await refreshSchoolSnapshots(container);
          window.showToast(`Sugestão salva para ${validResults.length} turma(s).`, 'success');
        } catch (e) { window.showToast(e.message, 'error'); }
      });
    });

    overlay.querySelector('#fs-btn-confirm').addEventListener('click', () => {
      const defaultLabel = `Horário — ${new Date().toLocaleDateString('pt-BR')}`;
      openConfirmWithJustification(defaultLabel, async ({ label, justification }) => {
        try {
          document.querySelector('.modal-overlay')?.remove();
          let applied = 0;
          for (const cr of validResults) {
            const slots = cr.result.flatMap(item =>
              item.slots.map(s => ({
                curricula_id: item.curricula_id, curricula_name: item.curricula_name,
                teacher_id:   item.teacher_id,   teacher_name:   item.teacher_name,
                weekday: s.weekday, period: s.period,
              }))
            );
            await window.DB.saveScheduleSnapshot({
              class_id: cr.classId, school_id: window.AppContext.schoolId,
              label: `${label} — ${escHtml(cr.className)}`, type: 'suggestion', slots,
            });
            const snaps = await window.DB.getScheduleSnapshots(cr.classId);
            await window.DB.confirmSnapshot(snaps[0].id, justification);
            applied++;
          }
          overlay.remove();
          if (S.selectedClassId) await refreshClassTab(container);
          await refreshSchoolSnapshots(container);
          switchTab(container, 'history');
          window.showToast(`✅ Horário confirmado para ${applied} turma(s)!`, 'success');
        } catch (e) { window.showToast(e.message, 'error'); }
      });
    });
  }

  // ─── Impressão escola-wide ─────────────────────────────────────────────────
  function printSchoolSchedule(classResults, mode) {
    const allPeriods = new Set();
    classResults.forEach(cr => cr.timeSlots.forEach(t => allPeriods.add(t.period)));
    const periods = [...allPeriods].sort((a,b)=>a-b);
    const tsMap   = {};
    classResults.forEach(cr => cr.timeSlots.forEach(t => { tsMap[t.period] = t; }));

    const schoolName = escHtml(window.AppContext?.schoolName ?? '');
    const dateStr    = new Date().toLocaleDateString('pt-BR');

    let body = `<h2 style="color:#1e3a5f">${schoolName}</h2>
      <h3 style="color:#666;font-weight:400;margin-top:4px">
        ${mode === 'class' ? 'Sugestão de Horário — Por Turmas' : 'Sugestão de Horário — Por Professores'}
        &nbsp;· Gerado em ${dateStr}
      </h3>`;

    if (mode === 'class') {
      classResults.forEach(cr => {
        if (!cr.result.length) return;
        const smap = {};
        cr.result.forEach(item => item.slots.forEach(s => {
          smap[`${s.weekday}_${s.period}`] = item;
        }));
        body += `<h3 style="margin-top:28px;border-bottom:2px solid #1e3a5f;padding-bottom:4px">
          ${escHtml(cr.className)} <small style="font-weight:400;color:#666">${escHtml(cr.shiftName)}</small></h3>
          <table><thead><tr>
            <th>Per.</th><th>Horário</th>
            ${[1,2,3,4,5,6].map(d=>`<th>${WFULL[d]}</th>`).join('')}
          </tr></thead><tbody>
          ${periods.map(p => {
            const ts = tsMap[p];
            return `<tr>
              <td style="text-align:center;font-weight:700">${p}º</td>
              <td style="font-size:11px;color:#666">${ts?.start_time??''}–${ts?.end_time??''}</td>
              ${[1,2,3,4,5,6].map(d => {
                const item = smap[`${d}_${p}`];
                return item
                  ? `<td style="background:#f0f9ff">
                      <strong>${escHtml(item.curricula_name)}</strong>
                      ${item.teacher_name?`<br><small>${escHtml(item.teacher_name)}</small>`:''}
                    </td>`
                  : `<td style="background:#f9f9f9"></td>`;
              }).join('')}
            </tr>`;
          }).join('')}
          </tbody></table>`;
      });
    } else {
      // por professor
      const byTeacher = {};
      classResults.forEach(cr => {
        cr.result.forEach(item => {
          const tid   = String(item.teacher_id ?? '__sem__');
          const tname = item.teacher_name || 'Sem professor';
          if (!byTeacher[tid]) byTeacher[tid] = { name: tname, slots: [] };
          item.slots.forEach(s => byTeacher[tid].slots.push({
            weekday: s.weekday, period: s.period,
            curricula_name: item.curricula_name, class_name: cr.className,
          }));
        });
      });
      Object.values(byTeacher).sort((a,b)=>a.name.localeCompare(b.name)).forEach(td => {
        const tmap = {};
        td.slots.forEach(s => {
          const k = `${s.weekday}_${s.period}`;
          if (!tmap[k]) tmap[k] = [];
          tmap[k].push(s);
        });
        body += `<h3 style="margin-top:28px;border-bottom:2px solid #1e3a5f;padding-bottom:4px">
          👤 ${escHtml(td.name)}</h3>
          <table><thead><tr>
            <th>Per.</th><th>Horário</th>
            ${[1,2,3,4,5,6].map(d=>`<th>${WFULL[d]}</th>`).join('')}
          </tr></thead><tbody>
          ${periods.map(p => {
            const ts = tsMap[p];
            return `<tr>
              <td style="text-align:center;font-weight:700">${p}º</td>
              <td style="font-size:11px;color:#666">${ts?.start_time??''}–${ts?.end_time??''}</td>
              ${[1,2,3,4,5,6].map(d => {
                const items = tmap[`${d}_${p}`];
                return items?.length
                  ? `<td style="background:#f0f9ff">${items.map(s =>
                      `<div><strong>${escHtml(s.curricula_name)}</strong><br>
                       <small>${escHtml(s.class_name)}</small></div>`).join('')}</td>`
                  : `<td style="background:#f9f9f9"></td>`;
              }).join('')}
            </tr>`;
          }).join('')}
          </tbody></table>`;
      });
    }

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
      <title>Horário — ${schoolName}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px}
        h2{margin:0 0 4px 0}h3{margin:0 0 12px 0}
        table{width:100%;border-collapse:collapse;margin-bottom:16px}
        th{background:#1e3a5f;color:#fff;padding:6px 8px;font-size:11px}
        td{border:1px solid #ddd;padding:5px 7px;vertical-align:top}
        small{color:#555}@media print{body{padding:0}}
      </style></head><body>${body}</body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  // ─── Fluxo de Sugestão ─────────────────────────────────────────────────────
  async function openSuggestionFlow(container, previousResult = null) {
    let suggData, result, warnings;

    if (!previousResult) {
      // carrega spinner
      window.openModal({
        title: '✨ Gerando sugestão…',
        bodyHtml: `<div style="text-align:center;padding:24px">
          <div style="font-size:32px">⏳</div>
          <p style="margin-top:10px;color:var(--color-text-muted)">Verificando disponibilidades…</p>
        </div>`,
        confirmLabel: null, cancelLabel: 'Cancelar',
      });

      try { suggData = await window.DB.suggestClassSchedule(S.selectedClassId); }
      catch (e) {
        document.querySelector('.modal-overlay')?.remove();
        window.showToast(e.message, 'error'); return;
      }
      if (!suggData?.timeSlots?.length) {
        document.querySelector('.modal-overlay')?.remove();
        window.showToast('Sem períodos configurados no turno.', 'warning'); return;
      }
      const out = runSuggestionAlgorithm(suggData);
      result   = out.result;
      warnings = out.warnings;
      document.querySelector('.modal-overlay')?.remove();
    } else {
      // Refazer: pede de novo os dados frescos
      try { suggData = await window.DB.suggestClassSchedule(S.selectedClassId); }
      catch (e) { window.showToast(e.message, 'error'); return; }
      const out = runSuggestionAlgorithm(suggData);
      result   = out.result;
      warnings = out.warnings;
      suggData = suggData; // keep
    }

    const timeSlots   = suggData.timeSlots;
    const totalPlaced = result.reduce((s,r) => s + r.slots.length, 0);
    const totalNeeded = result.reduce((s,r) => s + r.weekly_lessons, 0);
    const hasUnplaced = result.some(r => r.unplaced > 0);
    const colorOf     = {};
    result.forEach((item, i) => { colorOf[item.curricula_id] = PAL[i % PAL.length]; });

    const periods = [...new Set(timeSlots.map(t => t.period))].sort((a,b) => a-b);
    const suggMap = {};
    result.forEach(item => item.slots.forEach(s => { suggMap[`${s.weekday}_${s.period}`] = item; }));

    const gridHtml = buildColorGrid(periods, timeSlots, suggMap, colorOf);

    const legendHtml = `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:10px">
      ${result.map(item => {
        const c = colorOf[item.curricula_id];
        return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;
          padding:3px 8px;border-radius:10px;background:${c}18;border:1px solid ${c}">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c}"></span>
          ${escHtml(item.curricula_name)}
          <span style="opacity:.65">${item.slots.length}/${item.weekly_lessons}</span>
          ${item.unplaced>0?`<span style="color:#dc2626;font-weight:600">⚠ ${item.unplaced}</span>`:''}
        </span>`;
      }).join('')}
    </div>`;

    const warningsHtml = warnings.length
      ? `<div style="margin-top:10px;padding:8px 12px;background:var(--color-warning-bg,#fef9c3);
          border-radius:8px;font-size:12px;border-left:3px solid #b45309">
          <strong>Observações:</strong>
          <ul style="margin:4px 0 0 0;padding-left:16px">
            ${warnings.map(w=>`<li style="margin-bottom:2px">${w}</li>`).join('')}
          </ul></div>`
      : '';

    const summaryHtml = `<div style="display:flex;align-items:center;justify-content:space-between;
        padding:8px 14px;border-radius:8px;background:var(--color-bg-secondary);margin-bottom:12px;font-size:13px">
      <span><strong>${totalPlaced}</strong>/${totalNeeded} aulas alocadas</span>
      ${hasUnplaced
        ? `<span style="color:#b45309">⚠️ Grade incompleta</span>`
        : `<span style="color:#16a34a">✅ Grade completa</span>`}
    </div>`;

    // Slots para persistência
    const slotsForSave = result.flatMap(item =>
      item.slots.map(s => ({
        curricula_id:   item.curricula_id,
        curricula_name: item.curricula_name,
        teacher_id:     item.teacher_id,
        teacher_name:   item.teacher_name,
        weekday:        s.weekday,
        period:         s.period,
      }))
    );

    window.openModal({
      title: '✨ Sugestão de Horário',
      bodyHtml: summaryHtml + gridHtml + legendHtml + warningsHtml
        + `<p style="margin-top:12px;font-size:11px;color:var(--color-text-muted)">
            Você pode salvar esta sugestão para analisar depois, ou confirmá-la imediatamente.<br>
            Ao confirmar, o horário atual da turma será substituído e o histórico será registrado.
           </p>`,
      confirmLabel: null,
      cancelLabel:  'Fechar',
      wide: true,
      footerExtra: `
        <button id="modal-btn-redo"    class="btn btn-ghost">🔄 Refazer</button>
        <button id="modal-btn-print"   class="btn btn-ghost">🖨️ Imprimir</button>
        <button id="modal-btn-save"    class="btn btn-ghost">💾 Salvar sugestão</button>
        <button id="modal-btn-confirm" class="btn btn-primary">✅ Confirmar horário</button>
      `,
    });

    // liga botões do footer após renderizar
    setTimeout(() => {
      document.querySelector('#modal-btn-redo')?.addEventListener('click', async () => {
        document.querySelector('.modal-overlay')?.remove();
        await openSuggestionFlow(container, 'redo');
      });

      document.querySelector('#modal-btn-print')?.addEventListener('click', () => {
        openPrintOptionsModal(slotsForSave, timeSlots, S.classTeacherCurricula, S.classes, S.shifts,
          `Sugestão — ${S.classes.find(c=>c.id===S.selectedClassId)?.name ?? ''}`);
      });

      document.querySelector('#modal-btn-save')?.addEventListener('click', () => {
        openSaveLabelModal(slotsForSave, async (label) => {
          try {
            await window.DB.saveScheduleSnapshot({
              class_id:  S.selectedClassId,
              school_id: window.AppContext.schoolId,
              label, type: 'suggestion',
              slots: slotsForSave,
            });
            await refreshAll(container);
            window.showToast(`Sugestão "${label}" salva.`, 'success');
          } catch (e) { window.showToast(e.message, 'error'); }
        });
      });

      document.querySelector('#modal-btn-confirm')?.addEventListener('click', () => {
        const cls = S.classes.find(c => c.id === S.selectedClassId);
        const defaultLabel = `Horário ${cls?.name ?? ''} — ${new Date().toLocaleDateString('pt-BR')}`;
        openConfirmWithJustification(defaultLabel, async ({ label, justification }) => {
          try {
            // Salva snapshot confirmado
            const r = await window.DB.saveScheduleSnapshot({
              class_id:  S.selectedClassId,
              school_id: window.AppContext.schoolId,
              label, type: 'suggestion',
              slots: slotsForSave,
            });
            // Confirma (aplica ao horário)
            const snaps = await window.DB.getScheduleSnapshots(S.selectedClassId);
            await window.DB.confirmSnapshot(snaps[0].id, justification);
            document.querySelector('.modal-overlay')?.remove();
            await refreshAll(container);
            switchTab(container, 'history');
            window.showToast(`✅ Horário confirmado!`, 'success');
          } catch (e) { window.showToast(e.message, 'error'); }
        });
      });
    }, 80);
  }

  // ─── Modais auxiliares ─────────────────────────────────────────────────────

  /** Pede apenas um rótulo para salvar a sugestão */
  function openSaveLabelModal(slots, onSave) {
    window.openModal({
      title: '💾 Salvar Sugestão',
      bodyHtml: `
        <div class="form-group">
          <label>Nome / Rótulo da sugestão *</label>
          <input id="f-snap-label" type="text"
            value="Sugestão ${new Date().toLocaleDateString('pt-BR')}"
            placeholder="Ex: Proposta inicial, v2, …">
        </div>`,
      confirmLabel: 'Salvar',
      onConfirm: (_ov, close) => {
        const label = document.querySelector('#f-snap-label').value.trim();
        if (!label) { window.showToast('Informe um rótulo.', 'warning'); return; }
        close();
        onSave(label);
      },
    });
  }

  /** Confirmação de snapshot da lista — pede apenas justificativa */
  function openConfirmJustificationModal(snapId, labelHint, onConfirm) {
    window.openModal({
      title: '✅ Confirmar Horário',
      bodyHtml: `
        <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:12px">
          Ao confirmar, <strong>${escHtml(labelHint)}</strong> será aplicado como horário ativo da turma
          e registrado no histórico.
        </p>
        <div class="form-group">
          <label>Justificativa da alteração <span style="color:var(--color-text-muted);font-size:11px">(recomendado)</span></label>
          <textarea id="f-justification" rows="3"
            placeholder="Ex: Ajuste solicitado pela coordenação em reunião de 06/03…"
            style="width:100%;resize:vertical">HORÁRIO VÁLIDO A PARTIR DE ${new Date().toLocaleDateString('pt-BR')}</textarea>
        </div>`,
      confirmLabel: 'Confirmar e Aplicar',
      onConfirm: (_ov, close) => {
        const just = document.querySelector('#f-justification').value.trim();
        close();
        onConfirm(just);
      },
    });
  }

  /** Confirmação direta (da sugestão gerada): pede rótulo + justificativa */
  function openConfirmWithJustification(defaultLabel, onConfirm) {
    window.openModal({
      title: '✅ Confirmar Horário',
      bodyHtml: `
        <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:12px">
          O horário atual da turma será substituído e esta versão ficará registrada no histórico.
        </p>
        <div class="form-group">
          <label>Rótulo para identificação *</label>
          <input id="f-confirm-label" type="text" value="${escHtml(defaultLabel)}">
        </div>
        <div class="form-group">
          <label>Justificativa da alteração <span style="color:var(--color-text-muted);font-size:11px">(recomendado)</span></label>
          <textarea id="f-confirm-just" rows="3"
            placeholder="Ex: Ajuste solicitado pela coordenação em reunião de 06/03…"
            style="width:100%;resize:vertical">HORÁRIO VÁLIDO A PARTIR DE ${new Date().toLocaleDateString('pt-BR')}</textarea>
        </div>`,
      confirmLabel: 'Confirmar e Aplicar',
      onConfirm: (_ov, close) => {
        const label = document.querySelector('#f-confirm-label').value.trim();
        if (!label) { window.showToast('Informe o rótulo.', 'warning'); return; }
        const justification = document.querySelector('#f-confirm-just').value.trim();
        close();
        onConfirm({ label, justification });
      },
    });
  }

  /** Visualização read-only de um snapshot */
  async function openSnapshotGroupViewer(snaps, groupLabel, container, printImmediately = false) {
    // spinner
    const spinner = document.createElement('div');
    Object.assign(spinner.style, {
      position:'fixed', inset:'0', background:'rgba(0,0,0,.45)',
      zIndex:'9999', display:'flex', alignItems:'center', justifyContent:'center',
    });
    spinner.innerHTML = `<div style="background:var(--color-bg,#fff);border-radius:12px;
      padding:32px 48px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.25)">
      <div style="font-size:36px">📂</div>
      <p style="margin-top:10px;color:var(--color-text-muted)">Carregando snapshots…</p></div>`;
    document.body.appendChild(spinner);

    let classResults;
    try {
      // busca slots completos e timeslots por turno
      const shiftIds = [...new Set(snaps.map(s => s.shift_id))];
      const tsMap = {};
      await Promise.all(shiftIds.map(async sid => {
        tsMap[sid] = await window.DB.getTimeSlots(sid);
      }));

      const fullSnaps = await Promise.all(snaps.map(s => window.DB.getScheduleSnapshot(s.id)));

      // monta classResults no mesmo formato de runSchoolSuggestionAlgorithm
      classResults = fullSnaps.map((full, i) => {
        const snap  = snaps[i];
        const slots = full.slots || [];
        // agrupa por curricula_id
        const byCC = {};
        slots.forEach(s => {
          if (!byCC[s.curricula_id]) {
            byCC[s.curricula_id] = {
              curricula_id:   s.curricula_id,
              curricula_name: s.curricula_name,
              teacher_id:     s.teacher_id,
              teacher_name:   s.teacher_name,
              weekly_lessons: 0,
              slots: [], unplaced: 0,
            };
          }
          byCC[s.curricula_id].slots.push({ weekday: s.weekday, period: s.period });
          byCC[s.curricula_id].weekly_lessons = byCC[s.curricula_id].slots.length; // approx
        });
        return {
          classId:   snap.class_id,
          className: snap.class_name,
          shiftName: snap.shift_name,
          timeSlots: tsMap[snap.shift_id] || [],
          result:    Object.values(byCC),
          warnings:  [],
        };
      });
    } catch (e) {
      spinner.remove();
      window.showToast('Erro ao carregar snapshots: ' + e.message, 'error');
      return;
    }
    spinner.remove();

    // paleta global por curricula_id
    const globalColorOf = {};
    let colorIdx = 0;
    classResults.forEach(cr => cr.result.forEach(item => {
      if (!globalColorOf[item.curricula_id])
        globalColorOf[item.curricula_id] = PAL[colorIdx++ % PAL.length];
    }));

    function buildClassesView() {
      return classResults.map(cr => {
        if (!cr.result.length) return '';
        const periods = [...new Set(cr.timeSlots.map(t => t.period))].sort((a,b) => a-b);
        const suggMap = {};
        cr.result.forEach(item => item.slots.forEach(s => {
          suggMap[`${s.weekday}_${s.period}`] = { ...item };
        }));
        const colorOf = {};
        cr.result.forEach(item => { colorOf[item.curricula_id] = globalColorOf[item.curricula_id]; });
        const grid   = buildColorGrid(periods, cr.timeSlots, suggMap, colorOf);
        const legend = `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px">
          ${cr.result.map(item => {
            const c = colorOf[item.curricula_id];
            return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;
              padding:2px 7px;border-radius:8px;background:${c}18;border:1px solid ${c}">
              <span style="width:7px;height:7px;border-radius:50%;background:${c};display:inline-block"></span>
              ${escHtml(item.curricula_name)}
              ${item.teacher_name ? `<span style="opacity:.6">· ${escHtml(item.teacher_name)}</span>` : ''}
            </span>`;
          }).join('')}
        </div>`;
        return `<div style="margin-bottom:28px;padding:16px 18px;border-radius:10px;
            border:1px solid var(--color-border);background:var(--color-bg,#fff)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <span style="font-size:15px;font-weight:700">${escHtml(cr.className)}</span>
            <span style="font-size:11px;color:var(--color-text-muted)">${escHtml(cr.shiftName)}</span>
          </div>
          ${grid}${legend}
        </div>`;
      }).join('');
    }

    function buildTeachersView() {
      const byTeacher = {};
      const allPeriods = new Set();
      classResults.forEach(cr => cr.timeSlots.forEach(t => allPeriods.add(t.period)));
      const periods = [...allPeriods].sort((a,b) => a-b);
      const tsAll = {};
      classResults.forEach(cr => cr.timeSlots.forEach(t => { tsAll[t.period] = t; }));

      classResults.forEach(cr => {
        cr.result.forEach(item => {
          const tid = String(item.teacher_id ?? '__sem__');
          const tname = item.teacher_name || 'Sem professor';
          if (!byTeacher[tid]) byTeacher[tid] = { name: tname, slots: [] };
          item.slots.forEach(s => byTeacher[tid].slots.push({
            weekday: s.weekday, period: s.period,
            curricula_name: item.curricula_name, class_name: cr.className,
            curricula_id: item.curricula_id,
          }));
        });
      });

      return Object.entries(byTeacher).sort((a,b)=>a[1].name.localeCompare(b[1].name)).map(([,td]) => {
        const slotMap = {};
        td.slots.forEach(s => {
          const k = `${s.weekday}_${s.period}`;
          if (!slotMap[k]) slotMap[k] = [];
          slotMap[k].push(s);
        });
        let tbl = `<div class="schedule-grid" style="margin:0"><table>
          <thead><tr>
            <th style="width:40px;font-size:11px">Per.</th>
            <th style="width:78px;font-size:10px">Horário</th>
            ${[1,2,3,4,5,6].map(d=>`<th style="font-size:11px">${W[d]}</th>`).join('')}
          </tr></thead><tbody>`;
        periods.forEach(p => {
          const ts = tsAll[p];
          tbl += `<tr>
            <td style="font-weight:700;text-align:center;font-size:12px">${p}º</td>
            <td style="font-size:10px;color:var(--color-text-muted);line-height:1.4">
              ${ts?.start_time??''}<br>${ts?.end_time??''}</td>`;
          for (let d=1; d<=6; d++) {
            const items = slotMap[`${d}_${p}`];
            if (items?.length) {
              tbl += `<td style="padding:4px 6px;vertical-align:top">`;
              items.forEach(s => {
                const c = globalColorOf[s.curricula_id] || '#6b7280';
                tbl += `<div style="background:${c}18;border-left:3px solid ${c};
                  border-radius:3px;margin-bottom:2px;padding:2px 5px">
                  <div style="font-size:11px;font-weight:600;color:${c}">${escHtml(s.curricula_name)}</div>
                  <div style="font-size:10px;color:var(--color-text-muted)">${escHtml(s.class_name)}</div>
                </div>`;
              });
              tbl += `</td>`;
            } else {
              tbl += `<td style="background:var(--color-bg-secondary)"></td>`;
            }
          }
          tbl += `</tr>`;
        });
        tbl += `</tbody></table></div>`;
        return `<div style="margin-bottom:28px;padding:16px 18px;border-radius:10px;
            border:1px solid var(--color-border);background:var(--color-bg,#fff)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <span style="font-size:15px;font-weight:700">👤 ${escHtml(td.name)}</span>
            <span style="font-size:12px;color:var(--color-text-muted)">${td.slots.length} aula(s)</span>
          </div>
          ${tbl}
        </div>`;
      }).join('');
    }

    let viewMode = 'classes'; // 'classes' | 'teachers'

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', zIndex:'9998',
      background:'var(--color-bg,#f8fafc)', display:'flex', flexDirection:'column', overflow:'hidden',
    });
    overlay.innerHTML = `
      <div style="position:sticky;top:0;z-index:10;background:var(--color-bg,#fff);
        border-bottom:1px solid var(--color-border);padding:10px 18px;
        display:flex;align-items:center;gap:10px;flex-wrap:wrap;box-shadow:0 2px 6px rgba(0,0,0,.08)">
        <span style="font-weight:700;font-size:15px;flex:1">📂 ${escHtml(groupLabel)}</span>
        <div style="display:flex;gap:6px">
          <button id="sgv-btn-classes" class="btn btn-primary btn-sm">🏫 Por Turmas</button>
          <button id="sgv-btn-teachers" class="btn btn-ghost btn-sm">👤 Por Professores</button>
        </div>
        <button id="sgv-btn-print" class="btn btn-ghost btn-sm">🖨️ Imprimir</button>
        <button id="sgv-btn-close" class="btn btn-ghost btn-sm">✕ Fechar</button>
      </div>
      <div id="sgv-body" style="flex:1;overflow-y:auto;padding:24px 32px"></div>
    `;
    document.body.appendChild(overlay);

    const body = overlay.querySelector('#sgv-body');
    const refresh = () => {
      body.innerHTML = viewMode === 'classes' ? buildClassesView() : buildTeachersView();
    };
    refresh();

    const setMode = (m) => {
      viewMode = m;
      overlay.querySelector('#sgv-btn-classes').className  = `btn btn-sm ${m==='classes'  ? 'btn-primary' : 'btn-ghost'}`;
      overlay.querySelector('#sgv-btn-teachers').className = `btn btn-sm ${m==='teachers' ? 'btn-primary' : 'btn-ghost'}`;
      refresh();
    };

    overlay.querySelector('#sgv-btn-classes').addEventListener('click',  () => setMode('classes'));
    overlay.querySelector('#sgv-btn-teachers').addEventListener('click', () => setMode('teachers'));
    overlay.querySelector('#sgv-btn-close').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#sgv-btn-print').addEventListener('click', () =>
      printSchoolSchedule(classResults, viewMode === 'teachers' ? 'teacher' : 'class')
    );

    if (printImmediately) printSchoolSchedule(classResults, 'class');
  }

  /** Visualização read-only de um snapshot */
  async function openViewSnapshotModal(snap, container) {
    if (!snap?.slots) return;
    const periods = [...new Set(S.timeSlots.map(t => t.period))].sort((a,b) => a-b);
    const colorOf = {};
    const uniq    = [...new Set(snap.slots.map(s => s.curricula_id))];
    uniq.forEach((id, i) => { colorOf[id] = PAL[i % PAL.length]; });

    const suggMap = {};
    snap.slots.forEach(s => {
      suggMap[`${s.weekday}_${s.period}`] = { ...s, curricula_name: s.curricula_name };
    });

    const badgeType = snap.type === 'confirmed'
      ? `<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:8px;font-size:11px">✅ Confirmado</span>`
      : `<span style="background:#e0f2fe;color:#0369a1;padding:2px 8px;border-radius:8px;font-size:11px">💾 Rascunho</span>`;

    window.openModal({
      title: `👁️ ${escHtml(snap.label ?? '')}`,
      bodyHtml: `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;color:var(--color-text-muted)">
          ${badgeType}
          <span>${fmtDate(snap.confirmed_at || snap.created_at)}</span>
          ${snap.justification ? `<span>· ${escHtml(snap.justification)}</span>` : ''}
        </div>
        ${buildColorGrid(periods, S.timeSlots, suggMap, colorOf)}
        <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">
          ${uniq.map(id => {
            const s = snap.slots.find(x => x.curricula_id === id);
            const c = colorOf[id];
            return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;
              padding:3px 8px;border-radius:10px;background:${c}18;border:1px solid ${c}">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c}"></span>
              ${escHtml(s?.curricula_name ?? '?')}
            </span>`;
          }).join('')}
        </div>`,
      confirmLabel: null, cancelLabel: 'Fechar', wide: true,
      footerExtra: `<button id="modal-view-print" class="btn btn-ghost">🖨️ Imprimir</button>`,
    });

    setTimeout(() => {
      document.querySelector('#modal-view-print')?.addEventListener('click', () =>
        openPrintOptionsModal(snap.slots, S.timeSlots, S.classTeacherCurricula, S.classes, S.shifts, snap.label)
      );
    }, 80);
  }

  // ─── Opções de impressão ───────────────────────────────────────────────────
  function openPrintOptionsModal(slots, timeSlots, ctcList, classes, shifts, label) {
    window.openModal({
      title: '🖨️ Imprimir Horário',
      bodyHtml: `
        <p style="font-size:13px;color:var(--color-text-muted);margin-bottom:14px">
          Escolha o formato de impressão para <strong>${escHtml(label ?? '')}</strong>:
        </p>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button id="print-by-class"   class="btn btn-primary" style="text-align:left;padding:12px 16px">
            📅 Por Turma — Grade de períodos × dias para esta turma
          </button>
          <button id="print-by-teacher" class="btn btn-ghost"   style="text-align:left;padding:12px 16px">
            👨‍🏫 Por Professor — Agrupado por professor (todos os horários)
          </button>
        </div>`,
      confirmLabel: null, cancelLabel: 'Cancelar',
    });

    setTimeout(() => {
      document.querySelector('#print-by-class')?.addEventListener('click', () => {
        document.querySelector('.modal-overlay')?.remove();
        printSchedule('class', S.selectedClassId, slots, timeSlots, ctcList, classes, shifts, label);
      });
      document.querySelector('#print-by-teacher')?.addEventListener('click', () => {
        document.querySelector('.modal-overlay')?.remove();
        printSchedule('teacher', S.selectedClassId, slots, timeSlots, ctcList, classes, shifts, label);
      });
    }, 80);
  }

  // ─── Impressão ─────────────────────────────────────────────────────────────
  function printSchedule(mode, classId, slotsOrLessons, timeSlots, ctcList, classes, shifts, label) {
    const cls   = classes.find(c => c.id === classId);
    const shift = shifts.find(s => s.id === cls?.shift_id);
    const periods = [...new Set(timeSlots.map(t => t.period))].sort((a,b) => a-b);

    // Normaliza: lessons vêm do DB (com .weekday/.period/.subject/curricula_id)
    //            slots vêm do algoritmo (com .weekday/.period/.curricula_name/.teacher_name)
    const isLessons = slotsOrLessons.length > 0 && 'subject' in (slotsOrLessons[0] || {});
    const slots = slotsOrLessons.map(l => isLessons
      ? {
          weekday:       l.weekday,
          period:        l.period,
          curricula_name: l.subject,
          teacher_name:  ctcList.find(t => t.curricula_id === l.curricula_id)?.teacher_name ?? null,
          curricula_id:  l.curricula_id,
          teacher_id:    l.person_id,
        }
      : l
    );

    let body = '';

    if (mode === 'class') {
      const smap = {};
      slots.forEach(s => { smap[`${s.weekday}_${s.period}`] = s; });

      body = `<h2>${escHtml(cls?.name ?? '')} — ${escHtml(shift?.name ?? '')}</h2>
        <h3 style="color:#666;font-weight:400">${escHtml(label ?? '')}</h3>
        <table>
          <thead><tr>
            <th>Per.</th><th>Horário</th>
            ${[1,2,3,4,5,6].map(d => `<th>${WFULL[d]}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${periods.map(p => {
              const ts = timeSlots.find(t => t.period === p);
              return `<tr>
                <td style="font-weight:700;text-align:center">${p}º</td>
                <td style="font-size:11px;color:#666">${ts?.start_time ?? ''}–${ts?.end_time ?? ''}</td>
                ${[1,2,3,4,5,6].map(d => {
                  const s = smap[`${d}_${p}`];
                  return s
                    ? `<td style="background:#f0f9ff"><strong>${escHtml(s.curricula_name??'')}</strong>
                        ${s.teacher_name ? `<br><small>${escHtml(s.teacher_name)}</small>` : ''}</td>`
                    : `<td style="background:#f9f9f9"></td>`;
                }).join('')}
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
    } else {
      // Por professor: agrupa todos os slots por teacher_id / teacher_name
      const byTeacher = {};
      slots.forEach(s => {
        const key = s.teacher_id ? String(s.teacher_id) : '__sem_professor__';
        if (!byTeacher[key]) byTeacher[key] = { name: s.teacher_name || 'Sem professor', slots: [] };
        byTeacher[key].slots.push(s);
      });

      body = `<h2>Horário por Professor — ${escHtml(cls?.name ?? '')}</h2>
        <h3 style="color:#666;font-weight:400">${escHtml(label ?? '')}</h3>`;

      for (const { name, slots: tSlots } of Object.values(byTeacher)) {
        const tmap = {};
        tSlots.forEach(s => { tmap[`${s.weekday}_${s.period}`] = s; });
        body += `<h3 style="margin-top:24px;border-bottom:2px solid #1e3a5f;padding-bottom:4px">
            👤 ${escHtml(name)}</h3>
          <table>
            <thead><tr>
              <th>Per.</th><th>Horário</th>
              ${[1,2,3,4,5,6].map(d => `<th>${WFULL[d]}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${periods.map(p => {
                const ts = timeSlots.find(t => t.period === p);
                return `<tr>
                  <td style="font-weight:700;text-align:center">${p}º</td>
                  <td style="font-size:11px;color:#666">${ts?.start_time ?? ''}–${ts?.end_time ?? ''}</td>
                  ${[1,2,3,4,5,6].map(d => {
                    const s = tmap[`${d}_${p}`];
                    return s
                      ? `<td style="background:#f0f9ff"><strong>${escHtml(s.curricula_name??'')}</strong></td>`
                      : `<td style="background:#f9f9f9"></td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
          </table>`;
      }
    }

    const generated = `<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8">
      <title>Horário — ${escHtml(cls?.name ?? '')}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 20px; }
        h2   { color: #1e3a5f; margin-bottom: 4px; }
        h3   { margin: 0 0 16px 0; }
        table{ width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th   { background: #1e3a5f; color: #fff; padding: 7px 10px; font-size: 12px; }
        td   { border: 1px solid #ddd; padding: 7px 10px; vertical-align: top; }
        small{ color: #555; }
        @media print { body { padding: 0; } }
      </style>
    </head><body>${body}
      <p style="margin-top:24px;font-size:11px;color:#999">
        Gerado em ${new Date().toLocaleString('pt-BR')} · ${escHtml(window.AppContext?.schoolName ?? '')}
      </p>
    </body></html>`;

    const w = window.open('', '_blank');
    w.document.write(generated);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  // ─── Algoritmo de sugestão ─────────────────────────────────────────────────
  function spreadPick(candidates, needed) {
    const byDay = {};
    for (const s of candidates) (byDay[s.weekday] = byDay[s.weekday] || []).push(s);
    Object.values(byDay).forEach(arr => arr.sort((a,b) => a.period - b.period));
    const days = Object.keys(byDay).map(Number).sort((a,b) => a-b);
    const picked = [];
    let di = 0;
    while (picked.length < needed) {
      let ok = false;
      for (let i = 0; i < days.length; i++) {
        const day = days[(di + i) % days.length];
        if (byDay[day]?.length) {
          picked.push(byDay[day].shift());
          di = (di + 1) % days.length;
          ok = true; break;
        }
      }
      if (!ok) break;
    }
    return picked;
  }

  function runSuggestionAlgorithm(data) {
    const { timeSlots, classCurricula, teacherMap, teacherData } = data;
    const periods  = [...new Set(timeSlots.map(t => t.period))].sort((a,b) => a-b);
    const allSlots = [];
    for (const w of [1,2,3,4,5,6]) for (const p of periods) allSlots.push({ weekday: w, period: p });
    const key = (w,p) => `${w}_${p}`;
    const classUsed = new Set();
    const busyCopy  = {};
    for (const [tid, td] of Object.entries(teacherData))
      busyCopy[tid] = new Set(td.busySlots.map(b => key(b.weekday, b.period)));

    const result = [], warnings = [];
    for (const cc of classCurricula) {
      const teacher = teacherMap.find(t => t.curricula_id === cc.curricula_id);
      const needed  = cc.weekly_lessons;
      let candidates;

      if (teacher) {
        const td       = teacherData[teacher.person_id];
        const busy     = busyCopy[teacher.person_id];
        const availSet = td.hasAvailability
          ? new Set(td.availability.map(a => key(a.weekday, a.period))) : null;
        if (!td.hasAvailability)
          warnings.push(`⚠️ <strong>${escHtml(cc.curricula_name)}</strong>: prof. <em>${escHtml(teacher.teacher_name)}</em> sem disponibilidade cadastrada.`);
        candidates = allSlots.filter(s => {
          const k = key(s.weekday, s.period);
          if (classUsed.has(k)) return false;  // conflito turma
          if (busy.has(k))      return false;  // conflito cross-class
          if (availSet && !availSet.has(k)) return false;
          return true;
        });
      } else {
        warnings.push(`ℹ️ <strong>${escHtml(cc.curricula_name)}</strong>: sem professor atribuído.`);
        candidates = allSlots.filter(s => !classUsed.has(key(s.weekday, s.period)));
      }

      const picked = spreadPick(candidates, needed);
      for (const s of picked) {
        const k = key(s.weekday, s.period);
        classUsed.add(k);
        if (teacher) busyCopy[teacher.person_id].add(k);
      }
      if (needed - picked.length > 0)
        warnings.push(`❌ <strong>${escHtml(cc.curricula_name)}</strong>: ${needed - picked.length} aula(s) não alocadas — sem slots disponíveis.`);

      result.push({
        curricula_id:   cc.curricula_id,
        curricula_name: cc.curricula_name,
        teacher_id:     teacher?.person_id   ?? null,
        teacher_name:   teacher?.teacher_name ?? null,
        weekly_lessons: needed,
        slots:          picked,
        unplaced:       needed - picked.length,
      });
    }
    return { result, warnings };
  }

  // ─── Builders de grid ──────────────────────────────────────────────────────
  function buildGrid(periods, lmap, cellFn) {
    let h = `<div class="schedule-grid"><table>
      <thead><tr>
        <th style="width:46px">Per.</th>
        <th style="width:84px;font-size:10px">Horário</th>
        ${[1,2,3,4,5,6].map(d => `<th style="font-size:11px">${W[d]}</th>`).join('')}
      </tr></thead><tbody>`;
    periods.forEach(period => {
      const ts = S.timeSlots.find(t => t.period === period);
      h += `<tr>
        <td style="font-weight:700;text-align:center">${period}º</td>
        <td style="font-size:10px;color:var(--color-text-muted);line-height:1.4">
          ${ts?.start_time ?? ''}<br>${ts?.end_time ?? ''}</td>`;
      for (let d = 1; d <= 6; d++) {
        const cell = cellFn(d, period);
        if (cell) {
          h += `<td class="lesson-filled">
            <div style="font-size:11px;font-weight:600">${escHtml(cell.label)}</div>
            ${cell.sub ? `<div style="font-size:10px;color:var(--color-text-muted)">${escHtml(cell.sub)}</div>` : ''}
          </td>`;
        } else {
          h += `<td class="lesson-empty"></td>`;
        }
      }
      h += `</tr>`;
    });
    return h + `</tbody></table></div>`;
  }

  function buildColorGrid(periods, timeSlots, suggMap, colorOf) {
    let h = `<div class="schedule-grid" style="margin:0"><table>
      <thead><tr>
        <th style="width:40px;font-size:11px">Per.</th>
        <th style="width:80px;font-size:10px">Horário</th>
        ${[1,2,3,4,5,6].map(d => `<th style="font-size:11px">${W[d]}</th>`).join('')}
      </tr></thead><tbody>`;
    periods.forEach(p => {
      const ts = timeSlots.find(t => t.period === p);
      h += `<tr>
        <td style="font-weight:700;text-align:center;font-size:12px">${p}º</td>
        <td style="font-size:10px;color:var(--color-text-muted);line-height:1.4">
          ${ts?.start_time ?? ''}<br>${ts?.end_time ?? ''}</td>`;
      for (let d = 1; d <= 6; d++) {
        const item = suggMap[`${d}_${p}`];
        if (item) {
          const c = colorOf[item.curricula_id] || '#6b7280';
          h += `<td style="background:${c}18;border-left:3px solid ${c};padding:4px 6px">
            <div style="font-size:11px;font-weight:600;color:${c}">${escHtml(item.curricula_name ?? '')}</div>
            ${item.teacher_name ? `<div style="font-size:10px;color:var(--color-text-muted)">${escHtml(item.teacher_name)}</div>` : ''}
          </td>`;
        } else {
          h += `<td style="background:var(--color-bg-secondary)"></td>`;
        }
      }
      h += `</tr>`;
    });
    return h + `</tbody></table></div>`;
  }

  // ─── Utilitários ───────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'}); }
    catch { return iso; }
  }

  return { mount };
})();
