/**
 * limit-reached-modal.js
 * Modal de aviso quando um limite do plano é atingido
 */

class LimitReachedModal {
  constructor() {
    this.modal = null;
    this.createModal();
  }

  createModal() {
    // Check if modal already exists
    if (document.getElementById('limit-reached-modal')) {
      this.modal = document.getElementById('limit-reached-modal');
      return;
    }

    // Create modal structure
    const modalHTML = `
      <div id="limit-reached-modal" class="limit-modal" style="display: none;">
        <div class="limit-modal-overlay"></div>
        <div class="limit-modal-content">
          <div class="limit-modal-icon">⚠️</div>
          <h2 id="limit-modal-title" class="limit-modal-title">Limite Atingido</h2>
          <p id="limit-modal-message" class="limit-modal-message"></p>
          
          <div class="limit-modal-details">
            <div class="detail-row">
              <span class="detail-label">Seu plano atual:</span>
              <span id="limit-modal-current-plan" class="detail-value"></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Limite:</span>
              <span id="limit-modal-limit" class="detail-value"></span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Uso atual:</span>
              <span id="limit-modal-usage" class="detail-value"></span>
            </div>
          </div>

          <div class="limit-modal-suggestion">
            <p><strong>💡 Sugestão:</strong></p>
            <p id="limit-modal-suggestion-text"></p>
          </div>

          <div class="limit-modal-actions">
            <button id="limit-modal-upgrade-btn" class="btn-modal-primary">
              📈 Ver Planos e Fazer Upgrade
            </button>
            <button id="limit-modal-close-btn" class="btn-modal-secondary">
              Voltar
            </button>
          </div>
        </div>
      </div>
    `;

    // Add modal to document
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = document.getElementById('limit-reached-modal');

    // Add event listeners
    document.getElementById('limit-modal-close-btn').addEventListener('click', () => this.hide());
    document.getElementById('limit-modal-upgrade-btn').addEventListener('click', () => this.goToUpgrade());
    this.modal.querySelector('.limit-modal-overlay').addEventListener('click', () => this.hide());

    // Add styles
    this.addStyles();
  }

