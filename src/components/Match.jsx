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
  ALERT_SECONDS,
} from '../game/constants'

// If an attack never gets answered (opponent crashed), unlock the attack buttons after this long.
const STALE_MS = (ALERT_SECONDS + 10 + 6) * 1000

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

// A tiny self-updating "2... 1..." number for the incoming-attack alert.
function Countdown({ until }) {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    const update = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)))
    update()
    const t = setInterval(update, 100)
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
  onOverlay,   // NEW: onOverlay('me' | 'opp', emoji | null) draws a shield emoji on a video tile
}) {
  const [match, setMatch] = useState(null)
  const [usedIds, setUsedIds] = useState([])
  const [myHp, setMyHp] = useState(MAX_HP)
  const [timeLeft, setTimeLeft] = useState(MATCH_SECONDS)
  const [phase, setPhase] = useState('playing') // 'playing' | 'overtime'
  const [current, setCurrentUi] = useState(null) // the attack I'm dealing with right now (see below)
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

  // ----- attack handling memory -----
  // current = { attack, stage: 'alert' | 'hit', until, shield }
  //   alert = the 2-second warning (I may play a shield)
  //   hit   = the meme is on my screen, my laughing is multiplied
  const currentRef = useRef(null)
  const queueRef = useRef([])        // attacks waiting for their turn
  const hitDamageRef = useRef(0)     // damage taken during the current hit
  const noticeTimerRef = useRef(null)

  const setCurrent = useCallback((value) => {
    currentRef.current = value
    setCurrentUi(value)
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
  // Every 0.2 s: work out how much HP I lose, using real elapsed time (dt).
  //  - face hidden / tab hidden  -> fixed penalty
  //  - attack card on my screen  -> laugh x card multiplier   (this damage becomes the attacker's points)
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
      let damage = 0
      if (document.hidden || !faceRef.current) {
        damage = NO_FACE_DAMAGE_PER_SECOND * dt
      } else if (laugh > LAUGH_DEADZONE) {
        if (c && c.stage === 'hit') {
          damage = cardDps(laugh, c.attack.card, c.shield) * dt
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
  // Take the next waiting attack and start its 2-second warning.
  const startNext = useCallback(() => {
    if (currentRef.current || overRef.current) return
    const next = queueRef.current.shift()
    if (!next) return
    setCurrent({ attack: next, stage: 'alert', until: Date.now() + ALERT_SECONDS * 1000, shield: null })
  }, [setCurrent])

  // The attack is finished: tell the attacker what happened (this is where THEIR points come from).
  const finishCurrent = useCallback(
    (c, damage) => {
      const dealt = Math.round(damage * 10) / 10
      hitDamageRef.current = 0
      addPlay(roomCode, uid, {
        kind: 'hit',
        attackId: c.attack.playId,
        attackerId: c.attack.playedBy,
        damage: dealt,
        blocked: c.shield === 'block',
      }).catch(console.error)
      if (c.shield === 'block') showNotice('🕶️ Blocked! You took no damage.')
      else if (dealt > 0) showNotice(`😂 That attack cost you ${Math.round(dealt)} HP.`)
      else showNotice('😐 Poker face! No damage.')
      setCurrent(null)
      startNext()
    },
    [roomCode, uid, setCurrent, startNext, showNotice]
  )

  // Moves the current attack through its stages: alert -> hit -> finished.
  useEffect(() => {
    const t = setInterval(() => {
      if (overRef.current) return
      const c = currentRef.current
      if (!c) {
        startNext()
        return
      }
      const now = Date.now()
      if (now < c.until) return
      if (c.stage === 'alert') {
        if (c.shield === 'block') {
          finishCurrent(c, 0)
          return
        }
        hitDamageRef.current = 0
        setCurrent({ ...c, stage: 'hit', until: now + hitSeconds(c.attack.card) * 1000 })
      } else {
        finishCurrent(c, hitDamageRef.current)
      }
    }, 100)
    return () => clearInterval(t)
  }, [startNext, finishCurrent, setCurrent])

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
        setTimeout(() => onOverlay?.(who, null), 4000)
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
  // an attack is "open" until the target reports back; while one is open nobody can start another
  const locked = unresolvedAttacks(allPlays).some((a) => !staleIds.includes(a.playId))

  function handleAttack(card) {
    if (over || locked || usedIds.includes(card.id)) return
    if (!spend(costOf(card))) return
    setUsedIds((u) => [...u, card.id])
    playCardInMatch(roomCode, uid, card).catch(console.error)
  }

  function handleShield(card) {
    const c = currentRef.current
    if (over || usedIds.includes(card.id)) return
    if (!c || c.stage !== 'alert' || c.shield) return // only during the 2-second warning, once per attack
    if (!spend(costOf(card))) return
    setUsedIds((u) => [...u, card.id])
    setCurrent({ ...c, shield: card.effect })
    addPlay(roomCode, uid, {
      kind: 'shield',
      attackId: c.attack.playId,
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
  const theirShield = myLast && allPlays.find((p) => p.kind === 'shield' && p.attackId === myLast.playId)
  let attackerBanner = ''
  if (myLast && !myLastHit) {
    attackerBanner = theirShield
      ? `${SHIELD_EMOJI[theirShield.effect]} They played ${theirShield.title}!`
      : `Your ${typeLabel(myLast.card)} is on its way... they have ${ALERT_SECONDS} s to react.`
  } else if (myLastHit) {
    attackerBanner = myLastHit.blocked
      ? '🕶️ Your attack was BLOCKED. 0 points.'
      : myLastHit.damage > 0
        ? `🎯 Your attack landed! +${Math.round(myLastHit.damage)} points`
        : '😐 They kept a poker face. 0 points.'
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
        <h1>
          {outcome === 'win' ? '🏆 YOU WIN!' : outcome === 'lose' ? '💀 YOU LOSE' : '🤝 TIE'}
        </h1>
      )}

      {/* ---- incoming attack: 2-second warning (the meme itself stays hidden) ---- */}
      {!over && current?.stage === 'alert' && (
        <div style={{ border: '3px solid #facc15', padding: 8, margin: '12px 0', background: '#3a3000' }}>
          <h3 style={{ margin: 0 }}>
            🚨 INCOMING {typeLabel(current.attack.card)} ATTACK! (x{multiplierOf(current.attack.card)} damage,{' '}
            {hitSeconds(current.attack.card)} s) — <Countdown until={current.until} />
          </h3>
          <p style={{ margin: '4px 0 0' }}>
            {current.shield
              ? `${SHIELD_EMOJI[current.shield]} Shield is up!`
              : 'Play a shield card now, or brace yourself!'}
          </p>
        </div>
      )}

      {/* ---- the meme is on my screen ---- */}
      {!over && current?.stage === 'hit' && (
        <div style={{ border: '3px solid red', padding: 8, margin: '12px 0' }}>
          <p>
            Opponent played: {current.attack.card.title}. Don't laugh!{' '}
            {current.shield === 'halve' && '☂️ (damage halved)'}
          </p>
          {renderCard(current.attack.card)}
        </div>
      )}

      {notice && <p style={{ fontWeight: 'bold' }}>{notice}</p>}
      {attackerBanner && <p style={{ color: '#93c5fd' }}>{attackerBanner}</p>}

      <p>Elixir: {Math.floor(elixir)} / 10 | Cards left: {deckCards.length - usedIds.length}</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {deckCards.map((card) => {
          const used = usedIds.includes(card.id)
          const isShield = card.type === 'shield'
          const canAfford = elixir >= costOf(card)
          const disabled = isShield
            ? over || used || !canAfford || !(current?.stage === 'alert' && !current.shield)
            : over || used || !canAfford || locked
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
                ? `${SHIELD_EMOJI[card.effect]} ${card.title} (shield: ${card.effect}, cost ${costOf(card)})`
                : `${card.title} (${card.type}, cost ${costOf(card)}, x${multiplierOf(card)})`}
            </button>
          )
        })}
      </div>
    </div>
  )
}
