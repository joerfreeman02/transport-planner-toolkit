import { isUnspecifiedOperator } from './bus-grouping.mjs';

function normal(value) {
  return String(value ?? '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
}

const NON_DISTINCT_OPERATOR_TOKENS = new Set([
  'and', 'the', 'bus', 'buses', 'company', 'co', 'ltd', 'limited', 'travel', 'transport', 'in', 'of'
]);

export function operatorTokens(value) {
  return new Set(normal(value).split(' ').filter(token => token && !NON_DISTINCT_OPERATOR_TOKENS.has(token)));
}

export function operatorFamilyCompatible(first, second) {
  if (isUnspecifiedOperator(first?.operator) || isUnspecifiedOperator(second?.operator)) return true;
  const left = normal(first?.operator);
  const right = normal(second?.operator);
  if (!left || !right || left === right) return true;
  const leftTokens = operatorTokens(left);
  const rightTokens = operatorTokens(right);
  const subset = (small, large) => small.size > 0 && [...small].every(token => large.has(token));
  return subset(leftTokens, rightTokens) || subset(rightTokens, leftTokens);
}
