/**
 * Módulo Financeiro — Cobranças de Mensalidades
 *
 * Addon FINANCEIRO (requer ESCOLAR ativo)
 * R$0,30/aluno/mês · +0,5% por transação em modo scholar_managed
 *
 * Modos de gateway:
 *   scholar_managed — Scholar processa via próprio MercadoPago + split 0,5%
 *   client_gateway  — credenciais do cliente; Scholar só gerencia o fluxo
 */

window.ModuleFinanceiro = (() => {
  let _schoolId = null;
  let _tab      = 'dashboard';
  let _plans    = [];
  let _students = [];

  const E   = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmt = c => ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const today = () => new Date().toISOString().slice(0, 10);
  const thisMonth = () => new Date().toISOString().slice(0, 7);

  // ── Shell ─────────────────────────────────────────────────────────────────

  function renderShell() {
    return `
      <div class="module-header">
        <h2 style="margin:0">💰 Financeiro</h2>
        <nav class="module-tabs" style="margin-top:12px">
          ${[
            ['dashboard',    '📊 Dashboard'],
            ['faturas',      '🧾 Faturas'],
            ['contratos',    '📄 Contratos'],
            ['planos',       '💵 Planos'],
            ['negociacoes',  '🤝 Negociações'],
            ['config',       '⚙️ Configuração'],
          ].map(([t, l]) =>
            `<button class="module-tab${_tab === t ? ' active' : ''}" data-t="${t}">${E(l)}</button>`
          ).join('')}
        </nav>
      </div>
      <div id="financeiro-content" style="padding:20px"></div>`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  async function renderDashboard(el) {
    const month = thisMonth();
    el.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-secondary)">Carregando…</div>`;
    try {
      const [status, summary] = await Promise.all([
        window.aula.getFinanceiroStatus(_schoolId),
        window.aula.getFinanceiroInvoicesSummary(_schoolId, month),
      ]);

      el.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:24px">
          <div class="stat-card">
            <div class="stat-value">${E(status.activeContracts || 0)}</div>
            <div class="stat-label">Alunos com contrato</div>
          </div>
          <div class="stat-card" style="border-color:#22c55e">
            <div class="stat-value" style="color:#16a34a">${fmt(summary.monthStats?.received_amount)}</div>
            <div class="stat-label">Recebido em ${E(month)}</div>
          </div>
          <div class="stat-card" style="border-color:#f59e0b">
            <div class="stat-value" style="color:#d97706">${fmt(summary.monthStats?.pending_amount)}</div>
            <div class="stat-label">A receber (mês atual)</div>
          </div>
          <div class="stat-card" style="border-color:#ef4444">
            <div class="stat-value" style="color:#dc2626">${fmt(summary.allOverdue?.amount)}</div>
            <div class="stat-label">Em atraso (total)</div>
          </div>
          <div class="stat-card" style="border-color:#6366f1">
            <div class="stat-value" style="color:#6366f1">${fmt(status.monthlyScholarFee)}</div>
            <div class="stat-label">Taxa Scholar/mês</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
          <div class="card" style="padding:16px">
            <h4 style="margin:0 0 12px;font-size:14px;color:var(--text-secondary)">FATURAS — ${E(month)}</h4>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${badge('success', `✅ ${summary.monthStats?.paid_count || 0} pagas`)}
              ${badge('warning', `⏳ ${summary.monthStats?.pending_count || 0} pendentes`)}
              ${badge('danger',  `⚠️ ${summary.monthStats?.overdue_count || 0} vencidas`)}
            </div>
          </div>
          <div class="card" style="padding:16px">
            <h4 style="margin:0 0 12px;font-size:14px;color:var(--text-secondary)">INADIMPLÊNCIA</h4>
            <div style="font-size:28px;font-weight:800;color:${summary.allOverdue?.count > 0 ? '#dc2626' : '#16a34a'}">
              ${summary.allOverdue?.count || 0} aluno(s)
            </div>
            <div style="font-size:13px;color:var(--text-secondary)">${fmt(summary.allOverdue?.amount)} em aberto</div>
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="dash-gen-invoices">⚡ Gerar faturas de ${E(month)}</button>
          <button class="btn btn-ghost btn-sm" id="dash-view-overdue">Ver em atraso</button>
        </div>`;

      el.querySelector('#dash-gen-invoices')?.addEventListener('click', () => generateInvoicesFor(month));
      el.querySelector('#dash-view-overdue')?.addEventListener('click', () => {
        _tab = 'faturas';
        document.querySelectorAll('.module-tab').forEach(b => b.classList.toggle('active', b.dataset.t === 'faturas'));
        renderFaturas(el, { status: 'vencido' });
      });
    } catch(e) {
      el.innerHTML = `<p class="form-error">Erro: ${E(e.message)}</p>`;
    }
  }

  function badge(type, text) {
    const map = { success: '#dcfce7:#16a34a', warning: '#fef9c3:#92400e', danger: '#fee2e2:#dc2626', info: '#ede9fe:#6366f1' };
    const [bg, color] = (map[type] || map.info).split(':');
    return `<span style="background:${bg};color:${color};padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600">${E(text)}</span>`;
  }

  async function generateInvoicesFor(month) {
    if (!await window.confirmDialog(`Gerar faturas de ${month} para todos os contratos ativos?`)) return;
    try {
      const r = await window.aula.generateFinanceiroInvoices({ school_id: _schoolId, reference_month: month });
      window.showToast(`${r.created} fatura(s) gerada(s). ${r.skipped} já existiam.`, 'success');
    } catch(e) { window.showToast(e.message, 'error'); }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FATURAS
  // ══════════════════════════════════════════════════════════════════════════

  async function renderFaturas(el, preFilter = {}) {
    const month  = preFilter.month  || thisMonth();
    const status = preFilter.status || '';
    el.innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px">
        <div class="form-group" style="margin:0">
          <label class="form-label">Mês</label>
          <input type="month" id="fat-month" class="form-input" value="${E(month)}" style="width:160px">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Status</label>
          <select id="fat-status" class="form-input" style="width:160px">
            <option value="">Todos</option>
            <option value="pendente"  ${status==='pendente'  ? 'selected':''}>Pendente</option>
            <option value="pago"      ${status==='pago'      ? 'selected':''}>Pago</option>
            <option value="vencido"   ${status==='vencido'   ? 'selected':''}>Vencido</option>
            <option value="cancelado" ${status==='cancelado' ? 'selected':''}>Cancelado</option>
            <option value="negociado" ${status==='negociado' ? 'selected':''}>Negociado</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm" id="fat-filter-btn">🔍 Filtrar</button>
        <button class="btn btn-ghost btn-sm" id="fat-gen-btn">⚡ Gerar faturas do mês</button>
      </div>
      <div id="fat-list">Carregando…</div>`;

    const load = async () => {
      const m = el.querySelector('#fat-month').value;
      const s = el.querySelector('#fat-status').value;
      const listEl = el.querySelector('#fat-list');
      listEl.innerHTML = `<div style="padding:20px;text-align:center">Carregando…</div>`;
      try {
        const rows = await window.aula.getFinanceiroInvoices({ schoolId: _schoolId, month: m, status: s });
        if (!rows.length) {
          listEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-secondary)">Nenhuma fatura encontrada.</div>`;
          return;
        }
        const statusColor = { pendente:'#f59e0b', pago:'#22c55e', vencido:'#ef4444', cancelado:'#94a3b8', negociado:'#6366f1' };
        listEl.innerHTML = `
          <table class="data-table">
            <thead><tr>
              <th>Aluno</th><th>Ref.</th><th>Vencimento</th>
              <th style="text-align:right">Valor</th>
              <th style="text-align:right">Multa+Juros</th>
              <th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => {
                const total = r.amount + (r.fine_amount||0) + (r.interest_amount||0) - (r.discount_amount||0);
                return `<tr>
                  <td>${E(r.student_name)}</td>
                  <td>${E(r.reference_month)}</td>
                  <td>${fmtDate(r.due_date)}</td>
                  <td style="text-align:right">${fmt(r.amount)}</td>
                  <td style="text-align:right">${r.fine_amount ? fmt((r.fine_amount||0)+(r.interest_amount||0)) : '—'}</td>
                  <td><span style="background:${statusColor[r.status]||'#94a3b8'}22;color:${statusColor[r.status]||'#64748b'};padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600">${E(r.status)}</span></td>
                  <td>
                    ${r.status !== 'pago' && r.status !== 'cancelado' && r.status !== 'negociado' ? `
                      <button class="btn btn-ghost btn-xs" data-charge="${r.id}" title="Gerar PIX">💳</button>
                      <button class="btn btn-ghost btn-xs" data-mark-paid="${r.id}" style="color:#16a34a" title="Registrar como pago">✅</button>
                    ` : ''}
                    ${r.pix_code ? `<button class="btn btn-ghost btn-xs" data-show-pix="${E(r.pix_code)}" data-show-val="${r.amount + (r.fine_amount||0) + (r.interest_amount||0) - (r.discount_amount||0)}" title="Ver PIX">📋</button>` : ''}
                    ${r.status !== 'cancelado' && r.status !== 'pago' ? `<button class="btn btn-ghost btn-xs" data-cancel-inv="${r.id}" style="color:#dc2626" title="Cancelar">🗑</button>` : ''}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`;

        // Charge (gerar PIX)
        listEl.querySelectorAll('[data-charge]').forEach(btn =>
          btn.addEventListener('click', async () => {
            try {
              const r = await window.aula.chargeFinanceiroInvoice(
                Number(btn.dataset.charge), { school_id: _schoolId }
              );
              showPixModal(r.pix_code, r.total_amount);
              load();
            } catch(e) { window.showToast(e.message, 'error'); }
          })
        );

        // Mostrar PIX existente
        listEl.querySelectorAll('[data-show-pix]').forEach(btn =>
          btn.addEventListener('click', () => showPixModal(btn.dataset.showPix, Number(btn.dataset.showVal)))
        );

        // Marcar como pago manualmente
        listEl.querySelectorAll('[data-mark-paid]').forEach(btn =>
          btn.addEventListener('click', async () => {
            const id = Number(btn.dataset.markPaid);
            if (!await window.confirmDialog('Registrar fatura como paga manualmente?')) return;
            try {
              await window.aula.updateFinanceiroInvoice(id, {
                school_id: _schoolId, status: 'pago',
                paid_at: new Date().toISOString(), amount_paid: null,
              });
              window.showToast('Fatura marcada como paga.', 'success');
              load();
            } catch(e) { window.showToast(e.message, 'error'); }
          })
        );

        // Cancelar
        listEl.querySelectorAll('[data-cancel-inv]').forEach(btn =>
          btn.addEventListener('click', async () => {
            if (!await window.confirmDialog('Cancelar esta fatura?')) return;
            try {
              await window.aula.updateFinanceiroInvoice(Number(btn.dataset.cancelInv), {
                school_id: _schoolId, status: 'cancelado',
              });
              window.showToast('Fatura cancelada.', 'success');
              load();
            } catch(e) { window.showToast(e.message, 'error'); }
          })
        );
      } catch(e) {
        listEl.innerHTML = `<p class="form-error">Erro: ${E(e.message)}</p>`;
      }
    };

    el.querySelector('#fat-filter-btn').addEventListener('click', load);
    el.querySelector('#fat-gen-btn').addEventListener('click', () => {
      generateInvoicesFor(el.querySelector('#fat-month').value).then(load);
    });
    load();
  }

  function showPixModal(pixCode, totalAmountCents) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-container" style="max-width:500px">
        <div class="modal-header">
          <h3 style="margin:0">📋 Código PIX</h3>
          <button class="modal-close" id="pix-close">×</button>
        </div>
        <div class="modal-body">
          <div style="text-align:center;margin-bottom:16px">
            <div style="font-size:22px;font-weight:800;color:#16a34a">${fmt(totalAmountCents)}</div>
            <div style="font-size:13px;color:var(--text-secondary)">Valor total a pagar</div>
          </div>
          <textarea readonly class="form-input" rows="4" id="pix-code-text" style="font-family:monospace;font-size:12px;word-break:break-all">${E(pixCode)}</textarea>
          <button class="btn btn-primary" style="width:100%;margin-top:10px" id="pix-copy">📋 Copiar código</button>
          <p style="font-size:12px;color:var(--text-secondary);margin-top:10px;text-align:center">
            ⚠️ Este é um código de demonstração. A integração com MercadoPago será ativada em produção.
          </p>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#pix-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#pix-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(pixCode).then(() => window.showToast('Código copiado!', 'success'));
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONTRATOS
  // ══════════════════════════════════════════════════════════════════════════

  async function renderContratos(el) {
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="display:flex;gap:8px">
          <select id="ct-status" class="form-input" style="width:160px">
            <option value="">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="suspenso">Suspenso</option>
            <option value="encerrado">Encerrado</option>
          </select>
        </div>
        <button class="btn btn-primary btn-sm" id="ct-new-btn">+ Novo contrato</button>
      </div>
      <div id="ct-list">Carregando…</div>`;

    const load = async () => {
      const status = el.querySelector('#ct-status').value;
      const listEl = el.querySelector('#ct-list');
      listEl.innerHTML = `<div style="padding:20px;text-align:center">Carregando…</div>`;
      try {
        const rows = await window.aula.getFinanceiroContracts({ schoolId: _schoolId, status });
        if (!rows.length) {
          listEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-secondary)">Nenhum contrato encontrado.</div>`;
          return;
        }
        listEl.innerHTML = `
          <table class="data-table">
            <thead><tr>
              <th>Aluno</th><th>Responsável</th><th>Plano</th>
              <th style="text-align:right">Mensalidade</th>
              <th>Venc.</th><th>Início</th><th>Status</th><th>Ações</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td>${E(r.student_name)}</td>
                <td>${E(r.responsible_name)}<br><span style="font-size:11px;color:var(--text-secondary)">${E(r.responsible_email||'')}</span></td>
                <td>${E(r.plan_name)}</td>
                <td style="text-align:right">${fmt(r.plan_amount)}</td>
                <td>Dia ${E(r.due_day)}</td>
                <td>${fmtDate(r.start_date)}</td>
                <td>${badge(r.status === 'ativo' ? 'success' : r.status === 'suspenso' ? 'warning' : 'info', r.status)}</td>
                <td>
                  <button class="btn btn-ghost btn-xs" data-ct-edit='${JSON.stringify({id:r.id,student_id:r.student_id,plan_id:r.plan_id,responsible_name:r.responsible_name,responsible_cpf:r.responsible_cpf||'',responsible_email:r.responsible_email||'',responsible_phone:r.responsible_phone||'',start_date:r.start_date,status:r.status,notes:r.notes||''})}'>✏️</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>`;

        listEl.querySelectorAll('[data-ct-edit]').forEach(btn =>
          btn.addEventListener('click', () => {
            openContratoModal(JSON.parse(btn.dataset.ctEdit), load);
          })
        );
      } catch(e) {
        listEl.innerHTML = `<p class="form-error">Erro: ${E(e.message)}</p>`;
      }
    };

    el.querySelector('#ct-status').addEventListener('change', load);
    el.querySelector('#ct-new-btn').addEventListener('click', () => openContratoModal(null, load));
    load();
  }

  function openContratoModal(data, onSave) {
    const isEdit = !!data?.id;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-container" style="max-width:560px">
        <div class="modal-header">
          <h3 style="margin:0">${isEdit ? '✏️ Editar' : '+ Novo'} Contrato</h3>
          <button class="modal-close" id="ct-modal-close">×</button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Aluno *</label>
              <select id="ct-student" class="form-input" ${isEdit ? 'disabled' : ''}>
                <option value="">Selecione…</option>
                ${_students.map(s => `<option value="${s.id}" ${data?.student_id == s.id ? 'selected':''}>${E(s.name)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Plano de mensalidade *</label>
              <select id="ct-plan" class="form-input">
                <option value="">Selecione…</option>
                ${_plans.map(p => `<option value="${p.id}" ${data?.plan_id == p.id ? 'selected':''}>${E(p.name)} — ${fmt(p.amount)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Nome do responsável *</label>
              <input type="text" id="ct-resp-name" class="form-input" value="${E(data?.responsible_name||'')}">
            </div>
            <div class="form-group">
              <label class="form-label">CPF do responsável</label>
              <input type="text" id="ct-resp-cpf" class="form-input" value="${E(data?.responsible_cpf||'')}">
            </div>
            <div class="form-group">
              <label class="form-label">E-mail do responsável</label>
              <input type="email" id="ct-resp-email" class="form-input" value="${E(data?.responsible_email||'')}">
            </div>
            <div class="form-group">
              <label class="form-label">Telefone do responsável</label>
              <input type="tel" id="ct-resp-phone" class="form-input" value="${E(data?.responsible_phone||'')}">
            </div>
            <div class="form-group">
              <label class="form-label">Data de início *</label>
              <input type="date" id="ct-start" class="form-input" value="${E(data?.start_date||today())}">
            </div>
            ${isEdit ? `
            <div class="form-group">
              <label class="form-label">Status</label>
              <select id="ct-status-sel" class="form-input">
                <option value="ativo"     ${data?.status==='ativo'     ? 'selected':''}>Ativo</option>
                <option value="suspenso"  ${data?.status==='suspenso'  ? 'selected':''}>Suspenso</option>
                <option value="encerrado" ${data?.status==='encerrado' ? 'selected':''}>Encerrado</option>
              </select>
            </div>` : ''}
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Observações</label>
              <textarea id="ct-notes" class="form-input" rows="2">${E(data?.notes||'')}</textarea>
            </div>
          </div>
          <p id="ct-err" class="form-error" style="display:none"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="ct-cancel-btn">Cancelar</button>
          <button class="btn btn-primary" id="ct-save-btn">💾 Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#ct-modal-close').addEventListener('click', close);
    overlay.querySelector('#ct-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#ct-save-btn').addEventListener('click', async () => {
      const errEl  = overlay.querySelector('#ct-err');
      const studentId = overlay.querySelector('#ct-student')?.value;
      const planId    = overlay.querySelector('#ct-plan').value;
      const respName  = overlay.querySelector('#ct-resp-name').value.trim();
      const startDate = overlay.querySelector('#ct-start').value;

      if (!isEdit && !studentId) { errEl.textContent = 'Selecione um aluno.'; errEl.style.display=''; return; }
      if (!planId)   { errEl.textContent = 'Selecione um plano.';         errEl.style.display=''; return; }
      if (!respName) { errEl.textContent = 'Nome do responsável obrigatório.'; errEl.style.display=''; return; }
      if (!startDate) { errEl.textContent = 'Data de início obrigatória.'; errEl.style.display=''; return; }

      const payload = {
        school_id:         _schoolId,
        student_id:        studentId || data?.student_id,
        plan_id:           planId,
        responsible_name:  respName,
        responsible_cpf:   overlay.querySelector('#ct-resp-cpf').value,
        responsible_email: overlay.querySelector('#ct-resp-email').value,
        responsible_phone: overlay.querySelector('#ct-resp-phone').value,
        start_date:        startDate,
        notes:             overlay.querySelector('#ct-notes').value,
      };
      if (isEdit) payload.status = overlay.querySelector('#ct-status-sel')?.value;

      try {
        if (isEdit) {
          await window.aula.updateFinanceiroContract(data.id, payload);
        } else {
          await window.aula.createFinanceiroContract(payload);
        }
        window.showToast('Contrato salvo!', 'success');
        close();
        onSave?.();
      } catch(e) { errEl.textContent = e.message; errEl.style.display = ''; }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PLANOS DE MENSALIDADE
  // ══════════════════════════════════════════════════════════════════════════

  async function renderPlanos(el) {
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:14px">
        <span style="font-size:13px;color:var(--text-secondary)">Templates de mensalidade para os contratos</span>
        <button class="btn btn-primary btn-sm" id="pl-new-btn">+ Novo plano</button>
      </div>
      <div id="pl-list">Carregando…</div>`;

    const load = async () => {
      const listEl = el.querySelector('#pl-list');
      try {
        _plans = await window.aula.getFinanceiroPlans(_schoolId);
        if (!_plans.length) {
          listEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-secondary)">Nenhum plano cadastrado. Crie um para começar.</div>`;
          return;
        }
        listEl.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
            ${_plans.map(p => `
              <div class="card" style="padding:16px;border:1px solid var(--border-color)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start">
                  <div>
                    <div style="font-weight:700;font-size:15px">${E(p.name)}</div>
                    <div style="font-size:24px;font-weight:800;color:#6366f1;margin:4px 0">${fmt(p.amount)}</div>
                    <div style="font-size:12px;color:var(--text-secondary)">Venc. dia ${p.due_day} · Multa ${p.fine_percent}% · Juros ${p.interest_daily}%/dia</div>
                    ${p.discount_early ? `<div style="font-size:12px;color:#16a34a">Desconto pontualidade: ${fmt(p.discount_early)} (até ${p.discount_days} dias antes)</div>` : ''}
                  </div>
                  <div style="display:flex;gap:4px">
                    <button class="btn btn-ghost btn-xs" data-pl-edit='${JSON.stringify(p)}'>✏️</button>
                    <button class="btn btn-ghost btn-xs" data-pl-del="${p.id}" style="color:#dc2626">🗑</button>
                  </div>
                </div>
                ${badge(p.active ? 'success' : 'info', p.active ? 'Ativo' : 'Inativo')}
              </div>`).join('')}
          </div>`;

        listEl.querySelectorAll('[data-pl-edit]').forEach(btn =>
          btn.addEventListener('click', () => openPlanoModal(JSON.parse(btn.dataset.plEdit), load))
        );
        listEl.querySelectorAll('[data-pl-del]').forEach(btn =>
          btn.addEventListener('click', async () => {
            if (!await window.confirmDialog('Excluir este plano?')) return;
            try {
              await window.aula.deleteFinanceiroPlan(Number(btn.dataset.plDel), _schoolId);
              window.showToast('Plano excluído.', 'success');
              load();
            } catch(e) { window.showToast(e.message, 'error'); }
          })
        );
      } catch(e) {
        listEl.innerHTML = `<p class="form-error">Erro: ${E(e.message)}</p>`;
      }
    };

    el.querySelector('#pl-new-btn').addEventListener('click', () => openPlanoModal(null, load));
    load();
  }

  function openPlanoModal(data, onSave) {
    const isEdit = !!data?.id;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-container" style="max-width:480px">
        <div class="modal-header">
          <h3 style="margin:0">${isEdit ? '✏️ Editar' : '+ Novo'} Plano</h3>
          <button class="modal-close" id="pl-modal-close">×</button>
        </div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group" style="grid-column:1/-1">
              <label class="form-label">Nome do plano *</label>
              <input type="text" id="pl-name" class="form-input" value="${E(data?.name||'')}">
            </div>
            <div class="form-group">
              <label class="form-label">Mensalidade (R$) *</label>
              <input type="number" id="pl-amount" class="form-input" min="1" step="0.01"
                value="${data ? (data.amount/100).toFixed(2) : ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Dia de vencimento *</label>
              <input type="number" id="pl-due-day" class="form-input" min="1" max="28"
                value="${data?.due_day||10}">
            </div>
            <div class="form-group">
              <label class="form-label">Multa por atraso (%)</label>
              <input type="number" id="pl-fine" class="form-input" min="0" step="0.01"
                value="${data?.fine_percent||2}">
            </div>
            <div class="form-group">
              <label class="form-label">Juros por dia (%)</label>
              <input type="number" id="pl-interest" class="form-input" min="0" step="0.001"
                value="${data?.interest_daily||0.0333}">
            </div>
            <div class="form-group">
              <label class="form-label">Desconto pont. (R$)</label>
              <input type="number" id="pl-discount" class="form-input" min="0" step="0.01"
                value="${data ? (data.discount_early/100).toFixed(2) : '0'}">
            </div>
            <div class="form-group">
              <label class="form-label">Dias antes p/ desconto</label>
              <input type="number" id="pl-disc-days" class="form-input" min="0"
                value="${data?.discount_days||0}">
            </div>
          </div>
          <p id="pl-err" class="form-error" style="display:none"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="pl-cancel-btn">Cancelar</button>
          <button class="btn btn-primary" id="pl-save-btn">💾 Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#pl-modal-close').addEventListener('click', close);
    overlay.querySelector('#pl-cancel-btn').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#pl-save-btn').addEventListener('click', async () => {
      const errEl = overlay.querySelector('#pl-err');
      const name  = overlay.querySelector('#pl-name').value.trim();
      const amtR  = parseFloat(overlay.querySelector('#pl-amount').value);
      const day   = parseInt(overlay.querySelector('#pl-due-day').value, 10);

      if (!name)                       { errEl.textContent='Nome obrigatório.';           errEl.style.display=''; return; }
      if (!amtR || amtR <= 0)          { errEl.textContent='Mensalidade inválida.';        errEl.style.display=''; return; }
      if (day < 1 || day > 28)         { errEl.textContent='Dia de vencimento: 1 a 28.';  errEl.style.display=''; return; }

      const payload = {
        school_id:      _schoolId,
        name,
        amount:         Math.round(amtR * 100),
        due_day:        day,
        fine_percent:   parseFloat(overlay.querySelector('#pl-fine').value) || 2,
        interest_daily: parseFloat(overlay.querySelector('#pl-interest').value) || 0.0333,
        discount_early: Math.round(parseFloat(overlay.querySelector('#pl-discount').value||'0') * 100),
        discount_days:  parseInt(overlay.querySelector('#pl-disc-days').value, 10) || 0,
      };

      try {
        if (isEdit) {
          await window.aula.updateFinanceiroPlan(data.id, payload);
        } else {
          await window.aula.createFinanceiroPlan(payload);
        }
        window.showToast('Plano salvo!', 'success');
        close();
        onSave?.();
      } catch(e) { errEl.textContent = e.message; errEl.style.display = ''; }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // NEGOCIAÇÕES
  // ══════════════════════════════════════════════════════════════════════════

  async function renderNegociacoes(el) {
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;margin-bottom:14px">
        <span style="font-size:13px;color:var(--text-secondary)">Renegociação de débitos em atraso</span>
        <button class="btn btn-primary btn-sm" id="neg-new-btn">🤝 Nova negociação</button>
      </div>
      <div id="neg-list">Carregando…</div>`;

    const load = async () => {
      const listEl = el.querySelector('#neg-list');
      try {
        const rows = await window.aula.getFinanceiroNegotiations(_schoolId);
        if (!rows.length) {
          listEl.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-secondary)">Nenhuma negociação registrada.</div>`;
          return;
        }
        listEl.innerHTML = `
          <table class="data-table">
            <thead><tr>
              <th>Aluno</th><th>Qtd. Faturas</th>
              <th style="text-align:right">Valor orig.</th>
              <th style="text-align:right">Negociado</th>
              <th>Parcelas</th><th>Status</th><th>Data</th>
            </tr></thead>
            <tbody>
              ${rows.map(r => {
                const ids = JSON.parse(r.invoice_ids||'[]');
                return `<tr>
                  <td>${E(r.student_name)}</td>
                  <td>${ids.length}</td>
                  <td style="text-align:right">${fmt(r.total_original)}</td>
                  <td style="text-align:right">${fmt(r.total_negotiated)}</td>
                  <td>${r.installments}×</td>
                  <td>${badge(r.status==='quitada'?'success':r.status==='ativa'?'warning':'info', r.status)}</td>
                  <td>${fmtDate(r.created_at?.slice?.(0,10))}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`;
      } catch(e) {
        listEl.innerHTML = `<p class="form-error">Erro: ${E(e.message)}</p>`;
      }
    };

    el.querySelector('#neg-new-btn').addEventListener('click', () => openNegociacaoModal(load));
    load();
  }

  async function openNegociacaoModal(onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-container" style="max-width:560px">
        <div class="modal-header">
          <h3 style="margin:0">🤝 Nova negociação de débito</h3>
          <button class="modal-close" id="neg-close">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Aluno *</label>
            <select id="neg-student" class="form-input">
              <option value="">Selecione para carregar faturas…</option>
              ${_students.map(s => `<option value="${s.id}">${E(s.name)}</option>`).join('')}
            </select>
          </div>
          <div id="neg-invoices-section" style="display:none">
            <div id="neg-invoices-list" style="margin:12px 0;border:1px solid var(--border-color);border-radius:6px;padding:8px;max-height:200px;overflow-y:auto">
              Carregando faturas…
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
              <div class="form-group">
                <label class="form-label">Valor negociado (R$) *</label>
                <input type="number" id="neg-total" class="form-input" min="0.01" step="0.01">
              </div>
              <div class="form-group">
                <label class="form-label">Nº de parcelas *</label>
                <input type="number" id="neg-inst" class="form-input" min="1" max="60" value="1">
              </div>
              <div class="form-group" style="grid-column:1/-1">
                <label class="form-label">Observações</label>
                <textarea id="neg-notes" class="form-input" rows="2"></textarea>
              </div>
            </div>
          </div>
          <p id="neg-err" class="form-error" style="display:none"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="neg-cancel">Cancelar</button>
          <button class="btn btn-primary" id="neg-save" disabled>💾 Confirmar negociação</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#neg-close').addEventListener('click', close);
    overlay.querySelector('#neg-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    let selectedInvoices = [];

    overlay.querySelector('#neg-student').addEventListener('change', async function() {
      const studentId = this.value;
      if (!studentId) return;
      const section = overlay.querySelector('#neg-invoices-section');
      const listEl  = overlay.querySelector('#neg-invoices-list');
      section.style.display = '';
      listEl.innerHTML = 'Carregando faturas em atraso…';
      try {
        const invoices = await window.aula.getFinanceiroInvoices({
          schoolId: _schoolId, student_id: studentId, status: 'vencido',
        });
        const pending = await window.aula.getFinanceiroInvoices({
          schoolId: _schoolId, student_id: studentId, status: 'pendente',
        });
        const all = [...invoices, ...pending].filter(i => i.status !== 'negociado');
        if (!all.length) {
          listEl.innerHTML = '<span style="color:var(--text-secondary);font-size:13px">Nenhuma fatura pendente ou vencida para este aluno.</span>';
          return;
        }
        listEl.innerHTML = all.map(inv => `
          <label style="display:flex;gap:8px;align-items:center;padding:4px 0;cursor:pointer">
            <input type="checkbox" data-inv-id="${inv.id}" data-inv-amount="${inv.amount + (inv.fine_amount||0) + (inv.interest_amount||0)}" checked>
            <span style="flex:1">${E(inv.reference_month)} — ${E(inv.student_name||'')}</span>
            <span style="font-weight:600">${fmt(inv.amount + (inv.fine_amount||0) + (inv.interest_amount||0))}</span>
            <span style="font-size:11px;color:#ef4444">${E(inv.status)}</span>
          </label>`).join('');

        const updateTotal = () => {
          selectedInvoices = [...listEl.querySelectorAll('input[type=checkbox]:checked')]
            .map(cb => ({ id: Number(cb.dataset.invId), amount: Number(cb.dataset.invAmount) }));
          const total = selectedInvoices.reduce((s, i) => s + i.amount, 0);
          overlay.querySelector('#neg-total').value = (total / 100).toFixed(2);
          overlay.querySelector('#neg-save').disabled = selectedInvoices.length === 0;
        };
        listEl.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', updateTotal));
        updateTotal();
      } catch(e) {
        listEl.innerHTML = `<span class="form-error">Erro: ${E(e.message)}</span>`;
      }
    });

    overlay.querySelector('#neg-save').addEventListener('click', async () => {
      const errEl = overlay.querySelector('#neg-err');
      const totalR = parseFloat(overlay.querySelector('#neg-total').value);
      const inst   = parseInt(overlay.querySelector('#neg-inst').value, 10);
      const studentId = overlay.querySelector('#neg-student').value;

      if (!selectedInvoices.length) { errEl.textContent='Selecione ao menos uma fatura.'; errEl.style.display=''; return; }
      if (!totalR || totalR <= 0)   { errEl.textContent='Valor negociado inválido.';       errEl.style.display=''; return; }
      if (inst < 1 || inst > 60)    { errEl.textContent='Parcelas: 1 a 60.';               errEl.style.display=''; return; }

      try {
        await window.aula.createFinanceiroNegotiation({
          school_id:        _schoolId,
          student_id:       Number(studentId),
          invoice_ids:      selectedInvoices.map(i => i.id),
          total_negotiated: Math.round(totalR * 100),
          installments:     inst,
          notes:            overlay.querySelector('#neg-notes').value,
        });
        window.showToast('Negociação registrada!', 'success');
        close();
        onSave?.();
      } catch(e) { errEl.textContent = e.message; errEl.style.display = ''; }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIGURAÇÃO — gateway + assinatura
  // ══════════════════════════════════════════════════════════════════════════

  async function renderConfig(el) {
    el.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-secondary)">Carregando…</div>`;
    try {
      const [status, gateways] = await Promise.all([
        window.aula.getFinanceiroStatus(_schoolId),
        window.aula.getFinanceiroGateways(_schoolId).catch(() => []),
      ]);

      el.innerHTML = `
        <div style="max-width:700px">
          <!-- Addon status -->
          <div class="card" style="padding:16px;margin-bottom:20px;background:${status.active?'#f0fdf4':'#fafafa'};border:1px solid ${status.active?'#86efac':'var(--border-color)'}">
            <strong style="color:${status.active?'#16a34a':'inherit'}">${status.active?'✅ Addon FINANCEIRO ativo':'ℹ️ Addon não contratado'}</strong>
            ${status.active ? `
              <p style="margin:6px 0 0;font-size:13px;color:var(--text-secondary)">
                ${status.activeContracts} contrato(s) ativo(s) · Taxa Scholar: ${fmt(status.monthlyScholarFee)}/mês ·
                Modo: <strong>${status.gateway_mode === 'scholar_managed' ? 'Scholar gerencia (+0,5%)' : 'Gateway do cliente'}</strong>
              </p>
              <button class="btn btn-ghost btn-sm" id="cfg-cancel-addon" style="margin-top:10px;color:#dc2626">Cancelar addon</button>
            ` : `
              <p style="font-size:13px;color:var(--text-secondary);margin:6px 0 8px">Contrate abaixo para habilitar cobranças de mensalidades.</p>
              <div style="display:flex;gap:10px;flex-wrap:wrap">
                <button class="btn btn-primary btn-sm" data-sub="scholar_managed">▶️ Ativar — Scholar gerencia (+0,5%/transação)</button>
                <button class="btn btn-ghost btn-sm" data-sub="client_gateway">▶️ Ativar — Usar gateway próprio</button>
              </div>
            `}
          </div>

          <!-- Modelo de taxas -->
          <div class="card" style="padding:16px;margin-bottom:20px">
            <h4 style="margin:0 0 10px">💰 Modelo de cobrança Scholar</h4>
            <table class="data-table" style="font-size:13px">
              <thead><tr><th>Item</th><th>Quem paga</th><th>Valor</th></tr></thead>
              <tbody>
                <tr><td>Taxa Scholar por aluno</td><td>Escola (na mensalidade Scholar)</td><td><strong>R$0,30/aluno/mês</strong></td></tr>
                <tr><td>Comissão por transação processada (scholar_managed)</td><td>Escola (deduzido do recebimento)</td><td><strong>0,5%</strong></td></tr>
                <tr><td>Taxas do gateway (MP, Sicredi, etc.)</td><td>Escola (direto no gateway)</td><td>Conforme gateway</td></tr>
              </tbody>
            </table>
          </div>

          <!-- Gateways configurados -->
          <div class="card" style="padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <h4 style="margin:0">🏦 Gateways configurados</h4>
              <button class="btn btn-primary btn-sm" id="cfg-add-gateway">+ Adicionar gateway</button>
            </div>
            <p style="font-size:12px;color:var(--text-secondary);margin:0 0 12px">
              Adicione as credenciais do gateway do cliente (MercadoPago, Sicredi, etc.)
              quando usar o modo <em>gateway do cliente</em>. As chaves são armazenadas com segurança.
            </p>
            ${gateways.length ? `
              <table class="data-table" style="font-size:13px">
                <thead><tr><th>Gateway</th><th>Label</th><th>Status</th><th>Ações</th></tr></thead>
                <tbody>
                  ${gateways.map(g => `<tr>
                    <td>${E(g.provider)}</td>
                    <td>${E(g.label || g.provider)}</td>
                    <td>${badge(g.active ? 'success' : 'info', g.active ? 'Ativo' : 'Inativo')}</td>
                    <td>
                      <button class="btn btn-ghost btn-xs" data-gw-toggle="${g.id}" data-gw-active="${g.active}">${g.active ? 'Desativar' : 'Ativar'}</button>
                      <button class="btn btn-ghost btn-xs" data-gw-del="${g.id}" style="color:#dc2626">🗑</button>
                    </td>
                  </tr>`).join('')}
                </tbody>
              </table>` : `
              <div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:13px">Nenhum gateway configurado.</div>`}
          </div>
        </div>`;

      // Subscribe
      el.querySelectorAll('[data-sub]').forEach(btn =>
        btn.addEventListener('click', async () => {
          if (!await window.confirmDialog('Ativar o addon Financeiro?')) return;
          try {
            await window.aula.subscribeFinanceiro({ school_id: _schoolId, gateway_mode: btn.dataset.sub });
            window.showToast('Addon Financeiro ativado!', 'success');
            renderConfig(el);
          } catch(e) { window.showToast(e.message, 'error'); }
        })
      );

      // Cancel addon
      el.querySelector('#cfg-cancel-addon')?.addEventListener('click', async () => {
        if (!await window.confirmDialog('Cancelar o addon Financeiro? O acesso às cobranças será revogado.')) return;
        try {
          await window.aula.cancelFinanceiro({ school_id: _schoolId });
          window.showToast('Addon cancelado.', 'success');
          renderConfig(el);
        } catch(e) { window.showToast(e.message, 'error'); }
      });

      // Gateway actions
      el.querySelectorAll('[data-gw-toggle]').forEach(btn =>
        btn.addEventListener('click', async () => {
          const active = btn.dataset.gwActive !== 'true';
          try {
            await window.aula.updateFinanceiroGateway(Number(btn.dataset.gwToggle), { school_id: _schoolId, active });
            renderConfig(el);
          } catch(e) { window.showToast(e.message, 'error'); }
        })
      );
      el.querySelectorAll('[data-gw-del]').forEach(btn =>
        btn.addEventListener('click', async () => {
          if (!await window.confirmDialog('Remover este gateway?')) return;
          try {
            await window.aula.deleteFinanceiroGateway(Number(btn.dataset.gwDel), _schoolId);
            window.showToast('Gateway removido.', 'success');
            renderConfig(el);
          } catch(e) { window.showToast(e.message, 'error'); }
        })
      );

      // Add gateway
      el.querySelector('#cfg-add-gateway')?.addEventListener('click', () => openGatewayModal(() => renderConfig(el)));

    } catch(e) {
      el.innerHTML = `<p class="form-error">Erro: ${E(e.message)}</p>`;
    }
  }

  function openGatewayModal(onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-container" style="max-width:480px">
        <div class="modal-header">
          <h3 style="margin:0">🏦 Adicionar gateway</h3>
          <button class="modal-close" id="gw-close">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Provedor *</label>
            <select id="gw-provider" class="form-input">
              <option value="mercadopago">MercadoPago</option>
              <option value="sicredi">Sicredi</option>
              <option value="bradesco">Bradesco</option>
              <option value="itau">Itaú</option>
              <option value="other">Outro</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Label (nome amigável)</label>
            <input type="text" id="gw-label" class="form-input" placeholder="Ex: MP da Escola">
          </div>
          <div class="form-group">
            <label class="form-label">Access Token / Chave de API *</label>
            <input type="password" id="gw-token" class="form-input" autocomplete="new-password">
          </div>
          <p style="font-size:12px;color:var(--text-secondary)">
            🔒 As credenciais são armazenadas de forma segura e nunca são exibidas após o cadastro.
          </p>
          <p id="gw-err" class="form-error" style="display:none"></p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="gw-cancel">Cancelar</button>
          <button class="btn btn-primary" id="gw-save">💾 Salvar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#gw-close').addEventListener('click', close);
    overlay.querySelector('#gw-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    overlay.querySelector('#gw-save').addEventListener('click', async () => {
      const errEl    = overlay.querySelector('#gw-err');
      const provider = overlay.querySelector('#gw-provider').value;
      const token    = overlay.querySelector('#gw-token').value.trim();
      const label    = overlay.querySelector('#gw-label').value.trim();

      if (!token) { errEl.textContent = 'Chave de API obrigatória.'; errEl.style.display = ''; return; }

      try {
        await window.aula.createFinanceiroGateway({
          school_id: _schoolId,
          provider, label,
          credentials: { access_token: token },
        });
        window.showToast('Gateway configurado!', 'success');
        close();
        onSave?.();
      } catch(e) { errEl.textContent = e.message; errEl.style.display = ''; }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MOUNT
  // ══════════════════════════════════════════════════════════════════════════

  function initialize(schoolId) {
    _schoolId = schoolId;
  }

  async function mount(container) {
    container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-secondary)">Carregando módulo Financeiro…</div>`;

    try {
      [_students, _plans] = await Promise.all([
        window.aula.getEscolarStudents?.({ schoolId: _schoolId, active: true }).catch(() => []),
        window.aula.getFinanceiroPlans?.(_schoolId).catch(() => []),
      ]);
    } catch(_) {}

    container.innerHTML = renderShell();

    container.querySelectorAll('.module-tab').forEach(btn =>
      btn.addEventListener('click', () => {
        _tab = btn.dataset.t;
        container.querySelectorAll('.module-tab').forEach(b => b.classList.toggle('active', b.dataset.t === _tab));
        switchTab(container.querySelector('#financeiro-content'));
      })
    );

    switchTab(container.querySelector('#financeiro-content'));
  }

  function switchTab(el) {
    if (!el) return;
    el.innerHTML = '';
    switch (_tab) {
      case 'dashboard':   renderDashboard(el);   break;
      case 'faturas':     renderFaturas(el);      break;
      case 'contratos':   renderContratos(el);    break;
      case 'planos':      renderPlanos(el);       break;
      case 'negociacoes': renderNegociacoes(el);  break;
      case 'config':      renderConfig(el);       break;
    }
  }

  return { initialize, mount };
})();
