// Content Script - Detects products and injects smart badges

let currentProduct = null;
let currentMode = 'eco'; // default mode

// Get current mode from storage on load
chrome.storage.local.get('analysisMode', (data) => {
  currentMode = data.analysisMode || 'eco';
});

// Listen for mode changes from popup
chrome.storage.onChanged.addListener((changes) => {
  if (changes.analysisMode) {
    currentMode = changes.analysisMode.newValue;
    init(); // Re-analyze with new mode
  }
});

// Detect which shopping site we're on
function detectSite() {
  const hostname = window.location.hostname;
  if (hostname.includes('amazon')) return 'amazon';
  if (hostname.includes('flipkart')) return 'flipkart';
  return 'unknown';
}

// Extract product data from page
function extractProductData() {
  const site = detectSite();
  let productData = {};

  if (site === 'amazon') {
    productData = {
      title: document.querySelector('#productTitle')?.innerText?.trim() || '',
      price: document.querySelector('.a-price-whole')?.innerText?.trim() || '',
      description: document.querySelector('#feature-bullets')?.innerText?.trim() || '',
      rating: document.querySelector('.a-icon-star span')?.innerText?.trim() || '',
      reviewCount: document.querySelector('#acrCustomerReviewText')?.innerText?.trim() || '',
      reviews: extractReviews(),
      url: window.location.href
    };
  } else if (site === 'flipkart') {
    productData = {
      title: document.querySelector('.VU-ZEz, h1')?.innerText?.trim() || '',
      price: document.querySelector('._30jeq3')?.innerText?.trim() || '',
      description: document.querySelector('._4gvKMe')?.innerText?.trim() || '',
      rating: document.querySelector('._3LWZlK')?.innerText?.trim() || '',
      reviewCount: document.querySelector('._2_R_DZ span')?.innerText?.trim() || '',
      reviews: extractReviews(),
      url: window.location.href
    };
  }

  return productData;
}

// Extract sample reviews from page
function extractReviews() {
  let reviews = [];
  
  // Amazon reviews
  let reviewElements = document.querySelectorAll('[data-hook="review"]');
  
  // Flipkart reviews
  if (reviewElements.length === 0) {
    reviewElements = document.querySelectorAll('.t-ZTKy, ._6K-7Co');
  }
  
  reviewElements.forEach((el, idx) => {
    if (idx < 5) { // Get first 5 reviews
      const text = el.innerText?.trim() || '';
      if (text.length > 20) { // Filter out empty/short elements
        reviews.push(text);
      }
    }
  });
  
  return reviews.join('\n\n---\n\n');
}

// Inject floating badge on product page
function injectBadge(score, mode) {
  // Remove existing badge if any
  const existing = document.querySelector('#shopsmart-badge');
  if (existing) existing.remove();

  const badge = document.createElement('div');
  badge.id = 'shopsmart-badge';
  badge.className = 'shopsmart-floating-badge';
  
  let icon, label, color;
  
  if (mode === 'eco') {
    icon = '🌿';
    label = 'EcoScore';
    color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  } else {
    icon = '🛡️';
    label = 'Trust Score';
    color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  }
  
  badge.innerHTML = `
    <div style="background: white; border: 2px solid ${color}; border-radius: 12px; padding: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); cursor: pointer; min-width: 140px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 24px;">${icon}</span>
        <div>
          <div style="font-weight: bold; font-size: 12px; color: #666;">${label}</div>
          <div style="font-size: 20px; font-weight: bold; color: ${color};">${score}/100</div>
        </div>
      </div>
      <div style="font-size: 10px; color: #999; margin-top: 4px;">Click for details ↓</div>
    </div>
  `;

  badge.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    animation: slideIn 0.3s ease-out;
  `;

  badge.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openSidePanel' });
  });

  document.body.appendChild(badge);
}

// Initialize extension on product pages
function init() {
  const site = detectSite();
  if (site === 'unknown') return;

  const productData = extractProductData();
  
  if (productData.title) {
    currentProduct = productData;
    
    // Store product data for popup/sidepanel
    chrome.storage.local.set({ currentProduct: productData });
    
    // Show loading badge
    injectBadge('...', currentMode);
    
    // Request analysis from background script
    chrome.runtime.sendMessage(
      { action: 'analyzeProduct', data: productData, mode: currentMode },
      (response) => {
        if (response && response.success) {
          chrome.storage.local.set({ currentAnalysis: response.data });
          const score = response.mode === 'eco' ? response.data.score : response.data.trustScore;
          injectBadge(score, currentMode);
        }
      }
    );
  }
}

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-run on URL changes (for single-page apps)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(init, 1000);
  }
}).observe(document, { subtree: true, childList: true });
