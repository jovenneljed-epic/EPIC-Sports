// src/utils/tierLimits.ts

export const TIER_PRICES = {
  basic: { name: 'Basic Tier', price: 199, limit: 10 },
  essential: { name: 'Essential Tier', price: 299, limit: 30 },
  pro: { name: 'Pro Tier', price: 399, limit: Infinity },
};

export function checkCanFinalizeMatch(currentTier: string, completedCount: number): boolean {
  const limits: Record<string, number> = {
    free: 5,
    basic: 10,
    essential: 30,
    pro: Infinity,
  };

  const maxAllowed = limits[currentTier] ?? 5;
  return completedCount < maxAllowed;
}