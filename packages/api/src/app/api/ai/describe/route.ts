import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

const requestSchema = z.object({
  name: z.string().min(1).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { name } = parsed.data;

    const prompt = `Write exactly one sentence (under 120 characters) describing what a Claude Code agent called "${name}" does. Be specific and practical. No quotes, no prefix, just the sentence.`;

    // Try gemini-2.0-flash first, fall back to gemini-1.5-flash
    const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite'];

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 100,
            temperature: 0.7,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const description = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (description) {
          return NextResponse.json({ description });
        }
      }

      // If rate limited, try next model
      if (response.status === 429) continue;

      // Other errors, break
      break;
    }

    return NextResponse.json(
      { error: 'AI service temporarily unavailable, please try again later' },
      { status: 503 }
    );
  } catch (error) {
    console.error('AI describe error:', error);
    return NextResponse.json(
      { error: 'Failed to generate description' },
      { status: 500 }
    );
  }
}
