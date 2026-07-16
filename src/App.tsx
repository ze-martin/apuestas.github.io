import { ProcessedBettingDashboard } from './components/ProcessedBettingDashboard'
import { AuthGate } from './components/AuthGate'

function App() {
  return (
    <AuthGate>
      <ProcessedBettingDashboard />
    </AuthGate>
  )
}

export default App
