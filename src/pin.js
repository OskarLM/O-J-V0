
// pin.js - PIN seguro con Web Crypto + límite de intentos y bloqueo temporal

const DB_NAME = 'auth-db';
const DB_VERSION = 1;
const STORE = 'auth';
const KEY_ID = 'auth';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15; // minutos de bloqueo tras exceder
const PBKDF2_ITER = 150_000;
const SALT_BYTES = 16;

let unlocked = false;
let unlockHandlers = [];

export function onUnlocked(cb) { if (typeof cb === 'function') unlockHandlers.push(cb); }
function emitUnlocked() { unlocked = true; unlockHandlers.forEach(fn => fn()); }

function openAuthDB() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

function getAuthRecord() {
  return openAuthDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const st = tx.objectStore(STORE);
    const r = st.get(KEY_ID);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  }));
}

function setAuthRecord(obj) {
  return openAuthDB().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    const r = st.put(obj, KEY_ID);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  }));
}

async function makeSalt() {
  const b = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(b);
  return b;
}

async function deriveKey(pin, salt, iterations = PBKDF2_ITER) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, keyMaterial, 256);
  return new Uint8Array(bits);
}

function equalConstTime(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function now() { return Date.now(); }

export async function pinInit() {
  const setup = document.getElementById('pin-setup');
  const login = document.getElementById('pin-login');
  const setupForm = document.getElementById('pin-set-form');
  const setupMsg = document.getElementById('pin-setup-msg');
  const loginForm = document.getElementById('pin-form');
  const loginMsg = document.getElementById('pin-message');

  const rec = await getAuthRecord();

  if (!rec) {
    // No configurado: flujo de alta de PIN
    setup.hidden = false;
    login.hidden = true;

    setupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = document.getElementById('pin-new').value.trim();
      const p2 = document.getElementById('pin-new2').value.trim();
      if (!p1 || p1 !== p2) { setupMsg.textContent = 'Los PIN no coinciden'; return; }
      if (!/^\d{4,6}$/.test(p1)) { setupMsg.textContent = 'Usa 4 a 6 dígitos'; return; }

      const salt = await makeSalt();
      const hash = await deriveKey(p1, salt);
      const record = { salt: Array.from(salt), hash: Array.from(hash), iter: PBKDF2_ITER, attempts: 0, lockedUntil: 0 };
      await setAuthRecord(record);

      setupMsg.textContent = 'PIN guardado. Ya puedes iniciar sesión.';
      setup.hidden = true; login.hidden = false;
    });
  } else {
    // Ya hay PIN: flujo de login
    setup.hidden = true;
    login.hidden = false;
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = document.getElementById('pin-input').value.trim();
    let rec = await getAuthRecord();
    if (!rec) { loginMsg.textContent = 'Debes crear un PIN primero.'; return; }

    // Comprueba bloqueo
    if (rec.lockedUntil && now() < rec.lockedUntil) {
      const mins = Math.ceil((rec.lockedUntil - now()) / 60000);
      loginMsg.textContent = `Bloqueado. Intenta de nuevo en ${mins} min.`;
      return;
    }

    const salt = new Uint8Array(rec.salt);
    const calc = await deriveKey(pin, salt, rec.iter || PBKDF2_ITER);
    const ok = equalConstTime(calc, new Uint8Array(rec.hash));

    if (!ok) {
      rec.attempts = (rec.attempts || 0) + 1;
      if (rec.attempts >= MAX_ATTEMPTS) {
        rec.lockedUntil = now() + LOCK_MINUTES * 60 * 1000;
        rec.attempts = 0; // reset tras bloqueo
        loginMsg.textContent = `Demasiados intentos. Bloqueado ${LOCK_MINUTES} min.`;
      } else {
        loginMsg.textContent = `PIN incorrecto. Intentos restantes: ${MAX_ATTEMPTS - rec.attempts}`;
      }
      await setAuthRecord(rec);
      return;
    }

    // OK
    rec.attempts = 0; rec.lockedUntil = 0; await setAuthRecord(rec);
    loginMsg.textContent = 'Acceso concedido';
    emitUnlocked();
  });
}
