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
    this.undoBtn = document.querySelector(".undo-button");
    this.undoCount = document.querySelector(".undo-count");
    this.exchangeBtn = document.querySelector(".exchange-button");
    this.exchangeCount = document.querySelector(".exchange-count");
    this.swapHint = document.querySelector(".swap-hint");
    this._s = null;
    this._isUndo = false;
    this._isExchange = false;
    this._exchangeMode = false;
    this._exchangeFirst = null;
    this._exchangeSecond = null;
    this._exchangePending = false;
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
    this._isUndo = !!meta.isUndo;
    this._isExchange = !!meta.isExchange;
    this._exchangeMode = !!meta.exchangeMode;
    this._exchangeFirst = meta.exchangeFirst || null;
    this._exchangeSecond = meta.exchangeSecond || null;
    this._exchangePending = !!meta.exchangePending;
    this._measure();
    this._clear();
    grid.cells.forEach(function (col) {
        col.forEach(function (tile) {
            if (tile) self._drawTile(tile);
        });
    });
    if (this.scoreEl) this.scoreEl.textContent = meta.score;
    if (this.bestEl) this.bestEl.textContent = meta.bestScore;
    /* Update undo button state */
    if (this.undoCount) this.undoCount.textContent = meta.undosLeft;
    if (this.undoBtn) {
        this.undoBtn.disabled = !meta.canUndo;
        this.undoBtn.classList.toggle("undo-exhausted", meta.undosLeft <= 0);
    }
    /* Update exchange button state */
    if (this.exchangeCount) this.exchangeCount.textContent = meta.exchangesLeft;
    if (this.exchangeBtn) {
        this.exchangeBtn.disabled = !meta.canExchange;
        this.exchangeBtn.classList.toggle("exchange-active", this._exchangeMode);
        this.exchangeBtn.classList.toggle("exchange-exhausted", meta.exchangesLeft <= 0);
    }
    /* Board shell class for exchange-mode cursor */
    if (this.shell) this.shell.classList.toggle("exchange-mode", this._exchangeMode);
    /* Swap hint banner — shows context text while in exchange mode */
    if (this.swapHint) {
        if (this._exchangeMode) {
            if (this._exchangePending) {
                this.swapHint.textContent = "\u2605 Swapping...";
                this.swapHint.classList.add("step2", "pending");
            } else if (this._exchangeFirst) {
                this.swapHint.textContent = "\u2726 Now click a tile to swap with it";
                this.swapHint.classList.add("step2");
                this.swapHint.classList.remove("pending");
            } else {
                this.swapHint.textContent = "\u2726 Click a tile to select it";
                this.swapHint.classList.remove("step2", "pending");
            }
            this.swapHint.classList.add("visible");
        } else {
            this.swapHint.classList.remove("visible", "step2", "pending");
        }
    }
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

// ---- Swap burst particles -----------------------------------------------
// Injects 12 star-shaped divs around `el` at the arc peak (~130ms).
// Each star flies outward along a unique angle, then fades out.
// They are appended to tile-container so they share the same coord space.

