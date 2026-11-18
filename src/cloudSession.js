// Une la nube (cloud.js) con el estado de la app (store.js) según el link que se abrió:
//   sin ?liga=        -> pantalla de inicio (crear un grupo o entrar con un link)
//   ?liga=<grupo>     -> baja el grupo, escucha los cambios en vivo y sube lo que se carga
//   ?liga=<campeonato> o ?liga=main -> es de Liga FC: se redirige allá
import { createClient } from '@supabase/supabase-js';
import { createCloud, DEFAULT_CONFIG, GROUP_MODE } from './cloud.js';
import { store } from './store.js';
import { toast } from './ui/toast.js';
import { leagueIdFromUrl, ligaFcLink, MAIN } from './league.js';
import { setGroupSettings } from './groupSettings.js';
import { setLeaguePalette } from './theme.js';

export function makeSession({
  cloud = createCloud({ createClient }), notify = toast, leagueId = leagueIdFromUrl(),
  config = DEFAULT_CONFIG, goto = (url) => globalThis.location.replace(url),
} = {}) {
  let phase = 'idle'; // idle | landing | ok | missing | redirect | offline

  // Los ajustes del grupo (nombres de equipos, colores) y quién es admin cambian en vivo.
  const applyLeague = (lg) => {
    if (!lg?.exists) return;
    setGroupSettings(lg.settings || {});
    setLeaguePalette(lg.settings?.palette);
    store.setAdmin(cloud.canEdit());
  };
  cloud.onLeague(applyLeague);
  cloud.onAuth(() => store.setAdmin(cloud.canEdit()));

  const handlers = {
    onRemote: (kind, row, id) => store.applyRemote(kind, row, id),
    onReject: (_kind, _id, msg) => notify(msg, { ms: 8000 }),
  };

  return {
    cloud,
    leagueId,
    phase: () => phase,
    // Conecta según el link. Devuelve la fase en la que quedó la app.
    async start() {
      if (!leagueId) {
        try { await cloud.connect(config, {}); } catch { /* sin conexión: la pantalla de inicio avisa al querer entrar */ }
        phase = 'landing';
        return phase;
      }
      if (leagueId === MAIN) { goto(ligaFcLink(null)); phase = 'redirect'; return phase; }
      try {
        const remote = await cloud.connect(config, { leagueId, ...handlers });
        const lg = cloud.league();
        if (!lg?.exists) { phase = 'missing'; return phase; }
        if (lg.mode !== GROUP_MODE) { goto(ligaFcLink(leagueId)); phase = 'redirect'; return phase; }
        store.attachSync(cloud.adapter, remote); // la nube manda: pasa a ser la fuente de verdad
        applyLeague(lg);
        cloud.listen();
        phase = 'ok';
      } catch (e) {
        notify(`No se pudo conectar con la nube: ${e.message} Se muestran los datos guardados en este celular.`, { ms: 8000 });
        phase = 'offline';
      }
      return phase;
    },
    // Copia completa del grupo (ajustes, jugadores y partidos), para guardar y restaurar.
    backupPayload() {
      const lg = cloud.league();
      const s = store.get();
      return { mode: GROUP_MODE, settings: lg?.settings || {}, players: s.players, matches: s.matches };
    },
  };
}
