// ShopSmart AI - Background Service Worker
// Handles dual-mode AI analysis: EcoScore + Trust Score with CACHING

chrome.runtime.onInstalled.addListener(() => {
  console.log('ShopSmart AI installed successfully');
  chrome.storage.local.set({ analysisMode: 'eco' });
  checkAIAvailability();
});

// Check if Chrome AI APIs are available
async function checkAIAvailability() {
  const status = {
    promptAPI: false,
    summarizerAPI: false,
    writerAPI: false,
    rewriterAPI: false
  };

  try {
    if (window.ai && window.ai.languageModel) {
      const availability = await window.ai.languageModel.capabilities();
      status.promptAPI = availability.available === 'readily';
    }
    if (window.ai && window.ai.summarizer) {
      const availability = await window.ai.summarizer.capabilities();
      status.summarizerAPI = availability.available === 'readily';
    }
    if (window.ai && window.ai.writer) {
      const availability = await window.ai.writer.capabilities();
      status.writerAPI = availability.available === 'readily';
    }
    if (window.ai && window.ai.rewriter) {
      const availability = await window.ai.rewriter.capabilities();
      status.rewriterAPI = availability.available === 'readily';
    }

    console.log('AI APIs Status:', status);
    chrome.storage.local.set({ aiStatus: status });
  } catch (error) {
    console.log('AI APIs not yet available:', error);
    chrome.storage.local.set({ aiStatus: status });
  }
}

// Listen for messages from content/popup scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeProduct') {
    const { mode, data } = request;
    
    // Create unique cache key for this product+mode
    const cacheKey = `analysis_${mode}_${hashString(data.url)}`;
    
    // Check if we have cached analysis
    chrome.storage.local.get([cacheKey], (cached) => {
      if (cached[cacheKey]) {
        console.log('Using cached analysis for', mode);
        sendResponse({ success: true, data: cached[cacheKey], mode: mode, cached: true });
      } else {
        // No cache, perform new analysis
        if (mode === 'eco') {
          analyzeEcoScore(data)
            .then(result => {
              chrome.storage.local.set({ [cacheKey]: result });
              sendResponse({ success: true, data: result, mode: 'eco' });
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        } else if (mode === 'trust') {
          analyzeTrustScore(data)
            .then(result => {
              chrome.storage.local.set({ [cacheKey]: result });
              sendResponse({ success: true, data: result, mode: 'trust' });
            })
            .catch(error => sendResponse({ success: false, error: error.message }));
        }
      }
    });
    
    return true; // Keep channel open for async response
  }
});

// Simple hash function for creating cache keys
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// ============== ECO SCORE ANALYSIS ==============
async function analyzeEcoScore(productData) {
  try {
    const { aiStatus } = await chrome.storage.local.get('aiStatus');
    
    if (!aiStatus?.promptAPI) {
      return getMockEcoAnalysis(productData);
    }

    let description = productData.description;
    if (aiStatus.summarizerAPI && description.length > 500) {
      try {
        const summarizer = await window.ai.summarizer.create({
          type: 'key-points',
          length: 'short'
        });
        description = await summarizer.summarize(description);
        await summarizer.destroy();
      } catch (e) {
        console.log('Summarizer not available');
      }
    }

    const session = await window.ai.languageModel.create({
      systemPrompt: `You are an expert sustainability analyst for e-commerce products.

Analyze products based on:
- Materials: Natural/organic/recycled vs synthetic/petroleum-based
- Certifications: GOTS, Fair Trade, B-Corp, USDA Organic, FSC
- Packaging: Minimal, recyclable, biodegradable, plastic-free
- Brand ethics: Carbon neutral, supply chain transparency

Return ONLY valid JSON:
{
  "score": <number 0-100>,
  "category": "excellent|good|fair|poor",
  "materials": "<brief material assessment>",
  "certifications": ["<list of certs found or 'None verified'>"],
  "packaging": "<packaging assessment>",
  "concerns": "<main sustainability concerns>",
  "summary": "<1-2 sentence overall assessment>"
}`
    });

    const prompt = `Analyze this product for sustainability:

Title: ${productData.title}
Description: ${description}
Price: ${productData.price}

Return JSON only.`;

    const result = await session.prompt(prompt);
    await session.destroy();
    
    let analysis;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (e) {
      console.error('Failed to parse AI response');
      return getMockEcoAnalysis(productData);
    }
    
    analysis.type = 'eco';
    return analysis;

  } catch (error) {
    console.error('Eco analysis error:', error);
    return getMockEcoAnalysis(productData);
  }
}

