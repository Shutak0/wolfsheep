# 🐺 WolfSheep

> Online strategy board game inspired by Quoridor. Two players duel on a 9×9 grid. One hunts, the other escapes.

[**wolfsheep.fun**](https://wolfsheep.fun/) — play in your browser, no installation required.

## 🎮 About the Game

WolfSheep is a turn-based strategy game where two players face off with asymmetric roles:

| Role | Goal |
|------|------|
| 🐺 **Wolf** | Catch the opponent by moving onto their cell |
| 🐑 **Sheep** | Reach the far side of the board (row 8) |

Each player has **10 walls** to place on the board, blocking paths and forcing the opponent to reroute. Every turn you choose: move, jump over the enemy, or place a wall.

### Time Controls

| Mode | Format | Style |
|------|--------|-------|
| ⚡ PLAY | 1 min + 5 sec increment | Blitz |
| 🔥 3+2 | 3 min + 2 sec increment | Rapid |
| 💎 5 min | 5 min, no increment | Classic |

## ✨ Features

- **Real-time multiplayer** — automatic matchmaking with ELO rating
- **AI Bot** — train against the computer
- **Leaderboard** — compete for the top spot
- **Three time controls** — pick your pace
- **Guest play** — no registration required
- **Google login** — optional account for tracking stats
- **Replay system** — review past games, watch how others play
- **Video export** — download replays as WebM or MP4
- **PWA support** — install on mobile/home screen
- **Emotes** — express yourself during matches
- **i18n** — English and Russian languages

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vanilla JavaScript, HTML5 Canvas, CSS3 |
| **Backend** | Node.js, Express |
| **Real-time** | Socket.IO (WebSocket) |
| **Auth** | JWT + Google OAuth |
| **Storage** | File-based JSON database |
| **Video** | ffmpeg (fluent-ffmpeg), mp4-muxer |
| **Analytics** | Umami (self-hosted) |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [npm](https://www.npmjs.com/) v9+
- [ffmpeg](https://ffmpeg.org/) (for video export)

### Installation

```bash
# Clone the repository
git clone https://github.com/Shutak0/wolfsheep.git
cd wolfsheep

# Install server dependencies
cd server
npm install

# Configure environment
# Create a .env file in /server with:
#   GOOGLE_CLIENT_ID=your-google-oauth-client-id
#   JWT_SECRET=your-random-secret-string
#   PORT=3000  (optional, defaults to 3000)

# Start the server
npm start

# For development with auto-reload:
npm run dev
```

The server starts on `http://localhost:3000`. Open it in your browser and start playing.

### Project Structure

```
wolfsheep/
├── client/
│   └── public/          # Static frontend files
│       ├── index.html   # Home page
│       ├── game.html    # Game board
│       ├── js/          # Client-side JS modules
│       ├── css/         # Styles
│       └── imgs/        # Images & icons
├── server/
│   ├── src/
│   │   ├── app.js       # Express + Socket.IO entry point
│   │   ├── auth.js      # Authentication (JWT, Google)
│   │   ├── game-store.js # Game state management
│   │   ├── room-manager.js # Matchmaking & rooms
│   │   ├── bot-engine.js   # AI bot logic
│   │   └── engine/      # Game logic
│   ├── data/            # JSON database files
│   └── package.json
└── package.json
```

## 🏗 Architecture

```
Browser (Canvas + Socket.IO client)
        │
        ▼ WebSocket
┌─────────────────┐
│   Socket.IO     │
│   (real-time)   │
├─────────────────┤
│   Express API   │ ← REST for auth, profiles, replays
├─────────────────┤
│   Game Engine   │ ← Board state, move validation, ELO calc
├─────────────────┤
│   JSON Store    │ ← File-based persistence
└─────────────────┘
```

## 📄 License

This project is open source. See the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

Built with ❤️ by an indie developer passionate about strategy games.

- 🐙 GitHub: [@Shutak0](https://github.com/Shutak0)
- 📧 Email: shutakswm@gmail.com