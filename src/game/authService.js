import { GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut } from 'firebase/auth'
import { auth } from '../firebase'

export function watchUser(callback) {
  return onAuthStateChanged(auth, callback)
}

export function loginWithGoogle() {
  return signInWithPopup(auth, new GoogleAuthProvider())
}

export function playAsGuest() {
  return signInAnonymously(auth)
}

export function logout() {
  return signOut(auth)
}