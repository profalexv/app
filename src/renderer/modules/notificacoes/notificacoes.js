/**
 * Módulo Notificações Push — gestão pelo coordenador
 * Feature 10 — envio de notificações push a professores
 */

window.ModuleNotificacoes = (() => {
  let _schoolId = null;
  const E = 
  async function mount(container) {
    let teachers = [];
    try { teachers = await window.aula.getTeachers(_schoolId); } catch (_) {}

    const teacherOptions = teachers
      .filter(t => t.active)
      .map(t => `<option value="${E(t.id)}">${E(t.name)}</option>`)
      .join('');

    container.innerHTML = `
      <div style="padding:24px;overflow-y:auto;height:100%;max-width:700px">
        <div class="page-header" style="margin-bottom:24px">
          <div>
            <h1 style="margin:0;font-size:22px">🔔 Notificações Push</h1>
            <p class="subtitle" style="margin:4px 0 0">Envie avisos aos professores via notificação no dispositivo</p>
          </div>
        </div>

        <!-- Status do service worker -->
        <div id="sw-status" style="
          padding:12px 16px;border-radius:8px;margin-bottom:24px;
          background:#f3f4f6;font-size:13px;color:#6b7280
        ">
          Verificando suporte a notificações push...
        </div>

        <!-- Envio avulso para professor específico -->
        <div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
          <h3 style="margin:0 0 16px;font-size:15px">📤 Notificação para Professor Específico</h3>
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
          <div id="notif-single-error" style="color:#dc2626;font-size:13px;min-height:16px"></div>
          <div style="display:flex;justify-content:flex-end;margin-top:12px">
            <button class="btn btn-primary" id="btn-send-single">Enviar para Professor</button>
          </div>
        </div>

        <!-- Broadcast para todos os professores -->
        <div style="background:#fff;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
          <h3 style="margin:0 0 16px;font-size:15px">📣 Broadcast — Todos os Professores</h3>
          <div class="form-group">
            <label>Título *</label>
            <input type="text" id="notif-title-broad" class="form-control" placeholder="Ex: Reunião amanhã às 18h" maxlength="100">
          </div>
          <div class="form-group">
            <label>Mensagem *</label>
            <textarea id="notif-body-broad" class="form-control" rows="2" placeholder="Texto do aviso..." maxlength="250"></textarea>
          </div>
          <div id="notif-broad-error" style="color:#dc2626;font-size:13px;min-height:16px"></div>
          <div style="display:flex;justify-content:flex-end;margin-top:12px">
            <button class="btn btn-primary" id="btn-send-broad">Enviar para Todos</button>
          </div>
        </div>

        <!-- Instruções para o professor ativar -->
        <div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
          <h3 style="margin:0 0 12px;font-size:15px">ℹ️ Como funciona</h3>
          <ul style="font-size:13px;color:#374151;line-height:1.8;padding-left:20px">
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
      if (perm === 'granted') {
        swStatus.style.background = '#d1fae5';
        swStatus.style.color = '#16a34a';
        swStatus.textContent = '✓ Notificações push ativas neste dispositivo.';
      } else if (perm === 'denied') {
        swStatus.style.background = '#fee2e2';
        swStatus.style.color = '#dc2626';
        swStatus.textContent = '✗ Notificações bloqueadas neste dispositivo. Verifique as configurações do navegador.';
      } else {
        swStatus.style.background = '#fef3c7';
        swStatus.style.color = '#d97706';
        swStatus.innerHTML = '⚠️ Notificações não autorizadas. <button class="btn btn-sm btn-ghost" id="btn-request-perm" style="margin-left:8px">Autorizar</button>';
        document.getElementById('btn-request-perm')?.addEventListener('click', async () => {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            swStatus.style.background = '#d1fae5';
            swStatus.style.color = '#16a34a';
            swStatus.textContent = '✓ Notificações push ativas neste dispositivo.';
          }
        });
      }
    } else {
      swStatus.style.background = '#fee2e2';
      swStatus.style.color = '#dc2626';
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
