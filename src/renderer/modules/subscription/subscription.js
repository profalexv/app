/**
 * subscription.js
 * Interface de gerenciamento de assinatura e planos
 */

const { getSchoolId, apiRequest } = require('../../data/web-bridge');

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let currentSubscription = null;
let currentUsage = null;
let availablePlans = [];
let selectedPlanForUpgrade = null;

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadSubscriptionData();
});

function setupEventListeners() {
  document.getElementById('btn-back')?.addEventListener('click', goBack);
  document.getElementById('btn-retry')?.addEventListener('click', loadSubscriptionData);
  document.getElementById('btn-upgrade')?.addEventListener('click', showUpgradeModal);
  document.getElementById('btn-cancel-upgrade')?.addEventListener('click', hideUpgradeModal);
  document.getElementById('btn-confirm-upgrade')?.addEventListener('click', confirmUpgrade);
}

function goBack() {
  window.history.back();
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA LOADING
// ═══════════════════════════════════════════════════════════════════════════

async function loadSubscriptionData() {
  showLoading();
  
  try {
    const schoolId = await getSchoolId();
    if (!schoolId) {
      throw new Error('School ID não encontrado.');
    }

    // Load current subscription
    const subResult = await apiRequest(`/subscription/${schoolId}`, 'GET');
    if (!subResult.success) {
      throw new Error(subResult.error || 'Erro ao carregar assinatura.');
    }

    currentSubscription = subResult.data.subscription;
    currentUsage = subResult.data.usage;
    const planDetails = subResult.data.planDetails;
    const isActive = subResult.data.isActive;

    // Load available plans
    const plansResult = await apiRequest('/subscription/plans', 'GET');
    if (plansResult.success) {
      availablePlans = plansResult.data;
    }

    renderSubscriptionInfo(currentSubscription, planDetails, isActive);
    renderUsageStats(currentUsage, currentSubscription);
    renderFeatures(planDetails);
    
    showContent();
  } catch (error) {
    showError(error.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════════════════

function renderSubscriptionInfo(subscription, planDetails, isActive) {
  const planBadge = document.getElementById('plan-badge');
  const planName = document.getElementById('plan-name');
  const planDescription = document.getElementById('plan-description');
  const planStatus = document.getElementById('plan-status');
  const planPricing = document.getElementById('plan-pricing');
  const btnUpgrade = document.getElementById('btn-upgrade');

  // Plan badge
  planBadge.className = `plan-badge ${subscription.plan_type}`;
  planName.textContent = planDetails.name;
  planDescription.textContent = planDetails.description;

  // Status
  let statusHTML = '';
  let statusClass = '';

  if (!isActive) {
    statusClass = 'expired';
    statusHTML = '<strong>⚠️ Assinatura Expirada</strong><p>Sua assinatura expirou. Renove para continuar usando todos os recursos.</p>';
  } else if (subscription.status === 'trial') {
    statusClass = 'trial';
    const trialEnds = new Date(subscription.trial_ends_at);
    const daysLeft = Math.ceil((trialEnds - new Date()) / (1000 * 60 * 60 * 24));
    statusHTML = `<strong>🎁 Período de Avaliação</strong><p>Teste grátis termina em ${daysLeft} dias (${trialEnds.toLocaleDateString('pt-BR')})</p>`;
  } else {
    statusClass = 'active';
    if (subscription.expires_at) {
      const expiresAt = new Date(subscription.expires_at);
      statusHTML = `<strong>✅ Assinatura Ativa</strong><p>Válida até ${expiresAt.toLocaleDateString('pt-BR')}</p>`;
    } else {
      statusHTML = '<strong>✅ Assinatura Ativa</strong>';
    }
  }

  planStatus.className = `plan-status ${statusClass}`;
  planStatus.innerHTML = statusHTML;

  // Pricing
  let pricingHTML = '<strong>💰 Valores:</strong><br>';

  if (planDetails.price.annual > 0) {
    pricingHTML += `Anuidade: R$ ${planDetails.price.annual.toFixed(2)}/ano<br>`;
    if (planDetails.price.firstYearPrice) {
      pricingHTML += `<em>1º ano com −40%: R$ ${planDetails.price.firstYearPrice.toFixed(2)}</em><br>`;
    }
  } else {
    pricingHTML += 'Plano gratuito<br>';
  }

  if (planDetails.trial) {
    pricingHTML += `<em>Trial: ${planDetails.trial.duration} dias grátis (sem cartão)</em>`;
  }

  planPricing.innerHTML = pricingHTML;

  // Show upgrade button if not on highest plan
  const topPlans = ['plus_premium', 'pro_premium'];
  if (!topPlans.includes(subscription.plan_type) && isActive) {
    btnUpgrade.style.display = 'block';
  } else {
    btnUpgrade.style.display = 'none';
  }
}

function renderUsageStats(usage, subscription) {
  // Classes
  renderUsageItem(
    'classes',
    usage.classes,
    subscription.max_classes,
    '🏫 Turmas'
  );

  // Teachers
  renderUsageItem(
    'teachers',
    usage.teachers,
    subscription.max_teachers,
    '👨‍🏫 Professores'
  );

  // Resources
  renderUsageItem(
    'resources',
    usage.resources,
    subscription.max_resources || 0,
    '🏢 Recursos'
  );
}

function renderUsageItem(id, current, limit, label) {
  const textEl = document.getElementById(`usage-${id}-text`);
  const barEl = document.getElementById(`usage-${id}-bar`);

  const isUnlimited = limit === 0;
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);

  textEl.textContent = isUnlimited ? `${current}/∞` : `${current}/${limit}`;
  barEl.style.width = isUnlimited ? '100%' : `${percentage}%`;

  // Color based on usage
  barEl.className = 'progress-fill';
  if (!isUnlimited) {
    if (percentage >= 90) {
      barEl.classList.add('danger');
    } else if (percentage >= 70) {
      barEl.classList.add('warning');
    }
  }
}

function renderFeatures(planDetails) {
  const featuresList = document.getElementById('features-list');
  featuresList.innerHTML = '';

  const featureNames = {
    cronograma: '📅 Cronograma',
    sugestao_automatica: '🧠 Sugestão Automática de Horários',
    exportacao_pdf: '🖨️ Exportação e Impressão PDF',
    cadastro_escola: '🏫 Cadastro de Escola',
    cadastro_professores: '👨‍🏫 Cadastro de Professores',
    cadastro_recursos: '🏢 Cadastro de Recursos',
    agendamento_recursos: '📆 Agendamento de Recursos',
    plano_aula: '📋 Planos de Aula',
    editor_planos_bncc: '✏️ Editor de Planos BNCC',
    registro_aulas: '📝 Registro de Aulas',
    relatorios: '📊 Relatórios',
    backup_local: '💾 Backup Local',
    backup_cloud: '☁️ Backup na Nuvem',
    bd_proprio: '🐘 Banco de Dados Próprio (PostgreSQL)',
    cloudflare_tunnel: '🌐 Acesso via Cloudflare Tunnel',
    compliance_lgpd: '⚖️ Compliance LGPD',
    suporte_implantacao: '🤝 Suporte de Implantação',
    suporte_prioritario: '🎯 Suporte Prioritário',
    suporte_dedicado: '🏆 Suporte Dedicado'
  };

  for (const [key, enabled] of Object.entries(planDetails.features)) {
    const item = document.createElement('div');
    item.className = `feature-item ${enabled ? 'enabled' : 'disabled'}`;
    
    const icon = document.createElement('span');
    icon.className = 'feature-icon';
    icon.textContent = enabled ? '✅' : '❌';
    
    const name = document.createElement('span');
    name.className = 'feature-name';
    name.textContent = featureNames[key] || key;
    
    item.appendChild(icon);
    item.appendChild(name);
    featuresList.appendChild(item);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UPGRADE MODAL
// ═══════════════════════════════════════════════════════════════════════════

function showUpgradeModal() {
  const modal = document.getElementById('upgrade-modal');
  const plansSection = document.getElementById('plans-section');
  const plansList = document.getElementById('plans-list');

  // Render available plans for upgrade
  plansList.innerHTML = '';
  
  const currentPlanOrder = [
    'free',
    'starter',
    'multi',
    'maxxi',
    'plus',
    'plus_premium',
    'pro',
    'pro_premium'
  ];
  const currentIndex = currentPlanOrder.indexOf(currentSubscription.plan_type);

  availablePlans.forEach(plan => {
    const planIndex = currentPlanOrder.indexOf(plan.id);
    if (planIndex <= currentIndex) return; // Only show higher plans

    const item = document.createElement('div');
    item.className = 'plan-item';
    item.onclick = () => selectPlanForUpgrade(plan);

    let priceText = 'Grátis';
    if (plan.price.annual > 0) {
      priceText = `R$ ${plan.price.annual}/ano`;
      if (plan.price.firstYearPrice) priceText += ` (1º ano R$ ${plan.price.firstYearPrice})`;
    }

    item.innerHTML = `
      <div class="plan-item-header">
        <div class="plan-item-name">${plan.name}</div>
        <div class="plan-item-price">${priceText}</div>
      </div>
      <div class="plan-item-description">${plan.description}</div>
      <ul class="plan-item-features">
        <li>Turmas: ${plan.limits.classes === 0 ? 'Ilimitadas' : plan.limits.classes}</li>
        <li>Professores: ${plan.limits.teachers === 0 ? 'Ilimitados' : plan.limits.teachers}</li>
        <li>Recursos: ${plan.limits.resources === 0 ? 'Ilimitados' : plan.limits.resources}</li>
      </ul>
    `;

    plansList.appendChild(item);
  });

  plansSection.style.display = 'block';
  modal.style.display = 'flex';
}

function hideUpgradeModal() {
  const modal = document.getElementById('upgrade-modal');
  modal.style.display = 'none';
  selectedPlanForUpgrade = null;
}

function selectPlanForUpgrade(plan) {
  selectedPlanForUpgrade = plan;
  
  const upgradeInfo = document.getElementById('upgrade-plan-info');
  upgradeInfo.innerHTML = `
    <h3>Você selecionou: ${plan.name}</h3>
    <p>${plan.description}</p>
    <p><strong>Valor:</strong> ${getPriceText(plan)}</p>
    <p>Deseja confirmar o upgrade?</p>
  `;
}

async function confirmUpgrade() {
  if (!selectedPlanForUpgrade) {
    alert('Selecione um plano primeiro.');
    return;
  }

  try {
    const result = await apiRequest('/subscription/upgrade', 'POST', {
      subscriptionId: currentSubscription.id,
      newPlanType: selectedPlanForUpgrade.id
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    alert('Upgrade realizado com sucesso!');
    hideUpgradeModal();
    loadSubscriptionData();
  } catch (error) {
    alert('Erro ao fazer upgrade: ' + error.message);
  }
}

function getPriceText(plan) {
  if (plan.price.franchise > 0) {
    return `R$ ${plan.price.franchise.toFixed(2)} (franquia) + R$ ${plan.price.monthly.toFixed(2)}/mês`;
  } else if (plan.price.annual > 0) {
    return `R$ ${plan.price.annual.toFixed(2)}/ano`;
  } else if (plan.price.monthly > 0) {
    return `R$ ${plan.price.monthly.toFixed(2)}/mês`;
  }
  return 'Grátis';
}

// ═══════════════════════════════════════════════════════════════════════════
// UI STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

function showLoading() {
  document.getElementById('loading-section').style.display = 'block';
  document.getElementById('error-section').style.display = 'none';
  document.getElementById('content-section').style.display = 'none';
}

function showError(message) {
  document.getElementById('loading-section').style.display = 'none';
  document.getElementById('error-section').style.display = 'block';
  document.getElementById('content-section').style.display = 'none';
  document.getElementById('error-message').textContent = message;
}

function showContent() {
  document.getElementById('loading-section').style.display = 'none';
  document.getElementById('error-section').style.display = 'none';
  document.getElementById('content-section').style.display = 'block';
}
