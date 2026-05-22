import '../../../lib/game-systems/index'
import { gameSystemRegistry } from '../../../lib/game-systems/registry'
import NewSessionForm from './NewSessionForm'

export default function NewSessionPage() {
  const systems = gameSystemRegistry.list().map((s) => ({ id: s.id, name: s.name }))
  return (
    <main className="p-8">
      <NewSessionForm systems={systems} />
    </main>
  )
}
