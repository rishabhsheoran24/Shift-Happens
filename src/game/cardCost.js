// Elixir cost, damage multiplier and "how long the card stays on screen"
// for every card type.
//                photo gif  audio video
const COSTS       = { meme: 2, photo: 2, gif: 3, audio: 3, video: 4 }
const MULTIPLIERS = { meme: 4, photo: 4, gif: 3, audio: 3, video: 2 }
const HIT_SECONDS = { meme: 3, photo: 3, gif: 5, audio: 5, video: 10 }

// Shield cards: "block" cancels an attack, "halve" cuts its damage in half.
export const SHIELD_COSTS = { block: 3, halve: 2 }

export function costOf(card) {
  if (card.type === 'shield') return SHIELD_COSTS[card.effect] ?? 2
  return COSTS[card.type] ?? 2
}

export function multiplierOf(card) {
  return MULTIPLIERS[card.type] ?? 1
}

export function hitSeconds(card) {
  return HIT_SECONDS[card.type] ?? 3
}

// Name shown in the "INCOMING ..." warning (the actual meme stays hidden)
export function typeLabel(card) {
  return (
    { photo: 'IMAGE', meme: 'IMAGE', gif: 'GIF', audio: 'AUDIO', video: 'VIDEO', shield: 'SHIELD' }[card.type] ?? 'MEME'
  )
}

// CHANGED: .gif links are now their own type ("gif") instead of "photo",
// so they get the GIF cost (3) and multiplier (3).
export function typeFromUrl(url) {
  const clean = url.split('?')[0].toLowerCase()
  if (/\.gif$/.test(clean)) return 'gif'
  if (/\.(jpg|jpeg|png|webp)$/.test(clean)) return 'photo'
  if (/\.(mp3|wav|ogg|m4a)$/.test(clean)) return 'audio'
  if (/\.(mp4|webm|mov)$/.test(clean)) return 'video'
  return null
}

// --- only allow links from sites we trust (from the previous fix) ---
const TRUSTED_HOSTS = [
  'placehold.co',
  'imgur.com',
  'giphy.com',
  'tenor.com',
  'wikimedia.org',
  'redd.it',
  'githubusercontent.com',
  'firebasestorage.googleapis.com',
  'interactive-examples.mdn.mozilla.net',
]

export function isSafeUrl(url) {
  if (typeof url === 'string' && url.startsWith(import.meta.env.BASE_URL + 'library/')) return true
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    if (u.username || u.password) return false
    const host = u.hostname.toLowerCase()
    return TRUSTED_HOSTS.some((h) => host === h || host.endsWith('.' + h))
  } catch {
    return false
  }
}
