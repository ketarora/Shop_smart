let currentMode = 'eco';

document.addEventListener('DOMContentLoaded', async () => {
  // Get current mode from storage
  const { analysisMode } = await chrome.storage.local.get('analysisMode');
  currentMode = analysisMode || 'eco';
  
  updateModeUI(currentMode);
  loadAnalysis();
  
  // Mode toggle button handlers
  document.getElementById('eco-btn').addEventListener('click', () => switchMode('eco'));
  document.getElementById('trust-btn').addEventListener('click', () => switchMode('trust'));
  
  // View details button handlers
  document.getElementById('view-eco-details')?.addEventListener('click', openSidePanel);
  document.getElementById('view-trust-details')?.addEventListener('click', openSidePanel);
});

// Switch between Eco and Trust modes
async function switchMode(mode) {
  if (currentMode === mode) return; // Already in this mode
  
  currentMode = mode;
  await chrome.storage.local.set({ analysisMode: mode });
  updateModeUI(mode);
  
  // Trigger re-analysis with new mode
  const { currentProduct } = await chrome.storage.local.get('currentProduct');
  if (currentProduct && currentProduct.title) {
    showLoading();
    
    chrome.runtime.sendMessage(
      { action: 'analyzeProduct', data: currentProduct, mode: mode },
      (response) => {
        if (response && response.success) {
          chrome.storage.local.set({ currentAnalysis: response.data });
          loadAnalysis();
        } else {
          hideLoading();
          showError();
        }
      }
    );
  }
}

// Update UI based on active mode
function updateModeUI(mode) {
  const ecoBtn = document.getElementById('eco-btn');
  const trustBtn = document.getElementById('trust-btn');
  
  if (mode === 'eco') {
    ecoBtn.classList.add('active');
    trustBtn.classList.remove('active');
  } else {
    trustBtn.classList.add('active');
    ecoBtn.classList.remove('active');
  }
}

// Load and display analysis
async function loadAnalysis() {
  const { currentProduct, currentAnalysis } = await chrome.storage.local.get(['currentProduct', 'currentAnalysis']);
  
  hideAll();
  
  if (!currentProduct || !currentProduct.title) {
    document.getElementById('no-product').classList.remove('hidden');
    return;
  }
  
  if (!currentAnalysis) {
    document.getElementById('loading').classList.remove('hidden');
    return;
  }
  
  // Display based on mode and analysis type
  if (currentAnalysis.type === 'eco' && currentMode === 'eco') {
    displayEcoAnalysis(currentProduct, currentAnalysis);
  } else if (currentAnalysis.type === 'trust' && currentMode === 'trust') {
    displayTrustAnalysis(currentProduct, currentAnalysis);
  } else {
    // Mode mismatch - show loading while re-analyzing
    document.getElementById('loading').classList.remove('hidden');
  }
}

// Display Eco Score analysis
function displayEcoAnalysis(product, data) {
  const analysis = document.getElementById('eco-analysis');
  analysis.classList.remove('hidden');
  
  // Update score
  document.getElementById('eco-score-value').textContent = data.score;
  document.getElementById('eco-product-title').textContent = truncate(product.title, 65);
  document.getElementById('eco-category').textContent = data.category?.toUpperCase() || 'N/A';
  
  // Update breakdown
  document.getElementById('materials-info').textContent = truncate(data.materials || 'N/A', 40);
  
  const certCount = Array.isArray(data.certifications) ? data.certifications.length : 0;
  document.getElementById('cert-info').textContent = certCount > 0 ? 
    `${certCount} verified` : 'None found';
  
  document.getElementById('packaging-info').textContent = truncate(data.packaging || 'N/A', 40);
  
  // Show concerns if any
  if (data.concerns && data.concerns !== 'N/A') {
    const concernsAlert = document.getElementById('eco-concerns');
    concernsAlert.classList.remove('hidden');
    document.getElementById('concerns-text').textContent = data.concerns;
  }
  
  // Update score card color
  updateScoreCardColor(data.score);
}

// Display Trust Score analysis
function displayTrustAnalysis(product, data) {
  const analysis = document.getElementById('trust-analysis');
  analysis.classList.remove('hidden');
  
  // Update score
  document.getElementById('trust-score-value').textContent = data.trustScore;
  document.getElementById('trust-product-title').textContent = truncate(product.title, 65);
  
  // Category badge
  const categoryMap = {
    'highly_trusted': 'HIGHLY TRUSTED',
    'trusted': 'TRUSTED',
    'questionable': 'QUESTIONABLE',
    'suspicious': 'SUSPICIOUS'
  };
  document.getElementById('trust-category').textContent = categoryMap[data.category] || data.category?.toUpperCase();
  
  // Update breakdown
  document.getElementById('fake-percentage').textContent = `~${data.fakePercentage}%`;
  document.getElementById('verdict').textContent = truncate(data.verdict || 'Analyzing...', 50);
  
  // Recommendation badge
  const recElement = document.getElementById('recommendation');
  const recIcon = data.recommendation === 'buy' ? '✅' : 
                  data.recommendation === 'cautious' ? '⚠️' : '❌';
  recElement.textContent = `${recIcon} ${data.recommendation?.toUpperCase() || 'CAUTIOUS'}`;
  
  // Update badge color
  if (data.recommendation === 'buy') {
    recElement.style.background = '#d1fae5';
    recElement.style.color = '#065f46';
  } else if (data.recommendation === 'avoid') {
    recElement.style.background = '#fee2e2';
    recElement.style.color = '#991b1b';
  }
  
  // Show red flags if present
  if (data.redFlags && data.redFlags.length > 0) {
    const alert = document.getElementById('red-flags');
    alert.classList.remove('hidden');
    const list = document.getElementById('red-flags-list');
    list.innerHTML = data.redFlags.map(flag => `<li>${flag}</li>`).join('');
  }
  
  // Update score card color
  updateScoreCardColor(data.trustScore);
}

// Update score card gradient based on score
function updateScoreCardColor(score) {
  const scoreCard = document.querySelector('.score-card');
  if (score >= 80) {
    scoreCard.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
  } else if (score >= 60) {
    scoreCard.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
  } else {
    scoreCard.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
  }
}

// Helper functions
function hideAll() {
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('no-product').classList.add('hidden');
  document.getElementById('eco-analysis').classList.add('hidden');
  document.getElementById('trust-analysis').classList.add('hidden');
}

function showLoading() {
  hideAll();
  document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

function showError() {
  // Could add error state UI here
  console.error('Analysis failed');
}

function openSidePanel() {
  chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
}

function truncate(str, length) {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
}
