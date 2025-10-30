# ORE EV Calculator

A sophisticated browser console script that calculates and displays Expected Value (EV) for ORE mining blocks in real-time, helping you make optimal mining decisions on ore.supply.

## What It Does

- **Fetches live prices** for ORE and SOL tokens from DexScreener API (updates every 15 seconds)
- **Calculates optimal EV** for each block based on current pool state using advanced mathematical modeling
- **Highlights the best block** with a green glow and displays EV overlays with color-coded indicators
- **Auto-resets** when a new round starts (5-second cooldown to prevent stale data)
- **Smart rate limiting** with exponential backoff to respect API limits
- **Robust error handling** to ensure continuous operation even during API issues

## How to Use

1. **Go to https://ore.supply/**
2. **Open Developer Console**:
   - Chrome/Edge: Press `F12` or `Ctrl+Shift+J` (Windows/Linux) / `Cmd+Option+J` (Mac)
   - Firefox: Press `F12` or `Ctrl+Shift+K` (Windows/Linux) / `Cmd+Option+K` (Mac)
3. **Copy the entire contents** of `ore.js`
4. **Paste into the console** and press Enter
5. **Watch the magic happen** - EV values will appear on each block, with the best option highlighted in green

## Understanding the Display

- **Green highlight** = Best EV block (positive expected value)
- **Green text** = Highest EV value
- **Red text** = Negative EV (not recommended)
- **Gray text** = Near-zero or very small EV
- **Format**: Values shown as `+X.XXXX` or `-X.XXXX` SOL

For very small values, subscript notation is used (e.g., `+0.0₃1234` means 0.0001234).

## Stopping the Script

To stop the calculator, run this in the console:
```javascript
oreEvStop()
```

## Configuration

Key parameters (defined at top of `ore.js`):

**Economic Parameters:**
- `REF_MULT`: 0.9 (90% referral multiplier)
- `ADMIN_FEE`: 0.01 (1% admin fee)
- `PROTOCOL_CUT`: 0.10 (10% protocol cut)
- `P_WIN`: 1/25 (4% win probability)
- `HIT_PROB`: 1/625 (0.16% motherlode hit probability)

**Timing Parameters:**
- `UPDATE_MS`: 1000 (EV calculations update every second)
- `RESET_DELAY_MS`: 5000 (5-second cooldown after round reset)
- `PRICE_UPDATE_MS`: 15000 (price updates every 15 seconds)

## Features

### Intelligent Price Fetching
- Parallel API requests for ORE and SOL prices
- Selects most liquid trading pairs (highest 24h volume)
- Automatic fallback to cached prices on API failure
- Exponential backoff on consecutive failures
- 10-second timeout protection per request

### Advanced EV Calculation
- Iterative refinement algorithm accounting for player's bet impact on pool
- Considers motherlode probability and expected value
- Handles edge cases (zero pools, invalid data, etc.)
- Validates all numeric inputs for safety

### Visual Feedback
- **Green highlight + glow**: Best EV block (positive expected value)
- **Bright green text**: Highest EV value
- **Red text**: Negative EV (not recommended)
- **Gray text**: Near-zero or very small EV
- **Light gray text**: Small positive EV
- **Subscript notation**: For very small values (e.g., `+0.0₃1234` = 0.0001234)

### Robust Error Handling
- Comprehensive input validation
- Graceful degradation on API failures
- Round reset detection with automatic cooldown
- Console logging for debugging and monitoring

## Technical Details

### How EV is Calculated

The calculator uses an optimal betting strategy based on:
1. Current SOL in each block (O)
2. Total SOL across all blocks (T)
3. Expected ORE reward value in SOL
4. Protocol economics (fees, cuts, multipliers)

The algorithm iteratively solves for the optimal bet size (y*) that maximizes expected value while accounting for the player's contribution to the pool.

### Price Data Source

Prices are fetched from [DexScreener](https://dexscreener.com/) API:
- **ORE Token**: `oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp`
- **SOL Token**: `So11111111111111111111111111111111111111112`

The script selects the most liquid trading pair (highest 24h volume) to ensure accurate pricing.

## Notes

- Prices fallback to ORE=$110, SOL=$200 if API is unavailable
- Script automatically handles round resets with a 5-second cooldown
- EV calculations update every second for real-time feedback
- Advanced rate limiting with exponential backoff protects against API throttling
- All calculations validated for numerical stability and edge cases
- Optimized for performance with minimal DOM manipulation

## Troubleshooting

**Issue: No EV values displayed**
- Check that you're on the ore.supply website
- Ensure the grid with 25 blocks is visible
- Check browser console for error messages

**Issue: Prices not updating**
- Check your internet connection
- DexScreener API may be experiencing issues
- Script will use cached prices automatically

**Issue: Script seems frozen**
- Check if you're in a round reset cooldown (5 seconds)
- Try stopping with `oreEvStop()` and re-running the script

## Version History

**v2.0 - Enhanced Edition**
- Improved error handling and input validation
- Enhanced price fetching with parallel requests
- Better rate limiting and exponential backoff
- Comprehensive code documentation
- Optimized performance and stability