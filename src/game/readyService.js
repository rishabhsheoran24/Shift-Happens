import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'

export function markReady(roomCode, uid) {
  return updateDoc(doc(db, 'matches', roomCode), { [`ready.${uid}`]: true })
}