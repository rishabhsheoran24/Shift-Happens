import { useCallback, useEffect, useRef, useState } from 'react'
import { useElixir } from '../game/useElixir'
import { subscribeToMatch, playCardInMatch, addPlay, saveResult } from '../game/matchService'
import { saveHp } from '../game/hpService'
import { costOf, isSafeUrl, hitSeconds, multiplierOf, typeLabel } from '../game/cardCost'
import { passiveDps, cardDps, scoresFromPlays, unresolvedAttacks, SHIELD_EMOJI } from '../game/combat'
import { recordResult } from '../game/leaderboardService'
import {
  MAX_HP,
  LAUGH_DEADZONE,
  MATCH_SECONDS,
  OVERTIME_SECONDS,
  NO_FACE_DAMAGE_PER_SECOND,
  FORFEIT_AFTER_MS,
} from '../game/constants'

const SHIELD_SECONDS = 10
// If an attack never gets answered (opponent crashed), unlock the cards after this long.
const STALE_MS = 20 * 1000

function HpBar({ label, hp }) {
  const pct = Math.max(0, Math.min(100, (hp / MAX_HP) * 100))
  return (
    <div style={{ margin: '8px 0' }}>
      <div>{label}: {Math.round(hp)} / {MAX_HP}</div>
      <div className="hp-track">
        <div className="hp-fill" style={{ width: `${pct}%`, background: pct > 30 ? '#5aa02c' : '#c0392b' }} />
      </div>
    </div>
  )
}

// A tiny self-updating "10... 9..." number.
function Countdown({ until }) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    const update = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    update()
    const t = setInterval(update, 200)
    return () => clearInterval(t)
  }, [until])
  return <b>{left}</b>
}

// Shows one card (photo / gif / video / audio). Videos keep their sound.
// If the browser refuses to start sound by itself, the video plays muted
// and a "Tap to play with sound" button appears.
function CardMedia({ card }) {
  const ref = useRef(null)
  const [failed, setFailed] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || (card.type !== 'video' && card.type !== 'audio')) return
    const p = el.play()
    if (p && p.catch) {
      p.catch(() => {
        if (card.type === 'video') {
          el.muted = true
          el.play().catch(() => {})
        }
        setNeedsTap(true)
      })
    }
  }, [card.url, card.type])

  function tapToPlay() {
    const el = ref.current
    if (!el) return
    el.muted = false
    el.play()
      .then(() => setNeedsTap(false))
      .catch(() => {})
  }

  if (failed) return <p>⚠️ Could not load this card: {card.url}</p>

  const tapButton = needsTap && <button onClick={tapToPlay}>🔊 Tap to play with sound</button>

  if (card.type === 'video') {
    return (
      <div>
        <video
          ref={ref}
          src={card.url}
          autoPlay
          loop
          playsInline
          width="300"
          onError={() => setFailed(true)}
        />
        <div>{tapButton}</div>
      </div>
    )
  }

  if (card.type === 'audio') {
    return (
      <div>
        <p>🎵 {card.title}</p>
        <audio ref={ref} src={card.url} autoPlay controls onError={() => setFailed(true)} />
        <div>{tapButton}</div>
      </div>
    )
  }

  return <img src={card.url} alt={card.title} width="300" onError={() => setFailed(true)} />
}

