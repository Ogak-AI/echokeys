import type { Difficulty, Language } from '../../shared/types/index.js';

const HF_API_URL = 'https://api-inference.huggingface.co/models/';

interface GenerateCodeResult {
  code: string;
  lineCount: number;
}

const LINE_RANGES: Record<Difficulty, { min: number; max: number }> = {
  easy: { min: 25, max: 50 },
  medium: { min: 75, max: 150 },
  hard: { min: 200, max: 300 },
};

const LANGUAGE_NAMES: Record<Language, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
};

function buildPrompt(concept: string, language: Language, difficulty: Difficulty): string {
  const range = LINE_RANGES[difficulty];
  const langName = LANGUAGE_NAMES[language];
  const targetLines = Math.floor((range.min + range.max) / 2);

  return `You are a code generator. Write clean, working ${langName} code for the following concept:

"${concept}"

Requirements:
- Write exactly around ${targetLines} lines of code (minimum ${range.min}, maximum ${range.max})
- The code must be syntactically correct and complete
- Use clean, readable formatting with proper indentation
- Minimal comments (at most 2-3 short inline comments)
- No markdown formatting, no code fences, no explanations — output ONLY the raw code
- No deliberately broken or obfuscated code
- Use realistic variable and function names
- The code should be a complete, working implementation

Output ONLY the ${langName} code, nothing else:`;
}

function cleanGeneratedCode(raw: string, language: Language): string {
  let code = raw.trim();

  // Remove markdown code fences if present
  const fencePattern = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = code.match(fencePattern);
  if (match) {
    code = match[1]!.trim();
  }

  // Remove leading ``` without closing
  if (code.startsWith('```')) {
    code = code.replace(/^```\w*\n?/, '').trim();
  }

  // Remove any trailing ``` 
  if (code.endsWith('```')) {
    code = code.slice(0, -3).trim();
  }

  // Remove any leading prose before actual code
  const codeStartPatterns: Record<string, RegExp> = {
    python: /^(import |from |def |class |#|@|\n)/m,
    javascript: /^(import |export |const |let |var |function |class |\/\/|\n)/m,
    typescript: /^(import |export |const |let |var |function |class |interface |type |\/\/|\n)/m,
    go: /^(package |import |func |type |var |const |\/\/|\n)/m,
    rust: /^(use |mod |fn |struct |enum |impl |pub |\/\/|#|\n)/m,
    java: /^(import |package |public |private |class |interface |\/\/|\n)/m,
    c: /^(#include |#define |int |void |char |struct |\/\/|\/\*|\n)/m,
    cpp: /^(#include |#define |using |int |void |class |struct |namespace |\/\/|\/\*|\n)/m,
  };

  const pattern = codeStartPatterns[language];
  if (pattern) {
    const codeMatch = code.match(pattern);
    if (codeMatch && codeMatch.index && codeMatch.index > 0) {
      code = code.slice(codeMatch.index);
    }
  }

  return code;
}

function buildFallbackCode(concept: string, language: Language): string {
  const title = concept.trim().replace(/\s+/g, ' ');
  const safeTitle = title.length > 60 ? `${title.slice(0, 57)}...` : title;

  switch (language) {
    case 'python':
      return `def solve(problem):
    """Handle the requested challenge: ${safeTitle}"""
    return {"concept": problem, "status": "ready"}


if __name__ == "__main__":
    print(solve("${safeTitle}"))`;
    case 'javascript':
    case 'typescript':
      return `function solve(problem) {
  return { concept: problem, status: 'ready' };
}

console.log(solve('${safeTitle}'));`;
    case 'go':
      return `package main

import "fmt"

func solve(problem string) string {
    return fmt.Sprintf("concept=%s status=ready", problem)
}

func main() {
    fmt.Println(solve("${safeTitle}"))
}`;
    case 'rust':
      return `fn solve(problem: &str) -> String {
    format!("concept={} status=ready", problem)
}

fn main() {
    println!("{}", solve("${safeTitle}"));
}`;
    default:
      return `int main(void) {
    return 0;
}`;
  }
}

export async function generateCode(
  concept: string,
  language: Language,
  difficulty: Difficulty
): Promise<GenerateCodeResult> {
  const token = process.env.HF_API_TOKEN;
  const model = process.env.HF_MODEL || 'Qwen/Qwen2.5-Coder-32B-Instruct';
  const range = LINE_RANGES[difficulty];

  console.log(`[CodeGen] Generating ${language} code for: "${concept}" (${difficulty})`);

  if (!token) {
    console.warn('[CodeGen] HF_API_TOKEN not set, using local fallback generator');
    const fallback = buildFallbackCode(concept, language);
    return { code: fallback, lineCount: fallback.split('\n').length };
  }

  try {
    const response = await fetch(`${HF_API_URL}${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: buildPrompt(concept, language, difficulty),
        parameters: {
          max_new_tokens: 4096,
          temperature: 0.3,
          top_p: 0.9,
          return_full_text: false,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[CodeGen] HF API error (${response.status}):`, errorText);
      throw new Error(`Code generation failed: ${response.status} — ${errorText}`);
    }

    const data = await response.json() as Array<{ generated_text: string }>;
    if (!data || !data[0] || !data[0].generated_text) {
      throw new Error('Code generation returned empty result');
    }

    const code = cleanGeneratedCode(data[0].generated_text, language);
    const lineCount = code.split('\n').length;

    console.log(`[CodeGen] Generated ${lineCount} lines (target: ${range.min}-${range.max})`);

    return { code, lineCount };
  } catch (error) {
    console.warn('[CodeGen] Falling back to local generator because remote generation failed:', error);
    const fallback = buildFallbackCode(concept, language);
    return { code: fallback, lineCount: fallback.split('\n').length };
  }
}
