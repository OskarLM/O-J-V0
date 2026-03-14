// === main.js ===

/* ==========================
   BASES Y ESTADO GLOBAL
========================== */
const subBase = [
  "Accesorios","Agua","Aita","Ajuar / Electrodomésticos","Alojamiento","Apuestas y juegos","Atracciones","Ayuntamiento",
  "Barco","Cajero","Casa","Comida","Comisiones","Comunidad","Copas","Efectivo","Electrónica","Extraescolar","Farmacia",
  "Filamento","Garaje","Gas","Gasolina","Herramientas","Ikastola","Impresora","Impuestos","Juguetes / Regalos",
  "Libros / Material escolar","Luz","Mantenimiento","Medicamentos","Parking","Peaje","Préstamo","Reforma","Ropa",
  "Septiembre","Seguro","Suscripción","Suscripciones","Teléfono","Tren","Varios"
];
const catBase = ["Casa","Caravana","Coche","Compras","Efectivo","Escolar","Garaje","Restaurante","Vacaciones"];
const mesesLabel = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const origenBase = ["Ingreso","Gasto","Nómina"];
const NOMINA_CATS = ["Oskar","Josune"];
const NOMINA_SUBS = [...mesesLabel];

let movimientos = JSON.parse(localStorage.getItem('movimientos')) || [];
let catExtra = JSON.parse(localStorage.getItem('categoriaExtra')) || [];
let subMaestra = JSON.parse(localStorage.getItem('subMaestra_v2')) || subBase.slice();
let nBackup = parseInt(localStorage.getItem('nBackup')) || 1;

let registrosVisibles = 25;
let filtradosGlobal = [];
let pinActual = "";

/* ==========================
   PIN V0.1 (hasheado + intentos + cooldown)
========================== */
// Requiere utils.js: PIN_STORAGE_KEY, PIN_COOLDOWN_KEY, sha256, getAttempts, setAttempts, isInCooldown, setCooldown
async function ensureDefaultPinHash() {
  const pinHash = localStorage.getItem(PIN_STORAGE_KEY);
  if (!pinHash) {
    const h = await sha256("7143");
    localStorage.setItem(PIN_STORAGE_KEY, h);
  }
}

/* ==========================
   UTILIDADES / NORMALIZACIÓN
========================== */
const normalizeKey = (s) => (s ?? "")
  .toString().trim().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^\p{L}\p{N}]+/gu,' ')
  .replace(/\s+/g,' ').trim();

