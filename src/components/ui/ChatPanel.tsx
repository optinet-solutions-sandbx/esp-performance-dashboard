'use client'
import React, { useRef, useEffect, useState, KeyboardEvent } from 'react'
import type { ChatMessage } from '@/lib/types'

const SUGGESTED_QUESTIONS = [
  'Which ESP has the best delivery rate?',
  'Show me bounce rates by provider',
  "What's my overall open rate this month?",
  'Which sending domains have the worst performance?',
]

interface ChatPanelProps {
  messages: ChatMessage[]
  isLoading: boolean
  onSend: (text: string) => void
  isLight: boolean
}

export default function ChatPanel({ messages, isLoading, onSend, isLight }: ChatPanelProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    onSend(text)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const bg = isLight ? '#ffffff' : '#12121e'
  const cardBg = isLight ? '#f0f0f8' : '#1a1a2e'
  const textColor = isLight ? '#1e1b4b' : '#e2e8f0'
  const borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(0,229,195,0.15)'
  const inputBg = isLight ? '#f5f3ff' : '#0d0d1a'
  const mutedText = isLight ? '#6b7280' : '#94a3b8'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: bg, color: textColor }}>
      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <p style={{ fontSize: '13px', color: mutedText, marginBottom: '8px' }}>
              Ask anything about your email deliverability data:
            </p>
            {SUGGESTED_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => onSend(q)}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
                  background: 'transparent', border: `1px solid rgba(0,229,195,0.4)`,
                  color: '#000000', cursor: 'pointer', transition: 'background 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,229,195,0.08)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            {msg.role === 'assistant' && (
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,229,195,0.15)',
                border: '1px solid rgba(0,229,195,0.3)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 2,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00e5c3" strokeWidth="2">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
                </svg>
              </div>
            )}
            <div style={{
              maxWidth: '78%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? '#00e5c3' : cardBg,
              color: msg.role === 'user' ? '#0d1117' : textColor,
              fontSize: '14px', lineHeight: '1.5',
              border: msg.role === 'assistant' ? `1px solid ${borderColor}` : 'none',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,229,195,0.15)',
              border: '1px solid rgba(0,229,195,0.3)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00e5c3" strokeWidth="2">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
              </svg>
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: cardBg, border: `1px solid ${borderColor}` }}>
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  style={{
                    width: 6, height: 6, borderRadius: '50%', background: '#00e5c3',
                    display: 'inline-block',
                    animation: 'askAiDot 1.2s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        borderTop: `1px solid ${borderColor}`, padding: '12px 16px',
        display: 'flex', gap: 8, background: bg,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your email data… (Enter to send)"
          disabled={isLoading}
          rows={1}
          style={{
            flex: 1, resize: 'none', background: inputBg, border: `1px solid ${borderColor}`,
            borderRadius: 8, padding: '8px 12px', fontSize: '14px', color: textColor,
            outline: 'none', fontFamily: 'inherit', lineHeight: '1.4',
          }}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          style={{
            padding: '0 16px', borderRadius: 8, background: '#00e5c3', color: '#0d1117',
            border: 'none', fontWeight: 600, fontSize: '14px', cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: isLoading || !input.trim() ? 0.5 : 1, transition: 'opacity 0.15s', flexShrink: 0,
          }}
        >
          Send
        </button>
      </div>

      <style>{`
        @keyframes askAiDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
