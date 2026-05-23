'use client'

import { useState, useCallback } from 'react'
import { parseInventoryTsv, type ParsedInventoryItem } from '../../../lib/inventory-parser'

interface InventoryItem {
  id: number
  sessionId: number
  name: string
  quantity: number
  isSpecial: boolean
  itemType: string
  doseCount: number | null
  healAmount: number | null
  healDice: string | null
  createdAt: string
}

interface Props {
  sessionId: number
  onImported: (items: InventoryItem[]) => void
}

export default function InventoryTsvImport({ sessionId, onImported }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [text, setText] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview: ParsedInventoryItem[] = parseInventoryTsv(text)

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
    setError(null)
  }, [])

  const handleOpen = useCallback(() => {
    setIsOpen(true)
    setText('')
    setError(null)
  }, [])

  const handleCancel = useCallback(() => {
    setIsOpen(false)
    setText('')
    setError(null)
  }, [])

  const handleImport = useCallback(async () => {
    if (preview.length === 0) return

    setIsImporting(true)
    setError(null)

    try {
      const res = await fetch(`/api/sessions/${sessionId}/inventory/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preview.map((item) => ({
          count: item.count,
          itemName: item.itemName,
        }))),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Import failed')
        return
      }

      const created = (await res.json()) as InventoryItem[]
      onImported(created)
      setIsOpen(false)
      setText('')
    } catch {
      setError('Network error — please try again')
    } finally {
      setIsImporting(false)
    }
  }, [preview, sessionId, onImported])

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className="text-sm text-blue-600 hover:underline"
        aria-label="Open paste inventory import panel"
      >
        Paste inventory
      </button>
    )
  }

  return (
    <div className="border rounded p-4 bg-gray-50 mt-4 max-w-lg">
      <h3 className="font-medium text-sm mb-2">Paste Inventory</h3>
      <p className="text-xs text-gray-500 mb-2">
        One item per line: <code className="bg-gray-100 px-1 rounded">count&lt;tab&gt;item name</code>
      </p>

      <textarea
        value={text}
        onChange={handleTextChange}
        placeholder={'1\tBackpack\n4\tCandles\n3\tBalls of Twine'}
        className="w-full border rounded px-2 py-1 text-sm font-mono h-36 resize-y"
        aria-label="Paste inventory text"
      />

      {preview.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-600 mb-1">Preview ({preview.length} items)</p>
          <table className="border-collapse w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1 pr-4 font-medium text-xs text-gray-500 w-16">Count</th>
                <th className="py-1 font-medium text-xs text-gray-500">Item</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((item, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1 pr-4 font-mono text-xs text-gray-700">{item.count}</td>
                  <td className="py-1 text-sm">{item.itemName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {text.trim() !== '' && preview.length === 0 && (
        <p className="text-xs text-gray-400 mt-2 italic">
          No valid items found — check format.
        </p>
      )}

      {error && (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => void handleImport()}
          disabled={preview.length === 0 || isImporting}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
          aria-label={`Import ${preview.length} items`}
        >
          {isImporting ? 'Importing…' : `Import ${preview.length} item${preview.length !== 1 ? 's' : ''}`}
        </button>
        <button
          onClick={handleCancel}
          disabled={isImporting}
          className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-40"
          aria-label="Cancel inventory import"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
