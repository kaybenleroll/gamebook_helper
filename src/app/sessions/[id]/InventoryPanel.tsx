'use client'

import { useState, useCallback } from 'react'
import InventoryTsvImport from './InventoryTsvImport'

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

interface EditDraft {
  name: string
  quantity: string
  itemType: string
  isSpecial: boolean
}

interface Props {
  sessionId: number
  gameSystemId: string
  initialItems: InventoryItem[]
  /** Maximum non-special backpack slots. Undefined means no limit is displayed. */
  backpackLimit?: number
  onStatsChange?: (stats: Record<string, unknown>, initialStats: Record<string, unknown>) => void
}

export default function InventoryPanel({ sessionId, gameSystemId, initialItems, backpackLimit, onStatsChange }: Props) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems)
  const [nameInput, setNameInput] = useState('')

  const handleImported = useCallback((newItems: InventoryItem[]) => {
    setItems((prev) => [...prev, ...newItems])
  }, [])
  const [quantityInput, setQuantityInput] = useState('1')
  const [isSpecialInput, setIsSpecialInput] = useState(false)
  const [editingQuantity, setEditingQuantity] = useState<Record<number, string>>({})

  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)

  const hasBackpackLimit = backpackLimit !== undefined
  const backpackCount = hasBackpackLimit
    ? items.filter((item) => !item.isSpecial).reduce((sum, item) => sum + item.quantity, 0)
    : 0

  function enterEditMode(item: InventoryItem) {
    setEditingItemId(item.id)
    setEditDraft({
      name: item.name,
      quantity: String(item.quantity),
      itemType: item.itemType,
      isSpecial: item.isSpecial,
    })
  }

  function cancelEditMode() {
    setEditingItemId(null)
    setEditDraft(null)
  }

  async function saveEdit(itemId: number) {
    if (!editDraft) return

    const qty = parseInt(editDraft.quantity, 10)
    const quantity = isNaN(qty) || qty < 1 ? 1 : qty

    const res = await fetch(`/api/sessions/${sessionId}/inventory/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editDraft.name.trim(),
        quantity,
        itemType: editDraft.itemType.trim(),
        isSpecial: editDraft.isSpecial,
      }),
    })

    if (res.ok) {
      const updated = (await res.json()) as InventoryItem
      setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)))
      cancelEditMode()
    }
  }

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

  async function useConsumable(item: InventoryItem) {
    if (item.doseCount === null || item.doseCount <= 0) return

    if (item.itemType === 'provision') {
      // Eat meal: applies stat healing and decrements doseCount via the eat-meal action route
      const res = await fetch(`/api/sessions/${sessionId}/actions/eat-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      })
      if (res.ok) {
        const data = (await res.json()) as {
          item: InventoryItem | null
          stats: Record<string, unknown>
          initialStats: Record<string, unknown>
        }
        if (data.item === null) {
          setItems((prev) => prev.filter((i) => i.id !== item.id))
        } else {
          setItems((prev) => prev.map((i) => (i.id === item.id ? data.item! : i)))
        }
        onStatsChange?.(data.stats, data.initialStats)
      }
      return
    }

    const newDoseCount = item.doseCount - 1

    const res = await fetch(`/api/sessions/${sessionId}/inventory/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doseCount: newDoseCount }),
    })

    if (res.status === 204) {
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } else if (res.ok) {
      const updated = (await res.json()) as InventoryItem
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
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

  function isConsumable(item: InventoryItem) {
    return item.itemType === 'potion' || item.itemType === 'salve' || item.itemType === 'provision'
  }

  function healDescription(item: InventoryItem) {
    if (item.itemType === 'provision') {
      if (item.healAmount !== null) return `${item.healAmount} STAMINA`
      return '4 STAMINA'
    }
    if (item.healDice) return item.healDice
    if (item.healAmount !== null) return `${item.healAmount} LP`
    return ''
  }

  return (
    <section>
      <h2 className="font-heading text-lg text-header-accent border-l-4 border-header-accent pl-3 mb-3">Inventory</h2>

      {hasBackpackLimit && backpackLimit !== undefined && (
        <p className="text-sm text-gray-600 mb-3">
          Backpack:{' '}
          <span className={backpackCount > backpackLimit ? 'text-red-600 font-semibold' : ''}>
            {backpackCount} / {backpackLimit}
          </span>{' '}
          slots used
          {backpackCount > backpackLimit && (
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
              {hasBackpackLimit && (
                <th className="py-2 pr-4 font-medium text-center">Special</th>
              )}
              <th className="py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) =>
              editingItemId === item.id && editDraft ? (
                <tr key={item.id} className="border-b last:border-0 bg-blue-50">
                  <td className="py-2 pr-4">
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        value={editDraft.name}
                        onChange={(e) => setEditDraft((d) => d ? { ...d, name: e.target.value } : d)}
                        className="border rounded px-2 py-0.5 text-sm w-full"
                        aria-label="Item name"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={editDraft.itemType}
                        onChange={(e) => setEditDraft((d) => d ? { ...d, itemType: e.target.value } : d)}
                        className="border rounded px-2 py-0.5 text-xs w-full text-gray-600"
                        aria-label="Item type"
                        placeholder="item type"
                      />
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <input
                      type="number"
                      value={editDraft.quantity}
                      onChange={(e) => setEditDraft((d) => d ? { ...d, quantity: e.target.value } : d)}
                      min={1}
                      className="w-16 border rounded px-1 py-0.5 text-sm font-mono text-center"
                      aria-label="Item quantity"
                    />
                  </td>
                  {hasBackpackLimit && (
                    <td className="py-2 pr-4 text-center">
                      <input
                        type="checkbox"
                        checked={editDraft.isSpecial}
                        onChange={(e) => setEditDraft((d) => d ? { ...d, isSpecial: e.target.checked } : d)}
                        aria-label="Is special item"
                      />
                    </td>
                  )}
                  <td className="py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => void saveEdit(item.id)}
                        disabled={!editDraft.name.trim()}
                        className="text-sm text-green-700 hover:underline disabled:opacity-40"
                        aria-label={`Save changes to ${item.name}`}
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditMode}
                        className="text-sm text-gray-500 hover:underline"
                        aria-label="Cancel editing"
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr
                  key={item.id}
                  className="border-b last:border-0 cursor-pointer hover:bg-gray-50"
                  onClick={() => enterEditMode(item)}
                >
                  <td className="py-2 pr-4">
                    <div className="flex flex-col">
                      <span>{item.name}</span>
                      {isConsumable(item) && (
                        <span className="text-xs text-gray-500">{healDescription(item)} per dose</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    {isConsumable(item) ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-sm font-mono font-semibold">
                          {item.doseCount ?? 0} doses
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); void useConsumable(item) }}
                          disabled={!item.doseCount || item.doseCount <= 0}
                          className="px-2 py-0.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40"
                          aria-label={item.itemType === 'provision' ? `Eat one ${item.name}` : `Use one dose of ${item.name}`}
                        >
                          {item.itemType === 'provision' ? 'Eat' : 'Use'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                    )}
                  </td>
                  {hasBackpackLimit && (
                    <td className="py-2 pr-4 text-center text-sm text-gray-500">
                      {item.isSpecial ? 'Yes' : '—'}
                    </td>
                  )}
                  <td className="py-2 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); void removeItem(item.id) }}
                      className="text-sm text-red-600 hover:underline"
                      aria-label={`Remove ${item.name} from inventory`}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}

      <InventoryTsvImport sessionId={sessionId} onImported={handleImported} />

      <div className="flex items-center gap-2 flex-wrap mt-3">
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
        {hasBackpackLimit && (
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
