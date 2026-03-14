/* ==========================
   PIN V0.1 (hasheado + intentos + cooldown)
   compatible con utils.js (sha256, getAttempts, setAttempts, isInCooldown, etc.)
   y con tu index.html (onclick="pressPin(n)")
========================== */

// Estado interno del PIN
let pinActual = "";

// Compatibilidad por si faltaran los helpers (deberían llegar desde utils.js)
const KEY_PIN = (typeof PIN_STORAGE_KEY !== 'undefined') ? PIN_STORAGE_KEY : 'pinHash_v1';
const _getAttempts   = (typeof getAttempts   === 'function') ? getAttempts   : () => parseInt(localStorage.getItem('pinAttempts_v1') || '0', 10);
const _setAttempts   = (typeof setAttempts   === 'function') ? setAttempts   : (n) => localStorage.setItem('pinAttempts_v1', String(n));
const _isInCooldown  = (typeof isInCooldown  === 'function') ? isInCooldown  : (() => {
  const v = parseInt(localStorage.getItem('pinCooldownUntil_v1') || '0', 10);
  return Date.now() < v ? (v - Date.now()) : 0;
});
const _setCooldown   = (typeof setCooldown   === 'function') ? setCooldown   : ((sec) => {
  const until = Date.now() + sec * 1000;
  localStorage.setItem('pinCooldownUntil_v1', String(until));
});

// Crea hash por defecto (7143) si no existe
async function ensureDefaultPinHash() {
  try {
    if (!localStorage.getItem(KEY_PIN)) {
      const h = await sha256("7143");
      localStorage.setItem(KEY_PIN, h);
    }
  } catch (e) {
    console.error("[PIN] ensureDefaultPinHash error:", e);
  }
}

// Actualiza los puntitos visuales del PIN
function updateDots() {
  document.querySelectorAll('.pin-dots .dot').forEach((d, i) => {
    d.classList.toggle('filled', i < pinActual.length);
  });
}

// Limpia el buffer del PIN
function clearPin() {
  pinActual = "";
  updateDots();
}

// Desbloqueo: cierra overlay, muestra #movimientos y llama a init() si existe
function unlock() {
  const overlay = document.getElementById("authOverlay");
  if (overlay) overlay.style.display = "none";

  const m = document.getElementById("movimientos");
  if (m) {
    m.classList.remove("hidden");
    m.dataset.permiso = "OK";
  }
  // Si tienes init() definida en tu app, ejecútala; si no, no pasa nada.
  if (typeof init === 'function') {
    try { init(); } catch (e) { console.error("init() error:", e); }
  }
}

// Verifica el PIN con hash + control de intentos
async function verifyAndUnlock(pinPlain) {
  // Cooldown activo
  const remainMs = _isInCooldown();
  if (remainMs > 0) {
    const s = Math.ceil(remainMs / 1000);
    alert(`Has superado el número de intentos. Espera ${s} s e inténtalo de nuevo.`);
    return;
  }

  // Garantiza que hay hash por defecto
  await ensureDefaultPinHash();
  const savedHash = localStorage.getItem(KEY_PIN);
  const givenHash = await sha256(pinPlain);

  if (givenHash === savedHash) {
    _setAttempts(0);
    // Limpia cooldown si usas clave específica
    if (typeof PIN_COOLDOWN_KEY !== 'undefined') localStorage.removeItem(PIN_COOLDOWN_KEY);
    unlock();
  } else {
    const prev = _getAttempts() + 1;
    _setAttempts(prev);
    if (prev >= 5) {
      _setCooldown(60); // 60 segundos de bloqueo
      _setAttempts(0);
      alert("Demasiados intentos fallidos. Bloqueo temporal de 60 segundos.");
    } else {
      alert("PIN incorrecto");
    }
  }
}

// Pulsación de una tecla del PIN (usada por onclick en index.html)
async function pressPin(n) {
  // Si hay cooldown, bloquea
  const remain = _isInCooldown();
  if (remain > 0) {
    const s = Math.ceil(remain / 1000);
    alert(`Bloqueado temporalmente. Espera ${s} s.`);
    return;
  }

  if (pinActual.length < 4) {
    pinActual += String(n);
    updateDots();

    if (pinActual.length === 4) {
      const candidate = pinActual;
      clearPin();
      await ensureDefaultPinHash();
      verifyAndUnlock(candidate);
    }
  }
}

// Biometría (stub seguro: no desbloquea)
async function biometricAuth() {
  try {
    if (!window.isSecureContext || !window.PublicKeyCredential) {
      alert("Biometría no disponible (requiere HTTPS y dispositivo compatible).");
      return;
    }
    alert("Biometría no implementada aún.");
  } catch (e) {
    console.error(e);
    alert("Error de biometría");
  }
}

// Exponer funciones para los onclick inline del HTML
window.pressPin = pressPin;
window.clearPin = clearPin;
window.biometricAuth = biometricAuth;

// Preparación al cargar
document.addEventListener('DOMContentLoaded', () => {
  ensureDefaultPinHash().catch(console.error);
  // Asegura que los puntitos empiecen "vacíos"
  updateDots();
});

/* ==========================
   (TU) lógica existente — guardar()
   *** NO LA TOCO ***
========================== */

// NOTA: aquí asumo que en tu entorno global existen:
// - movimientos (array)
// - ejecutarBackupRotativo() (opcional)
// - volver() (función que vuelve a la vista lista y refresca)

// Dejo tu función exactamente como la pasaste:
const guardar = () => {
  const ids = ["editId","origen","categoria","subcategoria","fecha","descripcion","importe"];
  const v = ids.reduce((acc,id)=>({ ...acc, [id]: document.getElementById(id)?.value }),{});
  const imp = parseFloat(v.importe);
  if (!v.origen || !v.categoria || !v.subcategoria || isNaN(imp)) {
    alert("Faltan datos");
    return;
  }
  const m = {
    id : v.editId || `id_${Date.now()}`,
    f  : v.fecha,
    o  : v.origen,
    c  : v.categoria,
    s  : v.subcategoria,
    imp: v.origen === "Gasto" ? -Math.abs(imp) : Math.abs(imp),
    d  : v.descripcion,
    ts : Date.now()
  };
  if (v.editId) {
    const idx = movimientos.findIndex(x => x.id.toString() === v.editId.toString());
    if (idx !== -1) movimientos[idx] = m;
  } else {
    movimientos.push(m);
    if (movimientos.length % 15 === 0) ejecutarBackupRotativo();
  }
  localStorage.setItem('movimientos', JSON.stringify(movimientos));
  volver();
};
