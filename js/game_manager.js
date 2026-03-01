// ==========================================================================
// GameManager — core game logic (movement, merging, win/lose, no scoring)
// ==========================================================================

function GameManager(size, InputManager, Actuator) {
    this.size = size;
    this.input = new InputManager();
    this.storage = new LocalStorageManager();
    this.actuator = new Actuator();
    this.startTiles = 2;
    this.score = 0;
    this.bestScore = this.storage.getBestScore();

    this.input.on("move", this.move.bind(this));
    this.input.on("restart", this.restart.bind(this));
    this.input.on("undo", this.undo.bind(this));
    this.input.on("exchangeToggle", this.exchangeToggle.bind(this));
    this.input.on("tileClick", this.handleTileClick.bind(this));

    this.setup();
}

// ---- Lifecycle ----------------------------------------------------------

GameManager.prototype.setup = function () {
    this.grid = new Grid(this.size);
    this.over = false;
    this.won = false;
    this.keepPlaying = false;
    this.score = 0;
    this.bestScore = this.storage.getBestScore();
    this.undoStack = [];   // holds up to 2 snapshots (serial undo)
    this.undosUsed = 0;    // hard cap: max 2 undos per game
    this._undoFired = false;
    this.exchangesUsed = 0;  // hard cap: max 2 exchanges per game
    this._exchangeMode = false;
    this._exchangeFirst = null;
    this._exchangeSecond = null;   // second tile chosen — both glow before swap fires
    this._exchangePending = false; // true during the 600ms preview window
    this._exchangeFired = false;

    this.addStartTiles();
    this.actuate();
};

GameManager.prototype.restart = function () {
    this.actuator.hideMessage();
    if (typeof SoundManager !== "undefined") SoundManager.resetTerminal();
    this.setup();
};

GameManager.prototype.keepGoingAfterWin = function () {
    this.keepPlaying = true;
    this.actuator.hideMessage();
};

// ---- Tile spawning -------------------------------------------------------

GameManager.prototype.addStartTiles = function () {
    for (var i = 0; i < this.startTiles; i++) {
        this.spawnTile();
    }
};

// 90 % chance of 2, 10 % chance of 4
GameManager.prototype.spawnTile = function () {
    if (!this.grid.cellsAvailable()) return;
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);
    tile.justSpawned = true; // flag so renderer knows this is a brand-new tile
    this.grid.insertTile(tile);
    if (typeof SoundManager !== "undefined") SoundManager.play("spawn");
};

// ---- Move ----------------------------------------------------------------

// direction: 0 = up | 1 = right | 2 = down | 3 = left
GameManager.prototype.move = function (direction) {
    if (this.isTerminated()) return;

    var self = this;
    var stateBeforeMove = this._snapshotState();
    var vector = this.getVector(direction);
    var trav = this.buildTraversals(vector);
    var moved = false;

    this.prepareGrid();

    trav.x.forEach(function (x) {
        trav.y.forEach(function (y) {
            var cell = { x: x, y: y };
            var tile = self.grid.cellContent(cell);
            if (!tile) return;

            var positions = self.findFarthest(cell, vector);
            var next = self.grid.cellContent(positions.next);

            // merge if same value and not already merged this turn
            if (next && next.value === tile.value && !next.mergedFrom) {
                var merged = new Tile(positions.next, tile.value * 2);
                merged.mergedFrom = [tile, next];
                self.grid.insertTile(merged);
                self.grid.removeTile(tile);
                tile.updatePosition(positions.next);

                self.score += merged.value;
                if (self.score > self.bestScore) {
                    self.bestScore = self.score;
                    self.storage.setBestScore(self.bestScore);
                }

                if (typeof SoundManager !== "undefined") SoundManager.play("merge");

                if (merged.value === 2048) {
                    self.won = true;
                    if (typeof SoundManager !== "undefined") SoundManager.play("win");
                }
            } else {
                self.moveTile(tile, positions.farthest);
            }

            if (!self.posEqual(cell, tile)) moved = true;
        });
    });

    if (moved) {
        // Cancel exchange mode if player made a regular move
        if (this._exchangeMode) {
            this._exchangeMode = false;
            this._exchangeFirst = null;
        }
        // Only store undo history if the cap hasn't been hit yet
        if (this.undosUsed < 2) {
            this.undoStack.push(stateBeforeMove);
            if (this.undoStack.length > 2) this.undoStack.shift();
        }
        if (typeof SoundManager !== "undefined") SoundManager.play("move");
        this.spawnTile();
        if (!this.movesAvailable()) {
            this.over = true;
            if (typeof SoundManager !== "undefined") SoundManager.play("gameover");
        }
        this.actuate();
    }
};

// ---- Exchange -----------------------------------------------------------

