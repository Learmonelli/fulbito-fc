// Une la nube con la app: al abrir baja el documento, escucha cambios en vivo, sube lo que carga el
// admin y deja la app en "solo lectura" para el resto.
import { store } from './store.js';
import { createCloud, DEFAULT_CONFIG, checkConfig } from './cloud.js';

export function makeCloudSync({ cloud = createCloud(), config = DEFAULT_CONFIG } = {}) {
  const configured = checkConfig(config).ok;
  let remoteEmpty = false;
  const updateLock = () => store.setLocked(configured && !cloud.isAdmin());

  store.onCommit(() => { if (configured && cloud.isAdmin()) cloud.push(store.snapshot()); });
  cloud.onAuth(updateLock);

  return {
    cloud,
    configured,
    remoteEmpty: () => remoteEmpty,

    // Conectar al abrir la app. Sin proyecto configurado no hace nada (la app sigue local).
    async start() {
      if (!configured) return false;
      updateLock(); // hasta saber quién es, nadie edita
      try {
        const remote = await cloud.connect(config, { onRemote: (d) => store.replaceFromCloud(d) });
        remoteEmpty = !remote;
        if (remote) store.replaceFromCloud(remote);
        updateLock();
        return true;
      } catch {
        updateLock();
        return false;
      }
    },

    // El admin publica lo que tiene en este navegador (la primera vez, o para pisar la nube).
    async publishLocal() {
      if (!cloud.isAdmin()) throw new Error('Solo el administrador puede subir datos.');
      cloud.push(store.snapshot());
      await cloud.flushNow();
      if (cloud.status() === 'error') throw new Error(cloud.detail());
      remoteEmpty = false;
    },
  };
}