const singularizeWordEs = (w) => {
  if (w.endsWith('iones')) return w.slice(0,-5)+'ion';
  if (w.endsWith('ces')) return w.slice(0,-3)+'z';
  if (w.endsWith('es')) return w.slice(0,-2);
  if (/[aeiou]s$/.test(w)) return w.slice(0,-1);
  return w;
};
const canonicalizeLabel = (s) => {
  const raw = normalizeKey(s);
  return raw
    .split(/([\/-])/g)
    .map(tok => (tok==='/' || tok==='-') ? tok :
      tok.split(' ').map(singularizeWordEs).join(' '))
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
// Escape HTML
function esc(s){
  const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
  return (s ?? '').toString().replace(/[&<>"']/g, ch => map[ch]);
}

/* ==========================
   SEGURIDAD (PIN + Biometría)
========================== */
const updateDots = () => {
  document.querySelectorAll('.dot').forEach((d,i)=>d.classList.toggle('filled', i < pinActual.length));
};
const clearPin = () => { pinActual = ""; updateDots(); };

const unlock = () => {
  document.getElementById("authOverlay").style.display = "none";
  const m = document.getElementById("movimientos");
  m.classList.remove("hidden");
  m.dataset.permiso = "OK";
  init();
};

async function verifyAndUnlock(pinPlain) {
  const remainMs = isInCooldown();
  if (remainMs > 0) {
    const s = Math.ceil(remainMs / 1000);
    alert(`Has superado el número de intentos. Espera ${s} s e inténtalo de nuevo.`);
    return;
  }
  await ensureDefaultPinHash();
  const currentHash = localStorage.getItem(PIN_STORAGE_KEY);
  const givenHash = await sha256(pinPlain);
  if (givenHash === currentHash) {
    setAttempts(0);
    localStorage.removeItem(PIN_COOLDOWN_KEY);
    unlock();
  } else {
    const prev = getAttempts() + 1;
    setAttempts(prev);
    if (prev >= 5) {
      setCooldown(60); // 60s
      setAttempts(0);
      alert("Demasiados intentos fallidos. Bloqueo temporal de 60 segundos.");
    } else {
      alert("PIN incorrecto");
    }
  }
}

const pressPin = async (n) => {
  const remain = (typeof isInCooldown === 'function') ? isInCooldown() : 0;
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
};

const biometricAuth = async () => {
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
};

document.addEventListener('DOMContentLoaded', () => {
  ensureDefaultPinHash().catch(console.error);
  updateDots();
});

/* ==========================
   ICONOS Y CONTROL DE MODO
========================== */
function iconBars(){
  return `
  <svg viewBox="0 0 24 24" class="btn-icon" fill="none" stroke="black" stroke-width="3">
    <line x1="18" y1="20" x2="18" y2="10"></line>
    <line x1="12" y1="20" x2="12" y2="4"></line>
    <line x1="6" y1="20" x2="6" y2="14"></line>
  </svg>`;
}
function iconBack(){
  return `
  <svg viewBox="0 0 24 24" class="btn-icon" fill="none" stroke="black" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 19l-7-7 7-7"></path>
  </svg>`;
}
function iconGraph2(){
  return `
  <svg viewBox="0 0 24 24" class="btn-icon" fill="none" stroke-width="2.6">
    <rect x="6" y="7" width="4" height="10" fill="#ef4444" stroke="#ef4444" rx="1"></rect>
    <rect x="14" y="5" width="4" height="12" fill="#22c55e" stroke="#22c55e" rx="1"></rect>
  </svg>`;
}
function iconCasa(){
  return `
  <svg viewBox="0 0 24 24">
    <path d="M3 10.5 L12 3 L21 10.5" />
    <path d="M5 10.5 V20 H10 V15 H14 V20 H19 V10.5" />
  </svg>`;
}
function setModo(modo){
  const m = document.getElementById("movimientos");
  m.dataset.modo = modo;   // "lista" | "graficos" | "graficos2"
  resetPagina();
  mostrar();
}

/* ==========================
   BOTÓN "CASA"
========================== */
let hideCasa = false;
function toggleCasa(){
  hideCasa = !hideCasa;
  const m = document.getElementById("movimientos");
  if (m && (m.dataset.modo === "graficos" || m.dataset.modo === "graficos2")) {
    mostrar();
  }
}
function isCasaCategory(cat){
  const k = canonicalizeLabel(cat || "");
  return (
    k.includes("compra casa") ||
    k.includes("compra garaje") ||
    k.includes("venta casa")
  );
}

/* ==========================
   VISTA LISTA / GRÁFICOS / GRÁFICOS2
========================== */
function mostrar() {
  const movDiv = document.getElementById("movimientos");
  if (!movDiv || movDiv.dataset.permiso !== "OK") return;

  const fs = ["filtroMes","filtroAño","filtroCat","filtroSub","filtroOri"].map(id => document.getElementById(id).value);

  // Filtrado base para vistas
  filtradosGlobal = movimientos
    .filter(m => {
      const d = m.f.split("-");
      const cM = fs[0] === "TODOS" || (parseInt(d[1]) - 1).toString() === fs[0];
      const cA = fs[1] === "TODOS" || d[0] === fs[1];
      const cC = fs[2] === "TODAS" || m.c === fs[2];
      const cS = fs[3] === "TODAS" || m.s === fs[3];
      const cO = fs[4] === "TODOS" || m.o === fs[4];
      return cM && cA && cC && cS && cO;
    })
    .sort((a,b) => new Date(b.f) - new Date(a.f));

  // Balance (con toggle Casa aplicado)
  let t = 0;
  filtradosGlobal
    .filter(m => hideCasa ? !isCasaCategory(m.c) : true)
    .forEach(m => t += m.imp);

  const factor = (fs[0] === "TODOS") ? 12 : 1;
  const bD = document.getElementById("balance");
  bD.innerText = t.toFixed(2) + " €";
  if (t < 0) bD.style.color = "var(--danger)";
  else if (t <= (750 * factor)) bD.style.color = "var(--warning)";
  else if (t <= (1400 * factor)) bD.style.color = "var(--success)";
  else bD.style.color = "var(--electric-blue)";

  // === FOOTER DINÁMICO (3 botones .plus en el grid) ===
  const btnLeft  = document.querySelector(".footer-row .plus:nth-child(1)");
  const btnCenter= document.querySelector(".footer-row .plus:nth-child(2)");
  const btnRight = document.querySelector(".footer-row .plus:nth-child(3)");

  const modo = movDiv.dataset.modo || "lista";

  function aplicarEstadoCasa(){ if (btnCenter) btnCenter.classList.toggle("active", !!hideCasa); }

  [btnLeft, btnCenter, btnRight].forEach(b=>{
    if (!b) return;
    b.onclick = null; b.style.opacity="1";
    b.classList.remove("plus-like","btn-house-anim","active");
  });

  if (modo === "graficos") {
    // ← Atrás
    if (btnLeft){ btnLeft.innerHTML = iconBack(); btnLeft.onclick = () => setModo("lista"); }
    // ○ Casa (centro)
    if (btnCenter){
      btnCenter.innerHTML = iconCasa();
      btnCenter.classList.add("btn-house-anim");
      btnCenter.onclick = () => { toggleCasa(); aplicarEstadoCasa(); };
      aplicarEstadoCasa();
    }
    // → Gráficos 2 (derecha)
    if (btnRight){ btnRight.innerHTML = iconGraph2(); btnRight.onclick = () => setModo("graficos2"); }

  } else if (modo === "graficos2") {
    // ← Atrás
    if (btnLeft){ btnLeft.innerHTML = iconBack(); btnLeft.onclick = () => setModo("graficos"); }
    // ○ Casa (centro)
    if (btnCenter){
      btnCenter.innerHTML = iconCasa();
      btnCenter.classList.add("btn-house-anim");
      btnCenter.onclick = () => { toggleCasa(); aplicarEstadoCasa(); };
      aplicarEstadoCasa();
    }
    // → Vacío (sin +)
    if (btnRight){ btnRight.innerHTML = ""; btnRight.style.opacity = "0"; btnRight.onclick = null; }

  } else { // LISTA
    // ← Botón “Gráficos” con estética de “+”
    if (btnLeft){ btnLeft.innerHTML = iconBars(); btnLeft.classList.add("plus-like"); btnLeft.onclick = () => setModo("graficos"); }
    // ○ +
    if (btnCenter){ btnCenter.innerHTML = "+"; btnCenter.onclick = () => abrirFormulario(); }
    // → vacío
    if (btnRight){ btnRight.innerHTML = ""; btnRight.onclick = null; }
  }

  // Render contenido
  const listaDiv = document.getElementById("lista");
  if (modo === "graficos" || modo === "graficos2") {
    // (Casa está en footer) → limpiamos la zona superior
    listaDiv.innerHTML = "";
    if (modo === "graficos") {
      renderizarBarrasGraficos((fs[0] === "TODOS") ? 12 : 1);
    } else {
      renderizarGraficos2();
    }
  } else {
    // LISTA
    listaDiv.innerHTML = filtradosGlobal
      .slice(0, registrosVisibles)
      .map(m => `
      <div class='card' onclick="abrirFormulario('${m.id}')" style="border-left-color:${m.imp >= 0 ? 'var(--success)' : 'var(--danger)'}">
        <div class="meta">${esc(m.f.split("-").reverse().join("/"))} • ${esc(m.o)}</div>
        <b>${esc(m.c)} - ${esc(m.s)}</b>
        ${m.d ? `<div style="font-size:12px;opacity:.8">${esc(m.d)}</div>` : ''}
        <div class="monto" style="color:${m.imp >= 0 ? 'var(--success)' : 'var(--danger)'}">${m.imp.toFixed(2)} €</div>
      </div>`).join("");
    document.getElementById("loader").style.display = "none";
  }

  // Indicador copia
  ensureBackupIndicator();
  updateBackupIndicator();
}

/* ==========================
   GRÁFICOS 1: CATEGORÍAS ↔ SUBCATEGORÍAS (Opción C) + DRILL-DOWN
========================== */
function renderizarBarrasGraficos(f) {
  const lista = document.getElementById("lista");
  const elFC = document.getElementById("filtroCat");
  const filtroCat = (elFC && elFC.value) || "TODAS";

  let fuente = filtradosGlobal.slice();
  if (hideCasa) fuente = fuente.filter(m => !isCasaCategory(m.c));

  const totales = {};
  if (filtroCat === "TODAS") {
    fuente.filter(m => m.imp < 0).forEach(m => { totales[m.c] = (totales[m.c] || 0) + Math.abs(m.imp); });
  } else {
    fuente.filter(m => m.imp < 0 && m.c === filtroCat).forEach(m => { totales[m.s] = (totales[m.s] || 0) + Math.abs(m.imp); });
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
      <div class="card"
           style="border:none;background:transparent;cursor:pointer"
           data-label="${esc(label)}"
           onclick="handleGraficoBarClick(this.dataset.label)">
        <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:5px">
          <span>${esc(label)}</span><b>${val.toFixed(2)} €</b>
        </div>
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
  if (actual === 'TODAS') {
    if (selCat) selCat.value = label;
    resetPagina(); mostrar();
    return;
  }
  abrirDetalleMovs(actual, label);
}

function abrirDetalleMovs(categoria, subcategoria){
  try {
    let base = filtradosGlobal.slice();
    if (hideCasa) base = base.filter(m => !isCasaCategory(m.c));
    const lista = base.filter(m => m.imp < 0 && m.c === categoria && m.s === subcategoria)
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

/* ==========================
   GRÁFICOS 2: Columnas + Animación + Tooltip + Colores por BALANCE
========================== */
function renderizarGraficos2() {
  const lista = document.getElementById("lista");
  const oldChart = lista.querySelector('.g2-wrap'); if (oldChart) oldChart.remove();

  const fs = ["filtroMes","filtroAño","filtroCat","filtroSub","filtroOri"].map(id => document.getElementById(id).value);
  const hoy = new Date();
  const meses = [];
  for (let i = 12; i >= 0; i--) {
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
  for (const mov of base) {
    const k = (mov.f || "").slice(0,7);
    if (!meses.some(x => x.key === k)) continue;
    sumaMes.set(k, (sumaMes.get(k) || 0) + (Number(mov.imp) || 0));
  }

  const valores = meses.map(m => sumaMes.get(m.key) || 0);
  const maxAbs = Math.max(...valores.map(v => Math.abs(v)), 1);
  const alto = 180, mitad = alto/2, maxDespl = Math.max(mitad - 8, 40), minBar = 4;

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
    const h = Math.max(minBar, (Math.abs(v)/maxAbs)*maxDespl);
    const pos = v >= 0;
    const color = colorPorMes(v);
    const mesIdx = new Date(m.key + "-01T00:00:00").getMonth();
    const label  = mesesCorta[mesIdx];
    const tipClass = pos ? 'tip-pos' : 'tip-neg';
    const tipText  = `${label} ${m.d.getFullYear()}: ${fmtEuro(v)}`;

    html += `
      <div class="g2-col" data-key="${m.key}" style="position:relative;height:100%;">
        <div class="g2-bar ${pos ? 'pos' : 'neg'}" data-h="${h}" style="height:0px;background:${color};"></div>
        <div class="g2-tip ${tipClass}">${tipText}</div>
        <div class="g2-label" style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--primary)">${label}</div>
      </div>
    `;
  }
  html += `</div></div>`;
  lista.insertAdjacentHTML('beforeend', html);

  requestAnimationFrame(()=>{
    lista.querySelectorAll('.g2-chart .g2-bar').forEach(el=>{
      const target = parseFloat(el.dataset.h) || 0;
      el.style.height = `${target}px`;
    });
  });

  const chart = lista.querySelector('.g2-chart');
  if (!chart) return;
  if (!chart.dataset.tipBound){
    chart.addEventListener('click', (ev)=>{
      const col = ev.target.closest('.g2-col');
      if (!col) return;
      chart.querySelectorAll('.g2-col.show-tip').forEach(c => { if (c!==col) c.classList.remove('show-tip'); });
      col.classList.toggle('show-tip');
    });
    document.addEventListener('click', (ev)=>{
      if (!chart.contains(ev.target)) chart.querySelectorAll('.g2-col.show-tip').forEach(c => c.classList.remove('show-tip'));
    });
    chart.dataset.tipBound = '1';
  }
}

/* ==========================
   FORMULARIO / CRUD
========================== */
const llenar = (id, base, extra, pre = "", opts = {}) => {
  const s = document.getElementById(id);
  const origenActual = opts.origenActual || "";
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
  if (pre && !values.includes(pre)) {
    s.innerHTML += `<option value="${pre}" selected hidden>${pre}</option>`;
  }
  if (id !== "origen") s.innerHTML += `<option value="+">+ Añadir nuevo...</option>`;
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
    if (NOMINA_CATS.includes(m.c)) {
      llenar("categoria", catBase, catExtra);
      document.getElementById("categoria").innerHTML += `<option value="${m.c}" selected>${m.c}</option>`;
    } else {
      llenar("categoria", catBase, catExtra, m.c, { origenActual: m.o });
    }
    if (m.o === "Nómina") {
      document.getElementById("subcategoria").innerHTML = `<option value="${m.s}" selected>${m.s}</option>`;
    } else {
      llenar("subcategoria", subMaestra, [], m.s, { origenActual: m.o });
    }
    document.getElementById("importe").value = Math.abs(m.imp);
    document.getElementById("descripcion").value = m.d || "";
    btnD.classList.remove("hidden");
  } else {
    document.getElementById("editId").value = "";
    document.getElementById("importe").value = "";
    document.getElementById("descripcion").value = "";
    document.getElementById("fecha").value = new Date().toISOString().split("T")[0];
    llenar("origen", origenBase, []);
    const oSel = document.getElementById("origen").value || "";
    llenar("categoria", catBase, catExtra, "", { origenActual: oSel });
    llenar("subcategoria", subMaestra, [], "", { origenActual: oSel });
    btnD.classList.add("hidden");
  }
  f.classList.remove("hidden");
  mDiv.classList.add("hidden");
};

const guardar = () => {
  const ids = ["editId","origen","categoria","subcategoria","fecha","descripcion","importe"];
  // ✅ FIX: clave computada [id] (evita Unexpected token '(')
  const v = ids.reduce((acc,id)=>({
    ...acc,
    [id]: (document.getElementById(id) ? document.getElementById(id).value : "")
  }),{});
  const imp = parseFloat(v.importe);
  if (!v.origen || !v.categoria || !v.subcategoria || isNaN(imp)) return alert("Faltan datos");

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

const volver = () => {
  document.getElementById("form").classList.add("hidden");
  document.getElementById("movimientos").classList.remove("hidden");
  actualizarListas();
  mostrar();
};

/* === “+ Añadir nuevo…” SIN prompt(): popup premium entrega valor === */
const manejarNuevo = (el, tipo) => {
  if (el.value !== "+") return;
  let n = el.dataset.nuevoValor || "";
  el.dataset.nuevoValor = "";
  if (!n) { el.value = ""; return; }

  const pretty = mostrarBonito(n.trim());
  const keyNew = canonicalizeLabel(pretty);

  if (tipo === "categoria") {
    const catIdx = buildCanonIndex(catBase, catExtra);
    if (NOMINA_CATS.some(x => canonicalizeLabel(x) === keyNew)) {
      alert("No puedes crear manualmente 'Oskar' ni 'Josune'. Selecciona 'Nómina'.");
      el.value = "";
      return;
    }
    if (!catIdx.has(keyNew)) {
      catExtra.push(pretty);
      localStorage.setItem('categoriaExtra', JSON.stringify(catExtra));
    }
    const origenActual = document.getElementById("origen").value || "";
    llenar("categoria", catBase, catExtra, pretty, { origenActual });
  } else {
    const subIdx = buildCanonIndex(subMaestra, []);
    if (!subIdx.has(keyNew)) {
      subMaestra.push(pretty);
      localStorage.setItem('subMaestra_v2', JSON.stringify(subMaestra));
    }
    const origenActual = document.getElementById("origen").value || "";
    llenar("subcategoria", subMaestra, [], pretty, { origenActual });
  }
};

const borrarElemento = (tipo) => {
  const select = document.getElementById(tipo);
  const val = select.value;
  if (!val) return;

  if (tipo === 'categoria') {
    const idx = catExtra.indexOf(val);
    if (idx >= 0) {
      catExtra.splice(idx,1);
      localStorage.setItem('categoriaExtra', JSON.stringify(catExtra));
      const origenActual = document.getElementById("origen").value || "";
      llenar('categoria', catBase, catExtra, "", { origenActual });
    } else {
      alert('Solo puedes borrar categorías añadidas por ti.');
    }
  } else if (tipo === 'subcategoria') {
    const idx = subMaestra.indexOf(val);
    if (idx >= 0) {
      subMaestra.splice(idx,1);
      localStorage.setItem('subMaestra_v2', JSON.stringify(subMaestra));
      const origenActual = document.getElementById("origen").value || "";
      llenar('subcategoria', subMaestra, [], "", { origenActual });
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

  fC.innerHTML = '<option value="TODAS">Cat: TODAS</option>';
  [...new Set([...catBase, ...catExtra, ...NOMINA_CATS])].sort().forEach(c => fC.add(new Option(c, c)));
  fS.innerHTML = '<option value="TODAS">Sub: TODAS</option>';
  [...new Set([...subMaestra, ...NOMINA_SUBS])].sort().forEach(s => fS.add(new Option(s, s)));
  fO.innerHTML = '<option value="TODOS">Ori: TODOS</option>';
  origenBase.forEach(o => fO.add(new Option(o, o)));
};

/* ==========================
   NORMALIZACIÓN RETROACTIVA
========================== */
function normalizarListasExistentes(){
  const vistosCat = new Set(Object.values(catBase).map(v => canonicalizeLabel(v)));
  const nuevaExtra = [];
  [...new Set(catExtra)].forEach(v=>{
    const k = canonicalizeLabel(v);
    if (vistosCat.has(k)) return;
    if (![...NOMINA_CATS.map(canonicalizeLabel)].includes(k)){
      if (!nuevaExtra.some(x => canonicalizeLabel(x)===k)) nuevaExtra.push(v);
      vistosCat.add(k);
    }
  });
  catExtra = nuevaExtra;
  localStorage.setItem('categoriaExtra', JSON.stringify(catExtra));

  const vistosSub = new Set();
  const nuevasSubs = [];
  subMaestra.forEach(v=>{
    const k = canonicalizeLabel(v);
    if (!vistosSub.has(k)) {
      vistosSub.add(k);
      nuevasSubs.push(v);
    }
  });
  subMaestra = nuevasSubs;
  localStorage.setItem('subMaestra_v2', JSON.stringify(subMaestra));

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

/* ==========================
   INIT + SCROLL
========================== */
const init = () => {
  const fM = document.getElementById("filtroMes"),
        fA = document.getElementById("filtroAño"),
        hoy = new Date();

  fM.innerHTML = '<option value="TODOS">Mes: TODOS</option>';
  mesesLabel.forEach((m, i) => fM.add(new Option(m, i)));
  fM.value = hoy.getMonth();

  fA.innerHTML = '<option value="TODOS">Año: TODOS</option>';
  for (let a = 2020; a <= 2030; a++) fA.add(new Option(a, a));
  fA.value = hoy.getFullYear();

  normalizarListasExistentes();
  actualizarListas();
  mostrar();
};
window.onscroll = () => {
  if (document.getElementById("movimientos").dataset.modo === "graficos") return;
  if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200 && registrosVisibles < filtradosGlobal.length) {
    document.getElementById("loader").style.display = "block";
    setTimeout(() => { registrosVisibles += 25; mostrar(); }, 200);
  }
};

/* ==========================
   CSV: EXPORTACIÓN / IMPORTACIÓN
========================== */
const exportarCSV = () => {
  if (!movimientos || movimientos.length === 0) { alert("No hay datos para exportar."); return; }
  const SEP = ";";
  const toESDate = (iso) => { const [y,m,d] = (iso||"").split("-"); return (y&&m&&d)?`${d}/${m}/${y}`:(iso||""); };
  const csvCell = (v) => { let t=(v??"").toString().replace(/\r?\n/g,"⏎"); if(/[;"\n]/.test(t)) t='"'+t.replace(/"/g,'""')+'"'; return t; };
  const headers = ["Fecha","Origen","Categoria","Subcategoria","Importe","Descripcion"].join(SEP);
  const rows = movimientos.map(m => [toESDate(m.f), m.o||"", m.c||"", m.s||"", (Number(m.imp)||0), (m.d??"").trim()].map(csvCell).join(SEP));
  const csv = [headers, ...rows].join("\n");
  const hoy = new Date(), dd=String(hoy.getDate()).padStart(2,"0"), mm=String(hoy.getMonth()+1).padStart(2,"0"), yyyy=hoy.getFullYear();
  const fileName = `mis_gastos_${dd}${mm}${yyyy}.csv`;
  const blob = new Blob([csv], { type: "textharset=utf-8;" });
  const url = URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=fileName;
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

      const parseLine = (line) => { const out=[]; let cur="", inQ=false; for(let i=0;i<line.length;i++){ const ch=line[i];
        if(ch==='"'){ if(inQ && line[i+1]==='"'){ cur+='"'; i++; } else inQ=!inQ; }
        else if(ch===delim && !inQ){ out.push(cur); cur=""; }
        else { cur+=ch; } } out.push(cur); return out; };

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

      const toISODate = (ddmmyyyy) => { const m=ddmmyyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if(!m) return ddmmyyyy; return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; };
      const parseEuroNumber = (s) => { let t=(s||'').toString().trim(); t=t.replace(/\.(?=\d{3}(?:\D|$))/g,''); t=t.replace(',', '.'); const n=parseFloat(t); return isNaN(n)?0:n; };
      const cleanText = (s) => { if(!s) return ""; let t=s.replace(/\\"{2,}/g,'"').trim(); if(t.startsWith('"') && t.endsWith('"')) t=t.slice(1,-1); return t.trim(); };

      const catIndexCanon = buildCanonIndex([...catBase, ...catExtra, ...NOMINA_CATS], []);
      const subIndexCanon = buildCanonIndex([...subMaestra, ...NOMINA_SUBS], []);
      const nuevos = [];

      for (let i = 1; i < lines.length; i++) {
        const arr = parseLine(lines[i]); if (arr.every(v => (v||'').trim()==='')) continue;

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
        if (![...catBase, ...catExtra, ...NOMINA_CATS].some(v => canonicalizeLabel(v) === canonicalizeLabel(m.c))) addIfNewCanon(catExtra, 'categoriaExtra', m.c);
        if (![...subMaestra, ...NOMINA_SUBS].some(v => canonicalizeLabel(v) === canonicalizeLabel(m.s))) addIfNewCanon(subMaestra, 'subMaestra_v2', m.s);
      });

      movimientos = [...movimientos, ...nuevos].sort((a,b)=>new Date(b.f)-new Date(a.f));
      localStorage.setItem('movimientos', JSON.stringify(movimientos));
      actualizarListas(); resetPagina(); mostrar();

      alert(`Importación completa: ${nuevos.length} registros añadidos.`);
    } catch (err) {
      console.error(err); alert("Error al importar el CSV. Revisa el formato.");
    } finally { e.target.value = ""; }
  };
  reader.onerror = () => alert("No se pudo leer el archivo.");
  reader.readAsText(file, 'UTF-8');
};

/* ==========================
   POPUPS (Premium / Nómina)
========================== */
(function(){
  const lanzarPopupPremium = (el,tipo) => {
    const overlay=document.createElement('div'); overlay.className='premium-overlay';
    overlay.innerHTML=`<div class="premium-content">
      <div class="premium-title">NUEVO VALOR</div>
      <input type="text" id="val_premium" class="premium-input" autofocus placeholder="..." />
      <button class="btn-gold" id="confirm_premium">AÑADIR</button>
      <button class="btn-silver" id="cancel_premium">CANCELAR</button>
    </div>`;
    document.body.appendChild(overlay);
    const close = ()=> overlay.remove();
    document.getElementById('confirm_premium').onclick=()=>{
      const n=(document.getElementById('val_premium').value||"").trim();
      if(n){ const select=el; select.dataset.nuevoValor = n; select.value = "+"; close(); setTimeout(()=>manejarNuevo(select, select.id),0); }
      else close();
    };
    document.getElementById('cancel_premium').onclick=()=>{ el.value=""; close(); };
  };
  document.addEventListener('change',(e)=>{
    if((e.target.id==='categoria'||e.target.id==='subcategoria') && e.target.value === "+"){
      e.stopImmediatePropagation(); lanzarPopupPremium(e.target,e.target.id);
    }
  },true);
})();

(function(){
  const lanzarPopupNomina = () => {
    const overlay=document.createElement('div'); overlay.className='nomina-overlay';
    overlay.innerHTML=`<div class="nomina-content">
      <div class="nomina-title">¿QUIÉN COBRA?</div>
      <button class="btn-nomina btn-oskar" id="btn_oskar">OSKAR</button>
      <button class="btn-nomina btn-josune" id="btn_josune">JOSUNE</button>
      <button class="btn-nomina btn-cancel" id="btn_cancel_nom">CANCELAR</button>
    </div>`;
    document.body.appendChild(overlay);
    const close = ()=> overlay.remove();
    document.getElementById('btn_oskar').onclick=()=>{ document.getElementById("categoria").innerHTML=`<option value="Oskar" selected>Oskar</option>`; close(); };
    document.getElementById('btn_josune').onclick=()=>{ document.getElementById("categoria").innerHTML=`<option value="Josune" selected>Josune</option>`; close(); };
    document.getElementById('btn_cancel_nom').onclick=()=>{ document.getElementById("origen").value="Gasto";
      llenar('categoria',catBase,catExtra,"",{origenActual:"Gasto"}); llenar('subcategoria',subMaestra,[], "",{origenActual:"Gasto"}); close(); };
  };

  document.addEventListener('change',(e)=>{
    if(e.target.id === 'origen'){
      const o = e.target.value;
      if (o === "Nómina") {
        const fVal = document.getElementById("fecha").value || new Date().toISOString().split("T")[0];
        const mIdx = new Date(fVal + "T00:00:00").getMonth();
        document.getElementById("subcategoria").innerHTML = `<option value="${mesesLabel[mIdx]}" selected>${mesesLabel[mIdx]}</option>`;
        lanzarPopupNomina();
      } else {
        llenar('categoria',catBase,catExtra,"",{origenActual:o});
        llenar('subcategoria',subMaestra,[], "",{origenActual:o});
      }
    }
  },true);
})();

/* ==========================
   ELIMINAR REGISTRO
========================== */
window.eliminarRegistroActual = function(){
  const idAEliminar = document.getElementById("editId").value;
  if (!idAEliminar) return;
  if (confirm("¿ESTÁS SEGURO DE QUE DESEAS ELIMINAR ESTE REGISTRO?")) {
    movimientos = movimientos.filter(m => m.id.toString() !== idAEliminar.toString());
    localStorage.setItem('movimientos', JSON.stringify(movimientos));
    volver();
  }
};

/* ==========================
   BACKUPS (cifrado con el PIN, rotativo, auto-descarga, OneDrive)
========================== */
function hexToBytes(hex){ const a=[]; for(let i=0;i<hex.length;i+=2) a.push(parseInt(hex.slice(i,i+2),16)); return new Uint8Array(a); }
function bytesToBase64(bytes){ if (typeof btoa==='function'){ let bin=''; bytes.forEach(b=>bin+=String.fromCharCode(b)); return btoa(bin); } else { return Buffer.from(bytes).toString('base64'); } }
function base64ToBytes(b64){ if (typeof atob==='function'){ const bin=atob(b64); const out=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out; } else { return new Uint8Array(Buffer.from(b64,'base64')); } }

async function getAesKeyFromPin(){
  await ensureDefaultPinHash();
  const hex = localStorage.getItem(PIN_STORAGE_KEY);
  const keyBytes = hexToBytes(hex);
  return await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt','decrypt']);
}
function buildBackupObject(){
  return { meta:{ createdAt:new Date().toISOString(), app:"mis-gastos", version:"V1.0.24" },
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
async function createAndStoreLocalBackup(){
  const enc = await encryptBackup(buildBackupObject());
  const idx = ((parseInt(localStorage.getItem('backup_idx')||'0',10)) % 5) + 1;
  localStorage.setItem(`backup_${idx}`, JSON.stringify(enc));
  localStorage.setItem('backup_idx', String(idx));
  localStorage.setItem('backup_last_ts', String(Date.now()));
  updateBackupIndicator();
  return enc;
}
async function downloadEncryptedBackup(enc, prefix='auto_backup'){
  const d=new Date(); const YYYY=d.getFullYear(), MM=String(d.getMonth()+1).padStart(2,'0'), DD=String(d.getDate()).padStart(2,'0');
  const hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0');
  const filename=`${prefix}_${YYYY}-${MM}-${DD}_${hh}-${mm}.json`;
  const blob=new Blob([JSON.stringify(enc,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
const ejecutarBackupRotativo = async () => {
  try{ const enc=await createAndStoreLocalBackup(); await downloadEncryptedBackup(enc,'auto_backup'); }
  catch(e){ console.error("Backup automático falló:", e); }
};
async function guardarCopiaEnOneDrive(){
  try{
    const enc = await encryptBackup(buildBackupObject());
    const d=new Date(); const YYYY=d.getFullYear(), MM=String(d.getMonth()+1).padStart(2,'0'), DD=String(d.getDate()).padStart(2,'0');
    const hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0');
    const filename=`backup_onedrive_${YYYY}-${MM}-${DD}_${hh}-${mm}.json`;
    const blob=new Blob([JSON.stringify(enc,null,2)],{type:'application/json'});

    if (window.showSaveFilePicker){
      const handle = await window.showSaveFilePicker({ suggestedName:filename, types:[{description:"JSON Backup", accept:{"application/json":[".json"]}}] });
      const writable = await handle.createWritable(); await writable.write(blob); await writable.close();
      localStorage.setItem('backup_last_ts', String(Date.now())); updateBackupIndicator();
      alert("📁 Copia guardada. Elige una carpeta OneDrive en el selector para sincronizar.");
    } else {
      const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      localStorage.setItem('backup_last_ts', String(Date.now())); updateBackupIndicator();
      alert("Se ha descargado el backup (tu navegador no permite selección de carpeta).");
    }
  }catch(e){ console.error(e); alert("No se pudo guardar la copia de seguridad."); }
}
async function restaurarCopiaDeOneDrive(){
  try{
    let file=null;
    if (window.showOpenFilePicker){
      const [handle] = await window.showOpenFilePicker({ multiple:false, types:[{description:"JSON Backup", accept:{"application/json":[".json"]}}] });
      file = await handle.getFile();
    } else {
      file = await new Promise((resolve,reject)=>{
        const inp=document.createElement('input'); inp.type='file'; inp.accept='application/json';
        inp.onchange=()=>resolve(inp.files[0]); inp.click(); setTimeout(()=>{ if(!inp.files || !inp.files[0]) reject(new Error("No file")); },20000);
      });
    }
    const text=await file.text(); const payload=JSON.parse(text);
    const data = (payload && payload.ct && payload.iv) ? await decryptBackup(payload) : payload;
    if (!data || !data.datos) throw new Error("Formato de copia inválido");

    movimientos = Array.isArray(data.datos.movimientos) ? data.datos.movimientos : [];
    catExtra    = Array.isArray(data.datos.catExtra)    ? data.datos.catExtra    : [];
    subMaestra  = Array.isArray(data.datos.subMaestra)  ? data.datos.subMaestra  : [];
    localStorage.setItem('movimientos', JSON.stringify(movimientos));
    localStorage.setItem('categoriaExtra', JSON.stringify(catExtra));
    localStorage.setItem('subMaestra_v2', JSON.stringify(subMaestra));
    localStorage.setItem('backup_last_ts', String(Date.now())); updateBackupIndicator();

    actualizarListas(); resetPagina(); mostrar();
    alert("✅ Copia restaurada correctamente.");
  }catch(e){
    if (e && e.name === "AbortError") return;
    console.error(e); alert("No se pudo restaurar la copia. ¿PIN correcto? ¿Archivo válido?");
  }
}
function ensureBackupIndicator(){
  const top=document.querySelector('.topbar'); if (!top) return;
  if (!document.getElementById('backupIndicator')){
    const span=document.createElement('span'); span.id='backupIndicator'; span.className='backup-indicator';
    span.innerHTML=`<span class="dot"></span><span class="txt">Última copia: —</span>`; top.appendChild(span);
  }
}
function humanAgo(ts){ if (!ts) return "—"; const diff=Date.now()-ts, s=Math.floor(diff/1000); if (s<60) return `hace ${s}s`;
  const m=Math.floor(s/60); if (m<60) return `hace ${m}m`; const h=Math.floor(m/60); return `hace ${h}h`; }
function updateBackupIndicator(){
  const el=document.getElementById('backupIndicator'); if (!el) return;
  const ts=parseInt(localStorage.getItem('backup_last_ts')||'0',10);
  el.querySelector('.txt').textContent=`Última copia: ${humanAgo(ts)}`;
  el.classList.remove('stale','old');
  if (!ts) el.classList.add('old');
  else { const mins=(Date.now()-ts)/60000; if (mins>1440) el.classList.add('old'); else if (mins>60) el.classList.add('stale'); }
}
setInterval(updateBackupIndicator, 60000);

/* ==========================
   REGISTRO SERVICE WORKER (PWA)
========================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error("SW ERROR:", err));
  });
}

/* ==========================
   EXPONER FUNCIONES AL GLOBAL
========================== */
// PIN
window.pressPin = pressPin;
window.clearPin = clearPin;
window.biometricAuth = biometricAuth;
// Navegación y acciones
window.resetPagina = resetPagina;
window.mostrar = mostrar;
window.abrirFormulario = abrirFormulario;
window.volver = volver;
window.exportarCSV = exportarCSV;
window.importarCSV = importarCSV;
window.manejarNuevo = manejarNuevo;
window.borrarElemento = borrarElemento;
window.abrirGraficos = abrirGraficos;
window.ejecutarBackupRotativo = ejecutarBackupRotativo;
window.init = init;
window.actualizarListas = actualizarListas;
// Vistas/Modo
window.setModo = setModo;
window.toggleCasa = toggleCasa;
// Gráficos (drill)
window.handleGraficoBarClick = handleGraficoBarClick;
window.abrirDetalleMovs = abrirDetalleMovs;
// Backups
window.guardarCopiaEnOneDrive = guardarCopiaEnOneDrive;
window.restaurarCopiaDeOneDrive = restaurarCopiaDeOneDrive;
