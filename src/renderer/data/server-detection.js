/**
 * server-detection.js
 *
 * Gerencia a URL do servidor da API. Na versão web auto-hospedada,
 * o servidor é sempre a origem da página (`window.location.origin`).
 * Este módulo mantém a interface para compatibilidade com versões anteriores
 * que tinham detecção de múltiplos servidores (local, vpn, cloud).
 */

class ServerDetector {
  constructor() {
    // Na versão web, o servidor é sempre a origem.
    this.serverInfo = {
      type: 'cloud', // 'cloud' é usado como um genérico para "servidor web"
      url: window.location.origin,
      latency: 0,
      priority: 1,
    };
    this.monitoringInterval = null;
  }

  /**
   * Retorna as informações do servidor.
   * A detecção complexa foi removida, pois o servidor é fixo.
   * @returns {Promise<{type: string, url: string, latency: number, priority: number}>}
   */
  async detect() {
    return Promise.resolve(this.serverInfo);
  }

  /**
   * Retorna todos os endpoints descobertos, ordenados por latência
   */
  getAllEndpoints() {
    return [this.serverInfo];
  }

  /**
   * Retorna informações sobre a conexão atual
   */
  getConnectionInfo() {
    return {
      serverType: this.serverInfo.type,
      serverUrl: this.serverInfo.url,
      endpoints: [this.serverInfo],
      initialized: true,
    };
  }

  /**
   * Inicia o monitoramento. Na versão web, isso é um no-op, mas a função
   * é mantida para compatibilidade da API.
   * @returns {function(): void} Uma função para parar o monitoramento.
   */
  startMonitoring(_interval = 30000) {
    // O monitoramento de failover não é necessário quando há apenas um servidor fixo.
    return () => {}; // Retorna uma função vazia
  }
}

// Singleton global
window.ServerDetector = new ServerDetector();

// Exportar para uso em módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServerDetector;
}
