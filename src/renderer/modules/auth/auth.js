/**
 * Módulo de Autenticação
 * Gerencia login, registro de primeiro admin e exibição condicional de módulos
 */

class AuthManager {
  constructor() {
    this.currentSchool = null;
    this.currentAdmin = null;
    this.token = null;
  }

  /**
   * Inicializa o gerenciador verificando se há sessão ativa
   */
  async initialize(schoolId) {
    this.currentSchool = schoolId;
    
    // Tenta recuperar token do localStorage
    const savedToken = localStorage.getItem(`school_${schoolId}_token`);
    if (savedToken) {
      const result = await window.aula.auth.verifySession({
        schoolId,
        token: savedToken
      });

      if (result.success && result.valid) {
        this.token = savedToken;
        this.currentAdmin = result.admin;
        return { authenticated: true, admin: result.admin };
      } else {
        // Token inválido, remove do localStorage
        localStorage.removeItem(`school_${schoolId}_token`);
      }
    }

    return { authenticated: false };
  }

  /**
   * Verifica se há admin cadastrado nesta escola
   */
  async checkFirstAdmin() {
    const result = await window.aula.auth.checkFirstAdmin(this.currentSchool);
    if (result.success) {
      return result.hasAdmin;
    }
    throw new Error(result.error);
  }

  /**
   * Registra o primeiro admin
   */
  async registerFirstAdmin(name, username, password) {
    const result = await window.aula.auth.registerFirstAdmin({
      schoolId: this.currentSchool,
      name,
      username,
      password
    });

    if (!result.success) throw new Error(result.error);
    
    // Realiza login automático após registro
    return this.login(username, password);
  }

  /**
   * Realiza login
   */
  async login(username, password) {
    const result = await window.aula.auth.login({
      schoolId: this.currentSchool,
      username,
      password
    });

    if (!result.success) throw new Error(result.error);

    this.token = result.data.token;
    this.currentAdmin = result.data.admin;
    
    // Salva token no localStorage
    localStorage.setItem(`school_${this.currentSchool}_token`, this.token);
    
    return { admin: result.data.admin, token: this.token };
  }

  /**
   * Realiza logout
   */
  async logout() {
    if (this.token) {
      await window.aula.auth.logout({ token: this.token });
      localStorage.removeItem(`school_${this.currentSchool}_token`);
    }
    
    this.token = null;
    this.currentAdmin = null;
  }

  /**
   * Inativa um admin
   */
  async deactivateAdmin(adminId) {
    const result = await window.aula.auth.deactivateAdmin({ adminId });
    if (!result.success) throw new Error(result.error);
    return result;
  }

  /**
   * Reativa um admin
   */
  async activateAdmin(adminId) {
    const result = await window.aula.auth.activateAdmin({ adminId });
    if (!result.success) throw new Error(result.error);
    return result;
  }

  /**
   * Inativa um professor
   */
  async deactivateTeacher(teacherId) {
    const result = await window.aula.auth.deactivateTeacher({ teacherId });
    if (!result.success) throw new Error(result.error);
    return result;
  }

  /**
   * Reativa um professor
   */
  async activateTeacher(teacherId) {
    const result = await window.aula.auth.activateTeacher({ teacherId });
    if (!result.success) throw new Error(result.error);
    return result;
  }

  /**
   * Promove um professor a admin
   */
  async promoteTeacherToAdmin(teacherId, password) {
    const result = await window.aula.auth.promoteTeacherToAdmin({
      teacherId,
      password
    });
    if (!result.success) throw new Error(result.error);
    return result.data;
  }

  /**
   * Verifica se o usuário autenticado é admin
   */
  isAdmin() {
    return this.currentAdmin?.role === 'admin';
  }

  /**
   * Verifica se há um admin autenticado
   */
  isAuthenticated() {
    return this.token && this.currentAdmin;
  }

  /**
   * Inicia verificação periódica da sessão (a cada 30 min).
   * Se o token expirar, força logout e recarrega.
   */
  startSessionWatcher() {
    const INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
    this._sessionWatcher = setInterval(async () => {
      if (!this.token) return;
      try {
        const result = await window.aula.auth.verifySession({
          schoolId: this.currentSchool,
          token: this.token
        });
        if (!result.success || !result.valid) {
          clearInterval(this._sessionWatcher);
          window.showToast('Sessão expirada. Faça login novamente.', 'warning', 5000);
          setTimeout(() => {
            localStorage.removeItem(`school_${this.currentSchool}_token`);
            location.reload();
          }, 2000);
        }
      } catch (_) { /* ignora erros pontuais de rede */ }
    }, INTERVAL_MS);
  }

  /**
   * Obtém informações do admin atual
   */
  getCurrentAdmin() {
    return this.currentAdmin;
  }

  /**
   * Obtém o token da sessão
   */
  getToken() {
    return this.token;
  }
}

// Instância global
window.AuthManager = AuthManager;
