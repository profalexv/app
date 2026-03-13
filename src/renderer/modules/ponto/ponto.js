/**
 * Módulo de Registro de Ponto de Funcionário
 *
 * Abas: Hoje | Funcionários | Histórico | Verificação | Folha | Assinatura
 *
 * Conformidade: CLT Art. 74 / Portaria MTP 671/2021 (REP-A) / LGPD
 *
 * Verificação : visto diário pelo supervisor (pendente/validado/inconsistente)
 * Folha        : aceite mensal pelo funcionário (eletrônico ou scan físico)
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
          <button class="ponto-tab" data-ponto-tab="verificacao" role="tab">✅ Verificação</button>
          <button class="ponto-tab" data-ponto-tab="folha" role="tab">📄 Folha Mensal</button>
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
            ${planCard('per_employee','Por Funcionário','R$ 20 (1-8) / R$ 16 (9-16) / R$ 10 (17+)','Pague apenas pelos funcionários cadastrados')}
            ${planCard('mini','PONTO MINI','R$ 340/mês','Até 30 funcionários · R$ 10/extra')}
            ${planCard('pronto','PONTO PRONTO','R$ 640/mês','Até 80 funcionários · R$ 10/extra')}
            ${planCard('maximo','PONTO MÁXIMO','R$ 980/mês','Funcionários ilimitados')}
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

  // ── Aba: Verificação (Visto Diário de Supervisão) ───────────────────────────

  async function renderVerificacao(container) {
    const today = new Date().toISOString().slice(0, 10);
    container.innerHTML = `
      <div class="ponto-section-header" style="flex-wrap:wrap;gap:8px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <label style="color:#374151;font-size:13px;font-weight:500">Data:</label>
          <input type="date" id="pv-date" value="${today}" class="input-sm">
          <button class="btn btn-primary btn-sm" id="pv-load">🔍 Carregar</button>
          <button class="btn btn-ghost btn-sm" id="pv-add">+ Novo Visto</button>
        </div>
      </div>
      <div id="ponto-verif-result" class="ponto-loading">Carregando...</div>`;

    const doLoad = async () => {
      const date = document.getElementById('pv-date')?.value;
      await loadVerificacoes(date);
    };
    document.getElementById('pv-load')?.addEventListener('click', doLoad);
    document.getElementById('pv-add')?.addEventListener('click', () => openVerifModal(null, doLoad));
    await doLoad();
  }

  async function loadVerificacoes(date) {
    const result = document.getElementById('ponto-verif-result');
    if (!result) return;
    result.innerHTML = '<div class="ponto-loading">Carregando...</div>';
    try {
      const params = { schoolId: _schoolId };
      if (date) { params.dateFrom = date; params.dateTo = date; }
      const verifs = await window.DB.getPontoVerifications(params);

      if (!verifs?.length) {
        result.innerHTML = `<div class="ponto-empty"><p>Nenhum visto registrado para essa data.</p><button class="btn btn-ghost btn-sm" id="pv-empty-add">+ Registrar visto</button></div>`;
        document.getElementById('pv-empty-add')?.addEventListener('click', () => openVerifModal(null, () => loadVerificacoes(date)));
        return;
      }

      const STATUS_BADGE = {
        pendente:      '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#92400e;background:#fef3c7">⏳ Pendente</span>',
        validado:      '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#065f46;background:#d1fae5">✅ Validado</span>',
        inconsistente: '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;color:#991b1b;background:#fee2e2">⚠️ Inconsistente</span>',
      };

      const rows = verifs.map(v => `
        <tr>
          <td>${E(v.employee_name)}</td>
          <td>${E(v.record_date)}</td>
          <td>${STATUS_BADGE[v.status] || E(v.status)}</td>
          <td>${E(v.verified_by)}</td>
          <td>${fmtDate(v.verified_at)}</td>
          <td style="font-size:11px;color:#6b7280;max-width:200px;word-break:break-word">${E(v.notes || '—')}</td>
          <td><button class="btn btn-ghost btn-sm pv-edit-btn" data-verif-id="${v.id}">✏️</button></td>
        </tr>`).join('');

      result.innerHTML = `
        <div style="font-size:12px;color:#6b7280;padding:4px 0">${verifs.length} visto(s)</div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Funcionário</th><th>Data</th><th>Status</th><th>Supervisor</th><th>Visitado em</th><th>Observações</th><th>Ação</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;

      result.querySelectorAll('.pv-edit-btn').forEach(btn => {
        const v = verifs.find(x => x.id === parseInt(btn.dataset.verifId, 10));
        btn.addEventListener('click', () => openVerifModal(v, () => loadVerificacoes(date)));
      });
    } catch (e) {
      result.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
    }
  }

  async function openVerifModal(existing, onDone) {
    let employees = [];
    if (!existing) {
      try {
        const all = await window.DB.getPontoEmployees(_schoolId);
        employees = all.filter(e => e.active);
      } catch (_) {}
    }

    window.openModal({
      title: existing ? '✏️ Atualizar Visto' : '✅ Registrar Visto Diário',
      bodyHtml: `
        ${!existing ? `
        <div class="form-group">
          <label>Funcionário *</label>
          <select id="pv-modal-emp">
            <option value="">Selecione...</option>
            ${employees.map(e => `<option value="${e.id}">${E(e.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Data *</label>
          <input type="date" id="pv-modal-date" value="${new Date().toISOString().slice(0, 10)}">
        </div>` : `<p style="color:#374151;font-size:13px;margin-bottom:12px"><strong>${E(existing.employee_name)}</strong> — ${E(existing.record_date)}</p>`}
        <div class="form-group">
          <label>Supervisor (seu nome) *</label>
          <input type="text" id="pv-modal-by" value="${E(existing?.verified_by || '')}" placeholder="Nome do supervisor">
        </div>
        <div class="form-group">
          <label>Status *</label>
          <select id="pv-modal-status">
            <option value="pendente" ${existing?.status === 'pendente' ? 'selected' : ''}>⏳ Pendente</option>
            <option value="validado" ${existing?.status === 'validado' ? 'selected' : ''}>✅ Validado</option>
            <option value="inconsistente" ${existing?.status === 'inconsistente' ? 'selected' : ''}>⚠️ Inconsistente</option>
          </select>
        </div>
        <div id="pv-notes-group" style="${existing?.status === 'inconsistente' ? '' : 'display:none'}">
          <div class="form-group">
            <label>Observações / Justificativa *</label>
            <textarea id="pv-modal-notes" rows="3" placeholder="Descreva a inconsistência encontrada">${E(existing?.notes || '')}</textarea>
          </div>
        </div>`,
      confirmLabel: existing ? 'Salvar Alteração' : 'Registrar Visto',
      onConfirm: async (overlay, close) => {
        const status = overlay.querySelector('#pv-modal-status').value;
        const by     = overlay.querySelector('#pv-modal-by').value.trim();
        const notes  = overlay.querySelector('#pv-modal-notes')?.value.trim() || '';
        if (!by) { window.showToast('Informe o nome do supervisor.', 'warning'); return; }
        if (status === 'inconsistente' && !notes) { window.showToast('Justificativa obrigatória para status Inconsistente.', 'warning'); return; }
        try {
          if (existing) {
            await window.DB.updatePontoVerification(existing.id, { status, notes: notes || null, verified_by: by });
          } else {
            const empId = overlay.querySelector('#pv-modal-emp')?.value;
            const date  = overlay.querySelector('#pv-modal-date')?.value;
            if (!empId || !date) { window.showToast('Selecione o funcionário e a data.', 'warning'); return; }
            await window.DB.createPontoVerification({
              school_id: _schoolId, employee_id: parseInt(empId, 10),
              record_date: date, verified_by: by, status, notes: notes || null,
            });
          }
          window.showToast('Visto registrado.', 'success');
          close();
          if (onDone) onDone();
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });

    document.getElementById('pv-modal-status')?.addEventListener('change', ev => {
      const notesGroup = document.getElementById('pv-notes-group');
      if (notesGroup) notesGroup.style.display = (ev.target.value === 'inconsistente') ? '' : 'none';
    });
  }

  // ── Aba: Folha Mensal (Aceite do Funcionário) ────────────────────────────────

  async function renderFolha(container) {
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    container.innerHTML = `
      <div class="ponto-section-header" style="flex-wrap:wrap;gap:8px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <label style="color:#374151;font-size:13px;font-weight:500">Mês:</label>
          <input type="month" id="pf-month" value="${curMonth}" class="input-sm">
          <button class="btn btn-primary btn-sm" id="pf-load">🔍 Carregar</button>
        </div>
      </div>
      <div id="ponto-folha-result" class="ponto-loading">Carregando...</div>`;

    const doLoad = async () => {
      const month = document.getElementById('pf-month')?.value;
      await loadFolha(month);
    };
    document.getElementById('pf-load')?.addEventListener('click', doLoad);
    await doLoad();
  }

  async function loadFolha(periodMonth) {
    const result = document.getElementById('ponto-folha-result');
    if (!result) return;
    result.innerHTML = '<div class="ponto-loading">Carregando...</div>';
    try {
      const [employees, signatures, settings] = await Promise.all([
        window.DB.getPontoEmployees(_schoolId),
        window.DB.getPontoSignatures({ schoolId: _schoolId, periodMonth }),
        window.DB.getPontoSettings(_schoolId),
      ]);

      const allowElectronic = settings?.allow_electronic_signature !== false;
      const allowPhysical   = settings?.allow_physical_signature   !== false;
      const sigMap = {};
      (signatures || []).forEach(s => { sigMap[s.employee_id] = s; });

      const activeEmps = (employees || []).filter(e => !e.deleted_at);
      if (!activeEmps.length) {
        result.innerHTML = `<div class="ponto-empty"><p>Nenhum funcionário cadastrado.</p></div>`;
        return;
      }

      const rows = activeEmps.map(emp => {
        const sig = sigMap[emp.id];
        let statusCell, actionCell;

        if (!sig || !sig.method) {
          statusCell = `<span style="color:#92400e;font-weight:500">⏳ Pendente</span>`;
          const btns = [];
          if (allowElectronic) btns.push(`<button class="btn btn-primary btn-sm pf-e-sign" data-emp-id="${emp.id}" data-emp-name="${E(emp.name)}" data-sig-id="${sig?.id || ''}">✅ Aceite Eletrônico</button>`);
          if (allowPhysical)   btns.push(`<button class="btn btn-ghost btn-sm pf-upload" data-emp-id="${emp.id}" data-emp-name="${E(emp.name)}" data-sig-id="${sig?.id || ''}">📤 Upload Scan</button>`);
          actionCell = btns.length ? btns.join(' ') : '<span style="color:#6b7280;font-size:11px">Nenhum método habilitado</span>';
        } else if (sig.method === 'electronic') {
          statusCell = `<span style="color:#065f46;font-weight:500">✅ Assinado Eletronicamente</span>`;
          actionCell = `<span style="font-size:11px;color:#6b7280">${E(sig.signed_by_name)} · ${fmtDate(sig.signed_at)}</span>`;
        } else {
          statusCell = `<span style="color:#1d4ed8;font-weight:500">📁 Scan Enviado</span>`;
          actionCell = `<span style="font-size:11px;color:#6b7280">Upload por ${E(sig.uploaded_by)} · ${fmtDate(sig.uploaded_at)}</span>`;
        }

        return `<tr>
          <td>${E(emp.name)}</td>
          <td>${statusCell}</td>
          <td>${actionCell}</td>
        </tr>`;
      }).join('');

      result.innerHTML = `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#14532d">
          Aceite eletrônico grava o próprio funcionário como validador + data/hora do clique.
          Envio do scan físico valida todos os registros do período.
          ${!allowElectronic ? ' <strong>· Aceite eletrônico desativado para esta escola.</strong>' : ''}
          ${!allowPhysical   ? ' <strong>· Envio físico desativado para esta escola.</strong>'    : ''}
        </div>
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>Funcionário</th><th>Status</th><th>Detalhe / Ação</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div style="margin-top:12px">
          <button class="btn btn-ghost btn-sm" id="pf-settings-btn">⚙️ Config. de Assinatura</button>
        </div>`;

      result.querySelectorAll('.pf-e-sign').forEach(btn => {
        btn.addEventListener('click', () =>
          openElectronicSignModal(btn.dataset, periodMonth, () => loadFolha(periodMonth)));
      });
      result.querySelectorAll('.pf-upload').forEach(btn => {
        btn.addEventListener('click', () =>
          openUploadScanModal(btn.dataset, periodMonth, () => loadFolha(periodMonth)));
      });
      document.getElementById('pf-settings-btn')?.addEventListener('click', () =>
        openFolhaSettings(settings, periodMonth));
    } catch (e) {
      result.innerHTML = `<div class="ponto-error">Erro: ${E(e.message)}</div>`;
    }
  }

  async function openElectronicSignModal(dataset, periodMonth, onDone) {
    const empName = dataset.empName;
    const empId   = parseInt(dataset.empId, 10);
    let   sigId   = parseInt(dataset.sigId, 10) || 0;

    window.openModal({
      title: '✅ Aceite Eletrônico — Folha de Ponto',
      bodyHtml: `
        <p style="color:#374151;font-size:14px;margin-bottom:8px">
          <strong>${E(empName)}</strong> — ${E(periodMonth)}
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px;margin-bottom:12px;font-size:13px;color:#14532d">
          Ao confirmar, o aceite eletrônico da folha de ponto do período
          <strong>${E(periodMonth)}</strong> será registrado com o nome deste funcionário
          e o horário atual como validador. Todos os registros do período serão validados.
        </div>
        <p style="font-size:12px;color:#6b7280">
          ⚠️ Esta ação não pode ser desfeita.
          Caso haja inconsistência, utilize o Visto de Supervisão.
        </p>`,
      confirmLabel: '✅ Confirmar Aceite',
      onConfirm: async (overlay, close) => {
        try {
          if (!sigId) {
            const created = await window.DB.createPontoSignature({
              school_id: _schoolId, employee_id: empId, period_month: periodMonth,
            });
            sigId = created?.id;
          }
          await window.DB.electronicSignPonto(sigId);
          window.showToast('Aceite eletrônico registrado com sucesso.', 'success');
          close();
          if (onDone) onDone();
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  function openUploadScanModal(dataset, periodMonth, onDone) {
    const empName = dataset.empName;
    const empId   = parseInt(dataset.empId, 10);
    let   sigId   = parseInt(dataset.sigId, 10) || 0;

    window.openModal({
      title: '📤 Upload — Scan da Folha Assinada',
      bodyHtml: `
        <p style="color:#374151;font-size:14px;margin-bottom:8px">
          <strong>${E(empName)}</strong> — ${E(periodMonth)}
        </p>
        <div class="form-group">
          <label>Arquivo (PDF ou imagem) *</label>
          <input type="file" id="pf-upload-file" accept=".pdf,.jpg,.jpeg,.png">
        </div>
        <div class="form-group">
          <label>Quem está fazendo o upload *</label>
          <input type="text" id="pf-upload-by" placeholder="Seu nome">
        </div>
        <p style="font-size:12px;color:#6b7280">
          O envio do scan físico valida todos os registros do período.
        </p>`,
      confirmLabel: '📤 Enviar Arquivo',
      onConfirm: async (overlay, close) => {
        const fileInput = overlay.querySelector('#pf-upload-file');
        const uploadBy  = overlay.querySelector('#pf-upload-by').value.trim();
        const file      = fileInput?.files?.[0];
        if (!file)     { window.showToast('Selecione um arquivo.', 'warning'); return; }
        if (!uploadBy) { window.showToast('Informe quem está fazendo o upload.', 'warning'); return; }
        if (file.size > 10 * 1024 * 1024) { window.showToast('Arquivo muito grande (máx. 10 MB).', 'warning'); return; }
        try {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          if (!sigId) {
            const created = await window.DB.createPontoSignature({
              school_id: _schoolId, employee_id: empId, period_month: periodMonth,
            });
            sigId = created?.id;
          }
          await window.DB.uploadPontoSignature(sigId, {
            fileData: base64, fileName: file.name, uploadedBy: uploadBy,
          });
          window.showToast('Scan enviado e folha arquivada.', 'success');
          close();
          if (onDone) onDone();
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
  }

  function openFolhaSettings(currentSettings, periodMonth) {
    window.openModal({
      title: '⚙️ Configurações de Assinatura',
      bodyHtml: `
        <p style="color:#6b7280;font-size:13px;margin-bottom:12px">
          Define quais métodos de assinatura são aceitos nesta escola.
        </p>
        <div class="form-group">
          <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="pfs-electronic" ${currentSettings?.allow_electronic_signature !== false ? 'checked' : ''}>
            <span>✅ Permitir aceite eletrônico (clique do funcionário no app)</span>
          </label>
        </div>
        <div class="form-group">
          <label class="checkbox-label" style="display:flex;align-items:center;gap:8px">
            <input type="checkbox" id="pfs-physical" ${currentSettings?.allow_physical_signature !== false ? 'checked' : ''}>
            <span>📄 Permitir envio de scan físico assinado</span>
          </label>
        </div>`,
      confirmLabel: 'Salvar Configurações',
      onConfirm: async (overlay, close) => {
        const allowElectronic = overlay.querySelector('#pfs-electronic').checked;
        const allowPhysical   = overlay.querySelector('#pfs-physical').checked;
        if (!allowElectronic && !allowPhysical) {
          window.showToast('Pelo menos um método de assinatura deve ser permitido.', 'warning');
          return;
        }
        try {
          await window.DB.updatePontoSettings({
            school_id: _schoolId,
            allow_electronic_signature: allowElectronic,
            allow_physical_signature: allowPhysical,
          });
          window.showToast('Configurações salvas.', 'success');
          close();
          const content = document.getElementById('ponto-tab-content');
          if (content && _tab === 'folha') await renderFolha(content);
        } catch (e) { window.showToast(e.message, 'error'); }
      },
    });
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
      case 'verificacao':  renderVerificacao(content);  break;
      case 'folha':        renderFolha(content);        break;
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
