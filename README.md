# KeyScripture - Social Typing Game for Reddit

KeyScripture is an innovative **social typing game** built on Reddit's Devvit platform that transforms typing practice into an engaging multiplayer experience. Players type through text challenges while competing with the Reddit community in real-time, featuring live spectating, intelligent audio feedback, and comprehensive progress tracking.

## What KeyScripture Is

KeyScripture is a **community-driven typing game** that runs directly within Reddit posts, combining the best of typing practice with social gaming:

- **Real-time multiplayer spectating** - Watch other Reddit users type live as they play
- **Intelligent audio feedback** - Hear each word pronounced as you complete it correctly  
- **Three-tier difficulty system** - Choose from Easy, Medium, or Hard text challenges
- **Community leaderboards** - Compete directly with fellow Redditors on shared scoreboards
- **Seamless Reddit integration** - Play without leaving the Reddit ecosystem
- **Live game discovery** - Browse and spectate active typing sessions from other players

The game transforms the traditionally solitary act of typing practice into a **social spectator sport** where every keystroke matters and the community can witness your progress in real-time.

## What Makes KeyScripture Innovative

### 1. **Live Spectator System**
- **Real-time game watching**: Other players can watch your typing session live with 2-second updates
- **Active games browser**: Discover and join ongoing games from community members  
- **Live progress visualization**: Spectators see your typing progress, errors, and corrections in real-time
- **Game completion notifications**: Spectators are notified when games end with final scores

### 2. **Intelligent Audio Feedback Engine**
- **Word-completion pronunciation**: Hear each word spoken aloud as you type it correctly
- **Smart speech synthesis**: Uses Web Speech API with optimized rate (1.2x) and pitch
- **Context-aware audio**: Only speaks completed words, not partial typing
- **Instant mute/unmute**: Toggle audio feedback during gameplay without interruption

### 3. **Advanced Visual Interface**
- **Smart text windowing**: Displays exactly 110 characters with cursor positioned 40 characters from the start for optimal readability
- **Real-time error highlighting**: Immediate visual feedback with white (correct), red (incorrect), and animated cursor positioning
- **Responsive mobile design**: Optimized interface that works seamlessly on both desktop and mobile Reddit
- **Progress-aware scrolling**: Text window automatically advances as you type, maintaining optimal viewing

### 4. **Reddit-Native Social Integration**
- **Automatic user authentication**: Leverages Reddit's built-in authentication system
- **Community leaderboards**: Compete directly with fellow Redditors using real usernames
- **Post-embedded gameplay**: Games live within Reddit posts, not external websites
- **Moderator integration**: Easy post creation through Reddit's moderator menu system

### 5. **Comprehensive Performance Analytics**
- **Real-time metrics**: Live WPM and accuracy calculation during gameplay
- **Personal statistics dashboard**: Track best WPM, highest accuracy, total games played, and current streaks
- **Historical performance**: Monitor improvement over time across different difficulty levels
- **Automatic score submission**: Seamless leaderboard integration with instant ranking updates

### Content and Challenges

#### Challenge Content
KeyScripture features **biblical text passages** from the Book of Esther, providing:
- **Meaningful content**: Rich, narrative text that's engaging to type rather than random words
- **Varied complexity**: Different passages offer natural difficulty progression
- **Cultural significance**: Classic literature that many users will find familiar and meaningful
- **Proper punctuation practice**: Real-world text with authentic punctuation, capitalization, and formatting

#### Difficulty Levels
- **Easy**: Shorter passages with simpler sentence structures and common vocabulary
- **Medium**: Moderate-length passages with mixed sentence complexity and standard punctuation
- **Hard**: Longer, more complex passages with advanced vocabulary, intricate punctuation, and challenging formatting

The biblical text provides a consistent, high-quality typing experience that's more engaging than typical "lorem ipsum" or random word generators used in other typing games.

## Core Features
- **Three-Difficulty Challenge System**: Choose from Easy, Medium, and Hard typing challenges with varying text complexity
- **Real-time Performance Metrics**: Live WPM (Words Per Minute) and accuracy tracking with instant updates during gameplay
- **Intelligent Audio Feedback**: Hear words pronounced as you type them correctly, with smart word-completion detection
- **Advanced Text Display**: Smart windowing system showing 110 characters with optimal cursor positioning for readability
- **Instant Error Feedback**: Real-time visual highlighting of correct (white) vs incorrect (red) characters with animated cursor

