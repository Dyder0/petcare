/* Build: une petcare-login.html + petcare-app.html en una sola app funcional. */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const loginHtml = fs.readFileSync(path.join(root, 'petcare-login.html'), 'utf8');
const appHtml = fs.readFileSync(path.join(root, 'petcare-app.html'), 'utf8');
const extraCss = fs.readFileSync(path.join(root, '_extra.css'), 'utf8');
const appJs = fs.readFileSync(path.join(root, '_app.js'), 'utf8');

function extractStyle(html) {
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  if (!m) throw new Error('No se encontró <style>');
  return m[1];
}
function extractBody(html) {
  const m = html.match(/<body>([\s\S]*?)<\/body>/);
  if (!m) throw new Error('No se encontró <body>');
  return m[1].replace(/<script>[\s\S]*?<\/script>/g, '');
}
function once(source, from, to, label) {
  if (!source.includes(from)) throw new Error('No se encontró: ' + label);
  return source.replace(from, to);
}
function renameCssBrand(css) {
  return css.replace(/\.brand__/g, '.l-brand__').replace(/\.brand\b/g, '.l-brand');
}
function renameMarkupBrand(html) {
  return html.replace(/class="brand"/g, 'class="l-brand"').replace(/class="brand__/g, 'class="l-brand__');
}

/* ---------- LOGIN ---------- */
let loginCss = renameCssBrand(extractStyle(loginHtml));
let loginBody = renameMarkupBrand(extractBody(loginHtml));

loginBody = once(loginBody,
  '<main class="login">',
  '<div class="login-screen" id="loginScreen"><main class="login">',
  'wrapper login');
loginBody = once(loginBody, '</main>', '</main></div>', 'cierre wrapper login');
loginBody = once(loginBody,
  '<form class="form" action="#" method="post" novalidate>',
  '<form class="form" id="loginForm" action="#" method="post" novalidate>',
  'form login');
loginBody = once(loginBody,
  '<a class="form__link" href="#">¿Olvidaste tu contraseña?</a>',
  '<a class="form__link" id="forgotLink" href="#">¿Olvidaste tu contraseña?</a>',
  'link olvido');
loginBody = once(loginBody,
  '<button class="button button--primary" type="submit">',
  '<p class="login-error" id="loginError" role="alert" hidden></p>\n          <button class="button button--primary" type="submit">',
  'error login');
loginBody = once(loginBody,
  '<button class="button button--secondary" type="button">',
  '<button class="button button--secondary" id="googleBtn" type="button">',
  'botón google');
loginBody = once(loginBody,
  '<a class="auth__register-link" href="#">Registrarse</a>',
  '<a class="auth__register-link" id="registerLink" href="#">Registrarse</a>',
  'link registro');
loginBody = once(loginBody,
  '        <p class="auth__register">',
  `        <button class="button button--pay" id="payPortalBtn" type="button" data-action="open-payment-portal">
          <span class="button__content">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h3"/></svg>
            Pagar una cuenta con RUT
          </span>
        </button>
        <p class="demo-hint demo-hint--pay">Consulta cuentas y paga de forma segura con Webpay Plus</p>

        <p class="auth__register">`,
  'botón portal pagos');

/* ---------- APP ---------- */
let appCss = extractStyle(appHtml);
let appBody = extractBody(appHtml);

appBody = once(appBody, '<div class="app" id="app">', '<div class="app" id="app" hidden>', 'app hidden');
appBody = once(appBody,
  '<span class="clinic__name">PetCare Providencia</span>',
  '<span class="clinic__name" id="clinicName">PetCare Providencia</span>',
  'clínica');
appBody = once(appBody,
  '<a class="nav__link" href="petcare-login.html"><svg class="icon"><use href="#i-out"/></svg>Cerrar sesión</a>',
  '<a class="nav__link" href="#" data-action="logout"><svg class="icon"><use href="#i-out"/></svg>Cerrar sesión</a>',
  'logout sidebar');
appBody = once(appBody,
  '<button class="bell" type="button" aria-label="Notificaciones"><svg class="icon"><use href="#i-bell"/></svg><span class="bell__dot"></span></button>',
  '<button class="bell" id="bellBtn" type="button" aria-label="Notificaciones"><svg class="icon"><use href="#i-bell"/></svg><span class="bell__dot" id="bellDot"></span></button>',
  'campana');
appBody = appBody.replace(/<div class="user">[\s\S]*?<\/div>/,
  `<div class="user-wrap">
          <button class="user" id="userBtn" type="button" aria-haspopup="menu" aria-expanded="false">
            <span class="avatar avatar--38" id="topAvatar">CM</span>
            <span class="user__info"><span class="user__name" id="topUserName">Carolina Méndez</span><span class="user__role" id="topUserRole">Administradora</span></span>
            <svg class="icon icon--sm" style="color:var(--c-navy-700)"><use href="#i-right"/></svg>
          </button>
          <div class="user-menu" id="userMenu" hidden>
            <div class="user-menu__head"><span class="user-menu__name" id="menuUserName">Carolina Méndez</span><span class="user-menu__mail" id="menuUserMail">carolina@petcare.cl</span></div>
            <button class="user-menu__item" type="button" data-action="goto-inicio"><svg class="icon icon--sm"><use href="#i-home"/></svg>Ir al inicio</button>
            <button class="user-menu__item user-menu__item--danger" type="button" data-action="logout"><svg class="icon icon--sm"><use href="#i-out"/></svg>Cerrar sesión</button>
          </div>
        </div>`);
appBody = once(appBody,
  '<button class="btn btn--primary" type="button"><svg class="icon md icon--md"><use href="#i-plus"/></svg>Agendar cita</button>',
  '<button class="btn btn--primary" type="button" data-action="new-appointment"><svg class="icon md icon--md"><use href="#i-plus"/></svg>Agendar cita</button>',
  'botón agendar cita');

/* Pagos: iconos + navegación */
appBody = once(appBody,
  '<symbol id="i-paw" viewBox="0 0 24 24"><circle cx="7.5" cy="6" r="2.4"/><circle cx="16.5" cy="6" r="2.4"/><circle cx="3.8" cy="12" r="2"/><circle cx="20.2" cy="12" r="2"/><ellipse cx="12" cy="15.6" rx="4.6" ry="4"/></symbol>',
  '<symbol id="i-paw" viewBox="0 0 24 24"><circle cx="7.5" cy="6" r="2.4"/><circle cx="16.5" cy="6" r="2.4"/><circle cx="3.8" cy="12" r="2"/><circle cx="20.2" cy="12" r="2"/><ellipse cx="12" cy="15.6" rx="4.6" ry="4"/></symbol><symbol id="i-card" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h3"/></symbol><symbol id="i-qr" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M17 20h4M14 20h.01"/></symbol><symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/></symbol>',
  'iconos pago');
appBody = once(appBody,
  '<li><a class="nav__link" href="#recordatorios" data-route="recordatorios"><svg class="icon"><use href="#i-bell"/></svg>Recordatorios<span class="nav__badge">3</span></a></li>',
  '<li><a class="nav__link" href="#recordatorios" data-route="recordatorios"><svg class="icon"><use href="#i-bell"/></svg>Recordatorios<span class="nav__badge">3</span></a></li>\n        <li><a class="nav__link" href="#pagos" data-route="pagos"><svg class="icon"><use href="#i-card"/></svg>Pagos</a></li>',
  'nav pagos');

/* Registro: foto */
appBody = once(appBody,
  '<label class="upload" for="m-foto" style="cursor:pointer"><span class="upload__btn"><svg class="icon"><use href="#i-plus"/></svg></span><span><span class="upload__title">Agregar foto de la mascota</span><span class="upload__sub">PNG o JPG, máximo 5 MB</span></span><input id="m-foto" type="file" accept="image/png,image/jpeg" hidden></label>',
  '<label class="upload" for="m-foto" style="cursor:pointer"><span class="upload__btn"><svg class="icon"><use href="#i-plus"/></svg></span><img class="upload__preview" id="photoPreview" alt="Vista previa" hidden><span><span class="upload__title">Agregar foto de la mascota</span><span class="upload__sub" id="photoName">PNG o JPG, máximo 5 MB</span></span><input id="m-foto" type="file" accept="image/png,image/jpeg" hidden></label>',
  'upload foto');

/* Disponibilidad */
appBody = once(appBody,
  '<select class="field-input" aria-label="Veterinario">',
  '<select class="field-input" id="vetSelect" aria-label="Veterinario">',
  'select veterinario');
appBody = once(appBody,
  '<div class="toolbar__date"><svg class="icon"><use href="#i-cal"/></svg>Junio 2025</div>',
  '<div class="toolbar__date" id="calPeriod"><svg class="icon"><use href="#i-cal"/></svg>Junio 2025</div>',
  'periodo calendario');
appBody = once(appBody,
  '<button class="btn btn--primary" type="button"><svg class="icon md icon--md"><use href="#i-plus"/></svg>Nuevo horario</button>',
  '<button class="btn btn--primary" type="button" data-action="new-appointment"><svg class="icon md icon--md"><use href="#i-plus"/></svg>Agendar cita</button>',
  'botón nuevo horario');
appBody = once(appBody,
  '<button class="cal__btn" type="button" aria-label="Mes anterior">‹</button>',
  '<button class="cal__btn" type="button" data-action="cal-prev" aria-label="Mes anterior">‹</button>',
  'mes anterior');
appBody = once(appBody,
  '<button class="cal__btn" type="button" aria-label="Mes siguiente">›</button>',
  '<button class="cal__btn" type="button" data-action="cal-next" aria-label="Mes siguiente">›</button>',
  'mes siguiente');
appBody = once(appBody, '<h2 class="cal__month">Junio 2025</h2>', '<h2 class="cal__month" id="calMonthTitle">Junio 2025</h2>', 'título calendario');
appBody = once(appBody, '<div class="cal__grid" role="grid">', '<div class="cal__grid" id="calGrid" role="grid">', 'grid calendario');
appBody = once(appBody,
  '<section class="card day" aria-label="Horarios del día">',
  '<section class="card day" id="dayPanel" aria-label="Horarios del día">',
  'panel día');

/* Ficha */
appBody = once(appBody,
  '<form class="search" role="search" action="#" onsubmit="return false">',
  '<form class="search" id="fichaSearchForm" role="search" action="#">',
  'form búsqueda ficha');
appBody = once(appBody,
  '<input class="search__input" type="search" placeholder="Buscar por nombre de mascota, tutor o N° de ficha" aria-label="Buscar ficha médica">',
  '<input class="search__input" id="fichaSearch" type="search" placeholder="Buscar por nombre de mascota, tutor o N° de ficha" aria-label="Buscar ficha médica">',
  'input búsqueda ficha');
appBody = once(appBody,
  '<button class="search__btn" type="submit">Buscar</button>',
  '<button class="search__btn" type="submit">Buscar</button><div class="search-results" id="fichaResults" hidden></div>',
  'resultados búsqueda');
appBody = once(appBody,
  '<section class="card patient" aria-label="Paciente">',
  '<section class="card patient" id="patientCard" aria-label="Paciente">',
  'tarjeta paciente');
appBody = once(appBody,
  '<section class="card record" aria-label="Historial">',
  '<section class="card record" id="recordCard" aria-label="Historial">',
  'tarjeta historial');
appBody = once(appBody, '<div class="tabs" role="tablist">', '<div class="tabs" id="fichaTabs" role="tablist">', 'tabs ficha');
appBody = once(appBody, '<div class="record__body">', '<div class="record__body" id="fichaBody">', 'cuerpo ficha');

/* Recordatorios */
appBody = once(appBody,
  '<button class="btn" type="button">Agendar ahora</button>',
  '<button class="btn" type="button" data-action="book-banner">Agendar ahora</button>',
  'botón banner');
appBody = once(appBody,
  '<div class="seg" role="group" aria-label="Filtrar recordatorios"><button type="button" data-filter="all" aria-pressed="true">Todos</button><button type="button" data-filter="pendiente" aria-pressed="false">Pendientes</button><button type="button" data-filter="enviado" aria-pressed="false">Enviados</button></div>',
  '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div class="seg" role="group" aria-label="Filtrar recordatorios"><button type="button" data-action="rem-filter" data-filter="all" aria-pressed="true">Todos</button><button type="button" data-action="rem-filter" data-filter="pendiente" aria-pressed="false">Pendientes</button><button type="button" data-action="rem-filter" data-filter="enviado" aria-pressed="false">Enviados</button></div><button class="btn btn--primary" type="button" data-action="new-reminder"><svg class="icon icon--sm"><use href="#i-plus"/></svg>Nuevo</button></div>',
  'filtros recordatorios');

/* Administración */
appBody = once(appBody,
  '<a class="settings__link" href="#administracion" aria-current="true">',
  '<a class="settings__link" href="#administracion" data-action="admin-section" data-admin="usuarios" aria-current="true">',
  'admin usuarios link');
appBody = once(appBody,
  '<a class="settings__link" href="#administracion"><svg class="icon"><use href="#i-clip"/></svg>Profesionales',
  '<a class="settings__link" href="#administracion" data-action="admin-section" data-admin="profesionales"><svg class="icon"><use href="#i-clip"/></svg>Profesionales',
  'admin profesionales link');
appBody = once(appBody,
  '<a class="settings__link" href="#administracion"><svg class="icon"><use href="#i-clock"/></svg>Horarios',
  '<a class="settings__link" href="#administracion" data-action="admin-section" data-admin="horarios"><svg class="icon"><use href="#i-clock"/></svg>Horarios',
  'admin horarios link');
appBody = once(appBody,
  '<a class="settings__link" href="#administracion" data-action="admin-section" data-admin="horarios"><svg class="icon"><use href="#i-clock"/></svg>Horarios<svg class="icon chev"><use href="#i-right"/></svg></a>',
  '<a class="settings__link" href="#administracion" data-action="admin-section" data-admin="horarios"><svg class="icon"><use href="#i-clock"/></svg>Horarios<svg class="icon chev"><use href="#i-right"/></svg></a>\n            <a class="settings__link" href="#administracion" data-action="admin-section" data-admin="django"><svg class="icon"><use href="#i-shield"/></svg>Django Admin<svg class="icon chev"><use href="#i-right"/></svg></a>\n            <a class="settings__link" href="#administracion" data-action="admin-section" data-admin="api"><svg class="icon"><use href="#i-clip"/></svg>Swagger / OpenAPI<svg class="icon chev"><use href="#i-right"/></svg></a>',
  'enlaces internos Django Admin y API REST');
if (!/<section class="card users"[\s\S]*?<\/section>/.test(appBody)) throw new Error('No se encontró sección usuarios');
appBody = appBody.replace(/<section class="card users"[\s\S]*?<\/section>/, '<div id="adminPanel"></div>');

/* Nueva página: gestión de citas */
const citasPage = `
      <!-- ============ GESTIÓN DE CITAS ============ -->
      <section class="page" id="gestion-de-citas" data-title="Gestión de citas" data-sub="Crea, confirma y administra la agenda de la clínica." aria-label="Gestión de citas" hidden>
        <div class="section-head">
          <div><h2 class="section-head__title">Agenda de citas</h2><p class="panel__sub" id="apptSummary">Revisa la agenda completa de la clínica.</p></div>
          <button class="btn btn--primary" type="button" data-action="new-appointment"><svg class="icon md icon--md"><use href="#i-plus"/></svg>Nueva cita</button>
        </div>
        <div class="card toolbar" style="margin-top:20px">
          <div class="toolbar__select" style="width:320px"><svg class="icon icon--l"><use href="#i-search"/></svg><input class="field-input" id="apptSearch" type="search" placeholder="Buscar mascota, tutor o servicio" aria-label="Buscar cita"></div>
          <div class="select" style="width:200px"><select class="field-input" id="apptFilter" aria-label="Filtrar por estado"><option value="all">Todos los estados</option><option value="pendiente">Pendientes</option><option value="confirmada">Confirmadas</option><option value="atendida">Atendidas</option><option value="cancelada">Canceladas</option></select><svg class="icon"><use href="#i-down"/></svg></div>
          <div class="toolbar__date" style="margin-left:auto"><svg class="icon"><use href="#i-cal"/></svg>Agenda completa</div>
        </div>
        <section class="card rtable" style="margin-top:20px">
          <div class="rtable__head"><div><h2 class="panel__title">Citas registradas</h2><p class="panel__sub">Confirma, completa o reprograma cada atención.</p></div></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th scope="col">Fecha y hora</th><th scope="col">Mascota</th><th scope="col">Servicio y profesional</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
              <tbody id="apptBody"></tbody>
            </table>
          </div>
        </section>
      </section>

`;
appBody = once(appBody, '      <!-- ============ FICHA MÉDICA ============ -->', citasPage + '      <!-- ============ FICHA MÉDICA ============ -->', 'insertar gestión de citas');

/* Página: gestión real de pagos */
const pagosPage = `
      <!-- ============ PAGOS ============ -->
      <section class="page" id="pagos" data-title="Pagos" data-sub="Administra cuentas por cobrar y revisa transacciones de Transbank." aria-label="Pagos" hidden>
        <div class="section-head">
          <div><h2 class="section-head__title">Gestión de pagos</h2><p class="panel__sub">Las cuentas y transacciones se leen y guardan en la base de datos del backend.</p></div>
          <div class="section-actions">
            <a class="btn btn--outline" href="/pagar/" target="_blank" rel="noopener"><svg class="icon md icon--md"><use href="#i-card"/></svg>Portal público por RUT</a>
            <button class="btn btn--outline" type="button" data-action="refresh-payments"><svg class="icon md icon--md"><use href="#i-check"/></svg>Actualizar</button>
            <button class="btn btn--primary" type="button" data-action="new-debt"><svg class="icon md icon--md"><use href="#i-plus"/></svg>Nueva cuenta</button>
          </div>
        </div>

        <div class="stats3" id="payStats"></div>
        <p class="message error" id="payError" role="alert" hidden></p>

        <section class="card rtable pay-table">
          <div class="rtable__head pay-table__head">
            <div><h2 class="panel__title">Cuentas por cobrar</h2><p class="panel__sub">Crea, revisa y comparte enlaces de pago Webpay Plus.</p></div>
            <div class="pay-tools">
              <div class="seg" role="group" aria-label="Filtrar cuentas">
                <button type="button" data-action="pay-filter" data-filter="pendiente" aria-pressed="true">Pendientes</button>
                <button type="button" data-action="pay-filter" data-filter="pagada" aria-pressed="false">Pagadas</button>
                <button type="button" data-action="pay-filter" data-filter="all" aria-pressed="false">Todas</button>
              </div>
              <div class="pay-search"><svg class="icon icon--sm"><use href="#i-search"/></svg><input class="field-input" id="paySearch" type="search" placeholder="Buscar RUT, tutor o mascota" aria-label="Buscar cuenta"></div>
            </div>
          </div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th scope="col">Tutor / RUT</th><th scope="col">Mascota</th><th scope="col">Concepto</th><th scope="col">Vencimiento</th><th scope="col">Monto</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
              <tbody id="payBody"></tbody>
            </table>
          </div>
        </section>

        <section class="card rtable pay-table">
          <div class="rtable__head"><div><h2 class="panel__title">Historial de pagos</h2><p class="panel__sub">Transacciones confirmadas o pendientes de confirmación por el backend.</p></div><span class="pill" id="payHistoryCount">0 pagos</span></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th scope="col">Fecha</th><th scope="col">Orden de compra</th><th scope="col">Tutor</th><th scope="col">Monto</th><th scope="col">Autorización</th><th scope="col">Estado</th><th scope="col">Cuentas</th></tr></thead>
              <tbody id="payHistoryBody"></tbody>
            </table>
          </div>
        </section>
      </section>

`;
appBody = once(appBody, '      <!-- ============ FICHA MÉDICA ============ -->', pagosPage + '      <!-- ============ FICHA MÉDICA ============ -->', 'insertar pagos');

/* ---------- Ensamblado ---------- */
const output = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PetCare – Gestión veterinaria</title>
<meta name="description" content="PetCare: demo funcional de gestión veterinaria con login, agenda, fichas médicas, recordatorios y administración.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* ============================================================
   LOGIN (petcare-login.html)
   ============================================================ */
${loginCss}

/* ============================================================
   APLICACIÓN (petcare-app.html)
   ============================================================ */
${appCss}

/* ============================================================
   FUNCIONALIDAD
   ============================================================ */
${extraCss}
</style>
</head>
<body>
${loginBody}
${appBody}
<div class="toast-root" id="toastRoot" aria-live="polite" aria-atomic="false"></div>
<div id="modalRoot" hidden></div>
<script>
${appJs}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'index.html'), output, 'utf8');
console.log('index.html generado (' + output.length + ' caracteres)');
