// Sección "☁️ Nube" de la hoja de datos: estado de la conexión y entrada del administrador.
import { h } from '../dom.js';
import { ADMIN_EMAIL } from '../cloud.js';
import { toast } from './toast.js';
import { confirmDialog } from './sheet.js';

const STATUS = {
  off: '⚪ Sin conexión a la nube', connecting: '🟡 Conectando…', ok: '🟢 Conectada', saving: '🟡 Guardando…', error: '🔴 Problema con la nube',
};

export function cloudSection(sync, close) {
  const { cloud } = sync;
  if (!sync.configured) {
    return h('div', { class: 'cloud-box' }, h('h3', {}, '☁️ Nube'),
      h('p', { class: 'muted' }, 'Todavía no hay un proyecto de Supabase configurado: los datos quedan solo en este navegador.'));
  }
  const user = cloud.user();
  const err = h('p', { class: 'error', role: 'alert' });
  const head = [h('h3', {}, '☁️ Nube'), h('p', {}, STATUS[cloud.status()] ?? cloud.status()),
    cloud.detail() ? h('p', { class: 'muted small-note' }, cloud.detail()) : null];

  if (user && cloud.isAdmin()) {
    const p1 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Contraseña nueva', 'aria-label': 'Contraseña nueva' });
    const p2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repetila', 'aria-label': 'Repetir contraseña' });
    return h('div', { class: 'cloud-box' }, head,
      h('p', { class: 'admin-note' }, `👑 Administrador: ${user.email}. Lo que cargues se ve al instante en todos los celulares.`),
      sync.remoteEmpty() ? h('div', { class: 'card' },
        h('p', {}, 'La nube está vacía. ¿Subo lo que tenés en este navegador?'),
        h('button', { onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { await sync.publishLocal(); toast('⬆ Datos subidos a la nube.'); close(); } catch (ex) { err.textContent = ex.message; e.currentTarget.disabled = false; }
        } }, '⬆ Subir los datos de este navegador')) : null,
      err,
      h('details', { class: 'face-group' }, h('summary', {}, '🔑 Contraseña para entrar desde el celular'),
        h('p', { class: 'muted small-note' }, 'Con tu email y esta contraseña entrás desde cualquier navegador sin esperar mails.'),
        p1, p2,
        h('button', { onclick: async () => {
          err.textContent = '';
          if (p1.value !== p2.value) { err.textContent = 'Las dos contraseñas no coinciden.'; return; }
          try { await cloud.setPassword(p1.value); p1.value = ''; p2.value = ''; toast('🔑 Contraseña guardada.'); } catch (ex) { err.textContent = ex.message; }
        } }, 'Guardar contraseña')),
      h('div', { class: 'row wrap' },
        h('button', { class: 'ghost', onclick: async () => {
          if (!(await confirmDialog('¿Salir de la cuenta de administrador? La app queda en modo solo lectura.', { okLabel: 'Salir' }))) return;
          await cloud.signOut(); close(); toast('Saliste. Modo solo lectura.');
        } }, 'Salir')));
  }

  const email = h('input', { type: 'email', value: ADMIN_EMAIL, autocomplete: 'username', 'aria-label': 'Email del administrador' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Contraseña', 'aria-label': 'Contraseña' });
  return h('div', { class: 'cloud-box' }, head,
    h('p', { class: 'muted' }, 'Para cargar o cambiar datos, entrá como administrador.'),
    h('form', {
      class: 'stack', onsubmit: async (e) => {
        e.preventDefault(); err.textContent = '';
        try { await cloud.signInWithPassword(email.value, pass.value); toast('👑 Entraste como administrador.'); close(); } catch (ex) { err.textContent = ex.message; }
      },
    }, email, pass, err, h('button', { type: 'submit' }, 'Entrar')),
    h('details', { class: 'face-group' }, h('summary', {}, '¿Todavía no tenés contraseña?'),
      h('p', { class: 'muted small-note' }, 'Pedí un link al mail y abrilo en este mismo navegador. Ya adentro, creá la contraseña acá mismo.'),
      h('button', { class: 'ghost', onclick: async (e) => {
        err.textContent = '';
        e.currentTarget.disabled = true;
        try { await cloud.signInWithEmail(email.value); toast('📧 Listo: revisá tu mail y tocá el link.'); } catch (ex) { err.textContent = ex.message; }
        e.currentTarget.disabled = false;
      } }, 'Enviar link a mi email')));
}
