export interface MapEdge {
  id: number
  mapId: number
  fromNodeId: number
  toNodeId: number
  targetMapId: number | null
  direction: string | null
  connectionType: string
}
