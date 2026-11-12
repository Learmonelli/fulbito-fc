// Une la nube con la app: al abrir baja la liga del link, escucha cambios en vivo, sube lo que
// cargan sus administradores y deja la app en "solo lectura" para el resto.
import { store, emptyState } from './store.js';
import { createCloud, DEFAULT_CONFIG, checkConfig } from './cloud.js';
import { leagueIdFromUrl, MAIN } from './league.js';

export function makeCloudSync({ cloud = createCloud(), config = DEFAULT_CONFIG, leagueId = leagueIdFromUrl() } = {}) {
  const configured = checkConfig(config).ok;
  let remoteEmpty = false;
  let missing = false; // el link apunta a una liga que no existe
  const updateLock = () => store.setLocked(configured && !cloud.canEdit());

  store.onCommit(() => { if (configured && cloud.canEdit()) cloud.push(store.snapshot()); });
  cloud.onAuth(updateLock);
  cloud.onLeague(updateLock);

  return {
    cloud,
    configured,
    leagueId,
    remoteEmpty: () => remoteEmpty,
    missing: () => missing,

    // Conectar al abrir la app. Sin proyecto configurado no hace nada (la app sigue local).
    async start() {
      if (!configured) return false;
      updateLock(); // hasta saber quién es, nadie edita
      try {
        const remote = await cloud.connect(config, { leagueId, onRemote: (d) => store.replaceFromCloud(d) });
        missing = leagueId !== MAIN && !cloud.league()?.exists;
        remoteEmpty = !remote;
        if (remote) store.replaceFromCloud(remote);
        else if (cloud.league()?.exists) store.replaceFromCloud(emptyState()); // liga nueva: arranca vacía
        updateLock();
        return true;
      } catch {
        updateLock();
        return false;
      }
    },

    // Un admin publica lo que tiene en este navegador (por ejemplo, la primera vez).
    async publishLocal() {
      if (!cloud.canEdit()) throw new Error('Solo los administradores de esta liga pueden subir datos.');
      cloud.push(store.snapshot());
      await cloud.flushNow();
      if (cloud.status() === 'error') throw new Error(cloud.detail());
      remoteEmpty = false;
    },

    async createLeague(name) {
      return cloud.createLeague(name, emptyState());
    },
  };
}
