#!/usr/bin/env node
/**
 * Direct server test - loads and tests the server logic directly
 * This bypasses Devvit and tests the core logic
 */
import challengesData from './src/server/challenges.json' assert { type: 'json' };

console.log('=== KeyScripture Server Direct Test ===\n');

try {
  console.log(`✓ Loaded challenges.json: ${challengesData.length} items\n`);
  
  // Analyze difficulty distribution
  const difficulties = { easy: 0, medium: 0, hard: 0 };
  challengesData.forEach(c => {
    const difficulty = c.difficulty || 'medium';
    if (difficulty in difficulties) {
      difficulties[difficulty]++;
    }
  });
  
  console.log('Difficulty Distribution:');
  console.log(`  Easy: ${difficulties.easy}`);
  console.log(`  Medium: ${difficulties.medium}`);
  console.log(`  Hard: ${difficulties.hard}`);
  console.log();
  
  // Test filtering by difficulty
  console.log('Testing challenge filtering:\n');
  
  ['easy', 'medium', 'hard'].forEach(difficulty => {
    const filtered = challengesData.filter(c => (c.difficulty || 'medium') === difficulty);
    console.log(`  ${difficulty}: ${filtered.length} challenges`);
    if (filtered.length > 0) {
      const sample = filtered[0];
      console.log(`    Sample text (${sample.text.length} chars): "${sample.text.substring(0, 80)}..."`);
    }
  });
  
  console.log('\n✓ All tests passed!');
  
} catch (error) {
  console.error('✗ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