HTMLActuator.prototype._fireSwapBurst = function (el) {
    var self = this;
    var STARS = 12;
    var COLORS = [
        "#ffd700", "#ffe84d", "#fff176", "#ffffff",
        "#ffb300", "#ff8f00", "#fffde7", "#80ffea",
        "#00e5ff", "#b2ebf2", "#ffd54f", "#fff9c4"
    ];

    // Fire at arc peak (130ms) so stars burst outward while tiles are still scaling up
    setTimeout(function () {
        var rect = el.getBoundingClientRect();
        var cRect = self.tiles.getBoundingClientRect();
        // Centre of the tile in tile-container coordinates
        var cx = (rect.left + rect.width / 2) - cRect.left;
        var cy = (rect.top + rect.height / 2) - cRect.top;

        for (var i = 0; i < STARS; i++) {
            var star = document.createElement("div");
            star.className = "swap-star";
            var angleDeg = (i / STARS) * 360 + (Math.random() - 0.5) * 22;
            var angleRad = angleDeg * Math.PI / 180;
            var dist = 38 + Math.random() * 28;
            var tx = Math.cos(angleRad) * dist;     // final x offset in px
            var ty = Math.sin(angleRad) * dist;     // final y offset in px
            var size = 4 + Math.random() * 5;
            var color = COLORS[i % COLORS.length];
            star.style.cssText = [
                "left:" + cx + "px",
                "top:" + cy + "px",
                "width:" + size + "px",
                "height:" + size + "px",
                "--tx:" + tx + "px",
                "--ty:" + ty + "px",
                "background:" + color,
                "animation-delay:" + (Math.random() * 40) + "ms"
            ].join(";");
            self.tiles.appendChild(star);
            // Clean up after animation completes (700ms + max delay)
            setTimeout(function (s) {
                if (s.parentNode) s.parentNode.removeChild(s);
            }, 780, star);
        }
    }, 130);
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

    // Store grid position as data attrs — used by exchange tile-click
    el.setAttribute("data-gx", tile.x);
    el.setAttribute("data-gy", tile.y);

    // Start at the "from" position — no transition active yet
    var from = tile.previousPosition || { x: tile.x, y: tile.y };
    var fromPos = this._pos(from.x, from.y);
    el.style.left = fromPos.left + "px";
    el.style.top = fromPos.top + "px";

    // Exchange mode: dull all tiles; mark first and/or second selected
    if (!isGhost && this._exchangeMode) {
        el.classList.add("tile-exchangeable");
        var first = this._exchangeFirst;
        var second = this._exchangeSecond;
        if (first && first.x === tile.x && first.y === tile.y) {
            el.classList.add("tile-exchange-selected");
        }
        if (second && second.x === tile.x && second.y === tile.y) {
            el.classList.add("tile-exchange-selected", "tile-exchange-second");
        }
    }

    inner.className = "tile-inner-text";
    inner.textContent = tile.value;
    el.appendChild(inner);
    this.tiles.appendChild(el);

    // Force layout flush — browser locks in the "from" state before
    // we enable the transition and change position.
    void el.getBoundingClientRect();

    if (isGhost) {
        // Ghost: slide to merge destination AND fade to invisible simultaneously.
        el.classList.add("tile-ghost", "tile-moving");
        el.style.opacity = "0";
        var ghostTo = this._pos(tile.x, tile.y);
        el.style.left = ghostTo.left + "px";
        el.style.top = ghostTo.top + "px";

    } else if (tile.previousPosition) {
        // Normal slide — no merge (or undo slide-back or exchange swap)
        if (this._isUndo) {
            el.classList.add("tile-moving", "tile-undo-moving");
        } else if (this._isExchange) {
            el.classList.add("tile-moving", "tile-exchange-swap");
        } else {
            el.classList.add("tile-moving");
        }
        var toPos = this._pos(tile.x, tile.y);
        el.style.left = toPos.left + "px";
        el.style.top = toPos.top + "px";
        // Fire star burst at arc peak for exchange swaps
        if (this._isExchange) {
            this._fireSwapBurst(el);
        }

    } else if (tile.mergedFrom) {
        // Merged result — pop in after ghosts have slid away (CSS 0.12s delay)
        el.classList.add("tile-merged", "sfx-shimmer");

        // Fire space collision effect once the tile has painted at its position.
        // The 170ms delay matches the slide (120ms) + pop-delay (12ms) + small buffer.
        ; (function (capturedEl, capturedValue) {
            setTimeout(function () {
                if (typeof SpaceEffects !== "undefined") {
                    SpaceEffects.trigger(capturedValue, capturedEl);
                }
            }, 170);
        }(el, tile.value));

    } else {
        // Brand-new spawned tile  OR  an undo-restored tile
        if (this._isUndo) {
            // Stagger each tile slightly so they don't all pop at the same frame
            var undoDelay = Math.round(Math.random() * 60);
            el.style.animationDelay = undoDelay + "ms";
            el.classList.add("tile-undo-split");
            // Fire per-tile fission effect at this tile's position
            ; (function (capturedEl, delay) {
                setTimeout(function () {
                    if (typeof SpaceEffects !== "undefined") {
                        SpaceEffects.triggerTileSplit(capturedEl);
                    }
                }, delay + 40);
            }(el, undoDelay));
        } else if (tile.justSpawned) {
            // Only brand-new spawned tiles get the pop-in animation
            el.classList.add("tile-new");
        }
        // Otherwise the tile exists unchanged on the board (exchange-mode
        // toggle / first-tile selection) — render it silently, no animation.
    }
};

// ---- Overlay -------------------------------------------------------------

HTMLActuator.prototype._showMessage = function (text, type) {
    this.msgText.textContent = text;
    this.message.classList.add("active", type);
};
