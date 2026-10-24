import { collection, doc, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../firebase'

// outcome is 'win', 'loss' or 'tie'. Guests (anonymous) are skipped.
export async function recordResult(roomCode, outcome, points) {
  const user = auth.currentUser
  if (!user || user.isAnonymous) return
  const ref = doc(db, 'players', user.uid)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    const old = snap.exists() ? snap.data() : { wins: 0, losses: 0, ties: 0, matches: 0, points: 0 }
    if (old.lastMatch === roomCode) return
    const wins = old.wins + (outcome === 'win' ? 1 : 0)
    const losses = old.losses + (outcome === 'lose' ? 1 : 0)
    const ties = old.ties + (outcome === 'tie' ? 1 : 0)
    tx.set(ref, {
      displayName: (user.displayName || 'Player').slice(0, 40),
      photoURL: user.photoURL || '',
      wins,
      losses,
      ties,
      matches: wins + losses + ties,
      points: old.points + Math.round(points),
      lastMatch: roomCode,
      updatedAt: serverTimestamp(),
    })
  })
}

export function subscribeLeaderboard(callback) {
  const q = query(collection(db, 'players'), orderBy('wins', 'desc'), limit(10))
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      rows.sort((a, b) => b.wins - a.wins || b.points - a.points)
      callback(rows)
    },
    () => callback([])
  )
}