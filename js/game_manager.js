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

    this.addStartTiles();
    this.actuate();
};

GameManager.prototype.restart = function () {
    this.actuator.hideMessage();
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
    this.grid.insertTile(tile);
};

// ---- Move ----------------------------------------------------------------

// direction: 0 = up | 1 = right | 2 = down | 3 = left
GameManager.prototype.move = function (direction) {
    if (this.isTerminated()) return;

    var self = this;
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

                if (merged.value === 2048) self.won = true;
            } else {
                self.moveTile(tile, positions.farthest);
            }

            if (!self.posEqual(cell, tile)) moved = true;
        });
    });

    if (moved) {
        this.spawnTile();
        if (!this.movesAvailable()) this.over = true;
        this.actuate();
    }
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
    this.actuator.render(this.grid, {
        over: this.over,
        won: this.won,
        terminated: this.isTerminated(),
        score: this.score,
        bestScore: this.bestScore
    });
};
