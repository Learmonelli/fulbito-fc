// Sección "☁️ Grupo" de la hoja de datos (💾): link para compartir, cuenta, administradores, ajustes
// del grupo, copias de seguridad y mis grupos. Y el indicador de estado del encabezado.
// Cualquiera con el link carga partidos; solo el dueño y los admins finalizan, reabren y borran.
import { h, fill } from '../dom.js';
import { leagueLink, isEmail, cleanEmail } from '../league.js';
import { toast } from './toast.js';
import { confirmDialog } from './sheet.js';

const STATUS = {
  off: '⚪ Sin conexión a la nube', connecting: '🟡 Conectando…', ok: '🟢 Sincronizado', saving: '🟡 Guardando…', error: '🔴 Problema con la nube',
};
const CHIP = { connecting: 'busy', saving: 'busy', ok: 'ok', error: 'err' };

export function statusChip(session, onClick) {
  const chip = h('button', { class: 'ghost small icon-btn cloud-chip', onclick: onClick, hidden: true });
  const paint = () => {
    const { cloud } = session;
    const s = cloud.status();
    const admin = cloud.canEdit();
    chip.hidden = !cloud.league()?.exists;
    chip.className = `ghost small icon-btn cloud-chip ${CHIP[s] || ''}`;
    chip.setAttribute('aria-label', `${STATUS[s] || STATUS.off}${cloud.detail() ? `. ${cloud.detail()}` : ''}${admin ? '. Administrador' : ''}`);
    chip.title = chip.getAttribute('aria-label');
    chip.replaceChildren(h('span', { 'aria-hidden': 'true' }, admin ? '👑' : '☁️'), h('span', { class: 'dot', 'aria-hidden': 'true' }));
  };
  session.cloud.onStatus(paint);
  session.cloud.onAuth(paint);
  session.cloud.onLeague(paint);
  paint();
  return chip;
}

async function share(url, name) {
  try {
    if (navigator.share) { await navigator.share({ title: name, text: `${name} en Fulbito FC`, url }); return; }
  } catch { /* cancelado: se copia */ }
  try { await navigator.clipboard.writeText(url); toast('🔗 Link copiado. Pasalo por WhatsApp.'); } catch { toast(url, { ms: 12000 }); }
}

function shareBox(session) {
  const lg = session.cloud.league();
  const url = leagueLink(session.leagueId);
  return h('div', { class: 'card share-box' },
    h('p', {}, h('strong', {}, lg?.name || 'Mi grupo')),
    h('p', { class: 'muted small-note' }, 'Con este link cualquiera entra al grupo y carga partidos, goles y pronósticos. Solo los administradores finalizan y borran.'),
    h('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Link del grupo', onfocus: (e) => e.target.select() }),
    h('button', { onclick: () => share(url, lg?.name || 'Mi grupo') }, '🔗 Compartir link'));
}

// Entrar con email y contraseña, o con un link al mail la primera vez. También se usa en la pantalla de inicio.
export function loginBox(session, { onDone = () => {}, intro = 'Para administrar tu grupo (finalizar partidos, sumar administradores) o crear uno nuevo.' } = {}) {
  const { cloud } = session;
  const email = h('input', { type: 'email', autocomplete: 'username', placeholder: 'tu@email.com', 'aria-label': 'Email' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña', 'aria-label': 'Contraseña' });
  const err = h('p', { class: 'error', role: 'alert' });
  return h('div', { class: 'stack' },
    h('h3', { class: 'list-heading' }, '🔑 Entrar'),
    h('p', { class: 'muted small-note' }, intro),
    h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      try { await cloud.signInWithPassword(email.value, pass.value); toast('✅ Entraste.'); onDone(); } catch (ex) { err.textContent = ex.message; }
    } }, email, pass, err, h('button', { type: 'submit' }, 'Entrar')),
    h('details', { class: 'face-group' }, h('summary', {}, '¿Primera vez o sin contraseña? Entrá con un link'),
      h('p', { class: 'muted small-note' }, 'Te mandamos un link al mail (si es la primera vez, se crea tu cuenta). Abrilo en este mismo navegador y después creá una contraseña, así no hace falta pedir más links.'),
      h('button', { class: 'ghost', onclick: async (e) => {
        err.textContent = ''; e.currentTarget.disabled = true;
        try { await cloud.signInWithEmail(email.value); toast('📧 Listo: revisá tu mail (y spam) y tocá el link.'); } catch (ex) { err.textContent = ex.message; }
        e.currentTarget.disabled = false;
      } }, 'Enviar link a mi email')));
}

