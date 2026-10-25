import { useEffect, useRef, useState } from 'react'
import { LIBRARY } from '../game/library'
import { costOf, multiplierOf, typeFromUrl, isSafeUrl } from '../game/cardCost'
import { SHIELD_EMOJI } from '../game/combat'
import { PICK_SECONDS } from '../game/constants'

const DECK_SIZE = 10

const FILTERS = [
  ['all', 'ALL'],
  ['image', 'IMAGES'],
  ['gif', 'GIFS'],
  ['video', 'VIDEOS'],
  ['audio', 'AUDIO'],
  ['shield', 'SHIELDS'],
]

function matchesFilter(card, filter) {
  if (filter === 'all') return true
  if (filter === 'image') return card.type === 'photo' || card.type === 'meme'
  return card.type === filter
}

function Thumb({ card }) {
  if (card.type === 'shield') return <div className="pick-emoji">{SHIELD_EMOJI[card.effect] ?? '🛡️'}</div>
  if (card.type === 'audio') return <div className="pick-emoji">🎵</div>
  if (!isSafeUrl(card.url)) return <div className="pick-emoji">❓</div>
  if (card.type === 'video') return <video src={card.url} muted preload="metadata" />
  return <img src={card.url} alt="" loading="lazy" />
}

export default function PickPhase({ onDone }) {
  const [custom, setCustom] = useState([])
  const [selected, setSelected] = useState([])
  const [timeLeft, setTimeLeft] = useState(PICK_SECONDS)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [msg, setMsg] = useState('')
  const [filter, setFilter] = useState('all')
  const doneRef = useRef(false)

  const all = [...LIBRARY, ...custom]
  const shown = all.filter((c) => matchesFilter(c, filter))

  useEffect(() => {
    const t = setInterval(() => setTimeLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (timeLeft === 0) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft])

  function finish() {
    if (doneRef.current) return
    doneRef.current = true
    const chosen = all.filter((c) => selected.includes(c.id))
    const rest = all.filter((c) => !selected.includes(c.id)).sort(() => Math.random() - 0.5)
    onDone([...chosen, ...rest].slice(0, DECK_SIZE))
  }

  function toggle(id) {
    if (selected.includes(id)) setSelected(selected.filter((x) => x !== id))
    else if (selected.length < DECK_SIZE) setSelected([...selected, id])
  }

  function addLink() {
    const type = typeFromUrl(url.trim())
    if (!type) {
      setMsg('Link must end with .jpg .png .gif .mp3 .wav .mp4 or .webm')
      return
    }
    if (!isSafeUrl(url.trim())) {
      setMsg('Only https links from trusted sites (imgur, giphy, tenor, wikimedia, github...) are allowed.')
      return
    }
    const card = {
      id: `custom-${Date.now()}`,
      title: title.trim() || 'My card',
      type,
      url: url.trim(),
      uploadedBy: 'me',
    }
    setCustom([...custom, card])
    if (selected.length < DECK_SIZE) setSelected([...selected, card.id])
    setUrl('')
    setTitle('')
    setMsg('Added!')
  }

  const pct = (selected.length / DECK_SIZE) * 100
  const bg = `url(${import.meta.env.BASE_URL}arena-bg.jpg)`

  return (
    <main className="deck-page" style={{ backgroundImage: bg }}>
      <section className="deck-board">
        <span className="deck-eyebrow">TIME LEFT · {timeLeft}s</span>
        <h1>BUILD YOUR BATTLE DECK</h1>
        <p className="deck-sub">
          Choose {DECK_SIZE} cards. Shields use up a deck slot. If time runs out, random cards fill your deck.
        </p>

        <div className="deck-progress">
          <i style={{ width: `${pct}%` }} />
          <b>{selected.length} / {DECK_SIZE} SELECTED</b>
        </div>

        <div className="deck-filters">
          {FILTERS.map(([key, label]) => (
            <button key={key} className={filter === key ? 'on' : ''} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>

        <div className="deck-grid">
          {shown.map((card) => {
            const on = selected.includes(card.id)
            const isShield = card.type === 'shield'
            return (
              <button key={card.id} className={`pick-card ${on ? 'on' : ''}`} onClick={() => toggle(card.id)}>
                <span className="pick-cost">{costOf(card)}</span>
                <div className="pick-art"><Thumb card={card} /></div>
                <strong>{card.title}</strong>
                <small>{isShield ? `shield · ${card.effect}` : `${card.type} · x${multiplierOf(card)}`}</small>
                <em>{on ? 'SELECTED ✓' : 'ADD CARD'}</em>
              </button>
            )
          })}
        </div>

        <div className="deck-custom">
          <div>
            <b>ADD YOUR OWN MEME</b>
            <small>Direct links from trusted sites only: .jpg .png .gif .mp3 .mp4</small>
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Card name (optional)" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://site.com/meme.png" />
          <button className="deck-add" onClick={addLink}>ADD LINK</button>
        </div>
        {msg && <p className="deck-msg">{msg}</p>}

        <div className="deck-footer">
          <span>{selected.length === DECK_SIZE ? 'Deck ready!' : `Choose ${DECK_SIZE - selected.length} more cards`}</span>
          <button className="stone-button gold" onClick={finish} disabled={selected.length !== DECK_SIZE}>
            <span>ENTER ARENA</span>
          </button>
        </div>
      </section>
    </main>
  )
}