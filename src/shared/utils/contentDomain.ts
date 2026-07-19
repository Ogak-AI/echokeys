import type { ContentDomain } from '../types/index.js';

export function detectContentDomain(prompt: string): ContentDomain {
  const p = prompt.toLowerCase();

  if (/\b(code|function|algorithm|class|api|rust|python|javascript|typescript|java|sql|regex|binary search|recursive)\b/.test(p)) {
    return 'code';
  }
  if (/\b(legal|contract|brief|law|attorney|clause|litigation|compliance)\b/.test(p)) {
    return 'legal';
  }
  if (/\b(marketing|pitch|copy|brand|campaign|launch email|tagline|headline)\b/.test(p)) {
    return 'marketing';
  }
  if (/\b(technical|documentation|architecture|explain|tutorial|guide|spec)\b/.test(p)) {
    return 'technical';
  }
  if (/\b(story|creative|poem|fiction|novel|opening|narrative)\b/.test(p)) {
    return 'creative';
  }

  return 'prose';
}
