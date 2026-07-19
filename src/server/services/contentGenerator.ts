import type { ContentDomain } from '../../shared/types/index.js';
import { detectContentDomain } from '../../shared/utils/contentDomain.js';

const MIN_LINES = 25;
const MAX_LINES = 50;

function buildPrompt(userPrompt: string, domain: ContentDomain): string {
  const target = Math.floor((MIN_LINES + MAX_LINES) / 2);

  return `You are a content generator for a typing challenge game. Players will type your output character-for-character. Generate clean, well-formatted content based on the user's prompt.

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

function buildFallbackContent(userPrompt: string, domain: ContentDomain): string {
  const target = Math.floor((MIN_LINES + MAX_LINES) / 2);
  const lines: string[] = [];
  const topic = userPrompt.slice(0, 120);

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
      lines.push(`Title: Typing Practice — ${topic}`);
      lines.push('==================================================');
      lines.push('Practicing your typing skills regularly is one of the most effective');
      lines.push('ways to improve both speed and accuracy. Consistent daily execution');
      lines.push('helps build muscle memory so you do not need to look at the keys.');
      lines.push('This challenge provides structured text so you can measure progress');
      lines.push('without leaving the flow of real writing work.');
      return padToTarget(
        lines,
        target,
        (i) =>
          `Line ${i + 1}: Practice precision and rhythm while typing about ${topic}. Steady hands beat rushed keystrokes every time.`
      );
  }
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
      Authorization: `Bearer ${apiKey}`,
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
    headers.Authorization = `Bearer ${apiKey}`;
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
  config: LlmConfig
): Promise<{ content: string; lineCount: number; domain: ContentDomain }> {
  const domain = detectContentDomain(userPrompt);

  console.log(`[ContentGen] Generating for: "${userPrompt}" (${domain})`);

  let content = '';
  let success = false;
  const provider = (config.provider || 'huggingface').toLowerCase();

  // Groq requires a key. Hugging Face may work without one on public models.
  const tryGroq = provider === 'groq' && !!config.groq.apiKey;
  const tryHf = provider === 'huggingface' || (!tryGroq && provider !== 'groq');

  if (tryGroq) {
    try {
      content = await generateWithGroq(userPrompt, domain, config.groq.apiKey, config.groq.model);
      success = content.length > 40;
    } catch (err) {
      console.error('[ContentGen] groq generation failed:', err);
    }
  }

  if (!success && tryHf) {
    try {
      content = await generateWithHuggingFace(
        userPrompt,
        domain,
        config.huggingface.apiKey,
        config.huggingface.model
      );
      success = content.length > 40;
    } catch (err) {
      console.error('[ContentGen] huggingface generation failed:', err);
    }
  }

  if (!success) {
    console.warn('[ContentGen] Provider failed or not configured — using fallback content');
    content = buildFallbackContent(userPrompt, domain);
  }

  const lineCount = content.split('\n').length;
  console.log(`[ContentGen] Generated ${lineCount} lines (target: ${MIN_LINES}-${MAX_LINES})`);

  return { content, lineCount, domain };
}