### Social Features  
- **Live Spectator Mode**: Watch other Reddit users type in real-time with 2-second update intervals
- **Active Games Discovery**: Browse and join ongoing typing sessions from community members
- **Community Leaderboards**: Compete with fellow Redditors and see global rankings with usernames
- **Real-time Game Broadcasting**: Your typing session is automatically broadcast for others to spectate
- **Game Completion Notifications**: Spectators see when games end with final performance scores

### Progress Tracking
- **Personal Statistics Dashboard**: Track your best WPM, highest accuracy percentage, total games played, and current streaks  
- **Historical Performance**: Monitor improvement over time across different difficulty levels
- **Automatic Score Submission**: Seamless leaderboard integration with instant ranking updates after each game
- **Session Persistence**: Game state is maintained and broadcast to spectators throughout your typing session

### Technical Features
- **Reddit-Native Integration**: Seamlessly integrated into Reddit posts with native authentication and user management
- **Mobile-Optimized Interface**: Responsive design that works perfectly on both desktop and mobile Reddit browsers
- **Robust Error Handling**: Graceful degradation when servers are unavailable, showing empty game lists instead of error messages
- **Automatic Cleanup**: Smart session management that removes players from active games when they leave or finish
- **Cross-Platform Audio**: Web Speech API integration that works across different devices and browsers
- **Auto-Recovery Systems**: Automatic reconnection and retry mechanisms for network interruptions

## Tech Stack

