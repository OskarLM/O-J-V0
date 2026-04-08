// === main.js v18 — G2 real (sin fantasma) + CASA centrada + Balance consistente + Doble‑tap ON/OFF + Import/Export desde Balance ===
if (window.__APP_LOADED__) {
  // Evitar doble carga
} else {
  window.__APP_LOADED__ = true;

  // ==========================
  // BASES Y ESTADO GLOBAL
  // ==========================
  const subBase = [
    "Accesorios","Agua","Aita","Ajuar / Electrodomésticos","Alojamiento","Apuestas y juegos","Atracciones","Ayuntamiento",
    "Barco","Cajero","Casa","Comida","Comisiones","Comunidad","Copas","Efectivo","Electrónica","Extraescolar","Farmacia",
    "Filamento","Garaje","Gas","Gasolina","Herramientas","Ikastola","Impresora","Impuestos","Juguetes / Regalos",
    "Libros / Material escolar","Luz","Mantenimiento","Medicamentos","Parking","Peaje","Préstamo","Reforma","Ropa",
    "Septiembre","Seguro","Suscripción","Suscripciones","Teléfono","Tren","Varios", "Decoracion", "Muebles"
  ];
  const catBase   = ["Casa","Caravana","Coche","Compras","Efectivo","Escolar","Garaje","Restaurante","Vacaciones"];
  const mesesLabel = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const origenBase = ["Ingreso","Gasto","Nómina"];
  const NOMINA_CATS = ["Oskar","Josune"];
  const NOMINA_SUBS = mesesLabel.slice();

  let movimientos = JSON.parse(localStorage.getItem('movimientos')) || [];
  let catExtra    = JSON.parse(localStorage.getItem('categoriaExtra')) || [];
  let subMaestra  = JSON.parse(localStorage.getItem('subMaestra_v2')) || subBase.slice();
  let registrosVisibles = 25;
  let filtradosGlobal = [];
  let pinActual = "";
  let hideCasa = false;
  let fullscreenMode = false;

  // Volteador (ARMADO por doble‑tap ON/OFF)
  let rotateReady = false;

  // Offset de referencia del balance (medido en Movimientos)
  let balanceRightRef = null;

  // Escape seguro para HTML (corregido)
  function esc(s){
    return (s ?? '')
      .toString()
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }

  // ==========================
  // CIFRADO BACKUP (AES-GCM con PIN)
  // ==========================
  const PIN_STORAGE_KEY   = 'pin_hash_v1';
  const PIN_ATTEMPTS_KEY  = 'pin_attempts_v1';
  const PIN_COOLDOWN_KEY  = 'pin_cooldown_until';

  function hexToBytes(hex){ const a=[]; for(let i=0;i<hex.length;i+=2) a.push(parseInt(hex.slice(i,i+2),16)); return new Uint8Array(a); }
  function bytesToBase64(bytes){ if (typeof btoa==='function'){ let bin=''; for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); } else { return Buffer.from(bytes).toString('base64'); } }
  function base64ToBytes(b64){ if (typeof atob==='function'){ const bin=atob(b64); const out=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out; } else { return new Uint8Array(Buffer.from(b64,'base64')); } }
  async function sha256(str){
    const data = new TextEncoder().encode(str);
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async function ensureDefaultPinHash() {
    const pinHash = localStorage.getItem(PIN_STORAGE_KEY);
    if (!pinHash) {
      let defaultPin = "7143";
      const h = await sha256(defaultPin);
      defaultPin = null;
      localStorage.setItem(PIN_STORAGE_KEY, h);
    }
  }
  async function getAesKeyFromPin(){
    await ensureDefaultPinHash();
    const hex = localStorage.getItem(PIN_STORAGE_KEY);
    const keyBytes = hexToBytes(hex);
    return await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt','decrypt']);
  }
  function buildBackupObject(){
    return { meta:{ createdAt:new Date().toISOString(), app:"mis-gastos", version:"V1.0.26" },
             datos:{ movimientos, catExtra, subMaestra } };
  }
  async function encryptBackup(obj){
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await getAesKeyFromPin();
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, data);
    return { v:1, alg:'AES-GCM', iv: bytesToBase64(iv), ct: bytesToBase64(new Uint8Array(ct)) };
  }
  async function decryptBackup(payload){
    const key = await getAesKeyFromPin();
    const iv = base64ToBytes(payload.iv);
    const ct = base64ToBytes(payload.ct);
    const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ==========================
  // UTILIDADES / NORMALIZACIÓN
  // ==========================
  const normalizeKey = (s) => (s ?? "")
    .toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\p{L}\p{N}]+/gu,' ')
    .replace(/\s+/g,' ').trim();
  const singularizeWordEs = (w) => {
    if (w.endsWith('iones')) return w.slice(0,-5)+'ion';
    if (w.endsWith('ces'))   return w.slice(0,-3)+'z';
    if (w.endsWith('es'))    return w.slice(0,-2);
    if (/[aeiou]s$/.test(w)) return w.slice(0,-1);
    return w;
  };
  const canonicalizeLabel = (s) => {
    const raw = normalizeKey(s);
    return raw
      .split(/([\/-])/g)
      .map(tok => (tok==='/' || tok==='-') ? tok : tok.split(' ').map(singularizeWordEs).join(' '))
      .join(' ')
      .replace(/\s*\/\s*/g,'/')
      .replace(/\s*-\s*/g,'-')
      .trim();
  };
  const mostrarBonito = (s) => {
    const t = (s ?? '').toString().trim();
    if (!t) return t;
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  };
  const buildCanonIndex = (preferida=[], secundaria=[]) => {
    const map = new Map();
    const add = (v) => { const k = canonicalizeLabel(v); if (!map.has(k)) map.set(k, v); };
    preferida.forEach(add); secundaria.forEach(add);
    return map;
  };
  function debounce(fn, delay = 150) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), delay); }; }
  function mesFromISO(iso) {
    try {
      if (!iso) return mesesLabel[new Date().getMonth()];
      const d = new Date(iso + 'T00:00:00');
      if (isNaN(d)) return mesesLabel[new Date().getMonth()];
      return mesesLabel[d.getMonth()];
    } catch { return mesesLabel[new Date().getMonth()]; }
  }

  // ==========================
  // PIN / UNLOCK
  // ==========================
  function getAttempts(){ return parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY)||'0',10) || 0; }
  function setAttempts(n){ localStorage.setItem(PIN_ATTEMPTS_KEY, String(n)); }
  function setCooldown(seconds){ localStorage.setItem(PIN_COOLDOWN_KEY, String(Date.now()+seconds*1000)); }
  function isInCooldown(){ const until = parseInt(localStorage.getItem(PIN_COOLDOWN_KEY)||'0',10); return Math.max(0, until - Date.now()); }
  const updateDots = () => { const dots=document.querySelectorAll('.dot'); for(let i=0;i<dots.length;i++) dots[i].classList.toggle('filled', i < pinActual.length); };
  const clearPin = () => { pinActual = ""; updateDots(); };
  async function verifyAndUnlock(pinPlain) {
    const remainMs = isInCooldown();
    if (remainMs > 0) { const s = Math.ceil(remainMs / 1000); alert(`Has superado el número de intentos. Espera ${s} s e inténtalo de nuevo.`); return; }
    await ensureDefaultPinHash();
    const currentHash = localStorage.getItem(PIN_STORAGE_KEY);
    const givenHash   = await sha256(pinPlain);
    if (givenHash === currentHash) { setAttempts(0); localStorage.removeItem(PIN_COOLDOWN_KEY); unlock(); }
    else {
      const prev = getAttempts() + 1; setAttempts(prev);
      if (prev >= 5) { setCooldown(60); setAttempts(0); alert("Demasiados intentos fallidos. Bloqueo temporal de 60 segundos."); }
      else alert("PIN incorrecto");
    }
  }
  const pressPin = async (n) => {
    const remain = (typeof isInCooldown === 'function') ? isInCooldown() : 0;
    if (remain > 0) { const s = Math.ceil(remain / 1000); alert(`Bloqueado temporalmente. Espera ${s} s.`); return; }
    if (pinActual.length < 4) {
      pinActual += String(n); updateDots();
      if (pinActual.length === 4) { const candidate = pinActual; clearPin(); await ensureDefaultPinHash(); verifyAndUnlock(candidate); }
    }
  };
  const biometricAuth = async () => { alert("Biometría no implementada aún."); };
  function unlock() {
    const auth = document.getElementById("authOverlay");
    if (auth) auth.classList.add('hidden');
    const m = document.getElementById("movimientos");
    m.classList.remove("hidden");
    m.dataset.permiso = "OK";
    init();
    loadFromDropboxOnStart({ silent: true });
  }

  // ==========================
  // FULLSCREEN + DOBLE‑TAP (ON/OFF) + ENLACE GUARDAR
  // ==========================
  function bindGuardarHandlers() {
    const form = document.getElementById('form');
    if (form && !form.__boundSubmit) {
      form.addEventListener('submit', (e) => { e.preventDefault(); guardar(); });
      form.__boundSubmit = true;
    }
    const btn = document.querySelector('#btnGuardar, #guardar, button[data-guardar]');
    if (btn && !btn.__boundClick) {
      btn.addEventListener('click', (e) => { e.preventDefault(); guardar(); });
      btn.__boundClick = true;
    }
  }

  function toggleFullscreenUI() {
    fullscreenMode = !fullscreenMode;
    const filtros = document.querySelector('.filtros-wrapper');
    const footer  = document.querySelector('.footer-controles');
    if (filtros) filtros.style.display = fullscreenMode ? 'none' : '';
    if (footer)  footer.style.display  = fullscreenMode ? 'none' : '';
    requestAnimationFrame(() => mostrar());
    try { sessionStorage.setItem('ui_fullscreen', fullscreenMode ? '1' : '0'); } catch {}
  }

  // === INTERRUPTOR DEL VOLTEADOR (ON/OFF con doble‑tap) ===
  function armRotateIfGraficosNow() {
    const modo = (document.getElementById("movimientos")?.dataset?.modo) || "lista";
    if (modo !== "graficos" && modo !== "graficos2") return;

    if (rotateReady) {
      // Estaba ON → lo apagamos
      rotateReady = false;
      try { sessionStorage.removeItem('rotate_ready'); } catch {}
      console.log("Volteador DESARMADO");
      return;
    }
    // Estaba OFF → lo encendemos
    rotateReady = true;
    try { sessionStorage.setItem('rotate_ready', '1'); } catch {}
    console.log("Volteador ARMADO");
  }

  // Doble‑tap / doble‑click en zonas no interactivas: fullscreen + interruptor volteador
  let _lastTap = 0; 
  const TAP_WINDOW = 250; // ms
  const isInteractive = (el) => !!(el && el.closest('button, a, select, input, textarea, label, [role="button"], [tabindex]'));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      ensureDefaultPinHash().catch(console.error);
      updateDots();
      if (document.documentElement) document.documentElement.style.touchAction = 'manipulation';
      if (document.body)           document.body.style.touchAction           = 'manipulation';

      try { const prevFS = sessionStorage.getItem('ui_fullscreen'); if (prevFS === '1') { fullscreenMode = true; toggleFullscreenUI(); } } catch {}
      // Restaurar estado armado del volteador si estaba guardado
      try { if (sessionStorage.getItem('rotate_ready') === '1') rotateReady = true; } catch {}

      window.addEventListener('touchstart', (ev) => {
        const t = Date.now();
        const target = ev.target;
        if (isInteractive(target)) return;
        if (t - _lastTap <= TAP_WINDOW) {
          ev.preventDefault();
          toggleFullscreenUI();
          armRotateIfGraficosNow(); // ON/OFF
          _lastTap = 0;
        } else {
          _lastTap = t;
        }
      }, { passive: false });

      window.addEventListener('dblclick', (ev) => {
        const target = ev.target;
        if (isInteractive(target)) return;
        ev.preventDefault();
        toggleFullscreenUI();
        armRotateIfGraficosNow(); // ON/OFF
      }, { passive: false });

      bindGuardarHandlers();

      // Botón VOLVER de Import/Export (si existe)
      const ieVolver = document.getElementById('ieVolver');
      if (ieVolver) ieVolver.onclick = () => setModo('lista');
    });
  } else {
    bindGuardarHandlers();
  }

  // === Volteador de pantalla REAL — redibuja en ambos sentidos y NO apaga rotateReady ===
  function handleRotationRedraw() {
    if (!rotateReady) return;
    const modo = (document.getElementById("movimientos")?.dataset?.modo) || "lista";
    if (modo === "graficos" || modo === "graficos2") {
      try { captureFooterAnchors(); } catch {}
      mostrar();
    }
  }

  // API moderna (Android/Chrome/PWA)
  if (screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener("change", handleRotationRedraw);
  }
  // Compatibilidad
  window.addEventListener("orientationchange", handleRotationRedraw);
  // Fallback universal (resize con detección real portrait<->landscape)
  let _lastIsLandscape = null;
  window.addEventListener("resize", () => {
    if (!rotateReady) return;
    const w = window.innerWidth, h = window.innerHeight;
    const isLandscape = w > h;
    if (_lastIsLandscape === null) { _lastIsLandscape = isLandscape; return; }
    if (isLandscape !== _lastIsLandscape) {
      _lastIsLandscape = isLandscape;
      handleRotationRedraw();
    }
  });

  // ==========================
  // ICONOS SVG
  // ==========================
  function iconBars(){ return `
    <svg viewBox="0 0 24 24" class="btn-icon" fill="none" stroke="black" stroke-width="3">
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>`; }
  function iconBack(){ return `
    <svg viewBox="0 0 24 24" class="btn-icon" fill="none" stroke="black" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 19l-7-7 7-7"></path>
    </svg>`; }
  function iconGraph2(){ return `
    <svg viewBox="0 0 24 24" class="btn-icon" fill="none" stroke-width="2.6">
      <rect x="6" y="7" width="4" height="10" fill="#ef4444" stroke="#ef4444" rx="1"></rect>
      <rect x="14" y="5" width="4" height="12" fill="#22c55e" stroke="#22c55e" rx="1"></rect>
    </svg>`; }
  function iconCasa(){ return `
    <svg viewBox="0 0 24 24">
      <path d="M3 10.5 L12 3 L21 10.5" />
      <path d="M5 10.5 V20 H10 V15 H14 V20 H19 V10.5" />
    </svg>`; }

  // ==========================
  // VISTAS / TOGGLE CASA
  // ==========================
  function setModo(modo){
    const m = document.getElementById("movimientos");
    const from = m.dataset.modo || 'lista';
    if ((modo === 'graficos' || modo === 'graficos2') && from === 'lista') {
      // Captura anclajes (left + center) y referencia de balance
      captureFooterAnchors();
      captureBalanceRef();
  bindInfiniteScroll();
    }
    m.dataset.modo = modo; // "lista" | "graficos" | "graficos2" | "importexport"
    resetPagina(); mostrar();
  }
  function toggleCasa(){
    hideCasa = !hideCasa;
    const m = document.getElementById("movimientos");
    if (m && (m.dataset.modo === "graficos" || m.dataset.modo === "graficos2")) mostrar();
  }
  function isCasaCategory(cat){
    const k = canonicalizeLabel(cat || "");
    return (k.includes("compra casa") || k.includes("compra garaje") || k.includes("venta casa"));
  }

  // ==========================
  // MEDIDAS / ANCLAJES FOOTER
  // ==========================
  let footerAnchors = { leftX:null, centerX:null, size:65 };
  function captureFooterAnchors(){
    try{
      const fr = document.querySelector('.footer-row'); if (!fr) return;
      const plus = fr.querySelectorAll('.plus'); if (!plus[0] || !plus[1]) return;
      const frRect = fr.getBoundingClientRect();
      const leftRect   = plus[0].getBoundingClientRect();
      const centerRect = plus[1].getBoundingClientRect();
      footerAnchors.leftX   = leftRect.left - frRect.left;
      footerAnchors.centerX = centerRect.left - frRect.left;
      footerAnchors.size    = Math.round(centerRect.width || 65);
    }catch(e){ /* noop */ }
  }

  // ==========================
  // BOTONES FOOTER — crear botón derecho real solo en gráficos
  // ==========================
  function ensureRealButtons() {
    const fr = document.querySelector('.footer-row');
    if (!fr) return { btnLeft:null, btnCenter:null, btnRight:null };

    // Tomamos los dos plus del HTML (left + center)
    const buttons = Array.from(fr.querySelectorAll('.plus')).slice(0, 2);
    let btnLeft   = buttons[0] || null;
    let btnCenter = buttons[1] || null;

    // Creamos botón derecho real SOLO en gráficos
    const modo = document.getElementById("movimientos")?.dataset?.modo || 'lista';
    let btnRight = document.getElementById('btnRightReal');

    if (modo === 'graficos' || modo === 'graficos2') {
      if (!btnRight) {
        btnRight = document.createElement('button');
        btnRight.id = 'btnRightReal';
        btnRight.className = 'plus';
        fr.appendChild(btnRight);
      }
    } else {
      if (btnRight) btnRight.remove();
      btnRight = null;
    }
    return { btnLeft, btnCenter, btnRight };
  }

  function layoutFooterReset(btnLeft, btnCenter, btnRight){
    [btnLeft, btnCenter, btnRight].forEach(b=>{
      if (!b) return;
      b.style.position = ""; b.style.left = ""; b.style.top = ""; b.style.transform = "";
      b.style.opacity = "1"; b.style.display = ""; b.style.pointerEvents = "";
    });
  }

  function _recentrarCasa(container, btnLeft, btnCenter, btnRight) {
    if (!container || !btnLeft || !btnCenter) return;

    requestAnimationFrame(() => {
      const fr = container.getBoundingClientRect();
      const l  = btnLeft.getBoundingClientRect();
      const c  = btnCenter.getBoundingClientRect();

      let rightRect;
      const rightVisible = !!(btnRight && getComputedStyle(btnRight).display !== 'none' && btnRight.style.pointerEvents !== 'none' && btnRight.style.opacity !== '0');
      if (rightVisible) {
        rightRect = btnRight.getBoundingClientRect();
      } else {
        const estLeft = (typeof footerAnchors.centerX === 'number')
          ? footerAnchors.centerX
          : ((container.clientWidth / 2) - (c.width / 2));
        rightRect = { left: fr.left + estLeft, width: c.width };
      }

      const centerLeft  = (l.left - fr.left) + (l.width / 2);
      const centerRight = (rightRect.left - fr.left) + (rightRect.width / 2);
      const centerCasa  = (centerLeft + centerRight) / 2;
      const casaLeft    = Math.round(centerCasa - (c.width / 2));

      btnCenter.style.position  = 'absolute';
      btnCenter.style.top       = '50%';
      btnCenter.style.transform = 'translateY(-50%)';
      btnCenter.style.left      = `${casaLeft}px`;
    });
  }

  function layoutFooterGrafico1(container, btnLeft, btnCenter, btnRight){
    if (!container || !btnLeft || !btnCenter) return;
    const cs = getComputedStyle(container); if (cs.position === 'static') container.style.position = 'relative';

    const SIZE   = footerAnchors.size || 65;
    const xLeft  = (footerAnchors.leftX != null)   ? footerAnchors.leftX : 20;
    const xRight = (footerAnchors.centerX != null) ? footerAnchors.centerX : ((container.clientWidth/2) - (SIZE/2));

    [btnLeft, btnCenter].forEach(b=>{
      b.style.position='absolute'; b.style.top='50%'; b.style.transform='translateY(-50%)';
    });
    btnLeft.style.left  = `${xLeft}px`;

    if (btnRight){
      btnRight.style.position   = 'absolute';
      btnRight.style.top        = '50%';
      btnRight.style.transform  = 'translateY(-50%)';
      btnRight.style.left       = `${xRight}px`;
      btnRight.style.display    = '';
      btnRight.style.opacity    = '1';
      btnRight.style.pointerEvents = 'auto';
    }

    const cont = document.querySelector('.footer-controles'); if (cont) cont.style.display = fullscreenMode ? 'none' : '';
    _recentrarCasa(container, btnLeft, btnCenter, btnRight);
  }

  function layoutFooterGrafico2(container, btnLeft, btnCenter, btnRight){
    if (!container || !btnLeft || !btnCenter) return;
    const cs = getComputedStyle(container); if (cs.position === 'static') container.style.position = 'relative';

    const xLeft = (footerAnchors.leftX != null) ? footerAnchors.leftX : 20;

    [btnLeft, btnCenter].forEach(b=>{
      b.style.position='absolute'; b.style.top='50%'; b.style.transform='translateY(-50%)';
    });
    btnLeft.style.left = `${xLeft}px`;

    if (btnRight){
      btnRight.style.display = 'none';
      btnRight.style.pointerEvents = 'none';
      btnRight.style.opacity = '0';
    }

    const cont = document.querySelector('.footer-controles'); if (cont) cont.style.display = fullscreenMode ? 'none' : '';
    _recentrarCasa(container, btnLeft, btnCenter, null);
  }

  // ==========================
  // BALANCE — opción B (misma posición relativa al footer en todos los modos)
  // ==========================
  function captureBalanceRef(){
    try {
      const footerRow = document.querySelector('.footer-row');
      const balanceEl = document.getElementById('balance');
      if (!footerRow || !balanceEl) return;
      const contRect = footerRow.getBoundingClientRect();
      const balRect  = balanceEl.getBoundingClientRect();
      // Distancia desde el borde derecho del footer al borde derecho del balance
      balanceRightRef = Math.max(0, Math.round(contRect.right - balRect.right));
    } catch { /* noop */ }
  }

  function layoutBalanceFixedUnified(){
    const footerRow = document.querySelector('.footer-row');
    const balanceEl = document.getElementById('balance');
    if (!footerRow || !balanceEl) return;

    if (getComputedStyle(footerRow).position === 'static') footerRow.style.position = 'relative';

    // Si no tenemos referencia aún, usa padding-right del footer como aproximación natural
    let rightOffset = balanceRightRef;
    if (rightOffset == null) {
      const footer = document.querySelector('.footer-controles');
      const pr = footer ? parseFloat(getComputedStyle(footer).paddingRight || '12') : 12;
      rightOffset = Math.max(0, Math.round(pr));
    }

    balanceEl.style.position  = 'absolute';
    balanceEl.style.top       = '50%';
    balanceEl.style.transform = 'translateY(-50%)';
    balanceEl.style.right     = `${rightOffset}px`;
  }

  function layoutBalanceResetUnified(){
    const balanceEl = document.getElementById('balance');
    if (!balanceEl) return;
    balanceEl.style.position  = '';
    balanceEl.style.right     = '';
    balanceEl.style.top       = '';
    balanceEl.style.transform = '';
  }

  // ==========================
  // MOSTRAR (LISTA / G1 / G2 / IMPORTEXPORT)
  // ==========================
  function mostrar() {
    const movDiv = document.getElementById("movimientos"); if (!movDiv || movDiv.dataset.permiso !== "OK") return;
    const filtros = document.querySelector('.filtros-wrapper'); 
    const footerB = document.querySelector('.footer-controles');
    const listaDiv = document.getElementById("lista");
    const impPage  = document.getElementById("importExport");
    const modo = movDiv.dataset.modo || "lista";

    // Visibilidad UI (según fullscreenMode)
    if (filtros) filtros.style.display = fullscreenMode ? 'none' : '';
    if (footerB) footerB.style.display  = fullscreenMode ? 'none' : '';

    // Filtros de datos
    const fsIds = ["filtroMes","filtroAño","filtroCat","filtroSub","filtroOri"];
    const fs = fsIds.map(id => { const el = document.getElementById(id); return el ? el.value : "TODOS"; });

    // Filtrado + orden
    filtradosGlobal = (movimientos || [])
      .filter(m => {
        const d = (m.f || "").split("-");
        const cM = fs[0] === "TODOS" || (parseInt(d[1]) - 1).toString() === fs[0];
        const cA = fs[1] === "TODOS" || d[0] === fs[1];
        const cC = fs[2] === "TODAS" || m.c === fs[2];
        const cS = fs[3] === "TODAS" || m.s === fs[3];
        const cO = fs[4] === "TODOS" || m.o === fs[4];
        return cM && cA && cC && cS && cO;
      })
      .sort((a,b) => new Date(b.f) - new Date(a.f));

    // Balance — texto, color y acción Import/Export
    let t = 0; for (let i=0;i<filtradosGlobal.length;i++){ const m = filtradosGlobal[i]; if (!hideCasa || !isCasaCategory(m.c)) t += Number(m.imp)||0; }
    const factor = (fs[0] === "TODOS") ? 12 : 1;
    const balanceEl = document.getElementById("balance");
    if (balanceEl){
      balanceEl.textContent = t.toFixed(2) + " €";
      if (t < 0) balanceEl.style.color = "var(--danger)";
      else if (t <= (750 * factor)) balanceEl.style.color = "var(--warning)";
      else if (t <= (1400 * factor)) balanceEl.style.color = "var(--success)";
      else balanceEl.style.color = "var(--electric-blue)";
      balanceEl.onclick = () => setModo('importexport');
    }

    // ====== Import/Export Overlay ======
    if (impPage) impPage.classList.add('hidden'); // por defecto oculto
    if (modo === "importexport") {
      if (impPage) impPage.classList.remove('hidden');
      if (listaDiv) listaDiv.innerHTML = "";
      return;
    }

    // Footer: botones
    const footerRow = document.querySelector('.footer-row');
    const { btnLeft, btnCenter, btnRight } = ensureRealButtons();

    [btnLeft, btnCenter, btnRight].forEach(b=>{
      if (!b) return;
      b.onclick = null; b.ondblclick = null;
      b.classList.remove("plus-like","btn-house-anim","active");
      b.style.opacity = "1"; b.style.display = ""; b.style.pointerEvents="";
      b.style.position=""; b.style.left=""; b.style.top=""; b.style.transform="";
    });
    layoutFooterReset(btnLeft, btnCenter, btnRight);

    const aplicarEstadoCasa = () => { if (btnCenter) btnCenter.classList.toggle("active", !!hideCasa); };

    if (modo === "graficos") {
      try { captureFooterAnchors(); } catch {}

      if (btnLeft){ btnLeft.innerHTML = iconBack(); btnLeft.onclick = () => setModo("lista"); }
      if (btnCenter){ btnCenter.innerHTML = iconCasa(); btnCenter.classList.add("btn-house-anim"); btnCenter.onclick = () => { toggleCasa(); aplicarEstadoCasa(); }; aplicarEstadoCasa(); }
      if (btnRight){ btnRight.innerHTML = iconGraph2(); btnRight.onclick = () => setModo("graficos2"); }

      layoutFooterGrafico1(footerRow, btnLeft, btnCenter, btnRight);
      layoutBalanceFixedUnified();

      if (listaDiv) {
        listaDiv.innerHTML = "";
        renderizarBarrasGraficos((fs[0] === "TODOS") ? 12 : 1);
      }
    } else if (modo === "graficos2") {
      try { captureFooterAnchors(); } catch {}

      if (btnLeft){ btnLeft.innerHTML = iconBack(); btnLeft.onclick = () => setModo("graficos"); }
      if (btnCenter){ btnCenter.innerHTML = iconCasa(); btnCenter.classList.add("btn-house-anim"); btnCenter.onclick = () => { toggleCasa(); aplicarEstadoCasa(); }; aplicarEstadoCasa(); }
      if (btnRight){ btnRight.style.display = 'none'; btnRight.style.pointerEvents = 'none'; btnRight.style.opacity = '0'; }

      layoutFooterGrafico2(footerRow, btnLeft, btnCenter, btnRight);
      layoutBalanceFixedUnified();

      if (listaDiv) {
        listaDiv.innerHTML = "";
        renderizarGraficos2();
      }
    } else {
      // LISTA
      if (btnLeft){ btnLeft.innerHTML = iconBars(); btnLeft.classList.add("plus-like"); btnLeft.onclick = () => { captureBalanceRef(); setModo("graficos"); }; }
      if (btnCenter){ btnCenter.innerHTML = "+"; btnCenter.onclick = () => abrirFormulario(); }

      layoutFooterReset(btnLeft, btnCenter, btnRight);
      layoutBalanceResetUnified();

      if (listaDiv) {
        const rows = filtradosGlobal
          .slice(0, registrosVisibles)
          .map(m => `
            <div class='card' onclick="abrirFormulario('${m.id}')" style="border-left-color:${m.imp >= 0 ? 'var(--success)' : 'var(--danger)'}">
              <div class="meta">${esc(m.f.split("-").reverse().join("/"))} • ${esc(m.o)}</div>
              <b>${esc(m.c)} - ${esc(m.s)}</b>
              ${m.d ? `<div style="font-size:12px;opacity:.8">${esc(m.d)}</div>` : ''}
              <div class="monto" style="color:${m.imp >= 0 ? 'var(--success)' : 'var(--danger)'}">${(Number(m.imp)||0).toFixed(2)} €</div>
            </div>`).join("");
        listaDiv.innerHTML = rows;
        const loader = document.getElementById("loader"); if (loader) loader.style.display = "none";
      }

      // Refrescar referencia del balance por si el CSS cambió
      captureBalanceRef();
    }

    ensureBackupIndicator(); updateBackupIndicator();
  }

  // Reajustes al cambiar tamaño: re‑aplica layouts en gráficos (y balance unificado)
  window.addEventListener('resize', debounce(function(){
    const movDiv = document.getElementById("movimientos");
    if (!movDiv) return; const modo = movDiv.dataset.modo || "lista";
    if (modo !== "graficos" && modo !== "graficos2") return;
    const footerRow = document.querySelector(".footer-row");
    const { btnLeft, btnCenter, btnRight } = ensureRealButtons();
    if (modo === "graficos") layoutFooterGrafico1(footerRow, btnLeft, btnCenter, btnRight);
    else layoutFooterGrafico2(footerRow, btnLeft, btnCenter, btnRight);
    layoutBalanceFixedUnified();
  }, 150));

  // ==========================
  // GRÁFICOS 1 (barras) + DRILL
  // ==========================
  function renderizarBarrasGraficos(f) {
    const lista = document.getElementById("lista");
    const elFC = document.getElementById("filtroCat");
    const filtroCat = (elFC && elFC.value) || "TODAS";
    let fuente = filtradosGlobal.slice();
    if (hideCasa) fuente = fuente.filter(m => !isCasaCategory(m.c));

    const totales = {};
    if (filtroCat === "TODAS") {
      for (let m of fuente) if (m.imp < 0) totales[m.c] = (totales[m.c]||0) + Math.abs(m.imp);
    } else {
      for (let m of fuente) if (m.imp < 0 && m.c === filtroCat) totales[m.s] = (totales[m.s]||0) + Math.abs(m.imp);
    }

    const max = Math.max(...Object.values(totales), 1);
    const titulo = (filtroCat === "TODAS") ? "ANÁLISIS DE GASTO POR CATEGORÍAS" : `SUBCATEGORÍAS DE ${filtroCat}`;
    let html = `
      <h2 style="color:var(--primary);font-size:18px;text-align:center">${titulo}</h2>
      <div style="display:flex;justify-content:center;gap:15px;margin-bottom:25px;font-size:19px;font-weight:900">
        <span style="color:var(--electric-blue)">0-${50*f}€</span>
        <span style="color:var(--success)">${200*f}€</span>
        <span style="color:var(--warning)">${500*f}€</span>
        <span style="color:var(--danger)">+</span>
      </div>
    `;
    const items = Object.entries(totales).sort((a,b)=>b[1]-a[1]);
    if (!items.length) {
      lista.innerHTML += html + `<div class="card" style="text-align:center;border:none"><div style="opacity:.8">No hay datos para los filtros seleccionados.</div></div>`;
      return;
    }
    lista.innerHTML += html + items.map(([label,val])=>{
      const t1 = Math.min(val, 50*f),
            t2 = val > 50*f ? Math.min(val - 50*f ,150*f) : 0,
            t3 = val > 200*f ? Math.min(val - 200*f,300*f) : 0,
            t4 = val > 500*f ? (val - 500*f) : 0;
      return `
      <div class="card" style="border:none;background:transparent;cursor:pointer" data-label="${esc(label)}"
           onclick="handleGraficoBarClick(this.dataset.label)">
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:5px"><span>${esc(label)}</span><b>${val.toFixed(2)} €</b></div>
        <div style="width:${(val/max)*100}%;height:16px;display:flex;background:#000;border-radius:8px;overflow:hidden;border:1px solid rgba(212,175,55,.2)">
          <div style="width:${(t1/val)*100}%;background:var(--electric-blue)"></div>
          <div style="width:${(t2/val)*100}%;background:var(--success)"></div>
          <div style="width:${(t3/val)*100}%;background:var(--warning)"></div>
          <div style="width:${(t4/val)*100}%;background:var(--danger)"></div>
        </div>
      </div>
      `;
    }).join("");
  }
  function handleGraficoBarClick(label){
    const selCat = document.getElementById('filtroCat');
    const actual = (selCat && selCat.value) || 'TODAS';
    if (actual === 'TODAS') { if (selCat) selCat.value = label; resetPagina(); mostrar(); return; }
    abrirDetalleMovs(actual, label);
  }
  function abrirDetalleMovs(categoria, subcategoria){
    try {
      let base = filtradosGlobal.slice();
      if (hideCasa) base = base.filter(m => !isCasaCategory(m.c));
      const lista = base
        .filter(m => m.imp < 0 && m.c === categoria && m.s === subcategoria)
        .sort((a,b)=> new Date(b.f) - new Date(a.f));
      const total = lista.reduce((acc,m)=>acc + Math.abs(m.imp), 0);
      const overlay = document.createElement('div');
      overlay.className = 'premium-overlay';
      overlay.innerHTML = `
        <div class="premium-content" style="max-height:80vh;overflow:auto;text-align:left">
          <div class="premium-title" style="text-align:center">${esc(categoria)} / ${esc(subcategoria)}</div>
          <div style="font-weight:900;color:var(--primary);text-align:center;margin-bottom:10px">Total: ${total.toFixed(2)} €</div>
          <div id="detalleLista">
            ${
              lista.length
              ? lista.map(m => `
                <div class="card" style="margin:10px 0;border-left-color:var(--danger)">
                  <div class="meta">${esc(m.f.split("-").reverse().join("/"))} • ${esc(m.o)}</div>
                  ${m.d ? `<div style="font-size:13px;opacity:.9;margin-bottom:6px">${esc(m.d)}</div>` : ''}
                  <div class="monto" style="color:var(--danger)">${Math.abs(m.imp).toFixed(2)} €</div>
                </div>
              `).join('')
              : `<div class="card" style="text-align:center;border:none;opacity:.8">No hay movimientos.</div>`
            }
          </div>
          <button class="btn-silver" id="cerrarDetalle">CERRAR</button>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('#cerrarDetalle').onclick = ()=> overlay.remove();
    } catch (e) {
      console.error(e); alert("No se pudo abrir el detalle.");
    }
  }

  // ==========================
  // GRÁFICOS 2 (columnas)
  // ==========================
  function renderizarGraficos2() {
    const lista = document.getElementById("lista");
    const oldChart = lista.querySelector('.g2-wrap'); if (oldChart) oldChart.remove();

    const fsIds = ["filtroMes","filtroAño","filtroCat","filtroSub","filtroOri"];
    const fs = fsIds.map(id => { const el = document.getElementById(id); return el ? el.value : "TODOS"; });

    const hoy = new Date();
    const meses = [];
    for (let i=12; i>=0; i--){
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      meses.push({ d, key });
    }

    const filtraOtros = (m) => {
      const cC = fs[2] === "TODAS" || m.c === fs[2];
      const cS = fs[3] === "TODAS" || m.s === fs[3];
      const cO = fs[4] === "TODOS" || m.o === fs[4];
      return cC && cS && cO;
    };
    const base = (hideCasa ? movimientos.filter(mm => !isCasaCategory(mm.c)) : movimientos).filter(filtraOtros);
    const sumaMes = new Map();
    for (let mov of base) {
      const k = (mov.f || "").slice(0,7);
      if (!meses.some(x => x.key === k)) continue;
      sumaMes.set(k, (sumaMes.get(k) || 0) + (Number(mov.imp) || 0));
    }

    const valores = meses.map(m => sumaMes.get(m.key) || 0);
    const maxAbs = Math.max(...valores.map(v => Math.abs(v)), 1);
    const minBar = 4;
    const colorPorMes = (t) => {
      if (t < 0) return "var(--danger)";
      if (t <= 250) return "var(--warning)";
      if (t <= 750) return "var(--success)";
      return "var(--electric-blue)";
    };
    const mesesCorta = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const fmtEuro = (n) => { const v = Number(n)||0, s = v>=0?"+":"−", a = Math.abs(v).toFixed(2).replace(".",","); return `${s}${a} €`; };

    let html = `
      <div class="g2-wrap">
        <div class="g2-chart" style="position:relative;height:180px;display:grid;grid-template-columns:repeat(13,1fr);gap:10px;align-items:center;margin-bottom:26px;">
          <div class="g2-baseline" style="position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(212,175,55,.35)"></div>
    `;
    for (const m of meses){
      const v = sumaMes.get(m.key) || 0;
      const h = Math.max(minBar, (Math.abs(v)/maxAbs) * 80);
      const pos = v >= 0;
      const color = colorPorMes(v);
      const mesIdx = new Date(m.key + "-01T00:00:00").getMonth();
      const label = mesesCorta[mesIdx];
      const tipText = `${label} ${m.d.getFullYear()}: ${fmtEuro(v)}`;
      html += `
      <div class="g2-col" data-key="${m.key}" style="position:relative;height:100%;">
        <div class="g2-bar ${pos ? 'pos' : 'neg'}" data-h="${h}" style="height:0px;background:${color};"></div>
        <div class="g2-tip ${pos ? 'tip-pos' : 'tip-neg'}">${tipText}</div>
        <div class="g2-label" style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--primary)">${label}</div>
      </div>
      `;
    }
    html += `</div></div>`;
    lista.insertAdjacentHTML('beforeend', html);

    requestAnimationFrame(function(){
      const bars = lista.querySelectorAll('.g2-chart .g2-bar');
      for (let i=0;i<bars.length;i++){
        const el = bars[i];
        const target = parseFloat(el.getAttribute('data-h')) || 0;
        el.style.height = target + 'px';
      }
    });

    const chart = lista.querySelector('.g2-chart');
    if (!chart) return;
    if (!chart.getAttribute('data-tipBound')){
      chart.addEventListener('click', function(ev){
        const col = ev.target.closest('.g2-col'); if (!col) return;
        const open = chart.querySelectorAll('.g2-col.show-tip');
        for (let i=0;i<open.length;i++) if (open[i]!==col) open[i].classList.remove('show-tip');
        col.classList.toggle('show-tip');
      });
      document.addEventListener('click', function(ev){
        if (!chart.contains(ev.target)){
          const open = chart.querySelectorAll('.g2-col.show-tip');
          for (let i=0;i<open.length;i++) open[i].classList.remove('show-tip');
        }
      });
      chart.setAttribute('data-tipBound','1');
    }
  }

  // ==========================
  // FORMULARIO / CRUD (igual que estabas)
  // ==========================
  function onOrigenChange(origenValor, { preCat = "", preSub = "", esEdicion = false } = {}) {
    const selCat = document.getElementById("categoria");
    const selSub = document.getElementById("subcategoria");
    const fechaEl = document.getElementById("fecha");

    if (origenValor === "Nómina") {
      selCat.innerHTML = `<option value="" disabled ${preCat ? '' : 'selected'}>Seleccionar...</option>`;
      NOMINA_CATS.forEach(c => { selCat.innerHTML += `<option value="${c}" ${c === preCat ? 'selected' : ''}>${c}</option>`; });

      const mesPrefer = preSub || mesFromISO(fechaEl?.value);
      selSub.innerHTML = `<option value="" disabled ${mesPrefer ? '' : 'selected'}>Seleccionar...</option>`;
      NOMINA_SUBS.forEach(m => { selSub.innerHTML += `<option value="${m}" ${m === mesPrefer ? 'selected' : ''}>${m}</option>`; });

      if (preCat)   { selCat.value   = preCat;   selCat.dispatchEvent(new Event('change', { bubbles: true })); }
      if (mesPrefer){ selSub.value   = mesPrefer; selSub.dispatchEvent(new Event('change', { bubbles: true })); }

      if (!esEdicion) lanzarPopupNomina({ preCat, preSub: mesPrefer });
    } else {
      llenar("categoria", catBase, catExtra, preCat, { origenActual: origenValor });
      llenar("subcategoria", subMaestra, [], preSub, { origenActual: origenValor });
    }
  }

  function lanzarPopupNomina({ preCat = "", preSub = "" } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'nomina-overlay';
    overlay.innerHTML = `
      <div class="nomina-content">
        <div class="nomina-title">¿QUIÉN COBRA?</div>
        <button class="btn-nomina btn-oskar" id="btn_nom_oskar">OSKAR</button>
        <button class="btn-nomina btn-josune" id="btn_nom_josune">JOSUNE</button>
        <button class="btn-nomina btn-cancel" id="btn_nom_cancel">CANCELAR</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    const selCat = document.getElementById("categoria");
    const selSub = document.getElementById("subcategoria");
    const fechaEl = document.getElementById("fecha");
    const mesPrefer = preSub || mesFromISO(fechaEl?.value);

    selSub.innerHTML = `<option value="" disabled ${mesPrefer ? '' : 'selected'}>Seleccionar...</option>`;
    NOMINA_SUBS.forEach(m => selSub.innerHTML += `<option value="${m}" ${m===mesPrefer?'selected':''}>${m}</option>`);
    if (mesPrefer) { selSub.value = mesPrefer; selSub.dispatchEvent(new Event('change', { bubbles: true })); }

    document.getElementById('btn_nom_oskar').onclick = () => {
      selCat.innerHTML = `<option value="Oskar" selected>Oskar</option>`;
      selCat.value = "Oskar"; selCat.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    };
    document.getElementById('btn_nom_josune').onclick = () => {
      selCat.innerHTML = `<option value="Josune" selected>Josune</option>`;
      selCat.value = "Josune"; selCat.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    };
    document.getElementById('btn_nom_cancel').onclick = () => {
      const selOrigen = document.getElementById("origen");
      selOrigen.value = "Gasto";
      llenar("categoria", catBase, catExtra, "", { origenActual: "Gasto" });
      llenar("subcategoria", subMaestra, [], "", { origenActual: "Gasto" });
      close();
    };
  }

  const llenar = (id, base, extra, pre = "", opts = {}) => {
    const s = document.getElementById(id);
    const origenActual = opts.origenActual || "";
    if (!s) return;

    s.innerHTML = `<option value="" disabled ${pre === "" ? 'selected' : ''}>Seleccionar...</option>`;
    let values = [...new Set([...base, ...extra])];

    if (id === "categoria") {
      const ocultarNominaCats = origenActual !== "Nómina";
      if (ocultarNominaCats) values = values.filter(v => !NOMINA_CATS.includes(v));
    }
    if (id === "subcategoria") {
      const ocultarMeses = origenActual !== "Nómina";
      if (ocultarMeses) values = values.filter(v => !NOMINA_SUBS.includes(v));
    }

    values.sort((a,b)=>a.localeCompare(b,'es')).forEach(v=>{
      s.innerHTML += `<option value="${v}" ${v === pre ? 'selected' : ''}>${v}</option>`;
    });

    if (pre && !values.includes(pre)) s.innerHTML += `<option value="${pre}" selected hidden>${pre}</option>`;
    if (id !== "origen") s.innerHTML += `<option value="+">+ Añadir nuevo...</option>`;
    if (pre) s.value = pre;
  };

  const abrirFormulario = (id = null) => {
    const f = document.getElementById("form"),
          mDiv= document.getElementById("movimientos"),
          btnD= document.getElementById("btnEliminarRegistro");

    if (id) {
      let m = movimientos.find(x => x.id.toString() === id.toString());
      document.getElementById("editId").value = m.id;
      document.getElementById("fecha").value = m.f;
      llenar("origen", origenBase, [], m.o);
      onOrigenChange(m.o, { preCat: m.c, preSub: m.s, esEdicion: true });
      document.getElementById("importe").value = Math.abs(m.imp);
      document.getElementById("descripcion").value = m.d || "";
      btnD.classList.remove("hidden");
    } else {
      document.getElementById("editId").value = "";
      document.getElementById("importe").value = "";
      document.getElementById("descripcion").value = "";
      document.getElementById("fecha").value = new Date().toISOString().split("T")[0];
      llenar("origen", origenBase, []);
      const origenInicial = (document.getElementById("origen").value || "");
      onOrigenChange(origenInicial);
      btnD.classList.add("hidden");
    }

    const selOrigen = document.getElementById("origen");
    selOrigen.onchange = () => onOrigenChange(selOrigen.value);

    const fechaEl = document.getElementById("fecha");
    if (fechaEl) {
      fechaEl.onchange = () => {
        if (selOrigen.value === "Nómina") {
          const mesPrefer = mesFromISO(fechaEl.value);
          const catActual = (document.getElementById("categoria") || {}).value || "";
          const esEdicionActiva = !!(document.getElementById("editId")?.value);
          onOrigenChange("Nómina", { preCat: catActual, preSub: mesPrefer, esEdicion: esEdicionActiva });
        }
      };
    }

    bindGuardarHandlers();

    f.classList.remove("hidden");
    mDiv.classList.add("hidden");
  };

  // ==========================
  // GUARDAR — robusto (números EU + value de selects)
  // ==========================
  const guardar = () => {
    const get = (id) => (document.getElementById(id)?.value ?? "").trim();
    const parseEuroNumber = (s) => {
      let t = (s || "").toString().trim();
      t = t.replace(/\.(?=\d{3}(?:\D|$))/g, ""); // miles
      t = t.replace(",", ".");                   // decimal
      const n = parseFloat(t);
      return Number.isFinite(n) ? n : NaN;
    };

    const v = {
      editId:       get("editId"),
      origen:       get("origen"),
      categoria:    get("categoria"),
      subcategoria: get("subcategoria"),
      fecha:        get("fecha"),
      descripcion:  get("descripcion"),
      importeRaw:   get("importe")
    };

    // fallback selects
    const selCat = document.getElementById("categoria");
    const selSub = document.getElementById("subcategoria");
    if (selCat && !v.categoria && selCat.selectedIndex >= 0) {
      v.categoria = selCat.options[selCat.selectedIndex].value || selCat.options[selCat.selectedIndex].text;
    }
    if (selSub && !v.subcategoria && selSub.selectedIndex >= 0) {
      v.subcategoria = selSub.options[selSub.selectedIndex].value || selSub.options[selSub.selectedIndex].text;
    }

    const imp = parseEuroNumber(v.importeRaw);
    if (!v.origen || !v.categoria || !v.subcategoria || !v.fecha || Number.isNaN(imp)) {
      alert("Faltan datos (revisa Origen/Categoría/Subcategoría/Fecha e Importe).");
      return;
    }

    const m = {
      id  : v.editId || `id_${Date.now()}`,
      f   : v.fecha,
      o   : v.origen,
      c   : v.categoria,
      s   : v.subcategoria,
      imp : v.origen === "Gasto" ? -Math.abs(imp) : Math.abs(imp),
      d   : v.descripcion,
      ts  : Date.now()
    };

    if (v.editId) {
      const idx = movimientos.findIndex(x => x.id.toString() === v.editId.toString());
      if (idx !== -1) movimientos[idx] = m;
    } else {
      movimientos.push(m);
      if (movimientos.length % 15 === 0) ejecutarBackupRotativo();
    }

    localStorage.setItem('movimientos', JSON.stringify(movimientos));
    scheduleSync('guardar'); // autosync Dropbox
    volver();
  };

  function eliminarRegistroActual(){
    const idAEliminar = (document.getElementById("editId")||{}).value;
    if (!idAEliminar) return;
    if (confirm("¿ESTÁS SEGURO DE QUE DESEAS ELIMINAR ESTE REGISTRO?")) {
      movimientos = movimientos.filter(m => m.id.toString() !== idAEliminar.toString());
      localStorage.setItem('movimientos', JSON.stringify(movimientos));
      scheduleSync('eliminar');
      volver();
    }
  }

  const volver = () => {
    document.getElementById("form").classList.add("hidden");
    document.getElementById("movimientos").classList.remove("hidden");
    actualizarListas(); resetPagina(); mostrar();
  };

