import type { Difficulty, ContentDomain } from '../../shared/types/index.js';
import { detectContentDomain } from '../../shared/utils/contentDomain.js';

const LINE_RANGES: Record<Difficulty, { min: number; max: number }> = {
  easy: { min: 25, max: 50 },
  medium: { min: 75, max: 150 },
  hard: { min: 200, max: 300 },
};

function buildPrompt(userPrompt: string, difficulty: Difficulty, domain: ContentDomain): string {
  const range = LINE_RANGES[difficulty];
  const target = Math.floor((range.min + range.max) / 2);

  return `You are a content generator for a typing challenge game. Generate clean, well-formatted content based on the user's prompt.

User's prompt: "${userPrompt}"
Content style: ${domain}

Requirements:
- Write approximately ${target} lines of content (minimum ${range.min}, maximum ${range.max} lines)
- The content must be well-structured and readable
- If the prompt asks for code, write syntactically correct code with proper indentation
- If the prompt asks for prose, write clear, well-punctuated text
- Minimal comments (at most 2-3 if writing code)
- No markdown formatting, no code fences, no explanations
- No deliberately broken content or tricks
- Output ONLY the content, nothing else

Content:`;
}

function cleanOutput(raw: string): string {
  let text = raw.trim();

  const fenceMatch = text.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) text = fenceMatch[1]!.trim();
  if (text.startsWith('```')) text = text.replace(/^```\w*\n?/, '').trim();
  if (text.endsWith('```')) text = text.slice(0, -3).trim();

  return text;
}

function buildFallbackContent(userPrompt: string, difficulty: Difficulty, domain: ContentDomain): string {
  const range = LINE_RANGES[difficulty];
  const lines: string[] = [];
  const target = Math.floor((range.min + range.max) / 2);

  if (domain === 'code') {
    lines.push(`// Challenge: ${userPrompt}`);
    lines.push('function processChallenge(input) {');
    lines.push('  const normalized = input.trim().toLowerCase();');
    lines.push('  const tokens = normalized.split(/\\s+/);');
    lines.push('  const counts = new Map();');
    lines.push('  for (const token of tokens) {');
    lines.push('    counts.set(token, (counts.get(token) ?? 0) + 1);');
    lines.push('  }');
    lines.push('  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);');
    lines.push('}');
    lines.push('');
    lines.push('module.exports = { processChallenge };');
  } else if (domain === 'legal') {
    lines.push(`// Matter: ${userPrompt}`);
    lines.push('This memorandum summarizes the key legal considerations for the matter at hand.');
    lines.push('Parties should review applicable statutes, case law, and contractual obligations.');
  } else if (domain === 'marketing') {
    lines.push(`Campaign brief: ${userPrompt}`);
    lines.push('Lead with a clear value proposition and a single memorable promise.');
    lines.push('Speak to the audience in concrete benefits, not vague features.');
  } else if (domain === 'technical') {
    lines.push(`# Technical note: ${userPrompt}`);
    lines.push('This document explains the system behavior in plain language.');
    lines.push('Each section builds on the previous one so readers can follow the full path.');
  } else if (domain === 'creative') {
    lines.push(`Opening for: ${userPrompt}`);
    lines.push('The first line of the story should pull the reader into a specific moment.');
    lines.push('Keep the rhythm steady and the imagery sharp.');
  } else {
    lines.push(`Topic: ${userPrompt}`);
    lines.push('This generated passage is designed for a typing race on Reddit.');
    lines.push('Each sentence is clear, practical, and free of formatting tricks.');
  }

  let i = 0;
  while (lines.length < target) {
    if (domain === 'code') {
      lines.push(`const step${i} = processChallenge("sample-${i}");`);
      lines.push(`console.log("step ${i}", step${i});`);
    } else {
      lines.push(
        `Line ${i + 1}: Practice precision and rhythm while typing about ${userPrompt}. Steady hands beat rushed keystrokes every time.`
      );
    }
    i += 1;
  }

  return lines.slice(0, range.max).join('\n');
}

export type LlmConfig = {
  provider: string;
  huggingface: { apiKey: string; model: string };
  groq: { apiKey: string; model: string };
  anthropic: { apiKey: string; model: string };
};

async function generateWithClaude(
  userPrompt: string,
  difficulty: Difficulty,
  domain: ContentDomain,
  apiKey: string,
  model: string
): Promise<string> {
  const prompt = buildPrompt(userPrompt, difficulty, domain);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[ContentGen] Claude API error (${response.status}):`, errorText);
    throw new Error(`Content generation failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const text = data.content?.find((block) => block.type === 'text')?.text;
  if (!text) throw new Error('Content generation returned empty result');

  return cleanOutput(text);
}

async function generateWithGroq(
  userPrompt: string,
  difficulty: Difficulty,
  domain: ContentDomain,
  apiKey: string,
  model: string
): Promise<string> {
  const prompt = buildPrompt(userPrompt, difficulty, domain);

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[ContentGen] Groq API error (${response.status}):`, errorText);
    throw new Error(`Groq content generation failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq returned empty result');

  return cleanOutput(text);
}

async function generateWithHuggingFace(
  userPrompt: string,
  difficulty: Difficulty,
  domain: ContentDomain,
  apiKey: string,
  model: string
): Promise<string> {
  const prompt = buildPrompt(userPrompt, difficulty, domain);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch('https://api-inference.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[ContentGen] Hugging Face API error (${response.status}):`, errorText);
    throw new Error(`Hugging Face content generation failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Hugging Face returned empty result');

  return cleanOutput(text);
}

export async function generateContent(
  userPrompt: string,
  difficulty: Difficulty,
  configOrApiKey: LlmConfig | string,
  legacyModel?: string
): Promise<{ content: string; lineCount: number; domain: ContentDomain }> {
  const domain = detectContentDomain(userPrompt);
  const range = LINE_RANGES[difficulty];

  console.log(`[ContentGen] Generating for: "${userPrompt}" (${difficulty}, ${domain})`);

  let content: string = '';
  let success = false;

  // Handle legacy calling signature from tests/old code
  let config: LlmConfig;
  if (typeof configOrApiKey === 'string') {
    config = {
      provider: configOrApiKey ? 'anthropic' : 'fallback',
      anthropic: { apiKey: configOrApiKey, model: legacyModel || 'claude-sonnet-4-20250514' },
      huggingface: { apiKey: '', model: '' },
      groq: { apiKey: '', model: '' },
    };
  } else {
    config = configOrApiKey;
  }

  const provider = config.provider.toLowerCase();

  try {
    if (provider === 'groq' && config.groq.apiKey) {
      content = await generateWithGroq(userPrompt, difficulty, domain, config.groq.apiKey, config.groq.model);
      success = true;
    } else if (provider === 'huggingface') {
      content = await generateWithHuggingFace(userPrompt, difficulty, domain, config.huggingface.apiKey, config.huggingface.model);
      success = true;
    } else if (provider === 'anthropic' && config.anthropic.apiKey) {
      content = await generateWithClaude(userPrompt, difficulty, domain, config.anthropic.apiKey, config.anthropic.model);
      success = true;
    }
  } catch (err) {
    console.error(`[ContentGen] ${provider} generation failed, using fallback:`, err);
  }

  if (!success) {
    console.warn('[ContentGen] Provider failed or not configured — using fallback content');
    content = buildFallbackContent(userPrompt, difficulty, domain);
  }

  const lineCount = content.split('\n').length;
  console.log(`[ContentGen] Generated ${lineCount} lines (target: ${range.min}-${range.max})`);

  return { content, lineCount, domain };
}
