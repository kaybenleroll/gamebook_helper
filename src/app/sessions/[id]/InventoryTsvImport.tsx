'use client'

import { useState, useCallback, useEffect } from 'react'
import { parseInventoryTsv, type ParsedInventoryItem } from '../../../lib/inventory-parser'

const LLM_PROMPT = `List every item the character is carrying from the following gamebook text.
Output one item per line in this format:

  [quantity] [item name]

Use a single space between quantity and item name. If the quantity is not stated, use 1. Output only the list — no headings, explanations, or punctuation.`

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2l1.8 5.4L19.2 9l-5.4 1.8L12 16.2l-1.8-5.4L4.8 9l5.4-1.8L12 2z" />
      <path d="M5 17l.9 2.7L8.6 21l-2.7.9L5 24.6l-.9-2.7L1.4 21l2.7-.9L5 17z" opacity="0.6" />
      <path d="M19 2l.7 2.1 2.1.7-2.1.7L19 7.6l-.7-2.1-2.1-.7 2.1-.7L19 2z" opacity="0.6" />
    </svg>
  )
}

function PromptModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(LLM_PROMPT).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="llm-prompt-modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-5">
        <div className="flex items-start justify-between mb-3">
          <h2 id="llm-prompt-modal-title" className="font-semibold text-sm">
            LLM Prompt Helper
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 ml-4 leading-none text-lg"
            aria-label="Close prompt helper"
          >
            ×
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Copy this prompt and paste it into an LLM along with the gamebook text to extract inventory items in the correct format.
        </p>
        <pre className="bg-gray-50 border rounded p-3 text-xs font-mono whitespace-pre-wrap break-words mb-4 select-all">
          {LLM_PROMPT}
        </pre>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-100"
          >
            Close
          </button>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 min-w-[110px]"
            aria-label="Copy prompt to clipboard"
          >
            {copied ? 'Copied!' : 'Copy prompt'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
  const [isPromptOpen, setIsPromptOpen] = useState(false)
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
    <>
    {isPromptOpen && <PromptModal onClose={() => setIsPromptOpen(false)} />}
    <div className="border rounded p-4 bg-gray-50 mt-4 max-w-lg">
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="font-medium text-sm">Paste Inventory</h3>
        <button
          onClick={() => setIsPromptOpen(true)}
          className="text-blue-400 hover:text-blue-600 p-0.5 rounded"
          aria-label="Open LLM prompt helper"
          title="Get an LLM prompt to extract inventory items"
          type="button"
        >
          <SparkleIcon className="w-3.5 h-3.5" />
        </button>
      </div>
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
    </>
  )
}