const manejarNuevo = (el, tipo) => {
  if (el.value !== "+") return;

  // Si nadie precargó dataset.nuevoValor, pedimos el texto al usuario ahora
  if (!el.dataset.nuevoValor) {
    const mensaje = (tipo === "categoria")
      ? "Escribe el nombre de la nueva CATEGORÍA:"
      : "Escribe el nombre de la nueva SUBCATEGORÍA:";
    const capturado = (prompt(mensaje) || "").trim();
    // Restaurar el select si cancelan o queda vacío
    if (!capturado) { el.value = ""; return; }
    el.dataset.nuevoValor = capturado;
  }

  let n = el.dataset.nuevoValor || "";
  el.dataset.nuevoValor = "";
  if (!n) { el.value = ""; return; }

  // --- A partir de aquí sigue exactamente tu lógica original ---
  const pretty = mostrarBonito(n.trim());
  const keyNew = canonicalizeLabel(pretty);

  if (tipo === "categoria") {
    const catIdx = buildCanonIndex(catBase, catExtra);
    if (NOMINA_CATS.some(x => canonicalizeLabel(x) === keyNew)) {
      alert("No puedes crear manualmente 'Oskar' ni 'Josune'. Selecciona 'Nómina'.");
      el.value = ""; return;
    }
    if (!catIdx.has(keyNew)) {
      catExtra.push(pretty);
      localStorage.setItem('categoriaExtra', JSON.stringify(catExtra));
      scheduleSync('listas');
    }
    const origenActual = (document.getElementById("origen")||{}).value || "";
    llenar("categoria", catBase, catExtra, pretty, { origenActual });
  } else {
    const subIdx = buildCanonIndex(subMaestra, []);
    if (!subIdx.has(keyNew)) {
      subMaestra.push(pretty);
      localStorage.setItem('subMaestra_v2', JSON.stringify(subMaestra));
      scheduleSync('listas');
    }
    const origenActual = (document.getElementById("origen")||{}).value || "";
    llenar("subcategoria", subMaestra, [], pretty, { origenActual });
  }
};

  const borrarElemento = (tipo) => {
    const select = document.getElementById(tipo);
    const val = select && select.value; if (!val) return;
    if (tipo === 'categoria') {
      const idx = catExtra.indexOf(val);
      if (idx >= 0) {
        catExtra.splice(idx,1);
        localStorage.setItem('categoriaExtra', JSON.stringify(catExtra));
        scheduleSync('listas');
        const origenActual = (document.getElementById("origen")||{}).value || "";
        llenar('categoria', catBase, catExtra, "", { origenActual });
      } else {
        alert('Solo puedes borrar categorías añadidas por ti.');
      }
    } else if (tipo === 'subcategoria') {
      const idx = subMaestra.indexOf(val);
      if (idx >= 0) {
        subMaestra.splice(idx,1);
        localStorage.setItem('subMaestra_v2', JSON.stringify(subMaestra));
        scheduleSync('listas');
        const origenActual = (document.getElementById("origen")||{}).value || "";
        llenar('subcategoria', subMaestra, [], "",{ origenActual });
      }
    }
  };

  const abrirGraficos = () => {
    const m = document.getElementById("movimientos");
    m.dataset.modo = (m.dataset.modo === "graficos") ? "lista" : "graficos";
    mostrar();
  };

  const resetPagina = () => { registrosVisibles = 25; window.scrollTo(0,0); };

  const actualizarListas = () => {
    const fC = document.getElementById("filtroCat"),
          fS = document.getElementById("filtroSub"),
          fO = document.getElementById("filtroOri");

    if (fC){
      fC.innerHTML = '<option value="TODAS">Cat: TODAS</option>';
      [...new Set([...catBase, ...catExtra, ...NOMINA_CATS])].sort().forEach(c => fC.add(new Option(c, c)));
    }
    if (fS){
      fS.innerHTML = '<option value="TODAS">Sub: TODAS</option>';
      [...new Set([...subMaestra, ...NOMINA_SUBS])].sort().forEach(s => fS.add(new Option(s, s)));
    }
    if (fO){
      fO.innerHTML = '<option value="TODOS">Ori: TODOS</option>';
      origenBase.forEach(o => fO.add(new Option(o, o)));
    }
  };

  // ==========================
  // NORMALIZACIÓN RETROACTIVA
  // ==========================
  function normalizarListasExistentes(){
    const vistosCat = new Set(Object.values(catBase).map(v => canonicalizeLabel(v)));
    const nuevaExtra = [];
    const unicosExtra = [...new Set(catExtra)];
    for (let v of unicosExtra){
      const k = canonicalizeLabel(v);
      if (vistosCat.has(k)) continue;
      if (NOMINA_CATS.map(canonicalizeLabel).indexOf(k) >= 0) continue;
      if (!nuevaExtra.some(x => canonicalizeLabel(x)===k)) nuevaExtra.push(v);
      vistosCat.add(k);
    }
    catExtra = nuevaExtra; localStorage.setItem('categoriaExtra', JSON.stringify(catExtra));

    const vistosSub = new Set();
    const nuevasSubs = [];
    for (let v of subMaestra){
      const k = canonicalizeLabel(v);
      if (!vistosSub.has(k)) { vistosSub.add(k); nuevasSubs.push(v); }
    }
    subMaestra = nuevasSubs; localStorage.setItem('subMaestra_v2', JSON.stringify(subMaestra));

    const catIndexCanon = buildCanonIndex([...catBase, ...catExtra, ...NOMINA_CATS], []);
    const subIndexCanon = buildCanonIndex([...subMaestra, ...NOMINA_SUBS], []);

    let cambiado = false;
    movimientos = movimientos.map(m=>{
      const kc = canonicalizeLabel(m.c);
      const ks = canonicalizeLabel(m.s);
      let c = m.c, s = m.s;
      if (catIndexCanon.has(kc)) c = catIndexCanon.get(kc);
      if (subIndexCanon.has(ks)) s = subIndexCanon.get(ks);
      if (c!==m.c || s!==m.s){
        cambiado = true;
        return {...m, c, s, ts: Math.max(Date.now(), (m.ts||0)+1)};
      }
      return m;
    }).sort((a,b)=>new Date(b.f)-new Date(a.f));

    if (cambiado) localStorage.setItem('movimientos', JSON.stringify(movimientos));
  }

  // ==========================
  // INIT + SCROLL INFINITO
  // ==========================
  const init = () => {
    const fM = document.getElementById("filtroMes"),
          fA = document.getElementById("filtroAño"),
          hoy = new Date();
    if (fM){
      fM.innerHTML = '<option value="TODOS">Mes: TODOS</option>';
      for (let i=0;i<mesesLabel.length;i++) fM.add(new Option(mesesLabel[i], i));
      fM.value = hoy.getMonth();
    }
    if (fA){
      fA.innerHTML = '<option value="TODOS">Año: TODOS</option>';
      for (let a = 2020; a <= 2030; a++) fA.add(new Option(a, a));
      fA.value = hoy.getFullYear();
    }
    normalizarListasExistentes();
    actualizarListas();
    mostrar();
  };
