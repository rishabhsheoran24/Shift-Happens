import { useSound } from "./SoundProvider";

// A small button that turns all game sounds on or off.
// Put it in a corner of any screen: <MuteButton />
export default function MuteButton() {
  const { muted, toggleMute } = useSound();

  return (
    <button
      onClick={toggleMute}
      data-nosound
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        fontSize: 20,
        padding: "6px 10px",
        borderRadius: 8,
        border: 0,
        cursor: "pointer",
      }}
    >
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
