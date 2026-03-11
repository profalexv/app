/**
 * data-provider.js
 *
 * Abstração da camada de dados. O código dos módulos nunca acessa
 * Supabase diretamente — sempre usa esta interface.
 *
 * O provider concreto (SupabaseProvider / ApiProvider) deve ser implementado
 * em src/renderer/data/supabase-provider.js e registrado em init().
 */

class DataProvider {
  constructor() {
    this._provider = null;
    this._mode = null; // 'local' | 'supabase'
  }

  /**
   * Inicializa o provider para o ambiente web (Supabase).
   * Chamado uma vez no boot do app.
   * @param {object} config - { supabaseUrl, supabaseKey }
   */
  init(config = {}) {
    // TODO: instanciar SupabaseProvider quando implementado
    // this._provider = new SupabaseProvider(config);
    // this._mode = 'supabase';
    throw new Error('[DataProvider] SupabaseProvider ainda não implementado. Veja src/renderer/data/supabase-provider.js.');
  }

  get mode() { return this._mode; }
  get isCloud() { return this._mode === 'supabase'; }

  // ─── Delegação para o provider ativo ─────────────────────────────────────

  // Superadmins
  getSuperadmins()              { return this._provider.getSuperadmins(); }
  createSuperadmin(data)        { return this._provider.createSuperadmin(data); }
  loginSuperadmin(creds)        { return this._provider.loginSuperadmin(creds); }
  deleteSuperadmin(id)          { return this._provider.deleteSuperadmin(id); }

  // Escolas
  getSchools()                  { return this._provider.getSchools(); }
  createSchool(data)            { return this._provider.createSchool(data); }
  updateSchool(id, data)        { return this._provider.updateSchool(id, data); }
  deleteSchool(id)              { return this._provider.deleteSchool(id); }

  // Admins
  getAdmins(schoolId)           { return this._provider.getAdmins(schoolId); }
  createAdmin(data)             { return this._provider.createAdmin(data); }
  deleteAdmin(id)               { return this._provider.deleteAdmin(id); }
  loginAdmin(creds)             { return this._provider.loginAdmin(creds); }

  // Professores
  getTeachers(schoolId)         { return this._provider.getTeachers(schoolId); }
  createTeacher(data)           { return this._provider.createTeacher(data); }
  updateTeacher(id, data)       { return this._provider.updateTeacher(id, data); }
  deleteTeacher(id)             { return this._provider.deleteTeacher(id); }

  // Funções de Colaborador
  getStaffFunctions(schoolId)              { return this._provider.getStaffFunctions(schoolId); }
  createStaffFunction(data)                { return this._provider.createStaffFunction(data); }
  updateStaffFunction(id, data)            { return this._provider.updateStaffFunction(id, data); }
  toggleStaffFunction(id, active)          { return this._provider.toggleStaffFunction(id, active); }
  deleteStaffFunction(id)                  { return this._provider.deleteStaffFunction(id); }

  // Pessoas (modelo unificado)
  getPeople(schoolId)                    { return this._provider.getPeople(schoolId); }
  createPerson(data)                     { return this._provider.createPerson(data); }
  updatePerson(id, data)                 { return this._provider.updatePerson(id, data); }
  getPersonRoles(personId)               { return this._provider.getPersonRoles(personId); }
  setTeacherRole(personId, active, wm)       { return this._provider.setTeacherRole(personId, active, wm); }
  addStaffRole(pid, sfId)    { return this._provider.addStaffRole(pid, sfId); }
  toggleStaffRole(roleStaffId, active)   { return this._provider.toggleStaffRole(roleStaffId, active); }
  removeStaffRole(roleStaffId)           { return this._provider.removeStaffRole(roleStaffId); }

  // Cronograma
  getSchedules(schoolId)        { return this._provider.getSchedules(schoolId); }
  createSchedule(data)          { return this._provider.createSchedule(data); }
  updateSchedule(id, data)      { return this._provider.updateSchedule(id, data); }
  deleteSchedule(id)            { return this._provider.deleteSchedule(id); }

  // Aulas
  getLessons(scheduleId)                    { return this._provider.getLessons(scheduleId); }
  createLesson(data)                        { return this._provider.createLesson(data); }
  updateLesson(id, data)                    { return this._provider.updateLesson(id, data); }
  deleteLesson(id)                          { return this._provider.deleteLesson(id); }
  suggestClassSchedule(classId)             { return this._provider.suggestClassSchedule(classId); }
  suggestSchoolSchedule(schoolId)           { return this._provider.suggestSchoolSchedule(schoolId); }
  getSchoolScheduleSummary(schoolId)        { return this._provider.getSchoolScheduleSummary(schoolId); }
  getSchoolSnapshots(schoolId)              { return this._provider.getSchoolSnapshots(schoolId); }
  getScheduleSnapshots(classId)             { return this._provider.getScheduleSnapshots(classId); }
  getScheduleSnapshot(id)                   { return this._provider.getScheduleSnapshot(id); }
  saveScheduleSnapshot(data)                { return this._provider.saveScheduleSnapshot(data); }
  confirmSnapshot(id, justification)        { return this._provider.confirmSnapshot(id, justification); }
  deleteScheduleSnapshot(id)                { return this._provider.deleteScheduleSnapshot(id); }

