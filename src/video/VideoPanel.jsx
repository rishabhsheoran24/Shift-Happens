import { useEffect, useRef, useState } from 'react'

// One video tile. `muted` is true ONLY for your own tile, so you don't hear yourself.
function Tile({ stream, label, muted, mirror, overlay = null }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null
  }, [stream])

  return (
    <div style={styles.tile}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{ ...styles.video, transform: mirror ? 'scaleX(-1)' : 'none' }}
      />
      {!stream && <div style={styles.empty}>Waiting for video</div>}
      <span style={styles.label}>{label}</span>
      {overlay && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '25%', textAlign: 'center', fontSize: 64, pointerEvents: 'none' }}>
          {overlay}
        </div>
      )}
    </div>
  )
}

/**
 * Props:
 *  - localStream:  your own camera stream (camera.stream)
 *  - remoteStream: the opponent's stream from the call
 *  - messages:     optional, [{ from: 'me' | 'them', text: '...' }]
 *  - onSendChat:   optional, (text) => void. Chat box only shows if this is given.
 */
export default function VideoPanel({
  localStream,
  remoteStream,
  messages = [],
  onSendChat,
  localOverlay = null,
  remoteOverlay = null,
}) {
  const [micOn, setMicOn] = useState(true)
  const [text, setText] = useState('')

  const hasAudio = !!localStream && localStream.getAudioTracks().length > 0

  // Keep the button in sync when the stream changes
  useEffect(() => {
    const track = localStream?.getAudioTracks()[0]
    setMicOn(track ? track.enabled : true)
  }, [localStream])

  function toggleMic() {
    const track = localStream?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMicOn(track.enabled)
  }

  function sendChat() {
    const clean = text.trim()
    if (!clean || !onSendChat) return
    onSendChat(clean)
    setText('')
  }

  return (
    <div style={styles.panel}>
      <div style={styles.tiles}>
                <Tile stream={localStream} label="You" muted mirror overlay={localOverlay} />
                <Tile stream={remoteStream} label="Opponent" muted={false} overlay={remoteOverlay} />
      </div>

      <button
        type="button"
        onClick={toggleMic}
        disabled={!hasAudio}
        style={{ ...styles.button, ...(micOn ? {} : styles.buttonOff) }}
      >
        {micOn ? 'Mute mic' : 'Unmute mic'}
      </button>

      {onSendChat && (
        <div style={styles.chat}>
          <div style={styles.messages}>
            {messages.length === 0 && (
              <div style={styles.hint}>No messages yet</div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{ ...styles.message, textAlign: m.from === 'me' ? 'right' : 'left' }}
              >
                {m.text}
              </div>
            ))}
          </div>
          <div style={styles.chatRow}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat()}
              placeholder="Type a message"
              style={styles.input}
            />
            <button type="button" onClick={sendChat} style={styles.button}>
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  panel: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 },
  tiles: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  tile: {
    position: 'relative',
    flex: '1 1 220px',
    aspectRatio: '4 / 3',
    background: '#1c1c22',
    borderRadius: 8,
    overflow: 'hidden',
  },
  video: { width: '100%', height: '100%', objectFit: 'cover' },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    color: '#9a9aa5',
    fontSize: 14,
  },
  label: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    padding: '2px 8px',
    borderRadius: 4,
    background: 'rgba(0, 0, 0, 0.6)',
    color: '#fff',
    fontSize: 12,
  },
  button: {
    padding: '8px 14px',
    borderRadius: 6,
    border: '1px solid #3a3a45',
    background: '#2b2b35',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
  },
  buttonOff: { background: '#8c2f39', borderColor: '#8c2f39' },
  chat: { display: 'flex', flexDirection: 'column', gap: 8 },
  messages: {
    height: 120,
    overflowY: 'auto',
    padding: 8,
    background: '#1c1c22',
    borderRadius: 8,
    color: '#e8e8ee',
    fontSize: 14,
  },
  message: { marginBottom: 4 },
  hint: { color: '#9a9aa5' },
  chatRow: { display: 'flex', gap: 8 },
  input: {
    flex: 1,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #3a3a45',
    background: '#15151b',
    color: '#fff',
    fontSize: 14,
  },
}
