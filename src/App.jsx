
import { SoundProvider } from "./SoundProvider";
import MuteButton from "./MuteButton";
import LiveTest from "./LiveTest";

export default function App() {
  return (
    <SoundProvider>
      <MuteButton />
      <LiveTest />
    </SoundProvider>
  );
}