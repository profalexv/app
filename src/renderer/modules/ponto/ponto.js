/**
 * Módulo de Registro de Ponto de Funcionário
 *
 * Abas: Hoje | Funcionários | Histórico | Assinatura
 *
 * Conformidade: CLT Art. 74 / Portaria MTP 671/2021 (REP-A) / LGPD
 */

window.ModulePonto = (() => {
  let _schoolId = null;
  let _tab      = 'hoje';

  // ── Utilitários ─────────────────────────────────────────────────────────────

  const E = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  const TYPE_LABELS = {
    entrada:      { label: 'Entrada',   color: '#16a34a', bg: '#dcfce7' },
    saida:        { label: 'Saída',     color: '#dc2626', bg: '#fee2e2' },
    pausa_inicio: { label: 'Pausa',     color: '#d97706', bg: '#fef3c7' },
    pausa_fim:    { label: 'Fim Pausa', color: '#7c3aed', bg: '#ede9fe' },
  };

  function typeBadge(type) {
    const t = TYPE_LABELS[type] || { label: type, color: '#6b7280', bg: '#f3f4f6' };
    return `<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:${t.color};background:${t.bg}">${t.label}</span>`;
  }

  // ── Esqueleto HTML ───────────────────────────────────────────────────────────

  function renderShell() {
    return `
      <div class="ponto-module">
        <div class="page-header">
          <div>
            <h1>🕐 Registro de Ponto</h1>
            <p class="subtitle">Controle de jornada conforme CLT / Portaria 671/2021</p>
          </div>
          <button class="btn btn-ponto-punch" id="ponto-btn-bater">
            ⏱️ Bater Ponto
          </button>
        </div>

        <div class="ponto-tabs-nav" role="tablist">
          <button class="ponto-tab active" data-ponto-tab="hoje" role="tab">📋 Hoje</button>
          <button class="ponto-tab" data-ponto-tab="funcionarios" role="tab">👤 Funcionários</button>
          <button class="ponto-tab" data-ponto-tab="historico" role="tab">📅 Histórico</button>
          <button class="ponto-tab" data-ponto-tab="assinatura" role="tab">💳 Assinatura</button>
        </div>

        <div id="ponto-tab-content" class="ponto-tab-content">
          <div class="ponto-loading">Carregando...</div>
        </div>
      </div>
    `;
  }

  // ── Aba: Hoje ────────────────────────────────────────────────────────────────

  async function renderHoje(container) {
    container.innerHTML = '<div class="ponto-loading">Carregando...</div>';
    try {
      const records = await window.DB.getPontoToday(_schoolId);
      if (!records?.length) {
        container.innerHTML = `
          <div class="ponto-empty">
            <span style="font-size:40px">📭</span>
            <p>Nenhum registro de ponto hoje.</p>
            <button class="btn btn-ponto-punch" id="ponto-empty-punch">⏱️ Bater Ponto agora</button>
          </div>`;
        document.getElementById('ponto-empty-punch')?.addEventListener('click', openPunchModal);
        return;
      }

      const byEmp = {};
      records.forEach(r => {
        if (!byEmp[r.employee_id]) byEmp[r.employee_id] = { name: r.employee_name, records: [] };
        byEmp[r.employee_id].records.push(r);
      });

      const rows = Object.values(byEmp).map(emp => {
        const last = emp.records[emp.records.length - 1];
        const allTimes = emp.records.map(r =>
          `<span title="${r.type}">${fmtTime(r.punched_at)} ${typeBadge(r.type)}</span>`
        ).join(' ');
        return `<tr>
          <td><strong>${E(emp.name)}</strong></td>
          <td>${typeBadge(last.type)}</td>
          <td style="font-size:12px;color:#6b7280">${allTimes}</td>
          <td>${fmtTime(last.punched_at)}</td>
          <td>${last.latitude ? `<span title="${last.latitude},${last.longitude}">📍</span>` : '—'}</td>
        </tr>`;
      }).join('');

      container.innerHTML = `
        <div class="ponto-section-header">
          <span>${records.length} registro(s) hoje · ${Object.keys(byEmp).length} funcionário(s)</span>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Funcionário</th><th>Último Tipo</th><th>Marcações</th><th>Último Horário</th><th>GPS</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    } catch (e) {
      container.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
    }
  }

  // ── Aba: Funcionários ────────────────────────────────────────────────────────

  async function renderFuncionarios(container) {
    container.innerHTML = '<div class="ponto-loading">Carregando...</div>';
    try {
      const employees = await window.DB.getPontoEmployees(_schoolId);
      container.innerHTML = `
        <div class="ponto-section-header">
          <span>${employees.length} funcionário(s) cadastrado(s)</span>
          <button class="btn btn-primary" id="ponto-btn-new-emp">+ Novo Funcionário</button>
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Nome</th><th>CPF</th><th>Função</th><th>Depto</th><th>GPS</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody id="ponto-emp-rows">
              ${employees.length ? employees.map(empRow).join('') : '<tr><td colspan="7" style="text-align:center;color:#6b7280">Nenhum funcionário cadastrado.</td></tr>'}
            </tbody>
          </table>
        </div>`;

      document.getElementById('ponto-btn-new-emp')
        ?.addEventListener('click', () => openEmployeeModal(null));

      container.querySelectorAll('[data-edit-emp]').forEach(btn => {
        btn.addEventListener('click', () => editEmployeeById(parseInt(btn.dataset.editEmp, 10)));
      });
      container.querySelectorAll('[data-delete-emp]').forEach(btn => {
        btn.addEventListener('click', () => deleteEmployeeById(parseInt(btn.dataset.deleteEmp, 10), btn.dataset.empName));
      });
    } catch (e) {
      container.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
    }
  }

  function empRow(emp) {
    const gpsIcon = emp.gps_consent
      ? `<span style="color:#16a34a" title="Consentiu em ${emp.gps_consent_at ? fmtDate(emp.gps_consent_at) : '?'}">✅</span>`
      : `<span style="color:#6b7280" title="Sem consentimento GPS">○</span>`;
    const statusBadge = emp.active
      ? `<span class="badge" style="background:#dcfce7;color:#16a34a">Ativo</span>`
      : `<span class="badge" style="background:#fee2e2;color:#dc2626">Inativo</span>`;
    return `<tr>
      <td><strong>${E(emp.name)}</strong></td>
      <td style="font-size:12px;color:#6b7280">${E(emp.cpf || '—')}</td>
      <td>${E(emp.role || '—')}</td>
      <td>${E(emp.department || '—')}</td>
      <td style="text-align:center">${gpsIcon}</td>
      <td>${statusBadge}</td>
      <td>
        <button class="btn btn-ghost btn-sm" data-edit-emp="${emp.id}">✏️</button>
        <button class="btn btn-ghost btn-sm" data-delete-emp="${emp.id}" data-emp-name="${E(emp.name)}" title="Desativar">🗑️</button>
      </td>
    </tr>`;
  }

  async function editEmployeeById(id) {
    try {
      const emps = await window.DB.getPontoEmployees(_schoolId);
      const emp  = emps.find(e => e.id === id);
      if (emp) openEmployeeModal(emp);
    } catch (e) { window.showToast(e.message, 'error'); }
  }

  async function deleteEmployeeById(id, name) {
    const confirmed = await window.confirmDialog(
      `Desativar <strong>${E(name)}</strong>?<br><small style="color:#6b7280">O histórico de ponto será mantido por 5 anos (CLT Art. 11).</small>`,
      { confirmLabel: 'Desativar', confirmClass: 'btn-danger', title: 'Desativar Funcionário' }
    );
    if (!confirmed) return;
    try {
      await window.DB.deletePontoEmployee(id);
      window.showToast('Funcionário desativado.', 'success');
      const content = document.getElementById('ponto-tab-content');
      if (content) await renderFuncionarios(content);
    } catch (e) { window.showToast(e.message, 'error'); }
  }

  function openEmployeeModal(existing) {
    window.openModal({
      title: existing ? '✏️ Editar Funcionário' : '+ Novo Funcionário',
      size: 'large',
      bodyHtml: `
        <div class="form-row">
          <div class="form-group" style="flex:2">
            <label>Nome completo *</label>
            <input type="text" id="pf-name" value="${E(existing?.name ?? '')}" placeholder="Nome do funcionário">
          </div>
          <div class="form-group">
            <label>CPF</label>
            <input type="text" id="pf-cpf" value="${E(existing?.cpf ?? '')}" placeholder="000.000.000-00" maxlength="14">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Função</label>
            <input type="text" id="pf-role" value="${E(existing?.role ?? '')}" placeholder="Ex: Auxiliar de serviços">
          </div>
          <div class="form-group">
            <label>Departamento</label>
            <input type="text" id="pf-dept" value="${E(existing?.department ?? '')}" placeholder="Ex: Limpeza">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>E-mail</label>
            <input type="email" id="pf-email" value="${E(existing?.email ?? '')}" placeholder="email@escola.com">
          </div>
          <div class="form-group">
            <label>PIN (senha para bater ponto)</label>
            <input type="password" id="pf-pin" placeholder="${existing ? 'Deixe em branco para não alterar' : '4–8 dígitos'}" maxlength="8" autocomplete="new-password">
          </div>
        </div>
        <div class="form-group">
          <label class="checkbox-label" style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="pf-gps" ${existing?.gps_consent ? 'checked' : ''}>
            <span>📍 Autorizo coleta de localização GPS ao bater ponto</span>
          </label>
          <p style="font-size:11px;color:#6b7280;margin-top:4px">
            Conforme LGPD Art. 7. O funcionário deve ler e assinar o termo de consentimento antes de marcar esta opção.
          </p>
        </div>
        ${existing ? `
        <div class="form-group">
          <label class="checkbox-label" style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="pf-active" ${existing.active ? 'checked' : ''}>
            <span>Funcionário ativo</span>
          </label>
        </div>` : ''}
      `,
      confirmLabel: existing ? 'Salvar' : 'Cadastrar',
      onConfirm: async (overlay, close) => {
        const name  = overlay.querySelector('#pf-name').value.trim();
        const cpf   = overlay.querySelector('#pf-cpf').value.trim();
        const role  = overlay.querySelector('#pf-role').value.trim();
        const dept  = overlay.querySelector('#pf-dept').value.trim();
        const email = overlay.querySelector('#pf-email').value.trim();
        const pin   = overlay.querySelector('#pf-pin').value.trim();
        const gps   = overlay.querySelector('#pf-gps').checked;

        if (!name) { window.showToast('Informe o nome do funcionário.', 'warning'); return; }

        try {
          if (existing) {
            const data = { name, cpf, role, department: dept, email, gps_consent: gps };
            if (pin) data.pin = pin;
            const activeEl = overlay.querySelector('#pf-active');
            if (activeEl) data.active = activeEl.checked;
            await window.DB.updatePontoEmployee(existing.id, data);
            window.showToast('Funcionário atualizado.', 'success');
          } else {
            await window.DB.createPontoEmployee({
              school_id: _schoolId, name, cpf, role, department: dept, email,
              pin: pin || undefined, gps_consent: gps,
            });
            window.showToast('Funcionário cadastrado.', 'success');
          }
          close();
          const content = document.getElementById('ponto-tab-content');
          if (content) await renderFuncionarios(content);
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  // ── Aba: Histórico ────────────────────────────────────────────────────────────

  async function renderHistorico(container) {
    const today   = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    container.innerHTML = `
      <div class="ponto-section-header" style="flex-wrap:wrap;gap:8px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input type="date" id="ph-from" value="${weekAgo}" class="input-sm">
          <span style="color:#6b7280">até</span>
          <input type="date" id="ph-to" value="${today}" class="input-sm">
          <select id="ph-emp" class="input-sm" style="min-width:160px">
            <option value="">Todos os funcionários</option>
          </select>
          <button class="btn btn-primary btn-sm" id="ph-search">🔍 Filtrar</button>
          <button class="btn btn-ghost btn-sm" id="ph-afd" title="Exportar AFD (Portaria 671)">📥 AFD</button>
        </div>
      </div>
      <div id="ponto-hist-result" class="ponto-loading">Carregando...</div>`;

    try {
      const emps = await window.DB.getPontoEmployees(_schoolId);
      const sel  = document.getElementById('ph-emp');
      emps.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.name;
        sel.appendChild(opt);
      });
    } catch (_) {}

    const doSearch = async () => {
      const from = document.getElementById('ph-from')?.value;
      const to   = document.getElementById('ph-to')?.value;
      const emp  = document.getElementById('ph-emp')?.value;
      await loadHistorico({ dateFrom: from, dateTo: to, employeeId: emp || undefined, onRefresh: doSearch });
    };

    document.getElementById('ph-search')?.addEventListener('click', doSearch);
    document.getElementById('ph-afd')?.addEventListener('click', exportAfd);
    await doSearch();
  }

  async function loadHistorico({ dateFrom, dateTo, employeeId, onRefresh } = {}) {
    const result = document.getElementById('ponto-hist-result');
    if (!result) return;
    result.innerHTML = '<div class="ponto-loading">Carregando...</div>';
    try {
      const params = { schoolId: _schoolId };
      if (dateFrom)   params.dateFrom   = dateFrom;
      if (dateTo)     params.dateTo     = dateTo;
      if (employeeId) params.employeeId = employeeId;

      const records = await window.DB.getPontoRecords(params);

      if (!records?.length) {
        result.innerHTML = `<div class="ponto-empty"><p>Nenhum registro no período.</p></div>`;
        return;
      }

      const rows = records.map(r => `
        <tr class="${r.cancelled ? 'ponto-cancelled' : ''}">
          <td>${E(r.employee_name)}</td>
          <td>${typeBadge(r.type)}</td>
          <td>${fmtDate(r.punched_at)}</td>
          <td style="font-size:11px;color:#6b7280">${E(r.source)}</td>
          <td>${r.latitude ? `<span title="${r.latitude},${r.longitude}">📍</span>` : '—'}</td>
          <td>
            ${r.cancelled
              ? `<span style="color:#dc2626;font-size:11px" title="${E(r.cancel_reason)} (${E(r.cancelled_by)})">Cancelado</span>`
              : `<button class="btn btn-ghost btn-sm ponto-cancel-btn" data-record-id="${r.id}">✕</button>`
            }
          </td>
        </tr>`).join('');

      result.innerHTML = `
        <div style="font-size:12px;color:#6b7280;padding:4px 0">${records.length} registro(s)</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Funcionário</th><th>Tipo</th><th>Horário</th><th>Origem</th><th>GPS</th><th>Ação</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      result.querySelectorAll('.ponto-cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => openCancelRecordModal(parseInt(btn.dataset.recordId, 10), onRefresh));
      });
    } catch (e) {
      result.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
    }
  }

  function openCancelRecordModal(id, onDone) {
    window.openModal({
      title: '⚠️ Cancelar Registro de Ponto',
      bodyHtml: `
        <p style="color:#6b7280;font-size:13px;margin-bottom:12px">
          Registros de ponto são imutáveis. O cancelamento fica gravado na auditoria (CLT/Portaria 671).
        </p>
        <div class="form-group">
          <label>Seu nome (gestor responsável) *</label>
          <input type="text" id="cr-by" placeholder="Nome de quem está cancelando">
        </div>
        <div class="form-group">
          <label>Motivo *</label>
          <textarea id="cr-reason" rows="3" placeholder="Ex: duplicidade por falha de rede"></textarea>
        </div>`,
      confirmLabel: 'Confirmar Cancelamento',
      confirmClass: 'btn-danger',
      onConfirm: async (overlay, close) => {
        const by     = overlay.querySelector('#cr-by').value.trim();
        const reason = overlay.querySelector('#cr-reason').value.trim();
        if (!by || !reason) { window.showToast('Preencha todos os campos.', 'warning'); return; }
        try {
          await window.DB.cancelPontoRecord(id, { cancelled_by: by, cancel_reason: reason });
          window.showToast('Registro cancelado e gravado na auditoria.', 'success');
          close();
          if (onDone) onDone();
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  async function exportAfd() {
    const from = document.getElementById('ph-from')?.value;
    const to   = document.getElementById('ph-to')?.value;
    try {
      const params = { schoolId: _schoolId };
      if (from) params.dateFrom = from;
      if (to)   params.dateTo   = to;
      const url  = `/api/ponto/records/export-afd?${new URLSearchParams(params)}`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem(`school_${_schoolId}_token`) || ''}` },
      });
      if (!resp.ok) throw new Error(await resp.text());
      const text = await resp.text();
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `AFD_${_schoolId}_${from || 'completo'}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      window.showToast('AFD exportado.', 'success');
    } catch (e) { window.showToast('Erro ao exportar AFD: ' + e.message, 'error'); }
  }

  // ── Aba: Assinatura ──────────────────────────────────────────────────────────

  async function renderAssinatura(container) {
    container.innerHTML = '<div class="ponto-loading">Carregando...</div>';
    try {
      const st = await window.DB.getPontoStatus(_schoolId);
      const { active, plan, employeeCount, maxEmployees } = st ?? {};

      const PLAN_NAMES = {
        per_employee: 'Por Funcionário',
        mini:         'PONTO MINI (até 30)',
        pronto:       'PONTO PRONTO (até 80)',
        maximo:       'PONTO MÁXIMO (ilimitado)',
      };
      const planName  = active ? (PLAN_NAMES[plan] || plan) : 'Não contratado';
      const limitText = active
        ? (maxEmployees > 0 ? `${employeeCount} / ${maxEmployees} funcionários` : `${employeeCount} funcionários (ilimitado)`)
        : '—';

      container.innerHTML = `
        <div class="ponto-subscription-card">
          <div class="ponto-sub-row">
            <span class="ponto-sub-label">Plano</span>
            <span class="ponto-sub-value">${planName}</span>
          </div>
          <div class="ponto-sub-row">
            <span class="ponto-sub-label">Status</span>
            <span class="ponto-sub-value">${active
              ? '<span style="color:#16a34a;font-weight:600">● Ativo</span>'
              : '<span style="color:#dc2626;font-weight:600">● Inativo</span>'}</span>
          </div>
          <div class="ponto-sub-row">
            <span class="ponto-sub-label">Uso</span>
            <span class="ponto-sub-value">${limitText}</span>
          </div>
        </div>

        ${!active ? `
          <div class="ponto-plans-grid">
            <h3 style="grid-column:1/-1;margin-bottom:4px">Contratar Addon Ponto</h3>
            ${planCard('per_employee','Por Funcionário','R$ 20 (1-10) / R$ 15 (11-20) / R$ 10 (21+)','Pague apenas pelos funcionários cadastrados')}
            ${planCard('mini','PONTO MINI','R$ 300/mês','Até 30 funcionários · R$ 10/extra')}
            ${planCard('pronto','PONTO PRONTO','R$ 600/mês','Até 80 funcionários · R$ 10/extra')}
            ${planCard('maximo','PONTO MÁXIMO','R$ 900/mês','Funcionários ilimitados')}
          </div>` : ''}
        ${active ? '<div style="margin-top:16px"><button class="btn btn-ghost btn-sm" id="ponto-btn-cancel-sub">Cancelar addon Ponto</button></div>' : ''}
      `;

      container.querySelectorAll('[data-subscribe-plan]').forEach(btn => {
        btn.addEventListener('click', () => subscribePlan(btn.dataset.subscribePlan, container));
      });

      document.getElementById('ponto-btn-cancel-sub')?.addEventListener('click', async () => {
        const confirmed = await window.confirmDialog(
          'Confirma o cancelamento do addon Ponto?',
          { confirmLabel: 'Cancelar addon', confirmClass: 'btn-danger', title: 'Cancelar Addon' }
        );
        if (!confirmed) return;
        try {
          await window.DB.cancelPonto({ school_id: _schoolId });
          window.showToast('Addon cancelado.', 'success');
          await renderAssinatura(container);
          updateTabVisibility(false);
        } catch (e) { window.showToast(e.message, 'error'); }
      });
    } catch (e) {
      container.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
    }
  }

  function planCard(type, name, price, desc) {
    return `
      <div class="ponto-plan-card">
        <h4>${name}</h4>
        <p class="price">${price}</p>
        <p class="desc">${desc}</p>
        <button class="btn btn-primary btn-sm" data-subscribe-plan="${type}">Contratar</button>
      </div>`;
  }

  async function subscribePlan(type, container) {
    try {
      await window.DB.subscribePonto({ school_id: _schoolId, plan_type: type });
      window.showToast('Addon Ponto ativado com sucesso!', 'success');
      await renderAssinatura(container);
      updateTabVisibility(true);
    } catch (e) { window.showToast(e.message, 'error'); }
  }

  function updateTabVisibility(visible) {
    const pontoTab = document.querySelector('.tab-btn[data-module="ponto"]');
    if (pontoTab) pontoTab.style.display = visible ? '' : 'none';
  }

  // ── Modal: Bater Ponto ───────────────────────────────────────────────────────

  async function openPunchModal() {
    let employees = [];
    try {
      const all = await window.DB.getPontoEmployees(_schoolId);
      employees = all.filter(e => e.active);
    } catch (_) {}

    if (!employees.length) {
      window.showToast('Nenhum funcionário ativo cadastrado.', 'warning');
      return;
    }

    window.openModal({
      title: '⏱️ Registrar Ponto',
      bodyHtml: `
        <div class="form-group">
          <label>Funcionário *</label>
          <select id="punch-emp">
            <option value="">Selecione...</option>
            ${employees.map(e => `<option value="${e.id}" data-gps="${e.gps_consent ? '1' : '0'}">${E(e.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Tipo de Registro *</label>
          <select id="punch-type">
            <option value="entrada">▶ Entrada</option>
            <option value="saida">■ Saída</option>
            <option value="pausa_inicio">⏸ Início de Pausa</option>
            <option value="pausa_fim">▶ Fim de Pausa</option>
          </select>
        </div>
        <div class="form-group">
          <label>PIN <small style="color:#6b7280">(se cadastrado para este funcionário)</small></label>
          <input type="password" id="punch-pin" placeholder="PIN do funcionário" maxlength="8" autocomplete="off">
        </div>
        <div id="punch-gps-row" style="display:none;background:#f0fdf4;border-radius:8px;padding:8px 12px" class="form-group">
          <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="punch-gps" checked>
            <span>📍 Incluir localização GPS</span>
          </label>
        </div>
        <div id="punch-status" style="font-size:12px;color:#6b7280;margin-top:4px"></div>`,
      confirmLabel: '✅ Registrar',
      confirmClass: 'btn-success',
      onConfirm: async (overlay, close) => {
        const empSel   = overlay.querySelector('#punch-emp');
        const empId    = parseInt(empSel.value, 10);
        const type     = overlay.querySelector('#punch-type').value;
        const pin      = overlay.querySelector('#punch-pin').value.trim();
        const useGps   = overlay.querySelector('#punch-gps')?.checked ?? false;
        const statusEl = overlay.querySelector('#punch-status');

        if (!empId) { window.showToast('Selecione o funcionário.', 'warning'); return; }
        statusEl.textContent = 'Registrando...';

        try {
          const data = { employee_id: empId, school_id: _schoolId, type };
          if (pin) data.pin = pin;

          if (useGps && navigator.geolocation) {
            await new Promise(resolve => {
              navigator.geolocation.getCurrentPosition(
                pos => { data.latitude = pos.coords.latitude; data.longitude = pos.coords.longitude; resolve(); },
                ()  => resolve(),
                { timeout: 5000, maximumAge: 30000 }
              );
            });
          }

          const res = await window.DB.createPontoRecord(data);
          window.showToast(`Ponto registrado às ${fmtTime(res.punched_at || new Date().toISOString())}.`, 'success');
          close();
          const content = document.getElementById('ponto-tab-content');
          if (content && _tab === 'hoje') await renderHoje(content);
        } catch (e) {
          statusEl.textContent = '';
          window.showToast(e.message, 'error');
        }
      },
    });

    document.getElementById('punch-emp')?.addEventListener('change', ev => {
      const opt    = ev.target.selectedOptions[0];
      const gpsRow = document.getElementById('punch-gps-row');
      if (gpsRow) gpsRow.style.display = (opt?.dataset.gps === '1') ? '' : 'none';
    });
  }

  // ── Troca de aba interna ─────────────────────────────────────────────────────

  function switchTab(name) {
    _tab = name;
    document.querySelectorAll('.ponto-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.pontoTab === name);
    });
    const content = document.getElementById('ponto-tab-content');
    if (!content) return;
    switch (name) {
      case 'hoje':         renderHoje(content);         break;
      case 'funcionarios': renderFuncionarios(content); break;
      case 'historico':    renderHistorico(content);    break;
      case 'assinatura':   renderAssinatura(content);   break;
    }
  }

  // ── API pública ──────────────────────────────────────────────────────────────

  return {
    checkVisibility: async function() {
      try {
        const sid = window.AppContext?.schoolId;
        if (!sid) return;
        const st = await window.DB.getPontoStatus(sid);
        updateTabVisibility(!!st?.active);
      } catch (_) {}
    },

    mount(container) {
      _schoolId = window.AppContext?.schoolId;
      container.innerHTML = renderShell();

      document.getElementById('ponto-btn-bater')
        ?.addEventListener('click', openPunchModal);

      document.querySelectorAll('.ponto-tab').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.pontoTab));
      });

      switchTab('hoje');
    },
  };
})();
