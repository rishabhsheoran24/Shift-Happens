export const MAX_HP = 100
export const LAUGH_DEADZONE = 15       // laughs weaker than this are ignored
export const DAMAGE_PER_SECOND = 10    // base number the damage formulas start from
export const MATCH_SECONDS = 180
export const OVERTIME_SECONDS = 30

// --- anti-cheat settings (from the previous fix) ---
export const NO_FACE_GRACE_MS = 1500
export const NO_FACE_DAMAGE_PER_SECOND = 5
export const FORFEIT_AFTER_MS = 10000

// --- NEW: card-battle settings ---
export const ALERT_SECONDS = 2         // warning time before an attack card appears
export const PICK_SECONDS = 60         // deck-building time
// Balance knobs (change these while playtesting):
export const PASSIVE_SCALE = 0.25      // laughing at nothing hurts only a little
export const CARD_SCALE = 0.5          // laughing at an attack card hurts a lot (x card multiplier)
export const SHIELD_SECONDS = 10       // how long a shield lasts
export const STALE_MS = 20000          // unlock cards if the opponent's attack never finishes