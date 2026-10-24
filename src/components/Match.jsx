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
      <div style={{ width: 300, height: 20, background: '#333', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct > 30 ? '#4caf50' : '#f44336' }} />
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

  // The attack is finished: tell the attacker what happened (this is where THEIR points come from).
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
        blocked: shield === 'block',
        halved: shield === 'halve',
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

  // Look at every NEW entry in the shared "plays" list.
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
        setTimeout(() => setStaleIds((s) => [...s, p.playId]), STALE_MS)
        if (p.playedBy !== uid) queueRef.current.push(p) // an attack aimed at me
      }
      if (p.kind === 'shield') {
        const who = p.playedBy === uid ? 'me' : 'opp'
        onOverlay?.(who, SHIELD_EMOJI[p.effect] ?? '🛡️')
        setTimeout(() => onOverlay?.(who, null), SHIELD_SECONDS * 1000)
      }
    })
    startNext()
  }, [plays, uid, startNext, onOverlay])

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
    playCardInMatch(roomCode, uid, card).catch(console.error)
  }

  function handleShield(card) {
    if (over || busy || usedIds.includes(card.id)) return
    if (!spend(costOf(card))) return
    setUsedIds((u) => [...u, card.id])
    const shield = { effect: card.effect, until: Date.now() + SHIELD_SECONDS * 1000 }
    setMyShield(shield)
    setTimeout(() => {
      if (shieldRef.current === shield) setMyShield(null)
    }, SHIELD_SECONDS * 1000)
    addPlay(roomCode, uid, {
      kind: 'shield',
      effect: card.effect,
      title: card.title,
    }).catch(console.error)
  }

  function renderCard(card) {
    if (!isSafeUrl(card.url)) return <p>⚠️ Card blocked (untrusted link)</p>
    if (card.type === 'video') return <video src={card.url} autoPlay muted loop width="300" />
    if (card.type === 'audio') return <audio src={card.url} autoPlay controls />
    return <img src={card.url} alt={card.title} width="300" />
  }

  // What the ATTACKER sees about their latest attack
  const myAttacks = allPlays.filter((p) => p.kind === 'attack' && p.playedBy === uid)
  const myLast = myAttacks[myAttacks.length - 1]
  const myLastHit = myLast && allPlays.find((p) => p.kind === 'hit' && p.attackId === myLast.playId)
  let attackerBanner = ''
  if (myLast && !myLastHit) {
    attackerBanner = `Your ${typeLabel(myLast.card)} is on their screen right now...`
  } else if (myLastHit) {
    const pts = Math.round(myLastHit.damage)
    if (myLastHit.blocked && pts === 0) attackerBanner = '🕶️ Your attack was BLOCKED. 0 points.'
    else if (pts > 0) {
      const tag = myLastHit.blocked ? ' (partly blocked)' : myLastHit.halved ? ' (halved)' : ''
      attackerBanner = `🎯 Your attack landed${tag}! +${pts} points`
    } else attackerBanner = '😐 They kept a poker face. 0 points.'
  }

  const minutes = Math.floor(timeLeft / 60)
  const seconds = String(timeLeft % 60).padStart(2, '0')

  return (
    <div style={{ padding: 16 }}>
      <h3>
        {phase === 'overtime' ? 'OVERTIME! ' : ''}Time: {minutes}:{seconds}
      </h3>

      {!over && !faceVisible && (
        <p style={{ color: '#f87171', fontWeight: 'bold' }}>
          ⚠️ We can't see your face! Your composure is draining.
        </p>
      )}
      {!over && opponentLeft && (
        <p style={{ color: '#facc15' }}>Opponent disconnected... you win if they don't return.</p>
      )}

      <HpBar label="You" hp={myHp} />
      <HpBar label="Opponent" hp={opponentHp} />
      <p>
        Points — You: <b>{myScore}</b> | Opponent: <b>{theirScore}</b> &nbsp;·&nbsp; Your laugh meter:{' '}
        {Math.round(laughScore)}
      </p>

      {over && (
        <div>
          <h1>
            {outcome === 'win' ? '🏆 YOU WIN!' : outcome === 'lose' ? '💀 YOU LOSE' : '🤝 TIE'}
          </h1>
          {opponentLeft && <p style={{ color: '#facc15' }}>Your opponent left the room.</p>}
          <button onClick={onPlayAgain} disabled={rematchWaiting || opponentLeft}>
            {rematchWaiting
              ? 'Waiting for your opponent...'
              : opponentWantsRematch
                ? 'Opponent wants a rematch: Play again'
                : 'Play again'}
          </button>{' '}
          <button onClick={onBackToLobby}>Back to lobby</button>
        </div>
      )}

      {/* ---- the meme is on my screen (no warning, it starts right away) ---- */}
      {!over && current && (
        <div style={{ border: '3px solid red', padding: 8, margin: '12px 0' }}>
          <p>
            Opponent played: {current.attack.card.title}. Don't laugh! (x{multiplierOf(current.attack.card)} damage){' '}
            {myShield?.effect === 'block' && '🕶️ Block is active!'}
            {myShield?.effect === 'halve' && '☂️ Damage halved!'}
          </p>
          {renderCard(current.attack.card)}
        </div>
      )}

      {!over && myShield && (
        <p style={{ color: '#60a5fa', fontWeight: 'bold' }}>
          {SHIELD_EMOJI[myShield.effect]} Your shield is active for <Countdown until={myShield.until} /> s
        </p>
      )}

      {notice && <p style={{ fontWeight: 'bold' }}>{notice}</p>}
      {attackerBanner && <p style={{ color: '#93c5fd' }}>{attackerBanner}</p>}
      {!over && busy && <p>⏳ Your card is still active. You can play another one when it ends.</p>}

      <p>Elixir: {Math.floor(elixir)} / 10 | Cards left: {deckCards.length - usedIds.length}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {deckCards.map((card) => {
          const used = usedIds.includes(card.id)
          const isShield = card.type === 'shield'
          const canAfford = elixir >= costOf(card)
          const disabled = over || used || !canAfford || busy
          return (
            <button
              key={card.id}
              onClick={() => (isShield ? handleShield(card) : handleAttack(card))}
              disabled={disabled}
              style={{
                opacity: used ? 0.3 : 1,
                textDecoration: used ? 'line-through' : 'none',
                borderColor: isShield ? '#60a5fa' : undefined,
              }}
            >
              {isShield
                ? `${SHIELD_EMOJI[card.effect]} ${card.title} (shield: ${card.effect}, ${SHIELD_SECONDS}s, cost ${costOf(card)})`
                : `${card.title} (${card.type}, cost ${costOf(card)}, x${multiplierOf(card)})`}
            </button>
          )
        })}
      </div>
    </div>
  )
}