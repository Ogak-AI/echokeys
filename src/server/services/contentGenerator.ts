import type { ContentDomain } from '../../shared/types/index.js';
import { detectContentDomain } from '../../shared/utils/contentDomain.js';
import { buildHumanizerSystemPrompt } from '../../shared/utils/humanizer.js';
import { countWords } from '../../shared/utils/antiCheat.js';

const MIN_LINES = 25;
const MAX_LINES = 50;
/** Smallest word target we honor from a prompt (below this, still clamp up). */
export const MIN_WORD_TARGET = 10;
/** Largest word target we honor (keeps challenges typeable in one session). */
export const MAX_WORD_TARGET = 400;

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/** How long the generated typing content should be. */
export type LengthTarget =
  | { mode: 'words'; count: number }
  | { mode: 'lines'; min: number; max: number; target: number };

/**
 * Free-tier Gemini models that are intelligent enough for global, multilingual
 * typing challenges. Paid-only and lite/low-accuracy models are excluded.
 * Source: https://ai.google.dev/pricing (Free Tier = free of charge).
 */
export const FREE_INTELLIGENT_GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
] as const;

export type FreeIntelligentGeminiModel = (typeof FREE_INTELLIGENT_GEMINI_MODELS)[number];

/** Default: free forever on free tier, strong multilingual accuracy, low latency. */
export const DEFAULT_GEMINI_MODEL: FreeIntelligentGeminiModel = 'gemini-3.6-flash';

/**
 * Extract an explicit word-count request from a free-text prompt.
 * Supports common English forms: "20 words", "20-word", "exactly 50 words", etc.
 * Returns null when the user did not specify a word length.
 */
