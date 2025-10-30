(() => {
    // ---------- Configuration Constants ----------
    // Token addresses and contract parameters
    const ORE_TOKEN_ADDRESS = 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp';
    const SOL_TOKEN_ADDRESS = 'So11111111111111111111111111111111111111112';
    
    // Economic parameters
    const REF_MULT = 0.9;              // Referral multiplier (90%)
    const ADMIN_FEE = 0.01;            // Admin fee (1%)
    const PROTOCOL_CUT = 0.10;         // Protocol cut (10%)
    const P_WIN = 1 / 25;              // Win probability (4%)
    const HIT_PROB = 1 / 625;          // Motherlode hit probability (0.16%)
    
    // Timing parameters
    const UPDATE_MS = 1000;            // EV calculation update interval (1 second)
    const RESET_DELAY_MS = 5000;       // Cooldown after round reset (5 seconds)
    const PRICE_UPDATE_MS = 15_000;    // Price fetch interval (15 seconds)
    const MIN_PRICE_UPDATE_MS = 5000;  // Minimum price update interval
    const MAX_PRICE_UPDATE_MS = 60000; // Maximum price update interval on rate limit
  
    // ---------- Dynamic State ----------
    // Price tracking (will be updated from DexScreener API)
    let PRICE_ORE_USD = 110;  // Default fallback: $110 per ORE
    let PRICE_SOL_USD = 200;  // Default fallback: $200 per SOL
    let priceOreSol = PRICE_ORE_USD / PRICE_SOL_USD;
    let lastPriceUpdate = 0;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;
  
    // Derived constants
    const ADMIN_COST_FACTOR = ADMIN_FEE / (1 - ADMIN_FEE);
    const C = 24 + (ADMIN_COST_FACTOR) / P_WIN;
  
    // Round state tracking
    let lastRoundNumber = null;
    let roundResetTime = null;
    let isInCooldown = false;
    let lastHighlightedEV = null;
  
    // ---------- Price Fetching ----------
    /**
     * Fetches the best trading pair for a token from DexScreener API
     * @param {string} tokenAddress - The token address to fetch price for
     * @param {string} tokenName - Human-readable token name for logging
     * @returns {number|null} - The price in USD or null if fetch failed
     */
    async function fetchTokenPrice(tokenAddress, tokenName) {
      try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data || !data.pairs || data.pairs.length === 0) {
          console.warn(`⚠️ No trading pairs found for ${tokenName}`);
          return null;
        }
        
        // Find the most liquid pair (highest 24h volume)
        const bestPair = data.pairs.reduce((best, pair) => {
          const volume = parseFloat(pair.volume?.h24 || 0);
          const bestVolume = parseFloat(best.volume?.h24 || 0);
          return volume > bestVolume ? pair : best;
        });
        
        const price = parseFloat(bestPair.priceUsd);
        
        if (!price || price <= 0 || !isFinite(price)) {
          console.warn(`⚠️ Invalid price for ${tokenName}: ${price}`);
          return null;
        }
        
        console.log(`✅ ${tokenName} price updated: $${price.toFixed(2)} (Vol: $${parseFloat(bestPair.volume?.h24 || 0).toFixed(0)})`);
        return price;
        
      } catch (error) {
        if (error.name === 'TimeoutError') {
          console.warn(`⏱️ Timeout fetching ${tokenName} price`);
        } else {
          console.error(`❌ Error fetching ${tokenName} price:`, error.message);
        }
        return null;
      }
    }
    
    /**
     * Updates both ORE and SOL prices from DexScreener API
     * Implements exponential backoff on failures and rate limiting
     */
    async function updatePrices() {
      const now = Date.now();
      
      // Prevent too frequent updates
      if (now - lastPriceUpdate < MIN_PRICE_UPDATE_MS) {
        return;
      }
      
      try {
        // Fetch both prices in parallel
        const [orePrice, solPrice] = await Promise.all([
          fetchTokenPrice(ORE_TOKEN_ADDRESS, 'ORE'),
          fetchTokenPrice(SOL_TOKEN_ADDRESS, 'SOL')
        ]);
        
        // Update prices if valid
        let updated = false;
        
        if (orePrice !== null) {
          PRICE_ORE_USD = orePrice;
          updated = true;
        }
        
        if (solPrice !== null) {
          PRICE_SOL_USD = solPrice;
          updated = true;
        }
        
        if (updated) {
          // Update derived price ratio
          priceOreSol = PRICE_ORE_USD / PRICE_SOL_USD;
          console.log(`📊 ORE/SOL ratio: ${priceOreSol.toFixed(6)}`);
          consecutiveFailures = 0;
          lastPriceUpdate = now;
        } else {
          consecutiveFailures++;
          console.log(`ℹ️ Using cached prices: ORE=$${PRICE_ORE_USD.toFixed(2)}, SOL=$${PRICE_SOL_USD.toFixed(2)}`);
        }
        
        // Implement exponential backoff on consecutive failures
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          const backoffInterval = Math.min(PRICE_UPDATE_MS * Math.pow(2, consecutiveFailures - MAX_CONSECUTIVE_FAILURES), MAX_PRICE_UPDATE_MS);
          console.warn(`⚠️ ${consecutiveFailures} consecutive failures, backing off to ${backoffInterval/1000}s intervals`);
          
          clearInterval(window.__orePriceInterval);
          window.__orePriceInterval = setInterval(updatePrices, backoffInterval);
        }
        
      } catch (error) {
        consecutiveFailures++;
        console.error('❌ Unexpected error in updatePrices:', error);
        console.log(`ℹ️ Using cached prices: ORE=$${PRICE_ORE_USD.toFixed(2)}, SOL=$${PRICE_SOL_USD.toFixed(2)}`);
      }
    }
  
    // ---------- DOM Helpers ----------
    /**
     * Selects the 25 block buttons from the mining grid
     * @returns {Array<HTMLElement>} Array of button elements
     */
    function selectGridButtons() {
      const grids = Array.from(document.querySelectorAll('div.grid.grid-cols-5'));
      for (const g of grids) {
        const btns = g.querySelectorAll(':scope > button');
        if (btns.length === 25) return Array.from(btns);
      }
      return [];
    }
  
    /**
     * Parses the current round number from the page
     * @returns {number|null} Round number or null if not found
     */
    function parseRoundNumber() {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const text = btn.textContent || '';
        const match = text.match(/Round\s*#([\d,]+)/i);
        if (match) {
          const roundNum = parseInt(match[1].replace(/,/g, ''), 10);
          return isNaN(roundNum) ? null : roundNum;
        }
      }
      return null;
    }
  
    /**
     * Extracts the block number from a button element
     * @param {HTMLElement} btn - The button element
     * @returns {number|null} Block number or null if not found
     */
    function parseBlockNumber(btn) {
      const text = btn.textContent || '';
      const match = text.match(/#(\d+)/);
      if (!match) return null;
      const blockNum = parseInt(match[1], 10);
      return isNaN(blockNum) ? null : blockNum;
    }
  
    /**
     * Extracts the SOL amount from a block button
     * @param {HTMLElement} btn - The button element
     * @returns {number} SOL amount (0 if not found or invalid)
     */
    function parseBlockSOL(btn) {
      // First, try to find SOL value in span elements (more reliable)
      const spans = Array.from(btn.querySelectorAll('span'));
      for (let i = spans.length - 1; i >= 0; i--) {
        const raw = (spans[i].textContent || '').trim().replace(/,/g, '');
        if (/^\d+(\.\d+)?$/.test(raw) && raw.includes('.')) {
          const v = parseFloat(raw);
          if (!isNaN(v) && isFinite(v) && v >= 0) return v;
        }
      }
      
      // Fallback: search entire button text
      const text = (btn.textContent || '').replace(/\s+/g, ' ').trim().replace(/,/g, '');
      const matches = text.match(/\d+\.\d+/g);
      if (matches && matches.length) {
        const v = parseFloat(matches[matches.length - 1]);
        if (!isNaN(v) && isFinite(v) && v >= 0) return v;
      }
      
      return 0;
    }
  
    /**
     * Parses the motherlode ORE amount from the page
     * @returns {number|null} Motherlode ORE amount or null if not found
     */
    function parseMotherlodeORE() {
      const buttons = Array.from(document.querySelectorAll('button'));
      const mBtn = buttons.find(b => ((b.textContent || '').toLowerCase().includes('motherlode')));
      if (!mBtn) return null;
  
      const txt = (mBtn.textContent || '').replace(/,/g, '');
      
      // Try to match decimal number directly
      const dec = txt.match(/\d+\.\d+/);
      if (dec) {
        const value = parseFloat(dec[0]);
        return (isNaN(value) || !isFinite(value)) ? null : value;
      }
  
      // Try to reconstruct number from parts
      const parts = Array.from(txt.matchAll(/(\d+\.\d+)|(\.\d+)|(\d+)/g)).map(m => m[0]);
      for (let i = 0; i < parts.length; i++) {
        if (/^\d+$/.test(parts[i]) && i + 1 < parts.length && /^\.\d+$/.test(parts[i + 1])) {
          const value = parseFloat(parts[i] + parts[i + 1]);
          return (isNaN(value) || !isFinite(value)) ? null : value;
        }
      }
      
      // Last resort: use first integer found
      for (const p of parts) {
        if (/^\d+$/.test(p)) {
          const value = parseFloat(p);
          return (isNaN(value) || !isFinite(value)) ? null : value;
        }
      }
      
      return null;
    }
  
    /**
     * Formats a SOL value for display with appropriate precision
     * Uses subscript notation for very small values
     * @param {number} x - The value to format
     * @returns {string} Formatted string (e.g., "+0.1234", "+0.0₃1234")
     */
    function formatSol(x) {
      if (!isFinite(x)) return '+0.0000';
      
      const abs = Math.abs(x);
      const sign = x >= 0 ? '+' : '-';
      
      if (abs === 0) return '+0.0000';
      
      // For very small values, use subscript notation (e.g., 0.0001234 → 0.0₃1234)
      if (abs < 0.01) {
        const str = abs.toFixed(10);
        const afterDecimal = str.split('.')[1];
        let leadingZeros = 0;
        
        for (let i = 0; i < afterDecimal.length; i++) {
          if (afterDecimal[i] === '0') {
            leadingZeros++;
          } else {
            break;
          }
        }
        
        if (leadingZeros >= 2) {
          const significantPart = afterDecimal.substring(leadingZeros);
          const truncated = significantPart.substring(0, 4);
          
          const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
          const subscriptNum = leadingZeros.toString().split('').map(d => subscripts[parseInt(d)]).join('');
          
          return `${sign}0.0${subscriptNum}${truncated}`;
        }
      }
      
      // Standard decimal notation with adaptive precision
      if (abs < 0.1) {
        return sign + abs.toFixed(5);
      } else if (abs < 1) {
        return sign + abs.toFixed(4);
      } else {
        return sign + abs.toFixed(3);
      }
    }
  
    /**
     * Removes all EV overlays and highlighting from the grid
     */
    function clearOldHighlights() {
      // Remove all overlay elements
      document.querySelectorAll('.ore-ev-overlay').forEach(el => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
    
      // Reset button styles in the grid
      const allButtons = selectGridButtons();
      allButtons.forEach(btn => {
        btn.classList.remove('ore-ev-highlighted');
        btn.style.position = '';
        btn.style.boxShadow = '';
        btn.style.borderColor = '';
        btn.style.border = '';
        btn.style.outline = '';
      });
    
      // Cleanup any stray highlighted elements
      document.querySelectorAll('.ore-ev-highlighted').forEach(el => {
        el.classList.remove('ore-ev-highlighted');
        el.style.position = '';
        el.style.boxShadow = '';
        el.style.borderColor = '';
        el.style.border = '';
        el.style.outline = '';
      });
    
      lastHighlightedEV = null;
    }
    
    /**
     * Displays an EV overlay on a block button
     * @param {HTMLElement} btn - The button element
     * @param {number} evValue - The expected value in SOL
     * @param {boolean} isHighest - Whether this is the highest EV block
     */
    function showEV(btn, evValue, isHighest) {
      // Ensure button can have positioned children
      if (getComputedStyle(btn).position === 'static') {
        btn.style.position = 'relative';
      }
    
      // Highlight the best block with green glow
      if (isHighest) {
        btn.classList.add('ore-ev-highlighted');
        btn.style.boxShadow = '0 0 0 3px rgba(0,255,0,0.95) inset, 0 0 10px rgba(0,255,0,0.5)';
        btn.style.borderColor = 'rgba(0,255,0,0.95)';
      }
    
      // Create overlay element
      let overlay = document.createElement('div');
      overlay.className = 'ore-ev-overlay';
      
      // Color coding based on EV value
      let textColor, fontWeight;
      if (isHighest && evValue > 0) {
        textColor = '#2dff2d';  // Bright green for best positive EV
        fontWeight = '700';
      } else if (evValue < 0) {
        textColor = '#ff6b6b';  // Red for negative EV
        fontWeight = '600';
      } else if (evValue < 0.0001) {
        textColor = '#888888';  // Gray for near-zero EV
        fontWeight = '500';
      } else {
        textColor = '#cccccc';  // Light gray for small positive EV
        fontWeight = '600';
      }
      
      const bgOpacity = isHighest ? '0.90' : '0.80';
      
      // Apply styling
      overlay.style.cssText = `
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        pointer-events: none;
        padding: 2px 5px;
        background: rgba(0,0,0,${bgOpacity});
        color: ${textColor};
        font-weight: ${fontWeight};
        text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        border-radius: 3px;
        font-size: 0.75em;
        white-space: nowrap;
        z-index: 1000;
        line-height: 1.2;
      `;
      overlay.textContent = `${formatSol(evValue)}`;
      btn.appendChild(overlay);
    }
  
    /**
     * Computes the optimal bet size (y*) and Expected Value for a given block
     * Uses iterative refinement to account for player's contribution to pool
     * @param {number} O - Current SOL in the block
     * @param {number} T - Total SOL across all blocks
     * @param {number} oreValueInSOL - Expected ORE reward value in SOL
     * @returns {{y: number, EV: number}} Optimal bet size and expected value
     */
    function computeEVStarForBlock(O, T, oreValueInSOL) {
      // Validate inputs
      if (!isFinite(O) || O <= 0) return { y: 0, EV: -Infinity };
      if (!isFinite(T) || T <= 0) return { y: 0, EV: -Infinity };
      if (!isFinite(oreValueInSOL) || oreValueInSOL <= 0) return { y: 0, EV: -Infinity };
    
      // Calculate initial pool value (after protocol cut)
      const V_initial = (1 - PROTOCOL_CUT) * (T - O) + oreValueInSOL;
      if (V_initial <= 0) return { y: 0, EV: -Infinity };
    
      // Initial optimal bet estimate (before considering own contribution)
      let yStar = Math.sqrt((oreValueInSOL * O) / C);
      let V = V_initial;
      
      // Iteratively refine to account for player's bet reducing available pool
      // Typically converges in 2-3 iterations
      for (let i = 0; i < 3; i++) {
        V = (1 - PROTOCOL_CUT) * (T - O - yStar) + oreValueInSOL;
        if (V <= 0) break;
        yStar = Math.max(0, Math.sqrt((V * O) / C) - O);
      }
      
      // No profitable bet if optimal bet is zero or negative
      if (yStar <= 0) return { y: 0, EV: 0 };
    
      // Calculate expected value components
      const f = yStar / (O + yStar);  // Win probability factor
      const adminCost = ADMIN_COST_FACTOR * yStar;  // Admin fee cost
      const EV = P_WIN * (-24 * yStar + V * f) - adminCost;
      
      return { y: yStar, EV };
    }
  
    /**
     * Main update loop - calculates and displays EV for all blocks
     * Handles round resets and cooldown periods
     */
    function tick() {
      try {
        // Get all block buttons from the grid
        const btns = selectGridButtons();
        if (btns.length !== 25) {
          clearOldHighlights();
          return;
        }
    
        // Check for round changes
        const currentRoundNumber = parseRoundNumber();
    
        // Detect round reset
        if (lastRoundNumber !== null && currentRoundNumber !== null) {
          if (currentRoundNumber !== lastRoundNumber) {
            console.log(`🔄 Round reset detected! Round #${lastRoundNumber} → #${currentRoundNumber}`);
            clearOldHighlights();
            roundResetTime = Date.now();
            isInCooldown = true;
            lastRoundNumber = currentRoundNumber;
            return;
          }
        }
    
        // Update tracked round number
        if (currentRoundNumber !== null) {
          lastRoundNumber = currentRoundNumber;
        }
    
        // Handle cooldown period after round reset
        if (isInCooldown) {
          const elapsed = Date.now() - roundResetTime;
          if (elapsed < RESET_DELAY_MS) {
            clearOldHighlights();
            return;
          } else {
            isInCooldown = false;
            console.log(`✅ Cooldown complete for Round #${currentRoundNumber}. EV calculations resumed.`);
          }
        }
    
        // Parse block data
        const blocks = btns.map(btn => ({
          btn,
          blockNum: parseBlockNumber(btn),
          O: parseBlockSOL(btn)
        }));
    
        // Calculate total SOL across all blocks
        const T = blocks.reduce((acc, b) => acc + (isFinite(b.O) && b.O > 0 ? b.O : 0), 0);
    
        // Skip if total pool is too small
        if (T < 0.1) {
          clearOldHighlights();
          return;
        }
    
        // Calculate expected ORE value including motherlode
        const M = parseMotherlodeORE();
        const expectedMotherlodeOREThisRound = (M != null && isFinite(M)) ? (M * HIT_PROB) : (0.2 * HIT_PROB);
        const oreValueInSOL = priceOreSol * REF_MULT * (1 + expectedMotherlodeOREThisRound);
    
        // Clear old displays
        clearOldHighlights();
    
        // Calculate EV for each block
        let best = null;
        const validBlocks = [];
        
        for (const b of blocks) {
          if (!isFinite(b.O) || b.O <= 0) continue;
    
          const { y, EV } = computeEVStarForBlock(b.O, T, oreValueInSOL);
          b.y = y;
          b.EV = EV;
          
          if (isFinite(EV)) {
            validBlocks.push(b);
            if (!best || EV > best.EV) {
              best = b;
            }
          }
        }
    
        // Display EV overlays
        for (const b of validBlocks) {
          const isHighest = (best && b === best && b.EV > 0);
          showEV(b.btn, b.EV, isHighest);
        }
    
      } catch (e) {
        console.error('❌ EV calculator error:', e);
      }
    }
  
    // ---------- Initialization ----------
    
    /**
     * Stops all running intervals and cleans up the display
     */
    window.oreEvStop = () => {
      if (window.__oreEvInterval) {
        clearInterval(window.__oreEvInterval);
        window.__oreEvInterval = null;
      }
      if (window.__orePriceInterval) {
        clearInterval(window.__orePriceInterval);
        window.__orePriceInterval = null;
      }
      clearOldHighlights();
      console.log('✅ ORE EV calculator stopped.');
    };
    
    // Clean up any existing intervals before starting
    if (window.__oreEvInterval) clearInterval(window.__oreEvInterval);
    if (window.__orePriceInterval) clearInterval(window.__orePriceInterval);
    
    // Start price updates immediately, then periodically
    updatePrices();
    window.__orePriceInterval = setInterval(updatePrices, PRICE_UPDATE_MS);
  
    // Start EV calculations
    window.__oreEvInterval = setInterval(tick, UPDATE_MS);
  
    // Initial display update
    clearOldHighlights();
    tick();
  
    // Startup messages
    console.log('🚀 ORE EV Calculator v2.0 - Enhanced Edition');
    console.log('📊 Live prices from DexScreener API (updates every 15s)');
    console.log('💰 Current prices: ORE=$' + PRICE_ORE_USD.toFixed(2) + ', SOL=$' + PRICE_SOL_USD.toFixed(2));
    console.log('⚙️ Configuration: REF=' + (REF_MULT*100) + '%, ADMIN=' + (ADMIN_FEE*100) + '%, PROTOCOL=' + (PROTOCOL_CUT*100) + '%');
    console.log('🛑 To stop: call oreEvStop()');
  })();