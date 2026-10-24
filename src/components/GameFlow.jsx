import { useCallback, useEffect, useRef, useState } from 'react'
import { watchUser, loginWithGoogle, playAsGuest, logout } from '../game/authService'
import Leaderboard from './Leaderboard'
import { useLocalCamera } from '../useLocalCamera'
import { usePeerRoom } from '../usePeerRoom'
import { useLaughScore } from '../game/useLaughScore'
import { createMatch, joinMatch, subscribeToMatch, startMatchIfNeeded } from '../game/matchService'
import { markReady } from '../game/readyService'
import Match from './Match'
import PickPhase from './PickPhase'
import VideoPanel from '../video/VideoPanel'

// CHANGED: a video tile can now show an emoji "overlay" (e.g. Sunglasses 🕶️ when a shield is active)
function Video({ stream, muted = false, mirror = false, label, overlay = null }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null
  }, [stream])
  return (
    <div style={{ width: 200 }}>
      <div>{label}</div>
      <div style={{ position: 'relative' }}>
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          style={{
            width: '100%',
            height: 150,
            background: '#000',
            borderRadius: 12,
            objectFit: 'cover',
            transform: mirror ? 'scaleX(-1)' : 'none',
            display: 'block',
          }}
        />
        {overlay && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '25%',
              textAlign: 'center',
              fontSize: 64,
              pointerEvents: 'none',
            }}
          >
            {overlay}
          </div>
        )}
      </div>
    </div>
  )
}

