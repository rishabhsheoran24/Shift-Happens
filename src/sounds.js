// The list of all sound effects in the game.
//
// file   : where the audio file lives. Put files in  public/audio/  (so /audio/click.mp3)
// volume : 0 to 1, how loud this sound is compared to the others
// tone   : a built-in beep that plays if the file is missing, so the app is never silent
//
// To add a new sound: add a line here, then call play("yourName") anywhere.
export const SOUNDS = {
  click: {
    file: "/audio/click.mp3",
    volume: 0.5,
    tone: { type: "square", freq: 600, endFreq: 400, duration: 0.06 },
  },
  lobbyEnter: {
    file: "/audio/lobby-enter.mp3",
    volume: 0.7,
    tone: { type: "sine", freq: 400, endFreq: 800, duration: 0.25 },
  },
  battleStart: {
    file: "/audio/battle-start.mp3",
    volume: 0,
    tone: { type: "sawtooth", freq: 200, endFreq: 700, duration: 0.5 },
  },
  cardSelect: {
    file: "/audio/card-select.mp3",
    volume: 0.7,
    tone: { type: "triangle", freq: 700, endFreq: 1000, duration: 0.1 },
  },
  laugh: {
    file: "/audio/buzzer.mp3",
    volume: 0,
    tone: { type: "sawtooth", freq: 150, endFreq: 80, duration: 0.4 },
  },
  win: {
    file: "/audio/win.mp3",
    volume: 0.9,
    tone: { type: "sine", freq: 523, endFreq: 1047, duration: 0.5 },
  },
};
