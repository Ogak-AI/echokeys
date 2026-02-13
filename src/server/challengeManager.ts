import { GameChallenge } from '../shared/types/socket.js';

export class ChallengeManager {
  private challenges: GameChallenge[] = [];

  constructor(initialChallenges: GameChallenge[]) {
    this.challenges = initialChallenges;
    console.log(`[ChallengeManager] Initialized with ${this.challenges.length} challenges.`);
  }

  getRandomChallenge(difficulty: 'easy' | 'medium' | 'hard'): GameChallenge {
    const difficultyChallenges = this.challenges.filter((c) => c.difficulty === difficulty);
    if (difficultyChallenges.length === 0) {
      // Fallback to any challenge if no challenges for the requested difficulty
      const fallback = this.challenges[0] || {
        id: 'fallback',
        text: 'The quick brown fox jumps over the lazy dog.',
        difficulty: 'easy',
      };
      return fallback;
    }

    const randomIndex = Math.floor(Math.random() * difficultyChallenges.length);
    return difficultyChallenges[randomIndex]!;
  }

  getAllChallenges(): GameChallenge[] {
    return this.challenges;
  }
}
