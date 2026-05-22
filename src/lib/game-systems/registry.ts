import type { GameSystem } from './types'

export class GameSystemRegistry {
  private readonly systems = new Map<string, GameSystem>()

  register(system: GameSystem): void {
    this.systems.set(system.id, system)
  }

  get(id: string): GameSystem {
    const system = this.systems.get(id)
    if (!system) throw new Error(`Unknown game system: "${id}"`)
    return system
  }

  list(): GameSystem[] {
    return Array.from(this.systems.values())
  }
}

export const gameSystemRegistry = new GameSystemRegistry()
