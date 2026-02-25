// ==========================================================================
// HTMLActuator — DOM rendering, animations, and UI updates
// ==========================================================================

function HTMLActuator() {
    this.tileContainer = document.querySelector(".tile-container");
    this.scoreContainer = document.querySelector(".score-container");
    this.bestContainer = document.querySelector(".best-container");
    this.movesContainer = document.querySelector(".moves-container");
    this.messageContainer = document.querySelector(".game-message");
    this.gameContainer = document.querySelector(".game-container");
    this.deleteBanner = document.querySelector(".delete-mode-banner");
    this.undoButton = document.querySelector(".undo-button");
    this.deleteButton = document.querySelector(".delete-tile-button");

    this.score = 0;

    // Calculate tile sizes on init and resize
    this._tileSizes = null;
    this._calculateSizes();
    window.addEventListener("resize", this._calculateSizes.bind(this));
}

HTMLActuator.prototype._calculateSizes = function () {
    var container = this.gameContainer;
    if (!container) return;

    var rect = container.getBoundingClientRect();
    var containerSize = rect.width;
    var gridSize = 4;
    var padding = 12;
    var gap = 12;

    var totalGaps = (gridSize - 1) * gap;
    var availableSpace = containerSize - (padding * 2) - totalGaps;
    var cellSize = availableSpace / gridSize;

    this._tileSizes = {
        containerSize: containerSize,
        padding: padding,
        gap: gap,
        cellSize: cellSize,
        step: cellSize + gap
    };
};

HTMLActuator.prototype.actuate = function (grid, metadata) {
    var self = this;

    window.requestAnimationFrame(function () {
        self.clearContainer(self.tileContainer);
        self._calculateSizes();

        grid.cells.forEach(function (column) {
            column.forEach(function (cell) {
                if (cell) self.addTile(cell);
            });
        });

        self.updateScore(metadata.score);
        self.updateBestScore(metadata.bestScore);
        self.updateMoves(metadata.moves);
        self.updateUndoButton(metadata.canUndo);

        if (metadata.terminated) {
            if (metadata.over) {
                self.message(false);
            } else if (metadata.won) {
                self.message(true);
            }
        }
    });
};

HTMLActuator.prototype.continueGame = function () {
    this.clearMessage();
};

HTMLActuator.prototype.clearContainer = function (container) {
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
};

HTMLActuator.prototype.addTile = function (tile) {
    var self = this;
    var sizes = this._tileSizes;
    if (!sizes) return;

    var wrapper = document.createElement("div");
    var inner = document.createElement("div");
    var position = tile.previousPosition || { x: tile.x, y: tile.y };

    var classes = ["tile", "tile-" + tile.value];
    if (tile.value > 2048) classes.push("tile-super");

    // Set tile size
    wrapper.style.width = sizes.cellSize + "px";
    wrapper.style.height = sizes.cellSize + "px";

    // Set position
    var setPos = function (pos) {
        var left = sizes.padding + (pos.x * sizes.step);
        var top = sizes.padding + (pos.y * sizes.step);
        wrapper.style.transform = "translate(" + left + "px, " + top + "px)";
    };

    // Position class for delete-mode click detection
    var posClass = "tile-position-" + (tile.x + 1) + "-" + (tile.y + 1);
    classes.push(posClass);

    setPos(position);

    if (tile.previousPosition) {
        window.requestAnimationFrame(function () {
            setPos({ x: tile.x, y: tile.y });
            // Update position class
            wrapper.className = wrapper.className.replace(/tile-position-\d+-\d+/, "tile-position-" + (tile.x + 1) + "-" + (tile.y + 1));
        });
    } else if (tile.mergedFrom) {
        classes.push("tile-merged");
        tile.mergedFrom.forEach(function (merged) {
            self.addTile(merged);
        });
    } else {
        classes.push("tile-new");
    }

    this.applyClasses(wrapper, classes);
    inner.classList.add("tile-inner");
    inner.textContent = tile.value;

    wrapper.appendChild(inner);
    this.tileContainer.appendChild(wrapper);
};

HTMLActuator.prototype.applyClasses = function (element, classes) {
    element.setAttribute("class", classes.join(" "));
};

HTMLActuator.prototype.updateScore = function (score) {
    this.clearContainer(this.scoreContainer);
    var difference = score - this.score;
    this.score = score;
    this.scoreContainer.textContent = this.score;

    if (difference > 0) {
        var addition = document.createElement("div");
        addition.classList.add("score-addition");
        addition.textContent = "+" + difference;
        this.scoreContainer.appendChild(addition);
    }
};

HTMLActuator.prototype.updateBestScore = function (bestScore) {
    this.bestContainer.textContent = bestScore;
};

HTMLActuator.prototype.updateMoves = function (moves) {
    if (this.movesContainer) {
        this.movesContainer.textContent = moves || 0;
    }
};

HTMLActuator.prototype.updateUndoButton = function (canUndo) {
    if (this.undoButton) {
        this.undoButton.disabled = !canUndo;
    }
};

HTMLActuator.prototype.message = function (won) {
    var type = won ? "game-won" : "game-over";
    var message = won ? "You win!" : "Game over!";

    this.messageContainer.classList.add(type);
    this.messageContainer.getElementsByTagName("p")[0].textContent = message;
};

HTMLActuator.prototype.clearMessage = function () {
    this.messageContainer.classList.remove("game-won");
    this.messageContainer.classList.remove("game-over");
};

// Delete mode UI
HTMLActuator.prototype.setDeleteMode = function (active) {
    if (active) {
        this.gameContainer.classList.add("delete-mode");
        this.deleteBanner.style.display = "flex";
        this.deleteButton.classList.add("active");
    } else {
        this.gameContainer.classList.remove("delete-mode");
        this.deleteBanner.style.display = "none";
        this.deleteButton.classList.remove("active");
    }
};

HTMLActuator.prototype.animateDeleteTile = function (element, callback) {
    element.classList.add("tile-deleted");
    element.addEventListener("animationend", function () {
        if (callback) callback();
    });
};
