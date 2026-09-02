import { Route } from 'react-router-dom'
import { ChatScreen } from './ui/chat-screen'
import { MatchesScreen } from './ui/matches-screen'

export const chatRoutes = (
  <>
    <Route path="/matches" element={<MatchesScreen />} />
    <Route path="/chat/:matchId" element={<ChatScreen />} />
  </>
)
