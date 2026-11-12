// Tabla de posiciones. Solo cuentan los partidos con played = true.
// Desempate: puntos, diferencia de gol, goles a favor, nombre.
export function standings(teams, matches) {
  const rows = new Map(
    teams.map((t) => [
      t.id,
      { teamId: t.id, name: t.name, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0 },
    ]),
  );

  for (const m of matches) {
    if (!m.played) continue;
    const h = rows.get(m.homeId);
    const a = rows.get(m.awayId);
    if (!h || !a) continue;
    const hg = Number(m.homeGoals) || 0;
    const ag = Number(m.awayGoals) || 0;
    h.pj++; a.pj++;
    h.gf += hg; h.gc += ag;
    a.gf += ag; a.gc += hg;
    if (hg > ag) { h.pg++; a.pp++; h.pts += 3; }
    else if (hg < ag) { a.pg++; h.pp++; a.pts += 3; }
    else { h.pe++; a.pe++; h.pts++; a.pts++; }
  }

  const table = [...rows.values()];
  for (const r of table) r.dg = r.gf - r.gc;
  table.sort(
    (x, y) =>
      y.pts - x.pts || y.dg - x.dg || y.gf - x.gf || x.name.localeCompare(y.name, 'es'),
  );
  return table;
}
