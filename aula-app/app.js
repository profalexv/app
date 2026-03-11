/**
 * AULA - App do Professor
 * Lógica principal da aplicação
 */

(function() {
  'use strict';

  // ========================================================================
  // Estado da Aplicação
  // ========================================================================
  
  const State = {
    serverUrl: '',
    token: null,
    teacher: null,
    school: null,
    classes: [],
    resources: [],
    myLessons: [],
    currentView: 'schedule',
    selectedClassId: null,
    selectedResource: null
  };

  // ========================================================================
  // API Client
  // ========================================================================
  
  const API = {
    baseUrl: '',

    async request(method, endpoint, body = null) {
      const headers = { 'Content-Type': 'application/json' };
      
      if (State.token) {
        headers['x-aula-token'] = State.token;
      }

      const options = { method, headers };
      if (body) options.body = JSON.stringify(body);

      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, options);
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('API Error:', error);
        return { success: false, error: error.message };
      }
    },

    // Autenticação
    async login(schoolId, cpf, password) {
      return this.request('POST', '/api/auth/login', {
        school_id: schoolId,
        username: cpf,
        password: password
      });
    },

    async logout() {
      return this.request('POST', '/api/auth/logout', { token: State.token });
    },

    // Escolas
    async getSchools() {
      return this.request('GET', '/api/schools');
    },

    // Professor
    async getTeacher(personId) {
      return this.request('GET', `/api/teachers/${personId}`);
    },

    async getTeacherLessons(personId) {
      return this.request('GET', `/api/teachers/${personId}/lessons`);
    },

    async getTeacherAvailability(personId) {
      return this.request('GET', `/api/teachers/${personId}/availability`);
    },

    // Turmas
    async getClasses(schoolId) {
      return this.request('GET', `/api/schools/${schoolId}/classes`);
    },

    async getClassLessons(classId) {
      return this.request('GET', `/api/classes/${classId}/lessons`);
    },

    // Recursos
    async getResources(schoolId) {
      return this.request('GET', `/api/schools/${schoolId}/resources`);
    },

    async getResourceSchedule(resourceId) {
      return this.request('GET', `/api/resources/${resourceId}/schedule`);
    },

    // Notificações
    async subscribeNotifications(teacherId, subscription) {
      return this.request('POST', '/api/notifications/subscribe', {
        teacherId,
        subscription
      });
    },

    async unsubscribeNotifications(teacherId, subscription) {
      return this.request('POST', '/api/notifications/unsubscribe', {
        teacherId,
        subscription
      });
    },

    async testNotification(teacherId) {
      return this.request('POST', '/api/notifications/test', { teacherId });
    },

    async createBooking(data) {
      return this.request('POST', '/api/bookings', data);
    },

    async getMyBookings(teacherId) {
      return this.request('GET', `/api/bookings/teacher/${teacherId}`);
    },

    async cancelBooking(bookingId) {
      return this.request('DELETE', `/api/bookings/${bookingId}`);
    }
  };

  // ========================================================================
  // Gerenciamento de Estado
  // ========================================================================
  
  const Storage = {
    save(key, value) {
      try {
        localStorage.setItem(`aula_${key}`, JSON.stringify(value));
      } catch (e) {
        console.error('Storage error:', e);
      }
    },

    load(key) {
      try {
        const value = localStorage.getItem(`aula_${key}`);
        return value ? JSON.parse(value) : null;
      } catch (e) {
        console.error('Storage error:', e);
        return null;
      }
    },

    remove(key) {
      localStorage.removeItem(`aula_${key}`);
    },

    clear() {
      Object.keys(localStorage)
        .filter(k => k.startsWith('aula_'))
        .forEach(k => localStorage.removeItem(k));
    }
  };

  // ========================================================================
  // UI Helpers
  // ========================================================================
  
  function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  function showError(message, elementId = 'login-error') {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('show');
      setTimeout(() => errorEl.classList.remove('show'), 5000);
    }
  }

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
  }

  function showView(viewName) {
    State.currentView = viewName;
    
    // Atualiza navegação
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewName);
    });
    
    // Atualiza views
    document.querySelectorAll('.view').forEach(view => {
      view.classList.remove('active');
    });
    document.getElementById(`view-${viewName}`).classList.add('active');
    
    // Carrega dados da view
    loadViewData(viewName);
  }

  function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
  }

  function hideModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
  }

  // ========================================================================
  // Login
  // ========================================================================
  
  async function initLogin() {
    const serverUrl = Storage.load('serverUrl') || 'http://localhost:3000';
    document.getElementById('server-url').value = serverUrl;
    
    // Carrega escolas
    await loadSchools(serverUrl);
    
    // Auto-login se tiver sessão salva
    const savedSession = Storage.load('session');
    if (savedSession && savedSession.token) {
      State.token = savedSession.token;
      State.teacher = savedSession.teacher;
      State.school = savedSession.school;
      API.baseUrl = serverUrl;
      
      // Verifica se sessão ainda é válida
      const teacher = await API.getTeacher(State.teacher.person_id);
      if (teacher.success) {
        showMainScreen();
        return;
      }
      
      // Sessão expirou
      Storage.clear();
    }
  }

  async function loadSchools(serverUrl) {
    API.baseUrl = serverUrl;
    const schoolSelect = document.getElementById('school-select');
    
    try {
      const result = await API.getSchools();
      
      if (result.success && result.data) {
        schoolSelect.innerHTML = '<option value="">Selecione a escola</option>' +
          result.data.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      } else {
        schoolSelect.innerHTML = '<option value="">Erro ao carregar escolas</option>';
      }
    } catch (e) {
      schoolSelect.innerHTML = '<option value="">Erro de conexão</option>';
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    
    const serverUrl = document.getElementById('server-url').value.trim();
    const schoolId = parseInt(document.getElementById('school-select').value);
    const cpf = document.getElementById('cpf').value.replace(/\D/g, '');
    const password = document.getElementById('password').value;
    
    if (!serverUrl || !schoolId || !cpf || !password) {
      showError('Preencha todos os campos');
      return;
    }
    
    State.serverUrl = serverUrl;
    API.baseUrl = serverUrl;
    Storage.save('serverUrl', serverUrl);
    
    const result = await API.login(schoolId, cpf, password);
    
    if (result.success && result.data) {
      State.token = result.data.token;
      State.teacher = result.data.user;
      State.school = result.data.school;
      
      // Salva sessão
      Storage.save('session', {
        token: State.token,
        teacher: State.teacher,
        school: State.school
      });
      
      showMainScreen();
    } else {
      showError(result.error || 'Erro ao fazer login');
    }
  }

  function handleLogout() {
    API.logout();
    Storage.clear();
    State.token = null;
    State.teacher = null;
    State.school = null;
    showScreen('login-screen');
  }

  // ========================================================================
  // Tela Principal
  // ========================================================================
  
  function showMainScreen() {
    // Atualiza header
    document.getElementById('teacher-name').textContent = State.teacher.name;
    document.getElementById('school-name').textContent = State.school.name;
    
    // Atualiza perfil
    document.getElementById('profile-name').textContent = State.teacher.name;
    document.getElementById('profile-cpf').textContent = formatCPF(State.teacher.username);
    
    showScreen('main-screen');
    showView('schedule');
  }

  async function loadViewData(viewName) {
    switch(viewName) {
      case 'schedule':
        await loadMySchedule();
        break;
      case 'classes':
        await loadClasses();
        break;
      case 'resources':
        await loadResources();
        break;
      case 'profile':
        await loadProfile();
        break;
    }
  }

  // ========================================================================
  // Meu Horário
  // ========================================================================
  
  async function loadMySchedule() {
    const container = document.getElementById('schedule-grid');
    container.innerHTML = '<p class="loading">Carregando horários...</p>';
    
    const result = await API.getTeacherLessons(State.teacher.person_id);
    
    if (!result.success || !result.data) {
      container.innerHTML = '<p class="empty-state">Erro ao carregar horários</p>';
      return;
    }
    
    State.myLessons = result.data;
    renderScheduleGrid(container, State.myLessons);
  }

  function renderScheduleGrid(container, lessons) {
    if (!lessons || lessons.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">📅</div>
          <p>Você não tem horários cadastrados</p>
        </div>
      `;
      return;
    }
    
    // Agrupa por dia e período
    const grid = {};
    const weekdays = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const maxPeriod = Math.max(...lessons.map(l => l.period));
    
    lessons.forEach(lesson => {
      const key = `${lesson.weekday}-${lesson.period}`;
      grid[key] = lesson;
    });
    
    // Monta HTML da tabela
    let html = '<table class="schedule-table"><thead><tr><th>Período</th>';
    
    for (let d = 1; d <= 6; d++) {
      html += `<th>${weekdays[d]}</th>`;
    }
    html += '</tr></thead><tbody>';
    
    for (let p = 1; p <= maxPeriod; p++) {
      html += `<tr><td class="period-col">${p}º</td>`;
      
      for (let d = 1; d <= 6; d++) {
        const lesson = grid[`${d}-${p}`];
        
        if (lesson) {
          html += `
            <td>
              <div class="lesson-cell" onclick="showLessonDetails(${lesson.id})">
                <div class="class-name">${escapeHtml(lesson.class_name || '')}</div>
                <div class="discipline">${escapeHtml(lesson.discipline_name || lesson.curriculum_name || '')}</div>
              </div>
            </td>
          `;
        } else {
          html += '<td><div class="empty-cell">—</div></td>';
        }
      }
      
      html += '</tr>';
    }
    
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  // ========================================================================
  // Horário das Turmas
  // ========================================================================
  
  async function loadClasses() {
    const result = await API.getClasses(State.school.id);
    
    if (result.success && result.data) {
      State.classes = result.data;
      
      const select = document.getElementById('class-filter');
      select.innerHTML = '<option value="">Selecione uma turma</option>' +
        State.classes.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
      
      // Limpa seleção
      document.getElementById('class-schedule-grid').innerHTML = 
        '<p class="empty-state">Selecione uma turma para ver o horário</p>';
    }
  }

  async function loadClassSchedule(classId) {
    const container = document.getElementById('class-schedule-grid');
    container.innerHTML = '<p class="loading">Carregando...</p>';
    
    const result = await API.getClassLessons(classId);
    
    if (result.success && result.data) {
      renderScheduleGrid(container, result.data);
    } else {
      container.innerHTML = '<p class="empty-state">Erro ao carregar horário</p>';
    }
  }

  // ========================================================================
  // Recursos
  // ========================================================================
  
  async function loadResources() {
    const container = document.getElementById('resources-list');
    container.innerHTML = '<p class="loading">Carregando recursos...</p>';
    
    const result = await API.getResources(State.school.id);
    
    if (!result.success || !result.data) {
      container.innerHTML = '<p class="empty-state">Erro ao carregar recursos</p>';
      return;
    }
    
    State.resources = result.data;
    
    if (State.resources.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">🔑</div>
          <p>Nenhum recurso disponível para agendamento</p>
        </div>
      `;
      return;
    }
    
    const html = State.resources.map(r => `
      <div class="resource-card" data-resource-id="${r.id}">
        <div class="resource-info">
          <h3>${escapeHtml(r.name)}</h3>
          <div class="type">${escapeHtml(r.type)}</div>
        </div>
        <button onclick="openBookingModal(${r.id})">Agendar</button>
      </div>
    `).join('');
    
    container.innerHTML = html;
  }

  async function openBookingModal(resourceId) {
    const resource = State.resources.find(r => r.id === resourceId);
    if (!resource) return;
    
    State.selectedResource = resource;
    
    // Preenche recurso
    document.getElementById('booking-resource').value = resource.name;
    
    // Preenche turmas (apenas as que o professor leciona)
    const classSelect = document.getElementById('booking-class');
    const myClassIds = [...new Set(State.myLessons.map(l => l.class_id))];
    const myClasses = State.classes.filter(c => myClassIds.includes(c.id));
    
    classSelect.innerHTML = '<option value="">Selecione a turma</option>' +
      myClasses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    
    // Define data mínima como hoje
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('booking-date').setAttribute('min', today);
    document.getElementById('booking-date').value = today;
    
    showModal('booking-modal');
  }

  async function handleBooking(e) {
    e.preventDefault();
    
    const data = {
      resource_id: State.selectedResource.id,
      teacher_id: State.teacher.person_id,
      class_id: parseInt(document.getElementById('booking-class').value),
      weekday: parseInt(document.getElementById('booking-weekday').value),
      period: parseInt(document.getElementById('booking-period').value),
      date: document.getElementById('booking-date').value,
      description: document.getElementById('booking-description').value
    };
    
    const result = await API.createBooking(data);
    
    if (result.success) {
      showToast('Recurso agendado com sucesso!', 'success');
      hideModal('booking-modal');
      document.getElementById('booking-form').reset();
    } else {
      showToast(result.error || 'Erro ao agendar recurso', 'error');
    }
  }

  // ========================================================================
  // Perfil
  // ========================================================================
  
  async function loadProfile() {
    const result = await API.getTeacherAvailability(State.teacher.person_id);
    
    if (result.success && result.data) {
      renderAvailabilitySummary(result.data);
    }
  }

  function renderAvailabilitySummary(availability) {
    const container = document.getElementById('availability-summary');
    
    if (!availability || availability.length === 0) {
      container.innerHTML = '<p class="muted">Nenhuma restrição de disponibilidade configurada</p>';
      return;
    }
    
    const weekdays = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const grouped = {};
    
    availability.forEach(a => {
      if (!grouped[a.weekday]) grouped[a.weekday] = [];
      grouped[a.weekday].push(a.period);
    });
    
    let html = '<div style="margin-top:12px;font-size:13px">';
    Object.keys(grouped).sort().forEach(weekday => {
      const periods = grouped[weekday].sort((a, b) => a - b);
      html += `<div style="margin-bottom:8px">
        <strong>${weekdays[weekday]}:</strong> ${periods.join(', ')}º período(s)
      </div>`;
    });
    html += '</div>';
    
    container.innerHTML = html;
  }

  // ========================================================================
  // Utilitários
  // ========================================================================
  
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatCPF(cpf) {
    if (!cpf) return '';
    const clean = cpf.replace(/\D/g, '');
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  // ========================================================================
  // Funções Globais (chamadas do HTML)
  // ========================================================================
  
  window.showLessonDetails = function(lessonId) {
    const lesson = State.myLessons.find(l => l.id === lessonId);
    if (lesson) {
      alert(`Aula: ${lesson.discipline_name}\nTurma: ${lesson.class_name}\nSala: ${lesson.room || 'Não definida'}`);
    }
  };

  window.openBookingModal = openBookingModal;

  // ========================================================================
  // Inicialização
  // ========================================================================
  
  document.addEventListener('DOMContentLoaded', function() {
    // Login
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    document.getElementById('server-url').addEventListener('change', function(e) {
      loadSchools(e.target.value);
    });
    
    // Navegação
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => showView(item.dataset.view));
    });
    
    // Logout
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('btn-logout-main').addEventListener('click', handleLogout);
    
    // Filtro de turma
    document.getElementById('class-filter').addEventListener('change', function(e) {
      const classId = parseInt(e.target.value);
      if (classId) {
        State.selectedClassId = classId;
        loadClassSchedule(classId);
      }
    });
    
    // Refresh horário
    document.getElementById('btn-refresh-schedule').addEventListener('click', loadMySchedule);
    
    // Modal de agendamento
    document.getElementById('booking-form').addEventListener('submit', handleBooking);
    
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        hideModal('booking-modal');
      });
    });
    
    // Formatação de CPF
    document.getElementById('cpf').addEventListener('input', function(e) {
      let value = e.target.value.replace(/\D/g, '');
      if (value.length > 11) value = value.slice(0, 11);
      e.target.value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    });
    
    // Configurações
    document.getElementById('setting-dark-mode').addEventListener('change', function(e) {
      // TODO: Implementar modo escuro
      showToast('Modo escuro será implementado em breve', 'info');
    });
    
    document.getElementById('setting-notifications').addEventListener('change', function(e) {
      Storage.save('notifications', e.target.checked);
      showToast(e.target.checked ? 'Notificações ativadas' : 'Notificações desativadas', 'info');
    });
    
    document.getElementById('btn-manage-availability').addEventListener('click', function() {
      showToast('Gerencie sua disponibilidade na versão desktop', 'info');
    });
    
    document.getElementById('btn-my-bookings').addEventListener('click', async function() {
      showToast('Visualizando seus agendamentos...', 'info');
      // TODO: Implementar lista de agendamentos
    });
    
    // ─── Registrar Push Notifications ───────────────────────────────────────
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(() => {
        // Solicita permissão
        if (Notification.permission === 'granted') {
          registerPushNotifications();
        } else if (Notification.permission !== 'denied') {
          Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
              registerPushNotifications();
            }
          });
        }
      });
    }
    
    // Inicializa login
    initLogin();
  });

  // ─── Registra device para receber push notifications ─────────────────────
  async function registerPushNotifications() {
    if (!State.token || !State.teacher) return;
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        // Cria nova subscription (em produção, usar VAPID keys)
        // const newSubscription = await registration.pushManager.subscribe({
        //   userVisibleOnly: true,
        //   applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        // });
        // await API.subscribeNotifications(State.teacher.person_id, newSubscription);
        
        console.log('Push notifications disponível (configuração completa em produção)');
      }
    } catch (e) {
      console.error('Erro ao registrar notificações:', e);
    }
  }

})();