export function accountBox(session, close) {
  const { cloud } = session;
  const user = cloud.user();
  const p1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Contraseña nueva', 'aria-label': 'Contraseña nueva' });
  const p2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repetila', 'aria-label': 'Repetir contraseña' });
  const err = h('p', { class: 'error', role: 'alert' });
  const role = cloud.isOwner() ? 'dueño' : cloud.canEdit() ? 'administrador' : null;
  return h('div', { class: 'stack' },
    h('p', { class: role ? 'admin-note' : 'muted' }, role
      ? `👑 ${user.email}: sos ${role} de este grupo.`
      : `Entraste como ${user.email}. En este grupo cargás como cualquiera (no sos administrador).`),
    h('details', { class: 'face-group' }, h('summary', {}, '🔑 Contraseña para entrar desde otro dispositivo'),
      p1, p2, err,
      h('button', { onclick: async () => {
        err.textContent = '';
        if (p1.value !== p2.value) { err.textContent = 'Las dos contraseñas no coinciden.'; return; }
        try { await cloud.setPassword(p1.value); p1.value = ''; p2.value = ''; toast('🔑 Contraseña guardada.'); } catch (ex) { err.textContent = ex.message; }
      } }, 'Guardar contraseña')),
    h('button', { class: 'ghost', onclick: async () => {
      if (!(await confirmDialog('¿Salir de tu cuenta? Vas a poder seguir cargando como invitado.', { okLabel: 'Salir' }))) return;
      await cloud.signOut(); close(); toast('Saliste de tu cuenta.');
    } }, 'Salir'));
}

// Administradores: el dueño (fijo) y los emails que agregaron. Cualquier admin puede sumar y sacar.
function adminsBox(session) {
  const { cloud } = session;
  const box = h('div', { class: 'admins-box' });
  const err = h('p', { class: 'error', role: 'alert' });
  const paint = () => {
    const lg = cloud.league();
    const input = h('input', { type: 'email', placeholder: 'email@ejemplo.com', 'aria-label': 'Email del nuevo administrador', autocomplete: 'off' });
    const save = async (list, okMsg) => {
      err.textContent = '';
      try { await cloud.setAdmins(list); toast(okMsg); paint(); } catch (ex) { err.textContent = ex.message; }
    };
    fill(box,
      h('h3', { class: 'list-heading' }, '👥 Administradores'),
      h('p', { class: 'muted small-note' }, 'Pueden finalizar, reabrir y borrar partidos, y sumar a otros. Cada uno entra con su email.'),
      h('ul', { class: 'plist admins-list' },
        lg.ownerEmail ? h('li', { class: 'prow' }, h('span', { class: 'grow' }, lg.ownerEmail), h('span', { class: 'pill' }, 'dueño')) : null,
        lg.admins.map((e) => h('li', { class: 'prow' }, h('span', { class: 'grow' }, e),
          h('button', { class: 'ghost small', 'aria-label': `Sacar a ${e}`, onclick: async () => {
            if (await confirmDialog(`¿Sacar a ${e} de los administradores?`, { okLabel: 'Sacar', danger: true })) save(lg.admins.filter((x) => x !== e), 'Administrador quitado.');
          } }, '✕')))),
      h('form', { class: 'row', onsubmit: (ev) => {
        ev.preventDefault();
        const e = cleanEmail(input.value);
        if (!isEmail(e)) { err.textContent = 'Escribí un email válido.'; return; }
        if (e === lg.ownerEmail || lg.admins.includes(e)) { err.textContent = 'Ya es administrador.'; return; }
        save([...lg.admins, e], `${e} ahora es administrador. Que entre con ese email.`);
      } }, h('div', { class: 'grow' }, input), h('button', { type: 'submit' }, 'Agregar')),
      err);
  };
  paint();
  return box;
}