- [Devvit](https://developers.reddit.com/): Reddit's developer platform for immersive apps
- [React](https://react.dev/): Modern UI framework
- [TypeScript](https://www.typescriptlang.org/): Type-safe development
- [Tailwind CSS](https://tailwindcss.com/): Utility-first styling
- [Express](https://expressjs.com/): Backend API
- [Redis](https://redis.io/): Data storage

## Getting Started

> Make sure you have Node 22 downloaded on your machine before running!

1. Clone this repository
2. Run `npm install`
3. Run `npm run login` to authenticate with Reddit
4. Run `npm run dev` to start development
5. Create a new post using the moderator menu to test the app

## Commands

- `npm run dev`: Starts development server with live reloading
- `npm run build`: Builds client and server for production
- `npm run deploy`: Uploads new version to Reddit
- `npm run launch`: Publishes app for community review
- `npm run check`: Runs type checking, linting, and formatting

## How to Play KeyScripture

### Getting Started
1. **Access the Game**: Find a KeyScripture post on Reddit or create one using the moderator menu in your subreddit
2. **Launch the App**: Click the "Start Typing!" button on the splash screen to open the game in full-screen mode  
3. **Optional - Spectate First**: Click "Watch" to see active games and observe other players before starting your own game

### Playing a Typing Challenge

#### Step 1: Choose Your Difficulty Level
When you start the game, you'll see three difficulty options:
- **Easy**: Beginner-friendly text passages with simple vocabulary and shorter sentences
- **Medium**: Moderate typing challenges with mixed complexity and punctuation  
- **Hard**: Advanced challenges featuring complex text, technical terms, and intricate punctuation

#### Step 2: Begin Your Typing Session
- Click "Start Typing!" to begin the selected challenge
- The timer starts immediately when you type your first character
- Your game becomes **live and visible** to other players who can spectate in real-time
- Type the displayed text exactly as shown, including all punctuation, spacing, and capitalization

#### Step 3: Real-Time Feedback and Performance
**Visual Feedback System:**
- **White text** = correctly typed characters
- **Red highlighted text** = typing errors that need correction
- **Animated blinking cursor** = shows your current position in the text
- **Smart text window** = displays ~110 characters with your cursor optimally positioned

**Audio Feedback System:**
- **Word pronunciation** = hear each word spoken aloud as you complete it correctly
- **Mute/Unmute toggle** = click the sound button to disable/enable audio during gameplay
- **Smart detection** = only completed words are spoken, not partial typing

**Live Performance Metrics:**
- **WPM (Words Per Minute)** = calculated as (characters typed ÷ 5) ÷ minutes elapsed
- **Accuracy Percentage** = percentage of correctly typed characters in real-time
- **Progress indicator** = visual progress through the text passage

#### Step 4: Complete the Challenge
- Type the entire passage to finish the challenge (you must reach 100% completion)
- Your final WPM and accuracy will be calculated and displayed in a completion summary
- Your score is **automatically submitted** to the community leaderboard
- The game ends and you're removed from the "active games" list that spectators see

#### Step 5: Review Performance and Continue
**Performance Summary:**
- View your final WPM and accuracy percentage
- See how your performance compares to your personal bests
- Check if you achieved a new high score

**Next Actions:**
- **"Try Again"** = attempt a new challenge (returns to difficulty selection)
- **"Leaderboard"** = view community rankings and see where you placed
- **Return to splash** = go back to the main menu to start fresh or spectate others

### Spectator Mode (Watching Live Games)

#### Discovering Active Games
1. From the splash screen, click **"Watch"** to enter spectator mode
2. You'll see a list of players currently typing with live indicators (or "No active games right now" if no one is playing)
3. The list **auto-refreshes every 10 seconds** to show current active games
4. If server issues occur, the system gracefully shows an empty list rather than error messages
5. Click on any username to watch their game in real-time

#### Watching a Live Typing Session
**Real-Time Spectator View:**
- See the exact text they're typing with **live progress highlighting**
- Watch their **current WPM and accuracy** update as they type
- Observe their **typing errors and corrections** in real-time with color coding
- View their **progress percentage** through the challenge

**Spectator Interface Features:**
- **2-second update intervals** = game state refreshes automatically for smooth viewing
- **Difficulty indicator** = see what challenge level they're attempting  
- **Connection status** = automatic reconnection if connection is lost
- **Game completion alerts** = notification when the player finishes with final scores

#### Spectator Controls
- **"Back" button** = return to the active games list
- **"Retry Connection"** = manually refresh if connection issues occur (appears only when needed)
- **Auto-refresh** = spectator view updates automatically every 2 seconds
- **Graceful error handling** = system shows helpful messages instead of technical errors
- **Game end handling** = automatic notification when watched games complete

### Pro Tips for Better Performance

#### Typing Technique
- **Accuracy over speed** = focus on typing correctly rather than rushing (accuracy heavily impacts final score)
- **Maintain rhythm** = keep a steady, consistent pace rather than bursts of speed
- **Use proper posture** = sit up straight with wrists floating above the keyboard
- **Look ahead** = read 2-3 words ahead of where you're currently typing

#### Using Game Features
- **Enable audio cues** = use word pronunciation to confirm correct typing and maintain rhythm
- **Watch the cursor** = the animated cursor shows exactly where you are in the text
- **Learn from errors** = red highlighting shows mistakes immediately for quick correction
- **Practice different difficulties** = gradually work up from Easy to Hard challenges

#### Learning from Others
- **Spectate skilled players** = watch high-performing typists to learn techniques and pacing
- **Observe error patterns** = see how experienced players handle corrections and difficult passages
- **Study different approaches** = watch various typing styles and find what works for you
- **Check leaderboards** = see what WPM and accuracy combinations lead to top scores

### Understanding Your Statistics

#### Performance Metrics
- **WPM (Words Per Minute)** = standard typing speed measurement (characters ÷ 5 ÷ minutes)
- **Accuracy Percentage** = ratio of correctly typed characters to total characters typed
- **Best WPM** = your highest words-per-minute achievement across all games
- **Best Accuracy** = your highest accuracy percentage achieved in any completed game

#### Progress Tracking
- **Total Games** = number of typing challenges you've completed successfully
- **Current Streak** = consecutive games played (may reset after periods of inactivity)
- **Difficulty Progress** = track improvement across Easy, Medium, and Hard challenges
- **Leaderboard Ranking** = see how you compare to other community members

#### Score Calculation
- **Final scores** consider both speed (WPM) and accuracy percentage
- **Higher accuracy** is often more valuable than raw speed for leaderboard ranking
- **Consistent performance** across multiple games builds better statistics than single high scores
- **Challenge difficulty** may influence how scores are weighted or displayed

## Contributing

Contributions welcome! This is a community-driven typing game for Reddit.