  // Planos de aula
  getLessonPlans(schoolId)      { return this._provider.getLessonPlans(schoolId); }
  createLessonPlan(data)        { return this._provider.createLessonPlan(data); }
  updateLessonPlan(id, data)    { return this._provider.updateLessonPlan(id, data); }
  deleteLessonPlan(id)          { return this._provider.deleteLessonPlan(id); }

  // Recursos
  getResources(schoolId)        { return this._provider.getResources(schoolId); }
  createResource(data)          { return this._provider.createResource(data); }
  updateResource(id, data)      { return this._provider.updateResource(id, data); }
  deleteResource(id)            { return this._provider.deleteResource(id); }

  // Turnos
  getShifts(schoolId)           { return this._provider.getShifts(schoolId); }
  createShift(data)             { return this._provider.createShift(data); }
  updateShift(id, data)         { return this._provider.updateShift(id, data); }
  deleteShift(id)               { return this._provider.deleteShift(id); }

  // Turmas
  getClasses(schoolId)          { return this._provider.getClasses(schoolId); }
  createClass(data)             { return this._provider.createClass(data); }
  updateClass(id, data)         { return this._provider.updateClass(id, data); }
  deleteClass(id)               { return this._provider.deleteClass(id); }

  // Componentes Curriculares
  getCurricula(schoolId)        { return this._provider.getCurricula(schoolId); }
  createCurricula(data)         { return this._provider.createCurricula(data); }
  updateCurricula(id, data)     { return this._provider.updateCurricula(id, data); }
  deleteCurricula(id)           { return this._provider.deleteCurricula(id); }

  // Horários
  getTimeSlots(shiftId)         { return this._provider.getTimeSlots(shiftId); }
  createTimeSlot(data)          { return this._provider.createTimeSlot(data); }
  updateTimeSlot(id, data)      { return this._provider.updateTimeSlot(id, data); }
  deleteTimeSlot(id)            { return this._provider.deleteTimeSlot(id); }

  // Tipos de Aula
  getLessonTypes(schoolId)      { return this._provider.getLessonTypes(schoolId); }
  createLessonType(data)        { return this._provider.createLessonType(data); }
  updateLessonType(id, d)       { return this._provider.updateLessonType(id, d); }
  toggleLessonType(id, active)  { return this._provider.toggleLessonType(id, active); }
  deleteLessonType(id)          { return this._provider.deleteLessonType(id); }

  // Grade
  getClassCurricula(classId)    { return this._provider.getClassCurricula(classId); }
  createClassCurricula(data)    { return this._provider.createClassCurricula(data); }
  updateClassCurricula(id, d)   { return this._provider.updateClassCurricula(id, d); }
  deleteClassCurricula(id)      { return this._provider.deleteClassCurricula(id); }

  // Professor por Componente e Turma
  getClassTeacherCurricula(classId) { return this._provider.getClassTeacherCurricula(classId); }
  createClassTeacherCurricula(data) { return this._provider.createClassTeacherCurricula(data); }
  deleteClassTeacherCurricula(id)   { return this._provider.deleteClassTeacherCurricula(id); }

  // Tutores de Turma
  getClassTutors(classId)           { return this._provider.getClassTutors(classId); }
  createClassTutor(data)            { return this._provider.createClassTutor(data); }
  updateClassTutor(id, data)        { return this._provider.updateClassTutor(id, data); }
  deleteClassTutor(id)              { return this._provider.deleteClassTutor(id); }

  // Papéis de Tutor
  getTutorRoles(schoolId)           { return this._provider.getTutorRoles(schoolId); }
  createTutorRole(data)             { return this._provider.createTutorRole(data); }
  updateTutorRole(id, data)         { return this._provider.updateTutorRole(id, data); }
  toggleTutorRole(id, active)       { return this._provider.toggleTutorRole(id, active); }
  deleteTutorRole(id)               { return this._provider.deleteTutorRole(id); }

  // Dias de Trabalho
  getTeacherDays(personId)     { return this._provider.getTeacherDays(personId); }
  createTeacherDay(data)       { return this._provider.createTeacherDay(data); }
  deleteTeacherDay(id)         { return this._provider.deleteTeacherDay(id); }

  // Disponibilidade do Professor
  getTeacherAvailability(personId)        { return this._provider.getTeacherAvailability(personId); }
  setTeacherAvailability(personId, slots) { return this._provider.setTeacherAvailability(personId, slots); }
}

/**
 * ─── SupabaseProvider (a implementar) ──────────────────────────────────────
 *
 * Criar src/renderer/data/supabase-provider.js implementando todos os métodos
 * do DataProvider usando o cliente @supabase/supabase-js. Exemplo:
 *
 *   async getSchools() {
 *     const { data, error } = await supabase.from('schools').select('*');
 *     if (error) throw error;
 *     return data;
 *   }
 *
 * Registrar no DataProvider.init():
 *   this._provider = new SupabaseProvider(config);
 *   this._mode = 'supabase';
 */

// Exporta instância singleton
window.DB = new DataProvider();