  show(type, currentPlan, limit, current) {
    const titles = {
      classes: 'Limite de Turmas Atingido',
      teachers: 'Limite de Professores Atingido',
      feature: 'Recurso Indisponível'
    };

    const messages = {
      classes: `Você atingiu o limite de ${limit} turmas do seu plano atual.`,
      teachers: `Você atingiu o limite de ${limit} professores do seu plano atual.`,
      feature: 'Este recurso não está disponível no seu plano atual.'
    };

    const suggestions = {
      classes: {
        free:        'Faça upgrade para o plano Starter e tenha até 5 turmas!',
        starter:     'Faça upgrade para o plano Multi e tenha até 15 turmas!',
        multi:       'Faça upgrade para o plano Maxxi e tenha até 35 turmas!',
        maxxi:       'Faça upgrade para o plano Plus e tenha turmas ilimitadas!',
        plus:        'Você já tem turmas ilimitadas neste plano.',
        plus_premium:'Você já tem turmas ilimitadas neste plano.',
        pro:         'Você já tem turmas ilimitadas neste plano.',
        pro_premium: 'Você já tem turmas ilimitadas neste plano.'
      },
      teachers: {
        free:        'Faça upgrade para o plano Starter e tenha até 22 professores!',
        starter:     'Faça upgrade para o plano Multi e tenha até 60 professores!',
        multi:       'Faça upgrade para o plano Maxxi e tenha até 90 professores!',
        maxxi:       'Faça upgrade para o plano Plus e tenha professores ilimitados!',
        plus:        'Você já tem professores ilimitados neste plano.',
        plus_premium:'Você já tem professores ilimitados neste plano.',
        pro:         'Você já tem professores ilimitados neste plano.',
        pro_premium: 'Você já tem professores ilimitados neste plano.'
      },
      feature: {
        free:        'Os planos Starter e superiores possuem este recurso.',
        starter:     'Os planos Multi, Maxxi, Plus e PRO possuem este recurso.',
        multi:       'Os planos Maxxi, Plus e PRO possuem este recurso.',
        maxxi:       'Os planos Plus e PRO possuem este recurso.',
        plus:        'O plano Plus Premium ou PRO Premium possui todos os recursos.',
        plus_premium:'Você já está no plano com todos os recursos.',
        pro:         'O plano PRO Premium possui todos os recursos.',
        pro_premium: 'Você já está no plano com todos os recursos.'
      }
    };

    const planNames = {
      free:        'Grátis',
      starter:     'Starter',
      multi:       'Multi',
      maxxi:       'Maxxi',
      plus:        'Plus',
      plus_premium:'Plus Premium',
      pro:         'Pro',
      pro_premium: 'Pro Premium'
    };

    // Update modal content
    document.getElementById('limit-modal-title').textContent = titles[type] || 'Limite Atingido';
    document.getElementById('limit-modal-message').textContent = messages[type] || 'Você atingiu um limite do seu plano.';
    document.getElementById('limit-modal-current-plan').textContent = planNames[currentPlan] || currentPlan;
    document.getElementById('limit-modal-limit').textContent = limit === 0 ? 'Ilimitado' : limit;
    document.getElementById('limit-modal-usage').textContent = current || '-';
    
    const suggestionText = suggestions[type]?.[currentPlan] || 'Considere fazer upgrade para acessar mais recursos.';
    document.getElementById('limit-modal-suggestion-text').textContent = suggestionText;

    // Show modal
    this.modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  hide() {
    this.modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }

  goToUpgrade() {
    this.hide();
    window.location.href = 'modules/subscription/subscription.html';
  }

  addStyles() {
    if (document.getElementById('limit-modal-styles')) return;

    const styles = `
      <style id="limit-modal-styles">
        .limit-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .limit-modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
        }

        .limit-modal-content {
          position: relative;
          background: white;
          border-radius: 12px;
          padding: 2rem;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
          animation: modalSlideIn 0.3s ease;
        }

        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .limit-modal-icon {
          font-size: 4rem;
          text-align: center;
          margin-bottom: 1rem;
        }

        .limit-modal-title {
          text-align: center;
          color: #2c3e50;
          margin: 0 0 1rem 0;
          font-size: 1.5rem;
        }

        .limit-modal-message {
          text-align: center;
          color: #7f8c8d;
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .limit-modal-details {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
          border-bottom: 1px solid #ecf0f1;
        }

        .detail-row:last-child {
          border-bottom: none;
        }

        .detail-label {
          color: #7f8c8d;
          font-size: 0.9rem;
        }

        .detail-value {
          color: #2c3e50;
          font-weight: bold;
          font-size: 0.9rem;
        }

        .limit-modal-suggestion {
          background: #fff3cd;
          border-left: 4px solid #f39c12;
          border-radius: 4px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        }

        .limit-modal-suggestion p {
          margin: 0.5rem 0;
          color: #856404;
          font-size: 0.9rem;
        }

        .limit-modal-suggestion strong {
          color: #533f03;
        }

        .limit-modal-actions {
          display: flex;
          gap: 0.75rem;
        }

        .btn-modal-primary, .btn-modal-secondary {
          flex: 1;
          padding: 0.75rem 1rem;
          border: none;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-modal-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-modal-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .btn-modal-secondary {
          background: #95a5a6;
          color: white;
        }

        .btn-modal-secondary:hover {
          background: #7f8c8d;
        }

        @media (max-width: 600px) {
          .limit-modal-content {
            padding: 1.5rem;
          }

          .limit-modal-actions {
            flex-direction: column;
          }

          .btn-modal-primary, .btn-modal-secondary {
            width: 100%;
          }
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }
}

// Create global instance
if (typeof window !== 'undefined') {
  window.limitReachedModal = new LimitReachedModal();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LimitReachedModal;
}
