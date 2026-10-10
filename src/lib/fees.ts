// Nepal secondary-market costs for equity trades (SEBON schedule; rates kept in one place so they are easy to update).
// Broker commission is a flat rate chosen by the trade amount's slab (applied to the whole amount, minimum Rs 10).

export const FEE_SCHEDULE_NOTE = "SEBON equity schedule; verify current rates with your broker.";

export const COMMISSION_SLABS: { upTo: number; rate: number }[] = [
  { upTo: 50_000, rate: 0.0036 },
  { upTo: 500_000, rate: 0.0033 },
  { upTo: 2_000_000, rate: 0.0031 },
  { upTo: 10_000_000, rate: 0.0027 },
  { upTo: Infinity, rate: 0.0024 },
];
export const MIN_COMMISSION = 10;
export const SEBON_RATE = 0.00015; // 0.015%
export const DP_CHARGE = 25; // per scrip, per settlement day
export const CGT_SHORT = 0.075; // held 365 days or less (individuals)
export const CGT_LONG = 0.05; // held more than 365 days (individuals)

const round2 = (n: number) => Math.round(n * 100) / 100;

export function commissionRate(amount: number): number {
  return COMMISSION_SLABS.find((s) => amount <= s.upTo)!.rate;
}

export function brokerCommission(amount: number): number {
  if (amount <= 0) return 0;
  return round2(Math.max(MIN_COMMISSION, amount * commissionRate(amount)));
}

export function sebonFee(amount: number): number {
  return amount <= 0 ? 0 : round2(amount * SEBON_RATE);
}

export interface BuyCost {
  amount: number;
  commission: number;
  sebon: number;
  dp: number;
  total: number;
  costPerShare: number;
}

export function buyCost(qty: number, price: number): BuyCost {
  const amount = round2(qty * price);
  const commission = brokerCommission(amount);
  const sebon = sebonFee(amount);
  const dp = qty > 0 ? DP_CHARGE : 0;
  const total = round2(amount + commission + sebon + dp);
  return { amount, commission, sebon, dp, total, costPerShare: qty > 0 ? total / qty : 0 };
}

export function cgtRate(holdingDays: number): number {
  return holdingDays > 365 ? CGT_LONG : CGT_SHORT;
}

export interface SellResult {
  amount: number;
  commission: number;
  sebon: number;
  dp: number;
  costBasis: number;
  profitBeforeTax: number;
  cgt: number;
  receivable: number;
  netProfit: number;
}

/** Sell `qty` shares at `price`, given a WACC (cost per share incl. buy fees) and holding days. CGT only on profit. */
export function sellResult(qty: number, price: number, wacc: number, holdingDays: number): SellResult {
  const amount = round2(qty * price);
  const commission = brokerCommission(amount);
  const sebon = sebonFee(amount);
  const dp = qty > 0 ? DP_CHARGE : 0;
  const costBasis = round2(qty * wacc);
  const profitBeforeTax = round2(amount - commission - sebon - dp - costBasis);
  const cgt = profitBeforeTax > 0 ? round2(profitBeforeTax * cgtRate(holdingDays)) : 0;
  const receivable = round2(amount - commission - sebon - dp - cgt);
  return { amount, commission, sebon, dp, costBasis, profitBeforeTax, cgt, receivable, netProfit: round2(profitBeforeTax - cgt) };
}

/** Price at which selling everything breaks even after all fees (no tax at break-even). */
export function breakEvenPrice(qty: number, wacc: number): number {
  if (qty <= 0) return 0;
  let lo = 0;
  let hi = wacc * 2 + 100;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (sellResult(qty, mid, wacc, 0).profitBeforeTax < 0) lo = mid;
    else hi = mid;
  }
  return round2(hi);
}
