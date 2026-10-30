// Safe arithmetic for Calculated claims: numbers, named inputs, + - * / and parentheses. No eval.
export class CalcError extends Error {}

export function evaluate(formula, vars) {
  const tokens = String(formula).match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/()]/g) || [];
  if (tokens.join('') !== String(formula).replace(/\s+/g, '')) throw new CalcError(`Unsupported characters in formula "${formula}"`);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  function primary() {
    const t = next();
    if (t === undefined) throw new CalcError('Unexpected end of formula');
    if (t === '(') {
      const v = expr();
      if (next() !== ')') throw new CalcError('Missing )');
      return v;
    }
    if (t === '-') return -primary();
    if (/^\d/.test(t)) return Number(t);
    if (/^[A-Za-z_]/.test(t)) {
      if (!(t in vars) || !Number.isFinite(vars[t])) throw new CalcError(`Input "${t}" has no numeric value`);
      return vars[t];
    }
    throw new CalcError(`Unexpected "${t}"`);
  }
  function term() {
    let v = primary();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const r = primary();
      if (op === '/' && r === 0) throw new CalcError('Division by zero');
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') v = next() === '+' ? v + term() : v - term();
    return v;
  }
  const out = expr();
  if (i !== tokens.length) throw new CalcError(`Unexpected "${tokens[i]}"`);
  return out;
}
