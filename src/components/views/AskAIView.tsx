'use client'
import React from 'react'
import { useDashboardStore } from '@/lib/store'
import ChatPanel from '@/components/ui/ChatPanel'
import type { UseAskAIReturn } from '@/lib/types'

interface AskAIViewProps {
  ai: UseAskAIReturn
}

export default function AskAIView({ ai }: AskAIViewProps) {
  const { isLight } = useDashboardStore()

  const borderColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(0,229,195,0.15)'
  const headerBg = isLight ? '#f5f3ff' : '#0d0d1a'
  const textColor = isLight ? '#1e1b4b' : '#e2e8f0'
  const mutedText = isLight ? '#6b7280' : '#94a3b8'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px', borderBottom: `1px solid ${borderColor}`,
        background: headerBg, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <img src="/ai-assistant-icon.png" width="32" height="32" style={{ objectFit: 'contain' }} alt="AI" />
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: textColor }}>Ask AI</h1>
          {ai.messages.length > 0 && (
            <button
              onClick={ai.clearMessages}
              style={{
                marginLeft: 'auto', fontSize: '12px', color: mutedText, background: 'transparent',
                border: `1px solid ${borderColor}`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
              }}
            >
              Clear chat
            </button>
          )}
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: mutedText }}>
          Ask questions about your ESP data, delivery rates, bounce rates, and more.
        </p>
      </div>

      {/* Chat panel fills remaining space */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ChatPanel
          messages={ai.messages}
          isLoading={ai.isLoading}
          onSend={ai.sendMessage}
          isLight={isLight}
        />
      </div>
    </div>
  )
}
