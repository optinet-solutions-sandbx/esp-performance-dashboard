'use client'
import React, { useState } from 'react'
import { useDashboardStore } from '@/lib/store'
import ChatPanel from '@/components/ui/ChatPanel'
import type { UseAskAIReturn, ViewName } from '@/lib/types'

interface AskAIBubbleProps {
  ai: UseAskAIReturn
  activeView: ViewName
}

export default function AskAIBubble({ ai, activeView }: AskAIBubbleProps) {
  const { isLight } = useDashboardStore()
  const [isOpen, setIsOpen] = useState(false)

  // Hide bubble when the full Ask AI tab is active
  if (activeView === 'askai') return null

  const panelBg = isLight ? '#ffffff' : '#12121e'
  const borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(0,229,195,0.2)'
  const headerBg = isLight ? '#f5f3ff' : '#0d0d1a'
  const textColor = isLight ? '#1e1b4b' : '#e2e8f0'
  const mutedText = isLight ? '#6b7280' : '#94a3b8'
  const hasUnread = ai.messages.length > 0 && !isOpen

  return (
    <>
      {/* Floating panel */}
      {isOpen && (
        <div style={{
          position: 'fixed', bottom: 84, right: 24, width: 400, height: 560,
          background: panelBg, border: `1px solid ${borderColor}`,
          borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column', zIndex: 9999, overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${borderColor}`,
            background: headerBg, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <img src="/ai-assistant-icon.png" width="22" height="22" style={{ objectFit: 'contain' }} alt="AI" />
            <span style={{ fontWeight: 600, fontSize: '14px', color: textColor, flex: 1 }}>Ask AI</span>
            {ai.messages.length > 0 && (
              <button
                onClick={ai.clearMessages}
                style={{
                  fontSize: '11px', color: mutedText, background: 'transparent',
                  border: `1px solid ${borderColor}`, borderRadius: 5, padding: '2px 6px', cursor: 'pointer',
                }}
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              style={{
                width: 24, height: 24, borderRadius: '50%', background: 'transparent',
                border: 'none', cursor: 'pointer', color: mutedText, fontSize: '16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              aria-label="Close AI assistant"
            >
              ×
            </button>
          </div>

          {/* Chat area */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatPanel
              messages={ai.messages}
              isLoading={ai.isLoading}
              onSend={ai.sendMessage}
              isLight={isLight}
            />
          </div>
        </div>
      )}

      {/* Bubble button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        aria-label="Open AI assistant"
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 60, height: 60,
          borderRadius: '50%', background: '#0d1117', border: '2px solid rgba(0,229,195,0.35)',
          boxShadow: '0 4px 20px rgba(0,229,195,0.25)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.transform = 'scale(1.08)'
          el.style.boxShadow = '0 6px 28px rgba(0,229,195,0.45)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.transform = 'scale(1)'
          el.style.boxShadow = '0 4px 20px rgba(0,229,195,0.25)'
        }}
      >
        {isOpen ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00e5c3" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        ) : (
          <span style={{ animation: 'botPulse 2.4s ease-in-out infinite', display: 'flex' }}>
            <img src="/ai-assistant-icon.png" width="38" height="38" style={{ objectFit: 'contain' }} alt="AI" />
          </span>
        )}
        {/* Unread dot */}
        {hasUnread && (
          <span style={{
            position: 'absolute', top: 4, right: 4, width: 10, height: 10,
            borderRadius: '50%', background: '#ff4757', border: '2px solid #0d1117',
          }} />
        )}
      </button>

      {/* Pulse ring when panel is closed */}
      {!isOpen && (
        <span style={{
          position: 'fixed', bottom: 24, right: 24, width: 60, height: 60,
          borderRadius: '50%', border: '2px solid rgba(0,229,195,0.5)',
          animation: 'askAiBubblePulse 2.5s ease-out infinite',
          pointerEvents: 'none', zIndex: 9998,
        }} />
      )}

      <style>{`
        @keyframes askAiBubblePulse {
          0% { transform: scale(1); opacity: 0.6; }
          70% { transform: scale(1.5); opacity: 0; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes botPulse {
          0%, 100% { filter: drop-shadow(0 0 3px rgba(0,229,195,0.3)); }
          50%       { filter: drop-shadow(0 0 10px rgba(0,229,195,0.85)); }
        }
      `}</style>
    </>
  )
}
