/**
 * server-detection.js
 * 
 * Detecta automaticamente o servidor disponível (local, VPN ou cloud)
 * e retorna a URL mais rápida e confiável.
 * 
 * Estratégia:
 * 1. Tenta servidor local via mDNS (aula.local)
 * 2. Tenta servidor local via IPs descobertos (192.168.x.x)
 * 3. Tenta servidor VPN (10.0.0.1)
 * 4. Fallback para servidor cloud configurado
 */

class ServerDetector {
  constructor() {
    this.serverType = null;
    this.serverUrl = null;
    this.allEndpoints = [];
    this.detectionCache = null;
    this.cacheExpiry = null;
  }

  /**
   * Detecta servidor disponível com failover automático
   * Retorna: { type: 'local'|'vpn'|'cloud', url: string, latency: number, priority: number }
   */
  async detect() {
    const now = Date.now();

    // Sem detecção necessária: dados via API REST
    // (mantido por compatibilidade com código que chama detect())
    const webMode = {
      type: 'cloud',
      url: window.location.origin,
      latency: 0,
      priority: 1
    };

    this.serverType = webMode.type;
    this.serverUrl = webMode.url;
    this.allEndpoints = [webMode];
    this.detectionCache = webMode;
    this.cacheExpiry = now + (5 * 60 * 1000);

    return webMode;
  }

  /**
   * Testa se um servidor responde em menos de timeout
   * Retorna latência se ok, null se timeout
   */
  async testServer(url, type) {
    try {
      const start = performance.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const response = await fetch(`${url}/api/health`, {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const latency = Math.round(performance.now() - start);
        return {
          type,
          url: url,
          latency,
          priority: this.getPriority(type)
        };
      }
    } catch (e) {
      // Timeout ou erro de rede
    }

    return null;
  }

  /**
   * Obtém prioridade do tipo (para ordenação)
   */
  getPriority(type) {
    const priorities = {
      'local': 1,   // Local é mais confiável
      'vpn': 2,     // VPN é backup
      'cloud': 3    // Cloud é último recurso
    };
    return priorities[type] || 99;
  }

  /**
   * Descobre IPs locais usando WebRTC
   */
  async getLocalIPs() {
    return new Promise((resolve) => {
      const ips = new Set();
      const pc = new RTCPeerConnection({
        iceServers: []
      });

      // Função para extrair IP do candidato ICE
      const parseCandidate = (candidate) => {
        const ipRegex = /([0-9]{1,3}\.){3}[0-9]{1,3}/;
        const match = candidate.match(ipRegex);
        if (match) return match[0];
        return null;
      };

      pc.createDataChannel('');

      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate) {
          pc.close();
          resolve(Array.from(ips));
          return;
        }

        const ip = parseCandidate(ice.candidate.candidate);
        if (ip && !ip.startsWith('127.') && !ip.startsWith('255.')) {
          // Filtrar apenas IPs da rede local
          if (ip.startsWith('192.168.') || 
              ip.startsWith('10.') || 
              ip.startsWith('172.')) {
            ips.add(ip);
          }
        }
      };

      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          pc.close();
          resolve(Array.from(ips));
        });

      // Timeout de segurança
      setTimeout(() => {
        pc.close();
        resolve(Array.from(ips));
      }, 2000);
    });
  }

  /**
   * Obtém URL do servidor cloud (armazenado em localStorage)
   */
  async getCloudServerUrl() {
    // Tentar ler de localStorage primeiro
    let cloudUrl = localStorage.getItem('aula_cloud_server_url');
    
    if (cloudUrl) {
      return cloudUrl;
    }

    // Fallback para URL padrão (domínio público)
    return 'https://aula.plataforma.com.br';
  }

  /**
   * Retorna todos os endpoints descobertos, ordenados por latência
   */
  getAllEndpoints() {
    return this.allEndpoints;
  }

  /**
   * Define URL do servidor cloud (salva em localStorage)
   */
  setCloudServerUrl(url) {
    localStorage.setItem('aula_cloud_server_url', url);
    this.detectionCache = null;
    this.cacheExpiry = null;
  }

  /**
   * Força detecção novamente (limpa cache)
   */
  invalidateCache() {
    this.detectionCache = null;
    this.cacheExpiry = null;
  }

  /**
   * Retorna informações sobre a conexão atual
   */
  getConnectionInfo() {
    return {
      type: this.serverType,
      url: this.serverUrl,
      endpoints: this.allEndpoints,
      cached: !!this.detectionCache
    };
  }

  /**
   * Monitora disponibilidade com polling (para failover automático)
   */
  startMonitoring(interval = 30000) {
    this.monitoringInterval = setInterval(() => {
      this.invalidateCache();
      // Detecta silenciosamente em background
      this.detect().catch(() => {});
    }, interval);

    return () => {
      clearInterval(this.monitoringInterval);
    };
  }
}

// Singleton global
window.ServerDetector = new ServerDetector();

// Exportar para uso em módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ServerDetector;
}
