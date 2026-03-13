/**
 * web-bridge.js
 *
 * Cria window.aula com o contrato de dados do sistema,
 * usando fetch() para chamar a API REST do motor (Fly.io).
 *
 * Carregue este script ANTES de qualquer outro no renderer:
 *   <script src="data/web-bridge.js"></script>
 */

(function () {
  // Já existe → não sobrescreve
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

    const opts = { method, headers, credentials: 'include' };
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
      me: () => get('/auth/me'),

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
    updateClassCurricula: (id, data) => put(`/class-curricula/${id}`, data),
    deleteClassCurricula: (id) => del(`/class-curricula/${id}`),

    // ── Professor por Componente e Turma ──────────────────────────────────────
    getClassTeacherCurricula: (classId) => get(`/class-teacher-curricula?classId=${classId}`),
    createClassTeacherCurricula: (data) => post('/class-teacher-curricula', data),
    deleteClassTeacherCurricula: (id) => del(`/class-teacher-curricula/${id}`),

    // ── Dias de Trabalho do Professor ─────────────────────────────────────────
    getTeacherDays: (teacherId) => get(`/teacher-days/${teacherId}`),
    createTeacherDay: (data) => post('/teacher-days', data),
    deleteTeacherDay: (id) => del(`/teacher-days/${id}`),

    // ── Tipos de Aula ─────────────────────────────────────────────────────────
    getLessonTypes: (schoolId) => get(`/lesson-types${schoolId ? `?schoolId=${schoolId}` : ''}`),
    createLessonType: (data) => post('/lesson-types', data),
    updateLessonType: (id, data) => put(`/lesson-types/${id}`, data),
    toggleLessonType: (id, active) => put(`/lesson-types/${id}`, { active }),
    deleteLessonType: (id) => del(`/lesson-types/${id}`),

    // ── Papéis de Tutor ───────────────────────────────────────────────────────
    getTutorRoles: (schoolId) => get(`/tutor-roles${schoolId ? `?schoolId=${schoolId}` : ''}`),
    createTutorRole: (data) => post('/tutor-roles', data),
    updateTutorRole: (id, data) => put(`/tutor-roles/${id}`, data),
    toggleTutorRole: (id, active) => put(`/tutor-roles/${id}`, { active }),
    deleteTutorRole: (id) => del(`/tutor-roles/${id}`),

    // ── Tutores de Turma ──────────────────────────────────────────────────────
    getClassTutors: (classId) => get(`/class-tutors?classId=${classId}`),
    createClassTutor: (data) => post('/class-tutors', data),
    updateClassTutor: (id, data) => put(`/class-tutors/${id}`, data),
    deleteClassTutor: (id) => del(`/class-tutors/${id}`),

    // ── Licenças ──────────────────────────────────────────────────────────────
    getModulesStatus: () => get('/licenses/status'),
    activateLicense: (moduleId, key) => post('/licenses/activate', { moduleId, licenseKey: key }),
    deactivateLicense: (moduleId) => post('/licenses/deactivate', { moduleId }),

    // ── Utilitários ───────────────────────────────────────────────────────────
    getAppDataPath: () => get('/app/dataPath').then(r => r.data ?? ''),
    // ── Addon Ponto ──────────────────────────────────────────────────────────
    getPontoStatus:     (schoolId) => get(`/ponto/status?schoolId=${schoolId}`),
    subscribePonto:     (data)     => post('/ponto/subscribe', data),
    cancelPonto:        (data)     => put('/ponto/subscribe/cancel', data),
    // Funcionários
    getPontoEmployees:  (schoolId, includeDeleted = false) =>
      get(`/ponto/employees?schoolId=${schoolId}&includeDeleted=${includeDeleted}`),
    createPontoEmployee:(data)     => post('/ponto/employees', data),
    updatePontoEmployee:(id, data) => put(`/ponto/employees/${id}`, data),
    // Soft-delete: registros históricos são preservados (CLT / Portaria 671)
    deletePontoEmployee:(id)       => del(`/ponto/employees/${id}`),
    // Registros
    getPontoRecords:    (params)   => get(`/ponto/records?${new URLSearchParams(params).toString()}`),
    getPontoToday:      (schoolId) => get(`/ponto/today?schoolId=${schoolId}`),
    createPontoRecord:  (data)     => post('/ponto/records', data),
    // Cancelamento auditado — NUNCA deletar registros de ponto (CLT Art. 74)
    cancelPontoRecord:  (id, data) => put(`/ponto/records/${id}/cancel`, data),
    // Exportação AFD para fiscalização MTP (Portaria 671)
    exportPontoAfd:     (params)   => get(`/ponto/records/export-afd?${new URLSearchParams(params).toString()}`),
    // Vistos diários de supervisão (um visto por funcionário por data)
    getPontoVerifications:   (params)    => get(`/ponto/verifications?${new URLSearchParams(params).toString()}`),
    createPontoVerification: (data)      => post('/ponto/verifications', data),
    updatePontoVerification: (id, data)  => put(`/ponto/verifications/${id}`, data),
    // Assinaturas mensais da folha (aceite eletrônico ou envio de scan físico)
    getPontoSignatures:      (params)    => get(`/ponto/signatures?${new URLSearchParams(params).toString()}`),
    createPontoSignature:    (data)      => post('/ponto/signatures', data),
    // Aceite eletrônico: grava o próprio funcionário como validador + horário
    electronicSignPonto:     (id)        => put(`/ponto/signatures/${id}/electronic-sign`, {}),
    uploadPontoSignature:    (id, data)  => post(`/ponto/signatures/${id}/upload`, data),
    // Configurações de assinatura por escola (eletrônico, físico, ou ambos)
    getPontoSettings:        (schoolId)  => get(`/ponto/settings?schoolId=${schoolId}`),
    updatePontoSettings:     (data)      => put('/ponto/settings', data),

    // ── Dashboard ─────────────────────────────────────────────────────────────
    getDashboard: (schoolId) => get(`/dashboard?schoolId=${schoolId}`),

    // ── Auditoria LGPD ────────────────────────────────────────────────────────
    getAuditLog: (schoolId, limit = 50) => get(`/audit?schoolId=${schoolId}&limit=${limit}`),

    // ── Substituições ─────────────────────────────────────────────────────────
    getSubstitutions: (schoolId, date = '') =>
      get(`/substitutions?schoolId=${schoolId}${date ? `&date=${date}` : ''}`),
    createSubstitution: (data) => post('/substitutions', data),
    updateSubstitution: (id, data) => put(`/substitutions/${id}`, data),
    deleteSubstitution: (id) => del(`/substitutions/${id}`),

    // ── Calendário Acadêmico ──────────────────────────────────────────────────
    getCalendar: (schoolId, year) => get(`/calendar?schoolId=${schoolId}&year=${year}`),
    createCalendarEvent: (data) => post('/calendar', data),
    updateCalendarEvent: (id, data) => put(`/calendar/${id}`, data),
    deleteCalendarEvent: (id) => del(`/calendar/${id}`),

    // ── Roles de Admins ───────────────────────────────────────────────────────
    updateAdminRole: (id, role) => put(`/admins/${id}/role`, { role }),
    getRolePermissions: () => get('/roles/permissions'),

    // ── Portal do Professor ───────────────────────────────────────────────────
    teacherPortalLogin: (data) => post('/teacher-portal/login', data),
    setTeacherPortalPassword: (data) => post('/teacher-portal/set-password', data),
    getTeacherPortalMe: () => get('/teacher-portal/me'),
    getTeacherPortalSchedule: () => get('/teacher-portal/schedule'),
    getTeacherPortalSubstitutions: () => get('/teacher-portal/substitutions'),
    logoutTeacherPortal: () => post('/teacher-portal/logout', {}),

    // ── Relatórios ────────────────────────────────────────────────────────────
    getReportSchedule: (scheduleId) => get(`/reports/schedule/${scheduleId}`),
    getReportPontoMonthly: (schoolId, year, month) =>
      get(`/reports/ponto-monthly?schoolId=${schoolId}&year=${year}&month=${month}`),
    getReportTeacherLoad: (scheduleId) => get(`/reports/teacher-load/${scheduleId}`),

    // ── Notificações Push ─────────────────────────────────────────────────────
    sendNotificationToTeacher: (teacherId, data) => post(`/notifications/teacher/${teacherId}`, data),
    broadcastNotification: (data) => post('/notifications/broadcast', data),

    // ── Addon ESCOLAR ────────────────────────────────────────────────────
    getEscolarStatus:      (schoolId) => get(`/escolar/status?schoolId=${schoolId}`),
    subscribeEscolar:      (data)     => post('/escolar/subscribe', data),
    cancelEscolar:         (data)     => post('/escolar/cancel', data),
    // Alunos
    getEscolarStudents:    (schoolId, classId) => get(`/escolar/students?schoolId=${schoolId}${classId ? `&classId=${classId}` : ''}`),
    createEscolarStudent:  (data)     => post('/escolar/students', data),
    updateEscolarStudent:  (id, data) => put(`/escolar/students/${id}`, data),
    deleteEscolarStudent:  (id)       => del(`/escolar/students/${id}`),
    // Matrículas
    enrollStudent:         (data)     => post('/escolar/enrollments', data),
    unenrollStudent:       (id)       => del(`/escolar/enrollments/${id}`),
    // Chamada / Diário
    getAttendance:         (schoolId, classId, date) => get(`/escolar/attendance?schoolId=${schoolId}${classId ? `&classId=${classId}` : ''}${date ? `&date=${date}` : ''}`),
    getStudentAttendance:  (studentId, schoolId)     => get(`/escolar/attendance/student/${studentId}?schoolId=${schoolId}`),
    saveAttendance:        (data)     => post('/escolar/attendance', data),
    deleteAttendance:      (id)       => del(`/escolar/attendance/${id}`),
    // Ocorrências
    getOccurrences:        (schoolId, params = {}) => {
      const qs = new URLSearchParams({ schoolId, ...params }).toString();
      return get(`/escolar/occurrences?${qs}`);
    },
    createOccurrence:      (data)     => post('/escolar/occurrences', data),
    updateOccurrence:      (id, data) => put(`/escolar/occurrences/${id}`, data),
    deleteOccurrence:      (id)       => del(`/escolar/occurrences/${id}`),

    // ── Addon FINANCEIRO ────────────────────────────────────────────────────
    getFinanceiroStatus:          (schoolId) => get(`/financeiro/status?schoolId=${schoolId}`),
    subscribeFinanceiro:          (data)     => post('/financeiro/subscribe', data),
    cancelFinanceiro:             (data)     => post('/financeiro/cancel', data),
    // Gateways
    getFinanceiroGateways:        (schoolId) => get(`/financeiro/gateways?schoolId=${schoolId}`),
    createFinanceiroGateway:      (data)     => post('/financeiro/gateways', data),
    updateFinanceiroGateway:      (id, data) => put(`/financeiro/gateways/${id}`, data),
    deleteFinanceiroGateway:      (id, schoolId) => del(`/financeiro/gateways/${id}?schoolId=${schoolId}`),
    // Planos
    getFinanceiroPlans:           (schoolId) => get(`/financeiro/plans?schoolId=${schoolId}`),
    createFinanceiroPlan:         (data)     => post('/financeiro/plans', data),
    updateFinanceiroPlan:         (id, data) => put(`/financeiro/plans/${id}`, data),
    deleteFinanceiroPlan:         (id, schoolId) => del(`/financeiro/plans/${id}?schoolId=${schoolId}`),
    // Contratos
    getFinanceiroContracts:       (params)   => get(`/financeiro/contracts?${new URLSearchParams(params)}`),
    createFinanceiroContract:     (data)     => post('/financeiro/contracts', data),
    updateFinanceiroContract:     (id, data) => put(`/financeiro/contracts/${id}`, data),
    // Faturas
    getFinanceiroInvoices:        (params)   => get(`/financeiro/invoices?${new URLSearchParams(params)}`),
    getFinanceiroInvoicesSummary: (schoolId, month) => get(`/financeiro/invoices/summary?schoolId=${schoolId}${month ? `&month=${month}` : ''}`),
    generateFinanceiroInvoices:   (data)     => post('/financeiro/invoices/generate', data),
    chargeFinanceiroInvoice:      (id, data) => post(`/financeiro/invoices/${id}/charge`, data),
    updateFinanceiroInvoice:      (id, data) => put(`/financeiro/invoices/${id}`, data),
    // Negociações
    getFinanceiroNegotiations:    (schoolId) => get(`/financeiro/negotiations?schoolId=${schoolId}`),
    createFinanceiroNegotiation:  (data)     => post('/financeiro/negotiations', data),
  };

  console.log('[web-bridge] window.aula configurado via HTTP →', API_BASE);
})();