// ============== TRUST SCORE ANALYSIS ==============
async function analyzeTrustScore(productData) {
  try {
    const { aiStatus } = await chrome.storage.local.get('aiStatus');
    
    if (!aiStatus?.promptAPI) {
      return getMockTrustAnalysis(productData);
    }

    const session = await window.ai.languageModel.create({
      systemPrompt: `You are an expert in detecting fake product reviews and analyzing review authenticity.

Red flags to detect:
- Generic language: "amazing", "best ever", "highly recommend" without specifics
- Overly positive/negative without balanced details
- Similar phrasing patterns across multiple reviews
- Suspiciously timed review clusters
- Low verified purchase ratio
- Short, vague reviews
- Excessive use of brand name

Genuine indicators:
- Specific product details mentioned
- Balanced pros and cons
- Verified purchase badges
- Detailed usage experiences
- Photos/videos from buyers
- Normal rating distribution

Return ONLY valid JSON:
{
  "trustScore": <number 0-100>,
  "category": "highly_trusted|trusted|questionable|suspicious",
  "fakePercentage": <estimated % of fake reviews 0-100>,
  "redFlags": ["<list of concerns found>"],
  "genuineIndicators": ["<list of positive signs>"],
  "verdict": "<brief trust assessment>",
  "recommendation": "buy|cautious|avoid"
}`
    });

    const prompt = `Analyze review authenticity for this product:

Product: ${productData.title}
Rating: ${productData.rating || 'N/A'}
Review Count: ${productData.reviewCount || 'N/A'}

Sample Reviews:
${productData.reviews || 'Limited review data available'}

Return JSON only.`;

    const result = await session.prompt(prompt);
    await session.destroy();
    
    let analysis;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (e) {
      console.error('Failed to parse AI response');
      return getMockTrustAnalysis(productData);
    }
    
    analysis.type = 'trust';
    return analysis;

  } catch (error) {
    console.error('Trust analysis error:', error);
    return getMockTrustAnalysis(productData);
  }
}

// ============== MOCK DATA GENERATORS (DETERMINISTIC) ==============
function getMockEcoAnalysis(productData) {
  // Generate deterministic score based on product title hash
  const score = generateDeterministicScore(productData.title, 50, 90);
  
  return {
    type: 'eco',
    score: score,
    category: score >= 80 ? 'excellent' : score >= 65 ? 'good' : score >= 50 ? 'fair' : 'poor',
    materials: score > 70 ? "Contains organic cotton and recycled materials" : "Synthetic materials with limited sustainability data",
    certifications: score > 70 ? ["GOTS Certified", "Fair Trade", "OEKO-TEX"] : ["No verified certifications found"],
    packaging: score > 60 ? "80% recyclable, minimal plastic" : "Excessive packaging with plastic components",
    concerns: score < 70 ? "Synthetic materials, limited brand transparency" : "Minor packaging improvements possible",
    summary: `Sustainability score: ${score}/100. ${score > 75 ? 'Strong eco-credentials with verified certifications.' : score > 60 ? 'Moderate sustainability with room for improvement.' : 'Limited sustainability information available.'}`,
    usingMockData: true
  };
}

function getMockTrustAnalysis(productData) {
  // Generate deterministic score based on product title hash
  const trustScore = generateDeterministicScore(productData.title, 40, 90);
  const fakePercentage = Math.floor((100 - trustScore) * 0.6);
  
  const redFlags = trustScore < 60 ? 
    [
      "Multiple reviews use generic language",
      "Suspiciously high 5-star ratio",
      "Review timing shows unusual clusters",
      "Limited verified purchases"
    ] : 
    ["Some reviews lack specific details"];
    
  const genuineIndicators = trustScore >= 60 ?
    [
      "Multiple verified purchases present",
      "Detailed product descriptions in reviews",
      "Balanced rating distribution",
      "Reviews include specific use cases"
    ] :
    [
      "Some verified purchases present",
      "Few detailed reviews found"
    ];
  
  return {
    type: 'trust',
    trustScore: trustScore,
    category: trustScore >= 80 ? 'highly_trusted' : 
              trustScore >= 60 ? 'trusted' : 
              trustScore >= 40 ? 'questionable' : 'suspicious',
    fakePercentage: fakePercentage,
    redFlags: redFlags,
    genuineIndicators: genuineIndicators,
    verdict: trustScore >= 75 ? 
      "Reviews appear mostly genuine with good verification" : 
      trustScore >= 55 ?
      "Mixed signals detected - proceed with caution" :
      "High risk of fake reviews - consider alternatives",
    recommendation: trustScore >= 70 ? 'buy' : trustScore >= 50 ? 'cautious' : 'avoid',
    usingMockData: true
  };
}

// Generate consistent score from string (deterministic hash-based)
function generateDeterministicScore(text, min, max) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash = hash & hash;
  }
  // Normalize to range [min, max]
  const normalized = Math.abs(hash) % (max - min + 1);
  return min + normalized;
}
