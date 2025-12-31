// lib/roundOff.js

export function calculateRoundOff(amount, config) {
  if (!config?.round_off_enabled) {
    return { roundedAmount: amount, roundOffDifference: 0 };
  }

  if (config.round_off_mode === 'automatic') {
    const factor = Number(config.round_off_auto_factor || 1.0);
    const roundedAmount = Math.round(amount / factor) * factor;
    const roundOffDifference = roundedAmount - amount;
    return { roundedAmount, roundOffDifference };
  }

  // Manual mode doesn't pre-calculate a rounded amount, 
  // but we return the original for components to handle manual input within limits.
  return { roundedAmount: amount, roundOffDifference: 0 };
}