// Nombre del grupo y de los dos equipos: lo ven todos y se usa al crear cada partido.
function settingsBox(session) {
  const { cloud } = session;
  const lg = cloud.league();
  const s = { teamAName: 'Claros', teamBName: 'Oscuros', ...(lg.settings || {}) };
  const name = h('input', { type: 'text', maxlength: 60, value: lg.name, 'aria-label': 'Nombre del grupo' });
  const a = h('input', { type: 'text', maxlength: 30, value: s.teamAName, 'aria-label': 'Nombre del equipo A' });
  const b = h('input', { type: 'text', maxlength: 30, value: s.teamBName, 'aria-label': 'Nombre del equipo B' });
  const err = h('p', { class: 'error', role: 'alert' });
  return h('details', { class: 'face-group' }, h('summary', {}, '⚙️ Nombre del grupo y de los equipos'),
    h('p', { class: 'muted small-note' }, 'Los equipos aparecen con estos nombres al crear cada partido (se pueden cambiar en cada uno). Los colores se eligen con 🎨.'),
    h('label', { class: 'field' }, h('span', {}, 'Grupo'), name),
    h('div', { class: 'row' }, h('label', { class: 'field grow' }, h('span', {}, 'Equipo A'), a), h('label', { class: 'field grow' }, h('span', {}, 'Equipo B'), b)),
    err,
    h('button', { onclick: async (e) => {
      err.textContent = ''; e.currentTarget.disabled = true;
      try {
        if (name.value.trim() !== lg.name) await cloud.renameLeague(name.value);
        await cloud.updateSettings({ teamAName: a.value.trim() || 'Claros', teamBName: b.value.trim() || 'Oscuros' });
        toast('✅ Guardado.');
      } catch (ex) { err.textContent = ex.message; }
      e.currentTarget.disabled = false;
    } }, 'Guardar'));
}

