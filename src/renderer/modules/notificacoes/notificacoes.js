/**
 * Módulo Notificações Push — gestão pelo coordenador
 * Feature 10 — envio de notificações push a professores
 */

window.ModuleNotificacoes = (() => {
  let _schoolId = null;
  const E = window._esc;
  async function mount(container) {
    container.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary)">Carregando professores…</div>';

    let teachers = [];
    try { teachers = await window.aula.getTeachers(_schoolId); } catch (_) {}

    const activeTeachers = teachers.filter(t => t.active);

    const teacherOptions = activeTeachers
      .map(t => `<option value="${E(t.id)}">${E(t.name)}</option>`)
      .join('');

    if (activeTeachers.length === 0) {
      container.innerHTML = `
        <div class="module-container" style="max-width:700px">
          <div class="page-header" style="margin-bottom:24px;">
            <div>
              <h1>🔔 Notificações Push</h1>
              <p class="subtitle">Envie avisos aos professores via notificação no dispositivo</p>
            </div>
          </div>
          <div class="empty-state" style="padding:48px 24px;text-align:center;background:var(--bg-secondary,#f8f9fa);border-radius:8px;border:1px dashed var(--border-color,#dee2e6)">
            <div style="font-size:48px;margin-bottom:16px">🔕</div>
            <h3 style="margin:0 0 8px;color:var(--text-primary)">Nenhum professor ativo</h3>
            <p style="margin:0;color:var(--text-secondary)">Cadastre professores em <strong>Usuários</strong> para poder enviar notificações.</p>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="module-container" style="max-width:700px">
        <div class="page-header" style="margin-bottom:24px;">
          <div>
            <h1>🔔 Notificações Push</h1>
            <p class="subtitle">Envie avisos aos professores via notificação no dispositivo</p>
          </div>
        </div>

        <!-- Status do service worker -->
        <div id="sw-status" class="sw-status">
          Verificando suporte a notificações push...
        </div>

        <!-- Envio avulso para professor específico -->
        <div class="notification-panel">
          <h3 class="panel-title">📤 Notificação para Professor Específico</h3>
          <div class="form-group">
            <label>Professor</label>
            <select id="notif-teacher" class="form-control">
              <option value="">Selecione um professor...</option>
              ${teacherOptions}
            </select>
          </div>
          <div class="form-group">
            <label>Título *</label>
            <input type="text" id="notif-title-single" class="form-control" placeholder="Ex: Cronograma atualizado" maxlength="100">
          </div>
          <div class="form-group">
            <label>Mensagem *</label>
            <textarea id="notif-body-single" class="form-control" rows="2" placeholder="Texto da notificação..." maxlength="250"></textarea>
          </div>
          <div id="notif-single-error" class="form-error" style="min-height:16px"></div>
          <div class="form-actions">
            <button class="btn btn-primary" id="btn-send-single">Enviar para Professor</button>
          </div>
        </div>

        <!-- Broadcast para todos os professores -->
        <div class="notification-panel">
          <h3 class="panel-title">📣 Broadcast — Todos os Professores</h3>
          <div class="form-group">
            <label>Título *</label>
            <input type="text" id="notif-title-broad" class="form-control" placeholder="Ex: Reunião amanhã às 18h" maxlength="100">
          </div>
          <div class="form-group">
            <label>Mensagem *</label>
            <textarea id="notif-body-broad" class="form-control" rows="2" placeholder="Texto do aviso..." maxlength="250"></textarea>
          </div>
          <div id="notif-broad-error" class="form-error" style="min-height:16px"></div>
          <div class="form-actions">
            <button class="btn btn-primary" id="btn-send-broad">Enviar para Todos</button>
          </div>
        </div>

        <!-- Instruções para o professor ativar -->
        <div class="info-panel notification-panel">
          <h3 class="panel-title">ℹ️ Como funciona</h3>
          <ul>
            <li>Os professores precisam acessar o <strong>aula.app</strong> e autorizar notificações no navegador.</li>
            <li>Após autorizar, recebem notificações mesmo com o app fechado.</li>
            <li>Você pode enviar avisos individualmente ou para todos de uma vez.</li>
            <li>Notificações de mudança de cronograma são enviadas automaticamente.</li>
          </ul>
        </div>
      </div>
    `;

    // Verificar suporte no browser
    const swStatus = document.getElementById('sw-status');
    if ('Notification' in window && 'serviceWorker' in navigator) {
      const perm = Notification.permission;
      swStatus.classList.remove('sw-status--granted', 'sw-status--denied', 'sw-status--default');
      if (perm === 'granted') {
        swStatus.classList.add('sw-status--granted');
        swStatus.textContent = '✓ Notificações push ativas neste dispositivo.';
      } else if (perm === 'denied') {
        swStatus.classList.add('sw-status--denied');
        swStatus.textContent = '✗ Notificações bloqueadas neste dispositivo. Verifique as configurações do navegador.';
      } else {
        swStatus.classList.add('sw-status--default');
        swStatus.innerHTML = '⚠️ Notificações não autorizadas. <button class="btn btn-sm btn-ghost" id="btn-request-perm" style="margin-left:8px">Autorizar</button>';
        document.getElementById('btn-request-perm')?.addEventListener('click', async () => {
          const perm = await Notification.requestPermission();
          mount(container); // Recarrega o status
        });
      }
    } else {
      swStatus.classList.add('sw-status--denied');
      swStatus.textContent = '✗ Seu navegador não suporta notificações push.';
    }

    // Envio individual
    document.getElementById('btn-send-single').addEventListener('click', async () => {
      const errEl = document.getElementById('notif-single-error');
      errEl.textContent = '';
      const teacherId = document.getElementById('notif-teacher').value;
      const title     = document.getElementById('notif-title-single').value.trim();
      const body      = document.getElementById('notif-body-single').value.trim();
      if (!teacherId) { errEl.textContent = 'Selecione um professor.'; return; }
      if (!title || !body) { errEl.textContent = 'Título e mensagem são obrigatórios.'; return; }
      try {
        const btn = document.getElementById('btn-send-single');
        btn.disabled = true; btn.textContent = 'Enviando...';
        await window.aula.sendNotificationToTeacher(teacherId, { title, body });
        window.showToast('Notificação enviada com sucesso!', 'success');
        document.getElementById('notif-title-single').value = '';
        document.getElementById('notif-body-single').value  = '';
      } catch (e) {
        errEl.textContent = e.message;
      } finally {
        const btn = document.getElementById('btn-send-single');
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar para Professor'; }
      }
    });

    // Broadcast
    document.getElementById('btn-send-broad').addEventListener('click', async () => {
      const errEl = document.getElementById('notif-broad-error');
      errEl.textContent = '';
      const title = document.getElementById('notif-title-broad').value.trim();
      const body  = document.getElementById('notif-body-broad').value.trim();
      if (!title || !body) { errEl.textContent = 'Título e mensagem são obrigatórios.'; return; }
      if (!confirm(`Enviar "${title}" para TODOS os professores com notificações ativas?`)) return;
      try {
        const btn = document.getElementById('btn-send-broad');
        btn.disabled = true; btn.textContent = 'Enviando...';
        const result = await window.aula.broadcastNotification({ schoolId: _schoolId, title, body });
        window.showToast(`Notificação enviada para ${result.sent ?? '?'} professor(es).`, 'success');
        document.getElementById('notif-title-broad').value = '';
        document.getElementById('notif-body-broad').value  = '';
      } catch (e) {
        errEl.textContent = e.message;
      } finally {
        const btn = document.getElementById('btn-send-broad');
        if (btn) { btn.disabled = false; btn.textContent = 'Enviar para Todos'; }
      }
    });
  }

  return {
    async initialize(schoolId) { _schoolId = schoolId; },
    mount,
  };
})();
