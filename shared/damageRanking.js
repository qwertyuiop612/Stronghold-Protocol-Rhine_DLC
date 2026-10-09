// HP damage only: elemental gauge buildup is not damage dealt.
export const DAMAGE_TYPES = Object.freeze(['phys', 'arts', 'true', 'elemental']);

/** Bounded, finite type counters for client results and public views. */
export function damageTypes(value) {
  return Object.fromEntries(DAMAGE_TYPES.map((type) => {
    const n = Number(value?.[type]);
    return [type, Number.isFinite(n) ? Math.max(0, Math.min(1e13, n)) : 0];
  }));
}

/** Operators remain in the ranking after death/retreat; copies have separate rows. */
export function damageRanking(units = []) {
  return units.filter((u) => u.kind === 'op').map((u) => {
    const types = damageTypes(u.dmgTypes ?? u.stats?.dmgTypes);
    return { id: u.id ?? u.uid, uid: u.uid, defId: u.defId, name: u.name || u.defId,
      ownerId: u.ownerId, types, total: DAMAGE_TYPES.reduce((sum, type) => sum + types[type], 0) };
  }).sort((a, b) => b.total - a.total || String(a.id).localeCompare(String(b.id)));
}