// Clear merge/spawn/previousPosition state on every tile so the actuator
// won't replay ghost slides or pop-in animations during exchange mode renders.
GameManager.prototype._clearMergeState = function () {
    this.grid.eachCell(function (x, y, tile) {
        if (tile) {
            tile.mergedFrom = null;
            tile.previousPosition = null;
            tile.justSpawned = false;
        }
    });
};

GameManager.prototype.exchangeToggle = function () {
    if (this.isTerminated()) return;
    if (this.exchangesUsed >= 2) return;
    if (this._exchangePending) return; // don't cancel while swap is mid-flight
    this._clearMergeState(); // prevent ghost replay when entering exchange mode
    this._exchangeMode = !this._exchangeMode;
    if (!this._exchangeMode && typeof SoundManager !== "undefined") SoundManager.stopPowerUp();
    this._exchangeFirst = null;
    this._exchangeSecond = null;
    this.actuate();
};

GameManager.prototype.handleTileClick = function (pos) {
    if (!this._exchangeMode || this.isTerminated()) return;
    if (this._exchangePending) return; // locked during preview window
    var tile = this.grid.cellContent(pos);
    if (!tile) return; // clicked an empty cell — ignore

    if (!this._exchangeFirst) {
        // First tile selected
        this._clearMergeState(); // prevent ghost replay while in selection state
        this._exchangeFirst = { x: pos.x, y: pos.y };
        if (typeof SoundManager !== "undefined") SoundManager.play("swapSelect");
        this.actuate();
    } else {
        // Same tile tapped again — deselect
        if (this._exchangeFirst.x === pos.x && this._exchangeFirst.y === pos.y) {
            this._exchangeFirst = null;
            if (typeof SoundManager !== "undefined") SoundManager.stopPowerUp();
            this.actuate();
            return;
        }
        // Second tile chosen — show BOTH tiles glowing for 600ms, then swap
        this._exchangeSecond = { x: pos.x, y: pos.y };
        this._exchangePending = true;
        this._clearMergeState();
        if (typeof SoundManager !== "undefined") SoundManager.play("swapConfirm");
        this.actuate(); // render: both tiles highlighted

        var self = this;
        setTimeout(function () {
            self._doExchange(self._exchangeFirst, self._exchangeSecond);
            self._exchangeFirst = null;
            self._exchangeSecond = null;
            self._exchangePending = false;
            self._exchangeMode = false;
            self.exchangesUsed++;
            self._exchangeFired = true;
            self.actuate(); // render: swap slides execute
        }, 620);
    }
};

GameManager.prototype._doExchange = function (pos1, pos2) {
    if (typeof SoundManager !== "undefined") SoundManager.play("swap");
    var tile1 = this.grid.cells[pos1.x][pos1.y];
    var tile2 = this.grid.cells[pos2.x][pos2.y];
    // Wipe any leftover merge/spawn flags so only the clean positional
    // slide animation runs — no ghost tiles, no pop-in, no SpaceEffects.
    if (tile1) { tile1.mergedFrom = null; tile1.justSpawned = false; }
    if (tile2) { tile2.mergedFrom = null; tile2.justSpawned = false; }
    if (tile1) { tile1.savePosition(); tile1.updatePosition(pos2); }
    if (tile2) { tile2.savePosition(); tile2.updatePosition(pos1); }
    this.grid.cells[pos2.x][pos2.y] = tile1 || null;
    this.grid.cells[pos1.x][pos1.y] = tile2 || null;
};

// ---- Undo ---------------------------------------------------------------

GameManager.prototype._snapshotState = function () {
    var cells = [];
    for (var x = 0; x < this.size; x++) {
        cells[x] = [];
        for (var y = 0; y < this.size; y++) {
            var tile = this.grid.cells[x][y];
            cells[x][y] = tile ? { value: tile.value } : null;
        }
    }
    return { cells: cells, score: this.score, over: this.over, won: this.won };
};