export function parseWordTarget(prompt: string): number | null {
  const p = prompt.trim();
  if (!p) return null;

  const patterns: RegExp[] = [
    // "20 words", "about 20 words", "exactly 20 words of content"
    /\b(?:about|around|approx(?:imately)?|exactly|precisely|only|just|roughly)?\s*(\d{1,4})\s*[- ]?words?\b/i,
    // "20-word essay/content/passage"
    /\b(\d{1,4})[- ]word(?:s)?\b/i,
    // "word count: 20" / "words: 20"
    /\bword(?:s)?\s*(?:count)?\s*[:=]\s*(\d{1,4})\b/i,
    // "generate/write 20 words"
    /\b(?:write|generate|create|make|produce)\s+(\d{1,4})\s+words?\b/i,
  ];

  for (const re of patterns) {
    const m = p.match(re);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

/** Clamp a raw word request into product-safe bounds. */
export function clampWordTarget(raw: number): number {
  return Math.min(MAX_WORD_TARGET, Math.max(MIN_WORD_TARGET, Math.round(raw)));
}

/**
 * Resolve how long generation should be: honor explicit word counts when present,
 * otherwise use the default line range (25–50).
 */
export function resolveLengthTarget(prompt: string): LengthTarget {
  const words = parseWordTarget(prompt);
  if (words != null) {
    return { mode: 'words', count: clampWordTarget(words) };
  }
  const target = Math.floor((MIN_LINES + MAX_LINES) / 2);
  return { mode: 'lines', min: MIN_LINES, max: MAX_LINES, target };
}

function lengthRequirementText(length: LengthTarget): string {
  if (length.mode === 'words') {
    return `- HARD LENGTH LIMIT: write EXACTLY ${length.count} words (whitespace-separated). Not fewer, not more. Count carefully and stop at word ${length.count}.`;
  }
  return `- Write approximately ${length.target} lines (minimum ${length.min}, maximum ${length.max})`;
}

/**
 * Hard-enforce a word count after generation: truncate surplus words;
 * if short, leave as-is (LLM/fallback should have aimed correctly).
 */
export function enforceWordCount(text: string, targetWords: number): string {
  const target = clampWordTarget(targetWords);
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length <= target) return trimmed;
  return tokens.slice(0, target).join(' ');
}

/**
 * Builds the LLM messages for a challenge. The humanizer skill is always applied
 * as a system prompt so generated typing content does not sound AI-written.
 * When the user asks for N words, that target overrides the default line range.
 */
export function buildGenerationMessages(
  userPrompt: string,
  domain: ContentDomain,
  length: LengthTarget = resolveLengthTarget(userPrompt)
): ChatMessage[] {
  const userContent = `Generate typing-challenge content from this prompt.

User's prompt: "${userPrompt}"
Content style: ${domain}

Requirements:
${lengthRequirementText(length)}
- Well-structured and readable
- Language: write in the same language (and script) as the user's prompt. If the prompt mixes languages, prefer the dominant non-English language when clear; otherwise follow the prompt's primary language. Never force English.
- Use correct orthography, diacritics, punctuation, and regional conventions for that language (e.g. Spanish ñ/¿¡, French accents, Arabic/Hebrew RTL text, CJK characters, Hindi Devanagari).
- If code: syntactically correct with proper indentation; at most 2-3 short comments in the same language as the prompt when comments are natural
- If prose: clear, well-punctuated, and human-sounding (follow the system humanizer rules strictly). Humanizer AI-tell vocabulary rules apply in English; for other languages avoid the equivalent AI-cliché phrasing.
- No markdown formatting, no code fences, no explanations, no preamble
- No deliberately broken content or tricks
- Output ONLY the content players will type

Content:`;

  return [
    { role: 'system', content: buildHumanizerSystemPrompt(domain) },
    { role: 'user', content: userContent },
  ];
}

function cleanOutput(raw: string): string {
  let text = raw.trim();

  const fenceMatch = text.match(/^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) text = fenceMatch[1]!.trim();
  if (text.startsWith('```')) text = text.replace(/^```\w*\n?/, '').trim();
  if (text.endsWith('```')) text = text.slice(0, -3).trim();

  // Collapse excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

function padToTarget(lines: string[], target: number, filler: (i: number) => string): string {
  let i = 0;
  while (lines.length < target) {
    lines.push(filler(i));
    i += 1;
  }
  return lines.slice(0, MAX_LINES).join('\n');
}

/** Build plain prose and pad/truncate to an exact word count (fallback path). */
function fillToWordCount(seed: string, targetWords: number): string {
  const target = clampWordTarget(targetWords);
  const filler =
    'Keep a steady rhythm while you type. Short accurate bursts beat frantic speed every time. Fix mistakes as you go.';
  let text = seed.trim();
  let words = text.split(/\s+/).filter(Boolean);

  let n = 0;
  while (words.length < target) {
    const extra = filler.split(/\s+/);
    words = words.concat(extra);
    n += 1;
    if (n > 50) break;
  }

  return words.slice(0, target).join(' ');
}

function buildFallbackContent(
  userPrompt: string,
  domain: ContentDomain,
  length: LengthTarget = resolveLengthTarget(userPrompt)
): string {
  const topic = userPrompt.slice(0, 120);

  // Word-target path: keep fallback short and exact.
  if (length.mode === 'words') {
    const seedByDomain: Record<ContentDomain, string> = {
      code: `// Challenge: ${topic}. function processChallenge(input) { const data = Array.isArray(input) ? input : [input]; return data.map((item) => ({ value: item, timestamp: Date.now() })); }`,
      legal: `MEMORANDUM regarding ${topic}. This draft outlines the material facts, applicable standards, and recommended next steps for internal counsel review.`,
      marketing: `Campaign brief for ${topic}. Audience values clarity and craft. Headline: ship work you are proud of faster. Body: practice that transfers to the real job.`,
      technical: `Technical note on ${topic}. Keep the happy path simple and observable. Fail closed on invalid input. Prefer small composable modules over monoliths.`,
      creative: `Opening about ${topic}. The cursor blinked once, patient as a lighthouse, waiting for the first true sentence of the day outside the rain-softened city.`,
      prose: `Typing practice focused on ${topic}. Daily practice is how speed and accuracy stick. Train the hands so the eyes can stay on the words.`,
    };
    return fillToWordCount(seedByDomain[domain] ?? seedByDomain.prose, length.count);
  }

  const target = length.target;
  const lines: string[] = [];

  switch (domain) {
    case 'code':
      lines.push(`// Challenge: ${topic}`);
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
      lines.push('const testInput = "typing-speed-challenge";');
      lines.push('const output = processChallenge(testInput);');
      lines.push('console.log("Processed results:", output);');
      return padToTarget(lines, target, (i) => `  // step ${i + 1}: validate intermediate state`);

    case 'legal':
      lines.push(`MEMORANDUM — ${topic}`);
      lines.push('==================================================');
      lines.push('TO: Reviewing Counsel');
      lines.push('FROM: Associate');
      lines.push('RE: Preliminary analysis and recommended next steps');
      lines.push('');
      lines.push('This memorandum outlines the material facts, applicable standards,');
      lines.push('and a recommended course of action for the matter described above.');
      lines.push('Please treat the following as a working draft for internal review.');
      lines.push('');
      lines.push('I. Statement of Facts');
      lines.push('The parties entered into discussions concerning the obligations set');
      lines.push('forth in the operative agreement. Several provisions require careful');
      lines.push('interpretation in light of recent correspondence and industry practice.');
      return padToTarget(
        lines,
        target,
        (i) =>
          `Section ${i + 2}. Additional analysis regarding ${topic} should consider notice requirements, materiality thresholds, and remedies available to the non-breaching party.`
      );

    case 'marketing':
      lines.push(`Campaign brief: ${topic}`);
      lines.push('==================================================');
      lines.push('Audience: professionals who value clarity, speed, and craft.');
      lines.push('Tone: confident, concrete, and free of jargon.');
      lines.push('');
      lines.push('Headline options:');
      lines.push('1. Ship work you are proud of — faster.');
      lines.push('2. Practice that actually transfers to the real job.');
      lines.push('3. Type with purpose. Measure what matters.');
      lines.push('');
      lines.push('Body copy:');
      lines.push('Great products start with clear language. This challenge trains the');
      lines.push('muscle memory behind every pitch, brief, and product description.');
      return padToTarget(
        lines,
        target,
        (i) =>
          `Proof point ${i + 1}: Teams that practice deliberate typing reduce revision cycles and ship cleaner drafts on ${topic}.`
      );

    case 'technical':
      lines.push(`Technical note: ${topic}`);
      lines.push('==================================================');
      lines.push('Overview');
      lines.push('This document explains the design at a practical level so an engineer');
      lines.push('can implement, review, or operate the system with confidence.');
      lines.push('');
      lines.push('Goals');
      lines.push('- Keep the happy path simple and observable');
      lines.push('- Fail closed on invalid input');
      lines.push('- Prefer small, composable modules over monoliths');
      lines.push('');
      lines.push('Key components');
      lines.push('1. Ingress validates and normalizes requests');
      lines.push('2. Core service applies business rules');
      lines.push('3. Persistence layer stores durable state');
      return padToTarget(
        lines,
        target,
        (i) =>
          `Detail ${i + 1}: For ${topic}, measure latency, error rate, and throughput; alert when any signal leaves its budget.`
      );

    case 'creative':
      lines.push(`Opening — ${topic}`);
      lines.push('==================================================');
      lines.push('The cursor blinked once, patient as a lighthouse, waiting for the first');
      lines.push('true sentence of the day. Outside, the city hummed in low resolution,');
      lines.push('all edges softened by rain and unfinished thoughts.');
      lines.push('');
      lines.push('She typed the prompt the way some people light a match — carefully,');
      lines.push('as if the wrong word might start a fire she could not put out.');
      lines.push('The page answered with more words than courage, and still she stayed.');
      return padToTarget(
        lines,
        target,
        (i) =>
          `Beat ${i + 1}: Another line about ${topic} arrived fully formed, then revised itself mid-breath into something quieter and more honest.`
      );

    default:
      lines.push(`Typing practice: ${topic}`);
      lines.push('==================================================');
      lines.push('Daily practice is how speed and accuracy stick. You train the hands');
      lines.push('so the eyes can stay on the words instead of hunting for keys.');
      lines.push('This block is plain text on purpose — something you can type end to');
      lines.push('end and compare against your last run without gimmicks.');
      lines.push('');
      lines.push(`Today's focus is ${topic}. Keep a steady rhythm. Fix mistakes as you`);
      lines.push('go rather than racing past them and hoping the score forgives you.');
      return padToTarget(
        lines,
        target,
        (i) =>
          `Line ${i + 1}: Keep typing about ${topic}. Short bursts beat frantic speed. Check your posture, then continue.`
      );
  }
}

export type LlmConfig = {
  /** Google AI Studio free-tier API key */
  apiKey: string;
  /** Must resolve to a free intelligent Gemini model; others are remapped */
  model?: string;
};

/**
 * Restricts model choice to free-tier intelligent Gemini models only.
 * Paid, preview-paid, lite, and unknown IDs fall back to the default.
 */
export function resolveFreeIntelligentGeminiModel(raw: string | undefined): FreeIntelligentGeminiModel {
  const id = (raw || DEFAULT_GEMINI_MODEL).replace(/^models\//, '').toLowerCase().trim();
  const match = FREE_INTELLIGENT_GEMINI_MODELS.find((m) => m === id);
  if (match) return match;
  console.warn(
    `[ContentGen] Model "${raw}" is not free+intelligent allowlisted; using ${DEFAULT_GEMINI_MODEL}`
  );
  return DEFAULT_GEMINI_MODEL;
}

/** Token budget: scale down for short word targets; cap for line-mode. */
function maxOutputTokensFor(length: LengthTarget): number {
  if (length.mode === 'words') {
    // ~1.5 tokens/word + headroom for punctuation/newlines
    return Math.min(2048, Math.max(128, Math.ceil(length.count * 2) + 64));
  }
  return 2048;
}

/**
 * Gemini generateContent API (v1beta) — free intelligent models only.
 */
async function generateWithGemini(
  userPrompt: string,
  domain: ContentDomain,
  apiKey: string,
  model: FreeIntelligentGeminiModel,
  length: LengthTarget
): Promise<string> {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  const messages = buildGenerationMessages(userPrompt, domain, length);
  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const user = messages.find((m) => m.role === 'user')?.content ?? userPrompt;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: system }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: user }],
        },
      ],
      generationConfig: {
        temperature: length.mode === 'words' ? 0.25 : 0.35,
        maxOutputTokens: maxOutputTokensFor(length),
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[ContentGen] Gemini API error (${response.status}):`, errorText);
    throw new Error(`Gemini content generation failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim();

  if (!text) throw new Error('Gemini returned empty result');

  return cleanOutput(text);
}

