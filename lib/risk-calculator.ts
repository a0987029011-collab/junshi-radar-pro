export interface RiskSettings {
  commissionRate: number;
  commissionDiscount: number;
  minimumCommission: number;
  stockTransactionTaxRate: number;
  maxLossPerTrade: number;
}

export interface PositionInput {
  shares: number;
  entryPrice: number;
  currentPrice: number;
  stopPrice: number;
  targetPrice: number;
}

export function commission(grossAmount: number, settings: RiskSettings) {
  return Math.max(
    settings.minimumCommission,
    grossAmount * settings.commissionRate * settings.commissionDiscount,
  );
}

export function estimatePosition(
  input: PositionInput,
  settings: RiskSettings,
) {
  const entryGross = input.entryPrice * input.shares;
  const entryFee = commission(entryGross, settings);
  const entryCost = entryGross + entryFee;
  const currentGross = input.currentPrice * input.shares;
  const currentExitFee = commission(currentGross, settings);
  const currentTax = currentGross * settings.stockTransactionTaxRate;
  const currentNetProceeds = currentGross - currentExitFee - currentTax;
  const unrealizedPnl = currentNetProceeds - entryCost;
  const stopGross = input.stopPrice * input.shares;
  const stopFee = commission(stopGross, settings);
  const stopTax = stopGross * settings.stockTransactionTaxRate;
  const stopNetProceeds = stopGross - stopFee - stopTax;
  const estimatedLossAtStop = Math.max(0, entryCost - stopNetProceeds);
  const targetGross = input.targetPrice * input.shares;
  const targetFee = commission(targetGross, settings);
  const targetTax = targetGross * settings.stockTransactionTaxRate;
  const targetNetProceeds = targetGross - targetFee - targetTax;
  const estimatedProfitAtTarget = targetNetProceeds - entryCost;

  return {
    entryGross,
    entryFee,
    entryCost,
    unrealizedPnl,
    unrealizedPnlPercent: (unrealizedPnl / entryCost) * 100,
    estimatedLossAtStop,
    estimatedProfitAtTarget,
    riskReward:
      estimatedLossAtStop > 0
        ? estimatedProfitAtTarget / estimatedLossAtStop
        : 0,
    remainingLossBudget: settings.maxLossPerTrade - estimatedLossAtStop,
    withinLossLimit: estimatedLossAtStop <= settings.maxLossPerTrade,
  };
}
