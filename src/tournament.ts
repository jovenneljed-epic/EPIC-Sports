import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client for your Vite app
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export async function completeMatchAndPost(
  matchId: string, 
  teamA: string, 
  teamB: string, 
  scoreA: number, 
  scoreB: number
) {
  // 1. Update the match status and scores in the database
  const { data: matchData, error: dbError } = await supabase
    .from('matches')
    .update({ 
      score_a: scoreA, 
      score_b: scoreB, 
      status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('id', matchId)
    .select()

  if (dbError) {
    console.error('Database update failed:', dbError.message)
    return { success: false, error: dbError.message }
  }

  // 2. Format a dynamic, engaging message for Facebook
  const winningTeam = scoreA > scoreB ? teamA : teamB
  const message = `${teamA} (${scoreA}) -vs- ${teamB} (${scoreB})\n\nFinal whistle! ${winningTeam} secures the victory in this round of the EPIC Sports Tournament Circuit! 🏀🏆`

  // 3. Invoke your Supabase Edge Function
  const { data: functionData, error: fnError } = await supabase.functions.invoke('post-to-facebook', {
    body: { 
      message: message, 
      post_type: 'result' 
    }
  })

  if (fnError) {
    console.error('Failed to trigger Facebook Edge Function:', fnError)
    return { success: true, match: matchData[0], warning: 'Match updated, but Facebook post failed.' }
  }

  return { success: true, match: matchData[0], facebookResponse: functionData }
}