export default function GameFlow() {
  const [uid, setUid] = useState(null)
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [role, setRole] = useState(null)
  const [codeInput, setCodeInput] = useState('')
  const [activeCode, setActiveCode] = useState(null)
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('lobby')
  const [deck, setDeck] = useState(null)
    const [messages, setMessages] = useState([])
  const [overlays, setOverlays] = useState({ me: null, opp: null })   // NEW: shield emojis on the tiles
  const createdRef = useRef(false)
  const startTriedRef = useRef(false)   // NEW: only try to start the match once

  const camera = useLocalCamera()
    const room = usePeerRoom({
    localStream: camera.stream,
    onMessage: (d) => {
      if (d && d.type === 'chat' && typeof d.text === 'string') {
        setMessages((m) => [...m.slice(-49), { from: 'them', text: d.text.slice(0, 200) }])
      }
    },
  })
  const laugh = useLaughScore(camera.stream)

    useEffect(() => {
    return watchUser((u) => {
      setUser(u)
      setUid(u ? u.uid : null)
      setAuthReady(true)
    })
  }, [])

  useEffect(() => {
    if (role !== 'host' || !room.roomCode || !uid || createdRef.current) return
    createdRef.current = true
    createMatch(room.roomCode, uid)
      .then(() => setActiveCode(room.roomCode))
      .catch((e) => setError(e.message))
  }, [role, room.roomCode, uid])

  useEffect(() => {
    if (room.status === 'connected' && activeCode && phase === 'lobby') setPhase('pick')
  }, [room.status, activeCode, phase])

  // CHANGED: we no longer jump to the match as soon as we see 2 "ready" flags.
  // Instead, whoever notices both players are ready writes started = true, and
  // BOTH players switch to the match when they see that flag. This makes both
  // screens start at (almost) the same moment, so the timers agree.
  useEffect(() => {
    if (phase !== 'pick' || !activeCode) return
    return subscribeToMatch(activeCode, (m) => {
      if (!m) return
      if (m.started) {
        setPhase('match')
        return
      }
      const readyCount = Object.values(m.ready || {}).filter(Boolean).length
      if (readyCount >= 2 && !startTriedRef.current) {
        startTriedRef.current = true
        // If the other player already wrote it, ours is refused: ignore that.
        startMatchIfNeeded(activeCode).catch(() => {})
      }
    })
  }, [phase, activeCode])

  // NEW: Match calls this to put a shield emoji on a tile (or remove it with null)
  const handleOverlay = useCallback((who, emoji) => {
    setOverlays((o) => ({ ...o, [who]: emoji }))
  }, [])

  function handleCreate() {
    setError('')
    setRole('host')
    room.createRoom()
  }

  async function handleJoin() {
    setError('')
    const code = codeInput.trim().toUpperCase()
    try {
      // joinMatch now throws a clear message: "Room not found", "Room is full", ...
      await joinMatch(code, uid)
      setRole('guest')
      setActiveCode(code)
      room.joinRoom(code)
    } catch (e) {
      setError('Could not join: ' + e.message)
    }
  }

    function sendChat(text) {
    room.send({ type: 'chat', text })
    setMessages((m) => [...m.slice(-49), { from: 'me', text }])
  }
  function handleDeckDone(chosen) {
    setDeck(chosen)
    markReady(activeCode, uid).catch((e) => setError(e.message))
  }

  const canPlay = camera.stream && laugh.status === 'ready' && uid
  const laughText = {
    idle: 'Start your camera first.',
    loading: 'Loading face detector...',
    calibrating: 'Keep a NEUTRAL face for 2 seconds...',
    ready: 'Detector ready.',
    error: 'Detector error (see console).',
  }[laugh.status]

  if (phase === 'pick' || phase === 'match') {
    return (
      <div style={{ display: 'flex', gap: 16, padding: 16, color: '#eee' }}>
                <VideoPanel
          localStream={camera.stream}
          remoteStream={room.remoteStream}
          localOverlay={overlays.me}
          remoteOverlay={overlays.opp}
          messages={messages}
          onSendChat={sendChat}
        />
        {phase === 'pick' && !deck && <PickPhase onDone={handleDeckDone} />}
        {phase === 'pick' && deck && <h2>Deck locked in! Waiting for your opponent...</h2>}
        {phase === 'match' && (
          <Match
            key={activeCode}
            roomCode={activeCode}
            uid={uid}
            deckCards={deck}
            laughScore={laugh.score}
            faceVisible={laugh.faceVisible}                    // NEW
            opponentLeft={room.status === 'disconnected'}      // NEW
            onOverlay={handleOverlay}                          // NEW
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 600, margin: '20px auto', padding: 16, color: '#eee' }}>
      <h2>Poker Face Arena</h2>
            {!authReady && <p>Loading...</p>}
      {authReady && !user && (
        <div>
          <button onClick={() => loginWithGoogle().catch((e) => setError(e.message))}>Sign in with Google</button>{' '}
          <button onClick={() => playAsGuest().catch((e) => setError(e.message))}>Play as guest</button>
        </div>
      )}
      {user && (
        <p>
          Signed in as {user.isAnonymous ? 'Guest' : user.displayName}{' '}
          <button onClick={logout}>Log out</button>
        </p>
      )}

      <button onClick={camera.start} disabled={!!camera.stream}>Start camera</button>
      {camera.error && <p style={{ color: '#f87171' }}>Camera error: {camera.error}</p>}
      <p>{laughText}</p>

      <button onClick={handleCreate} disabled={!canPlay || role === 'host'}>Create room</button>
      {room.roomCode && role === 'host' && (
        <p style={{ fontWeight: 'bold', color: '#facc15' }}>Share this code: {room.roomCode}</p>
      )}

      <p>Or join a friend:</p>
      <input
        value={codeInput}
        onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
        placeholder="CODE"
        maxLength={4}
        style={{ width: 90, marginRight: 8, padding: 8, fontSize: 16 }}
      />
      <button onClick={handleJoin} disabled={!canPlay || codeInput.length < 4}>Join room</button>

      <p>Status: {room.status}</p>
      {/* NEW: show connection problems (e.g. "Room not found. Check the code.") */}
      {room.error && <p style={{ color: '#f87171' }}>{room.error}</p>}
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
            <p style={{ fontSize: 12, opacity: 0.7 }}>
        Privacy: your face is analysed on your own device only. Nothing is recorded or stored. Your video goes directly to your opponent during the call and nowhere else. If you sign in with Google, only your name, profile picture and game stats are saved for the leaderboard (never your email).
      </p>
      {user && <Leaderboard />}
    </div>
  )
}
