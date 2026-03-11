/**
 * web-bridge.js
 *
 * Quando o sistema roda no navegador (via servidor web Express),
 * este script cria window.aula com o mesmo contrato da
 * preload.js do Electron, mas usando fetch() para chamar a API REST.
 *
 * Carregue este script ANTES de qualquer outro no renderer:
 *   <script src="data/web-bridge.js"></script>
 *
 * Em ambiente Electron, o preload.js já injeta window.aula;
 * este script não faz nada nesse caso.
 *
 * Nota: window.aula é mantido por compatibilidade com código legado.
 */

(function () {
  // Já existe (Electron injetou via preload.js) → não faz nada
  if (window.aula) return;

  // ─── Base URL da API ────────────────────────────────────────────────────────
  // Usa a mesma origem do HTML servido pelo Express
  const API_BASE = `${window.location.origin}/api`;

  // ─── Utilitário de requisição ───────────────────────────────────────────────
  async function api(method, endpoint, body = null) {
    const headers = { 'Content-Type': 'application/json' };

    // Encaminha o token de sessão se existir
    const token = sessionStorage.getItem('aula_active_token');
    if (token) headers['x-aula-token'] = token;

    const opts = { method, headers };
    if (body !== null) opts.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    return res.json();
  }

  const get  = (ep)       => api('GET', ep);
  const post = (ep, body) => api('POST', ep, body);
  const put  = (ep, body) => api('PUT', ep, body);
  const del  = (ep)       => api('DELETE', ep);

  // ─── Implementação de window.aula ───────────────────────────────────────
  window.aula = {

    // ── Autenticação ─────────────────────────────────────────────────────────
    auth: {
      checkFirstAdmin: (schoolId) =>
        get(`/auth/checkFirstAdmin/${schoolId}`),

      registerFirstAdmin: (data) =>
        post('/auth/registerFirstAdmin', data).then(r => {
          if (r.success && r.data?.token) {
            sessionStorage.setItem('aula_active_token', r.data.token);
          }
          return r;
        }),

      login: (data) =>
        post('/auth/login', data).then(r => {
          if (r.success && r.data?.token) {
            sessionStorage.setItem('aula_active_token', r.data.token);
          }
          return r;
        }),

      verifySession: (data) =>
        post('/auth/verifySession', data),

      logout: (data) =>
        post('/auth/logout', data).then(r => {
          sessionStorage.removeItem('aula_active_token');
          return r;
        }),

      deactivateAdmin: (data) =>
        post('/auth/deactivateAdmin', data),

      activateAdmin: (data) =>
        post('/auth/activateAdmin', data),

      deactivateTeacher: (data) =>
        post('/auth/deactivateTeacher', data),

      activateTeacher: (data) =>
        post('/auth/activateTeacher', data),

      promoteTeacherToAdmin: (data) =>
        post('/auth/promoteTeacherToAdmin', data),
    },

    // ── Superadmins ───────────────────────────────────────────────────────────
    getSuperadmins: () => get('/superadmins'),
    createSuperadmin: (data) => post('/superadmins', data),
    loginSuperadmin: (creds) => post('/superadmins/login', creds),
    deleteSuperadmin: (id) => del(`/superadmins/${id}`),

    // ── Escolas ───────────────────────────────────────────────────────────────
    getSchools: () => get('/schools'),
    createSchool: (data) => post('/schools', data),
    updateSchool: (id, data) => put(`/schools/${id}`, data),
    deleteSchool: (id) => del(`/schools/${id}`),

    // ── Admins ────────────────────────────────────────────────────────────────
    getAdmins: (schoolId) => get(`/admins${schoolId ? `?schoolId=${schoolId}` : ''}`),
    createAdmin: (data) => post('/admins', data),
    deleteAdmin: (id) => del(`/admins/${id}`),
    loginAdmin: (creds) => post('/admins/login', creds),

    // ── Professores ───────────────────────────────────────────────────────────
    getTeachers: (schoolId) => get(`/teachers${schoolId ? `?schoolId=${schoolId}` : ''}`),
    createTeacher: (data) => post('/teachers', data),
    updateTeacher: (id, data) => put(`/teachers/${id}`, data),
    deleteTeacher: (id) => del(`/teachers/${id}`),
    getTeacherAvailability: (teacherId) => get(`/teachers/${teacherId}/availability`),
    setTeacherAvailability: (teacherId, slots) => put(`/teachers/${teacherId}/availability`, { slots }),

    // ── Cronogramas ───────────────────────────────────────────────────────────
    getSchedules: (schoolId) => get(`/schedules${schoolId ? `?schoolId=${schoolId}` : ''}`),
    createSchedule: (data) => post('/schedules', data),
    updateSchedule: (id, data) => put(`/schedules/${id}`, data),
    deleteSchedule: (id) => del(`/schedules/${id}`),

    // ── Aulas ─────────────────────────────────────────────────────────────────
    getLessons: (scheduleId) => get(`/lessons?scheduleId=${scheduleId}`),
    createLesson: (data) => post('/lessons', data),
    updateLesson: (id, data) => put(`/lessons/${id}`, data),
    deleteLesson: (id) => del(`/lessons/${id}`),

    // ── Planos de Aula ────────────────────────────────────────────────────────
    getLessonPlans: (schoolId) => get(`/lesson-plans${schoolId ? `?schoolId=${schoolId}` : ''}`),
    createLessonPlan: (data) => post('/lesson-plans', data),
    updateLessonPlan: (id, data) => put(`/lesson-plans/${id}`, data),
    deleteLessonPlan: (id) => del(`/lesson-plans/${id}`),

    // ── Recursos ──────────────────────────────────────────────────────────────
    getResources: (schoolId) => get(`/resources${schoolId ? `?schoolId=${schoolId}` : ''}`),
    createResource: (data) => post('/resources', data),
    updateResource: (id, data) => put(`/resources/${id}`, data),
    deleteResource: (id) => del(`/resources/${id}`),

    // ── Turnos ────────────────────────────────────────────────────────────────
    getShifts: (schoolId) => get(`/shifts${schoolId ? `?schoolId=${schoolId}` : ''}`),
    createShift: (data) => post('/shifts', data),
    updateShift: (id, data) => put(`/shifts/${id}`, data),
    deleteShift: (id) => del(`/shifts/${id}`),

    // ── Turmas ────────────────────────────────────────────────────────────────
    getClasses: (schoolId) => get(`/classes${schoolId ? `?schoolId=${schoolId}` : ''}`),
    createClass: (data) => post('/classes', data),
    updateClass: (id, data) => put(`/classes/${id}`, data),
    deleteClass: (id) => del(`/classes/${id}`),

    // ── Componentes Curriculares ──────────────────────────────────────────────
    getCurricula: (schoolId) => get(`/curricula${schoolId ? `?schoolId=${schoolId}` : ''}`),
    createCurricula: (data) => post('/curricula', data),
    updateCurricula: (id, data) => put(`/curricula/${id}`, data),
    deleteCurricula: (id) => del(`/curricula/${id}`),

    // ── Horários (Time Slots) ─────────────────────────────────────────────────
    getTimeSlots: (shiftId) => get(`/time-slots${shiftId ? `?shiftId=${shiftId}` : ''}`),
    createTimeSlot: (data) => post('/time-slots', data),
    updateTimeSlot: (id, data) => put(`/time-slots/${id}`, data),
    deleteTimeSlot: (id) => del(`/time-slots/${id}`),

    // ── Grade: Componentes por Turma ──────────────────────────────────────────
    getClassCurricula: (classId) => get(`/class-curricula?classId=${classId}`),
    createClassCurricula: (data) => post('/class-curricula', data),
    deleteClassCurricula: (id) => del(`/class-curricula/${id}`),

    // ── Professor por Componente e Turma ──────────────────────────────────────
    getClassTeacherCurricula: (classId) => get(`/class-teacher-curricula?classId=${classId}`),
    createClassTeacherCurricula: (data) => post('/class-teacher-curricula', data),
    deleteClassTeacherCurricula: (id) => del(`/class-teacher-curricula/${id}`),

    // ── Dias de Trabalho do Professor ─────────────────────────────────────────
    getTeacherDays: (teacherId) => get(`/teacher-days/${teacherId}`),
    createTeacherDay: (data) => post('/teacher-days', data),
    deleteTeacherDay: (id) => del(`/teacher-days/${id}`),

    // ── Licenças ──────────────────────────────────────────────────────────────
    getModulesStatus: () => get('/licenses/status'),
    activateLicense: (moduleId, key) => post('/licenses/activate', { moduleId, licenseKey: key }),
    deactivateLicense: (moduleId) => post('/licenses/deactivate', { moduleId }),

    // ── Utilitários ───────────────────────────────────────────────────────────
    getAppDataPath: () => get('/app/dataPath').then(r => r.data ?? ''),
  };

  console.log('[web-bridge] window.aula configurado via HTTP →', API_BASE);
})();
