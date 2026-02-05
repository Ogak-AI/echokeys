import { GameChallenge } from '../shared/types/socket.js';
import challengesData from './challenges.json' assert { type: 'json' };

export class ChallengeManager {
  private challenges: GameChallenge[] = [];

  constructor() {
    this.loadChallenges();
  }

  private loadChallenges(): void {
    try {
      // Load challenges from the JSON file
      if (Array.isArray(challengesData) && challengesData.length > 0) {
        this.challenges = challengesData.map((challenge: any, index: number) => ({
          id: `challenge-${index}`,
          text: (challenge.text || '').trim(),
          difficulty: (challenge.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
        }));
        console.log(`Loaded ${this.challenges.length} challenges from JSON`);
      } else {
        throw new Error('Invalid challenges data');
      }
    } catch (error) {
      console.error('Failed to load challenges:', error);
      // Fallback challenges
      this.challenges = [
        {
          id: 'fallback-easy',
          text: 'The quick brown fox jumps over the lazy dog.',
          difficulty: 'easy'
        },
        {
          id: 'fallback-medium',
          text: 'In the beginning was the Word, and the Word was with God, and the Word was God.',
          difficulty: 'medium'
        },
        {
          id: 'fallback-hard',
          text: 'Now in the days of Ahasuerus, that is, the Ahasuerus who ruled over 127 provinces from India to Ethiopia.',
          difficulty: 'hard'
        }
      ];
    }
  }

  getRandomChallenge(difficulty: 'easy' | 'medium' | 'hard'): GameChallenge {
    const difficultyChallenges = this.challenges.filter(c => c.difficulty === difficulty);
    if (difficultyChallenges.length === 0) {
      // Fallback to any challenge if no challenges for the requested difficulty
      const fallback = this.challenges[0] || {
        id: 'fallback',
        text: 'The quick brown fox jumps over the lazy dog.',
        difficulty: 'easy'
      };
      return fallback;
    }

    const randomIndex = Math.floor(Math.random() * difficultyChallenges.length);
    return difficultyChallenges[randomIndex];
  }

  getAllChallenges(): GameChallenge[] {
    return this.challenges;
  }
}
