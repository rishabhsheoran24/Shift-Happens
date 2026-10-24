// src/laugh-detector.js
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { NO_FACE_GRACE_MS } from "./game/constants.js";

// Tuning knob: a full smile alone only reaches ~60, so we boost the result a little.
// Raise it if players find it too hard to reach high scores, lower it if too easy.
const SCORE_GAIN = 1.25;

export class LaughDetector {
  constructor(video) {
    this.video = video;
    this.recent = [];
    this.baseline = 0;
    this.score = 0;           // current smoothed score, 0-100
    this.threshold = 50;      // above this counts as laughing
    this.holdMs = 300;        // must stay above threshold this long
    this.aboveSince = null;
    this.lastTime = -1;
    this.running = false;
    this.scoreListeners = [];
    this.laughListeners = [];
    this.faceListeners = [];  // NEW: told when the face appears / disappears
    this.faceVisible = true;  // NEW
    this.noFaceSince = null;  // NEW
    this.resetRound();
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: "/models/face_landmarker.task", delegate },
      runningMode: "VIDEO",
      outputFaceBlendshapes: true,
      numFaces: 1,
    });
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, opts("GPU"));
    } catch {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, opts("CPU"));
    }
  }

  // CHANGED: jaw-open and cheek-squint now only count when there is a real smile,
  // so yawning, talking or a surprised "O" mouth no longer look like laughing.
  rawScore(result) {
    const shapes = result.faceBlendshapes?.[0]?.categories;
    if (!shapes) return null; // no face in frame
    const get = (n) => shapes.find((s) => s.categoryName === n)?.score ?? 0;
    const smile = (get("mouthSmileLeft") + get("mouthSmileRight")) / 2;
    const squint = (get("cheekSquintLeft") + get("cheekSquintRight")) / 2;
    const extras = smile > 0.15 ? get("jawOpen") * 0.2 + squint * 0.2 : 0;
    return Math.min(100, (smile * 0.6 + extras) * 100 * SCORE_GAIN);
  }

  // NEW: works out whether the face is "visible", allowing a short grace period
  updateFace(seen) {
    const now = performance.now();
    let visible;
    if (seen) {
      this.noFaceSince = null;
      visible = true;
    } else {
      if (this.noFaceSince === null) this.noFaceSince = now;
      visible = now - this.noFaceSince < NO_FACE_GRACE_MS;
    }
    if (visible !== this.faceVisible) {
      this.faceVisible = visible;
      this.faceListeners.forEach((cb) => cb(visible));
    }
  }

  // Call once at match start while the player keeps a neutral face
  async calibrate(ms = 2000) {
    const samples = [];
    const end = performance.now() + ms;
    while (performance.now() < end) {
      if (this.video.currentTime !== this.lastTime) {
        this.lastTime = this.video.currentTime;
        const r = this.rawScore(this.landmarker.detectForVideo(this.video, performance.now()));
        if (r !== null) samples.push(r);
      }
      await new Promise((res) => requestAnimationFrame(res));
    }
    this.baseline = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
  }

  start() { this.running = true; this.loop(); }
  stop() { this.running = false; }

  loop = () => {
    if (!this.running) return;
    if (this.video.currentTime !== this.lastTime) {
      this.lastTime = this.video.currentTime;
      const raw = this.rawScore(this.landmarker.detectForVideo(this.video, performance.now()));
      this.updateFace(raw !== null);                       // NEW
      const adjusted = raw === null ? 0
        : Math.max(0, (raw - this.baseline) / (100 - this.baseline || 1)) * 100;
      // NEW: while the player is clearly calm, slowly re-learn their neutral face
      // so lighting / posture changes after calibration don't cause false laughs.
      if (raw !== null && adjusted < 8) this.baseline = this.baseline * 0.995 + raw * 0.005;
      this.recent.push(adjusted);
      if (this.recent.length > 8) this.recent.shift();
      this.score = this.recent.reduce((a, b) => a + b, 0) / this.recent.length;
      this.trackRound();
      this.scoreListeners.forEach((cb) => cb(this.score));
    }
    requestAnimationFrame(this.loop);
  };

  trackRound() {
    this.roundSum += this.score;
    this.roundN += 1;
    this.roundPeak = Math.max(this.roundPeak, this.score);
    const now = performance.now();
    if (this.score > this.threshold) {
      if (this.aboveSince === null) this.aboveSince = now;
      if (!this.laughed && now - this.aboveSince >= this.holdMs) {
        this.laughed = true;
        this.laughListeners.forEach((cb) => cb());
      }
    } else {
      this.aboveSince = null;
    }
  }

  resetRound() { this.roundPeak = 0; this.roundSum = 0; this.roundN = 0; this.laughed = false; this.aboveSince = null; }
  startRound() { this.resetRound(); }
  endRound() {
    return { peak: this.roundPeak, avg: this.roundN ? this.roundSum / this.roundN : 0, laughed: this.laughed };
  }

  onScore(cb) { this.scoreListeners.push(cb); }
  onLaugh(cb) { this.laughListeners.push(cb); }
  onFace(cb) { this.faceListeners.push(cb); }   // NEW
}
