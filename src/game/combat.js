// All the "maths" of the card battle lives here, away from the screen code,
// so it is easy to read and easy to test.
import { multiplierOf } from './cardCost'
import { DAMAGE_PER_SECOND, PASSIVE_SCALE, CARD_SCALE } from './constants'

export const SHIELD_EMOJI = { block: '🕶️', halve: '☂️' }

// HP lost per second when you laugh WITHOUT an attack card on your screen.
export function passiveDps(laugh) {
  return (laugh / 100) * DAMAGE_PER_SECOND * PASSIVE_SCALE
}

// HP lost per second while an attack card is on your screen.
// laugh level x card multiplier (x 0.5 if you used a "halve" shield).
export function cardDps(laugh, card, shield) {
  const full = (laugh / 100) * DAMAGE_PER_SECOND * CARD_SCALE * multiplierOf(card)
  return shield === 'halve' ? full * 0.5 : full
}

// Points = total damage each player's attack cards have caused.
// The VICTIM reports the damage ("hit" entry), the attacker gets the points.
export function scoresFromPlays(plays = []) {
  const scores = {}
  for (const p of plays) {
    if (p.kind === 'hit' && p.attackerId) {
      scores[p.attackerId] = (scores[p.attackerId] || 0) + (p.damage || 0)
    }
  }
  return scores
}

// Attacks that have not been answered by a "hit" report yet.
export function unresolvedAttacks(plays = []) {
  const done = new Set(plays.filter((p) => p.kind === 'hit').map((p) => p.attackId))
  return plays.filter((p) => p.kind === 'attack' && !done.has(p.playId))
}
