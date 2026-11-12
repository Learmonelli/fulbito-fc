// Sección "☁️ Liga" de la hoja de datos: link para compartir, entrar, mis ligas, crear una liga
// y administradores. Cada liga la cargan su dueño y sus admins; el resto mira con el link.
import { h, fill } from '../dom.js';
import { ADMIN_EMAIL } from '../cloud.js';
import { leagueLink, MAIN, isEmail, cleanEmail } from '../league.js';
import { toast } from './toast.js';
import { confirmDialog } from './sheet.js';
import { installSection } from './install.js';

const STATUS = {
  off: '⚪ Sin conexión a la nube', connecting: '🟡 Conectando…', ok: '🟢 Conectada', saving: '🟡 Guardando…', error: '🔴 Problema con la nube',
};

async function share(url, name) {
  try {
    if (navigator.share) { await navigator.share({ title: name, text: `${name} en Fulbito FC`, url }); return; }
  } catch { /* cancelado: se copia */ }
  try { await navigator.clipboard.writeText(url); toast('🔗 Link copiado. Pasalo por WhatsApp.'); } catch { toast(url, { ms: 12000 }); }
}

function shareBox(sync) {
  const lg = sync.cloud.league();
  const url = leagueLink(sync.leagueId);
  return h('div', { class: 'card share-box' },
    h('p', {}, h('strong', {}, lg?.name || 'Fulbito FC')),
    h('p', { class: 'muted small-note' }, 'Con este link cualquiera mira la liga en vivo (tabla, cuadro, estadísticas). Solo los administradores cargan.'),
    h('input', { type: 'text', readonly: true, value: url, 'aria-label': 'Link de la liga', onfocus: (e) => e.target.select() }),
    h('button', { onclick: () => share(url, lg?.name || 'Fulbito FC') }, '🔗 Compartir link'));
}

// Lista de administradores: el dueño (fijo) y los emails que agregaron. Los admins pueden sumar y sacar.
function adminsBox(sync) {
  const { cloud } = sync;
  const box = h('div', { class: 'admins-box' });
  const err = h('p', { class: 'error', role: 'alert' });
  const paint = () => {
    const lg = cloud.league();
    if (!lg?.exists) { fill(box); return; }
    const input = h('input', { type: 'email', placeholder: 'email@ejemplo.com', 'aria-label': 'Email del nuevo administrador', autocomplete: 'off' });
    const save = async (list, okMsg) => {
      err.textContent = '';
      try { await cloud.setAdmins(list); toast(okMsg); paint(); } catch (ex) { err.textContent = ex.message; }
    };
    fill(box,
      h('h3', { class: 'list-heading' }, '👥 Administradores'),
      h('p', { class: 'muted small-note' }, 'Pueden cargar resultados y sumar a otros. Cada uno entra con su email.'),
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

function myLeaguesBox(sync) {
  const box = h('div', {}, h('p', { class: 'muted small-note' }, 'Buscando tus ligas…'));
  sync.cloud.myLeagues().then((list) => {
    fill(box, list.length
      ? [h('h3', { class: 'list-heading' }, '🏆 Mis ligas'),
        h('ul', { class: 'plist' }, list.map((l) => h('li', { class: 'prow' },
          h('a', { href: leagueLink(l.id), class: 'grow' }, l.name), h('span', { class: 'pill' }, l.role),
          l.id === sync.leagueId ? h('span', { class: 'muted small-note' }, '(esta)') : null)))]
      : null);
  }).catch(() => fill(box));
  return box;
}

function createLeagueBox(sync) {
  const name = h('input', { type: 'text', maxlength: 60, placeholder: 'Ej: Liga de los Jueves', 'aria-label': 'Nombre de la liga' });
  const err = h('p', { class: 'error', role: 'alert' });
  return h('details', { class: 'face-group' }, h('summary', {}, '＋ Crear una liga nueva'),
    h('p', { class: 'muted small-note' }, '¿Organizás un torneo? Creá tu liga: vas a ser su dueño, cargás los resultados y compartís el link con todos los equipos.'),
    h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      const btn = e.target.querySelector('button'); btn.disabled = true;
      try {
        const id = await sync.createLeague(name.value);
        toast('🏆 Liga creada. ¡A cargar equipos!');
        location.href = leagueLink(id); // abre la liga nueva (vacía) como dueño
      } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
    } }, name, err, h('button', { type: 'submit' }, 'Crear liga')));
}

