(function () {
  'use strict';

  /* ============================================================
     CONSTANTES Y ALMACENAMIENTO
     ============================================================ */
  var DB_KEY = 'petcare.db.v2';
  var SESSION_KEY = 'petcare.session.v2';
  var VET_ROLE = 'Veterinario/a';
  var ROLES = ['Administrador/a', 'Veterinario/a', 'Recepción'];
  var SERVICES = ['Consulta general', 'Vacunación', 'Control post operatorio', 'Consulta dermatológica', 'Control anual', 'Cirugía', 'Examen', 'Otro'];

  var APPT_STATUS = {
    pendiente: { label: 'Pendiente', cls: 'badge--warn' },
    confirmada: { label: 'Confirmada', cls: 'badge--ok' },
    atendida: { label: 'Atendida', cls: 'badge--muted' },
    cancelada: { label: 'Cancelada', cls: 'badge--off' }
  };
  var REM_STATUS = {
    pendiente: { label: 'Pendiente', cls: 'badge--warn' },
    enviado: { label: 'Enviado', cls: 'badge--ok' }
  };
  var RECORD_TYPES = {
    diagnostico: { label: 'Diagnósticos', one: 'Diagnóstico', icon: 'i-clip' },
    tratamiento: { label: 'Tratamientos', one: 'Tratamiento', icon: 'i-heart' },
    receta: { label: 'Recetas', one: 'Receta', icon: 'i-clip' },
    examen: { label: 'Exámenes', one: 'Examen', icon: 'i-check' },
    vacuna: { label: 'Vacunas', one: 'Vacuna', icon: 'i-shield' }
  };
  var RECORD_STATUS = {
    activo: { label: 'Activo', cls: 'badge--ok' },
    finalizado: { label: 'Finalizado', cls: 'badge--muted' }
  };
  var DEBT_STATUS = {
    pendiente: { label: 'Pendiente', cls: 'badge--warn' },
    pagada: { label: 'Pagada', cls: 'badge--ok' }
  };

  var MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  var MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  var store = (function () {
    var ok = true;
    try {
      localStorage.setItem('__petcare_test__', '1');
      localStorage.removeItem('__petcare_test__');
    } catch (e) { ok = false; }
    var mem = {};
    return {
      get: function (k) { try { return ok ? localStorage.getItem(k) : (mem[k] || null); } catch (e) { return mem[k] || null; } },
      set: function (k, v) { try { if (ok) localStorage.setItem(k, v); else mem[k] = v; } catch (e) { mem[k] = v; } },
      remove: function (k) { try { if (ok) localStorage.removeItem(k); else delete mem[k]; } catch (e) { delete mem[k]; } }
    };
  })();

  /* ============================================================
     FECHAS
     ============================================================ */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function isoOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayISO() { return isoOf(new Date()); }
  function parseISO(iso) {
    var parts = String(iso || '').split('-').map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  }
  function addDaysISO(iso, days) {
    var d = parseISO(iso);
    d.setDate(d.getDate() + days);
    return isoOf(d);
  }
  function minutesOf(t) {
    var p = String(t || '0:0').split(':').map(Number);
    return (p[0] || 0) * 60 + (p[1] || 0);
  }
  function timeFromMinutes(m) { return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60); }
  function diffDays(iso) {
    return Math.round((parseISO(iso).getTime() - parseISO(todayISO()).getTime()) / 86400000);
  }
  function fmtDateShort(iso) {
    var d = parseISO(iso);
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();
  }
  function fmtDateLong(iso) {
    var d = parseISO(iso);
    return DAYS_LONG[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS_LONG[d.getMonth()];
  }
  function fmtMonth(isoOrDate) {
    var d = isoOrDate instanceof Date ? isoOrDate : parseISO(isoOrDate);
    return MONTHS_LONG[d.getMonth()] + ' ' + d.getFullYear();
  }
  function initCap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function relLabel(iso) {
    var n = diffDays(iso);
    if (n === 0) return 'Hoy';
    if (n === 1) return 'Mañana';
    if (n === -1) return 'Ayer';
    if (n > 1) return 'En ' + n + ' días';
    return 'Hace ' + (-n) + ' días';
  }
  function relShort(iso) {
    var n = diffDays(iso);
    if (n === 0) return 'Hoy';
    if (n > 0) return 'En ' + n + (n === 1 ? ' día' : ' días');
    return 'Hace ' + (-n) + ((-n) === 1 ? ' día' : ' días');
  }
  function money(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  }
  function fmtDateTime(value) {
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value || '');
    return pad2(d.getDate()) + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear() + ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /* ============================================================
     RUT (validación módulo 11)
     ============================================================ */
  function normalizeRut(value) {
    return String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
  }
  function rutDv(body) {
    var sum = 0;
    var mul = 2;
    for (var i = body.length - 1; i >= 0; i--) {
      sum += Number(body.charAt(i)) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    var r = 11 - (sum % 11);
    return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  }
  function isValidRut(value) {
    var clean = normalizeRut(value);
    if (clean.length < 2) return false;
    var body = clean.slice(0, -1);
    var dv = clean.slice(-1);
    return /^\d{6,9}$/.test(body) && rutDv(body) === dv;
  }
  function formatRut(value) {
    var clean = normalizeRut(value);
    if (clean.length < 2) return String(value || '').trim();
    var body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return body + '-' + clean.slice(-1);
  }

  /* ============================================================
     UTILIDADES
     ============================================================ */
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function icon(id, cls) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '"><use href="#' + id + '"/></svg>';
  }
  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0].charAt(0) + (parts[1] ? parts[1].charAt(0) : (parts[0].charAt(1) || ''))).toUpperCase();
  }
  function petTone(id) {
    var sum = 0;
    String(id).split('').forEach(function (c) { sum += c.charCodeAt(0); });
    return sum % 2 ? 'pet--teal' : 'pet--orange';
  }
  function petAvatar(pet, size) {
    var cls = 'pet ' + petTone(pet ? pet.id : '') + ' ' + (size || 'pet--38');
    var inner = pet && pet.photo
      ? '<img src="' + esc(pet.photo) + '" alt="">'
      : icon('i-paw', size === 'pet--26' ? 'icon--xs' : 'icon--md');
    return '<span class="' + cls + '">' + inner + '</span>';
  }
  function petName(id) { var p = getPet(id); return p ? p.name : 'Mascota'; }
  function tutorName(id) { var t = getTutor(id); return t ? t.name : 'Sin tutor'; }
  function vetName(id) { var u = getUser(id); return u ? u.name : 'Profesional eliminado'; }
  function vetSpecialty(id) { var u = getUser(id); return u && u.specialty ? u.specialty : 'Medicina general'; }
  function getPet(id) {
    return db.pets.find(function (p) { return p.id === id; }) ||
      appointmentData.pets.find(function (p) { return p.id === id; });
  }
  function getTutor(id) {
    return db.tutors.find(function (t) { return t.id === id; }) ||
      appointmentData.tutors.find(function (t) { return t.id === id; });
  }
  function getUser(id) {
    return db.users.find(function (u) { return u.id === id; }) ||
      appointmentData.veterinarians.find(function (v) { return v.id === id; });
  }
  function getRecord(id) { return db.records.find(function (r) { return r.id === id; }); }
  function getReminder(id) { return db.reminders.find(function (r) { return r.id === id; }); }
  function getVets() {
    var vets = db.users.filter(function (u) { return u.role === VET_ROLE; });
    appointmentData.veterinarians.forEach(function (vet) {
      if (!vets.some(function (item) { return item.id === vet.id; })) vets.push(vet);
    });
    return vets;
  }
  function activeVets() { return getVets().filter(function (u) { return u.status === 'activo'; }); }
  function getAppointmentVets() {
    return appointmentData.loaded
      ? appointmentData.veterinarians.slice()
      : activeVets();
  }
  function activeAppointmentVets() {
    return getAppointmentVets().filter(function (user) { return user.status === 'activo'; });
  }

  /* ============================================================
     DATOS DEMO
     ============================================================ */
  function seedDB() {
    var today = todayISO();
    var users = [
      { id: 'u-carolina', name: 'Carolina Méndez', email: 'carolina@petcare.cl', role: 'Administrador/a', status: 'activo', password: 'petcare123', specialty: '' },
      { id: 'u-srojas', name: 'Sebastián Rojas', email: 'srojas@petcare.cl', role: VET_ROLE, status: 'activo', password: 'petcare123', specialty: 'Medicina general' },
      { id: 'u-ctorres', name: 'Camila Torres', email: 'ctorres@petcare.cl', role: VET_ROLE, status: 'activo', password: 'petcare123', specialty: 'Dermatología' },
      { id: 'u-asilva', name: 'Andrea Silva', email: 'asilva@petcare.cl', role: VET_ROLE, status: 'inactivo', password: 'petcare123', specialty: 'Medicina interna' }
    ];
    var tutors = [
      { id: 't-carolina', name: 'Carolina Méndez', rut: '12.345.678-5', phone: '+56 9 1234 5678', email: 'carolina@petcare.cl' },
      { id: 't-javier', name: 'Javier López', rut: '13.456.789-9', phone: '+56 9 2345 6789', email: 'javier@correo.cl' },
      { id: 't-felipe', name: 'Felipe Araya', rut: '14.567.890-0', phone: '+56 9 3456 7890', email: 'felipe@correo.cl' },
      { id: 't-diego', name: 'Diego Fuentes', rut: '15.678.901-1', phone: '+56 9 4567 8901', email: 'diego@correo.cl' },
      { id: 't-valentina', name: 'Valentina Ríos', rut: '16.789.012-1', phone: '+56 9 5678 9012', email: 'valentina@correo.cl' }
    ];
    var pets = [
      { id: 'p-milo', tutorId: 't-carolina', name: 'Milo', species: 'Perro', breed: 'Golden Retriever', age: 3, sex: 'Macho', reproductive: 'Entero', weight: '28,4 kg', microchip: '985141000784521', recordNumber: 'PC-00124', photo: '', createdAt: addDaysISO(today, -420) },
      { id: 'p-luna', tutorId: 't-felipe', name: 'Luna', species: 'Gato', breed: 'Siamés', age: 2, sex: 'Hembra', reproductive: 'Esterilizada', weight: '4,2 kg', microchip: '985141000784522', recordNumber: 'PC-00125', photo: '', createdAt: addDaysISO(today, -390) },
      { id: 'p-bruno', tutorId: 't-valentina', name: 'Bruno', species: 'Perro', breed: 'Labrador', age: 5, sex: 'Macho', reproductive: 'Entero', weight: '31,8 kg', microchip: '985141000784523', recordNumber: 'PC-00126', photo: '', createdAt: addDaysISO(today, -350) },
      { id: 'p-nala', tutorId: 't-diego', name: 'Nala', species: 'Gato', breed: 'Mestiza', age: 4, sex: 'Hembra', reproductive: 'Esterilizada', weight: '5,1 kg', microchip: '985141000784524', recordNumber: 'PC-00127', photo: '', createdAt: addDaysISO(today, -280) },
      { id: 'p-simon', tutorId: 't-javier', name: 'Simón', species: 'Perro', breed: 'Beagle', age: 6, sex: 'Macho', reproductive: 'Entero', weight: '14,3 kg', microchip: '985141000784525', recordNumber: 'PC-00128', photo: '', createdAt: addDaysISO(today, -210) }
    ];
    var appointments = [
      { id: 'a-1', petId: 'p-milo', service: 'Consulta general', vetId: 'u-srojas', date: today, time: '09:30', status: 'confirmada', notes: '', createdAt: today },
      { id: 'a-2', petId: 'p-luna', service: 'Vacunación', vetId: 'u-ctorres', date: today, time: '11:00', status: 'confirmada', notes: 'Vacunación anual.', createdAt: today },
      { id: 'a-3', petId: 'p-bruno', service: 'Control post operatorio', vetId: 'u-srojas', date: today, time: '12:30', status: 'pendiente', notes: '', createdAt: today },
      { id: 'a-4', petId: 'p-nala', service: 'Consulta dermatológica', vetId: 'u-asilva', date: today, time: '15:00', status: 'confirmada', notes: '', createdAt: today },
      { id: 'a-5', petId: 'p-simon', service: 'Consulta general', vetId: 'u-srojas', date: addDaysISO(today, 1), time: '10:00', status: 'pendiente', notes: '', createdAt: today },
      { id: 'a-6', petId: 'p-luna', service: 'Control anual', vetId: 'u-ctorres', date: addDaysISO(today, 2), time: '09:30', status: 'confirmada', notes: '', createdAt: today },
      { id: 'a-7', petId: 'p-milo', service: 'Control preventivo', vetId: 'u-srojas', date: addDaysISO(today, -3), time: '16:00', status: 'atendida', notes: 'Control sin observaciones.', createdAt: addDaysISO(today, -10) }
    ];
    var reminders = [
      { id: 'r-1', petId: 'p-milo', title: 'Vacuna antirrábica', date: addDaysISO(today, 3), status: 'pendiente', createdAt: today },
      { id: 'r-2', petId: 'p-simon', title: 'Control post operatorio', date: addDaysISO(today, 4), status: 'enviado', createdAt: today },
      { id: 'r-3', petId: 'p-luna', title: 'Control anual', date: addDaysISO(today, 16), status: 'pendiente', createdAt: today },
      { id: 'r-4', petId: 'p-nala', title: 'Vacuna triple felina', date: addDaysISO(today, 17), status: 'enviado', createdAt: today }
    ];
    var records = [
      { id: 'rec-1', petId: 'p-milo', type: 'diagnostico', title: 'Dermatitis alérgica estacional', desc: 'Se observa irritación leve en zona abdominal. Se indica tratamiento tópico y control en 14 días.', date: addDaysISO(today, -45), vetId: 'u-ctorres', status: 'activo' },
      { id: 'rec-2', petId: 'p-milo', type: 'diagnostico', title: 'Gastroenteritis aguda', desc: 'Cuadro digestivo leve. Paciente hidratado y con buen ánimo general.', date: addDaysISO(today, -180), vetId: 'u-srojas', status: 'finalizado' },
      { id: 'rec-3', petId: 'p-milo', type: 'diagnostico', title: 'Control preventivo anual', desc: 'Examen físico general dentro de parámetros normales.', date: addDaysISO(today, -365), vetId: 'u-asilva', status: 'finalizado' },
      { id: 'rec-4', petId: 'p-milo', type: 'tratamiento', title: 'Tratamiento tópico con prednisolona', desc: 'Aplicar crema en zona afectada cada 12 horas por 7 días. Evitar baños durante el tratamiento.', date: addDaysISO(today, -45), vetId: 'u-ctorres', status: 'finalizado' },
      { id: 'rec-5', petId: 'p-milo', type: 'tratamiento', title: 'Dieta blanda y control de hidratación', desc: 'Alimentación blanda por 5 días y agua a libre disposición.', date: addDaysISO(today, -180), vetId: 'u-srojas', status: 'finalizado' },
      { id: 'rec-6', petId: 'p-milo', type: 'receta', title: 'Prednisolona 5 mg', desc: '1 comprimido cada 24 horas durante 7 días. Control en 14 días.', date: addDaysISO(today, -45), vetId: 'u-ctorres', status: 'finalizado' },
      { id: 'rec-7', petId: 'p-milo', type: 'examen', title: 'Hemograma completo', desc: 'Resultados dentro de rangos normales. Sin signos de infección.', date: addDaysISO(today, -180), vetId: 'u-srojas', status: 'finalizado' },
      { id: 'rec-8', petId: 'p-milo', type: 'examen', title: 'Perfil bioquímico', desc: 'Función renal y hepática normal.', date: addDaysISO(today, -45), vetId: 'u-ctorres', status: 'finalizado' },
      { id: 'rec-9', petId: 'p-milo', type: 'vacuna', title: 'Vacuna antirrábica', desc: 'Dosis anual aplicada. Próximo refuerzo en 12 meses.', date: addDaysISO(today, -300), vetId: 'u-srojas', status: 'activo' },
      { id: 'rec-10', petId: 'p-milo', type: 'vacuna', title: 'Triple canina', desc: 'Refuerzo anual aplicado sin reacciones adversas.', date: addDaysISO(today, -300), vetId: 'u-srojas', status: 'activo' },
      { id: 'rec-11', petId: 'p-milo', type: 'vacuna', title: 'Séxtuple', desc: 'Refuerzo anual aplicado.', date: addDaysISO(today, -300), vetId: 'u-srojas', status: 'activo' },
      { id: 'rec-12', petId: 'p-milo', type: 'vacuna', title: 'Bordetella', desc: 'Refuerzo aplicado según calendario.', date: addDaysISO(today, -200), vetId: 'u-ctorres', status: 'activo' },
      { id: 'rec-13', petId: 'p-luna', type: 'diagnostico', title: 'Gingivitis leve', desc: 'Se recomienda limpieza dental y control en 30 días.', date: addDaysISO(today, -30), vetId: 'u-ctorres', status: 'activo' },
      { id: 'rec-14', petId: 'p-luna', type: 'vacuna', title: 'Triple felina', desc: 'Refuerzo anual aplicado.', date: addDaysISO(today, -120), vetId: 'u-ctorres', status: 'activo' },
      { id: 'rec-15', petId: 'p-bruno', type: 'diagnostico', title: 'Control post operatorio', desc: 'Herida quirúrgica en buen estado. Retiro de puntos en 7 días.', date: addDaysISO(today, -5), vetId: 'u-srojas', status: 'activo' },
      { id: 'rec-16', petId: 'p-nala', type: 'diagnostico', title: 'Dermatitis por contacto', desc: 'Se indica baño medicado y evitar superficies irritantes.', date: addDaysISO(today, -15), vetId: 'u-asilva', status: 'activo' },
      { id: 'rec-17', petId: 'p-simon', type: 'tratamiento', title: 'Antibiótico oral', desc: 'Amoxicilina cada 12 horas por 7 días.', date: addDaysISO(today, -10), vetId: 'u-srojas', status: 'finalizado' }
    ];
    var days = {};
    [0, 1, 2, 3, 4, 5, 6].forEach(function (d) {
      days[d] = d === 0
        ? { active: false, open: '09:00', close: '13:00', breakStart: '', breakEnd: '' }
        : d === 6
          ? { active: true, open: '09:00', close: '13:00', breakStart: '', breakEnd: '' }
          : { active: true, open: '09:00', close: '17:30', breakStart: '13:00', breakEnd: '15:00' };
    });
    var billing = seedBilling(today);
    return {
      version: 2,
      clinic: 'PetCare Providencia',
      users: users,
      tutors: tutors,
      pets: pets,
      appointments: appointments,
      reminders: reminders,
      records: records,
      debts: billing.debts,
      payments: billing.payments,
      schedule: { slotMinutes: 30, days: days }
    };
  }

  function seedBilling(today) {
    var debts = [
      { id: 'debt-milo', tutorId: 't-carolina', petId: 'p-milo', concept: 'Consulta general + vacuna antirrábica', amount: 48900, issuedAt: addDaysISO(today, -6), dueDate: addDaysISO(today, 7), status: 'pendiente', paidAt: '', paymentId: '' },
      { id: 'debt-bruno', tutorId: 't-valentina', petId: 'p-bruno', concept: 'Control post operatorio y medicamentos', amount: 32500, issuedAt: addDaysISO(today, -4), dueDate: addDaysISO(today, 3), status: 'pendiente', paidAt: '', paymentId: '' },
      { id: 'debt-luna', tutorId: 't-felipe', petId: 'p-luna', concept: 'Control anual + limpieza dental', amount: 27500, issuedAt: addDaysISO(today, -2), dueDate: addDaysISO(today, 14), status: 'pendiente', paidAt: '', paymentId: '' },
      { id: 'debt-simon', tutorId: 't-javier', petId: 'p-simon', concept: 'Consulta general', amount: 18900, issuedAt: addDaysISO(today, -20), dueDate: addDaysISO(today, -2), status: 'pendiente', paidAt: '', paymentId: '' }
    ];
    return { debts: debts, payments: [] };
  }

  function resetPaymentsDemo() {
    if (typeof confirm === 'function' && !confirm('¿Dejar todas las cuentas como PENDIENTES y borrar pagos de prueba?')) return;
    if (!Array.isArray(db.debts)) db.debts = [];
    db.debts.forEach(function (d) {
      d.status = 'pendiente';
      d.paidAt = '';
      d.paymentId = '';
    });
    db.payments = [];
    saveDB();
    state.payFilter = 'pendiente';
    refreshAll();
    showToast('Pagos de prueba restablecidos. Todas las cuentas quedaron pendientes.', 'info');
  }

  function ensureBilling(data) {
    if (!Array.isArray(data.debts)) {
      var billing = seedBilling(todayISO());
      data.debts = billing.debts;
      if (!Array.isArray(data.payments)) data.payments = billing.payments;
    }
    if (!Array.isArray(data.payments)) data.payments = [];
    var demoRuts = {
      't-carolina': '12.345.678-5',
      't-javier': '13.456.789-9',
      't-felipe': '14.567.890-0',
      't-diego': '15.678.901-1',
      't-valentina': '16.789.012-1'
    };
    data.tutors.forEach(function (t) {
      if (demoRuts[t.id] && !isValidRut(t.rut)) t.rut = demoRuts[t.id];
    });
    return data;
  }

  function loadDB() {
    var raw = store.get(DB_KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === 2 && Array.isArray(parsed.users) && Array.isArray(parsed.pets)) {
          ensureBilling(parsed);
          store.set(DB_KEY, JSON.stringify(parsed));
          return parsed;
        }
      } catch (e) { /* reset */ }
    }
    var fresh = seedDB();
    ensureBilling(fresh);
    store.set(DB_KEY, JSON.stringify(fresh));
    return fresh;
  }
  function saveDB() {
    try { store.set(DB_KEY, JSON.stringify(db)); } catch (e) { /* cuota llena */ }
  }

  var db = loadDB();
  var session = (function () {
    try { return JSON.parse(store.get(SESSION_KEY) || 'null'); } catch (e) { return null; }
  })();
  var currentUser = null;
  var pendingPhoto = '';
  var billingData = {
    loaded: false,
    loading: false,
    attempted: false,
    openingDebt: false,
    promise: null,
    error: '',
    debts: [],
    payments: [],
    tutors: [],
    pets: []
  };
  var appointmentData = {
    loaded: false,
    loading: false,
    promise: null,
    error: '',
    appointments: [],
    pets: [],
    tutors: [],
    veterinarians: [],
    clinicName: 'PetCare Providencia'
  };
  var legacyDataSync = {
    running: false,
    warning: ''
  };
  var state = {
    route: 'inicio',
    calDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    calVet: 'all',
    selectedDay: nextOpenDay(todayISO()),
    fichaPetId: (db.pets[0] || {}).id || null,
    fichaTab: 'diagnostico',
    reminderFilter: 'all',
    apptFilter: 'all',
    apptQuery: '',
    payFilter: 'pendiente',
    payQuery: '',
    captcha: '',
    adminSection: 'usuarios',
    bannerDismissed: false
  };

  function apiErrorMessage(data) {
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return data.map(apiErrorMessage).join(' ');
    if (data && typeof data === 'object') {
      if (data.detail) return apiErrorMessage(data.detail);
      return Object.keys(data).map(function (key) {
        return apiErrorMessage(data[key]);
      }).filter(Boolean).join(' ');
    }
    return 'No se pudo completar la solicitud.';
  }
  function readApiResponse(response) {
    return response.text().then(function (text) {
      var data = null;
      if (text) {
        try { data = JSON.parse(text); }
        catch (error) { data = text; }
      }
      if (!response.ok) {
        var contentType = response.headers.get('content-type') || '';
        var isHtml = /text\/html/i.test(contentType) ||
          (typeof data === 'string' && /^\s*<!doctype html|^\s*<html[\s>]/i.test(data));
        if (isHtml) {
          throw new Error(
            'El servidor devolvió una página de error. Verifica las migraciones ejecutando ' +
            '`python manage.py migrate` y revisa la terminal de Django.'
          );
        }
        throw new Error(apiErrorMessage(data));
      }
      return data;
    });
  }
  function refreshApiSession() {
    if (!session || !session.refresh) return Promise.reject(new Error('La sesión expiró. Inicia sesión nuevamente.'));
    return fetch('/api/auth/token/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: session.refresh })
    }).then(readApiResponse).then(function (tokens) {
      if (!tokens || !tokens.access) throw new Error('El servidor no renovó la sesión.');
      session.access = tokens.access;
      store.set(SESSION_KEY, JSON.stringify(session));
    }).catch(function (error) {
      clearSession();
      if (currentUser) showLogin();
      throw error;
    });
  }
  function apiRequest(path, options, retried) {
    var requestOptions = Object.assign({}, options || {});
    var headers = new Headers(requestOptions.headers || {});
    if (session && session.access) headers.set('Authorization', 'Bearer ' + session.access);
    requestOptions.headers = headers;
    return fetch(path, requestOptions).then(function (response) {
      if (response.status === 401 && !retried && session && session.refresh) {
        return refreshApiSession().then(function () {
          return apiRequest(path, options, true);
        });
      }
      if (response.status === 401 && retried) {
        clearSession();
        showLogin();
      }
      return readApiResponse(response);
    });
  }
  function apiGetAll(path) {
    var firstUrl = path + (path.indexOf('?') === -1 ? '?' : '&') + 'page_size=100';
    function readPage(url, records) {
      var parsed = new URL(url, location.origin);
      if (parsed.origin !== location.origin) return Promise.reject(new Error('El servidor devolvió una página fuera del sitio.'));
      return apiRequest(parsed.pathname + parsed.search).then(function (data) {
        if (!data || !Array.isArray(data.results)) {
          throw new Error('La respuesta del servidor no contiene una lista válida.');
        }
        var combined = records.concat(data.results);
        return data.next ? readPage(data.next, combined) : combined;
      });
    }
    return readPage(firstUrl, []);
  }
  function mapPetFromApi(pet) {
    return {
      id: pet.id,
      apiId: pet.id,
      tutorId: pet.tutor || pet.tutorId,
      name: pet.name,
      species: pet.species,
      breed: pet.breed || '',
      age: pet.age,
      sex: pet.sex || '',
      reproductive: pet.reproductive_status || pet.reproductive || '',
      weight: pet.weight || '',
      microchip: pet.microchip || '',
      recordNumber: pet.record_number || pet.recordNumber || '',
      photo: pet.photo || '',
      createdAt: pet.created_at || pet.createdAt
    };
  }
  function mapLocalTutorToApi(localTutor, remoteTutor) {
    if (!localTutor || !remoteTutor) return;
    var previousId = localTutor.id;
    Object.assign(localTutor, remoteTutor, { apiId: remoteTutor.id });
    db.pets.forEach(function (pet) {
      if (pet.tutorId === previousId) pet.tutorId = remoteTutor.id;
    });
    db.debts.forEach(function (debt) {
      if (debt.tutorId === previousId) debt.tutorId = remoteTutor.id;
    });
    db.tutors = db.tutors.filter(function (tutor) {
      return tutor === localTutor || tutor.id !== remoteTutor.id;
    });
  }
  function mapLocalPetToApi(localPet, remotePet) {
    var previousId = localPet.id;
    var mappedPet = mapPetFromApi(remotePet);
    Object.assign(localPet, mappedPet);
    db.appointments.forEach(function (appointment) {
      if (appointment.petId === previousId) appointment.petId = remotePet.id;
    });
    db.records.forEach(function (record) {
      if (record.petId === previousId) record.petId = remotePet.id;
    });
    db.reminders.forEach(function (reminder) {
      if (reminder.petId === previousId) reminder.petId = remotePet.id;
    });
    db.debts.forEach(function (debt) {
      if (debt.petId === previousId) debt.petId = remotePet.id;
    });
    if (state.fichaPetId === previousId) state.fichaPetId = remotePet.id;
    db.pets = db.pets.filter(function (pet) {
      return pet === localPet || pet.id !== remotePet.id;
    });
    appointmentData.pets = appointmentData.pets.filter(function (pet) {
      return pet.id !== remotePet.id;
    }).concat([mappedPet]);
    return mappedPet;
  }
  function syncLegacyLocalData() {
    if (legacyDataSync.running) return Promise.resolve();
    legacyDataSync.running = true;
    var warnings = [];
    var localPets = db.pets.filter(function (pet) {
      return /^pet-/.test(pet.id) && !pet.apiId;
    });
    var petSync = localPets.reduce(function (chain, localPet) {
      return chain.then(function () {
        var localTutor = db.tutors.find(function (tutor) {
          return tutor.id === localPet.tutorId;
        });
        if (!localTutor) {
          warnings.push('No se pudo asociar la mascota ' + localPet.name + ': falta su tutor local.');
          return;
        }
        var remoteTutor = appointmentData.tutors.find(function (tutor) {
          return (localTutor.email && tutor.email &&
            tutor.email.toLowerCase() === localTutor.email.toLowerCase()) ||
            (localTutor.rut && tutor.rut && normalizeRut(tutor.rut) === normalizeRut(localTutor.rut));
        });
        var existingPet = remoteTutor && appointmentData.pets.find(function (pet) {
          return pet.tutorId === remoteTutor.id &&
            pet.name.trim().toLowerCase() === localPet.name.trim().toLowerCase() &&
            pet.species === localPet.species;
        });
        if (existingPet) {
          mapLocalTutorToApi(localTutor, remoteTutor);
          mapLocalPetToApi(localPet, existingPet);
          return;
        }
        var petPayload = {
          name: localPet.name,
          species: localPet.species,
          breed: localPet.breed || '',
          age: localPet.age,
          sex: localPet.sex,
          reproductive_status: localPet.reproductive || 'No informado',
          photo: localPet.photo || ''
        };
        var createPet = remoteTutor
          ? apiRequest('/api/pets/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ tutor: remoteTutor.id }, petPayload))
          }).then(function (pet) {
            return { tutor: remoteTutor, pet: pet };
          })
          : apiRequest('/api/pets/register/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tutor: {
                name: localTutor.name,
                rut: localTutor.rut || '',
                phone: localTutor.phone || '',
                email: localTutor.email
              },
              pet: petPayload
            })
          });
        return createPet.then(function (result) {
          mapLocalTutorToApi(localTutor, result.tutor);
          mapLocalPetToApi(localPet, result.pet);
        }).catch(function (error) {
          warnings.push('No se pudo guardar la mascota ' + localPet.name + ': ' + error.message);
        });
      });
    }, Promise.resolve());
    return petSync.then(function () {
      var localAppointments = db.appointments.filter(function (appointment) {
        return /^apt-/.test(appointment.id) && !appointment.apiId;
      });
      return localAppointments.reduce(function (chain, localAppointment) {
        return chain.then(function () {
          var localVet = db.users.find(function (user) {
            return user.id === localAppointment.vetId;
          });
          var remoteVet = localVet && localVet.email && appointmentData.veterinarians.find(function (vet) {
            return vet.email &&
              String(vet.email).toLowerCase() === String(localVet.email).toLowerCase();
          });
          var remotePet = appointmentData.pets.find(function (pet) {
            return pet.id === localAppointment.petId;
          });
          if (!remoteVet || !remotePet) {
            warnings.push('La cita de ' + petName(localAppointment.petId) +
              ' sigue en el navegador: su mascota o veterinario aún no existe en el backend.');
            return;
          }
          var existing = appointmentData.appointments.find(function (appointment) {
            return appointment.pet === remotePet.id &&
              appointment.veterinarian === remoteVet.id &&
              appointment.date === localAppointment.date &&
              String(appointment.time).slice(0, 5) === localAppointment.time;
          });
          if (existing) {
            Object.assign(localAppointment, {
              id: existing.id,
              apiId: existing.id,
              petId: existing.pet,
              vetId: existing.veterinarian,
              hasDebt: existing.has_debt
            });
            return;
          }
          return apiRequest('/api/appointments/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pet: remotePet.id,
              veterinarian: remoteVet.id,
              service: localAppointment.service,
              date: localAppointment.date,
              time: localAppointment.time,
              status: localAppointment.status,
              notes: localAppointment.notes || ''
            })
          }).then(function (created) {
            Object.assign(localAppointment, {
              id: created.id,
              apiId: created.id,
              petId: created.pet,
              vetId: created.veterinarian,
              hasDebt: created.has_debt
            });
            appointmentData.appointments.push(created);
          }).catch(function (error) {
            warnings.push('La cita de ' + petName(localAppointment.petId) +
              ' permanece en el navegador: ' + error.message);
          });
        });
      }, Promise.resolve());
    }).then(function () {
      if (billingRoleAllowed()) {
        return loadBillingData().then(function (loaded) {
          var localDebts = db.debts.filter(function (debt) {
            return /^debt-/.test(debt.id) &&
              !['debt-milo', 'debt-bruno', 'debt-luna', 'debt-simon'].includes(debt.id) &&
              debt.status === 'pendiente' &&
              !debt.apiId;
          });
          if (!loaded) {
            if (localDebts.length) {
              warnings.push('No se pudieron sincronizar las cuentas antiguas porque no fue posible cargar los cobros del backend.');
            }
            return;
          }
          return localDebts.reduce(function (chain, localDebt) {
            return chain.then(function () {
              var localPet = db.pets.find(function (pet) { return pet.id === localDebt.petId; });
              var existing = billingData.debts.find(function (debt) {
                return debt.tutor === localDebt.tutorId &&
                  debt.pet === localDebt.petId &&
                  debt.concept === localDebt.concept &&
                  Number(debt.amount) === Number(localDebt.amount) &&
                  debt.due_date === localDebt.dueDate;
              });
              if (existing) {
                Object.assign(localDebt, { id: existing.id, apiId: existing.id });
                return;
              }
              if (!localPet || !localPet.apiId) {
                warnings.push('La cuenta ' + localDebt.concept +
                  ' permanece en el navegador: primero debe sincronizarse su mascota.');
                return;
              }
              return apiRequest('/api/debts/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tutor: localDebt.tutorId,
                  pet: localDebt.petId,
                  concept: localDebt.concept,
                  amount: Number(localDebt.amount).toFixed(2),
                  issued_at: localDebt.issuedAt,
                  due_date: localDebt.dueDate
                })
              }).then(function (created) {
                Object.assign(localDebt, { id: created.id, apiId: created.id });
                billingData.debts.push(created);
              }).catch(function (error) {
                warnings.push('No se pudo importar la cuenta ' + localDebt.concept + ': ' + error.message);
              });
            });
          }, Promise.resolve());
        });
      }
    }).then(function () {
      legacyDataSync.warning = warnings.join(' ');
      if (warnings.length) {
        saveDB();
        showToast('Algunos datos anteriores siguen guardados en este navegador. ' + warnings[0], 'error');
      }
      saveDB();
      legacyDataSync.running = false;
    }).catch(function (error) {
      legacyDataSync.running = false;
      saveDB();
      throw error;
    });
  }
  function loadAppointmentData(force) {
    if (appointmentData.loaded && !force) return Promise.resolve(true);
    if (appointmentData.loading) return appointmentData.promise;
    appointmentData.loading = true;
    appointmentData.error = '';
    renderAppointments();
    appointmentData.promise = Promise.all([
      apiGetAll('/api/appointments/'),
      apiGetAll('/api/pets/'),
      apiGetAll('/api/tutors/'),
      apiRequest('/api/appointments/veterinarians/'),
      apiRequest('/api/schedule/')
    ]).then(function (results) {
      if (!Array.isArray(results[3])) {
        throw new Error('El servidor no devolvió una lista válida de profesionales.');
      }
      if (!results[4] || !Array.isArray(results[4].days)) {
        throw new Error('El servidor no devolvió un horario válido para la clínica.');
      }
      appointmentData.appointments = results[0];
      appointmentData.pets = results[1].map(function (pet) {
        return {
          id: pet.id,
          tutorId: pet.tutor,
          name: pet.name,
          species: pet.species,
          breed: pet.breed,
          age: pet.age,
          sex: pet.sex,
          reproductive: pet.reproductive_status,
          weight: pet.weight,
          microchip: pet.microchip,
          recordNumber: pet.record_number,
          photo: pet.photo || '',
          createdAt: pet.created_at
        };
      });
      appointmentData.tutors = results[2];
      appointmentData.veterinarians = results[3].map(function (vet) {
        return {
          id: vet.id,
          apiId: vet.id,
          name: vet.name,
          email: vet.email,
          role: VET_ROLE,
          specialty: vet.specialty || '',
          status: 'activo'
        };
      });
      appointmentData.clinicName = results[4].clinic_name;
      var scheduleDays = {};
      results[4].days.forEach(function (day) {
        scheduleDays[day.day_of_week] = {
          active: day.active,
          open: String(day.opening_time).slice(0, 5),
          close: String(day.closing_time).slice(0, 5),
          breakStart: day.break_start ? String(day.break_start).slice(0, 5) : '',
          breakEnd: day.break_end ? String(day.break_end).slice(0, 5) : ''
        };
      });
      db.schedule = {
        slotMinutes: results[4].slot_minutes,
        days: scheduleDays
      };
      var remoteAppointments = appointmentData.appointments.map(function (item) {
        return {
          id: item.id,
          apiId: item.id,
          petId: item.pet,
          service: item.service,
          vetId: item.veterinarian,
          date: item.date,
          time: String(item.time).slice(0, 5),
          status: item.status,
          notes: item.notes || '',
          hasDebt: item.has_debt,
          createdAt: item.created_at
        };
      });
      db.appointments = db.appointments.filter(function (item) {
        return !item.apiId;
      }).concat(remoteAppointments);
      return syncLegacyLocalData().then(function () {
        appointmentData.loaded = true;
        appointmentData.loading = false;
        appointmentData.promise = null;
        saveDB();
        refreshAll();
        return true;
      });
    }).catch(function (error) {
      appointmentData.error = error.message || 'No se pudieron cargar las citas del backend.';
      appointmentData.loading = false;
      appointmentData.promise = null;
      renderAppointments();
      throw error;
    });
    return appointmentData.promise;
  }
  function persistSchedule(schedule, successMessage) {
    var days = [];
    for (var day = 0; day < 7; day++) {
      var value = schedule.days[day];
      days.push({
        day_of_week: day,
        active: value.active,
        opening_time: value.open,
        closing_time: value.close,
        break_start: value.breakStart || null,
        break_end: value.breakEnd || null
      });
    }
    return apiRequest('/api/schedule/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_name: appointmentData.clinicName,
        slot_minutes: schedule.slotMinutes,
        days: days
      })
    }).then(function (data) {
      appointmentData.clinicName = data.clinic_name;
      appointmentData.loaded = false;
      return loadAppointmentData(true);
    }).then(function () {
      saveDB();
      showToast(successMessage);
      renderAdmin();
      renderAvailability();
      renderDashboard();
    }).catch(function (error) {
      showToast(error.message || 'No se pudo guardar el horario en el backend.', 'error');
    });
  }
  function openAppointmentWhenReady(options) {
    loadAppointmentData().then(function () {
      openAppointmentModal(options);
    }).catch(function (error) {
      showToast(error.message || 'No se pudieron cargar los datos para agendar.', 'error');
    });
  }
  function billingRoleAllowed() {
    return currentUser && (currentUser.role === 'Administrador/a' || currentUser.role === 'Recepción');
  }
  function apiUserForUI(user) {
    var roles = { admin: 'Administrador/a', veterinarian: 'Veterinario/a', reception: 'Recepción' };
    return {
      id: 'api-' + user.id,
      apiId: user.id,
      name: user.name,
      email: user.email,
      role: roles[user.role] || 'Recepción',
      specialty: user.specialty || '',
      status: 'activo'
    };
  }

  /* ============================================================
     DISPONIBILIDAD
     ============================================================ */
  function scheduleFor(iso) {
    return db.schedule.days[parseISO(iso).getDay()] || { active: false, open: '09:00', close: '13:00', breakStart: '', breakEnd: '' };
  }
  function baseSlots(iso) {
    var cfg = scheduleFor(iso);
    if (!cfg || !cfg.active) return [];
    var step = db.schedule.slotMinutes || 30;
    var cur = minutesOf(cfg.open);
    var end = minutesOf(cfg.close);
    var bs = cfg.breakStart ? minutesOf(cfg.breakStart) : null;
    var be = cfg.breakEnd ? minutesOf(cfg.breakEnd) : null;
    var out = [];
    while (cur + step <= end) {
      if (bs === null || !(cur >= bs && cur < be)) out.push(timeFromMinutes(cur));
      cur += step;
    }
    return out;
  }
  function isBusyForVet(iso, time, vetId, ignoreId) {
    return db.appointments.some(function (a) {
      return a.date === iso && a.time === time && a.vetId === vetId && a.status !== 'cancelada' && a.id !== ignoreId;
    });
  }
  function slotHasAnyVet(iso, time, vetId, ignoreId) {
    var list = vetId && vetId !== 'all'
      ? [getUser(vetId)].filter(Boolean)
      : activeAppointmentVets();
    return list.some(function (v) { return !isBusyForVet(iso, time, v.id, ignoreId); });
  }
  function freeSlotCount(iso, vetId) {
    return baseSlots(iso).filter(function (t) { return slotHasAnyVet(iso, t, vetId); }).length;
  }
  function nextOpenDay(from) {
    for (var i = 0; i < 90; i++) {
      var iso = addDaysISO(from, i);
      if (freeSlotCount(iso, 'all') > 0) return iso;
    }
    return from;
  }
  function findFreeVet(iso, time) {
    var list = activeAppointmentVets();
    for (var i = 0; i < list.length; i++) {
      if (!isBusyForVet(iso, time, list[i].id)) return list[i].id;
    }
    return list[0] ? list[0].id : '';
  }

  /* ============================================================
     INICIO
     ============================================================ */
  function renderDashboard() {
    var today = todayISO();
    var todayAppts = db.appointments.filter(function (a) {
      return a.date === today && a.status !== 'cancelada';
    }).sort(function (a, b) { return a.time.localeCompare(b.time); });
    var pendingAppts = todayAppts.filter(function (a) { return a.status === 'pendiente'; }).length;
    var freeToday = baseSlots(today).filter(function (t) { return slotHasAnyVet(today, t, 'all'); }).length;
    var pendingRem = db.reminders.filter(function (r) { return r.status === 'pendiente'; }).length;
    var monthPrefix = today.slice(0, 7);
    var newPets = db.pets.filter(function (p) { return String(p.createdAt || '').slice(0, 7) === monthPrefix; }).length;

    var stats = document.querySelector('#inicio .stats');
    if (stats) {
      stats.innerHTML =
        '<article class="card stat"><span class="stat__icon stat__icon--teal">' + icon('i-cal') + '</span><div><p class="stat__label">Citas para hoy</p><p class="stat__value">' + todayAppts.length + '</p><p class="stat__note">' + (pendingAppts ? pendingAppts + ' pendiente' + (pendingAppts === 1 ? '' : 's') + ' de confirmar' : 'Todas confirmadas') + '</p></div></article>' +
        '<article class="card stat"><span class="stat__icon stat__icon--blue">' + icon('i-user') + '</span><div><p class="stat__label">Mascotas registradas</p><p class="stat__value">' + db.pets.length + '</p><p class="stat__note">' + (newPets ? '+' + newPets + ' este mes' : 'Sin registros nuevos este mes') + '</p></div></article>' +
        '<article class="card stat"><span class="stat__icon stat__icon--orange">' + icon('i-clock') + '</span><div><p class="stat__label">Horarios disponibles</p><p class="stat__value">' + freeToday + '</p><p class="stat__note">Hoy, con el equipo activo</p></div></article>' +
        '<article class="card stat"><span class="stat__icon stat__icon--purple">' + icon('i-bell') + '</span><div><p class="stat__label">Recordatorios</p><p class="stat__value">' + pendingRem + '</p><p class="stat__note">' + (pendingRem ? 'Requieren atención' : 'Todo al día') + '</p></div></article>';
    }

    var sub = document.querySelector('#h-citas');
    if (sub) {
      var p = sub.parentElement.querySelector('.panel__sub');
      if (p) p.textContent = 'Agenda para hoy, ' + fmtDateLong(today).replace(/^./, function (c) { return c.toUpperCase(); });
    }

    var apptList = document.getElementById('dashAppts') || document.querySelector('#inicio .appts');
    if (apptList) {
      if (!todayAppts.length) {
        apptList.innerHTML = '<li class="empty"><strong>No hay citas para hoy</strong>Puedes crear una nueva cita desde la agenda.<button class="btn btn--primary btn--sm" type="button" data-action="new-appointment">Agendar cita</button></li>';
      } else {
        apptList.innerHTML = todayAppts.map(function (a) {
          var pet = getPet(a.petId);
          var st = APPT_STATUS[a.status] || APPT_STATUS.pendiente;
          return '<li class="appt"><div class="appt__time"><span class="appt__hour">' + esc(a.time) + '</span><span class="appt__day">Hoy</span></div>' +
            petAvatar(pet, 'pet--38') +
            '<div class="appt__info"><p class="appt__title"><strong>' + esc(pet ? pet.name : 'Mascota') + '</strong> · ' + esc(a.service) + '</p><p class="appt__vet">' + esc(vetName(a.vetId)) + '</p></div>' +
            '<span class="badge ' + st.cls + '">' + st.label + '</span>' +
            '<button class="dots" type="button" data-action="edit-appointment" data-id="' + esc(a.id) + '" aria-label="Editar cita">•••</button></li>';
        }).join('');
      }
    }

    var remList = document.querySelector('#inicio .reminders');
    if (remList) {
      var next = db.reminders.filter(function (r) { return r.status === 'pendiente'; }).sort(function (a, b) { return a.date.localeCompare(b.date); }).slice(0, 2);
      remList.innerHTML = next.length ? next.map(function (r) {
        var d = parseISO(r.date);
        var tone = diffDays(r.date) <= 7 ? 'rem__date--orange' : 'rem__date--teal';
        return '<li class="rem" data-action="goto-reminders" style="cursor:pointer"><span class="rem__date ' + tone + '"><span class="rem__day">' + pad2(d.getDate()) + '</span><span class="rem__mon">' + MONTHS_SHORT[d.getMonth()].toUpperCase() + '</span></span><div class="rem__info"><p class="rem__title">' + esc(r.title) + '</p><p class="rem__sub">' + esc(petName(r.petId)) + ' · ' + esc(relLabel(r.date)) + '</p></div>' + icon('i-right', 'icon--md') + '</li>';
      }).join('') : '<li class="empty" style="border-top:1px solid var(--c-line)"><strong>Sin recordatorios pendientes</strong>Los próximos cuidados aparecerán aquí.</li>';
    }
    updateBell();
  }

  /* ============================================================
     GESTIÓN DE CITAS
     ============================================================ */
  function apptSort(a, b) {
    var today = todayISO();
    var aPast = a.date < today;
    var bPast = b.date < today;
    if (aPast !== bPast) return aPast ? 1 : -1;
    var cmp = (a.date + ' ' + a.time).localeCompare(b.date + ' ' + b.time);
    return aPast ? -cmp : cmp;
  }
  function renderAppointments() {
    var body = document.getElementById('apptBody');
    if (!body) return;
    var search = document.getElementById('apptSearch');
    var filter = document.getElementById('apptFilter');
    if (search && document.activeElement !== search) search.value = state.apptQuery;
    if (filter) filter.value = state.apptFilter;

    var q = state.apptQuery.trim().toLowerCase();
    var list = db.appointments.slice().sort(apptSort).filter(function (a) {
      if (state.apptFilter !== 'all' && a.status !== state.apptFilter) return false;
      if (!q) return true;
      var pet = getPet(a.petId);
      var hay = [pet ? pet.name : '', tutorName(pet ? pet.tutorId : ''), a.service, vetName(a.vetId), a.date].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    var counts = { pendiente: 0, confirmada: 0, atendida: 0, cancelada: 0 };
    db.appointments.forEach(function (a) { if (counts[a.status] != null) counts[a.status]++; });
    var summary = document.getElementById('apptSummary');
    if (summary) summary.textContent = plural(counts.pendiente, 'pendiente', 'pendientes') + ' · ' + plural(counts.confirmada, 'confirmada', 'confirmadas') + ' · ' + plural(counts.atendida, 'atendida', 'atendidas') + ' · ' + plural(counts.cancelada, 'cancelada', 'canceladas');

    if (!list.length) {
      var loading = appointmentData.loading;
      var title = loading ? 'Cargando citas…' : 'No se encontraron citas';
      var message = loading
        ? 'Consultando la agenda guardada en PetCare.'
        : appointmentData.error
          ? 'No se pudo consultar la agenda: ' + appointmentData.error
          : 'Ajusta la búsqueda o crea una nueva cita.';
      body.innerHTML = '<tr><td colspan="5"><div class="empty empty--table"><strong>' + esc(title) + '</strong>' + esc(message) + '</div></td></tr>';
      return;
    }

    body.innerHTML = list.map(function (a) {
      var pet = getPet(a.petId);
      var tutor = pet ? getTutor(pet.tutorId) : null;
      var st = APPT_STATUS[a.status] || APPT_STATUS.pendiente;
      var actions = '';
      if (a.status === 'pendiente') actions += '<button class="icon-btn icon-btn--ok" type="button" data-action="confirm-appointment" data-id="' + esc(a.id) + '" aria-label="Confirmar cita" title="Confirmar">' + icon('i-check') + '</button>';
      if (a.status === 'confirmada') actions += '<button class="icon-btn icon-btn--ok" type="button" data-action="complete-appointment" data-id="' + esc(a.id) + '" aria-label="Marcar como atendida" title="Marcar atendida">' + icon('i-check') + '</button>';
      if (a.apiId && !a.hasDebt && a.status !== 'cancelada' && billingRoleAllowed()) {
        actions += '<button class="icon-btn" type="button" data-action="charge-appointment" data-id="' + esc(a.id) + '" aria-label="Crear cobro para esta cita" title="Crear cobro">' + icon('i-card') + '</button>';
      }
      if (a.apiId && a.hasDebt) actions += '<span class="badge badge--warn" title="Esta cita ya tiene una cuenta asociada">Con cobro</span>';
      actions += '<button class="icon-btn" type="button" data-action="edit-appointment" data-id="' + esc(a.id) + '" aria-label="Editar cita" title="Editar">' + icon('i-pencil') + '</button>';
      if (!a.hasDebt) {
        actions += '<button class="icon-btn icon-btn--danger" type="button" data-action="delete-appointment" data-id="' + esc(a.id) + '" aria-label="Eliminar cita" title="Eliminar">' + icon('i-trash') + '</button>';
      }
      return '<tr data-status="' + esc(a.status) + '">' +
        '<td><span class="cell-strong">' + esc(fmtDateShort(a.date)) + '</span><span class="cell-sub">' + esc(relShort(a.date)) + ' · ' + esc(a.time) + '</span></td>' +
        '<td><span class="cell-pet">' + petAvatar(pet, 'pet--26') + esc(pet ? pet.name : 'Mascota') + '</span><span class="cell-sub">' + esc(tutor ? tutor.name : 'Sin tutor') + '</span></td>' +
        '<td><span class="cell-strong">' + esc(a.service) + '</span><span class="cell-sub">' + esc(vetName(a.vetId)) + '</span></td>' +
        '<td><span class="badge ' + st.cls + '">' + st.label + '</span></td>' +
        '<td class="actions-cell">' + actions + '</td></tr>';
    }).join('');
  }

  /* ============================================================
     DISPONIBILIDAD: CALENDARIO Y CUPOS
     ============================================================ */
  function renderAvailability() {
    var sel = document.getElementById('vetSelect');
    var vets = getAppointmentVets();
    if (state.calVet !== 'all' && !vets.some(function (vet) { return vet.id === state.calVet; })) state.calVet = 'all';
    if (sel) {
      sel.innerHTML = '<option value="all">Todos los veterinarios</option>' + vets.map(function (v) {
        return '<option value="' + esc(v.id) + '">' + esc(v.name) + (v.status !== 'activo' ? ' (inactivo)' : '') + '</option>';
      }).join('');
      sel.value = state.calVet;
    }

    var period = fmtMonth(state.calDate);
    var periodEl = document.getElementById('calPeriod');
    if (periodEl) periodEl.innerHTML = icon('i-cal') + ' ' + esc(initCap(period));
    var monthEl = document.getElementById('calMonthTitle');
    if (monthEl) monthEl.textContent = initCap(period);

    var grid = document.getElementById('calGrid');
    if (grid) {
      var y = state.calDate.getFullYear();
      var m = state.calDate.getMonth();
      var firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
      var daysInMonth = new Date(y, m + 1, 0).getDate();
      var prevDays = new Date(y, m, 0).getDate();
      var cells = [];
      var i;
      var d;
      for (i = firstDow - 1; i >= 0; i--) {
        cells.push({ day: prevDays - i, out: true, date: '' });
      }
      for (d = 1; d <= daysInMonth; d++) {
        cells.push({ day: d, out: false, date: isoOf(new Date(y, m, d)) });
      }
      while (cells.length % 7 !== 0) {
        cells.push({ day: cells.length - (firstDow + daysInMonth) + 1, out: true, date: '' });
      }
      var html = '<span class="cal__dow">Lun</span><span class="cal__dow">Mar</span><span class="cal__dow">Mié</span><span class="cal__dow">Jue</span><span class="cal__dow">Vie</span><span class="cal__dow">Sáb</span><span class="cal__dow">Dom</span>';
      html += cells.map(function (c) {
        if (c.out) return '<button class="cal__day cal__day--out" type="button" disabled>' + c.day + '</button>';
        var cls = 'cal__day';
        var free = freeSlotCount(c.date, state.calVet);
        if (free > 0 && c.date >= todayISO()) cls += ' cal__day--dot';
        if (c.date === state.selectedDay) cls += ' cal__day--sel';
        return '<button class="' + cls + '" type="button" data-action="cal-day" data-date="' + esc(c.date) + '" aria-pressed="' + (c.date === state.selectedDay) + '" aria-label="' + esc(fmtDateLong(c.date)) + ', ' + free + ' cupos">' + c.day + '</button>';
      }).join('');
      grid.innerHTML = html;
    }

    renderDayPanel();
  }

  function renderDayPanel() {
    var panel = document.getElementById('dayPanel');
    if (!panel) return;
    var iso = state.selectedDay;
    var cfg = scheduleFor(iso);
    var slots = baseSlots(iso);
    var vets = state.calVet === 'all' ? activeAppointmentVets() : [getUser(state.calVet)].filter(Boolean);
    var vet = state.calVet === 'all' ? null : getUser(state.calVet);
    var free = slots.filter(function (t) { return slotHasAnyVet(iso, t, state.calVet); });

    var vetCard;
    if (vet) {
      vetCard = '<div class="vet"><span class="avatar avatar--38">' + esc(initials(vet.name)) + '</span><div><p class="vet__name">' + esc(vet.name) + (vet.status !== 'activo' ? ' · Inactivo' : '') + '</p><p class="vet__time">' + esc(vetSpecialty(vet.id)) + ' · ' + (cfg.active ? esc(cfg.open) + ' — ' + esc(cfg.close) : 'Sin atención') + '</p></div><button class="link" type="button" data-action="cycle-vet">Cambiar</button></div>';
    } else {
      vetCard = '<div class="vet"><span class="avatar avatar--38">' + esc(vets.length ? initials('Equipo Clínica') : '—') + '</span><div><p class="vet__name">Todo el equipo</p><p class="vet__time">' + (cfg.active ? esc(cfg.open) + ' — ' + esc(cfg.close) : 'Sin atención') + ' · ' + vets.length + ' profesional' + (vets.length === 1 ? '' : 'es') + ' activo' + (vets.length === 1 ? '' : 's') + '</p></div><button class="link" type="button" data-action="cycle-vet">Cambiar</button></div>';
    }

    var groups = [
      { label: 'Horarios de mañana', list: slots.filter(function (t) { return minutesOf(t) < 13 * 60; }) },
      { label: 'Horarios de tarde', list: slots.filter(function (t) { return minutesOf(t) >= 13 * 60; }) }
    ];

    var slotsHtml = '';
    if (!cfg.active) {
      slotsHtml = '<div class="empty"><strong>La clínica no atiende este día</strong>Selecciona otro día en el calendario o ajusta los horarios en Administración.</div>';
    } else if (!slots.length) {
      slotsHtml = '<div class="empty"><strong>Sin horarios configurados</strong>Revisa la configuración de horarios en Administración.</div>';
    } else {
      groups.forEach(function (g) {
        if (!g.list.length) return;
        slotsHtml += '<p class="slots__label">' + g.label + '</p><div class="slots">' + g.list.map(function (t) {
          var isFree = slotHasAnyVet(iso, t, state.calVet);
          if (isFree) {
            return '<button class="slot" type="button" data-action="book-slot" data-date="' + esc(iso) + '" data-time="' + esc(t) + '" data-vet="' + esc(state.calVet === 'all' ? '' : state.calVet) + '"><b>' + esc(t) + '</b><small>Disponible</small></button>';
          }
          return '<div class="slot slot--busy"><b>' + esc(t) + '</b><small>Ocupado</small></div>';
        }).join('') + '</div>';
      });
    }

    panel.innerHTML = '<div class="day__head"><div><h2 class="panel__title" style="font-size:var(--fs-15)">' + esc(initCap(fmtDateLong(iso))) + '</h2><p class="panel__sub">' + (vet ? esc(vet.name) + ' · ' + esc(vetSpecialty(vet.id)) : 'Equipo de la clínica · Todas las especialidades') + '</p></div><span class="pill">' + free.length + ' cupo' + (free.length === 1 ? '' : 's') + '</span></div>' +
      vetCard + slotsHtml +
      (cfg.active && slots.length && free.length === 0 ? '<p class="panel__sub" style="margin-top:14px">Todos los cupos de este día están ocupados. Prueba con otro día.</p>' : '');
  }

  /* ============================================================
     FICHA MÉDICA
     ============================================================ */
  function petMatches(pet, q) {
    var tutor = getTutor(pet.tutorId);
    var hay = [pet.name, pet.recordNumber, pet.breed, pet.species, tutor ? tutor.name : ''].join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }
  function renderFicha() {
    var card = document.getElementById('patientCard');
    var record = document.getElementById('recordCard');
    var tabs = document.getElementById('fichaTabs');
    var body = document.getElementById('fichaBody');
    if (!card || !record || !tabs || !body) return;

    var pet = getPet(state.fichaPetId);
    if (!pet && db.pets.length) {
      pet = db.pets[0];
      state.fichaPetId = pet.id;
    }
    if (!pet) {
      card.innerHTML = '<div class="empty" style="margin:0"><strong>Aún no hay mascotas registradas</strong>Registra un tutor y su primera mascota para comenzar.<button class="btn btn--primary btn--sm" type="button" data-action="goto-registro">Registrar mascota</button></div>';
      record.hidden = true;
      return;
    }
    state.fichaPetId = pet.id;
    record.hidden = false;

    var tutor = getTutor(pet.tutorId);
    var dates = db.records.filter(function (r) { return r.petId === pet.id; }).map(function (r) { return r.date; })
      .concat(db.appointments.filter(function (a) { return a.petId === pet.id && a.status !== 'cancelada'; }).map(function (a) { return a.date; }));
    dates.sort();
    var lastVisit = dates.length ? dates[dates.length - 1] : '';

    card.innerHTML =
      '<span class="patient__avatar">' + (pet.photo ? '<img src="' + esc(pet.photo) + '" alt="">' : icon('i-paw')) + '</span>' +
      '<div><p class="patient__id">Ficha N° ' + esc(pet.recordNumber) + '</p><h2 class="patient__name">' + esc(pet.name) + '</h2><p class="patient__meta">' + esc(pet.breed || pet.species) + ' · ' + esc(pet.sex || 'Sexo no informado') + ' · ' + esc(pet.age != null ? pet.age + (Number(pet.age) === 1 ? ' año' : ' años') : 'Edad no informada') + '</p></div>' +
      '<div class="patient__facts">' +
        '<div><span class="fact__label">Tutor</span><span class="fact__value">' + esc(tutor ? tutor.name : 'Sin tutor') + '</span></div>' +
        '<div><span class="fact__label">Peso</span><span class="fact__value">' + esc(pet.weight || 'No informado') + '</span></div>' +
        '<div><span class="fact__label">Microchip</span><span class="fact__value">' + esc(pet.microchip || 'No informado') + '</span></div>' +
        '<div><span class="fact__label">Última visita</span><span class="fact__value">' + esc(lastVisit ? fmtDateShort(lastVisit) : 'Sin visitas') + '</span></div>' +
      '</div>' +
      '<button class="btn btn--outline" type="button" data-action="edit-pet" data-id="' + esc(pet.id) + '">' + icon('i-pencil', 'icon--sm') + 'Editar datos</button>';

    var searchInput = document.getElementById('fichaSearch');
    if (searchInput && document.activeElement !== searchInput && !searchInput.value) searchInput.value = pet.name;

    tabs.innerHTML = Object.keys(RECORD_TYPES).map(function (key) {
      var t = RECORD_TYPES[key];
      var count = db.records.filter(function (r) { return r.petId === pet.id && r.type === key; }).length;
      var selected = state.fichaTab === key;
      return '<button class="tab" role="tab" aria-selected="' + selected + '" data-action="ficha-tab" data-tab="' + key + '" type="button">' + t.label + (count ? ' <span class="tab__count">' + count + '</span>' : '') + '</button>';
    }).join('');

    var type = RECORD_TYPES[state.fichaTab] || RECORD_TYPES.diagnostico;
    var records = db.records.filter(function (r) { return r.petId === pet.id && r.type === state.fichaTab; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); });

    body.innerHTML =
      '<div class="record__head"><div><h2 class="record__title">' + type.label + '</h2><p class="panel__sub">Registro histórico de ' + esc(type.label.toLowerCase()) + ' de ' + esc(pet.name) + '.</p></div><button class="btn btn--primary" type="button" data-action="new-record" data-type="' + state.fichaTab + '">' + icon('i-plus', 'icon--md') + 'Agregar registro</button></div>' +
      (records.length
        ? '<ul class="timeline">' + records.map(function (r) {
          var st = RECORD_STATUS[r.status] || RECORD_STATUS.finalizado;
          return '<li class="tl"><span class="tl__dot">' + icon(type.icon) + '</span><div class="tl__body">' +
            '<div class="tl__top">' + esc(fmtDateShort(r.date)) + ' <span class="badge ' + st.cls + '">' + st.label + '</span></div>' +
            '<h3 class="tl__title">' + esc(r.title) + '</h3>' +
            '<p class="tl__desc">' + esc(r.desc || 'Sin observaciones adicionales.') + '</p>' +
            '<div class="tl__foot"><span class="tl__vet"><span class="avatar avatar--24">' + esc(initials(vetName(r.vetId))) + '</span>' + esc(vetName(r.vetId)) + '</span>' +
            '<span class="record__actions"><button class="link" type="button" data-action="view-record" data-id="' + esc(r.id) + '">Ver detalle' + icon('i-right', 'icon--xs') + '</button>' +
            '<button class="icon-btn" type="button" data-action="edit-record" data-id="' + esc(r.id) + '" aria-label="Editar registro" title="Editar">' + icon('i-pencil') + '</button>' +
            '<button class="icon-btn icon-btn--danger" type="button" data-action="delete-record" data-id="' + esc(r.id) + '" aria-label="Eliminar registro" title="Eliminar">' + icon('i-trash') + '</button></span></div>' +
            '</div></li>';
        }).join('') + '</ul>'
        : '<div class="empty"><strong>Sin registros de ' + esc(type.label.toLowerCase()) + '</strong>Agrega el primer registro clínico de ' + esc(pet.name) + '.</div>');
  }

  function renderFichaResults(query) {
    var box = document.getElementById('fichaResults');
    if (!box) return;
    var q = String(query || '').trim().toLowerCase();
    if (!q) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    var matches = db.pets.filter(function (p) { return petMatches(p, q); }).slice(0, 8);
    if (!matches.length) {
      box.innerHTML = '<div class="search-empty">No se encontraron mascotas, tutores ni fichas con “' + esc(query) + '”.</div>';
    } else {
      box.innerHTML = matches.map(function (p) {
        var t = getTutor(p.tutorId);
        return '<button class="search-result" type="button" data-action="select-pet" data-id="' + esc(p.id) + '">' + petAvatar(p, 'pet--26') +
          '<span><span class="search-result__name">' + esc(p.name) + ' · ' + esc(p.recordNumber) + '</span><span class="search-result__meta">' + esc(t ? t.name : 'Sin tutor') + ' · ' + esc(p.breed || p.species) + '</span></span></button>';
      }).join('');
    }
    box.hidden = false;
  }

  /* ============================================================
     RECORDATORIOS
     ============================================================ */
  function updateBell() {
    var count = db.reminders.filter(function (r) { return r.status === 'pendiente'; }).length;
    var dot = document.getElementById('bellDot');
    if (dot) dot.hidden = !count;
    var badge = document.querySelector('.nav__link[data-route="recordatorios"] .nav__badge');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = !count;
    }
  }

  function renderReminders() {
    var stats = document.querySelector('#recordatorios .stats3');
    var pending = db.reminders.filter(function (r) { return r.status === 'pendiente'; });
    var sent = db.reminders.filter(function (r) { return r.status === 'enviado'; });
    var next30 = db.reminders.filter(function (r) { var n = diffDays(r.date); return n >= 0 && n <= 30; });
    if (stats) {
      stats.innerHTML =
        '<article class="card stat3"><span class="stat__icon stat__icon--orange">' + icon('i-bell') + '</span><div><p class="stat3__value">' + pending.length + '</p><p class="stat3__label">Pendientes de envío</p></div></article>' +
        '<article class="card stat3"><span class="stat__icon stat__icon--teal">' + icon('i-check') + '</span><div><p class="stat3__value">' + sent.length + '</p><p class="stat3__label">Enviados</p></div></article>' +
        '<article class="card stat3"><span class="stat__icon stat__icon--blue">' + icon('i-cal') + '</span><div><p class="stat3__value">' + next30.length + '</p><p class="stat3__label">Próximos 30 días</p></div></article>';
    }

    var banner = document.getElementById('banner');
    var next = pending.slice().sort(function (a, b) { return a.date.localeCompare(b.date); })[0];
    if (banner) {
      if (!next || state.bannerDismissed) {
        banner.hidden = true;
      } else {
        banner.hidden = false;
        var title = banner.querySelector('.banner__title');
        var sub = banner.querySelector('.banner__sub');
        var button = banner.querySelector('.btn[data-action="book-banner"]');
        var pet = getPet(next.petId);
        if (title) title.textContent = '¡Hola, ' + (currentUser ? currentUser.name.split(' ')[0] : 'Carolina') + '! ' + (pet ? pet.name : 'Tu mascota') + ' tiene un recordatorio: ' + next.title;
        if (sub) sub.textContent = 'El recordatorio vence el ' + fmtDateShort(next.date) + '. Agenda una cita para mantener a ' + (pet ? pet.name : 'tu mascota') + ' protegido.';
        if (button) {
          button.dataset.pet = next.petId;
          button.dataset.date = next.date;
          button.dataset.service = /vacun/i.test(next.title) ? 'Vacunación' : 'Consulta general';
        }
      }
    }

    var seg = document.querySelectorAll('#recordatorios .seg button');
    seg.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.filter === state.reminderFilter));
    });

    var body = document.getElementById('remBody');
    if (!body) return;
    var list = db.reminders.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).filter(function (r) {
      return state.reminderFilter === 'all' || r.status === state.reminderFilter;
    });
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="6"><div class="empty empty--table"><strong>Sin recordatorios en esta vista</strong>Cambia el filtro o crea un nuevo recordatorio.</div></td></tr>';
      return;
    }
    body.innerHTML = list.map(function (r) {
      var pet = getPet(r.petId);
      var tutor = pet ? getTutor(pet.tutorId) : null;
      var st = REM_STATUS[r.status] || REM_STATUS.pendiente;
      var actions = '';
      if (r.status === 'pendiente') actions += '<button class="icon-btn icon-btn--ok" type="button" data-action="send-reminder" data-id="' + esc(r.id) + '" aria-label="Marcar como enviado" title="Marcar como enviado">' + icon('i-check') + '</button>';
      actions += '<button class="icon-btn" type="button" data-action="edit-reminder" data-id="' + esc(r.id) + '" aria-label="Editar recordatorio" title="Editar">' + icon('i-pencil') + '</button>' +
        '<button class="icon-btn icon-btn--danger" type="button" data-action="delete-reminder" data-id="' + esc(r.id) + '" aria-label="Eliminar recordatorio" title="Eliminar">' + icon('i-trash') + '</button>';
      return '<tr data-status="' + esc(r.status) + '"><td><span class="cell-strong">' + esc(fmtDateShort(r.date)) + '</span><span class="cell-sub">' + esc(relShort(r.date)) + '</span></td>' +
        '<td><span class="cell-pet">' + petAvatar(pet, 'pet--26') + esc(pet ? pet.name : 'Mascota') + '</span></td>' +
        '<td>' + esc(r.title) + '</td><td>' + esc(tutor ? tutor.name : 'Sin tutor') + '</td>' +
        '<td><span class="badge ' + st.cls + '">' + st.label + '</span></td>' +
        '<td class="actions-cell">' + actions + '</td></tr>';
    }).join('');
  }

  /* ============================================================
     ADMINISTRACIÓN
     ============================================================ */
  function defaultSchedule() {
    var days = {};
    [0, 1, 2, 3, 4, 5, 6].forEach(function (d) {
      days[d] = d === 0
        ? { active: false, open: '09:00', close: '13:00', breakStart: '', breakEnd: '' }
        : d === 6
          ? { active: true, open: '09:00', close: '13:00', breakStart: '', breakEnd: '' }
          : { active: true, open: '09:00', close: '17:30', breakStart: '13:00', breakEnd: '15:00' };
    });
    return { slotMinutes: 30, days: days };
  }

  function renderAdmin() {
    var panel = document.getElementById('adminPanel');
    if (!panel) return;
    if (!currentUser || currentUser.role !== 'Administrador/a') {
      panel.innerHTML = '';
      return;
    }
    document.querySelectorAll('.settings__link[data-admin]').forEach(function (link) {
      if (link.dataset.admin === state.adminSection) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });

    if (state.adminSection === 'django' || state.adminSection === 'api') {
      var isApi = state.adminSection === 'api';
      var title = isApi ? 'Swagger / OpenAPI' : 'Django Admin';
      var description = isApi
        ? 'Documentación interactiva de la API PetCare. Disponible solo para administradores.'
        : 'Administra los datos desde Django, sin salir del panel PetCare.';
      var src = isApi
        ? '/api-auth/login/?next=%2Fapi%2Fdocs%2F'
        : '/admin/';
      panel.innerHTML = '<section class="card users admin-embed" aria-labelledby="admin-embed-title">' +
        '<div class="users__head"><div><h2 class="panel__title" id="admin-embed-title" style="font-weight:500;font-size:var(--fs-14)">' + title + '</h2>' +
        '<p class="panel__sub" style="font-size:var(--fs-10)">' + description +
        (isApi ? ' Inicia sesión en el formulario integrado para abrir Swagger.' : '') +
        '</p></div></div>' +
        '<iframe class="admin-embed__frame" src="' + src + '" title="' + title + '" loading="lazy"></iframe></section>';
      return;
    }

    if (state.adminSection === 'profesionales') {
      var vets = getVets();
      panel.innerHTML = '<section class="card users" aria-labelledby="h-pros"><div class="users__head"><div><h2 class="panel__title" id="h-pros" style="font-weight:500;font-size:var(--fs-14)">Profesionales</h2><p class="panel__sub" style="font-size:var(--fs-10)">Equipo veterinario y especialidades de la clínica.</p></div><button class="btn btn--primary" type="button" data-action="new-user" data-role="' + VET_ROLE + '">' + icon('i-plus', 'icon--md') + 'Agregar profesional</button></div>' +
        (vets.length ? '<div class="pro-grid">' + vets.map(function (u) {
          var today = todayISO();
          var upcoming = db.appointments.filter(function (a) {
            return a.vetId === u.id && a.date >= today && a.status !== 'cancelada';
          }).length;
          var records = db.records.filter(function (r) { return r.vetId === u.id; }).length;
          return '<article class="pro-card"><span class="avatar">' + esc(initials(u.name)) + '</span><div class="pro-card__body"><p class="pro-card__name">' + esc(u.name) + '</p><p class="pro-card__meta">' + esc(u.specialty || 'Medicina general') + ' · ' + esc(u.email) + '</p><div class="pro-card__stats"><span class="pro-card__stat"><b>' + upcoming + '</b><span>Próximas citas</span></span><span class="pro-card__stat"><b>' + records + '</b><span>Registros</span></span><span class="pro-card__stat"><b><span class="badge ' + (u.status === 'activo' ? 'badge--ok' : 'badge--off') + '">' + (u.status === 'activo' ? 'Activo' : 'Inactivo') + '</span></b><span>Estado</span></span></div></div><div class="pro-card__actions"><button class="icon-btn" type="button" data-action="edit-user" data-id="' + esc(u.id) + '" aria-label="Editar ' + esc(u.name) + '" title="Editar">' + icon('i-pencil') + '</button></div></article>';
        }).join('') + '</div>' : '<div class="admin-empty">Aún no hay profesionales registrados.</div>') +
        '</section>';
      return;
    }

    if (state.adminSection === 'horarios') {
      var order = [1, 2, 3, 4, 5, 6, 0];
      panel.innerHTML = '<section class="card users" aria-labelledby="h-sched"><div class="users__head"><div><h2 class="panel__title" id="h-sched" style="font-weight:500;font-size:var(--fs-14)">Horarios de atención</h2><p class="panel__sub" style="font-size:var(--fs-10)">Define los días y bloques en que la clínica recibe citas.</p></div></div>' +
        '<form id="scheduleForm"><div class="sched"><div class="sched__inner"><div class="sched__row sched__head"><span>Día</span><span>Atiende</span><span>Apertura</span><span>Cierre</span><span>Colación inicio</span><span>Colación fin</span></div>' +
        order.map(function (d) {
          var cfg = db.schedule.days[d] || defaultSchedule().days[d];
          return '<div class="sched__row" data-day="' + d + '"><span class="sched__day">' + DAYS_SHORT[d] + '</span><input type="checkbox" data-day="' + d + '" data-field="active" aria-label="Atiende el ' + DAYS_SHORT[d] + '"' + (cfg.active ? ' checked' : '') + '><input type="time" data-day="' + d + '" data-field="open" value="' + esc(cfg.open) + '" aria-label="Apertura ' + DAYS_SHORT[d] + '"><input type="time" data-day="' + d + '" data-field="close" value="' + esc(cfg.close) + '" aria-label="Cierre ' + DAYS_SHORT[d] + '"><input type="time" data-day="' + d + '" data-field="breakStart" value="' + esc(cfg.breakStart || '') + '" aria-label="Inicio colación ' + DAYS_SHORT[d] + '"><input type="time" data-day="' + d + '" data-field="breakEnd" value="' + esc(cfg.breakEnd || '') + '" aria-label="Fin colación ' + DAYS_SHORT[d] + '"></div>';
        }).join('') + '</div></div><div class="sched__foot"><p class="sched__note">Las citas se generan cada ' + (db.schedule.slotMinutes || 30) + ' minutos. Deja la colación vacía si no corresponde.</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn--outline" type="button" data-action="reset-schedule">Restaurar</button><button class="btn btn--primary" type="submit">' + icon('i-check', 'icon--md') + 'Guardar horarios</button></div></div></form></section>';
      var form = document.getElementById('scheduleForm');
      if (form) form.addEventListener('submit', handleScheduleSubmit);
      return;
    }

    var rows = db.users.map(function (u) {
      return '<tr><td><div class="user-cell"><span class="avatar">' + esc(initials(u.name)) + '</span><div><span class="user-cell__name">' + esc(u.name) + '</span><span class="user-cell__role">' + esc(u.role) + (u.role === VET_ROLE && u.specialty ? ' · ' + esc(u.specialty) : '') + '</span></div></div></td>' +
        '<td class="mail">' + esc(u.email) + '</td>' +
        '<td><span class="badge ' + (u.status === 'activo' ? 'badge--ok' : 'badge--off') + '">' + (u.status === 'activo' ? 'Activo' : 'Inactivo') + '</span></td>' +
        '<td class="actions-cell"><button class="icon-btn" type="button" data-action="edit-user" data-id="' + esc(u.id) + '" aria-label="Editar ' + esc(u.name) + '" title="Editar">' + icon('i-pencil') + '</button><button class="icon-btn icon-btn--danger" type="button" data-action="delete-user" data-id="' + esc(u.id) + '" aria-label="Eliminar ' + esc(u.name) + '" title="Eliminar">' + icon('i-trash') + '</button></td></tr>';
    }).join('');
    panel.innerHTML = '<section class="card users" aria-labelledby="h-users"><div class="users__head"><div><h2 class="panel__title" id="h-users" style="font-weight:500;font-size:var(--fs-14)">Usuarios</h2><p class="panel__sub" style="font-size:var(--fs-10)">Administra los usuarios registrados en el sistema.</p></div><button class="btn btn--primary" type="button" data-action="new-user" data-role="Recepción">' + icon('i-plus', 'icon--md') + 'Agregar usuario</button></div><div class="table-wrap"><table class="table"><thead><tr><th scope="col">Nombre</th><th scope="col">Correo</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  function handleScheduleSubmit(e) {
    e.preventDefault();
    var form = e.currentTarget;
    var next = { slotMinutes: db.schedule.slotMinutes || 30, days: {} };
    var order = [1, 2, 3, 4, 5, 6, 0];
    for (var i = 0; i < order.length; i++) {
      var d = order[i];
      var activeEl = form.querySelector('input[data-day="' + d + '"][data-field="active"]');
      var openEl = form.querySelector('input[data-day="' + d + '"][data-field="open"]');
      var closeEl = form.querySelector('input[data-day="' + d + '"][data-field="close"]');
      var bsEl = form.querySelector('input[data-day="' + d + '"][data-field="breakStart"]');
      var beEl = form.querySelector('input[data-day="' + d + '"][data-field="breakEnd"]');
      var active = !!(activeEl && activeEl.checked);
      var open = (openEl && openEl.value) || '09:00';
      var close = (closeEl && closeEl.value) || '13:00';
      var bs = bsEl ? bsEl.value : '';
      var be = beEl ? beEl.value : '';
      if (active) {
        if (minutesOf(open) >= minutesOf(close)) {
          showToast('El cierre debe ser posterior a la apertura del ' + DAYS_SHORT[d] + '.', 'error');
          return;
        }
        if (bs || be) {
          if (!bs || !be || minutesOf(bs) >= minutesOf(be) || minutesOf(bs) < minutesOf(open) || minutesOf(be) > minutesOf(close)) {
            showToast('Revisa la colación del ' + DAYS_SHORT[d] + '.', 'error');
            return;
          }
        }
      }
      next.days[d] = { active: active, open: open, close: close, breakStart: bs, breakEnd: be };
    }
    persistSchedule(next, 'Horarios de atención actualizados.');
  }

  /* ============================================================
     PAGOS SIMULADOS (TRANSBANK ONECLICK MALL + QR)
     Simulación local para demo/clase — NO realiza cobros reales ni
     llama a la API de Transbank. Usa datos del ambiente de integración
     como referencia visual/educativa.
     ============================================================ */
  var TBK = {
    env: 'Integración (simulado)',
    host: 'https://webpay3gint.transbank.cl',
    oneclickAuthorize: '/rswebpaytransaction/api/oneclick/v1.2/transactions',
    parentCode: '597055555541',
    childCode: '597055555542',
    testCard: { type: 'VISA', number: '4051 8856 0044 6623', last4: '6623', cvv: '123', result: 'aprobada' },
    authTest: { rut: '11.111.111-1', password: '123' }
  };
  function getDebt(id) { return db.debts.find(function (d) { return d.id === id; }); }
  function pendingDebtsFor(tutorId) {
    return db.debts.filter(function (d) { return d.tutorId === tutorId && d.status === 'pendiente'; });
  }
  function paymentForDebt(debtId) {
    return db.payments.find(function (p) { return (p.debtIds || []).indexOf(debtId) !== -1; });
  }
  function makeCaptcha() {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 5; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }
  function refreshCaptchaUI() {
    state.captcha = makeCaptcha();
    var el = document.getElementById('payCaptchaCode');
    if (el) el.textContent = state.captcha;
  }
  function qrSvg(payload) {
    var n = 29;
    var quiet = 2;
    var seed = 2166136261;
    for (var i = 0; i < payload.length; i++) {
      seed ^= payload.charCodeAt(i);
      seed = Math.imul(seed, 16777619);
    }
    function rnd() {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    }
    function inFinder(r, c) {
      return (r < 9 && c < 9) || (r < 9 && c >= n - 8) || (r >= n - 8 && c < 9);
    }
    var rects = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (inFinder(r, c)) continue;
        var dark;
        if (r === 6) dark = c % 2 === 0;
        else if (c === 6) dark = r % 2 === 0;
        else dark = rnd() > 0.52;
        if (dark) rects += '<rect x="' + (c + quiet) + '" y="' + (r + quiet) + '" width="1" height="1"/>';
      }
    }
    function finder(fr, fc) {
      var x = fc + quiet;
      var y = fr + quiet;
      return '<rect x="' + x + '" y="' + y + '" width="7" height="7"/><rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="5" height="5" fill="#fff"/><rect x="' + (x + 2) + '" y="' + (y + 2) + '" width="3" height="3"/>';
    }
    return '<svg class="pay-qr" viewBox="0 0 ' + (n + quiet * 2) + ' ' + (n + quiet * 2) + '" role="img" aria-label="Código QR simulado de pago">' +
      '<rect width="100%" height="100%" fill="#fff"/><g fill="#102a43">' + rects +
      finder(0, 0) + finder(0, n - 7) + finder(n - 7, 0) + '</g></svg>';
  }

  function renderPaymentsDemo() {
    var stats = document.getElementById('payStats');
    var pending = db.debts.filter(function (d) { return d.status === 'pendiente'; });
    var pendingTotal = pending.reduce(function (sum, d) { return sum + Number(d.amount || 0); }, 0);
    var today = todayISO();
    var paidToday = db.payments.filter(function (p) { return String(p.createdAt || '').slice(0, 10) === today; });
    var paidTodayTotal = paidToday.reduce(function (sum, p) { return sum + Number(p.amount || 0); }, 0);
    if (stats) {
      stats.innerHTML =
        '<article class="card stat3"><span class="stat__icon stat__icon--orange">' + icon('i-card') + '</span><div><p class="stat3__value">' + money(pendingTotal) + '</p><p class="stat3__label">Total por cobrar</p></div></article>' +
        '<article class="card stat3"><span class="stat__icon stat__icon--blue">' + icon('i-qr') + '</span><div><p class="stat3__value">' + pending.length + '</p><p class="stat3__label">Cuenta' + (pending.length === 1 ? '' : 's') + ' pendiente' + (pending.length === 1 ? '' : 's') + '</p></div></article>' +
        '<article class="card stat3"><span class="stat__icon stat__icon--teal">' + icon('i-check') + '</span><div><p class="stat3__value">' + money(paidTodayTotal) + '</p><p class="stat3__label">Cobrado hoy (simulado)</p></div></article>';
    }

    document.querySelectorAll('#pagos .seg button[data-filter]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.filter === state.payFilter));
    });

    var body = document.getElementById('payBody');
    if (body) {
      var q = state.payQuery.trim().toLowerCase();
      var list = db.debts.filter(function (d) {
        if (state.payFilter !== 'all' && d.status !== state.payFilter) return false;
        if (!q) return true;
        var tutor = getTutor(d.tutorId);
        var pet = getPet(d.petId);
        var hay = [tutor ? tutor.name : '', tutor ? tutor.rut : '', pet ? pet.name : '', d.concept].join(' ').toLowerCase();
        return hay.indexOf(q) !== -1;
      }).sort(function (a, b) {
        if (a.status !== b.status) return a.status === 'pendiente' ? -1 : 1;
        return String(a.dueDate).localeCompare(String(b.dueDate));
      });
      if (!list.length) {
        body.innerHTML = '<tr><td colspan="7"><div class="empty empty--table"><strong>Sin cuentas para mostrar</strong>Ajusta el filtro o busca otro RUT.</div></td></tr>';
      } else {
        body.innerHTML = list.map(function (d) {
          var tutor = getTutor(d.tutorId);
          var pet = getPet(d.petId);
          var st = DEBT_STATUS[d.status] || DEBT_STATUS.pendiente;
          var actions = '';
          if (d.status === 'pendiente') {
            actions += '<button class="icon-btn" type="button" data-action="debt-qr" data-id="' + esc(d.id) + '" aria-label="Ver QR de pago" title="Ver QR">' + icon('i-qr') + '</button>';
            actions += '<button class="icon-btn icon-btn--ok" type="button" data-action="pay-debt" data-id="' + esc(d.id) + '" aria-label="Cobrar con Oneclick" title="Cobrar Oneclick">' + icon('i-card') + '</button>';
          } else {
            actions += '<button class="icon-btn" type="button" data-action="view-receipt" data-id="' + esc(d.id) + '" aria-label="Ver comprobante" title="Comprobante">' + icon('i-clip') + '</button>';
          }
          return '<tr>' +
            '<td><span class="cell-strong">' + esc(tutor ? tutor.name : 'Sin tutor') + '</span><span class="cell-sub">' + esc(tutor ? tutor.rut : '—') + '</span></td>' +
            '<td><span class="cell-pet">' + petAvatar(pet, 'pet--26') + esc(pet ? pet.name : 'Mascota') + '</span><span class="cell-sub">' + esc(pet ? pet.recordNumber : '') + '</span></td>' +
            '<td><span class="cell-strong">' + esc(d.concept) + '</span><span class="cell-sub">Emitido ' + esc(fmtDateShort(d.issuedAt)) + '</span></td>' +
            '<td><span class="cell-strong">' + esc(fmtDateShort(d.dueDate)) + '</span><span class="cell-sub">' + esc(relShort(d.dueDate)) + '</span></td>' +
            '<td><span class="money">' + esc(money(d.amount)) + '</span></td>' +
            '<td><span class="badge ' + st.cls + '">' + st.label + '</span></td>' +
            '<td class="actions-cell">' + actions + '</td></tr>';
        }).join('');
      }
    }

    var history = document.getElementById('payHistoryBody');
    var count = document.getElementById('payHistoryCount');
    if (count) count.textContent = db.payments.length + ' pago' + (db.payments.length === 1 ? '' : 's');
    if (history) {
      var payments = db.payments.slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      if (!payments.length) {
        history.innerHTML = '<tr><td colspan="7"><div class="empty empty--table"><strong>Aún no hay pagos</strong>Las transacciones aprobadas aparecerán aquí.</div></td></tr>';
      } else {
        history.innerHTML = payments.map(function (p) {
          var pet = getPet(p.petId);
          return '<tr>' +
            '<td><span class="cell-strong">' + esc(fmtDateTime(p.createdAt)) + '</span><span class="cell-sub">Simulado</span></td>' +
            '<td><span class="cell-strong">' + esc(p.buyOrder) + '</span></td>' +
            '<td><span class="cell-pet">' + petAvatar(pet, 'pet--26') + esc(pet ? pet.name : 'Mascota') + '</span></td>' +
            '<td><span class="money">' + esc(money(p.amount)) + '</span></td>' +
            '<td><span class="cell-strong">' + esc(p.authCode) + '</span><span class="cell-sub">Visa •••• ' + esc(p.cardNumber) + '</span></td>' +
            '<td><span class="badge badge--ok">AUTHORIZED</span></td>' +
            '<td class="actions-cell"><button class="icon-btn" type="button" data-action="view-receipt" data-id="' + esc((p.debtIds || [])[0] || '') + '" data-payment="' + esc(p.id) + '" aria-label="Ver comprobante" title="Comprobante">' + icon('i-clip') + '</button></td></tr>';
        }).join('');
      }
    }
  }

  function renderPayments() {
    var errorBox = document.getElementById('payError');
    if (!billingRoleAllowed()) {
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = 'Tu cuenta no tiene permisos para administrar cobros.';
      }
      return;
    }

    if (state.route === 'pagos' && !billingData.loaded && !billingData.loading && !billingData.attempted) loadBillingData();
    var pending = billingData.debts.filter(function (debt) { return debt.status === 'pendiente'; });
    var paidToday = billingData.payments.filter(function (payment) {
      return String(payment.created_at || '').slice(0, 10) === todayISO() && payment.status === 'authorized';
    });
    var paidTodayTotal = paidToday.reduce(function (sum, payment) { return sum + Number(payment.amount || 0); }, 0);
    if (errorBox) {
      errorBox.hidden = !billingData.error;
      errorBox.textContent = billingData.error;
    }

    var stats = document.getElementById('payStats');
    if (stats) {
      var pendingTotal = pending.reduce(function (sum, debt) { return sum + Number(debt.amount || 0); }, 0);
      stats.innerHTML =
        '<article class="card stat3"><span class="stat__icon stat__icon--orange">' + icon('i-card') + '</span><div><p class="stat3__value">' + money(pendingTotal) + '</p><p class="stat3__label">Total por cobrar</p></div></article>' +
        '<article class="card stat3"><span class="stat__icon stat__icon--blue">' + icon('i-card') + '</span><div><p class="stat3__value">' + pending.length + '</p><p class="stat3__label">Cuentas pendientes</p></div></article>' +
        '<article class="card stat3"><span class="stat__icon stat__icon--teal">' + icon('i-check') + '</span><div><p class="stat3__value">' + money(paidTodayTotal) + '</p><p class="stat3__label">Cobrado hoy</p></div></article>';
    }

    document.querySelectorAll('#pagos .seg button[data-filter]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === state.payFilter));
    });

    var body = document.getElementById('payBody');
    if (body) {
      var query = state.payQuery.trim().toLowerCase();
      var debts = billingData.debts.filter(function (debt) {
        if (state.payFilter !== 'all' && debt.status !== state.payFilter) return false;
        if (!query) return true;
        var tutor = billingData.tutors.find(function (item) { return item.id === debt.tutor; });
        var pet = billingData.pets.find(function (item) { return item.id === debt.pet; });
        return [tutor ? tutor.name : '', tutor ? tutor.rut : '', pet ? pet.name : '', debt.concept]
          .join(' ').toLowerCase().indexOf(query) !== -1;
      }).sort(function (a, b) {
        if (a.status !== b.status) return a.status === 'pendiente' ? -1 : 1;
        return String(a.due_date).localeCompare(String(b.due_date));
      });

      if (!debts.length) {
        var emptyTitle = billingData.loading ? 'Cargando cuentas…' : 'Sin cuentas para mostrar';
        var emptyText = billingData.loading ? 'Consultando el backend.' : 'Ajusta el filtro o crea una cuenta nueva.';
        body.innerHTML = '<tr><td colspan="7"><div class="empty empty--table"><strong>' + emptyTitle + '</strong>' + emptyText + '</div></td></tr>';
      } else {
        body.innerHTML = debts.map(function (debt) {
          var tutor = billingData.tutors.find(function (item) { return item.id === debt.tutor; });
          var pet = billingData.pets.find(function (item) { return item.id === debt.pet; });
          var appointment = debt.appointment && appointmentData.appointments.find(function (item) {
            return item.id === debt.appointment;
          });
          var debtStatus = DEBT_STATUS[debt.status] || DEBT_STATUS.pendiente;
          var actions = '';
          if (debt.status === 'pendiente') {
            actions += '<a class="icon-btn" href="' + esc(debt.payment_url) + '" target="_blank" rel="noopener" aria-label="Abrir pago Transbank" title="Abrir pago Transbank">' + icon('i-card') + '</a>';
            actions += '<button class="icon-btn" type="button" data-action="edit-debt" data-id="' + esc(debt.id) + '" aria-label="Editar cuenta" title="Editar">' + icon('i-pencil') + '</button>';
            actions += '<button class="icon-btn icon-btn--danger" type="button" data-action="delete-debt" data-id="' + esc(debt.id) + '" aria-label="Eliminar cuenta" title="Eliminar">' + icon('i-trash') + '</button>';
          }
          return '<tr>' +
            '<td><span class="cell-strong">' + esc(tutor ? tutor.name : 'Sin tutor') + '</span><span class="cell-sub">' + esc(tutor ? tutor.rut || 'Sin RUT' : '—') + '</span></td>' +
            '<td><span class="cell-strong">' + esc(pet ? pet.name : 'Mascota') + '</span></td>' +
            '<td><span class="cell-strong">' + esc(debt.concept) + '</span><span class="cell-sub">' +
            (appointment ? 'Cita ' + esc(fmtDateShort(appointment.date)) + ' · ' + esc(String(appointment.time).slice(0, 5)) + ' · ' : '') +
            'Emitido ' + esc(fmtDateShort(debt.issued_at)) + '</span></td>' +
            '<td><span class="cell-strong">' + esc(fmtDateShort(debt.due_date)) + '</span><span class="cell-sub">' + esc(relShort(debt.due_date)) + '</span></td>' +
            '<td><span class="money">' + esc(money(debt.amount)) + '</span></td>' +
            '<td><span class="badge ' + debtStatus.cls + '">' + debtStatus.label + '</span></td>' +
            '<td class="actions-cell">' + (actions || '—') + '</td></tr>';
        }).join('');
      }
    }

    var history = document.getElementById('payHistoryBody');
    var count = document.getElementById('payHistoryCount');
    if (count) count.textContent = billingData.payments.length + ' pago' + (billingData.payments.length === 1 ? '' : 's');
    if (history) {
      var payments = billingData.payments.slice().sort(function (a, b) {
        return String(b.created_at).localeCompare(String(a.created_at));
      });
      if (!payments.length) {
        var historyTitle = billingData.loading ? 'Cargando historial…' : 'Aún no hay pagos';
        var historyText = billingData.loading ? 'Consultando transacciones.' : 'Las transacciones de Webpay Plus aparecerán aquí.';
        history.innerHTML = '<tr><td colspan="7"><div class="empty empty--table"><strong>' + historyTitle + '</strong>' + historyText + '</div></td></tr>';
      } else {
        var labels = {
          pending: ['Pendiente', 'badge--warn'],
          authorized: ['Autorizado', 'badge--ok'],
          rejected: ['Rechazado', 'badge--off'],
          canceled: ['Cancelado', 'badge--muted'],
          review: ['Revisión manual', 'badge--warn']
        };
        history.innerHTML = payments.map(function (payment) {
          var tutor = billingData.tutors.find(function (item) { return item.id === payment.tutor; });
          var status = labels[payment.status] || ['Desconocido', 'badge--muted'];
          var concepts = (payment.debt_ids || []).map(function (debtId) {
            var debt = billingData.debts.find(function (item) { return item.id === debtId; });
            return debt ? debt.concept : '';
          }).filter(Boolean).join(', ');
          return '<tr>' +
            '<td><span class="cell-strong">' + esc(fmtDateTime(payment.created_at)) + '</span><span class="cell-sub">' + (payment.simulated ? 'Simulado' : 'Transbank') + '</span></td>' +
            '<td><span class="cell-strong">' + esc(payment.buy_order) + '</span></td>' +
            '<td><span class="cell-strong">' + esc(tutor ? tutor.name : 'Tutor') + '</span></td>' +
            '<td><span class="money">' + esc(money(payment.amount)) + '</span></td>' +
            '<td><span class="cell-strong">' + esc(payment.authorization_code || '—') + '</span></td>' +
            '<td><span class="badge ' + status[1] + '">' + status[0] + '</span></td>' +
            '<td><span class="cell-sub">' + esc(concepts || '—') + '</span></td></tr>';
        }).join('');
      }
    }
  }

  function loadBillingData() {
    if (!billingRoleAllowed()) return Promise.resolve(false);
    if (billingData.loaded) return Promise.resolve(true);
    if (billingData.loading) return billingData.promise || Promise.resolve(false);
    billingData.loading = true;
    billingData.attempted = true;
    billingData.error = '';
    renderPayments();
    billingData.promise = Promise.all([
      apiGetAll('/api/debts/'),
      apiGetAll('/api/payments/'),
      apiGetAll('/api/tutors/'),
      apiGetAll('/api/pets/')
    ]).then(function (results) {
      billingData.debts = results[0];
      billingData.payments = results[1];
      billingData.tutors = results[2];
      billingData.pets = results[3];
      billingData.loaded = true;
    }).catch(function (error) {
      billingData.error = error.message || 'No se pudieron cargar los datos de cobros.';
    }).then(function () {
      billingData.loading = false;
      billingData.promise = null;
      renderPayments();
      return billingData.loaded;
    });
    return billingData.promise;
  }

  function openPaymentPortalDemo(presetRut) {
    state.captcha = makeCaptcha();
    var html = '<div class="pay-lookup">' +
      '<div class="pay-secure">' + icon('i-shield') + '<div><b>Portal de pago · Oneclick Mall Transbank (simulado)</b><span>Busca la deuda por RUT del tutor + anti-robot. Referencia: <b>' + esc(TBK.host) + '</b>. No se realizan cobros reales.</span></div></div>' +
      '<div class="field"><label class="field__label" for="payRut">RUT del tutor <span class="req">*</span></label><input class="field-input" id="payRut" type="text" inputmode="text" placeholder="12.345.678-5" value="' + esc(presetRut ? formatRut(presetRut) : '') + '" autocomplete="off" required></div>' +
      '<div class="field"><label class="field__label" for="payCaptchaInput">Verificación anti-robot <span class="req">*</span></label>' +
      '<div class="pay-captcha"><span class="pay-captcha__code" id="payCaptchaCode">' + esc(state.captcha) + '</span><button class="link" type="button" data-action="refresh-captcha">Generar otro código</button></div>' +
      '<input class="field-input" id="payCaptchaInput" type="text" maxlength="5" placeholder="Escribe el código de la izquierda" autocomplete="off" required></div>' +
      '<p class="pay-help">RUT tutor demo: <b>12.345.678-5</b> (Carolina Méndez, Milo, <b>$48.900</b>). También: 16.789.012-1, 14.567.890-0.<br>Auth Transbank integración (en el paso de pago): RUT <b>11.111.111-1</b> · clave <b>123</b>.</p>' +
      '<p class="pay-sim-note">' + icon('i-info') + ' Demo educativa. Simula flujo Oneclick Mall (inscripción/autorización) <b>sin llamadas HTTP reales</b> a Transbank. Credenciales/hosts mostrados solo como referencia de integración.</p>' +
      '</div>';
    openModal({
      title: 'Pagar una cuenta',
      subtitle: 'Acceso sin iniciar sesión · Demo de pago con RUT',
      width: 620,
      submitLabel: 'Buscar deuda',
      cancelLabel: 'Cerrar',
      html: html,
      onSubmit: function (form) {
        var rut = form.querySelector('#payRut').value.trim();
        var cap = form.querySelector('#payCaptchaInput').value.trim();
        if (!isValidRut(rut)) return 'RUT inválido. Revisa el formato y el dígito verificador (ej: 12.345.678-5).';
        if (String(cap).replace(/\s/g, '').toUpperCase() !== state.captcha) {
          refreshCaptchaUI();
          form.querySelector('#payCaptchaInput').value = '';
          return 'Código anti-robot incorrecto. Prueba con el código nuevo.';
        }
        var tutor = db.tutors.find(function (t) { return normalizeRut(t.rut) === normalizeRut(rut); });
        if (!tutor) return 'No encontramos un tutor con ese RUT. Usa uno de los RUT de demostración.';
        var pending = pendingDebtsFor(tutor.id);
        setTimeout(function () { openTutorDebts(tutor, pending); }, 30);
      }
    });
  }

  function openTutorDebts(tutor, pending) {
    var total = pending.reduce(function (sum, d) { return sum + Number(d.amount || 0); }, 0);
    var cards = pending.length ? pending.map(function (d) {
      var pet = getPet(d.petId);
      return '<article class="pay-debt">' +
        '<div class="pay-debt__head"><span class="pay-debt__pet">' + petAvatar(pet, 'pet--38') + '<span><b>' + esc(pet ? pet.name : 'Mascota') + '</b><small>' + esc(pet ? pet.recordNumber : '') + ' · ' + esc(d.concept) + '</small></span></span><span class="pay-debt__amount">' + esc(money(d.amount)) + '</span></div>' +
        '<div class="pay-debt__meta"><span>' + icon('i-cal') + ' Vence ' + esc(fmtDateShort(d.dueDate)) + ' · ' + esc(relShort(d.dueDate)) + '</span><span class="badge badge--warn">Pendiente</span></div>' +
        '<div class="pay-debt__actions"><button class="btn btn--outline btn--sm" type="button" data-action="debt-qr" data-id="' + esc(d.id) + '">' + icon('i-qr') + 'Ver QR</button><button class="btn btn--primary btn--sm" type="button" data-action="pay-debt" data-id="' + esc(d.id) + '">' + icon('i-card') + 'Pagar ' + esc(money(d.amount)) + '</button></div>' +
        '</article>';
    }).join('') : '<div class="empty"><strong>No hay deudas pendientes</strong>Este tutor está al día. Puedes revisar el historial desde la página Pagos.</div>';

    var html = '<div class="pay-tutor">' + icon('i-user') + '<div><b>' + esc(tutor.name) + '</b><span>' + esc(tutor.rut) + ' · ' + esc(tutor.email || '') + '</span></div></div>' +
      '<div class="pay-debts">' + cards + '</div>' +
      (pending.length > 1 ? '<div class="pay-total"><span>Total pendiente<small>' + pending.length + ' cuentas</small></span><b>' + esc(money(total)) + '</b><button class="btn btn--primary" type="button" data-action="pay-all" data-tutor="' + esc(tutor.id) + '">Pagar todo</button></div>' : '') +
      '<div class="pay-sim-note">' + icon('i-info') + ' Pago de demostración. El QR y la tarjeta son ficticios.</div>';
    openModal({
      title: 'Cuentas de ' + tutor.name,
      subtitle: 'Selecciona una mascota para pagar con Oneclick o mostrar su QR.',
      width: 660,
      hideCancel: true,
      hideSubmit: true,
      html: html + '<div class="pay-modal-close"><button class="btn btn--outline" type="button" data-close>Cerrar</button></div>'
    });
  }

  function openDebtModalDemo() {
    if (!db.pets.length) { showToast('Primero registra una mascota para generar una cuenta.', 'error'); return; }
    var petOptions = db.pets.map(function (p) {
      var t = getTutor(p.tutorId);
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + ' · ' + esc(t ? t.name : 'Sin tutor') + ' · ' + esc(p.recordNumber) + '</option>';
    }).join('');
    var html = '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label" for="debt-pet">Mascota <span class="req">*</span></label><div class="select"><select class="field-input" id="debt-pet">' + petOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="debt-amount">Monto <span class="req">*</span></label><input class="field-input" id="debt-amount" type="number" min="1" step="100" value="25000" required></div>' +
      '<div class="field" style="grid-column:1/-1"><label class="field__label" for="debt-concept">Concepto <span class="req">*</span></label><input class="field-input" id="debt-concept" type="text" placeholder="Ej: Consulta general + vacuna" value="Consulta general" required></div>' +
      '<div class="field" style="grid-column:1/-1"><label class="field__label" for="debt-due">Vencimiento <span class="req">*</span></label><input class="field-input" id="debt-due" type="date" value="' + esc(addDaysISO(todayISO(), 7)) + '" required></div>' +
      '</div>' +
      '<p class="pay-help">Se generará una deuda pendiente y un QR de demostración para esa mascota.</p>';
    openModal({
      title: 'Nueva cuenta por cobrar',
      subtitle: 'Genera una deuda y su QR de pago simulado.',
      width: 560,
      submitLabel: 'Crear cuenta',
      html: html,
      onSubmit: function (form) {
        var pet = getPet(form.querySelector('#debt-pet').value);
        if (!pet) return 'Selecciona una mascota.';
        var concept = form.querySelector('#debt-concept').value.trim();
        var amount = Number(form.querySelector('#debt-amount').value);
        var due = form.querySelector('#debt-due').value;
        if (!concept) return 'Escribe el concepto de la cuenta.';
        if (!amount || amount <= 0) return 'Ingresa un monto mayor a cero.';
        if (!due) return 'Selecciona una fecha de vencimiento.';
        var debt = {
          id: uid('debt-'),
          tutorId: pet.tutorId,
          petId: pet.id,
          concept: concept,
          amount: amount,
          issuedAt: todayISO(),
          dueDate: due,
          status: 'pendiente',
          paidAt: '',
          paymentId: ''
        };
        db.debts.unshift(debt);
        saveDB();
        renderPayments();
        showToast('Cuenta creada para ' + pet.name + ' por ' + money(amount) + '.');
        setTimeout(function () { openQrModal(debt.id); }, 30);
      }
    });
  }

  function openDebtModal(debtId, appointment) {
    if (!billingRoleAllowed()) {
      showToast('Tu cuenta no tiene permisos para administrar cobros.', 'error');
      return;
    }
    if (!billingData.loaded) {
      if (billingData.openingDebt) return;
      billingData.openingDebt = true;
      showToast('Cargando tutores y mascotas para el cobro.', 'info');
      loadBillingData().then(function (loaded) {
        billingData.openingDebt = false;
        if (!loaded) {
          showToast(billingData.error || 'No se pudieron cargar tutores y mascotas. Revisa la conexión con el backend e inténtalo otra vez.', 'error');
          return;
        }
        openDebtModal(debtId, appointment);
      });
      return;
    }
    var editing = debtId ? billingData.debts.find(function (item) { return item.id === debtId; }) : null;
    if (debtId && !editing) {
      showToast('La cuenta ya no está disponible.', 'error');
      return;
    }
    if (!billingData.tutors.length || !billingData.pets.length) {
      showToast('Primero registra un tutor y una mascota desde el sistema.', 'error');
      return;
    }

    var localPet = appointment ? getPet(appointment.petId) : null;
    var matchedTutor = localPet && billingData.tutors.find(function (tutor) {
      return tutor.id === localPet.tutorId;
    });
    var tutorId = editing
      ? editing.tutor
      : appointment
        ? (matchedTutor ? matchedTutor.id : '')
        : billingData.tutors[0].id;
    function tutorOptions() {
      return '<option value="">Selecciona un tutor</option>' + billingData.tutors.map(function (tutor) {
        return '<option value="' + esc(tutor.id) + '"' + (tutor.id === tutorId ? ' selected' : '') + '>' +
          esc(tutor.name) + (tutor.rut ? ' · ' + esc(tutor.rut) : '') + '</option>';
      }).join('');
    }
    function petOptions(selectedPetId) {
      var pets = billingData.pets.filter(function (pet) { return pet.tutor === tutorId; });
      return '<option value="">Selecciona una mascota</option>' + pets.map(function (pet) {
        return '<option value="' + esc(pet.id) + '"' + (pet.id === selectedPetId ? ' selected' : '') + '>' +
          esc(pet.name) + (pet.record_number ? ' · ' + esc(pet.record_number) : '') + '</option>';
      }).join('');
    }
    var matchedPet = appointment && matchedTutor && localPet
      ? billingData.pets.find(function (pet) {
        return pet.id === localPet.id && pet.tutor === matchedTutor.id;
      })
      : null;
    var defaultPet = editing
      ? editing.pet
      : appointment
        ? (matchedPet ? matchedPet.id : '')
        : (billingData.pets.find(function (pet) { return pet.tutor === tutorId; }) || {}).id;
    var appointmentConcept = appointment
      ? 'Cita veterinaria · ' + appointment.service + ' · ' +
        fmtDateShort(appointment.date) + ' ' + appointment.time +
        (localPet ? ' · ' + localPet.name : '')
      : '';
    var appointmentNote = appointment
      ? '<p class="pay-help">Cobro para la cita de ' +
        esc(localPet ? localPet.name : 'la mascota') + ' · ' +
        esc(appointment.service) + ' · ' + esc(fmtDateShort(appointment.date)) +
        ' a las ' + esc(appointment.time) +
        '. Se creará una cuenta pendiente para pagar por Webpay Plus. El monto lo defines tú.</p>'
      : '';
    var html = '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label" for="debt-tutor">Tutor <span class="req">*</span></label><div class="select"><select class="field-input" id="debt-tutor">' + tutorOptions() + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="debt-pet">Mascota <span class="req">*</span></label><div class="select"><select class="field-input" id="debt-pet">' + petOptions(defaultPet) + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="debt-amount">Monto (CLP) <span class="req">*</span></label><input class="field-input" id="debt-amount" type="number" min="1" step="1" value="' + esc(editing ? editing.amount : appointment ? '' : '25000') + '" required></div>' +
      '<div class="field"><label class="field__label" for="debt-issued">Fecha de emisión <span class="req">*</span></label><input class="field-input" id="debt-issued" type="date" value="' + esc(editing ? editing.issued_at : todayISO()) + '" required></div>' +
      '<div class="field" style="grid-column:1/-1"><label class="field__label" for="debt-concept">Concepto <span class="req">*</span></label><input class="field-input" id="debt-concept" type="text" maxlength="180" value="' + esc(editing ? editing.concept : appointmentConcept) + '" placeholder="Ej: Consulta veterinaria" required></div>' +
      '<div class="field" style="grid-column:1/-1"><label class="field__label" for="debt-due">Vencimiento <span class="req">*</span></label><input class="field-input" id="debt-due" type="date" value="' + esc(editing ? editing.due_date : addDaysISO(todayISO(), 7)) + '" required></div>' +
      '</div>' + appointmentNote + '<p class="pay-help">La cuenta quedará pendiente y podrá pagarse por el portal seguro de Webpay Plus.</p>';
    var modal = openModal({
      title: editing ? 'Editar cuenta por cobrar' : appointment ? 'Crear cobro para cita' : 'Nueva cuenta por cobrar',
      subtitle: appointment
        ? 'Confirma tutor, mascota y monto antes de generar el enlace de pago.'
        : 'Los datos se guardan en la base de datos de PetCare.',
      width: 620,
      submitLabel: editing ? 'Guardar cambios' : 'Crear cuenta',
      keepOpen: true,
      html: html,
      onSubmit: function (form) {
        var tutor = form.querySelector('#debt-tutor').value;
        var pet = form.querySelector('#debt-pet').value;
        var amount = Number(form.querySelector('#debt-amount').value);
        var issuedAt = form.querySelector('#debt-issued').value;
        var dueDate = form.querySelector('#debt-due').value;
        var concept = form.querySelector('#debt-concept').value.trim();
        if (!pet) return 'El tutor seleccionado no tiene mascotas registradas.';
        if (!concept) return 'Escribe el concepto de la cuenta.';
        if (!Number.isInteger(amount) || amount < 1) return 'Ingresa un monto entero en pesos chilenos mayor que cero.';
        if (!issuedAt || !dueDate) return 'Selecciona la fecha de emisión y vencimiento.';
        if (dueDate < issuedAt) return 'El vencimiento no puede ser anterior a la emisión.';
        var submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        submit.textContent = editing ? 'Guardando…' : 'Creando…';
        var payload = {
          tutor: tutor,
          pet: pet,
          concept: concept,
          amount: amount.toFixed(2),
          issued_at: issuedAt,
          due_date: dueDate
        };
        if (appointment && appointment.apiId) payload.appointment = appointment.apiId;
        apiRequest(editing ? '/api/debts/' + encodeURIComponent(editing.id) + '/' : '/api/debts/', {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function () {
          closeModal();
          billingData.loaded = false;
          billingData.attempted = false;
          showToast(editing ? 'Cuenta actualizada.' : appointment ? 'Cobro de cita creado y guardado.' : 'Cuenta creada y guardada.');
          loadBillingData();
          if (appointment && appointment.apiId) {
            appointmentData.loaded = false;
            loadAppointmentData(true).catch(function (error) {
              showToast(error.message || 'El cobro se guardó, pero no se pudo actualizar la cita.', 'error');
            });
          }
        }).catch(function (error) {
          var box = document.getElementById('modalError');
          if (box) {
            box.textContent = error.message || 'No se pudo guardar la cuenta.';
            box.hidden = false;
          }
          submit.disabled = false;
          submit.textContent = editing ? 'Guardar cambios' : 'Crear cuenta';
        });
      }
    });
    if (modal) {
      var tutorSelect = modal.form.querySelector('#debt-tutor');
      tutorSelect.addEventListener('change', function () {
        tutorId = tutorSelect.value;
        var petSelect = modal.form.querySelector('#debt-pet');
        petSelect.innerHTML = petOptions('');
      });
    }
  }

  function openPaymentPortal() {
    window.open('/pagar/', '_blank', 'noopener');
  }

  function openQrModal(id) {
    var d = getDebt(id);
    if (!d) return;
    var tutor = getTutor(d.tutorId);
    var pet = getPet(d.petId);
    var payload = 'PETCARE-SIM|' + (tutor ? normalizeRut(tutor.rut) : '') + '|' + (pet ? pet.name : '') + '|' + d.amount + '|' + d.id;
    var html = '<div class="qr-pay">' +
      '<div class="qr-pay__box">' + qrSvg(payload) + '<span class="qr-pay__brand">PetCare · Oneclick Mall</span><span class="qr-pay__hint">QR simulado · ' + esc(TBK.env) + '</span></div>' +
      '<div class="qr-pay__info">' +
      '<span class="badge badge--warn">Pago pendiente</span>' +
      '<h3>' + esc(pet ? pet.name : 'Mascota') + '</h3>' +
      '<p>' + esc(d.concept) + '</p>' +
      '<dl><div><dt>Tutor</dt><dd>' + esc(tutor ? tutor.name : '—') + '</dd></div><div><dt>RUT</dt><dd>' + esc(tutor ? tutor.rut : '—') + '</dd></div><div><dt>Vence</dt><dd>' + esc(fmtDateShort(d.dueDate)) + '</dd></div><div><dt>Comercio hijo</dt><dd>' + esc(TBK.childCode) + '</dd></div></dl>' +
      '<div class="qr-pay__amount">' + esc(money(d.amount)) + '</div>' +
      '<button class="btn btn--primary" type="button" data-action="pay-debt" data-id="' + esc(d.id) + '">' + icon('i-card') + 'Simular escaneo y pagar</button>' +
      '<p class="pay-sim-note">' + icon('i-info') + ' QR y flujo simulados. Referencia de integración: <b>' + esc(TBK.host) + '</b>. No se envían datos reales.</p>' +
      '</div></div>' +
      '<div class="pay-modal-close"><button class="btn btn--outline" type="button" data-close>Cerrar</button></div>';
    openModal({
      title: 'QR de pago · ' + (pet ? pet.name : 'Mascota'),
      subtitle: 'Oneclick Mall simulado · ' + TBK.env,
      width: 720,
      hideCancel: true,
      hideSubmit: true,
      html: html
    });
  }

  function payDebts(ids) {
    var debts = (ids || []).map(getDebt).filter(function (d) { return d && d.status === 'pendiente'; });
    if (!debts.length) { showToast('La cuenta ya está pagada.', 'info'); return; }
    var total = debts.reduce(function (sum, d) { return sum + Number(d.amount || 0); }, 0);
    var tutor = getTutor(debts[0].tutorId);
    var pets = debts.map(function (d) { var p = getPet(d.petId); return p ? p.name : 'Mascota'; });
    var summary = debts.map(function (d) {
      var p = getPet(d.petId);
      return '<li><span>' + esc(p ? p.name : 'Mascota') + ' · ' + esc(d.concept) + '</span><b>' + esc(money(d.amount)) + '</b></li>';
    }).join('');
    var html = '<div class="pay-checkout tbk-flow">' +
      '<div class="tbk-env"><span class="tbk-env__brand">Transbank <b>Webpay</b></span><span class="tbk-env__host">' + esc(TBK.host) + '</span><span class="badge badge--muted">' + esc(TBK.env) + '</span></div>' +
      '<div class="pay-checkout__amount"><span>Total a autorizar (Oneclick Mall)</span><b>' + esc(money(total)) + '</b><small>' + esc(tutor ? tutor.name : '') + ' · ' + esc(pets.join(' + ')) + ' · hijo ' + esc(TBK.childCode) + '</small></div>' +
      '<ul class="pay-checkout__list">' + summary + '</ul>' +
      '<div class="pay-card-option"><span class="pay-card-logo">VISA</span><div><b>VISA prueba ' + esc(TBK.testCard.number) + '</b><small>Tarjeta inscrita (simulada) · CVV ' + esc(TBK.testCard.cvv) + ' · genera transacción aprobada</small></div><span class="badge badge--ok">Inscrita</span></div>' +
      '<div class="tbk-auth"><p class="tbk-auth__title">' + icon('i-shield') + ' Autenticación Transbank (simulada)</p><p class="tbk-auth__sub">En integración, el formulario de autenticación usa RUT <b>' + esc(TBK.authTest.rut) + '</b> y clave <b>' + esc(TBK.authTest.password) + '</b>.</p>' +
      '<div class="grid grid--2"><div class="field"><label class="field__label" for="tbkRut">RUT <span class="req">*</span></label><input class="field-input" id="tbkRut" type="text" value="' + esc(TBK.authTest.rut) + '" placeholder="11.111.111-1" autocomplete="off"></div>' +
      '<div class="field"><label class="field__label" for="tbkPass">Clave <span class="req">*</span></label><input class="field-input" id="tbkPass" type="password" value="' + esc(TBK.authTest.password) + '" placeholder="123" autocomplete="off"></div></div></div>' +
      '<label class="pay-terms"><input id="payTerms" type="checkbox"> Acepto autorizar este pago simulado en ambiente de integración. No se moverá dinero real.</label>' +
      '<div class="pay-processing" id="payProcessing" hidden><span class="pay-spinner"></span><div><b>Autorizando en ' + esc(TBK.host) + ' (simulado)…</b><small>POST ' + esc(TBK.oneclickAuthorize) + ' · Tbk-Api-Key-Id ' + esc(TBK.parentCode) + '</small></div></div>' +
      '<p class="pay-sim-note">' + icon('i-info') + ' Demo educativa: simula el flujo Oneclick Mall. <b>No realiza llamadas HTTP reales</b> ni usa credenciales productivas.</p>' +
      '</div>';
    openModal({
      title: 'Pago Oneclick Mall · Transbank',
      subtitle: TBK.env + ' · ' + TBK.host.replace('https://', ''),
      width: 680,
      submitLabel: 'Autorizar ' + money(total),
      keepOpen: true,
      html: html,
      onSubmit: function (form) {
        var terms = form.querySelector('#payTerms');
        var tbkRut = form.querySelector('#tbkRut');
        var tbkPass = form.querySelector('#tbkPass');
        if (!tbkRut || normalizeRut(tbkRut.value) !== normalizeRut(TBK.authTest.rut)) return 'RUT de autenticación Transbank inválido. En integración usa ' + TBK.authTest.rut + '.';
        if (!tbkPass || tbkPass.value !== TBK.authTest.password) return 'Clave de autenticación inválida. En integración usa ' + TBK.authTest.password + '.';
        if (!terms || !terms.checked) return 'Debes aceptar la autorización simulada para continuar.';
        var btn = form.querySelector('.modal__foot button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Autorizando…'; }
        var processing = form.querySelector('#payProcessing');
        if (processing) processing.hidden = false;
        setTimeout(function () {
          var payment = completePayment(debts, { tbkRut: tbkRut.value });
          showReceipt(payment);
        }, 1400);
      }
    });
  }

  function completePayment(debts, meta) {
    var now = new Date();
    var buyOrder = 'PC-SIM-' + String(now.getTime()).slice(-10);
    var detailBuyOrder = 'DT-' + String(now.getTime()).slice(-8);
    var authCode = String(100000 + Math.floor(Math.random() * 899999));
    var payment = {
      id: uid('pay-'),
      buyOrder: buyOrder,
      detailBuyOrder: detailBuyOrder,
      amount: debts.reduce(function (sum, d) { return sum + Number(d.amount || 0); }, 0),
      debtIds: debts.map(function (d) { return d.id; }),
      tutorId: debts[0].tutorId,
      petId: debts[0].petId,
      concept: debts.length > 1 ? debts.length + ' cuentas' : debts[0].concept,
      authCode: authCode,
      cardType: TBK.testCard.type,
      cardNumber: TBK.testCard.last4,
      status: 'AUTHORIZED',
      responseCode: 0,
      paymentType: 'VN',
      installments: 0,
      createdAt: now.toISOString(),
      tbk: {
        env: TBK.env,
        host: TBK.host,
        endpoint: TBK.oneclickAuthorize,
        parentCode: TBK.parentCode,
        childCode: TBK.childCode,
        authRut: (meta && meta.tbkRut) || TBK.authTest.rut,
        testCard: TBK.testCard.number
      },
      simulated: true
    };
    db.payments.unshift(payment);
    debts.forEach(function (d) {
      d.status = 'pagada';
      d.paidAt = payment.createdAt;
      d.paymentId = payment.id;
    });
    saveDB();
    refreshAll();
    showToast('Pago autorizado en integración Transbank (simulado) por ' + money(payment.amount) + '.');
    return payment;
  }

  function showReceipt(payment) {
    var tutor = getTutor(payment.tutorId);
    var pet = getPet(payment.petId);
    var tbk = payment.tbk || TBK;
    var apiResponse = {
      _simulated: true,
      _note: 'Respuesta local de demostración. No proviene de Transbank.',
      environment: tbk.env || TBK.env,
      host: tbk.host || TBK.host,
      endpoint: tbk.endpoint || TBK.oneclickAuthorize,
      request_headers: {
        'Tbk-Api-Key-Id': tbk.parentCode || TBK.parentCode,
        'Tbk-Api-Key-Secret': '[OCULTO EN DEMO]',
        'Content-Type': 'application/json'
      },
      response: {
        buy_order: payment.buyOrder,
        card_detail: { card_number: payment.cardNumber },
        accounting_date: String(new Date(payment.createdAt).getMonth() + 1).padStart(2, '0') + String(new Date(payment.createdAt).getDate()).padStart(2, '0'),
        transaction_date: payment.createdAt,
        details: [{
          amount: payment.amount,
          status: payment.status,
          authorization_code: payment.authCode,
          payment_type_code: payment.paymentType,
          response_code: payment.responseCode,
          installments_number: payment.installments,
          commerce_code: tbk.childCode || TBK.childCode,
          buy_order: payment.detailBuyOrder
        }]
      }
    };
    var html = '<div class="receipt">' +
      '<div class="receipt__head"><span class="receipt__check">' + icon('i-check') + '</span><div><h3>Pago autorizado</h3><p>Oneclick Mall · ' + esc(tbk.env || TBK.env) + ' · <b>simulado</b>, sin cobro real.</p></div></div>' +
      '<div class="receipt__amount">' + esc(money(payment.amount)) + '<small>' + esc(pet ? pet.name : 'Mascota') + ' · ' + esc(payment.concept) + '</small></div>' +
      '<div class="receipt__grid">' +
      '<div><span>Orden de compra</span><b>' + esc(payment.buyOrder) + '</b></div>' +
      '<div><span>Autorización</span><b>' + esc(payment.authCode) + '</b></div>' +
      '<div><span>Tarjeta prueba</span><b>' + esc(payment.cardType) + ' •••• ' + esc(payment.cardNumber) + '</b></div>' +
      '<div><span>Fecha</span><b>' + esc(fmtDateTime(payment.createdAt)) + '</b></div>' +
      '<div><span>Comercio hijo</span><b>' + esc(tbk.childCode || TBK.childCode) + '</b></div>' +
      '<div><span>Estado</span><b><span class="badge badge--ok">AUTHORIZED · 0</span></b></div>' +
      '</div>' +
      '<details class="receipt__json" open><summary>Respuesta simulada tipo API Transbank Oneclick</summary><pre>' + esc(JSON.stringify(apiResponse, null, 2)) + '</pre></details>' +
      '<div class="pay-modal-close"><button class="btn btn--primary" type="button" data-close>Entendido</button></div>' +
      '</div>';
    openModal({
      title: 'Comprobante de pago',
      subtitle: (tbk.host || TBK.host).replace('https://', '') + ' · simulado',
      width: 720,
      hideCancel: true,
      hideSubmit: true,
      html: html
    });
  }

  function openReceiptByDebt(id, paymentId) {
    var payment = paymentId ? db.payments.find(function (p) { return p.id === paymentId; }) : null;
    if (!payment) {
      var debt = getDebt(id);
      payment = debt && debt.paymentId ? db.payments.find(function (p) { return p.id === debt.paymentId; }) : paymentForDebt(id);
    }
    if (!payment) { showToast('No encontramos un comprobante para esa cuenta.', 'error'); return; }
    showReceipt(payment);
  }

  /* ============================================================
     MODALES Y AVISOS
     ============================================================ */
  function closeModal() {
    var root = document.getElementById('modalRoot');
    if (!root) return;
    root.hidden = true;
    root.innerHTML = '';
  }
  function openModal(opts) {
    var root = document.getElementById('modalRoot');
    if (!root) return null;
    root.hidden = false;
    var foot = '';
    if (!opts.hideCancel) foot += '<button class="btn btn--outline" type="button" data-close>' + esc(opts.cancelLabel || 'Cancelar') + '</button>';
    if (!opts.hideSubmit) foot += '<button class="btn ' + (opts.danger ? 'btn--danger' : 'btn--primary') + '" type="submit">' + esc(opts.submitLabel || 'Guardar') + '</button>';
    root.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' +
      '<div class="modal__backdrop" data-close></div>' +
      '<div class="modal__card" style="max-width:' + (opts.width || 560) + 'px">' +
      '<div class="modal__head"><div><h2 class="modal__title" id="modalTitle">' + (opts.title || '') + '</h2>' + (opts.subtitle ? '<p class="modal__sub">' + opts.subtitle + '</p>' : '') + '</div><button class="modal__close" type="button" data-close aria-label="Cerrar">' + icon('i-x') + '</button></div>' +
      '<form class="modal__form" novalidate><div class="modal__body">' + (opts.html || '') + '</div><p class="modal__error" id="modalError" role="alert" hidden></p><div class="modal__foot">' + foot + '</div></form>' +
      '</div></div>';
    root.onclick = function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    };
    var form = root.querySelector('form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var error = opts.onSubmit ? opts.onSubmit(form) : '';
      if (typeof error === 'string' && error) {
        var box = document.getElementById('modalError');
        if (box) { box.textContent = error; box.hidden = false; }
        return;
      }
      if (!opts.keepOpen) closeModal();
    });
    var first = form.querySelector('input:not([type="hidden"]), select, textarea');
    if (first) first.focus();
    return { form: form, close: closeModal };
  }
  function confirmDialog(opts) {
    return openModal({
      title: opts.title || 'Confirmar acción',
      subtitle: opts.subtitle || '',
      html: '<p class="modal__text">' + opts.text + '</p>',
      submitLabel: opts.confirmLabel || 'Eliminar',
      cancelLabel: 'Cancelar',
      danger: opts.danger !== false,
      width: 430,
      onSubmit: function () { if (opts.onConfirm) opts.onConfirm(); }
    });
  }
  function showToast(message, type) {
    var root = document.getElementById('toastRoot');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast--' + type : ' toast--ok');
    var iconId = type === 'error' ? 'i-x' : type === 'info' ? 'i-bell' : 'i-check';
    el.innerHTML = icon(iconId) + '<span></span>';
    el.querySelector('span').textContent = message;
    root.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .2s';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }, 3400);
  }

  /* ============================================================
     MODAL DE CITA
     ============================================================ */
  function timeOptionsHTML(iso, vetId, selected, ignoreId) {
    var slots = baseSlots(iso);
    if (!slots.length) return '<option value="">Sin cupos</option>';
    var html = '';
    slots.forEach(function (t) {
      var busy = !slotHasAnyVet(iso, t, vetId || 'all', ignoreId);
      var sel = t === selected;
      html += '<option value="' + esc(t) + '"' + (sel ? ' selected' : '') + (busy && !sel ? ' disabled' : '') + '>' + esc(t) + (busy ? ' · ocupado' : '') + '</option>';
    });
    return html;
  }
  function firstFreeTime(iso, vetId) {
    var slots = baseSlots(iso);
    for (var i = 0; i < slots.length; i++) {
      if (slotHasAnyVet(iso, slots[i], vetId || 'all')) return slots[i];
    }
    return '';
  }
  function openAppointmentModal(options) {
    options = options || {};
    var editing = options.id ? db.appointments.find(function (a) { return a.id === options.id; }) : null;
    if (options.id && !editing) { showToast('La cita ya no existe.', 'error'); return; }
    var legacy = editing && !editing.apiId;
    var pets = legacy ? db.pets : appointmentData.pets;
    var vets = legacy
      ? db.users.filter(function (user) { return user.role === VET_ROLE; })
      : appointmentData.veterinarians;
    if (!legacy && options.petId && !pets.some(function (pet) { return pet.id === options.petId; })) {
      showToast('Esa mascota aún no está registrada en el backend. Regístrala antes de agendar.', 'error');
      return;
    }
    if (!pets.length) {
      showToast(legacy ? 'Primero registra una mascota para poder agendar.' : 'Registra una mascota en el sistema antes de agendar.', 'error');
      return;
    }
    if (!vets.length) { showToast('No hay profesionales disponibles.', 'error'); return; }

    var dateVal = options.date || (editing ? editing.date : state.selectedDay) || todayISO();
    var defaultVet = legacy
      ? db.users.find(function (user) {
        return user.role === VET_ROLE && user.status === 'activo';
      })
      : vets[0];
    var petVal = options.petId && pets.some(function (pet) { return pet.id === options.petId; })
      ? options.petId
      : (editing ? editing.petId : '') ||
        (legacy && getPet(state.fichaPetId) ? state.fichaPetId : '') || pets[0].id;
    var vetVal = options.vetId && vets.some(function (vet) { return vet.id === options.vetId; })
      ? options.vetId
      : (editing ? editing.vetId : '') || (defaultVet ? defaultVet.id : vets[0].id);
    var timeVal = options.time || (editing ? editing.time : '') || firstFreeTime(dateVal, vetVal);
    var serviceVal = options.service || (editing ? editing.service : 'Consulta general');
    var statusVal = editing ? editing.status : 'pendiente';

    var petOptions = pets.map(function (p) {
      var t = getTutor(p.tutorId);
      return '<option value="' + esc(p.id) + '"' + (p.id === petVal ? ' selected' : '') + '>' + esc(p.name) + ' · ' + esc(t ? t.name : 'Sin tutor') + ' · ' + esc(p.recordNumber) + '</option>';
    }).join('');
    var vetOptions = vets.map(function (v) {
      return '<option value="' + esc(v.id) + '"' + (v.id === vetVal ? ' selected' : '') + '>' + esc(v.name) + ' · ' + esc(v.specialty || 'Medicina general') + (v.status !== 'activo' ? ' (inactivo)' : '') + '</option>';
    }).join('');
    var serviceOptions = SERVICES.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === serviceVal ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('');
    var statusOptions = Object.keys(APPT_STATUS).map(function (k) {
      return '<option value="' + k + '"' + (k === statusVal ? ' selected' : '') + '>' + APPT_STATUS[k].label + '</option>';
    }).join('');

    var html = '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label" for="ap-pet">Mascota <span class="req">*</span></label><div class="select"><select class="field-input" id="ap-pet">' + petOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="ap-service">Servicio <span class="req">*</span></label><div class="select"><select class="field-input" id="ap-service">' + serviceOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="ap-vet">Profesional <span class="req">*</span></label><div class="select"><select class="field-input" id="ap-vet">' + vetOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="ap-date">Fecha <span class="req">*</span></label><input class="field-input" id="ap-date" type="date" value="' + esc(dateVal) + '" required></div>' +
      '<div class="field"><label class="field__label" for="ap-time">Hora <span class="req">*</span></label><div class="select"><select class="field-input" id="ap-time">' + timeOptionsHTML(dateVal, vetVal, timeVal, editing ? editing.id : '') + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="ap-status">Estado</label><div class="select"><select class="field-input" id="ap-status">' + statusOptions + '</select>' + icon('i-down') + '</div></div>' +
      '</div>' +
      '<div class="field" style="margin-top:18px"><label class="field__label" for="ap-notes">Notas</label><textarea class="field-input" id="ap-notes" rows="3" style="height:auto;padding:10px 12px;resize:vertical" placeholder="Indicaciones, motivo de consulta o comentarios">' + esc(editing ? editing.notes : '') + '</textarea></div>';

    var m = openModal({
      title: editing ? 'Editar cita' : 'Nueva cita',
      subtitle: editing ? 'Actualiza los datos de la atención.' : 'Reserva un cupo en la agenda de la clínica.',
      html: html,
      submitLabel: editing ? 'Guardar cambios' : 'Crear cita',
      width: 620,
      keepOpen: !legacy,
      onSubmit: function (form) {
        var petId = form.querySelector('#ap-pet').value;
        var service = form.querySelector('#ap-service').value;
        var vetId = form.querySelector('#ap-vet').value;
        var date = form.querySelector('#ap-date').value;
        var time = form.querySelector('#ap-time').value;
        var status = form.querySelector('#ap-status').value;
        var notes = form.querySelector('#ap-notes').value.trim();
        if (!petId) return 'Selecciona una mascota.';
        if (!service) return 'Selecciona un servicio.';
        if (!vetId) return 'Selecciona un profesional.';
        if (!date) return 'Selecciona una fecha.';
        if (!time) return 'Selecciona un horario disponible.';
        var clash = db.appointments.find(function (a) {
          return a.id !== (editing ? editing.id : '') && a.date === date && a.time === time && a.vetId === vetId && a.status !== 'cancelada';
        });
        if (clash) return 'Ese horario ya está ocupado por ' + petName(clash.petId) + '. Elige otro cupo.';
        if (!legacy) {
          var submit = form.querySelector('button[type="submit"]');
          submit.disabled = true;
          submit.textContent = editing ? 'Guardando…' : 'Creando…';
          var payload = {
            pet: petId,
            veterinarian: vetId,
            service: service,
            date: date,
            time: time,
            status: status,
            notes: notes
          };
          apiRequest(editing ? '/api/appointments/' + encodeURIComponent(editing.apiId) + '/' : '/api/appointments/', {
            method: editing ? 'PATCH' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function () {
            state.selectedDay = date;
            var selected = parseISO(date);
            state.calDate = new Date(selected.getFullYear(), selected.getMonth(), 1);
            return loadAppointmentData(true);
          }).then(function () {
            closeModal();
            showToast(editing ? 'Cita actualizada y guardada.' : 'Cita creada y guardada en el sistema.');
          }).catch(function (error) {
            var box = document.getElementById('modalError');
            if (box) {
              box.textContent = error.message || 'No se pudo guardar la cita.';
              box.hidden = false;
            }
            submit.disabled = false;
            submit.textContent = editing ? 'Guardar cambios' : 'Crear cita';
          });
          return;
        }
        if (editing) {
          editing.petId = petId;
          editing.service = service;
          editing.vetId = vetId;
          editing.date = date;
          editing.time = time;
          editing.status = status;
          editing.notes = notes;
        } else {
          db.appointments.push({ id: uid('apt-'), petId: petId, service: service, vetId: vetId, date: date, time: time, status: status, notes: notes, createdAt: todayISO() });
        }
        saveDB();
        state.selectedDay = date;
        state.calDate = new Date(parseISO(date).getFullYear(), parseISO(date).getMonth(), 1);
        showToast(editing ? 'Cita actualizada.' : 'Cita creada correctamente.');
        refreshAll();
      }
    });
    if (!m) return;
    var form = m.form;
    var dateEl = form.querySelector('#ap-date');
    var vetEl = form.querySelector('#ap-vet');
    var timeEl = form.querySelector('#ap-time');
    function refreshTimes() {
      var current = timeEl.value;
      var nextDate = dateEl.value || todayISO();
      var nextVet = vetEl.value;
      var keepTime = (editing && nextDate === editing.date && nextVet === editing.vetId) ? editing.time : current;
      timeEl.innerHTML = timeOptionsHTML(nextDate, nextVet, keepTime, editing ? editing.id : '');
      var valid = Array.prototype.slice.call(timeEl.options).filter(function (o) { return !o.disabled && o.value; });
      var keep = valid.find(function (o) { return o.value === keepTime; });
      timeEl.value = keep ? keep.value : (valid[0] ? valid[0].value : '');
    }
    dateEl.addEventListener('change', refreshTimes);
    vetEl.addEventListener('change', refreshTimes);
    refreshTimes();
  }

  /* ============================================================
     MODALES DE FICHA, MASCOTA, RECORDATORIO Y USUARIO
     ============================================================ */
  function openRecordModal(options) {
    options = options || {};
    var editing = options.id ? getRecord(options.id) : null;
    var pet = getPet(options.petId || (editing ? editing.petId : state.fichaPetId));
    if (!pet) { showToast('Selecciona una mascota primero.', 'error'); return; }
    var type = options.type || (editing ? editing.type : state.fichaTab) || 'diagnostico';
    var vets = getVets();
    var typeOptions = Object.keys(RECORD_TYPES).map(function (k) {
      return '<option value="' + k + '"' + (k === type ? ' selected' : '') + '>' + RECORD_TYPES[k].one + '</option>';
    }).join('');
    var vetOptions = vets.map(function (v) {
      return '<option value="' + esc(v.id) + '"' + (editing && editing.vetId === v.id ? ' selected' : '') + '>' + esc(v.name) + '</option>';
    }).join('');
    var statusOptions = Object.keys(RECORD_STATUS).map(function (k) {
      return '<option value="' + k + '"' + (editing && editing.status === k ? ' selected' : '') + '>' + RECORD_STATUS[k].label + '</option>';
    }).join('');
    var html = '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label" for="rc-type">Tipo <span class="req">*</span></label><div class="select"><select class="field-input" id="rc-type">' + typeOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="rc-date">Fecha <span class="req">*</span></label><input class="field-input" id="rc-date" type="date" value="' + esc(editing ? editing.date : todayISO()) + '" required></div>' +
      '</div>' +
      '<div class="field" style="margin-top:18px"><label class="field__label" for="rc-title">Título <span class="req">*</span></label><input class="field-input" id="rc-title" type="text" value="' + esc(editing ? editing.title : '') + '" placeholder="Ej: Dermatitis alérgica estacional" required></div>' +
      '<div class="grid grid--2" style="margin-top:18px">' +
      '<div class="field"><label class="field__label" for="rc-vet">Profesional</label><div class="select"><select class="field-input" id="rc-vet">' + vetOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="rc-status">Estado</label><div class="select"><select class="field-input" id="rc-status">' + statusOptions + '</select>' + icon('i-down') + '</div></div>' +
      '</div>' +
      '<div class="field" style="margin-top:18px"><label class="field__label" for="rc-desc">Descripción</label><textarea class="field-input" id="rc-desc" rows="4" style="height:auto;padding:10px 12px;resize:vertical" placeholder="Observaciones, indicaciones o resultados">' + esc(editing ? editing.desc : '') + '</textarea></div>';

    openModal({
      title: editing ? 'Editar registro clínico' : 'Nuevo registro clínico',
      subtitle: esc(pet.name) + ' · ' + esc(pet.recordNumber),
      html: html,
      submitLabel: editing ? 'Guardar cambios' : 'Agregar registro',
      width: 620,
      onSubmit: function (form) {
        var typeVal = form.querySelector('#rc-type').value;
        var title = form.querySelector('#rc-title').value.trim();
        var date = form.querySelector('#rc-date').value;
        var vetId = form.querySelector('#rc-vet').value;
        var status = form.querySelector('#rc-status').value;
        var desc = form.querySelector('#rc-desc').value.trim();
        if (!title) return 'Escribe un título para el registro.';
        if (!date) return 'Selecciona una fecha.';
        if (editing) {
          editing.type = typeVal;
          editing.title = title;
          editing.date = date;
          editing.vetId = vetId;
          editing.status = status;
          editing.desc = desc;
        } else {
          db.records.push({ id: uid('rec-'), petId: pet.id, type: typeVal, title: title, desc: desc, date: date, vetId: vetId, status: status });
        }
        saveDB();
        state.fichaPetId = pet.id;
        state.fichaTab = typeVal;
        showToast(editing ? 'Registro actualizado.' : 'Registro agregado a la ficha.');
        refreshAll();
      }
    });
  }

  function viewRecord(id) {
    var r = getRecord(id);
    if (!r) return;
    var type = RECORD_TYPES[r.type] || RECORD_TYPES.diagnostico;
    var st = RECORD_STATUS[r.status] || RECORD_STATUS.finalizado;
    openModal({
      title: esc(r.title),
      subtitle: esc(type.one) + ' · ' + esc(fmtDateShort(r.date)),
      html: '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px"><span class="badge ' + st.cls + '">' + st.label + '</span><span class="cell-sub" style="font-size:var(--fs-10)">' + esc(petName(r.petId)) + ' · ' + esc(vetName(r.vetId)) + '</span></div><p class="modal__text">' + esc(r.desc || 'Sin observaciones adicionales.') + '</p>',
      submitLabel: 'Cerrar',
      hideCancel: true,
      width: 500,
      onSubmit: function () {}
    });
  }

  function openPetModal(id) {
    var pet = getPet(id);
    if (!pet) return;
    var tutor = getTutor(pet.tutorId) || {};
    var speciesOptions = ['Perro', 'Gato', 'Otro'].map(function (s) {
      return '<option value="' + s + '"' + (s === pet.species ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
    var sexOptions = ['Macho', 'Hembra'].map(function (s) {
      return '<option value="' + s + '"' + (s === pet.sex ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
    var reproOptions = ['No informado', 'Esterilizado', 'Entero'].map(function (s) {
      return '<option value="' + s + '"' + (s === pet.reproductive ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
    var html = '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label" for="pe-name">Nombre <span class="req">*</span></label><input class="field-input" id="pe-name" type="text" value="' + esc(pet.name) + '" required></div>' +
      '<div class="field"><label class="field__label" for="pe-species">Especie <span class="req">*</span></label><div class="select"><select class="field-input" id="pe-species">' + speciesOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="pe-breed">Raza</label><input class="field-input" id="pe-breed" type="text" value="' + esc(pet.breed || '') + '"></div>' +
      '<div class="field"><label class="field__label" for="pe-age">Edad</label><input class="field-input" id="pe-age" type="number" min="0" value="' + esc(pet.age != null ? pet.age : '') + '"></div>' +
      '<div class="field"><label class="field__label" for="pe-sex">Sexo</label><div class="select"><select class="field-input" id="pe-sex">' + sexOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="pe-repro">Estado reproductivo</label><div class="select"><select class="field-input" id="pe-repro">' + reproOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="pe-weight">Peso</label><input class="field-input" id="pe-weight" type="text" value="' + esc(pet.weight || '') + '" placeholder="Ej: 28,4 kg"></div>' +
      '<div class="field"><label class="field__label" for="pe-chip">Microchip</label><input class="field-input" id="pe-chip" type="text" value="' + esc(pet.microchip || '') + '"></div>' +
      '</div><div class="grid grid--2" style="margin-top:18px">' +
      '<div class="field"><label class="field__label" for="tu-name">Tutor <span class="req">*</span></label><input class="field-input" id="tu-name" type="text" value="' + esc(tutor.name || '') + '" required></div>' +
      '<div class="field"><label class="field__label" for="tu-mail">Correo del tutor <span class="req">*</span></label><input class="field-input" id="tu-mail" type="email" value="' + esc(tutor.email || '') + '" required></div>' +
      '<div class="field"><label class="field__label" for="tu-rut">RUT</label><input class="field-input" id="tu-rut" type="text" value="' + esc(tutor.rut || '') + '"></div>' +
      '<div class="field"><label class="field__label" for="tu-phone">Teléfono</label><input class="field-input" id="tu-phone" type="tel" value="' + esc(tutor.phone || '') + '"></div>' +
      '</div>';
    openModal({
      title: 'Editar datos de la mascota',
      subtitle: pet.recordNumber,
      html: html,
      submitLabel: 'Guardar cambios',
      width: 660,
      onSubmit: function (form) {
        var name = form.querySelector('#pe-name').value.trim();
        var mail = form.querySelector('#tu-mail').value.trim();
        if (!name) return 'El nombre de la mascota es obligatorio.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return 'Ingresa un correo válido para el tutor.';
        pet.name = name;
        pet.species = form.querySelector('#pe-species').value;
        pet.breed = form.querySelector('#pe-breed').value.trim();
        pet.age = form.querySelector('#pe-age').value;
        pet.sex = form.querySelector('#pe-sex').value;
        pet.reproductive = form.querySelector('#pe-repro').value;
        pet.weight = form.querySelector('#pe-weight').value.trim();
        pet.microchip = form.querySelector('#pe-chip').value.trim();
        if (tutor.id) {
          tutor.name = form.querySelector('#tu-name').value.trim();
          tutor.email = mail;
          tutor.rut = form.querySelector('#tu-rut').value.trim();
          tutor.phone = form.querySelector('#tu-phone').value.trim();
        }
        saveDB();
        showToast('Datos de la mascota actualizados.');
        refreshAll();
      }
    });
  }

  function openReminderModal(options) {
    options = options || {};
    var editing = options.id ? getReminder(options.id) : null;
    if (!db.pets.length) { showToast('Registra una mascota primero.', 'error'); return; }
    var petVal = (editing ? editing.petId : options.petId) || db.pets[0].id;
    var petOptions = db.pets.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === petVal ? ' selected' : '') + '>' + esc(p.name) + ' · ' + esc(tutorName(p.tutorId)) + '</option>';
    }).join('');
    var statusOptions = Object.keys(REM_STATUS).map(function (k) {
      return '<option value="' + k + '"' + (editing && editing.status === k ? ' selected' : '') + '>' + REM_STATUS[k].label + '</option>';
    }).join('');
    var html = '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label" for="rm-pet">Mascota <span class="req">*</span></label><div class="select"><select class="field-input" id="rm-pet">' + petOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="rm-date">Fecha <span class="req">*</span></label><input class="field-input" id="rm-date" type="date" value="' + esc(editing ? editing.date : addDaysISO(todayISO(), 7)) + '" required></div>' +
      '</div>' +
      '<div class="field" style="margin-top:18px"><label class="field__label" for="rm-title">Recordatorio <span class="req">*</span></label><input class="field-input" id="rm-title" type="text" value="' + esc(editing ? editing.title : '') + '" placeholder="Ej: Vacuna antirrábica" required></div>' +
      '<div class="field" style="margin-top:18px"><label class="field__label" for="rm-status">Estado de envío</label><div class="select"><select class="field-input" id="rm-status">' + statusOptions + '</select>' + icon('i-down') + '</div></div>';
    openModal({
      title: editing ? 'Editar recordatorio' : 'Nuevo recordatorio',
      subtitle: 'Programa un aviso para el tutor.',
      html: html,
      submitLabel: editing ? 'Guardar cambios' : 'Crear recordatorio',
      width: 560,
      onSubmit: function (form) {
        var petId = form.querySelector('#rm-pet').value;
        var date = form.querySelector('#rm-date').value;
        var title = form.querySelector('#rm-title').value.trim();
        var status = form.querySelector('#rm-status').value;
        if (!title) return 'Escribe el motivo del recordatorio.';
        if (!date) return 'Selecciona una fecha.';
        if (editing) {
          editing.petId = petId;
          editing.date = date;
          editing.title = title;
          editing.status = status;
        } else {
          db.reminders.push({ id: uid('rem-'), petId: petId, title: title, date: date, status: status, createdAt: todayISO() });
        }
        saveDB();
        showToast(editing ? 'Recordatorio actualizado.' : 'Recordatorio creado.');
        refreshAll();
      }
    });
  }

  function openUserModal(id, presetRole) {
    var user = id ? getUser(id) : null;
    var role = presetRole || (user ? user.role : 'Recepción');
    var roleOptions = ROLES.map(function (r) {
      return '<option value="' + esc(r) + '"' + (r === role ? ' selected' : '') + '>' + r + '</option>';
    }).join('');
    var statusOptions = ['activo', 'inactivo'].map(function (s) {
      return '<option value="' + s + '"' + ((user ? user.status : 'activo') === s ? ' selected' : '') + '>' + (s === 'activo' ? 'Activo' : 'Inactivo') + '</option>';
    }).join('');
    var html = '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label" for="us-name">Nombre completo <span class="req">*</span></label><input class="field-input" id="us-name" type="text" value="' + esc(user ? user.name : '') + '" placeholder="Ej: Carolina Méndez" required></div>' +
      '<div class="field"><label class="field__label" for="us-mail">Correo <span class="req">*</span></label><input class="field-input" id="us-mail" type="email" value="' + esc(user ? user.email : '') + '" placeholder="correo@petcare.cl" required></div>' +
      '<div class="field"><label class="field__label" for="us-role">Rol <span class="req">*</span></label><div class="select"><select class="field-input" id="us-role">' + roleOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field"><label class="field__label" for="us-status">Estado</label><div class="select"><select class="field-input" id="us-status">' + statusOptions + '</select>' + icon('i-down') + '</div></div>' +
      '<div class="field" id="us-specialty-wrap"' + (role === VET_ROLE ? '' : ' hidden') + '><label class="field__label" for="us-specialty">Especialidad</label><input class="field-input" id="us-specialty" type="text" value="' + esc(user ? user.specialty || '' : '') + '" placeholder="Ej: Medicina general"></div>' +
      '<div class="field"><label class="field__label" for="us-pass">Contraseña' + (user ? '' : ' <span class="req">*</span>') + '</label><input class="field-input" id="us-pass" type="password" minlength="6" placeholder="' + (user ? 'Dejar en blanco para mantener' : 'Mínimo 6 caracteres') + '"></div>' +
      '</div>';
    var m = openModal({
      title: user ? 'Editar usuario' : 'Agregar usuario',
      subtitle: user ? esc(user.email) : 'Crea una cuenta de acceso al sistema.',
      html: html,
      submitLabel: user ? 'Guardar cambios' : 'Crear usuario',
      width: 640,
      onSubmit: function (form) {
        var name = form.querySelector('#us-name').value.trim();
        var mail = form.querySelector('#us-mail').value.trim().toLowerCase();
        var roleVal = form.querySelector('#us-role').value;
        var statusVal = form.querySelector('#us-status').value;
        var specialty = form.querySelector('#us-specialty').value.trim();
        var pass = form.querySelector('#us-pass').value;
        if (!name) return 'El nombre es obligatorio.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return 'Ingresa un correo válido.';
        var duplicate = db.users.find(function (u) { return u.email.toLowerCase() === mail && (!user || u.id !== user.id); });
        if (duplicate) return 'Ya existe un usuario con ese correo.';
        if (pass && pass.length < 6) return 'La contraseña debe tener al menos 6 caracteres.';
        if (!user && !pass) return 'Define una contraseña para el nuevo usuario.';
        if (user && user.id === (currentUser ? currentUser.id : '') && statusVal === 'inactivo') return 'No puedes desactivar tu propia cuenta.';
        if (user) {
          user.name = name;
          user.email = mail;
          user.role = roleVal;
          user.status = statusVal;
          user.specialty = roleVal === VET_ROLE ? specialty : '';
          if (pass) user.password = pass;
        } else {
          db.users.push({ id: uid('usr-'), name: name, email: mail, role: roleVal, status: statusVal, specialty: roleVal === VET_ROLE ? specialty : '', password: pass });
        }
        saveDB();
        updateUserUI();
        showToast(user ? 'Usuario actualizado.' : 'Usuario creado.');
        refreshAll();
      }
    });
    if (!m) return;
    var roleEl = m.form.querySelector('#us-role');
    var wrap = m.form.querySelector('#us-specialty-wrap');
    roleEl.addEventListener('change', function () {
      wrap.hidden = roleEl.value !== VET_ROLE;
    });
  }

  /* ============================================================
     SESIÓN, RUTAS Y ACTUALIZACIÓN GENERAL
     ============================================================ */
  function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }
  function setSession(tokens, user) {
    session = {
      access: tokens.access,
      refresh: tokens.refresh,
      apiUser: user
    };
    store.set(SESSION_KEY, JSON.stringify(session));
  }
  function clearSession() {
    session = null;
    store.remove(SESSION_KEY);
    billingData.loaded = false;
    billingData.loading = false;
    billingData.attempted = false;
    billingData.error = '';
    billingData.debts = [];
    billingData.payments = [];
    billingData.tutors = [];
    billingData.pets = [];
  }
  function updateUserUI() {
    if (!currentUser) return;
    var name = currentUser.name;
    var role = currentUser.role;
    if (currentUser.role === VET_ROLE && currentUser.specialty) role += ' · ' + currentUser.specialty;
    var av = document.getElementById('topAvatar');
    var nm = document.getElementById('topUserName');
    var rl = document.getElementById('topUserRole');
    var mn = document.getElementById('menuUserName');
    var mm = document.getElementById('menuUserMail');
    var clinic = document.getElementById('clinicName');
    var adminNav = document.querySelector('.nav__link[data-route="administracion"]');
    if (adminNav) adminNav.hidden = currentUser.role !== 'Administrador/a';
    if (av) av.textContent = initials(name);
    if (nm) nm.textContent = name;
    if (rl) rl.textContent = role;
    if (mn) mn.textContent = name;
    if (mm) mm.textContent = currentUser.email;
    if (clinic) clinic.textContent = db.clinic || 'PetCare Providencia';
  }
  function updateGreeting() {
    var titleEl = document.getElementById('pageTitle');
    var subEl = document.getElementById('pageSub');
    if (!titleEl || !subEl || !currentUser) return;
    var hour = new Date().getHours();
    var greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    titleEl.textContent = greet + ', ' + firstName(currentUser.name);
    subEl.textContent = 'Aquí tienes el resumen de hoy en PetCare.';
  }
  function closeUserMenu() {
    var menu = document.getElementById('userMenu');
    var btn = document.getElementById('userBtn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  function toggleUserMenu() {
    var menu = document.getElementById('userMenu');
    var btn = document.getElementById('userBtn');
    if (!menu || !btn) return;
    var open = menu.hidden;
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }
  function setMenu(open) {
    var app = document.getElementById('app');
    var menuBtn = document.getElementById('menuBtn');
    if (!app || !menuBtn) return;
    app.classList.toggle('app--menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  }
  function refreshAll() {
    updateUserUI();
    updateBell();
    renderDashboard();
    renderAppointments();
    renderReminders();
    renderFicha();
    renderAvailability();
    renderPayments();
    if (state.route === 'administracion') renderAdmin();
  }
  function route() {
    if (!currentUser) return;
    var id = (location.hash || '#inicio').replace('#', '') || 'inicio';
    if (id === 'administracion' && currentUser.role !== 'Administrador/a') {
      location.hash = '#inicio';
      return;
    }
    var target = document.getElementById(id);
    if (!target || !target.classList.contains('page')) {
      if (id !== 'inicio') { location.hash = '#inicio'; return; }
      return;
    }
    state.route = id;
    document.querySelectorAll('.page').forEach(function (p) { p.hidden = p !== target; });
    document.querySelectorAll('.nav__link[data-route]').forEach(function (l) {
      if (l.dataset.route === id) l.setAttribute('aria-current', 'page');
      else l.removeAttribute('aria-current');
    });
    var titleEl = document.getElementById('pageTitle');
    var subEl = document.getElementById('pageSub');
    if (id === 'inicio') {
      updateGreeting();
    } else {
      if (titleEl) titleEl.textContent = target.dataset.title || 'PetCare';
      if (subEl) subEl.textContent = target.dataset.sub || '';
    }
    document.title = 'PetCare – ' + (id === 'inicio' ? 'Inicio' : (target.dataset.title || 'Gestión'));
    setMenu(false);
    closeUserMenu();
    refreshAll();
    window.scrollTo(0, 0);
  }
  function startApp() {
    if (!session || !session.access || !session.apiUser) {
      clearSession();
      showLogin();
      return;
    }
    currentUser = apiUserForUI(session.apiUser);
    var login = document.getElementById('loginScreen');
    var app = document.getElementById('app');
    if (login) login.hidden = true;
    if (app) app.hidden = false;
    updateUserUI();
    if (!location.hash) {
      try { history.replaceState(null, '', '#inicio'); } catch (e) { location.hash = '#inicio'; }
    }
    route();
    loadAppointmentData().catch(function (error) {
      showToast(error.message || 'No se pudieron cargar las citas guardadas.', 'error');
    });
  }
  function showLogin() {
    currentUser = null;
    var login = document.getElementById('loginScreen');
    var app = document.getElementById('app');
    if (login) login.hidden = false;
    if (app) app.hidden = true;
    closeModal();
    closeUserMenu();
    setMenu(false);
    var error = document.getElementById('loginError');
    if (error) { error.hidden = true; error.textContent = ''; }
    var form = document.getElementById('loginForm');
    if (form) {
      form.reset();
      form.querySelectorAll('[aria-invalid="true"]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
    }
    document.title = 'PetCare – Ingresa a tu cuenta';
    window.scrollTo(0, 0);
  }
  function showLoginError(message) {
    var error = document.getElementById('loginError');
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
  }
  function openInfoModal(title, html) {
    openModal({
      title: esc(title),
      html: '<p class="modal__text">' + html + '</p>',
      submitLabel: 'Entendido',
      hideCancel: true,
      width: 500,
      onSubmit: function () {}
    });
  }

  /* ============================================================
     ACCIONES (delegación de eventos)
     ============================================================ */
  function moveMonth(delta) {
    var d = new Date(state.calDate.getFullYear(), state.calDate.getMonth() + delta, 1);
    state.calDate = d;
    var now = new Date();
    var currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    state.selectedDay = d < currentMonth ? isoOf(d) : nextOpenDay(isoOf(d));
    renderAvailability();
  }

  function handleAction(action, el, event) {
    var id = el.dataset.id;
    var a, r, u, pet;
    closeUserMenu();
    if (event && el.tagName === 'A') event.preventDefault();

    switch (action) {
      case 'logout':
        clearSession();
        showLogin();
        showToast('Sesión cerrada correctamente.', 'info');
        return;

      case 'goto-inicio':
        location.hash = '#inicio';
        return;
      case 'goto-registro':
        location.hash = '#registro';
        return;
      case 'goto-reminders':
        location.hash = '#recordatorios';
        return;

      /* ---------- citas ---------- */
      case 'new-appointment':
        openAppointmentWhenReady({
          petId: el.dataset.pet || undefined,
          date: el.dataset.date || undefined,
          time: el.dataset.time || undefined,
          vetId: el.dataset.vet || undefined,
          service: el.dataset.service || undefined
        });
        return;
      case 'edit-appointment':
        if (db.appointments.some(function (item) { return item.id === id && !item.apiId; })) {
          openAppointmentModal({ id: id });
        } else {
          openAppointmentWhenReady({ id: id });
        }
        return;
      case 'charge-appointment':
        a = db.appointments.find(function (item) { return item.id === id; });
        if (!a || a.status === 'cancelada') {
          showToast('No se puede generar un cobro para esta cita.', 'error');
          return;
        }
        if (!billingRoleAllowed()) {
          showToast('Tu cuenta no tiene permisos para administrar cobros.', 'error');
          return;
        }
        el.disabled = true;
        loadBillingData().then(function (loaded) {
          el.disabled = false;
          if (!loaded) {
            showToast(billingData.error || 'No pudimos cargar tutores y mascotas del backend.', 'error');
            return;
          }
          openDebtModal('', a);
        });
        return;
      case 'delete-appointment':
        a = db.appointments.find(function (x) { return x.id === id; });
        if (!a) return;
        confirmDialog({
          title: 'Eliminar cita',
          text: '¿Eliminar la cita de <strong>' + esc(petName(a.petId)) + '</strong> del ' + esc(fmtDateShort(a.date)) + ' a las ' + esc(a.time) + '? Esta acción no se puede deshacer.',
          confirmLabel: 'Eliminar cita',
          onConfirm: function () {
            if (a.apiId) {
              apiRequest('/api/appointments/' + encodeURIComponent(a.apiId) + '/', {
                method: 'DELETE'
              }).then(function () {
                return loadAppointmentData(true);
              }).then(function () {
                showToast('Cita eliminada del sistema.');
              }).catch(function (error) {
                showToast(error.message || 'No se pudo eliminar la cita.', 'error');
              });
              return;
            }
            db.appointments = db.appointments.filter(function (x) { return x.id !== id; });
            saveDB();
            showToast('Cita eliminada.');
            refreshAll();
          }
        });
        return;
      case 'confirm-appointment':
        a = db.appointments.find(function (x) { return x.id === id; });
        if (!a) return;
        if (a.apiId) {
          apiRequest('/api/appointments/' + encodeURIComponent(a.apiId) + '/', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'confirmada' })
          }).then(function () {
            return loadAppointmentData(true);
          }).then(function () {
            showToast('Cita confirmada y guardada.');
          }).catch(function (error) {
            showToast(error.message || 'No se pudo confirmar la cita.', 'error');
          });
          return;
        }
        a.status = 'confirmada';
        saveDB();
        showToast('Cita confirmada.');
        refreshAll();
        return;
      case 'complete-appointment':
        a = db.appointments.find(function (x) { return x.id === id; });
        if (!a) return;
        if (a.apiId) {
          apiRequest('/api/appointments/' + encodeURIComponent(a.apiId) + '/', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'atendida' })
          }).then(function () {
            return loadAppointmentData(true);
          }).then(function () {
            showToast('Cita marcada como atendida.');
          }).catch(function (error) {
            showToast(error.message || 'No se pudo actualizar la cita.', 'error');
          });
          return;
        }
        a.status = 'atendida';
        saveDB();
        showToast('Cita marcada como atendida.');
        refreshAll();
        return;
      case 'book-slot':
        var date = el.dataset.date;
        var time = el.dataset.time;
        var vetId = el.dataset.vet || findFreeVet(date, time);
        openAppointmentWhenReady({ date: date, time: time, vetId: vetId });
        return;
      case 'cal-prev':
        moveMonth(-1);
        return;
      case 'cal-next':
        moveMonth(1);
        return;
      case 'cal-day':
        state.selectedDay = el.dataset.date;
        renderAvailability();
        return;
      case 'cycle-vet':
        var ids = ['all'].concat(getAppointmentVets().map(function (v) { return v.id; }));
        var idx = ids.indexOf(state.calVet);
        state.calVet = ids[(idx + 1) % ids.length];
        renderAvailability();
        return;

      /* ---------- ficha ---------- */
      case 'ficha-tab':
        state.fichaTab = el.dataset.tab;
        renderFicha();
        return;
      case 'select-pet':
        state.fichaPetId = id;
        var input = document.getElementById('fichaSearch');
        pet = getPet(id);
        if (input && pet) input.value = pet.name;
        var box = document.getElementById('fichaResults');
        if (box) { box.hidden = true; box.innerHTML = ''; }
        renderFicha();
        return;
      case 'edit-pet':
        openPetModal(id);
        return;
      case 'new-record':
        openRecordModal({ type: el.dataset.type || state.fichaTab, petId: state.fichaPetId });
        return;
      case 'edit-record':
        openRecordModal({ id: id });
        return;
      case 'view-record':
        viewRecord(id);
        return;
      case 'delete-record':
        r = getRecord(id);
        if (!r) return;
        confirmDialog({
          title: 'Eliminar registro',
          text: '¿Eliminar <strong>' + esc(r.title) + '</strong> de la ficha de ' + esc(petName(r.petId)) + '?',
          confirmLabel: 'Eliminar registro',
          onConfirm: function () {
            db.records = db.records.filter(function (x) { return x.id !== id; });
            saveDB();
            showToast('Registro eliminado.');
            refreshAll();
          }
        });
        return;

      /* ---------- recordatorios ---------- */
      case 'rem-filter':
        state.reminderFilter = el.dataset.filter || 'all';
        renderReminders();
        return;
      case 'new-reminder':
        openReminderModal({});
        return;
      case 'edit-reminder':
        openReminderModal({ id: id });
        return;
      case 'send-reminder':
        r = getReminder(id);
        if (!r) return;
        r.status = 'enviado';
        saveDB();
        showToast('Recordatorio marcado como enviado.');
        refreshAll();
        return;
      case 'delete-reminder':
        r = getReminder(id);
        if (!r) return;
        confirmDialog({
          title: 'Eliminar recordatorio',
          text: '¿Eliminar el recordatorio <strong>' + esc(r.title) + '</strong> de ' + esc(petName(r.petId)) + '?',
          confirmLabel: 'Eliminar recordatorio',
          onConfirm: function () {
            db.reminders = db.reminders.filter(function (x) { return x.id !== id; });
            saveDB();
            showToast('Recordatorio eliminado.');
            refreshAll();
          }
        });
        return;
      case 'book-banner':
        openAppointmentModal({
          petId: el.dataset.pet || undefined,
          date: el.dataset.date || undefined,
          service: el.dataset.service || undefined
        });
        return;

      /* ---------- pagos ---------- */
      case 'open-payment-portal':
        openPaymentPortal(el.dataset.rut || '');
        return;
      case 'new-debt':
        openDebtModal();
        return;
      case 'edit-debt':
        openDebtModal(id);
        return;
      case 'delete-debt':
        a = billingData.debts.find(function (debt) { return debt.id === id; });
        if (!a) return;
        confirmDialog({
          title: 'Eliminar cuenta por cobrar',
          text: '¿Eliminar la cuenta <strong>' + esc(a.concept) + '</strong> por ' + esc(money(a.amount)) + '?',
          confirmLabel: 'Eliminar cuenta',
          onConfirm: function () {
            apiRequest('/api/debts/' + encodeURIComponent(id) + '/', { method: 'DELETE' }).then(function () {
              billingData.loaded = false;
              showToast('Cuenta eliminada.');
              loadBillingData();
              if (a.appointment) {
                appointmentData.loaded = false;
                loadAppointmentData(true).catch(function (error) {
                  showToast(error.message || 'La cuenta se eliminó, pero no se pudo actualizar la cita.', 'error');
                });
              }
            }).catch(function (error) {
              showToast(error.message || 'No se pudo eliminar la cuenta.', 'error');
            });
          }
        });
        return;
      case 'refresh-payments':
        billingData.loaded = false;
        billingData.attempted = false;
        loadBillingData();
        return;
      case 'pay-filter':
        state.payFilter = el.dataset.filter || 'pendiente';
        renderPayments();
        return;
      case 'debt-qr':
      case 'pay-debt':
        a = billingData.debts.find(function (debt) { return debt.id === id; });
        if (a && a.payment_url) window.open(a.payment_url, '_blank', 'noopener');
        else showToast('No hay un enlace de pago disponible para esta cuenta.', 'error');
        return;
      case 'pay-all':
        showToast('Cada cuenta se paga por separado desde su enlace seguro de Webpay Plus.', 'info');
        return;

      /* ---------- administración ---------- */
      case 'admin-section':
        state.adminSection = el.dataset.admin || 'usuarios';
        renderAdmin();
        return;
      case 'new-user':
        openUserModal(null, el.dataset.role || 'Recepción');
        return;
      case 'edit-user':
        openUserModal(id);
        return;
      case 'delete-user':
        u = getUser(id);
        if (!u) return;
        if (currentUser && u.id === currentUser.id) {
          showToast('No puedes eliminar tu propia cuenta.', 'error');
          return;
        }
        confirmDialog({
          title: 'Eliminar usuario',
          text: '¿Eliminar a <strong>' + esc(u.name) + '</strong> (' + esc(u.email) + ')? Sus citas y registros anteriores se conservarán en el historial.',
          confirmLabel: 'Eliminar usuario',
          onConfirm: function () {
            db.users = db.users.filter(function (x) { return x.id !== id; });
            saveDB();
            showToast('Usuario eliminado.');
            refreshAll();
          }
        });
        return;
      case 'reset-schedule':
        confirmDialog({
          title: 'Restaurar horarios',
          text: 'Se restaurará el horario de atención predeterminado (lunes a viernes de 09:00 a 17:30, sábado de 09:00 a 13:00).',
          confirmLabel: 'Restaurar',
          danger: false,
          onConfirm: function () {
            persistSchedule(defaultSchedule(), 'Horarios restaurados.');
          }
        });
        return;

      default:
        return;
    }
  }

  /* ============================================================
     LOGIN
     ============================================================ */
  function initLoginEvents() {
    var form = document.getElementById('loginForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var emailEl = document.getElementById('email');
        var passEl = document.getElementById('password');
        var email = emailEl ? emailEl.value.trim() : '';
        var pass = passEl ? passEl.value : '';
        if (emailEl) emailEl.removeAttribute('aria-invalid');
        if (passEl) passEl.removeAttribute('aria-invalid');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          if (emailEl) { emailEl.setAttribute('aria-invalid', 'true'); emailEl.focus(); }
          showLoginError('Ingresa un correo electrónico válido.');
          return;
        }
        if (!pass) {
          if (passEl) { passEl.setAttribute('aria-invalid', 'true'); passEl.focus(); }
          showLoginError('Ingresa tu contraseña.');
          return;
        }
        var submit = form.querySelector('button[type="submit"]');
        var submitMarkup = submit ? submit.innerHTML : '';
        if (submit) { submit.disabled = true; submit.textContent = 'Ingresando…'; }
        fetch('/api/auth/token/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: pass })
        }).then(readApiResponse).then(function (tokens) {
          if (!tokens || !tokens.access || !tokens.refresh) throw new Error('El servidor no entregó una sesión válida.');
          return fetch('/api/auth/me/', {
            headers: { Authorization: 'Bearer ' + tokens.access }
          }).then(readApiResponse).then(function (user) {
            setSession(tokens, user);
            startApp();
            showToast('Bienvenido/a, ' + firstName(user.name) + '.');
          });
        }).catch(function (error) {
          showLoginError(error.message || 'No se pudo iniciar sesión. Revisa tus credenciales y la conexión con el servidor.');
        }).then(function () {
          if (submit) {
            submit.disabled = false;
            submit.innerHTML = submitMarkup;
          }
        });
      });
      ['email', 'password'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('input', function () {
          el.removeAttribute('aria-invalid');
          var error = document.getElementById('loginError');
          if (error) error.hidden = true;
        });
      });
    }

    var google = document.getElementById('googleBtn');
    if (google) google.addEventListener('click', function () {
      showLoginError('El acceso con Google no está configurado. Ingresa con tu correo y contraseña de PetCare.');
    });

    var forgot = document.getElementById('forgotLink');
    if (forgot) forgot.addEventListener('click', function (e) {
      e.preventDefault();
      showLoginError('La recuperación por correo no está configurada. Contacta al administrador de PetCare.');
    });

    var register = document.getElementById('registerLink');
    if (register) register.addEventListener('click', function (e) {
      e.preventDefault();
      showLoginError('Las cuentas del personal deben ser creadas por la administración de la clínica.');
    });

    document.querySelectorAll('.auth__legal a').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        if (/privacidad/i.test(link.textContent)) {
          openInfoModal('Política de privacidad', 'El inicio de sesión y las operaciones de cobro se procesan en el backend de PetCare. Las demás pantallas del prototipo aún usan datos locales de demostración.');
        } else {
          openInfoModal('Términos de uso', 'Las funciones de cobro conectan con el backend de PetCare y Webpay Plus de Transbank en el ambiente configurado. Otras pantallas del prototipo aún usan datos de ejemplo y no reemplazan un sistema clínico real.');
        }
      });
    });
  }

  function openRegisterModal() {
    var html = '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label" for="rg-name">Nombre completo <span class="req">*</span></label><input class="field-input" id="rg-name" type="text" placeholder="Ej: Carolina Méndez" required></div>' +
      '<div class="field"><label class="field__label" for="rg-mail">Correo <span class="req">*</span></label><input class="field-input" id="rg-mail" type="email" placeholder="correo@petcare.cl" required></div>' +
      '<div class="field"><label class="field__label" for="rg-pass">Contraseña <span class="req">*</span></label><input class="field-input" id="rg-pass" type="password" minlength="6" placeholder="Mínimo 6 caracteres" required></div>' +
      '<div class="field"><label class="field__label" for="rg-pass2">Repetir contraseña <span class="req">*</span></label><input class="field-input" id="rg-pass2" type="password" minlength="6" placeholder="Repite la contraseña" required></div>' +
      '</div>';
    openModal({
      title: 'Crear cuenta',
      subtitle: 'Regístrate para acceder a la clínica. El rol asignado es Recepción.',
      html: html,
      submitLabel: 'Crear cuenta',
      width: 600,
      onSubmit: function (form) {
        return 'El registro público está deshabilitado. Solicita una cuenta al administrador de PetCare.';
      }
    });
  }

  /* ============================================================
     EVENTOS GENERALES
     ============================================================ */
  function initAppEvents() {
    var menuBtn = document.getElementById('menuBtn');
    var backdrop = document.getElementById('backdrop');
    if (menuBtn) menuBtn.addEventListener('click', function () {
      setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
    });
    if (backdrop) backdrop.addEventListener('click', function () { setMenu(false); });

    var userBtn = document.getElementById('userBtn');
    if (userBtn) userBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleUserMenu();
    });

    var bell = document.getElementById('bellBtn');
    if (bell) bell.addEventListener('click', function () {
      var pending = db.reminders.filter(function (r) { return r.status === 'pendiente'; }).length;
      if (location.hash === '#recordatorios') {
        showToast(pending ? pending + ' recordatorio' + (pending === 1 ? '' : 's') + ' pendiente' + (pending === 1 ? '' : 's') + '.' : 'No hay recordatorios pendientes.', 'info');
      } else {
        location.hash = '#recordatorios';
      }
    });

    var vetSelect = document.getElementById('vetSelect');
    if (vetSelect) vetSelect.addEventListener('change', function () {
      state.calVet = vetSelect.value;
      renderAvailability();
    });

    var apptSearch = document.getElementById('apptSearch');
    if (apptSearch) apptSearch.addEventListener('input', function () {
      state.apptQuery = apptSearch.value;
      renderAppointments();
    });
    var apptFilter = document.getElementById('apptFilter');
    if (apptFilter) apptFilter.addEventListener('change', function () {
      state.apptFilter = apptFilter.value;
      renderAppointments();
    });

    var paySearch = document.getElementById('paySearch');
    if (paySearch) paySearch.addEventListener('input', function () {
      state.payQuery = paySearch.value;
      renderPayments();
    });
    document.addEventListener('blur', function (e) {
      var target = e.target;
      if (!target || !target.id) return;
      if ((target.id === 'payRut' || target.id === 't-rut') && target.value.trim()) {
        target.value = formatRut(target.value);
      }
    }, true);

    var fichaSearch = document.getElementById('fichaSearch');
    var fichaForm = document.getElementById('fichaSearchForm');
    if (fichaSearch) {
      fichaSearch.addEventListener('input', function () { renderFichaResults(fichaSearch.value); });
      fichaSearch.addEventListener('focus', function () { if (fichaSearch.value.trim()) renderFichaResults(fichaSearch.value); });
    }
    if (fichaForm) fichaForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = fichaSearch ? fichaSearch.value.trim().toLowerCase() : '';
      if (!q) { if (fichaSearch) fichaSearch.focus(); return; }
      var matches = db.pets.filter(function (p) { return petMatches(p, q); });
      if (!matches.length) {
        renderFichaResults(fichaSearch.value);
        showToast('No se encontraron coincidencias.', 'error');
        return;
      }
      state.fichaPetId = matches[0].id;
      fichaSearch.value = matches[0].name;
      var box = document.getElementById('fichaResults');
      if (box) box.hidden = true;
      renderFicha();
    });

    var bannerClose = document.getElementById('bannerClose');
    if (bannerClose) bannerClose.addEventListener('click', function () {
      state.bannerDismissed = true;
      renderReminders();
    });

    document.addEventListener('click', function (e) {
      var actionEl = e.target.closest ? e.target.closest('[data-action]') : null;
      if (actionEl) {
        handleAction(actionEl.dataset.action, actionEl, e);
        return;
      }
      var adminEl = e.target.closest ? e.target.closest('[data-admin]') : null;
      if (adminEl) {
        handleAction('admin-section', adminEl, e);
        return;
      }
      if (!e.target.closest('.user-wrap')) closeUserMenu();
      var searchForm = document.getElementById('fichaSearchForm');
      var results = document.getElementById('fichaResults');
      if (searchForm && results && !searchForm.contains(e.target)) results.hidden = true;
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var root = document.getElementById('modalRoot');
        if (root && !root.hidden) closeModal();
        setMenu(false);
        closeUserMenu();
      }
    });

    window.addEventListener('hashchange', route);
  }

  /* ============================================================
     REGISTRO DE TUTOR Y MASCOTA
     ============================================================ */
  function nextRecordNumber() {
    var max = 100;
    db.pets.forEach(function (p) {
      var n = parseInt(String(p.recordNumber || '').replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return 'PC-' + String(max + 1).padStart(5, '0');
  }

  function resizeImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 360;
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        cb(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { cb(String(reader.result || '')); };
      img.src = String(reader.result || '');
    };
    reader.onerror = function () { cb(''); };
    reader.readAsDataURL(file);
  }

  function initRegistration() {
    var form = document.getElementById('registerForm');
    if (!form) return;
    var photoInput = document.getElementById('m-foto');
    var preview = document.getElementById('photoPreview');
    var photoName = document.getElementById('photoName');
    if (photoInput) photoInput.addEventListener('change', function () {
      var file = photoInput.files && photoInput.files[0];
      if (!file) return;
      if (!/^image\/(png|jpeg)$/i.test(file.type)) {
        showToast('La foto debe ser PNG o JPG.', 'error');
        photoInput.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('La foto supera el máximo de 5 MB.', 'error');
        photoInput.value = '';
        return;
      }
      resizeImage(file, function (data) {
        pendingPhoto = data || '';
        if (preview) {
          preview.src = pendingPhoto;
          preview.hidden = !pendingPhoto;
        }
        if (photoName) photoName.textContent = pendingPhoto ? file.name : 'PNG o JPG, máximo 5 MB';
      });
    });

    var species = document.getElementById('m-especie');
    var sex = document.getElementById('m-sexo');
    [species, sex].forEach(function (select) {
      if (select && select.options[0] && /seleccionar/i.test(select.options[0].textContent)) select.options[0].value = '';
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var tutorName = document.getElementById('t-nombre').value.trim();
      var rut = document.getElementById('t-rut').value.trim();
      var phone = document.getElementById('t-tel').value.trim();
      var mail = document.getElementById('t-mail').value.trim().toLowerCase();
      var petNameEl = document.getElementById('m-nombre');
      var petNameVal = petNameEl.value.trim();
      var speciesVal = species.value;
      var sexVal = sex.value;
      var ageVal = document.getElementById('m-edad').value;
      if (!tutorName || !rut || !phone) { showToast('Completa los datos del tutor.', 'error'); return; }
      if (!isValidRut(rut)) { showToast('RUT inválido. Revisa el dígito verificador (ej: 12.345.678-5).', 'error'); return; }
      rut = formatRut(rut);
      if (!petNameVal) { showToast('Escribe el nombre de la mascota.', 'error'); return; }
      if (!speciesVal || !sexVal) { showToast('Selecciona especie y sexo de la mascota.', 'error'); return; }
      if (ageVal === '' || Number(ageVal) < 0) { showToast('Ingresa una edad válida.', 'error'); return; }
      var submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      submit.textContent = 'Guardando…';
      apiRequest('/api/pets/register/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tutor: {
            name: tutorName,
            rut: rut,
            phone: phone,
            email: mail
          },
          pet: {
            name: petNameVal,
            species: speciesVal,
            breed: document.getElementById('m-raza').value.trim(),
            age: Number(ageVal),
            sex: sexVal,
            reproductive_status: document.getElementById('m-repro').value,
            photo: pendingPhoto || ''
          }
        })
      }).then(function (result) {
        var savedTutor = result.tutor;
        var savedPet = {
          id: result.pet.id,
          apiId: result.pet.id,
          tutorId: result.pet.tutor,
          name: result.pet.name,
          species: result.pet.species,
          breed: result.pet.breed,
          age: result.pet.age,
          sex: result.pet.sex,
          reproductive: result.pet.reproductive_status,
          weight: result.pet.weight,
          microchip: result.pet.microchip,
          recordNumber: result.pet.record_number,
          photo: result.pet.photo || '',
          createdAt: result.pet.created_at
        };
        var existingTutor = db.tutors.find(function (item) { return item.id === savedTutor.id; });
        if (existingTutor) Object.assign(existingTutor, savedTutor);
        else db.tutors.push(savedTutor);
        db.pets.push(savedPet);
        appointmentData.tutors = appointmentData.tutors.filter(function (item) {
          return item.id !== savedTutor.id;
        }).concat([savedTutor]);
        appointmentData.pets = appointmentData.pets.filter(function (item) {
          return item.id !== savedPet.id;
        }).concat([savedPet]);
        saveDB();
        form.reset();
        pendingPhoto = '';
        if (preview) { preview.hidden = true; preview.removeAttribute('src'); }
        if (photoName) photoName.textContent = 'PNG o JPG, máximo 5 MB';
        state.fichaPetId = savedPet.id;
        state.fichaTab = 'diagnostico';
        var fichaInput = document.getElementById('fichaSearch');
        if (fichaInput) fichaInput.value = savedPet.name;
        location.hash = '#ficha';
        refreshAll();
        showToast('Registro guardado en el backend. ' + savedPet.name + ' ya puede agendar citas.');
        loadAppointmentData(true).catch(function (error) {
          showToast(error.message || 'El registro se guardó, pero no se pudo actualizar la agenda.', 'error');
        });
      }).catch(function (error) {
        showToast(error.message || 'No se pudo guardar el registro en el backend.', 'error');
      }).then(function () {
        submit.disabled = false;
        submit.innerHTML = icon('i-check', 'icon--md') + 'Guardar registro';
      });
    });
  }

  /* ============================================================
     INICIO DE LA APLICACIÓN
     ============================================================ */
  initAppEvents();
  initLoginEvents();
  initRegistration();

  if (session && session.access && session.apiUser) startApp();
  else if (session) clearSession();
  else showLogin();
})();
