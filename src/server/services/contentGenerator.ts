import type { ContentDomain } from '../../shared/types/index.js';
import { detectContentDomain } from '../../shared/utils/contentDomain.js';

const MIN_LINES = 25;
const MAX_LINES = 50;

function buildPrompt(userPrompt: string, domain: ContentDomain): string {
  const target = Math.floor((MIN_LINES + MAX_LINES) / 2);

  return `You are a content generator for a typing challenge game. Generate clean, well-formatted content based on the user's prompt.

User's prompt: "${userPrompt}"
Content style: ${domain}

Requirements:
- Write approximately ${target} lines of content (minimum ${MIN_LINES}, maximum ${MAX_LINES} lines)
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

function buildFallbackContent(userPrompt: string, domain: ContentDomain): string {
  const lines: string[] = [];
  const target = Math.floor((MIN_LINES + MAX_LINES) / 2);

  if (domain === 'code') {
    lines.push(`// Challenge: ${userPrompt}`);
    lines.push('function processChallenge(input) {');
    lines.push('  const data = Array.isArray(input) ? input : [input];');
    lines.push('  const results = [];');
    lines.push('  for (const item of data) {');
    lines.push('    if (!item) continue;');
    lines.push('    results.push({');
    lines.push('      id: Math.random().toString(36).slice(2, 9),');
    lines.push('      value: item,');
    lines.push('      timestamp: Date.now(),');
    lines.push('    });');
    lines.push('  }');
    lines.push('  return results;');
    lines.push('}');
    lines.push('');
    lines.push('// Main execution path');
    lines.push('const testInput = "typing-speed-challenge";');
    lines.push('const output = processChallenge(testInput);');
    lines.push('console.log("Processed results:", output);');
  } else {
    lines.push(`Title: Typing Practice - ${userPrompt}`);
    lines.push('==================================================');
    lines.push('Practicing your typing skills regularly is one of the most effective');
    lines.push('ways to improve both speed and accuracy. Consistent daily execution');
    lines.push('helps build muscle memory so you do not need to look at keys.');
    lines.push('This game provides structured prompts across different styles to keep');
    lines.push('your practice engaging and relevant to your professional needs.');
    lines.push('Whether you write source code, legal templates, or marketing drafts,');
    lines.push('steady cadence always beats erratic bursts of high-speed keys.');
  }

  let i = 0;
  while (lines.length < target) {
    if (domain === 'code') {
      lines.push(`  // Line ${i + 1}: extra safety iteration helper logic check`);
    } else {
      lines.push(
        `Line ${i + 1}: Practice precision and rhythm while typing about ${userPrompt}. Steady hands beat rushed keystrokes every time.`
      );
    }
    i += 1;
  }

  return lines.slice(0, MAX_LINES).join('\n');
}

export type LlmConfig = {
  provider: string;
  huggingface: { apiKey: string; model: string };
  groq: { apiKey: string; model: string };
};

async function generateWithGroq(
  userPrompt: string,
  domain: ContentDomain,
  apiKey: string,
  model: string
): Promise<string> {
  const prompt = buildPrompt(userPrompt, domain);

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
  domain: ContentDomain,
  apiKey: string,
  model: string
): Promise<string> {
  const prompt = buildPrompt(userPrompt, domain);

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
  configOrApiKey: LlmConfig | string,
  legacyModel?: string
): Promise<{ content: string; lineCount: number; domain: ContentDomain }> {
  const domain = detectContentDomain(userPrompt);

  console.log(`[ContentGen] Generating for: "${userPrompt}" (${domain})`);

  let content: string = '';
  let success = false;

  let config: LlmConfig;
  if (typeof configOrApiKey === 'string') {
    config = {
      provider: configOrApiKey ? 'huggingface' : 'fallback',
      huggingface: { apiKey: configOrApiKey, model: legacyModel || 'Qwen/Qwen2.5-Coder-7B-Instruct' },
      groq: { apiKey: '', model: '' },
    };
  } else {
    config = configOrApiKey;
  }

  const provider = config.provider.toLowerCase();

  try {
    if (provider === 'groq' && config.groq.apiKey) {
      content = await generateWithGroq(userPrompt, domain, config.groq.apiKey, config.groq.model);
      success = true;
    } else if (provider === 'huggingface') {
      content = await generateWithHuggingFace(userPrompt, domain, config.huggingface.apiKey, config.huggingface.model);
      success = true;
    }
  } catch (err) {
    console.error(`[ContentGen] ${provider} generation failed, using fallback:`, err);
  }

  if (!success) {
    console.warn('[ContentGen] Provider failed or not configured — using fallback content');
    content = buildFallbackContent(userPrompt, domain);
  }

  const lineCount = content.split('\n').length;
  console.log(`[ContentGen] Generated ${lineCount} lines (target: ${MIN_LINES}-${MAX_LINES})`);

  return { content, lineCount, domain };
}
