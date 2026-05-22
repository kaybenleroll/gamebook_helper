'use client'

import { useState } from 'react'

const FF_BACKPACK_LIMIT = 10

interface InventoryItem {
  id: number
  sessionId: number
  name: string
  quantity: number
  isSpecial: boolean
  createdAt: string
}

interface Props {
  sessionId: number
  gameSystemId: string
  initialItems: InventoryItem[]
}

export default function InventoryPanel({ sessionId, gameSystemId, initialItems }: Props) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems)
  const [nameInput, setNameInput] = useState('')
  const [quantityInput, setQuantityInput] = useState('1')
  const [isSpecialInput, setIsSpecialInput] = useState(false)
  const [editingQuantity, setEditingQuantity] = useState<Record<number, string>>({})

  const isFightingFantasy = gameSystemId === 'fighting-fantasy'

  const backpackCount = isFightingFantasy
    ? items.filter((item) => !item.isSpecial).reduce((sum, item) => sum + item.quantity, 0)
    : 0

  async function addItem() {
    const trimmedName = nameInput.trim()
    if (!trimmedName) return

    const qty = parseInt(quantityInput, 10)
    const quantity = isNaN(qty) || qty < 1 ? 1 : qty

    const res = await fetch(`/api/sessions/${sessionId}/inventory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedName, quantity, isSpecial: isSpecialInput }),
    })

    if (res.ok) {
      const created = (await res.json()) as InventoryItem
      setItems((prev) => [...prev, created])
      setNameInput('')
      setQuantityInput('1')
      setIsSpecialInput(false)
    }
  }

  async function removeItem(itemId: number) {
    const res = await fetch(`/api/sessions/${sessionId}/inventory/${itemId}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      setItems((prev) => prev.filter((item) => item.id !== itemId))
    }
  }

  async function updateQuantity(itemId: number, quantity: number) {
    if (quantity < 1) return

    const res = await fetch(`/api/sessions/${sessionId}/inventory/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    })

    if (res.ok) {
      const updated = (await res.json()) as InventoryItem
      setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)))
    }
  }

  function applyQuantityEdit(itemId: number) {
    const raw = editingQuantity[itemId]
    if (raw === undefined) return
    const qty = parseInt(raw, 10)
    if (!isNaN(qty) && qty >= 1) {
      void updateQuantity(itemId, qty)
    }
    setEditingQuantity((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-3">Inventory</h2>

      {isFightingFantasy && (
        <p className="text-sm text-gray-600 mb-3">
          Backpack:{' '}
          <span className={backpackCount > FF_BACKPACK_LIMIT ? 'text-red-600 font-semibold' : ''}>
            {backpackCount} / {FF_BACKPACK_LIMIT}
          </span>{' '}
          slots used
          {backpackCount > FF_BACKPACK_LIMIT && (
            <span className="ml-2 text-red-600">(over limit!)</span>
          )}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 mb-4">No items in inventory.</p>
      ) : (
        <table className="border-collapse w-full max-w-lg mb-4">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4 font-medium">Item</th>
              <th className="py-2 pr-4 font-medium text-center">Qty</th>
              {isFightingFantasy && (
                <th className="py-2 pr-4 font-medium text-center">Special</th>
              )}
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="py-2 pr-4">{item.name}</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => void updateQuantity(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="w-6 h-6 flex items-center justify-center border rounded text-sm disabled:opacity-40"
                      aria-label={`Decrease quantity of ${item.name}`}
                    >
                      −
                    </button>
                    <input
                      type="text"
                      value={editingQuantity[item.id] ?? String(item.quantity)}
                      onChange={(e) =>
                        setEditingQuantity((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      onBlur={() => applyQuantityEdit(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') applyQuantityEdit(item.id)
                      }}
                      className="w-10 border rounded px-1 py-0.5 text-sm font-mono text-center"
                      aria-label={`Quantity of ${item.name}`}
                    />
                    <button
                      onClick={() => void updateQuantity(item.id, item.quantity + 1)}
                      className="w-6 h-6 flex items-center justify-center border rounded text-sm"
                      aria-label={`Increase quantity of ${item.name}`}
                    >
                      +
                    </button>
                  </div>
                </td>
                {isFightingFantasy && (
                  <td className="py-2 pr-4 text-center text-sm text-gray-500">
                    {item.isSpecial ? 'Yes' : '—'}
                  </td>
                )}
                <td className="py-2 text-right">
                  <button
                    onClick={() => void removeItem(item.id)}
                    className="text-sm text-red-600 hover:underline"
                    aria-label={`Remove ${item.name} from inventory`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void addItem() }}
          placeholder="Item name"
          className="border rounded px-2 py-1 text-sm w-48"
          aria-label="New item name"
        />
        <input
          type="number"
          value={quantityInput}
          onChange={(e) => setQuantityInput(e.target.value)}
          min={1}
          className="border rounded px-2 py-1 text-sm w-16 font-mono"
          aria-label="New item quantity"
        />
        {isFightingFantasy && (
          <label className="flex items-center gap-1 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isSpecialInput}
              onChange={(e) => setIsSpecialInput(e.target.checked)}
            />
            Special
          </label>
        )}
        <button
          onClick={() => void addItem()}
          disabled={!nameInput.trim()}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
          aria-label="Add item to inventory"
        >
          Add
        </button>
      </div>
    </section>
  )
}
