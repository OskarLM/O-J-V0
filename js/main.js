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
// Nómina
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
// Requiere desde utils.js: PIN_STORAGE_KEY, PIN_COOLDOWN_KEY, sha256, getAttempts, setAttempts, isInCooldown, setCooldown

// Garantiza hash de PIN por defecto ("7143") en primer arranque
async function ensureDefaultPinHash() {
  const pinHash = localStorage.getItem(PIN_STORAGE_KEY);
  if (!pinHash) {
    const h = await sha256("7143");
    localStorage.setItem(PIN_STORAGE_KEY, h);
  }
}

/* ==========================
   UTILIDADES DE NORMALIZACIÓN
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
      setCooldown(60); // 60s de bloqueo
      setAttempts(0);
      alert("Demasiados intentos fallidos. Bloqueo temporal de 60 segundos.");
    } else {
      alert("PIN incorrecto");
    }
  }
}

const pressPin = async (n) => {
  if (isInCooldown() > 0) {
    const s = Math.ceil(isInCooldown() / 1000);
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
    // WebAuthn real no implementado: no desbloqueamos.
    alert("Biometría no implementada aún.");
  } catch (e) {
    console.error(e);
    alert("Error de biometría");
  }
};

// Asegura hash por defecto al cargar
document.addEventListener('DOMContentLoaded', () => {
  ensureDefaultPinHash().catch(console.error);
  updateDots();
});

/* ==========================
   VISTA LISTA / GRÁFICOS
========================== */
function mostrar() {
  const movDiv = document.getElementById("movimientos");
  if (!movDiv || movDiv.dataset.permiso !== "OK") return;

  const fs = ["filtroMes","filtroAño","filtroCat","filtroSub","filtroOri"].map(id => document.getElementById(id).value);

  let t = 0;
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

  filtradosGlobal.forEach(m => t += m.imp);

  const factor = (fs[0] === "TODOS") ? 12 : 1;
  const bD = document.getElementById("balance");
  bD.innerText = t.toFixed(2) + " €";
  if (t < 0) bD.style.color = "var(--danger)";
  else if (t <= (750 * factor)) bD.style.color = "var(--warning)";
  else if (t <= (1400 * factor)) bD.style.color = "var(--success)";
  else bD.style.color = "var(--electric-blue)";

  if (movDiv.dataset.modo === "graficos") {
    renderizarBarrasGraficos(factor);
  } else {
    document.getElementById("lista").innerHTML = filtradosGlobal
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
}

const renderizarBarrasGraficos = (f) => {
  const lista = document.getElementById("lista");
  const totales = filtradosGlobal
    .filter(m => m.imp < 0)
    .reduce((acc,m) => { acc[m.c] = (acc[m.c] || 0) + Math.abs(m.imp); return acc; }, {});
  const max = Math.max(...Object.values(totales), 1);

  let html = `<h2 style="color:var(--primary);font-size:18px;text-align:center">ANÁLISIS DE GASTO</h2>
  <div style="display:flex;justify-content:center;gap:15px;margin-bottom:25px;font-size:19px;font-weight:900">
    <span style="color:var(--electric-blue)">0-${50*f}€</span>
    <span style="color:var(--success)">${200*f}€</span>
    <span style="color:var(--warning)">${500*f}€</span>
    <span style="color:var(--danger)">+</span>
  </div>`;
  lista.innerHTML = html + Object.entries(totales).sort((a,b)=>b[1]-a[1]).map(([cat,val])=>{
    const esCasa = cat.toLowerCase().includes("compra casa");
    const t1 = Math.min(val, 50*f),
          t2 = val > 50*f ? Math.min(val - 50*f ,150*f) : 0,
          t3 = val > 200*f ? Math.min(val - 200*f,300*f) : 0,
          t4 = val > 500*f ? (val - 500*f) : 0;
    return `<div class="card" style="border:none;background:transparent">
      <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:5px">
        <span>${esc(cat)}</span><b>${val.toFixed(2)} €</b>
      </div>
      <div style="width:${(val/max)*100}%;height:16px;display:flex;background:#000;border-radius:8px;overflow:hidden;border:1px solid rgba(212,175,55,.2)">
        ${esCasa
          ? `<div style="width:100%;background:var(--success)"></div>`
          : `<div style="width:${(t1/val)*100}%;background:var(--electric-blue)"></div>
             <div style="width:${(t2/val)*100}%;background:var(--success)"></div>
             <div style="width:${(t3/val)*100}%;background:var(--warning)"></div>
             <div style="width:${(t4/val)*100}%;background:var(--danger)"></div>`
        }
      </div>
    </div>`;
  }).join("");
};

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
  // ✅ FIX: propiedad computada en el reduce
  const v = ids.reduce((acc,id)=>({ ...acc, [id]: document.getElementById(id).value }),{});
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

const manejarNuevo = (el, tipo) => {
  if (el.value === "+") {
    let n = prompt(`Nueva ${tipo}:`);
    if (!n) { el.value = ""; return; }
    n = n.trim();
    const pretty = mostrarBonito(n);
    const keyNew = canonicalizeLabel(pretty);

    if (tipo === "categoria") {
      const catIdx = buildCanonIndex(catBase, catExtra);
      // Bloqueo nómina manual
      if (NOMINA_CATS.some(x => canonicalizeLabel(x) === keyNew)) {
        alert("No puedes crear manualmente 'Oskar' ni 'Josune'. Selecciona 'Nómina' y usa el popup.");
        el.value = "";
        return;
      }
      if (catIdx.has(keyNew)) {
        const existente = catIdx.get(keyNew);
        llenar("categoria", catBase, catExtra, existente, { origenActual: document.getElementById("origen").value || "" });
      } else {
        catExtra.push(pretty);
        localStorage.setItem('categoriaExtra', JSON.stringify(catExtra));
        llenar("categoria", catBase, catExtra, pretty, { origenActual: document.getElementById("origen").value || "" });
      }
    } else {
      const subIdx = buildCanonIndex(subMaestra, []);
      if (subIdx.has(keyNew)) {
        const existente = subIdx.get(keyNew);
        llenar("subcategoria", subMaestra, [], existente, { origenActual: document.getElementById("origen").value || "" });
      } else {
        subMaestra.push(pretty);
        localStorage.setItem('subMaestra_v2', JSON.stringify(subMaestra));
        llenar("subcategoria", subMaestra, [], pretty, { origenActual: document.getElementById("origen").value || "" });
      }
    }
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
  // Limpiar catExtra: quitar duplicados y los que ya están en base
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

  // Subcategorías: eliminar duplicados canónicos (bugfix)
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

  // Normalizar movimientos existentes a canónicos
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
   INIT
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

const ejecutarBackupRotativo = () => { /* opcional */ };
const resetTotal = () => confirm("¿BORRAR TODO?") && (localStorage.clear(), location.reload());

window.onscroll = () => {
  if (document.getElementById("movimientos").dataset.modo === "graficos") return;
  if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200 && registrosVisibles < filtradosGlobal.length) {
    document.getElementById("loader").style.display = "block";
    setTimeout(() => { registrosVisibles += 25; mostrar(); }, 200);
  }
};

/* ==========================
   CSV: EXPORTACIÓN (europeo)
========================== */
const exportarCSV = () => {
  if (!movimientos || movimientos.length === 0) {
    alert("No hay datos para exportar.");
    return;
  }
  const SEP = ";";
  const toESDate = (iso) => {
    const [y,m,d] = (iso || "").split("-");
    return (y && m && d) ? `${d}/${m}/${y}` : (iso || "");
  };
  const toEuro = (n) => {
    const val = (typeof n === "number" ? n : parseFloat(n || 0));
    const s = Number.isFinite(val) ? val.toString() : "0";
    return s.includes(".") ? s.replace(".", ",") : s;
  };
  const csvCell = (v) => {
    let t = (v ?? "").toString().replace(/\r?\n/g, "⏎");
    if (/[;"\n]/.test(t)) t = '"' + t.replace(/"/g,'""') + '"';
    return t;
  };
  const headers = ["Fecha","Origen","Categoria","Subcategoria","Importe","Descripcion"].join(SEP);
  const rows = movimientos.map(m =>
    [
      toESDate(m.f),
      m.o || "",
      m.c || "",
      m.s || "",
      toEuro(m.imp),
      (m.d ?? "").trim()
    ].map(csvCell).join(SEP)
  );
  const csv = [headers, ...rows].join("\n");
  const hoy = new Date();
  const dd = String(hoy.getDate()).padStart(2,"0");
  const mm = String(hoy.getMonth()+1).padStart(2,"0");
  const yyyy = hoy.getFullYear();
  const fileName = `mis_gastos_${dd}${mm}${yyyy}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/* ==========================
   CSV: IMPORTACIÓN
========================== */
const importarCSV = (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = reader.result.replace(/^\uFEFF/,"");
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (!lines.length) { alert("El archivo está vacío."); return; }

      // Detectar delimitador
      const header = lines[0];
      const counts = {
        tab:(header.match(/\t/g)||[]).length,
        semi:(header.match(/;/g)||[]).length,
        comma:(header.match(/,/g)||[]).length
      };
      let delim = "\t";
      if (counts.tab >= counts.semi && counts.tab >= counts.comma) delim = "\t";
      else if (counts.semi >= counts.comma) delim = ";";
      else delim = ",";

      // Parser CSV/TSV con comillas
      const parseLine = (line) => {
        const out = []; let cur = "", inQ = false;
        for (let i=0;i<line.length;i++){
          const ch = line[i];
          if (ch === '"'){
            if (inQ && line[i+1] === '"'){ cur += '"'; i++; }
            else inQ = !inQ;
          } else if (ch === delim && !inQ) { out.push(cur); cur = ""; }
          else { cur += ch; }
        }
        out.push(cur);
        return out;
      };

      // Índices de columnas
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

      // Utils parse
      const toISODate = (ddmmyyyy) => {
        const m = ddmmyyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) return ddmmyyyy;
        return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      };
      const parseEuroNumber = (s) => {
        let t = (s || '').toString().trim();
        t = t.replace(/\.(?=\d{3}(?:\D|$))/g, ''); // miles
        t = t.replace(',', '.'); // decimal
        const n = parseFloat(t);
        return isNaN(n) ? 0 : n;
      };
      const cleanText = (s) => {
        if (!s) return "";
        let t = s.replace(/\\"{2,}/g, '"').trim();
        if (t.startsWith('"') && t.endsWith('"')) t = t.slice(1,-1);
        return t.trim();
      };

      // Índices canónicos actuales
      const catIndexCanon = buildCanonIndex([...catBase, ...catExtra, ...NOMINA_CATS], []);
      const subIndexCanon = buildCanonIndex([...subMaestra, ...NOMINA_SUBS], []);
      const nuevos = [];

      for (let i = 1; i < lines.length; i++) {
        const arr = parseLine(lines[i]);
        if (arr.every(v => (v || '').trim() === '')) continue;

        const rawFecha = arr[idx.fecha] ?? '';
        const rawOrigen = arr[idx.origen] ?? '';
        const rawCat = arr[idx.categoria] ?? '';
        const rawSub = arr[idx.subcategoria] ?? '';
        const rawImp = arr[idx.importe] ?? '';
        const rawDesc = (idx.descripcion >= 0 ? arr[idx.descripcion] : '') ?? '';

        const f = toISODate(cleanText(rawFecha));
        let o = cleanText(rawOrigen);
        let c = mostrarBonito(cleanText(rawCat));
        let s = mostrarBonito(cleanText(rawSub));
        let d = cleanText(rawDesc);

        // Origen y signo
        const oLow = o.toLowerCase();
        if (oLow.startsWith('nom')) o = 'Nómina';
        else if (oLow.startsWith('gas')) o = 'Gasto';
        else if (oLow.startsWith('ing')) o = 'Ingreso';

        // Unificación canónica
        const keyC = canonicalizeLabel(c);
        const keyS = canonicalizeLabel(s);
        if (catIndexCanon.has(keyC)) c = catIndexCanon.get(keyC);
        if (subIndexCanon.has(keyS)) s = subIndexCanon.get(keyS);

        let imp = parseEuroNumber(rawImp);
        if (o === 'Gasto' && imp > 0) imp = -Math.abs(imp);
        if (o !== 'Gasto' && imp < 0) imp = Math.abs(imp);

        const mov = { id:`id_${Date.now()}_${i}`, f, o, c, s, imp, d, ts: Date.now() + i };
        if (!f || !o || !c || !s || isNaN(imp)) continue;

        nuevos.push(mov);
      }

      // Insertar categorías/subcategorías nuevas (no duplicadas canónicas)
      const addIfNewCanon = (list, storeKey, value) => {
        const k = canonicalizeLabel(value);
        const exists = list.some(v => canonicalizeLabel(v) === k);
        if (!exists) {
          list.push(value);
          localStorage.setItem(storeKey, JSON.stringify(list));
        }
      };

      nuevos.forEach(m=>{
        if (![...catBase, ...catExtra, ...NOMINA_CATS].some(v => canonicalizeLabel(v) === canonicalizeLabel(m.c))){
          addIfNewCanon(catExtra, 'categoriaExtra', m.c);
        }
        if (![...subMaestra, ...NOMINA_SUBS].some(v => canonicalizeLabel(v) === canonicalizeLabel(m.s))){
          addIfNewCanon(subMaestra, 'subMaestra_v2', m.s);
        }
      });

      movimientos = [...movimientos, ...nuevos].sort((a,b)=>new Date(b.f)-new Date(a.f));
      localStorage.setItem('movimientos', JSON.stringify(movimientos));
      actualizarListas(); resetPagina(); mostrar();

      alert(`Importación completa: ${nuevos.length} registros añadidos.`);
    } catch (err) {
      console.error(err);
      alert("Error al importar el CSV. Revisa el formato.");
    } finally {
      e.target.value = "";
    }
  };
  reader.onerror = () => alert("No se pudo leer el archivo.");
  reader.readAsText(file, 'UTF-8');
};

/* ==========================
   POPUP PREMIUM + “Añadir nuevo”
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
    document.getElementById('confirm_premium').onclick=()=>{
      let n=document.getElementById('val_premium').value.trim();
      if(n){
        const select=el; select.value="+";
        overlay.remove();
        setTimeout(()=>manejarNuevo(select,select.id),0);
      } else overlay.remove();
    };
    document.getElementById('cancel_premium').onclick=()=>{ el.value=""; overlay.remove(); };
  };
  document.addEventListener('change',(e)=>{
    if((e.target.id==='categoria'||e.target.id==='subcategoria') && e.target.value === "+"){
      e.stopImmediatePropagation(); lanzarPopupPremium(e.target,e.target.id);
    }
  },true);
})();

/* ==========================
   POPUP NÓMINA
========================== */
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
    document.getElementById('btn_oskar').onclick=()=>{ document.getElementById("categoria").innerHTML=`<option value="Oskar" selected>Oskar</option>`; overlay.remove(); };
    document.getElementById('btn_josune').onclick=()=>{ document.getElementById("categoria").innerHTML=`<option value="Josune" selected>Josune</option>`; overlay.remove(); };
    document.getElementById('btn_cancel_nom').onclick=()=>{ document.getElementById("origen").value="Gasto";
      llenar('categoria',catBase,catExtra,"",{origenActual:"Gasto"}); llenar('subcategoria',subMaestra,[], "",{origenActual:"Gasto"}); overlay.remove(); };
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
   REGISTRO SERVICE WORKER (PWA)
========================== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Mantiene tus rutas /APK_V0.0/
    navigator.serviceWorker.register('./sw.js').catch(err => console.error("SW ERROR:", err));
  });
}

/* ==========================
   EXPONER FUNCIONES AL GLOBAL
   (para que los handlers inline del HTML siempre funcionen)
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
window.resetTotal = resetTotal;
// eliminarRegistroActual ya se declaró como window.*
window.init = init;
window.actualizarListas = actualizarListas;