GameManager.prototype.undo = function () {
    if (this.isTerminated()) return;   // freeze after game over / win
    if (this.undoStack.length === 0 || this.undosUsed >= 2) return;

    var snap = this.undoStack.pop();
    this.undosUsed++;

    // ── Collect current tile positions for smooth slide-back animation ──
    // Each entry: { x, y, value }
    var currentPool = [];
    for (var cx = 0; cx < this.size; cx++) {
        for (var cy = 0; cy < this.size; cy++) {
            if (this.grid.cells[cx][cy]) {
                currentPool.push({
                    x: cx, y: cy,
                    value: this.grid.cells[cx][cy].value,
                    used: false
                });
            }
        }
    }

    // ── Restore grid, setting previousPosition where we can match ──
    this.grid = new Grid(this.size);
    for (var rx = 0; rx < this.size; rx++) {
        for (var ry = 0; ry < this.size; ry++) {
            if (!snap.cells[rx][ry]) continue;
            var restoredTile = new Tile({ x: rx, y: ry }, snap.cells[rx][ry].value);

            // Find the nearest unused current tile with the same value
            var bestIdx = -1;
            var bestDist = Infinity;
            for (var pi = 0; pi < currentPool.length; pi++) {
                if (currentPool[pi].used) continue;
                if (currentPool[pi].value !== snap.cells[rx][ry].value) continue;
                var d = Math.abs(currentPool[pi].x - rx) + Math.abs(currentPool[pi].y - ry);
                if (d < bestDist) { bestDist = d; bestIdx = pi; }
            }
            // Only set previousPosition if the tile actually moved
            if (bestIdx >= 0 && bestDist > 0) {
                restoredTile.previousPosition = {
                    x: currentPool[bestIdx].x,
                    y: currentPool[bestIdx].y
                };
                currentPool[bestIdx].used = true;
            }

            this.grid.cells[rx][ry] = restoredTile;
        }
    }

    this.score = snap.score;
    this.over = snap.over;
    this.won = snap.won;

    this._undoFired = true;
    if (typeof SoundManager !== "undefined") SoundManager.play("undo");
    this.actuate();
};

// ---- Helpers -------------------------------------------------------------

// snapshot positions, clear merge info before each move
GameManager.prototype.prepareGrid = function () {
    this.grid.eachCell(function (x, y, tile) {
        if (tile) {
            tile.mergedFrom = null;
            tile.savePosition();
        }
    });
};

GameManager.prototype.moveTile = function (tile, cell) {
    this.grid.cells[tile.x][tile.y] = null;
    this.grid.cells[cell.x][cell.y] = tile;
    tile.updatePosition(cell);
};

// direction vectors
GameManager.prototype.getVector = function (dir) {
    var map = {
        0: { x: 0, y: -1 }, // up
        1: { x: 1, y: 0 }, // right
        2: { x: 0, y: 1 }, // down
        3: { x: -1, y: 0 }  // left
    };
    return map[dir];
};

// traversal order (always move away from the target edge first)
GameManager.prototype.buildTraversals = function (vec) {
    var t = { x: [], y: [] };
    for (var i = 0; i < this.size; i++) {
        t.x.push(i);
        t.y.push(i);
    }
    if (vec.x === 1) t.x.reverse();
    if (vec.y === 1) t.y.reverse();
    return t;
};

// slide a position along the vector until a wall or occupied cell
GameManager.prototype.findFarthest = function (cell, vec) {
    var prev;
    do {
        prev = cell;
        cell = { x: prev.x + vec.x, y: prev.y + vec.y };
    } while (this.grid.withinBounds(cell) && this.grid.cellAvailable(cell));

    return { farthest: prev, next: cell };
};

GameManager.prototype.movesAvailable = function () {
    return this.grid.cellsAvailable() || this.matchesAvailable();
};

GameManager.prototype.matchesAvailable = function () {
    var self = this;
    for (var x = 0; x < this.size; x++) {
        for (var y = 0; y < this.size; y++) {
            var tile = this.grid.cellContent({ x: x, y: y });
            if (!tile) continue;
            for (var d = 0; d < 4; d++) {
                var vec = self.getVector(d);
                var other = self.grid.cellContent({ x: x + vec.x, y: y + vec.y });
                if (other && other.value === tile.value) return true;
            }
        }
    }
    return false;
};

GameManager.prototype.posEqual = function (a, b) {
    return a.x === b.x && a.y === b.y;
};

GameManager.prototype.isTerminated = function () {
    return this.over || (this.won && !this.keepPlaying);
};

// ---- Render --------------------------------------------------------------

GameManager.prototype.actuate = function () {
    var isUndo = !!this._undoFired;
    this._undoFired = false;
    var isExchange = !!this._exchangeFired;
    this._exchangeFired = false;
    this.actuator.render(this.grid, {
        over: this.over,
        won: this.won,
        terminated: this.isTerminated(),
        score: this.score,
        bestScore: this.bestScore,
        undosLeft: Math.max(0, 2 - this.undosUsed),
        canUndo: this.undoStack.length > 0 && this.undosUsed < 2 && !this.isTerminated(),
        isUndo: isUndo,
        exchangesLeft: Math.max(0, 2 - this.exchangesUsed),
        canExchange: this.exchangesUsed < 2 && !this.isTerminated(),
        exchangeMode: this._exchangeMode,
        exchangeFirst: this._exchangeFirst,
        exchangeSecond: this._exchangeSecond,
        exchangePending: this._exchangePending,
        isExchange: isExchange
    });
};
