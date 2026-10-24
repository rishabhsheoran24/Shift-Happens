import { useEffect, useRef, useState } from 'react'
import { LIBRARY } from '../game/library'
import { costOf, multiplierOf, typeFromUrl, isSafeUrl } from '../game/cardCost'
import { SHIELD_EMOJI } from '../game/combat'
import { PICK_SECONDS } from '../game/constants'

const DECK_SIZE = 10

export default function PickPhase({ onDone }) {
  const [custom, setCustom] = useState([])
  const [selected, setSelected] = useState([])
  const [timeLeft, setTimeLeft] = useState(PICK_SECONDS)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [msg, setMsg] = useState('')
  const doneRef = useRef(false)

  const all = [...LIBRARY, ...custom]

  useEffect(() => {
    const t = setInterval(() => setTimeLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (timeLeft === 0) finish()
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

  return (
    <div style={{ maxWidth: 700, color: '#eee' }}>
      <h2>Pick your 10 cards: {timeLeft}s left</h2>
      <p>
        Selected {selected.length} / {DECK_SIZE}. Attack cost / multiplier: image 2 / x4, gif 3 / x3,
        video 4 / x2 (audio 3 / x3). Shields: Sunglasses (blocks, cost 3), Umbrella (halves, cost 2).
        Shields use up a deck slot, so choose wisely! If time runs out, random cards fill your deck.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {all.map((card) => {
          const on = selected.includes(card.id)
          const isShield = card.type === 'shield'
          return (
            <button
              key={card.id}
              onClick={() => toggle(card.id)}
              style={{
                padding: 8,
                width: 150,
                background: on ? '#2e7d32' : '#222',
                color: '#eee',
                border: on ? '2px solid #81c784' : '2px solid #444',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              {card.type === 'photo' || card.type === 'gif' ? (
                <img src={card.url} alt="" width="130" />
              ) : (
                <div style={{ height: 60, fontSize: 32 }}>
                  {isShield ? SHIELD_EMOJI[card.effect] : card.type === 'audio' ? '🎵' : '🎬'}
                </div>
              )}
              <div>{card.title}</div>
              <div>
                {isShield
                  ? `shield (${card.effect}) · cost ${costOf(card)}`
                  : `${card.type} · cost ${costOf(card)} · x${multiplierOf(card)}`}
              </div>
            </button>
          )
        })}
      </div>

      <h3>Add your own (paste a direct link)</h3>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Card name"
        style={{ padding: 8, marginRight: 8 }}
      />
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://.../file.jpg"
        style={{ padding: 8, width: 260, marginRight: 8 }}
      />
      <button onClick={addLink}>Add</button>
      <p>{msg}</p>

      <button onClick={finish} disabled={selected.length !== DECK_SIZE} style={{ padding: 12, fontSize: 16 }}>
        Lock in deck
      </button>
    </div>
  )
}
