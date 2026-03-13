
// normalizer.js - normalización en tiempo real con atributos data-

function collapseSpaces(s) { return s.replace(/\s+/g, ' ').trim(); }
function stripDiacritics(s) { return s.normalize('NFD').replace(/\p{Diacritic}/gu, ''); }

function applyRules(el) {
  const rules = (el.getAttribute('data-normalize') || '').split(/\s+/).filter(Boolean);
  let v = el.value;
  if (rules.includes('trim')) v = v.trim();
  if (rules.includes('collapse')) v = collapseSpaces(v);
  if (rules.includes('lower')) v = v.toLowerCase();
  if (rules.includes('upper')) v = v.toUpperCase();
  if (rules.includes('ascii')) v = stripDiacritics(v);
  if (rules.includes('digits')) v = v.replace(/\D+/g, '');
  el.value = v;
}

function attach(container = document) {
  container.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (!el.hasAttribute('data-normalize')) return;
    applyRules(el);
  });
}

document.addEventListener('DOMContentLoaded', () => attach());
export { attach };
