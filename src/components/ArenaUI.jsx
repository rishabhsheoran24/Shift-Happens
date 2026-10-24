import { useState } from 'react'

type Screen = 'lobby' | 'arena'

const cards = [
  { name: 'Side Eye', cost: 2, tone: '#d99243' },
  { name: 'Math Lady', cost: 3, tone: '#9376b4' },
  { name: 'Dramatic Look', cost: 4, tone: '#4c99a5' },
  { name: 'Tiny Violin', cost: 2, tone: '#be6655' },
  { name: 'Plot Twist', cost: 5, tone: '#6b82b5' },
  { name: 'No Context', cost: 3, tone: '#c0923d' },
  { name: 'Uno Reverse', cost: 4, tone: '#ad5353' },
  { name: 'Awkward Pause', cost: 2, tone: '#739b75' },
  { name: 'Main Character', cost: 5, tone: '#8e69a7' },
  { name: 'Final Form', cost: 6, tone: '#586d97' },
]

function StoneButton({ children, variant = 'gold', onClick, disabled = false }: { children: React.ReactNode; variant?: 'gold' | 'red' | 'stone'; onClick?: () => void; disabled?: boolean }) {
  return <button className={`stone-button ${variant}`} onClick={onClick} disabled={disabled}><span>{children}</span></button>
}

function Lobby({ onEnter }: { onEnter: (name: string) => void }) {
  const [name, setName] = useState('Alex')
  const [code, setCode] = useState('')
  const [camera, setCamera] = useState(false)
  const [signedIn, setSignedIn] = useState(false)

  return <main className="lobby scene">
    <div className="vignette" />
    <section className="lobby-panel" aria-label="Enter the arena">
      <div className="panel-rivet r1" /><div className="panel-rivet r2" />
      <header className="logo-lockup">
        <span className="eyebrow">THE ULTIMATE NO-LAUGH DUEL</span>
        <h1>POKER FACE<br/><b>ARENA</b></h1>
      </header>

      <div className="setup-grid">
        <div className="setup-step">
          <div className="step-title"><span>1</span> Choose your fighter</div>
          <button className={`identity-card ${signedIn ? 'active' : ''}`} onClick={() => setSignedIn(true)}>
            <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
            <span><strong>{signedIn ? name : 'Sign in with Google'}</strong><small>{signedIn ? 'Ready for battle' : 'Save your rank and wins'}</small></span>
            <span className="check">{signedIn ? '✓' : 'G'}</span>
          </button>
          <div className="or"><i/>OR<i/></div>
          <label className="name-input"><span>Guest name</span><input value={name} onChange={e => setName(e.target.value)} maxLength={16}/></label>
        </div>

        <div className="setup-step">
          <div className="step-title"><span>2</span> Ready your camera</div>
          <button className={`camera-preview ${camera ? 'active' : ''}`} onClick={() => setCamera(true)}>
            <div className="camera-person"><i/><b/></div>
            <span>{camera ? 'Camera ready' : 'Enable camera'}</span>
            <small>{camera ? 'Face detector calibrated' : 'Video stays peer-to-peer'}</small>
          </button>
          <div className="privacy"><span>◆</span> Your face is analysed only on this device.</div>
        </div>
      </div>

      <div className="room-actions">
        <div className="join-box">
          <label>ENTER ROOM CODE</label>
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4))} placeholder="— — — —" aria-label="Four character room code"/>
          <StoneButton onClick={() => onEnter(name)} disabled={code.length < 4}>JOIN</StoneButton>
        </div>
        <div className="divider"><span>OR</span></div>
        <div className="create-box"><StoneButton variant="red" onClick={() => onEnter(name)}>CREATE A ROOM</StoneButton><small>Invite a friend with a private code</small></div>
      </div>
    </section>
    <footer className="lobby-footer"><span>HOW TO PLAY</span><span>LEADERBOARD</span><span>SETTINGS</span></footer>
  </main>
}

function VideoStand({ name, side }: { name: string; side: 'blue' | 'red' }) {
  return <article className={`fighter ${side}`}>
    <div className="hp"><i style={{height: side === 'blue' ? '82%' : '68%'}}/><b className={side === 'red' ? 'opponent-hp-label' : undefined}>{side === 'blue' ? '820' : '680'} HP</b></div>
    <div className={`screen-frame ${side}-frame`}>
      <div className={`video-feed ${side}-feed`}><div className="silhouette"><i/><b/></div><span>CAMERA FEED</span></div>
      <div className="wood-grain" />
    </div>
    <div className="score-stone"><small>SCORE</small><b>{side === 'blue' ? '1,240' : '980'}</b></div>
  </article>
}

function Arena({ player, onExit }: { player: string; onExit: () => void }) {
  const [cardPage, setCardPage] = useState(0)
  const [attacking, setAttacking] = useState(false)
  const visible = cards.slice(cardPage * 5, cardPage * 5 + 5)

  return <main className="arena scene">
    <button className="exit" onClick={onExit}>EXIT</button>
    <div className="top-hud"><div className="timer"><small>ROUND 1</small><b>01:42</b></div></div>
    {attacking && <div className="attack-screen"><div className="meme"><b>ATTACK INCOMING</b><span>Opponent must keep a straight face</span><button onClick={() => setAttacking(false)}>SKIP</button></div></div>}

    <section className="battlefield">
      <VideoStand name={player.split(' ')[0] || 'Player'} side="blue" />
      <div className="versus"><span>VS</span><i/></div>
      <VideoStand name="RIVAL" side="red" />
    </section>

    <section className="deck-zone">
      <div className="elixir"><div className="flask"><i/></div><div><small>ELIXIR</small><b>8<span>/10</span></b></div></div>
      <div className="deck-controls">
        <button className="deck-arrow up" onClick={() => setCardPage(1)} disabled={cardPage === 1} aria-label="Show next five cards">⌃</button>
        <button className="deck-arrow down" onClick={() => setCardPage(0)} disabled={cardPage === 0} aria-label="Show first five cards">⌄</button>
      </div>
      <div className={`card-rack page-${cardPage}`}>
        {visible.map((card, i) => <button className="battle-card" key={card.name} onClick={() => setAttacking(true)} style={{'--tone': card.tone, '--i': i} as React.CSSProperties}>
          <span className="cost">{card.cost}</span><div className="card-art"><div className="face"><i/><i/><b/></div></div><strong>{card.name}</strong><small>Deal laugh damage</small>
        </button>)}
      </div>
    </section>
  </main>
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [player, setPlayer] = useState('Alex')
  return screen === 'lobby' ? <Lobby onEnter={name => { setPlayer(name || 'Player'); setScreen('arena') }}/>: <Arena player={player} onExit={() => setScreen('lobby')}/>
}
