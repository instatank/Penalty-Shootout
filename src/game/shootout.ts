/**
 * shootout.ts — the turn / score state machine for a penalty shootout (Phase 3).
 *
 * PURE and engine-free (no Phaser), so it is trivially testable and reused by
 * every mode: Taker (Phase 3), Keeper (Phase 4) and online (Phase 6) all drive
 * the SAME machine — only who provides each kick's outcome changes.
 *
 * Standard rules: a best-of-`regulationKicks` (5) shootout, sides ALTERNATING
 * (player kick, opponent kick, …). The round ends the moment it is mathematically
 * decided (early clinch), exactly like real football. If level after the
 * regulation kicks, it goes to sudden death: one-for-one rounds until, in a single
 * round, one side scores and the other misses.
 */

export type Side = 'player' | 'opponent';
export type ShootoutPhase = 'regulation' | 'suddenDeath' | 'done';

export interface SideTally {
  taken: number;
  scored: number;
  results: boolean[]; // per-kick scored/missed, in order (for the scoreboard)
}

export interface ShootoutState {
  regulationKicks: number; // kicks per side in regulation (5)
  player: SideTally;
  opponent: SideTally;
  phase: ShootoutPhase;
  next: Side | null; // who kicks next (null once done)
  winner: Side | null; // set when phase === 'done'
}

/** A fresh shootout. The player always kicks first in each round. */
export function createShootout(regulationKicks = 5): ShootoutState {
  return {
    regulationKicks,
    player: { taken: 0, scored: 0, results: [] },
    opponent: { taken: 0, scored: 0, results: [] },
    phase: 'regulation',
    next: 'player',
    winner: null,
  };
}

function finish(s: ShootoutState, winner: Side): ShootoutState {
  return { ...s, phase: 'done', next: null, winner };
}

/**
 * Record the outcome of the NEXT kick (s.next) and advance the machine: applies
 * early-clinch, regulation completion and sudden-death resolution. Returns a new
 * state (does not mutate the input).
 */
export function recordKick(s: ShootoutState, scored: boolean): ShootoutState {
  if (s.phase === 'done' || !s.next) return s;

  const side = s.next;
  const player = { ...s.player, results: [...s.player.results] };
  const opponent = { ...s.opponent, results: [...s.opponent.results] };
  const tally = side === 'player' ? player : opponent;
  tally.taken += 1;
  if (scored) tally.scored += 1;
  tally.results.push(scored);

  const next = { ...s, player, opponent };
  const R = next.regulationKicks;

  if (next.phase === 'regulation') {
    const playerRem = R - player.taken;
    const opponentRem = R - opponent.taken;
    // Early clinch: a side has more than the other can still reach.
    if (player.scored > opponent.scored + opponentRem) return finish(next, 'player');
    if (opponent.scored > player.scored + playerRem) return finish(next, 'opponent');
    // Regulation complete?
    if (player.taken >= R && opponent.taken >= R) {
      if (player.scored !== opponent.scored) {
        return finish(next, player.scored > opponent.scored ? 'player' : 'opponent');
      }
      return { ...next, phase: 'suddenDeath', next: 'player' }; // level → sudden death
    }
    // Otherwise alternate: player leads each round, opponent answers.
    return { ...next, next: player.taken === opponent.taken ? 'player' : 'opponent' };
  }

  // Sudden death: resolve only when both have taken the same number of kicks.
  if (player.taken === opponent.taken) {
    if (player.scored !== opponent.scored) {
      return finish(next, player.scored > opponent.scored ? 'player' : 'opponent');
    }
    return { ...next, next: 'player' }; // still level → another round
  }
  return { ...next, next: 'opponent' };
}

/** The round number to show (1-based). In sudden death it keeps counting up. */
export function currentRound(s: ShootoutState): number {
  return Math.max(s.player.taken, s.opponent.taken) + (s.phase === 'done' ? 0 : 1);
}
