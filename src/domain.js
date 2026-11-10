export const CART_KEY = 'qcone.cart.v1';
export const LEGAL_VERSION = '2026-11-10';
export const PAYMENT_LABELS = { pix_on_delivery: 'Pix na entrega', cash: 'Dinheiro', card_on_delivery: 'Cartão na entrega' };
export const STATUS_LABELS = { pending: 'Aguardando confirmação', confirmed: 'Confirmado', preparing: 'Em preparo', out_for_delivery: 'Saiu para entrega', delivered: 'Entregue', cancelled: 'Cancelado' };
export const TRANSITIONS = { pending: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['out_for_delivery', 'cancelled'], out_for_delivery: ['delivered', 'cancelled'], delivered: [], cancelled: [] };
export const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents) / 100);
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const normalizePhone = value => String(value ?? '').replace(/\D/g, '');
export function sanitizeCart(value, productIds) {
  if (!Array.isArray(value)) return [];
  const counts = new Map();
  for (const item of value) {
    if (!item || !productIds.includes(item.product_id) || !Number.isInteger(item.quantity) || item.quantity < 1) continue;
    counts.set(item.product_id, Math.min(99, (counts.get(item.product_id) || 0) + item.quantity));
  }
  return [...counts].map(([product_id, quantity]) => ({ product_id, quantity }));
}
export function readCart(storage, productIds) {
  try { return sanitizeCart(JSON.parse(storage.getItem(CART_KEY)), productIds); } catch { return []; }
}
export function cartTotal(cart, products) {
  return cart.reduce((total, item) => total + (products.find(p => p.id === item.product_id)?.price_cents || 0) * item.quantity, 0);
}
export function validateCustomer(data) {
  if (String(data.name || '').trim().length < 3) return 'Informe seu nome completo.';
  if (!/^(?:55)?\d{10,11}$/.test(normalizePhone(data.phone))) return 'Informe um telefone válido com DDD.';
  return '';
}
export function addressText(a) {
  return `${a.street}, ${a.number}${a.complement ? `, ${a.complement}` : ''} · ${a.neighborhood} · ${a.city}/${a.state} · CEP ${a.postal_code}${a.reference ? ` · Referência: ${a.reference}` : ''}`;
}