// Copias: el servidor guarda una por día (03:00) y se pueden guardar a mano.
const fmtWhen = (iso) => new Date(iso).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function backupsBox(session) {
  const { cloud } = session;
  const list = h('div', {}, h('p', { class: 'muted small-note' }, 'Buscando copias…'));
  const err = h('p', { class: 'error', role: 'alert' });
  const download = (data, when) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `fulbito-${session.leagueId}-${when.slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const paint = () => cloud.listBackups().then((rows) => {
    fill(list, rows.length
      ? h('ul', { class: 'plist backups-list' }, rows.map((b) => h('li', { class: 'prow' },
        h('span', { class: 'grow' }, `${b.kind === 'auto' ? '🕒' : '✋'} ${fmtWhen(b.created_at)}`,
          h('span', { class: 'muted small-note' }, b.kind === 'auto' ? ' · automática' : ' · a mano')),
        h('button', { class: 'ghost small', 'aria-label': `Descargar la copia del ${fmtWhen(b.created_at)}`, onclick: async () => {
          err.textContent = '';
          try { download(await cloud.getBackup(b.id), b.created_at); } catch (ex) { err.textContent = ex.message; }
        } }, '⬇'),
        h('button', { class: 'ghost small', onclick: async () => {
          err.textContent = '';
          const ok = await confirmDialog(`Se reemplazan TODOS los jugadores y partidos por los de la copia del ${fmtWhen(b.created_at)}. Lo de ahora se guarda antes como copia, por las dudas. ¿Seguir?`, { okLabel: 'Restaurar', danger: true });
          if (!ok) return;
          try {
            const data = await cloud.getBackup(b.id);
            await cloud.saveBackup(session.backupPayload()); // red de seguridad: lo de ahora queda guardado
            await cloud.restoreBackup(data);
            toast('↩ Grupo restaurado.');
            setTimeout(() => globalThis.location.reload(), 600);
          } catch (ex) { err.textContent = ex.message; }
        } }, 'Restaurar'))))
      : h('p', { class: 'muted small-note' }, 'Todavía no hay copias. La primera automática se hace esta madrugada (03:00).'));
  }).catch((ex) => fill(list, h('p', { class: 'error' }, ex.message)));
  paint();
  return h('details', { class: 'face-group' }, h('summary', {}, '🗂 Copias de seguridad'),
    h('p', { class: 'muted small-note' }, 'El servidor guarda una copia del grupo todos los días a las 03:00 (si hubo cambios) y conserva las últimas 30.'),
    h('button', { class: 'ghost', onclick: async (e) => {
      err.textContent = ''; e.currentTarget.disabled = true;
      try { await cloud.saveBackup(session.backupPayload()); toast('🗂 Copia guardada.'); paint(); } catch (ex) { err.textContent = ex.message; }
      e.currentTarget.disabled = false;
    } }, '🗂 Guardar una copia ahora'),
    list, err);
}

export function myGroupsBox(session) {
  const box = h('div', {});
  session.cloud.myLeagues().then((list) => {
    fill(box, list.length
      ? [h('h3', { class: 'list-heading' }, '👥 Mis grupos'),
        h('ul', { class: 'plist' }, list.map((l) => h('li', { class: 'prow' },
          h('a', { href: leagueLink(l.id), class: 'grow' }, l.name), h('span', { class: 'pill' }, l.role),
          l.id === session.leagueId ? h('span', { class: 'muted small-note' }, '(este)') : null)))]
      : null);
  }).catch(() => fill(box));
  return box;
}

export function createGroupBox(session) {
  const name = h('input', { type: 'text', maxlength: 60, placeholder: 'Ej: Los del jueves', 'aria-label': 'Nombre del grupo' });
  const err = h('p', { class: 'error', role: 'alert' });
  return h('details', { class: 'face-group', open: true }, h('summary', {}, '＋ Crear un grupo nuevo'),
    h('p', { class: 'muted small-note' }, 'Vas a ser el dueño. Después compartís el link por WhatsApp y todos cargan desde su celular.'),
    h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      const btn = e.target.querySelector('button'); btn.disabled = true;
      try {
        const id = await session.cloud.createLeague(name.value);
        toast('👥 Grupo creado. ¡A sumar jugadores!');
        globalThis.location.href = leagueLink(id);
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    } }, name, err, h('button', { type: 'submit' }, 'Crear grupo')));
}

export function cloudSection(session, close) {
  const { cloud } = session;
  // Modo prueba (?local=1): todo queda en este celular.
  if (!session.leagueId) {
    return h('div', { class: 'cloud-box' }, h('h3', {}, '☁️ Grupo'),
      h('p', { class: 'muted' }, 'Estás probando: los datos quedan solo en este celular.'),
      h('button', { onclick: () => { globalThis.location.href = globalThis.location.pathname; } }, '👥 Crear mi grupo o entrar con un link'));
  }
  const lg = cloud.league();
  if (!lg?.exists) {
    return h('div', { class: 'cloud-box' }, h('h3', {}, '☁️ Grupo'), h('p', { class: 'muted' }, STATUS[cloud.status()] ?? ''),
      cloud.detail() ? h('p', { class: 'muted small-note' }, cloud.detail()) : null);
  }
  const user = cloud.user();
  return h('div', { class: 'cloud-box' },
    h('h3', {}, '☁️ Grupo'),
    h('p', {}, STATUS[cloud.status()] ?? cloud.status()),
    cloud.detail() ? h('p', { class: 'muted small-note' }, cloud.detail()) : null,
    offlineNote(session),
    shareBox(session),
    user ? accountBox(session, close) : loginBox(session, { onDone: close }),
    user && cloud.canEdit() ? [adminsBox(session), settingsBox(session), backupsBox(session)] : null,
    user ? [myGroupsBox(session), createGroupBox(session)] : null);
}

// Aviso si la app quedó sin conexión: los cambios de este celular no se envían hasta que vuelva.
function offlineNote(session) {
  return session.phase() === 'offline'
    ? h('p', { class: 'error' }, 'Sin conexión: estás viendo la copia guardada en este celular. Los cambios no se envían; recargá cuando vuelva internet.')
    : null;
}
