import { useEffect, useRef, useState } from 'react'
import { LaughDetector } from '../laugh-detector.js'

export function useLaughScore(stream) {
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState('idle')
  const [faceVisible, setFaceVisible] = useState(true)   // NEW
  const detectorRef = useRef(null)

  useEffect(() => {
    if (!stream) return
    let cancelled = false
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = stream
    video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;'
    document.body.appendChild(video)
    video.play().catch(() => {})

    async function run() {
      try {
        setStatus('loading')
        await new Promise((res) => {
          if (video.readyState >= 2) res()
          else video.onloadeddata = res
        })
        const detector = new LaughDetector(video)
        await detector.init()
        if (cancelled) return
        setStatus('calibrating')
        await detector.calibrate()
        if (cancelled) return

        // CHANGED: the detector produces a score every video frame (30-60 times a
        // second). Re-drawing the whole React tree that often is wasteful, so we
        // only publish a new score at most 10 times a second, and only when the
        // rounded number actually changed.
        let lastShown = -1
        let lastAt = 0
        detector.onScore((s) => {
          const now = performance.now()
          const rounded = Math.round(s)
          if (rounded !== lastShown && now - lastAt >= 100) {
            lastShown = rounded
            lastAt = now
            setScore(s)
          }
        })
        detector.onFace(setFaceVisible)   // NEW
        detector.start()
        detectorRef.current = detector
        setStatus('ready')
      } catch (e) {
        console.error(e)
        setStatus('error')
      }
    }
    run()

    return () => {
      cancelled = true
      detectorRef.current?.stop()
      video.srcObject = null
      video.remove()
    }
  }, [stream])

  return { score, status, faceVisible }
}
