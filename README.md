# Echokeys (formerly KeyScripture)

Echokeys is an innovative **social typing game** built on Reddit's Devvit platform that transforms typing practice into an engaging multiplayer experience. Players type through biblical text challenges while competing with the Reddit community in real-time.

## Key Features

- **Real-time Multiplayer:** Compete with other Redditors in live typing challenges.
- **Multiple Difficulty Levels:** Choose from Easy, Medium, and Hard challenges, with content from the Book of Esther.
- **Intelligent Audio Feedback:** Hear each word pronounced as you type it correctly.
- **Community Leaderboards:** See how you rank against other players.
- **Seamless Reddit Integration:** Play directly within the Reddit interface without leaving the site.
- **Performance Analytics:** Track your Words Per Minute (WPM), accuracy, and other stats.

## Tech Stack

- **Platform:** [Devvit](https://developers.reddit.com/)
- **Frontend:** [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS](https://tailwindcss.com/)
- **Backend:** [Express.js](https://expressjs.com/) running in the Devvit environment.
- **Build Tool:** [Vite](https://vitejs.dev/)
- **Data Storage:** Devvit's built-in Key-Value store for session and leaderboard data.

## Getting Started

> **Prerequisite:** You must have Node.js v22 or higher installed.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/echokeys.git
    cd echokeys
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Authenticate with Devvit:**
    ```bash
    npm run login
    ```
4.  **Start the development server:**
    ```bash
    npm run dev
    ```
5.  To test the app, create a new post in a development subreddit using the moderator menu.

## Available Scripts

-   `npm run dev`: Starts the development server and a `devvit playtest` session.
-   `npm run build`: Compiles the client and server code into the `dist/` directory.
-   `npm run deploy`: Uploads the built application to Devvit.
-   `npm run check`: Runs type checking, linting, and formatting.
-   `npm run login`: Authenticates the Devvit CLI with your Reddit account.

## Project Structure

```
.
├── src/
│   ├── client/       # React frontend code
│   ├── server/       # Express.js backend and Devvit integration
│   └── shared/       # Shared types and code between client and server
├── devvit.json       # Devvit application configuration
└── package.json      # Project dependencies and scripts
```

## License

This project is licensed under the [LICENSE](LICENSE) file.