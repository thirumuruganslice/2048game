# 🌌 2048 Galaxy

**Merge the cosmos. Reach the core.**

A space-themed twist on the classic 2048 puzzle game — built with pure HTML, CSS, and JavaScript. Slide numbered tiles across a 4×4 grid, merge matching values, and reach **2048** to win. Features immersive space visuals, procedural sound effects, and three strategic power-ups to give you an edge.

---

## 🎮 How to Play

### Basic Controls

#### ⌨️ Keyboard

- **Move tiles** — Arrow keys (`↑` `↓` `←` `→`) or `W` `A` `S` `D`
- **Undo** — Click **↩ Undo** button
- **Swap tiles** — Click **⇄ Swap** or press `X`
- **Remove tile** — Click **⊗ Remove** or press `B`
- **New game** — Click **New Game**
- **Toggle sound** — Click **🔊** button

#### 📱 Mobile

- **Move tiles** — Swipe in any direction
- **Undo** — Tap **↩ Undo**
- **Swap tiles** — Tap **⇄ Swap**
- **Remove tile** — Tap **⊗ Remove**
- **New game** — Tap **New Game**
- **Toggle sound** — Tap **🔊**

### Rules

1. **Slide** — Use arrow keys or swipe to slide all tiles in one direction.
2. **Merge** — When two tiles with the **same number** collide, they merge into one tile with **double the value** (e.g. `2 + 2 = 4`, `4 + 4 = 8`).
3. **Spawn** — After every move, a new tile (`2` or `4`) appears on a random empty cell.
4. **Score** — Each merge adds the resulting tile's value to your score.
5. **Goal** — Create a tile with the value **2048** to win!
6. **Keep playing** — After reaching 2048, you can continue to push for an even higher score.

---

## ⚡ Power-Ups

You have **three special abilities** to use strategically. Each has a limited number of uses per game — spend them wisely.

### ↩ Undo (2 uses)

Revert the board to its state before your last move. Tiles slide back smoothly to their previous positions. Use it to recover from a costly mistake.

### ⇄ Swap (2 uses)

Exchange the positions of **any two tiles** on the board.

1. Activate swap mode (click button or press `X`).
2. Click/tap the **first tile** — it glows to confirm selection.
3. Click/tap the **second tile** — both tiles glow briefly, then swap positions.

> Tap the same tile again to deselect. Making a regular move cancels swap mode.

### ⊗ Remove (2 uses)

Destroy **any single tile** from the board with a crimson sparkle dissolve effect.

1. Activate remove mode (click button or press `B`).
2. Click/tap the tile you want to remove — it dissolves and is gone.

> Remove is only available when more than 2 tiles are on the board.

---

## 🏆 Goal

**Create the 2048 tile.** Merge smaller tiles together to build up to 2048. Once you reach it, you win! You can then choose to keep playing and push your score even higher.

---

## 💀 Game Over

The game ends when:

- The **board is full** (all 16 cells occupied), **and**
- **No adjacent tiles** share the same value (no possible merges left).

When no moves remain, it's game over. Hit **Play Again** to start fresh.

---

## 💡 Tips

- Build your highest-value tile in a **corner** and keep it there.
- Move in **one primary direction** as much as possible to stay organised.
- **Save power-ups** for tight spots — an undo, swap, or remove at the right moment can save a run.

---

## ✨ What Makes It Special

### 🌠 Space Theme

A fully immersive cosmic experience — animated star fields, drifting nebulae, and a rotating black hole in the background. Every tile tier has its own distinct color inspired by the galaxy.

### 🔊 Procedural Sound

All sounds are generated in real-time using the **Web Audio API** — no audio files. Every action has its own unique sound: tile slides, merges (with tier-based tones), spawns, undo, swap, remove, win, and game over.

### 🎆 Merge Animations

Tiles merge with space-themed shockwave and glow effects. Higher-value tiles trigger increasingly intense visual effects — particle bursts, pulsing rings, and color shifts that match the cosmic aesthetic.

### 🔴 Remove Effect

Removing a tile triggers crimson sparkle particles, dark ember trails, and an expanding red glow ring — a clean, professional dissolve effect with a matching whoosh sound.

### 📱 Fully Responsive

Plays seamlessly on desktop, tablet, and mobile. Touch swipe controls, adaptive grid sizing, and optimized layouts for screens of all sizes.

### 💾 Local Storage

Your **best score** is saved automatically and persists across sessions.

---

## 🗂 Project Structure

```
2048game/
├── index.html              # Main game page
├── style/
│   ├── main.css            # Core layout, tiles, responsive design
│   └── space-animations.css # Space effects — merges, remove, glows
├── js/
│   ├── application.js      # App entry point
│   ├── game_manager.js     # Core game logic, moves, power-ups
│   ├── grid.js             # 4×4 grid data structure
│   ├── tile.js             # Tile model
│   ├── input_manager.js    # Keyboard, touch, and button input
│   ├── html_actuator.js    # DOM rendering and animations
│   ├── sound_manager.js    # Procedural Web Audio sound effects
│   ├── space-effects.js    # Background space particle effects
│   └── storage_manager.js  # LocalStorage for best score
└── README.md
```

---

## 🚀 Getting Started

No build tools or dependencies required. Just open the game in your browser:

1. Clone or download this repository.
2. Open `index.html` in any modern browser.
3. Play!

```bash
# Or serve locally
cd 2048game
npx serve .
```

---

## 🛠 Built With

- **HTML5** — Semantic markup
- **CSS3** — Grid layout, keyframe animations, custom properties, responsive design
- **Vanilla JavaScript** — No frameworks, no libraries
- **Web Audio API** — Procedural sound synthesis

---

## 📜 License

This project is open source and available for personal use and learning.

---

<p align="center">
  <strong>2048 Galaxy</strong> — Merge the cosmos. Reach the core. 🌌
</p>
