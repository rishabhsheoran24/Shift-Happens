import { useEffect, useState } from 'react'
import { signInAnonymously } from 'firebase/auth'
import { auth } from '../firebase'
import { createMatch, joinMatch } from '../game/matchService'
import Match from '../components/Match'

const fakeCards = Array.from({ length: 10 }, (_, i) => ({
  id: `card${i + 1}`,
  title: `Card ${i + 1}`,
    type: ['meme', 'audio', 'video'][i % 3],
  url: `https://placehold.co/300x200?text=Card+${i + 1}`,
  cost: 2,
  uploadedBy: 'test',
}))

export default function GameSandbox() {
  const [uid, setUid] = useState(null)
  const [inRoom, setInRoom] = useState(false)
  const [laugh, setLaugh] = useState(0)
  const roomCode = 'TEST'

  useEffect(() => {
    signInAnonymously(auth).then((cred) => setUid(cred.user.uid))
  }, [])

  async function handleCreate() {
    await createMatch(roomCode, uid)
    setInRoom(true)
  }

  async function handleJoin() {
    await joinMatch(roomCode, uid)
    setInRoom(true)
  }

  if (!uid) return <p>Signing in...</p>

  return (
    <div style={{ padding: 16 }}>
      <p>My uid: {uid}</p>
      {!inRoom && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleCreate}>Create room TEST</button>
          <button onClick={handleJoin}>Join room TEST</button>
        </div>
      )}
      {inRoom && (
        <>
          <Match roomCode={roomCode} uid={uid} deckCards={fakeCards} laughScore={laugh} />
          <p>Fake laugh slider: {laugh}</p>
          <input type="range" min="0" max="100" value={laugh} onChange={(e) => setLaugh(Number(e.target.value))} />
        </>
      )}
    </div>
  )
}