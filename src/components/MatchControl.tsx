import { useState } from 'react'
import { completeMatchAndPost } from '../tournament'

interface MatchControlProps {
  matchId: string
  teamA: string
  teamB: string
}

export default function MatchControl({ matchId, teamA, teamB }: MatchControlProps) {
  const [loading, setLoading] = useState(false)
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')

  const handleFinishMatch = async () => {
    if (!scoreA || !scoreB) {
      alert('Please enter scores for both teams.')
      return
    }

    setLoading(true)
    const result = await completeMatchAndPost(
      matchId, 
      teamA, 
      teamB, 
      parseInt(scoreA), 
      parseInt(scoreB)
    )
    setLoading(false)

    if (result.success) {
      alert('Match completed successfully and broadcasted to Facebook!')
    } else {
      alert(`Error: ${result.error}`)
    }
  }

  return (
    <div style={{ border: '1px solid #ccc', padding: '16px', borderRadius: '8px', maxWidth: '400px', margin: '10px 0' }}>
      <h3>{teamA} vs {teamB}</h3>
      <div style={{ display: 'flex', gap: '10px', margin: '10px 0' }}>
        <input 
          type="number" 
          placeholder={`${teamA} Score`} 
          value={scoreA} 
          onChange={(e) => setScoreA(e.target.value)}
          style={{ padding: '6px', width: '100%' }}
        />
        <input 
          type="number" 
          placeholder={`${teamB} Score`} 
          value={scoreB} 
          onChange={(e) => setScoreB(e.target.value)}
          style={{ padding: '6px', width: '100%' }}
        />
      </div>
      <button 
        disabled={loading}
        onClick={handleFinishMatch}
        style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
      >
        {loading ? 'Updating & Posting...' : 'Finalize Match & Post to Facebook'}
      </button>
    </div>
  )
}