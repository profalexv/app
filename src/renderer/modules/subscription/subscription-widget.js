/**
 * subscription-widget.js
 * Widget compacto de assinatura para integrar na dashboard
 */

class SubscriptionWidget {
  constructor(containerId) {
    this.containerId = containerId;
    this.container = document.getElementById(containerId);
    this.subscription = null;
    this.usage = null;
  }

  async loadAndRender() {
    try {
      const schoolId = await this.getSchoolId();
      if (!schoolId) return;

      const result = await this.apiRequest(`/subscription/${schoolId}`, 'GET');
      if (!result.success) {
        this.renderError('Erro ao carregar assinatura');
        return;
      }

      this.subscription = result.data.subscription;
      this.usage = result.data.usage;
      this.planDetails = result.data.planDetails;
      this.isActive = result.data.isActive;

      this.render();
    } catch (error) {
      this.renderError(error.message);
    }
  }

  render() {
    if (!this.container) return;

    const planClass = this.subscription.plan_type;
    const planName = this.planDetails.name;
    
    let statusBadge = '';
    let statusText = '';
    
    if (!this.isActive) {
      statusBadge = '⚠️';
      statusText = 'Expirada';
    } else if (this.subscription.status === 'trial') {
      const trialEnds = new Date(this.subscription.trial_ends_at);
      const daysLeft = Math.ceil((trialEnds - new Date()) / (1000 * 60 * 60 * 24));
      statusBadge = '🎁';
      statusText = `Trial: ${daysLeft} dias restantes`;
    } else {
      statusBadge = '✅';
      statusText = 'Ativa';
    }

    // Calculate usage percentages
    const classesUsage = this.calculateUsage(this.usage.classes, this.subscription.max_classes);
    const teachersUsage = this.calculateUsage(this.usage.teachers, this.subscription.max_teachers);

    this.container.innerHTML = `
      <div class="subscription-widget">
        <div class="widget-header">
          <h3>${statusBadge} Plano: ${planName}</h3>
          <span class="status-badge ${this.isActive ? 'active' : 'expired'}">${statusText}</span>
        </div>
        
        <div class="widget-usage">
          <div class="usage-row">
            <span class="usage-label">🏫 Turmas:</span>
            <span class="usage-value">${classesUsage.text}</span>
            <div class="mini-progress">
              <div class="mini-progress-bar ${classesUsage.colorClass}" style="width: ${classesUsage.percentage}%"></div>
            </div>
          </div>
          
          <div class="usage-row">
            <span class="usage-label">👨‍🏫 Professores:</span>
            <span class="usage-value">${teachersUsage.text}</span>
            <div class="mini-progress">
              <div class="mini-progress-bar ${teachersUsage.colorClass}" style="width: ${teachersUsage.percentage}%"></div>
            </div>
          </div>
        </div>

        <div class="widget-actions">
          <button class="btn-widget-primary" onclick="window.location.href='modules/subscription/subscription.html'">
            Ver Detalhes
          </button>
          ${!['plus_premium','pro_premium'].includes(this.subscription.plan_type) && this.isActive ? 
            '<button class="btn-widget-secondary" onclick="subscriptionWidget.showQuickUpgrade()">📈 Upgrade</button>' : 
            ''}
        </div>
      </div>
    `;
  }

  calculateUsage(current, limit) {
    const isUnlimited = limit === 0;
    const percentage = isUnlimited ? 100 : Math.min((current / limit) * 100, 100);
    
    let colorClass = 'safe';
    if (!isUnlimited) {
      if (percentage >= 90) colorClass = 'danger';
      else if (percentage >= 70) colorClass = 'warning';
    }

    return {
      text: isUnlimited ? `${current}/∞` : `${current}/${limit}`,
      percentage: isUnlimited ? 0 : percentage,
      colorClass
    };
  }

  renderError(message) {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="subscription-widget error">
        <p>❌ ${message}</p>
      </div>
    `;
  }

  showQuickUpgrade() {
    // Redirect to full subscription page
    window.location.href = 'modules/subscription/subscription.html';
  }

  // Helper methods (these should be imported from web-bridge in real usage)
  async apiRequest(endpoint, method = 'GET', body = null) {
    // This is a placeholder - in production, use the actual web-bridge.js methods
    const response = await fetch(`/api${endpoint}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : null
    });
    return response.json();
  }

  async getSchoolId() {
    // This is a placeholder - in production, use the actual web-bridge.js method
    // For now, assume school_id is stored in localStorage or session
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
    return user.school_id || 1;
  }
}

// CSS for the widget (can be added to app.css)
const widgetStyles = `
<style>
.subscription-widget {
  background: white;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 1rem;
}

.subscription-widget.error {
  background: #fff3cd;
  border-left: 4px solid #f39c12;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.widget-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: #2c3e50;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: bold;
}

.status-badge.active {
  background: #d5f4e6;
  color: #27ae60;
}

.status-badge.expired {
  background: #f8d7da;
  color: #e74c3c;
}

.widget-usage {
  margin-bottom: 1rem;
}

.usage-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.usage-label {
  font-size: 0.9rem;
  color: #7f8c8d;
  min-width: 120px;
}

.usage-value {
  font-weight: bold;
  font-size: 0.9rem;
  color: #2c3e50;
  min-width: 50px;
}

.mini-progress {
  flex: 1;
  height: 8px;
  background: #ecf0f1;
  border-radius: 4px;
  overflow: hidden;
}

.mini-progress-bar {
  height: 100%;
  transition: width 0.3s ease;
}

.mini-progress-bar.safe {
  background: linear-gradient(90deg, #3498db 0%, #2ecc71 100%);
}

.mini-progress-bar.warning {
  background: linear-gradient(90deg, #f39c12 0%, #e67e22 100%);
}

.mini-progress-bar.danger {
  background: linear-gradient(90deg, #e74c3c 0%, #c0392b 100%);
}

.widget-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-widget-primary, .btn-widget-secondary {
  flex: 1;
  padding: 0.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-widget-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-weight: 600;
}

.btn-widget-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
}

.btn-widget-secondary {
  background: #95a5a6;
  color: white;
}

.btn-widget-secondary:hover {
  background: #7f8c8d;
}
</style>
`;

// Auto-initialize if container exists
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const widgetContainer = document.getElementById('subscription-widget-container');
    if (widgetContainer) {
      window.subscriptionWidget = new SubscriptionWidget('subscription-widget-container');
      subscriptionWidget.loadAndRender();
    }
  });
}