function FeedVideo({ stream, muted = false, mirror = false }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null
  }, [stream])
  return <video ref={ref} autoPlay playsInline muted={muted} style={{ transform: mirror ? 'scaleX(-1)' : 'none' }} />
}
export default function Match({
  roomCode,
  uid,
  deckCards,
  laughScore,
  faceVisible = true,
  opponentLeft = false,
  onOverlay,
  onPlayAgain,
  onBackToLobby,
  rematchWaiting = false,
    localStream = null,
  remoteStream = null,
  opponentWantsRematch = false,
}) {
  const [match, setMatch] = useState(null)
  const [usedIds, setUsedIds] = useState([])
  const [myHp, setMyHp] = useState(MAX_HP)
  const [timeLeft, setTimeLeft] = useState(MATCH_SECONDS)
  const [phase, setPhase] = useState('playing') // 'playing' | 'overtime'
  const [current, setCurrentUi] = useState(null) // attack currently on MY screen: { attack, until }
  const [myShield, setMyShieldUi] = useState(null) // my active shield: { effect, until }
  const [staleIds, setStaleIds] = useState([])
  const [notice, setNotice] = useState('')
    const [cardPage, setCardPage] = useState(0)
  const { elixir, spend } = useElixir()

  const laughRef = useRef(laughScore)
  const faceRef = useRef(faceVisible)
  const hpRef = useRef(MAX_HP)
  const overRef = useRef(false)
  const endAtRef = useRef(Date.now() + MATCH_SECONDS * 1000)
  const proposedRef = useRef(false)
  const seenPlaysRef = useRef(null)

  const currentRef = useRef(null)
  const shieldRef = useRef(null)
  const queueRef = useRef([]) // attacks waiting for their turn
  const hitDamageRef = useRef(0) // damage taken during the current attack
  const hitShieldRef = useRef(null) // which shield helped during the current attack
  const noticeTimerRef = useRef(null)

  const setCurrent = useCallback((value) => {
    currentRef.current = value
    setCurrentUi(value)
  }, [])

  const setMyShield = useCallback((value) => {
    shieldRef.current = value
    setMyShieldUi(value)
  }, [])

  const showNotice = useCallback((text) => {
    setNotice(text)
    clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setNotice(''), 4000)
  }, [])

  useEffect(() => {
    return subscribeToMatch(roomCode, setMatch)
  }, [roomCode])

  const opponentId = match?.playerIds?.find((id) => id !== uid)
  const opponentHp = match?.hp?.[opponentId] ?? MAX_HP
  const result = match?.result
  const over = !!result
  const outcome = !result ? null : result.winner === 'tie' ? 'tie' : result.winner === uid ? 'win' : 'lose'

  useEffect(() => {
    laughRef.current = laughScore
    faceRef.current = faceVisible
    overRef.current = over
  })

  // ---------------- damage loop ----------------
  // Every 0.2 s: work out how much HP I lose.
  //  - face hidden / tab hidden  -> fixed penalty
  //  - attack card on my screen  -> laugh x card multiplier (shield: block = 0, halve = x0.5)
  //  - otherwise                 -> small "passive" damage
  useEffect(() => {
    let last = performance.now()
    const tick = setInterval(() => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      if (overRef.current || hpRef.current <= 0) return

      const laugh = laughRef.current
      const c = currentRef.current
      const s = shieldRef.current
      const shieldOn = s && Date.now() < s.until ? s.effect : null
      let damage = 0
      if (document.hidden || !faceRef.current) {
        damage = NO_FACE_DAMAGE_PER_SECOND * dt
      } else if (laugh > LAUGH_DEADZONE) {
        if (c) {
          let dps = cardDps(laugh, c.attack.card, null)
          if (shieldOn === 'block') dps = 0
          else if (shieldOn === 'halve') dps *= 0.5
          if (shieldOn) hitShieldRef.current = shieldOn
          damage = dps * dt
          hitDamageRef.current += Math.min(damage, hpRef.current)
        } else {
          damage = passiveDps(laugh) * dt
        }
      }
      if (damage > 0) {
        hpRef.current = Math.max(0, hpRef.current - damage)
        setMyHp(hpRef.current)
      }
    }, 200)
    return () => clearInterval(tick)
  }, [])

  // save my HP to the database (only when the rounded number changed)
  useEffect(() => {
    let last = MAX_HP
    const save = setInterval(() => {
      const rounded = Math.round(hpRef.current)
      if (rounded !== last) {
        last = rounded
        saveHp(roomCode, uid, rounded).catch(console.error)
      }
    }, 500)
    return () => clearInterval(save)
  }, [roomCode, uid])

  // ---------------- attack flow ----------------
  // Take the next waiting attack and show it right away (no warning).
  const startNext = useCallback(() => {
    if (currentRef.current || overRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    hitDamageRef.current = 0
    hitShieldRef.current = null
    setCurrent({ attack: next, until: Date.now() + hitSeconds(next.card) * 1000 })
  }, [setCurrent])

  // The attack is finished: tell the attacker how much damage it did (their points).
  // The report does NOT say whether a shield was used.
  const finishCurrent = useCallback(
    (c, damage) => {
      const dealt = Math.round(damage * 10) / 10
      const shield = hitShieldRef.current
      hitDamageRef.current = 0
      hitShieldRef.current = null
      addPlay(roomCode, uid, {
        kind: 'hit',
        attackId: c.attack.playId,
        attackerId: c.attack.playedBy,
        damage: dealt,
      }).catch(console.error)
      if (shield === 'block' && dealt === 0) showNotice('🕶️ Blocked! You took no damage.')
      else if (dealt > 0) showNotice(`😂 That attack cost you ${Math.round(dealt)} HP.`)
      else showNotice('😐 Poker face! No damage.')
      setCurrent(null)
      startNext()
    },
    [roomCode, uid, setCurrent, startNext, showNotice]
  )

  // Checks every 0.1 s whether the attack on my screen has run out of time.
  useEffect(() => {
    const t = setInterval(() => {
      if (overRef.current) return
      const c = currentRef.current
      if (!c) {
        startNext()
        return
      }
      if (Date.now() >= c.until) finishCurrent(c, hitDamageRef.current)
    }, 100)
    return () => clearInterval(t)
  }, [startNext, finishCurrent])

  // Look at every NEW entry in the shared "plays" list (shields are never shared).
  const plays = match?.plays
  useEffect(() => {
    if (!plays) return
    if (seenPlaysRef.current === null) {
      seenPlaysRef.current = new Set(plays.map((p) => p.playId)) // old news
      return
    }
    const fresh = plays.filter((p) => !seenPlaysRef.current.has(p.playId))
    if (fresh.length === 0) return
    fresh.forEach((p) => seenPlaysRef.current.add(p.playId))

    fresh.forEach((p) => {
      if (p.kind === 'attack') {
                setTimeout(() => setStaleIds((s) => [...s, p.playId]), Math.max(STALE_MS, hitSeconds(p.card) * 1000 + 10000))
        if (p.playedBy !== uid) queueRef.current.push(p) // an attack aimed at me
      }
    })
    startNext()
  }, [plays, uid, startNext])

  // ---------------- clock ----------------
  useEffect(() => {
    if (over) return
    const t = setInterval(() => {
      setTimeLeft(Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000)))
    }, 250)
    return () => clearInterval(t)
  }, [phase, over])

  // ---------------- official result ----------------
  const propose = useCallback(
    (winner) => {
      if (proposedRef.current) return
      proposedRef.current = true
      saveResult(roomCode, winner).catch((e) => {
        console.error(e)
        proposedRef.current = false
      })
    },
    [roomCode]
  )

  useEffect(() => {
    if (over || !opponentId) return
    const mine = Math.round(myHp)
    const theirs = Math.round(opponentHp)
    if (mine <= 0 && theirs <= 0) return propose('tie')
    if (mine <= 0) return propose(opponentId)
    if (theirs <= 0) return propose(uid)
    if (timeLeft === 0) {
      if (mine > theirs) return propose(uid)
      if (mine < theirs) return propose(opponentId)
      if (phase === 'playing') {
        endAtRef.current = Date.now() + OVERTIME_SECONDS * 1000
        setPhase('overtime')
        setTimeLeft(OVERTIME_SECONDS)
      } else {
        propose('tie')
      }
    }
  }, [myHp, opponentHp, timeLeft, phase, over, opponentId, uid, propose])

  useEffect(() => {
    if (!opponentLeft || over || !opponentId) return
    const t = setTimeout(() => propose(uid), FORFEIT_AFTER_MS)
    return () => clearTimeout(t)
  }, [opponentLeft, over, opponentId, uid, propose])

  useEffect(() => {
    if (over) return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [over])

  // ---------------- playing cards ----------------
  const allPlays = plays ?? []
  const scores = scoresFromPlays(allPlays)
  const myScore = Math.round(scores[uid] ?? 0)
  const theirScore = Math.round(scores[opponentId] ?? 0)

  useEffect(() => {
    if (!outcome) return
    recordResult(roomCode, outcome, myScore).catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome])

  // I can't play a card while MY attack is still on their screen or MY shield is active.
  const myAttackOpen = unresolvedAttacks(allPlays).some((a) => a.playedBy === uid && !staleIds.includes(a.playId))
  const busy = myAttackOpen || !!myShield

    function handleAttack(card) {
    if (over || busy || usedIds.includes(card.id)) return
    if (!spend(costOf(card))) return
    setUsedIds((u) => [...u, card.id])
    const cleanCard = JSON.parse(JSON.stringify(card))
    playCardInMatch(roomCode, uid, cleanCard).catch((e) => {
      console.error(e)
      setUsedIds((u) => u.filter((id) => id !== card.id))
      showNotice('⚠️ That card could not be sent: ' + e.message)
    })
  }
  // A shield only works on MY device. Nothing about it is written to the shared match,
  // so the opponent can't see it.
  function handleShield(card) {
    if (over || busy || usedIds.includes(card.id)) return
    if (!spend(costOf(card))) return
    setUsedIds((u) => [...u, card.id])
    const shield = { effect: card.effect, until: Date.now() + SHIELD_SECONDS * 1000 }
    setMyShield(shield)
    onOverlay?.('me', SHIELD_EMOJI[card.effect] ?? '🛡️')
    setTimeout(() => {
      if (shieldRef.current === shield) setMyShield(null)
      onOverlay?.('me', null)
    }, SHIELD_SECONDS * 1000)
  }

  function renderCard(card) {
    if (!isSafeUrl(card.url)) return <p>⚠️ Card blocked (untrusted link)</p>
    return <CardMedia key={card.id + card.url} card={card} />
  }

  // What the ATTACKER sees about their latest attack (no mention of shields)
  const myAttacks = allPlays.filter((p) => p.kind === 'attack' && p.playedBy === uid)
  const myLast = myAttacks[myAttacks.length - 1]
  const myLastHit = myLast && allPlays.find((p) => p.kind === 'hit' && p.attackId === myLast.playId)
  let attackerBanner = ''
  if (myLast && !myLastHit) {
    attackerBanner = `Your ${typeLabel(myLast.card)} is on their screen right now...`
  } else if (myLastHit) {
    const pts = Math.round(myLastHit.damage)
    attackerBanner = pts > 0 ? `🎯 Your attack landed! +${pts} points` : '😐 No damage. 0 points.'
  }

  const minutes = Math.floor(timeLeft / 60)
  const seconds = String(timeLeft % 60).padStart(2, '0')

  
  const myPct = Math.max(0, Math.min(100, (myHp / MAX_HP) * 100))
  const oppPct = Math.max(0, Math.min(100, (opponentHp / MAX_HP) * 100))
  const pageCount = Math.max(1, Math.ceil(deckCards.length / 5))
  const visibleCards = deckCards.slice(cardPage * 5, cardPage * 5 + 5)

  const thumb = (card) => {
    if (card.type === 'shield') return <div className="emoji">{SHIELD_EMOJI[card.effect] ?? '🛡️'}</div>
    if (card.type === 'audio') return <div className="emoji">🎵</div>
    if (!isSafeUrl(card.url)) return <div className="emoji">❓</div>
    if (card.type === 'video') return <video src={card.url} muted preload="metadata" />
    return <img src={card.url} alt="" />
  }

  return (
    <main className="arena scene">
      <div className="top-hud">
        <div className="timer">
          <small>{phase === 'overtime' ? 'OVERTIME' : 'ROUND 1'}</small>
          <b>{String(minutes).padStart(2, '0')}:{seconds}</b>
        </div>
      </div>

              {!over && current && (
        <div className="attack-screen">
          <div className="meme">{renderCard(current.attack.card)}</div>
        </div>
      )}
      <div className="hud-messages">
        {!over && !faceVisible && <p>⚠️ We can't see your face! Your composure is draining.</p>}
        {!over && opponentLeft && <p>Opponent disconnected... you win if they don't return.</p>}
        {!over && myShield && (
          <p>{SHIELD_EMOJI[myShield.effect]} Shield active for <Countdown until={myShield.until} /> s</p>
        )}
        {notice && <p>{notice}</p>}
        {attackerBanner && <p>{attackerBanner}</p>}
        {!over && busy && !myShield && <p>⏳ Your card is still active.</p>}
        {!over && <p>😂 Laugh meter: {Math.round(laughScore)}</p>}
      </div>

      <section className="battlefield">
        <article className="fighter blue">
          <div className="hp"><i style={{ height: `${myPct}%` }} /><b>{Math.round(myHp)} HP</b></div>
          <div className="screen-frame blue-frame">
            <div className="video-feed blue-feed">
              <FeedVideo stream={localStream} muted mirror />
              {!over && myShield && <div className="shield-badge">{SHIELD_EMOJI[myShield.effect]}</div>}
            </div>
            <div className="wood-grain" />
          </div>
          <div className="score-stone"><small>SCORE</small><b>{myScore}</b></div>
        </article>

        <div className="versus"><span>VS</span><i /></div>

        <article className="fighter red">
          <div className="hp"><i style={{ height: `${oppPct}%` }} /><b className="opponent-hp-label">{Math.round(opponentHp)} HP</b></div>
          <div className="screen-frame red-frame">
            <div className="video-feed red-feed">
              <FeedVideo stream={remoteStream} muted />
            </div>
            <div className="wood-grain" />
          </div>
          <div className="score-stone"><small>SCORE</small><b>{theirScore}</b></div>
        </article>
      </section>

      <section className="deck-zone">
        <div className="elixir">
          <div className="flask"><i style={{ height: `${Math.min(100, Math.floor(elixir) * 10)}%` }} /></div>
          <div><small>ELIXIR</small><b>{Math.floor(elixir)}<span>/10</span></b></div>
        </div>
        <div className="deck-controls">
          <button className="deck-arrow up" onClick={() => setCardPage((p) => Math.min(pageCount - 1, p + 1))} disabled={cardPage >= pageCount - 1} aria-label="Show next five cards">⌃</button>
          <button className="deck-arrow down" onClick={() => setCardPage((p) => Math.max(0, p - 1))} disabled={cardPage === 0} aria-label="Show previous five cards">⌄</button>
        </div>
        <div className={`card-rack page-${cardPage}`}>
          {visibleCards.map((card, i) => {
            const used = usedIds.includes(card.id)
            const isShield = card.type === 'shield'
            const disabled = over || used || elixir < costOf(card) || busy
            return (
              <button
                key={card.id}
                className={`battle-card ${used ? 'used' : ''}`}
                onClick={() => (isShield ? handleShield(card) : handleAttack(card))}
                disabled={disabled}
                style={{ '--tone': isShield ? '#4c7fb5' : '#c0923d', '--i': i }}
              >
                <span className="cost">{costOf(card)}</span>
                <div className="card-art">{thumb(card)}</div>
                <strong>{card.title}</strong>
                <small>{isShield ? `shield · ${card.effect} · ${SHIELD_SECONDS}s` : `${card.type} · x${multiplierOf(card)}`}</small>
              </button>
            )
          })}
        </div>
      </section>

          {over && (
        <div className="result-overlay">
          <section className="results-board">
            <span className="eyebrow">MATCH COMPLETE</span>
            <h1>{outcome === 'win' ? 'VICTORY' : outcome === 'lose' ? 'DEFEAT' : 'TIE'}</h1>
            <p className="result-copy">
              {outcome === 'win' ? 'You kept the straightest face in the arena.' : outcome === 'lose' ? 'You laughed first. Better luck next time.' : 'Evenly matched. Nobody blinked.'}
            </p>
            <div className="score-table">
              <div className="score-row head"><span>PLAYER</span><span>HP LEFT</span><span>SCORE</span></div>
              <div className="score-row me"><span>You</span><span>{Math.round(myHp)}</span><span>{myScore}</span></div>
              <div className="score-row"><span>Rival</span><span>{Math.round(opponentHp)}</span><span>{theirScore}</span></div>
            </div>
            {opponentLeft && <p>Your opponent left the room.</p>}
            <div className="result-question">
              <h2>WHAT'S YOUR NEXT MOVE?</h2>
              <div>
                <button className="stone-button gold" onClick={onPlayAgain} disabled={rematchWaiting || opponentLeft}>
                  <span>
                    {rematchWaiting
                      ? 'Waiting for your opponent...'
                      : opponentWantsRematch
                        ? 'Opponent wants a rematch: Play again'
                        : 'PLAY AGAIN'}
                  </span>
                </button>
                <button className="stone-button red" onClick={onBackToLobby}><span>RETURN TO LOBBY</span></button>
              </div>
            </div>
          </section>
        </div>
      )}  
    </main>
  )
}