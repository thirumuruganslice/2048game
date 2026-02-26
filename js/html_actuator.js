// ==========================================================================
// HTMLActuator — renders tiles, score, slide animations, win/lose overlay
// ==========================================================================

function HTMLActuator() {
    this.shell = document.querySelector(".board-shell");
    this.tiles = document.querySelector(".tile-container");
    this.message = document.querySelector(".game-message");
    this.msgText = document.querySelector(".game-message-text");
    this.scoreEl = document.querySelector(".score-value");
    this.bestEl = document.querySelector(".best-value");
    this._s = null;
}

// Read actual rendered cell positions from the DOM — no math guessing.
// Uses tile-container as the reference so that `left/top` values placed on
// absolutely-positioned tiles land exactly on the correct grid cell.
HTMLActuator.prototype._measure = function () {
    var firstCell = document.querySelector(".grid-cell");
    if (!firstCell) return;
    // tile-container is the containing block for absolutely-positioned tiles,
    // so we measure offset relative to IT, not the board-shell.
    var containerRect = this.tiles.getBoundingClientRect();
    var cellRect = firstCell.getBoundingClientRect();
    var gapPx = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--gap")
    ) || 12;
    this._s = {
        ox: cellRect.left - containerRect.left,
        oy: cellRect.top - containerRect.top,
        cell: cellRect.width,
        step: cellRect.width + gapPx
    };
};

// px position of a grid coordinate (col, row)
HTMLActuator.prototype._pos = function (col, row) {
    var s = this._s;
    return { left: s.ox + col * s.step, top: s.oy + row * s.step };
};

// ---- Main render ---------------------------------------------------------

HTMLActuator.prototype.render = function (grid, meta) {
    var self = this;
    this._measure();
    this._clear();
    grid.cells.forEach(function (col) {
        col.forEach(function (tile) {
            if (tile) self._drawTile(tile);
        });
    });
    if (this.scoreEl) this.scoreEl.textContent = meta.score;
    if (this.bestEl) this.bestEl.textContent = meta.bestScore;
    if (meta.terminated) {
        if (meta.over) self._showMessage("Mission Failed", "over");
        else if (meta.won) self._showMessage("You reached 2048!", "won");
    }
};

HTMLActuator.prototype.hideMessage = function () {
    this.message.classList.remove("active", "over", "won");
};

HTMLActuator.prototype._clear = function () {
    while (this.tiles.firstChild) this.tiles.removeChild(this.tiles.firstChild);
};

// ---- Draw a single tile --------------------------------------------------
// isGhost = true when drawing the pre-merge source tiles (they slide + fade out)

HTMLActuator.prototype._drawTile = function (tile, isGhost) {
    var self = this;
    var s = this._s;
    if (!s) return;

    // Recurse: draw the two source tiles as slide-out ghosts FIRST so they
    // sit beneath the merged result tile.
    if (!isGhost && tile.mergedFrom) {
        tile.mergedFrom.forEach(function (t) { self._drawTile(t, true); });
    }

    var el = document.createElement("div");
    var inner = document.createElement("span");

    var valClass = tile.value > 2048 ? "tile-super" : "tile-" + tile.value;
    el.className = "tile " + valClass;
    el.style.width = s.cell + "px";
    el.style.height = s.cell + "px";

    // Start at the "from" position — no transition active yet
    var from = tile.previousPosition || { x: tile.x, y: tile.y };
    var fromPos = this._pos(from.x, from.y);
    el.style.left = fromPos.left + "px";
    el.style.top = fromPos.top + "px";

    inner.className = "tile-inner-text";
    inner.textContent = tile.value;
    el.appendChild(inner);
    this.tiles.appendChild(el);

    // Force layout flush — browser locks in the "from" state before
    // we enable the transition and change position.
    void el.getBoundingClientRect();

    if (isGhost) {
        // Ghost: slide to merge destination AND fade to invisible simultaneously.
        // The merged result tile pops in on top after the slide finishes (CSS delay).
        el.classList.add("tile-ghost", "tile-moving");
        el.style.opacity = "0";
        var ghostTo = this._pos(tile.x, tile.y);
        el.style.left = ghostTo.left + "px";
        el.style.top = ghostTo.top + "px";

    } else if (tile.previousPosition) {
        // Normal slide — no merge
        el.classList.add("tile-moving");
        var toPos = this._pos(tile.x, tile.y);
        el.style.left = toPos.left + "px";
        el.style.top = toPos.top + "px";

    } else if (tile.mergedFrom) {
        // Merged result — pop in after ghosts have slid away (CSS 0.12s delay)
        el.classList.add("tile-merged");

    } else {
        // Brand-new spawned tile
        el.classList.add("tile-new");
    }
};

// ---- Overlay -------------------------------------------------------------

HTMLActuator.prototype._showMessage = function (text, type) {
    this.msgText.textContent = text;
    this.message.classList.add("active", type);
};