// ==========================
// SCROLL INFINITO REAL (LISTA)
// ==========================
let _renderLock = false;

function bindInfiniteScroll() {
  const lista = document.getElementById("lista");
  if (!lista || lista.__scrollBound) return;

  lista.__scrollBound = true;

  lista.addEventListener("scroll", () => {
    const scrollBottom = lista.scrollTop + lista.clientHeight;
    const contentHeight = lista.scrollHeight;

    if (
      scrollBottom >= contentHeight - 200 &&
      registrosVisibles < filtradosGlobal.length
    ) {
      if (_renderLock) return;
      _renderLock = true;

      const loader = document.getElementById("loader");
      if (loader) loader.style.display = "block";

      setTimeout(() => {
        registrosVisibles += 25;
        mostrar();
        _renderLock = false;
      }, 200);
    }
  }, { passive: true });
}

const movDiv = document.getElementById("movimientos");

if (movDiv && !movDiv.__scrollBound) {
  movDiv.__scrollBound = true;

function bindInfiniteScroll() {
  const lista = document.getElementById("lista");
  if (!lista || lista.__scrollBound) return;

  lista.__scrollBound = true;

  lista.addEventListener("scroll", () => {
    const scrollBottom = lista.scrollTop + lista.clientHeight;
    const contentHeight = lista.scrollHeight;

    if (
      scrollBottom >= contentHeight - 200 &&
      registrosVisibles < filtradosGlobal.length
    ) {
      if (_renderLock) return;
      _renderLock = true;

      const loader = document.getElementById("loader");
      if (loader) loader.style.display = "block";

      setTimeout(() => {
        registrosVisibles += 25;
        mostrar();
        _renderLock = false;
      }, 200);
    }
  }, { passive: true });
}

  // ==========================
  // CSV / BACKUPS / SW / DROPBOX / AUTOSYNC — Íntegro
  // ==========================
  const exportarCSV = () => {
    if (!movimientos || movimientos.length === 0) { alert("No hay datos para exportar."); return; }
    const SEP = ";";
    const toESDate = (iso) => { const [y,m,d] = (iso||"").split("-"); return (y&&m&&d)?`${d}/${m}/${y}`:(iso||""); };
    const csvCell = (v) => { let t=(v??"").toString().replace(/\r?\n/g,"⏎"); if(/[;"\n]/.test(t)) t='"'+t.replace(/"/g,'""')+'"'; return t; };

    const headers = ["Fecha","Origen","Categoria","Subcategoria","Importe","Descripcion"].join(SEP);
    const rows = movimientos.map(m => [toESDate(m.f), m.o||"", m.c||"", m.s||"", (Number(m.imp)||0), (m.d??"").trim()].map(csvCell).join(SEP));
    const csv = [headers, ...rows].join("\n");

    const hoy = new Date(),
          dd = String(hoy.getDate()).padStart(2,"0"),
          mm = String(hoy.getMonth()+1).padStart(2,"0"),
          yyyy = hoy.getFullYear();

    const fileName = `mis_gastos_${dd}${mm}${yyyy}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const importarCSV = (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const text = reader.result.replace(/^\uFEFF/,"");
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (!lines.length) { alert("El archivo está vacío."); return; }

        const header = lines[0];
        const counts = { tab:(header.match(/\t/g)||[]).length, semi:(header.match(/;/g)||[]).length, comma:(header.match(/,/g)||[]).length };
        let delim = "\t"; if (counts.semi>=counts.tab && counts.semi>=counts.comma) delim=";"; else if (counts.comma>=counts.tab) delim=",";

        const parseLine = (line) => {
          const out=[]; let cur="", inQ=false;
          for(let i=0;i<line.length;i++){
            const ch=line[i];
            if(ch=='"'){
              if(inQ && line[i+1]=='"'){ cur+='"'; i++; } else inQ=!inQ;
            } else if(ch===delim && !inQ){
              out.push(cur); cur="";
            } else { cur+=ch; }
          }
          out.push(cur); return out;
        };

        const cols = parseLine(header).map(h=>h.trim().toLowerCase());
        const idx = {
          fecha: cols.findIndex(c => c.startsWith("fecha")),
          origen: cols.findIndex(c => c.startsWith("origen")),
          categoria: cols.findIndex(c => c.startsWith("categoria")),
          subcategoria: cols.findIndex(c => c.startsWith("subcategoria")),
          importe: cols.findIndex(c => c.startsWith("importe")),
          descripcion: cols.findIndex(c => c.startsWith("descripcion") || c.startsWith("descripción"))
        };

        const required = ["fecha","origen","categoria","subcategoria","importe"];
        const missing = required.filter(k => idx[k] < 0);
        if (missing.length) { alert("Faltan columnas: " + missing.join(", ")); return; }

        const toISODate = (ddmmyyyy) => {
          const m=ddmmyyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if(!m) return ddmmyyyy;
          return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        };
        const parseEuroNumber = (s) => {
          let t=(s||'').toString().trim();
          t=t.replace(/\.(?=\d{3}(?:\D|$))/g,''); // miles
          t=t.replace(',', '.'); // decimal
          const n=parseFloat(t); return isNaN(n)?0:n;
        };
        const cleanText = (s) => {
          if(!s) return "";
          let t=s.replace(/\\"{2,}/g,'"').trim();
          if(t.startsWith('"') && t.endsWith('"')) t=t.slice(1,-1);
          return t.trim();
        };

        const catIndexCanon = buildCanonIndex([...catBase, ...catExtra, ...NOMINA_CATS], []);
        const subIndexCanon = buildCanonIndex([...subMaestra, ...NOMINA_SUBS], []);
        const nuevos = [];

        for (let i = 1; i < lines.length; i++) {
          const arr = parseLine(lines[i]);
          if (arr.every(v => (v||'').trim()==='')) continue;

          const f = toISODate(cleanText(arr[idx.fecha] ?? ''));
          let o = cleanText(arr[idx.origen] ?? '');
          let c = mostrarBonito(cleanText(arr[idx.categoria] ?? ''));
          let s = mostrarBonito(cleanText(arr[idx.subcategoria] ?? ''));
          let d = cleanText(arr[idx.descripcion] ?? '');

          const oLow = o.toLowerCase();
          if (oLow.startsWith('nom')) o='Nómina'; else if (oLow.startsWith('gas')) o='Gasto'; else if (oLow.startsWith('ing')) o='Ingreso';

          const keyC = canonicalizeLabel(c), keyS = canonicalizeLabel(s);
          if (catIndexCanon.has(keyC)) c = catIndexCanon.get(keyC);
          if (subIndexCanon.has(keyS)) s = subIndexCanon.get(keyS);

          let imp = parseFloat(parseEuroNumber(arr[idx.importe] ?? '0'));
          if (o === 'Gasto' && imp > 0) imp = -Math.abs(imp);
          if (o !== 'Gasto' && imp < 0) imp = Math.abs(imp);

          const mov = { id:`id_${Date.now()}_${i}`, f, o, c, s, imp, d, ts: Date.now()+i };
          if (!f || !o || !c || !s || isNaN(imp)) continue;
          nuevos.push(mov);
        }

        const addIfNewCanon = (list, storeKey, value) => {
          const k = canonicalizeLabel(value);
          const exists = list.some(v => canonicalizeLabel(v) === k);
          if (!exists) { list.push(value); localStorage.setItem(storeKey, JSON.stringify(list)); }
        };

        nuevos.forEach(m=>{
          if (![...catBase, ...catExtra, ...NOMINA_CATS].some(v => canonicalizeLabel(v) === canonicalizeLabel(m.c)))
            addIfNewCanon(catExtra, 'categoriaExtra', m.c);
          if (![...subMaestra, ...NOMINA_SUBS].some(v => canonicalizeLabel(v) === canonicalizeLabel(m.s)))
            addIfNewCanon(subMaestra, 'subMaestra_v2', m.s);
        });

        movimientos = [...movimientos, ...nuevos].sort((a,b)=>new Date(b.f)-new Date(a.f));
        localStorage.setItem('movimientos', JSON.stringify(movimientos));
        scheduleSync('importarCSV');
        actualizarListas(); resetPagina(); mostrar();
        alert(`Importación completa: ${nuevos.length} registros añadidos.`);
      } catch (err) {
        console.error(err); alert("Error al importar el CSV. Revisa el formato.");
      } finally { e.target.value = ""; }
    };

    reader.onerror = () => alert("No se pudo leer el archivo.");
    reader.readAsText(file, 'UTF-8');
  };

  // ==========================
  // BACKUPS / INDICADOR / SW / DROPBOX / AUTOSYNC
  // ==========================
  async function createAndStoreLocalBackup(){
    const enc = await encryptBackup(buildBackupObject());
    const idx = ((parseInt(localStorage.getItem('backup_idx')||'0',10)) % 5) + 1;
    localStorage.setItem(`backup_${idx}`, JSON.stringify(enc));
    localStorage.setItem('backup_idx', String(idx));
    localStorage.setItem('backup_last_ts', String(Date.now()));
    updateBackupIndicator();
    return enc;
  }
  async function downloadEncryptedBackup(enc, filename='mis_gastos_backup.json'){
    const blob=new Blob([JSON.stringify(enc,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  const ejecutarBackupRotativo = async () => {
    try{
      const enc=await createAndStoreLocalBackup();
      await downloadEncryptedBackup(enc,'mis_gastos_backup.json');
    } catch(e){
      console.error("Backup automático falló:", e);
    }
  };
  function ensureBackupIndicator(){
    const top=document.querySelector('.topbar'); if (!top) return;
    if (!document.getElementById('backupIndicator')){
      const span=document.createElement('span');
      span.id='backupIndicator';
      span.className='backup-indicator';
      span.innerHTML=`<span class="dot"></span><span class="txt">Última copia: —</span>`;
      top.appendChild(span);
    }
  }
  function humanAgo(ts){
    if (!ts) return "—";
    const diff=Date.now()-ts, s=Math.floor(diff/1000);
    if (s<60) return `hace ${s}s`;
    const m=Math.floor(s/60); if (m<60) return `hace ${m}m`;
    const h=Math.floor(m/60); return `hace ${h}h`;
  }
  function updateBackupIndicator(){
    const el=document.getElementById('backupIndicator'); if (!el) return;
    const ts=parseInt(localStorage.getItem('backup_last_ts')||'0',10);
    el.querySelector('.txt').textContent=`Última copia: ${humanAgo(ts)}`;
    el.classList.remove('stale','old');
    if (!ts) el.classList.add('old');
    else {
      const mins=(Date.now()-ts)/60000;
      if (mins>1440) el.classList.add('old');
      else if (mins>60) el.classList.add('stale');
    }
  }
  setInterval(updateBackupIndicator, 60000);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('./sw.js').catch(function(err){
        console.error("SW ERROR:", err);
      });
    });
  }

  const DBX_APP_KEY      = 'pow1k3kk53abk75';
  const DBX_REDIRECT_URI = 'https://oskarlm.github.io/APK_V0.0/auth/dropbox/callback';
  const DBX_FILE_PATH    = '/mis_gastos_backup.json';
  const DBX_OAUTH_AUTHORIZE = 'https://www.dropbox.com/oauth2/authorize';
  const DBX_OAUTH_TOKEN     = 'https://api.dropboxapi.com/oauth2/token';
  const DBX_CONTENT         = 'https://content.dropboxapi.com/2';

  function dbx_b64Url(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes)))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  async function dbx_sha256Base64Url(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return dbx_b64Url(new Uint8Array(hash));
  }
  function dbx_randomString(len=64) {
    const arr = new Uint8Array(len); crypto.getRandomValues(arr);
    return Array.from(arr).map(b => ('0'+b.toString(16)).slice(-2)).join('');
  }
  function dbx_getTokens(){ try {return JSON.parse(localStorage.getItem('dbx_tokens')||'{}');} catch { return null; } }
  function dbx_setTokens(t){ localStorage.setItem('dbx_tokens', JSON.stringify(t||{})); }
  function dbx_clearTokens(){ localStorage.removeItem('dbx_tokens'); }

  async function dropboxStartLogin(){
    const code_verifier = dbx_randomString(64);
    const code_challenge = await dbx_sha256Base64Url(code_verifier);
    sessionStorage.setItem('dbx_code_verifier', code_verifier);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: DBX_APP_KEY,
      redirect_uri: DBX_REDIRECT_URI,
      code_challenge: code_challenge,
      code_challenge_method: 'S256',
      token_access_type: 'offline',
      scope: 'files.content.write files.content.read files.metadata.read'
    });
    window.location.href = `${DBX_OAUTH_AUTHORIZE}?${params.toString()}`;
  }

  async function dbx_getValidAccessToken(){
    let t = dbx_getTokens(); if (!t) return null;
    if (t.access_token && t.expires_at && Date.now() < t.expires_at) return t.access_token;
    if (t.refresh_token) {
      const body = new URLSearchParams({
        grant_type:'refresh_token',
        client_id:DBX_APP_KEY,
        refresh_token:t.refresh_token
      });
      const r = await fetch(DBX_OAUTH_TOKEN, {
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body
      });
      if (!r.ok) { dbx_clearTokens(); return null; }
      const j = await r.json();
      const expires_at = Date.now() + (j.expires_in ? j.expires_in*1000 : 3600*1000);
      const saved = { ...t, access_token:j.access_token, expires_in:j.expires_in, expires_at };
      dbx_setTokens(saved);
      return saved.access_token;
    }
    return t.access_token || null;
  }

  async function dropboxUploadEncryptedBackup(){
    try{
      let token = await dbx_getValidAccessToken();
      if (!token) { await dropboxStartLogin(); return; }

      const enc = await encryptBackup(buildBackupObject());
      const payload = JSON.stringify(enc, null, 2);

      const res = await fetch(`${DBX_CONTENT}/files/upload`, {
        method:'POST',
        headers:{
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: DBX_FILE_PATH, mode: 'overwrite', autorename: false, mute: true }),
          'Content-Type':'application/octet-stream'
        },
        body: new TextEncoder().encode(payload)
      });

      if (!res.ok) throw new Error(await res.text());
      localStorage.setItem('backup_last_ts', String(Date.now()));
      updateBackupIndicator?.();
      alert('✅ Copia subida a Dropbox.');
    }catch(e){
      console.error('Dropbox upload error:', e);
      alert(String(e?.message || e));
    }
  }

  async function dropboxDownloadAndRestore(){
    try{
      let token = await dbx_getValidAccessToken();
      if (!token) { await dropboxStartLogin(); return; }

      const res = await fetch(`${DBX_CONTENT}/files/download`, {
        method:'POST',
        headers:{
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: DBX_FILE_PATH })
        }
      });

      if (!res.ok) throw new Error(await res.text());
      const text = await res.text();
      let payload; try { payload = JSON.parse(text); } catch { throw new Error('El archivo no es JSON.'); }

      const data = (payload && payload.ct && payload.iv) ? await decryptBackup(payload) : payload;
      if (!data || !data.datos) throw new Error('Formato de copia inválido');

      movimientos = Array.isArray(data.datos.movimientos) ? data.datos.movimientos : [];
      catExtra    = Array.isArray(data.datos.catExtra) ? data.datos.catExtra : [];
      subMaestra  = Array.isArray(data.datos.subMaestra) ? data.datos.subMaestra : [];

      localStorage.setItem('movimientos', JSON.stringify(movimientos));
      localStorage.setItem('categoriaExtra', JSON.stringify(catExtra));
      localStorage.setItem('subMaestra_v2', JSON.stringify(subMaestra));
      localStorage.setItem('backup_last_ts', String(Date.now()));

      updateBackupIndicator?.();
      actualizarListas?.(); resetPagina?.(); mostrar?.();

      alert('✅ Copia restaurada desde Dropbox.');
    }catch(e){
      console.error('Dropbox download error:', e);
      alert(String(e?.message || e));
    }
  }

  function dropboxSignOut(){ dbx_clearTokens(); alert('Dropbox desconectado en este dispositivo.'); }

  // Auto‑sync
  let _syncTimer = null;
  async function autoSyncToDropbox(reason = 'changed') {
    try {
      if (!navigator.onLine) return;
      const token = await dbx_getValidAccessToken();
      if (!token) { await dropboxStartLogin(); return; }

      const enc = await encryptBackup(buildBackupObject());
      const payload = JSON.stringify(enc, null, 2);

      const res = await fetch(`${DBX_CONTENT}/files/upload`, {
        method:'POST',
        headers:{
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: DBX_FILE_PATH, mode: 'overwrite', autorename: false, mute: true }),
          'Content-Type':'application/octet-stream'
        },
        body: new TextEncoder().encode(payload)
      });

      if (!res.ok) { /* log */ return; }
      localStorage.setItem('backup_last_ts', String(Date.now()));
      updateBackupIndicator?.();
    } catch (e) { /* log */ }
  }
  function scheduleSync(reason = 'changed') {
    try { clearTimeout(_syncTimer); } catch {}
    _syncTimer = setTimeout(() => autoSyncToDropbox(reason), 1200);
  }
  async function loadFromDropboxOnStart({ silent = true } = {}) {
    try {
      if (!navigator.onLine) return;
      const token = await dbx_getValidAccessToken();
      if (!token) return;

      const res = await fetch(`${DBX_CONTENT}/files/download`, {
        method:'POST',
        headers:{
          'Authorization': `Bearer ${token}`,
          'Dropbox-API-Arg': JSON.stringify({ path: DBX_FILE_PATH })
        }
      });

      if (!res.ok) { return; }
      const text = await res.text();
      let payload; try { payload = JSON.parse(text); } catch { return; }

      const data = (payload && payload.ct && payload.iv) ? await decryptBackup(payload) : payload;
      if (!data || !data.datos) return;

      movimientos = Array.isArray(data.datos.movimientos) ? data.datos.movimientos : [];
      catExtra    = Array.isArray(data.datos.catExtra) ? data.datos.catExtra : [];
      subMaestra  = Array.isArray(data.datos.subMaestra) ? data.datos.subMaestra : [];

      localStorage.setItem('movimientos', JSON.stringify(movimientos));
      localStorage.setItem('categoriaExtra', JSON.stringify(catExtra));
      localStorage.setItem('subMaestra_v2', JSON.stringify(subMaestra));
      localStorage.setItem('backup_last_ts', String(Date.now()));

      updateBackupIndicator?.();
      actualizarListas?.(); resetPagina?.(); mostrar?.();
      if (!silent) alert('Datos cargados desde Dropbox.');

    } catch (e) { /* log */ }
  }
  window.addEventListener('online', () => scheduleSync('online'));

  // ==========================
  // EXPORTAR A GLOBAL (para HTML)
  // ==========================
  function resetTotal(){ /* noop */ }
  // PIN
  window.pressPin = pressPin; window.clearPin = clearPin; window.biometricAuth = biometricAuth;

  // Navegación y acciones
  window.resetPagina = resetPagina; window.mostrar = mostrar; window.abrirFormulario = abrirFormulario; window.volver = volver;
  window.eliminarRegistroActual = eliminarRegistroActual; window.exportarCSV = exportarCSV; window.importarCSV = importarCSV;
  window.manejarNuevo = manejarNuevo; window.borrarElemento = borrarElemento; window.abrirGraficos = abrirGraficos; window.ejecutarBackupRotativo = ejecutarBackupRotativo; window.init = init; window.actualizarListas = actualizarListas;

  // Vistas/Modo
  window.setModo = setModo; window.toggleCasa = toggleCasa;

  // Gráficos (drill)
  window.handleGraficoBarClick = handleGraficoBarClick; window.abrirDetalleMovs = abrirDetalleMovs;

  // Dropbox
  window.dropboxStartLogin = dropboxStartLogin; window.dropboxUploadEncryptedBackup = dropboxUploadEncryptedBackup; window.dropboxDownloadAndRestore = dropboxDownloadAndRestore; window.dropboxSignOut = dropboxSignOut;

  // Backup
  window.createAndStoreLocalBackup = createAndStoreLocalBackup;

  // imprescindible para onclick="guardar()"
  window.guardar = guardar;
}
