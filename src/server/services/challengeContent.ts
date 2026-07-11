import type { Difficulty, Language } from '../../shared/types/index.js';
import { DIFFICULTY_CONFIG } from '../../shared/types/index.js';

export interface GeneratedChallengeContent {
  text: string;
  lineCount: number;
  contentType: string;
  domain: string;
}

function normalize(value: string | undefined, fallback: string): string {
  return (value || fallback).trim().toLowerCase();
}

function wrapLines(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function buildTextChallenge(concept: string, contentType: string, domain: string, difficulty: Difficulty): string {
  const safeConcept = concept.replace(/\s+/g, ' ').trim();
  const safeDomain = domain || 'general';
  const difficultyLabel = DIFFICULTY_CONFIG[difficulty].label.toLowerCase();

  switch (contentType) {
    case 'marketing':
      return wrapLines(`Marketing brief for ${safeConcept}
Subject: Launch a ${difficultyLabel} campaign for ${safeDomain}
Opening line: We are preparing a focused, high-impact campaign for ${safeConcept} that speaks directly to customers and keeps the message clear.
Call to action: Join the early access list and see how this idea turns into momentum.`);
    case 'legal':
      return wrapLines(`Legal draft for ${safeConcept}
The parties acknowledge the purpose of ${safeConcept} and agree to proceed with reasonable care in ${safeDomain} matters.
This document outlines the responsibilities, timelines, and review steps required before any final action is taken.`);
    case 'creative':
      return wrapLines(`Creative prompt: ${safeConcept}
Set the scene in ${safeDomain} with vivid details, confident pacing, and a memorable ending.
The narrator moves through layered imagery while keeping the tone precise, reflective, and emotionally grounded.`);
    case 'technical':
      return wrapLines(`Technical brief for ${safeConcept}
The ${safeDomain} workflow begins with a clear requirement, a reliable review loop, and measurable outcomes.
The implementation plan should emphasize readability, testability, and observability so the system remains easy to maintain.`);
    default:
      return wrapLines(`Typing prompt: ${safeConcept}
This ${difficultyLabel} challenge focuses on ${safeDomain} content that should feel coherent, readable, and ready to type without extra explanation.
The passage is designed to be accurate, varied, and engaging while preserving a steady rhythm for practice.`);
  }
}

export function generateChallengeContent(
  concept: string,
  contentType: string | undefined,
  domain: string | undefined,
  difficulty: Difficulty,
  _language?: Language
): GeneratedChallengeContent {
  const safeContentType = normalize(contentType, 'general');
  const safeDomain = normalize(domain, 'general');
  const text = buildTextChallenge(concept, safeContentType, safeDomain, difficulty);
  const lines = text.split('\n').length;

  return {
    text,
    lineCount: Math.max(1, lines),
    contentType: safeContentType,
    domain: safeDomain,
  };
}
