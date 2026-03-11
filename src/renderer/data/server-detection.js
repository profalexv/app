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

    // No app desktop (Electron), os dados são locais via IPC e não dependem de API HTTP.
    // Evita tentativas de rede desnecessárias e ruído no console.
    if (window.aula) {
      const localDesktop = {
        type: 'local',
        url: 'ipc://local',
        latency: 0,
        priority: 0
      };

      this.serverType = localDesktop.type;
      this.serverUrl = localDesktop.url;
      this.allEndpoints = [localDesktop];
      this.detectionCache = localDesktop;
      this.cacheExpiry = now + (5 * 60 * 1000);

      return localDesktop;
    }
    
    // Cache por 5 minutos se detectou com sucesso
    if (this.detectionCache && this.cacheExpiry && now < this.cacheExpiry) {
      return this.detectionCache;
    }

    const endpoints = [];
    const timeouts = [];

    // 1️⃣ Tentar servidor local via mDNS
    const localMdns = await this.testServer('http://aula.local:3000', 'local');
    if (localMdns) endpoints.push(localMdns);
    timeouts.push(1000);

    // 2️⃣ Tentar servidor local via IPs (WebRTC discovery)
    const localIps = await this.getLocalIPs();
    for (const ip of localIps) {
      const localIp = await this.testServer(`http://${ip}:3000`, 'local');
      if (localIp) {
        endpoints.push(localIp);
        break; // Encontrou um, próximo tipo
      }
    }
    timeouts.push(500);

    // 3️⃣ Tentar servidor VPN
    const vpn = await this.testServer('http://10.0.0.1:3000', 'vpn');
    if (vpn) endpoints.push(vpn);
    timeouts.push(800);

    // 4️⃣ Fallback para cloud (sempre disponível teoricamente)
    const cloudUrl = await this.getCloudServerUrl();
    const cloud = await this.testServer(cloudUrl, 'cloud');
    if (cloud) endpoints.push(cloud);

    // Ordenar por latência (mais rápido na frente)
    endpoints.sort((a, b) => a.latency - b.latency);

    this.allEndpoints = endpoints;

    // Usar o mais rápido; se nenhum responder, reportar como desconhecido
    // (em vez de simular cloud indisponível como se fosse sucesso)
    const selected = endpoints.length > 0 ? endpoints[0] : {
      type: 'unknown',
      url: null,
      latency: null,
      priority: 999
    };

    this.serverType = selected.type;
    this.serverUrl = selected.url;

    // Cache por 5 minutos
    this.detectionCache = selected;
    this.cacheExpiry = now + (5 * 60 * 1000);

    return selected;
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
