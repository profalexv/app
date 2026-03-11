/**
 * connection-status-ui.js
 * 
 * Componente visual que exibe o status da conexão (servidor local, VPN ou cloud)
 * com indicadores visuais e latência
 */

class ConnectionStatusUI {
  constructor() {
    this.container = null;
    this.icons = {
      'local': '🟢',     // Verde = Local (mais rápido)
      'vpn': '🟣',       // Roxo = VPN
      'cloud': '🔵',     // Azul = Cloud
      'unknown': '⚪'     // Cinza = Desconhecido
    };
    this.labels = {
      'local': 'Rede Local',
      'vpn': 'VPN Corporativa',
      'cloud': 'Nuvem',
      'unknown': 'Desconhecido'
    };
  }

  /**
   * Cria e retorna o HTML do indicador
   */
  createIndicator() {
    const info = window.AppServerDetection.getConnectionInfo();
    const type = info.serverType || 'unknown';
    const endpoints = info.endpoints || [];

    const html = `
      <div class="connection-status-indicator" style="
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: var(--color-surface-alt, #f5f5f5);
        border-radius: 6px;
        font-size: 12px;
        color: var(--color-text-secondary, #666);
        font-weight: 500;
        cursor: pointer;
        user-select: none;
        transition: all 0.2s;
      " title="Clique para detalhes da conexão" onclick="window.ConnectionStatus.showDetails()">
        <span style="font-size: 16px;">${this.icons[type] || this.icons['unknown']}</span>
        <span>${this.labels[type]}</span>
        ${endpoints.length > 0 && endpoints[0].latency ? `
          <span style="color: var(--color-text-muted, #999); margin-left: 4px;">
            (${endpoints[0].latency}ms)
          </span>
        ` : ''}
        ${endpoints.length > 1 ? `
          <span style="color: var(--color-warning, #f59e0b); margin-left: 4px;">
            ↔️
          </span>
        ` : ''}
      </div>
    `;

    return html;
  }

  /**
   * Cria modal com detalhes de conexão e endpoints
   */
  showDetails() {
    const info = window.AppServerDetection.getConnectionInfo();
    const endpoints = info.endpoints || [];

    let endpointsHtml = '';
    endpoints.forEach((ep, i) => {
      const isActive = i === 0;
      endpointsHtml += `
        <div style="
          padding: 10px;
          background: ${isActive ? '#e8f5e9' : '#f5f5f5'};
          border-left: 3px solid ${
            ep.type === 'local' ? '#4caf50' : 
            ep.type === 'vpn' ? '#9c27b0' : 
            '#2196f3'
          };
          border-radius: 3px;
          margin: 8px 0;
          font-family: monospace;
          font-size: 11px;
        ">
          <div style="font-weight: 600; margin-bottom: 4px;">
            ${isActive ? '✓ ATIVO' : '○ Backup'}
            ${this.icons[ep.type]} ${ep.type.toUpperCase()}
          </div>
          <div>URL: ${ep.url}</div>
          ${ep.latency !== null ? `<div>Latência: ${ep.latency}ms</div>` : ''}
          <div style="color: #666; font-size: 10px;">
            ${ep.description || ''}
          </div>
        </div>
      `;
    });

    const detailsHtml = `
      <div style="max-height: 500px; overflow-y: auto;">
        <h4 style="margin: 0 0 12px 0; color: var(--color-text);">Conexão Atual</h4>
        <div style="padding: 12px; background: #f9f9f9; border-radius: 6px; margin-bottom: 16px;">
          <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">
            ${this.icons[info.serverType]} ${this.labels[info.serverType]}
          </div>
          <div style="font-size: 12px; color: #666;">
            ${info.serverUrl}
          </div>
        </div>

        <h4 style="margin: 16px 0 8px 0; color: var(--color-text);">Endpoints Disponíveis</h4>
        ${endpointsHtml || '<p style="color: #999;">Nenhum endpoint alternativo encontrado</p>'}

        <h4 style="margin: 16px 0 8px 0; color: var(--color-text);">Estratégia de Detecção</h4>
        <div style="padding: 8px; background: #f9f9f9; border-radius: 4px; font-size: 12px; color: #666;">
          <p>1. Tenta servidor local (mDNS: aula.local)</p>
          <p>2. Tenta servidor local (IPs descobertos)</p>
          <p>3. Tenta VPN (10.0.0.1)</p>
          <p>4. Usa servidor cloud como fallback</p>
          <p style="margin-top: 8px; color: #999; font-size: 11px;">Cache: 5 minutos | Monitoramento: 30 segundos</p>
        </div>
      </div>
    `;

    window.openModal({
      title: '🔗 Status de Conexão',
      bodyHtml: detailsHtml,
      size: 'normal',
      confirmLabel: 'Fechar',
      confirmClass: 'btn-secondary'
    });
  }

  /**
   * Integra o indicador no elemento especificado
   */
  mount(parentSelector) {
    const parent = document.querySelector(parentSelector);
    if (!parent) {
      console.warn(`[ConnectionStatus] Elemento não encontrado: ${parentSelector}`);
      return;
    }

    parent.innerHTML = this.createIndicator();
  }

  /**
   * Atualiza o indicador periodicamente
   */
  startLiveUpdates(interval = 5000) {
    this.updateInterval = setInterval(() => {
      if (this.container) {
        this.container.innerHTML = this.createIndicator();
      }
    }, interval);

    return () => clearInterval(this.updateInterval);
  }
}

// Singleton global
window.ConnectionStatus = new ConnectionStatusUI();

// Exportar para uso em módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConnectionStatusUI;
}
