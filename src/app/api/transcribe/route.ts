import { NextRequest, NextResponse } from 'next/server'
import OpenAI, { toFile } from 'openai'

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData()
    const audio = formData.get('audio')

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json({ error: 'Missing audio field' }, { status: 400 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const file = await toFile(audio, 'recording.webm', { type: 'audio/webm' })

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
    })

    return NextResponse.json({ text: transcription.text })
  } catch (err) {
    console.error('[transcribe] error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