function isUsableContent(content: string, length: LengthTarget): boolean {
  if (!content.trim()) return false;
  if (length.mode === 'words') {
    // Accept anything non-empty; enforceWordCount / fallback handle size.
    return countWords(content) >= Math.min(3, length.count);
  }
  return content.length > 40;
}

export async function generateContent(
  userPrompt: string,
  config: LlmConfig
): Promise<{ content: string; lineCount: number; domain: ContentDomain; wordCount: number }> {
  const domain = detectContentDomain(userPrompt);
  const model = resolveFreeIntelligentGeminiModel(config.model);
  const length = resolveLengthTarget(userPrompt);

  const lengthLabel =
    length.mode === 'words'
      ? `${length.count} words`
      : `${length.min}-${length.max} lines (target ${length.target})`;

  console.log(
    `[ContentGen] Generating for: "${userPrompt}" (${domain}) via gemini/${model} — length: ${lengthLabel}, humanizer on`
  );

  let content = '';
  let success = false;

  try {
    content = await generateWithGemini(userPrompt, domain, config.apiKey, model, length);
    success = isUsableContent(content, length);
  } catch (err) {
    console.error('[ContentGen] gemini generation failed:', err);
  }

  if (!success) {
    console.warn(
      '[ContentGen] Gemini failed or not configured — using fallback content (set gemini_api_key)'
    );
    content = buildFallbackContent(userPrompt, domain, length);
  }

  if (length.mode === 'words') {
    content = enforceWordCount(content, length.count);
    // If still short after LLM (rare), pad via fallback seed merge
    if (countWords(content) < length.count) {
      content = fillToWordCount(content, length.count);
    }
  }

  const lineCount = content.split('\n').length;
  const wordCount = countWords(content);
  console.log(
    `[ContentGen] Generated ${lineCount} lines / ${wordCount} words (requested: ${lengthLabel})`
  );

  return { content, lineCount, domain, wordCount };
}
