const roundFee = amount => Math.round(amount / 50000) * 50000;

export function suggestedOffer(player) {
  const overall = player.ovr ?? 65;
  const potential = player.potential ?? overall;
  const age = player.age ?? 25;
  const development = 1 + Math.max(0, potential - overall) / 45;
  const ageFactor = Math.max(.23, 1.15 - Math.max(0, age - 24) * .082);
  const fee = roundFee(Math.min(250_000_000, Math.max(100_000, 750_000 * Math.exp((overall - 66) / 7) * ageFactor * development)));
  const wage = Math.max(500, Math.round((player.wage > 0 ? player.wage * 1.18 : fee / 850) / 500) * 500);
  return { fee, wage, years: age >= 31 ? 2 : 4 };
}

export function submitOffer(terms, player, kind, teamId, date) {
  if (!player || !Number.isSafeInteger(teamId) || player.teamId === teamId || !['buy', 'sell'].includes(kind)) return null;
  const fee = Number(terms.fee), wage = Number(terms.wage), years = Number(terms.years);
  if (!Number.isSafeInteger(fee) || fee < 0 || fee > 999_000_000 || !Number.isSafeInteger(wage) || wage < 0 || wage > 5_000_000 || !Number.isSafeInteger(years) || years < 1 || years > 7) return null;
  const suggested = suggestedOffer(player);
  const lowWage = kind === 'buy' && wage < suggested.wage * .8;
  const ratio = fee / suggested.fee;
  const rejected = kind === 'buy' ? ratio < .62 : ratio > 1.65;
  const counter = kind === 'buy' ? ratio < .96 || lowWage : ratio > 1.03;
  const status = rejected ? 'rejected' : counter ? 'counter' : 'accepted';
  return { id: crypto.randomUUID(), playerId: player.id, clubId: teamId, originId: player.teamId, kind, date, fee, wage, years, status,
    counterFee: status === 'counter' ? suggested.fee : null, counterWage: status === 'counter' ? Math.max(wage, suggested.wage) : null };
}

export function rosterWithOffers(data, deals) {
  if (!deals.some(deal => deal.status === 'accepted')) return data;
  const adjusted = new Map();
  for (const deal of deals) {
    if (deal.status !== 'accepted') continue;
    adjusted.set(deal.playerId, { teamId: deal.clubId, wage: deal.wage || undefined, originalTeamId: deal.originId });
  }
  return { ...data, players: data.players.map(player => {
    const move = adjusted.get(player.id);
    if (!move || player.teamId !== move.originalTeamId) return player;
    return { ...player, teamId: move.teamId, wage: move.wage ?? player.wage, simulatedTransfer: true };
  }) };
}

export const money = value => Number.isFinite(value) ? `${new Intl.NumberFormat('ru', { maximumFractionDigits: 0 }).format(value)} €` : '—';
