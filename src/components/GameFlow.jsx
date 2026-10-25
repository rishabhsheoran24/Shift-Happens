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

const RULES = [
  ['Pick your deck', 'Choose 10 cards in 60 seconds. Empty slots are filled randomly.'],
  ['Elixir', 'You start with 5 elixir and gain 1 every 5 seconds, up to 10.'],
  ['Attack', 'Play a card to make it appear on the centre banner of your rival. Photo 2, GIF 3, audio 3, video 4 elixir.'],
  ['Card length', 'Photos stay 3 seconds. GIFs, audio and videos play for their full length.'],
  ['Do not laugh', 'Your rival laughing at your card costs them HP, and you score the damage you cause.'],
  ['Shields', 'Sunglasses block and Umbrella halves damage for 10 seconds. Your rival cannot see them.'],
  ['Cards', 'Use the arrows to see more of your cards.'],
  ['Stay in frame', 'A hidden face costs HP. If your rival is gone for 10 seconds, you win.'],
  ['Win', 'The match lasts 3 minutes. Lower HP loses. Equal HP means 30 seconds of overtime.'],
]
function StoneButton({ children, variant = 'gold', onClick, disabled = false }) {
  return (
    <button className={`stone-button ${variant}`} onClick={onClick} disabled={disabled}>
      <span>{children}</span>
    </button>
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
    const [modal, setModal] = useState(null) // 'help' | 'board' | null
  const [phase, setPhase] = useState('lobby')
  const [deck, setDeck] = useState(null)
  const [messages, setMessages] = useState([])
    const [rematch, setRematch] = useState('none')
  const [oppRematch, setOppRematch] = useState(false)
  const [overlays, setOverlays] = useState({ me: null, opp: null })   // NEW: shield emojis on the tiles
  const createdRef = useRef(false)
  const startTriedRef = useRef(false)   // NEW: only try to start the match once

  const camera = useLocalCamera()
    const room = usePeerRoom({
    localStream: camera.stream,
        onMessage: (d) => {
      if (!d) return
      if (d.type === 'chat' && typeof d.text === 'string') {
        setMessages((m) => [...m.slice(-49), { from: 'them', text: d.text.slice(0, 200) }])
      }
      if (d.type === 'rematch-request') setOppRematch(true)
      if (d.type === 'rematch-go' && typeof d.code === 'string') joinRematch(d.code)
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

      function enterNewMatch(code) {
    setActiveCode(code)
    setDeck(null)
    setOverlays({ me: null, opp: null })
    setRematch('none')
    setOppRematch(false)
    startTriedRef.current = false
    setPhase('pick')
  }

  async function startRematch() {
    const [base, round] = activeCode.split('-')
    const code = `${base}-${(Number(round) || 1) + 1}`
    try {
      await createMatch(code, uid)
      room.send({ type: 'rematch-go', code })
      enterNewMatch(code)
    } catch (e) {
      setError(e.message)
    }
  }

  async function joinRematch(code) {
    try {
      await joinMatch(code, uid)
      enterNewMatch(code)
    } catch (e) {
      setError('Could not start the rematch: ' + e.message)
    }
  }

  function handlePlayAgain() {
    setRematch('waiting')
    room.send({ type: 'rematch-request' })
  }

  function backToLobby() {
    room.leave()
    createdRef.current = false
    startTriedRef.current = false
    setRole(null)
    setActiveCode(null)
    setDeck(null)
    setMessages([])
    setOverlays({ me: null, opp: null })
    setRematch('none')
    setOppRematch(false)
    setError('')
    setPhase('lobby')
  }

  useEffect(() => {
    if (role === 'host' && rematch === 'waiting' && oppRematch) startRematch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, rematch, oppRematch])
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
      <div className="game-row">
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
            onOverlay={handleOverlay}  
            onPlayAgain={handlePlayAgain}
            localStream={camera.stream}
            remoteStream={room.remoteStream}
            onBackToLobby={backToLobby}
            rematchWaiting={rematch === 'waiting'}
            opponentWantsRematch={oppRematch}                        // NEW
          />
        )}
      </div>
    )
  }

    return (
    <main className="lobby scene">
      <div className="vignette" />
      <section className="lobby-panel" aria-label="Enter the arena">
        <div className="panel-rivet r1" /><div className="panel-rivet r2" />
        <header className="logo-lockup">
          <span className="eyebrow">THE ULTIMATE NO-LAUGH DUEL</span>
          <h1>POKER FACE<br /><b>ARENA</b></h1>
        </header>

        <div className="setup-grid">
          <div className="setup-step">
            <div className="step-title"><span>1</span> Choose your fighter</div>
            {!authReady && <p>Loading...</p>}
            {authReady && !user && (
              <>
                <button className="identity-card" onClick={() => loginWithGoogle().catch((e) => setError(e.message))}>
                  <span className="avatar">G</span>
                  <span><strong>Sign in with Google</strong><small>Save your rank and wins</small></span>
                  <span className="check">G</span>
                </button>
                <div className="or"><i />OR<i /></div>
                <button className="identity-card" onClick={() => playAsGuest().catch((e) => setError(e.message))}>
                  <span className="avatar">?</span>
                  <span><strong>Play as guest</strong><small>Not on the leaderboard</small></span>
                  <span className="check">→</span>
                </button>
              </>
            )}
            {user && (
              <>
                <div className="identity-card active">
                  <span className="avatar">{(user.isAnonymous ? 'G' : (user.displayName || 'P')).slice(0, 1).toUpperCase()}</span>
                  <span><strong>{user.isAnonymous ? 'Guest' : user.displayName}</strong><small>Ready for battle</small></span>
                  <span className="check">✓</span>
                </div>
                <StoneButton variant="stone" onClick={logout}>LOG OUT</StoneButton>
              </>
            )}
          </div>

          <div className="setup-step">
            <div className="step-title"><span>2</span> Ready your camera</div>
            <button className={`camera-preview ${camera.stream ? 'active' : ''}`} onClick={camera.start} disabled={!!camera.stream}>
              <div className="camera-person"><i /><b /></div>
              <span>{camera.stream ? 'Camera ready' : 'Enable camera'}</span>
              <small>{camera.stream ? laughText : 'Video stays peer-to-peer'}</small>
            </button>
            {camera.error && <p className="lobby-error">Camera error: {camera.error}</p>}
            <div className="privacy"><span>◆</span> Your face is analysed only on this device.</div>
          </div>
        </div>

        <div className="room-actions">
          <div className="join-box">
            <label>ENTER ROOM CODE</label>
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              placeholder="— — — —"
              maxLength={4}
              aria-label="Four character room code"
            />
            <StoneButton onClick={handleJoin} disabled={!canPlay || codeInput.length < 4}>JOIN</StoneButton>
          </div>
          <div className="divider"><span>OR</span></div>
          <div className="create-box">
            <StoneButton variant="red" onClick={handleCreate} disabled={!canPlay || role === 'host'}>CREATE A ROOM</StoneButton>
            <small>Invite a friend with a private code</small>
          </div>
        </div>

        <div className="lobby-extra">
          {room.roomCode && role === 'host' && <p className="code-big">Share this code: {room.roomCode}</p>}
          <p>Status: {room.status}</p>
          {room.error && <p className="lobby-error">{room.error}</p>}
          {error && <p className="lobby-error">{error}</p>}
          <p style={{ fontSize: 11, opacity: 0.75 }}>
            Privacy: your face is analysed on your own device only. Nothing is recorded or stored. Your video goes directly to your opponent during the call and nowhere else. If you sign in with Google, only your name, profile picture and game stats are saved for the leaderboard (never your email).
          </p>
                    <div className="lobby-links">
            <StoneButton variant="gold" onClick={() => setModal('help')}>HOW TO PLAY</StoneButton>
            <StoneButton variant="stone" onClick={() => setModal('board')} disabled={!user}>LEADERBOARD</StoneButton>
          </div>
        </div>
      </section>
            {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section className="parchment-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setModal(null)} aria-label="Close">×</button>
            {modal === 'help' && (
              <>
                <h2>HOW TO PLAY</h2>
                <ol className="rules-list">
                  {RULES.map(([t, d]) => (
                    <li key={t}><b>{t}</b><span>{d}</span></li>
                  ))}
                </ol>
              </>
            )}
            {modal === 'board' && (
              <>
                <h2>LEADERBOARD</h2>
                <Leaderboard />
              </>
            )}
          </section>
        </div>
      )}
    </main>
  )
}