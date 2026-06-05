import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { ChatMessage } from '@/lib/types'

interface RequestBody {
  messages: ChatMessage[]
  context: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as RequestBody
    const { messages, context } = body

    if (!Array.isArray(messages) || typeof context !== 'string') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: context },
        ...messages,
      ],
      max_tokens: 1024,
    })

    const reply = completion.choices[0]?.message?.content ?? ''
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[ask-ai] OpenAI error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