function loginBox(sync, close) {
  const { cloud } = sync;
  const email = h('input', { type: 'email', autocomplete: 'username', placeholder: 'tu@email.com', 'aria-label': 'Email' });
  if (sync.leagueId === MAIN) email.value = ADMIN_EMAIL;
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña', 'aria-label': 'Contraseña' });
  const err = h('p', { class: 'error', role: 'alert' });
  return h('div', { class: 'stack' },
    h('h3', { class: 'list-heading' }, '🔑 Entrar'),
    h('p', { class: 'muted small-note' }, 'Para cargar datos (si sos administrador) o para crear tu propia liga.'),
    h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      try { await cloud.signInWithPassword(email.value, pass.value); toast(cloud.canEdit() ? '👑 Entraste como administrador.' : '✅ Entraste.'); close(); } catch (ex) { err.textContent = ex.message; }
    } }, email, pass, err, h('button', { type: 'submit' }, 'Entrar')),
    h('details', { class: 'face-group' }, h('summary', {}, '¿Primera vez o sin contraseña? Entrá con un link'),
      h('p', { class: 'muted small-note' }, 'Te mandamos un link al mail (si es la primera vez, se crea tu cuenta). Abrilo en este mismo navegador y después creá una contraseña.'),
      h('button', { class: 'ghost', onclick: async (e) => {
        err.textContent = ''; e.currentTarget.disabled = true;
        try { await cloud.signInWithEmail(email.value); toast('📧 Listo: revisá tu mail y tocá el link.'); } catch (ex) { err.textContent = ex.message; }
        e.currentTarget.disabled = false;
      } }, 'Enviar link a mi email')));
}

function accountBox(sync, close) {
  const { cloud } = sync;
  const user = cloud.user();
  const p1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Contraseña nueva', 'aria-label': 'Contraseña nueva' });
  const p2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repetila', 'aria-label': 'Repetir contraseña' });
  const err = h('p', { class: 'error', role: 'alert' });
  return h('div', { class: 'stack' },
    h('p', { class: cloud.canEdit() ? 'admin-note' : 'muted' }, cloud.canEdit()
      ? `👑 ${user.email}: sos ${cloud.isOwner() ? 'dueño' : 'administrador'} de esta liga.`
      : `Entraste como ${user.email}. En esta liga mirás (no sos administrador).`),
    h('details', { class: 'face-group' }, h('summary', {}, '🔑 Contraseña para entrar desde otro dispositivo'),
      p1, p2, err,
      h('button', { onclick: async () => {
        err.textContent = '';
        if (p1.value !== p2.value) { err.textContent = 'Las dos contraseñas no coinciden.'; return; }
        try { await cloud.setPassword(p1.value); p1.value = ''; p2.value = ''; toast('🔑 Contraseña guardada.'); } catch (ex) { err.textContent = ex.message; }
      } }, 'Guardar contraseña')),
    h('button', { class: 'ghost', onclick: async () => {
      if (!(await confirmDialog('¿Salir de tu cuenta? Vas a poder seguir mirando.', { okLabel: 'Salir' }))) return;
      await cloud.signOut(); close(); toast('Saliste de tu cuenta.');
    } }, 'Salir'));
}

export function cloudSection(sync, close) {
  const { cloud } = sync;
  if (!sync.configured) {
    return h('div', { class: 'cloud-box' }, h('h3', {}, '☁️ Nube'),
      h('p', { class: 'muted' }, 'Todavía no hay un proyecto de Supabase configurado: los datos quedan solo en este navegador.'));
  }
  const user = cloud.user();
  const err = h('p', { class: 'error', role: 'alert' });
  return h('div', { class: 'cloud-box' },
    h('h3', {}, '☁️ Liga'),
    h('p', {}, STATUS[cloud.status()] ?? cloud.status()),
    cloud.detail() ? h('p', { class: 'muted small-note' }, cloud.detail()) : null,
    sync.missing() ? h('p', { class: 'error' }, 'Este link no corresponde a ninguna liga. Revisá que esté completo.') : shareBox(sync),
    installSection(),
    user ? accountBox(sync, close) : loginBox(sync, close),
    user && cloud.canEdit() && sync.remoteEmpty() && sync.leagueId === MAIN ? h('div', { class: 'card' },
      h('p', {}, 'La nube está vacía. ¿Subo lo que tenés en este navegador?'),
      h('button', { onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { await sync.publishLocal(); toast('⬆ Datos subidos a la nube.'); close(); } catch (ex) { err.textContent = ex.message; e.currentTarget.disabled = false; }
      } }, '⬆ Subir los datos de este navegador'), err) : null,
    user && cloud.canEdit() ? adminsBox(sync) : null,
    user ? myLeaguesBox(sync) : null,
    user ? createLeagueBox(sync) : null);
}
