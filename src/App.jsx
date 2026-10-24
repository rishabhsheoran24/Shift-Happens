import { SoundProvider } from './SoundProvider'
import MuteButton from './MuteButton'
import GameFlow from './components/GameFlow'

export default function App() {
  return (
    <SoundProvider>
      <MuteButton />
      <GameFlow />
    </SoundProvider>
  )
}