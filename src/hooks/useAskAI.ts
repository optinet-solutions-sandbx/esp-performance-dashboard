'use client'
import { useState } from 'react'
import { useDashboardStore } from '@/lib/store'
import { buildAIContext } from '@/lib/aiContext'
import type { ChatMessage, UseAskAIReturn } from '@/lib/types'

export function useAskAI(): UseAskAIReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const store = useDashboardStore()

  const sendMessage = async (text: string): Promise<void> => {
    const userMsg: ChatMessage = { role: 'user', content: text }
    const nextMessages: ChatMessage[] = [...messages, userMsg]
    setMessages(nextMessages)
    setIsLoading(true)
    setError(null)

    try {
      const context = buildAIContext({
        esps: store.esps,
        espData: store.espData,
        ipmData: store.ipmData,
        throttleData: store.throttleData,
      })

      const res = await fetch('/api/ask-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, context }),
      })

      const data = await res.json() as { reply?: string; error?: string }

      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Request failed')
      }

      const assistantMsg: ChatMessage = { role: 'assistant', content: data.reply ?? '' }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      }
      setMessages(prev => [...prev, errorMsg])
    } finally {
      setIsLoading(false)
    }
  }

  const clearMessages = (): void => {
    setMessages([])
    setError(null)
  }

  return { messages, isLoading, error, sendMessage, clearMessages }
}
