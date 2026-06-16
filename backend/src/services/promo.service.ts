// Simple promo-code engine (no DB entity needed for the assignment).
interface Promo {
  type: 'pct' | 'flat';
  value: number;
  max?: number;
  label: string;
}

const PROMOS: Record<string, Promo> = {
  WELCOME10: { type: 'pct', value: 10, label: '10% off' },
  CINE20: { type: 'pct', value: 20, max: 100, label: '20% off (max ₹100)' },
  FLAT50: { type: 'flat', value: 50, label: '₹50 off' },
  WEEKEND15: { type: 'pct', value: 15, max: 150, label: '15% off (max ₹150)' },
};

export interface PromoResult {
  valid: boolean;
  code?: string;
  discount: number;
  finalAmount: number;
  message: string;
}

export function applyPromo(code: string, subtotal: number): PromoResult {
  const key = code.trim().toUpperCase();
  const p = PROMOS[key];
  if (!p) {
    return { valid: false, discount: 0, finalAmount: subtotal, message: `Promo code "${code}" is not valid` };
  }
  let discount = p.type === 'pct' ? Math.round((subtotal * p.value) / 100) : p.value;
  if (p.max) discount = Math.min(discount, p.max);
  discount = Math.min(discount, subtotal);
  return {
    valid: true,
    code: key,
    discount,
    finalAmount: subtotal - discount,
    message: `Applied ${p.label}: −₹${discount} (₹${subtotal} → ₹${subtotal - discount})`,
  };
}

export function listPromos() {
  return Object.entries(PROMOS).map(([code, p]) => ({ code, description: p.label }));
}
