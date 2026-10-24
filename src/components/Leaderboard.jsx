import { useEffect, useState } from 'react'
import { subscribeLeaderboard } from '../game/leaderboardService'

export default function Leaderboard() {
  const [rows, setRows] = useState([])
  useEffect(() => subscribeLeaderboard(setRows), [])

  if (rows.length === 0) return <p>No players on the leaderboard yet.</p>

  return (
    <div>
      <h3>🏆 Leaderboard</h3>
      <ol>
        {rows.map((r) => (
          <li key={r.id}>
            {r.displayName}: {r.wins} wins, {r.points} pts
          </li>
        ))}
      </ol>
    </div>
  )
}