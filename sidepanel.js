document.addEventListener('DOMContentLoaded', async () => {
  const { currentProduct, currentAnalysis, analysisMode } = await chrome.storage.local.get([
    'currentProduct',
    'currentAnalysis',
    'analysisMode'
  ]);

  if (currentAnalysis && currentProduct) {
    if (currentAnalysis.type === 'eco') {
      displayDetailedEcoAnalysis(currentAnalysis, currentProduct);
    } else if (currentAnalysis.type === 'trust') {
      displayDetailedTrustAnalysis(currentAnalysis, currentProduct);
    }
  }
});

function displayDetailedEcoAnalysis(data, product) {
  // Update score
  document.getElementById('big-score').textContent = data.score;
  document.getElementById('score-label').textContent = '🌿 EcoScore';
  document.getElementById('summary-text').textContent = data.summary || 'Sustainability analysis complete';

  // Color based on score
  const scoreEl = document.getElementById('big-score');
  if (data.score >= 80) {
    scoreEl.style.color = '#22c55e';
  } else if (data.score >= 60) {
    scoreEl.style.color = '#f59e0b';
  } else {
    scoreEl.style.color = '#ef4444';
  }

  // Detailed metrics
  const metricsContainer = document.getElementById('detailed-metrics');
  metricsContainer.innerHTML = '';

  if (data.materials) {
    metricsContainer.innerHTML += createMetricCard(
      'Materials',
      data.materials,
      data.score >= 70 ? 'good' : 'warning'
    );
  }

  if (data.certifications) {
    const certList = Array.isArray(data.certifications) ? 
      data.certifications.join(', ') : 
      'None verified';
    metricsContainer.innerHTML += createMetricCard(
      'Certifications',
      certList,
      data.certifications.length > 0 ? 'good' : 'warning'
    );
  }

  if (data.packaging) {
    metricsContainer.innerHTML += createMetricCard(
      'Packaging',
      data.packaging,
      'good'
    );
  }

  // Recommendations
  const recsContainer = document.getElementById('recommendations');
  if (data.score < 70) {
    recsContainer.innerHTML = `
      <p><strong>Consider these improvements:</strong></p>
      <ul>
        <li>Look for products with certified organic materials</li>
        <li>Check for Fair Trade or B-Corp certifications</li>
        <li>Choose items with minimal, recyclable packaging</li>
        <li>Research the brand's sustainability commitments</li>
      </ul>
    `;
  } else {
    recsContainer.innerHTML = `<p>✅ This product has strong sustainability credentials. Good choice!</p>`;
  }

  // Show impact section
  document.getElementById('impact-section').style.display = 'block';
}

function displayDetailedTrustAnalysis(data, product) {
  // Update score
  document.getElementById('big-score').textContent = data.trustScore;
  document.getElementById('score-label').textContent = '🛡️ Trust Score';
  document.getElementById('summary-text').textContent = data.verdict || 'Review analysis complete';

  // Color based on score
  const scoreEl = document.getElementById('big-score');
  if (data.trustScore >= 75) {
    scoreEl.style.color = '#22c55e';
  } else if (data.trustScore >= 50) {
    scoreEl.style.color = '#f59e0b';
  } else {
    scoreEl.style.color = '#ef4444';
  }

  // Detailed metrics
  const metricsContainer = document.getElementById('detailed-metrics');
  metricsContainer.innerHTML = '';

  // Fake review percentage
  metricsContainer.innerHTML += createMetricCard(
    'Estimated Fake Reviews',
    `Approximately ${data.fakePercentage}% of reviews may be fake or unreliable`,
    data.fakePercentage > 40 ? 'danger' : data.fakePercentage > 20 ? 'warning' : 'good'
  );

  // Red flags
  if (data.redFlags && data.redFlags.length > 0) {
    const flagsList = data.redFlags.map(flag => `<li>${flag}</li>`).join('');
    metricsContainer.innerHTML += createMetricCard(
      '🚨 Red Flags Detected',
      `<ul>${flagsList}</ul>`,
      'danger'
    );
  }

  // Genuine indicators
  if (data.genuineIndicators && data.genuineIndicators.length > 0) {
    const indicatorsList = data.genuineIndicators.map(ind => `<li>${ind}</li>`).join('');
    metricsContainer.innerHTML += createMetricCard(
      '✅ Positive Signs',
      `<ul>${indicatorsList}</ul>`,
      'good'
    );
  }

  // Recommendations
  const recsContainer = document.getElementById('recommendations');
  if (data.recommendation === 'buy') {
    recsContainer.innerHTML = `<p>✅ <strong>Safe to buy:</strong> Reviews appear mostly genuine with good verification.</p>`;
  } else if (data.recommendation === 'cautious') {
    recsContainer.innerHTML = `
      <p>⚠️ <strong>Proceed with caution:</strong></p>
      <ul>
        <li>Read detailed reviews carefully</li>
        <li>Check for verified purchase badges</li>
        <li>Look at negative reviews for genuine concerns</li>
        <li>Compare with similar products</li>
      </ul>
    `;
  } else {
    recsContainer.innerHTML = `
      <p>❌ <strong>Consider alternatives:</strong></p>
      <ul>
        <li>High risk of fake reviews detected</li>
        <li>Look for products with better review authenticity</li>
        <li>Check other retailers for the same product</li>
        <li>Research the brand independently</li>
      </ul>
    `;
  }

  // Hide impact section for trust mode
  document.getElementById('impact-section').style.display = 'none';
}

function createMetricCard(title, content, type = 'good') {
  const typeClass = type === 'danger' ? 'danger' : type === 'warning' ? 'warning' : '';
  
  return `
    <div class="metric-detail ${typeClass}">
      <h4>${title}</h4>
      <p>${content}</p>
    </div>
  `;
}
