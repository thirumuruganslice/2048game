// ==========================================================================
// InputManager — keyboard + swipe + button events
// Emit: "move" (0–3) | "restart"
// ==========================================================================

function InputManager() {
    this.events = {};
    this.touchStart = null;
    this.listen();
}

InputManager.prototype.on = function (event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
};

InputManager.prototype.emit = function (event, data) {
    var callbacks = this.events[event];
    if (callbacks) {
        callbacks.forEach(function (callback) { callback(data); });
    }
};

InputManager.prototype.listen = function () {
    var self = this;

    // ---- Keyboard -------------------------------------------------------
    var KEY = {
        37: 3, // ← left
        38: 0, // ↑ up
        39: 1, // → right
        40: 2, // ↓ down
        65: 3, // A
        87: 0, // W
        68: 1, // D
        83: 2  // S
    };

    document.addEventListener("keydown", function (e) {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        var dir = KEY[e.which];
        if (dir !== undefined) {
            e.preventDefault();
            self.emit("move", dir);
        }
        // R → restart
        if (e.which === 82) { e.preventDefault(); self.emit("restart"); }
    });

    // ---- Buttons --------------------------------------------------------
    [".retry-button", ".new-game-button"].forEach(function (sel) {
        var btn = document.querySelector(sel);
        if (btn) btn.addEventListener("click", function (e) {
            e.preventDefault();
            self.emit("restart");
        });
    });

    var undoBtn = document.querySelector(".undo-button");
    if (undoBtn) undoBtn.addEventListener("click", function (e) {
        e.preventDefault();
        self.emit("undo");
    });

    var exchangeBtn = document.querySelector(".exchange-button");
    if (exchangeBtn) exchangeBtn.addEventListener("click", function (e) {
        e.preventDefault();
        self.emit("exchangeToggle");
    });

    var removeBtn = document.querySelector(".remove-button");
    if (removeBtn) removeBtn.addEventListener("click", function (e) {
        e.preventDefault();
        self.emit("removeToggle");
    });

    // Delegated tile click — used by exchange mode to pick tiles
    var tileContainer = document.querySelector(".tile-container");
    if (tileContainer) tileContainer.addEventListener("click", function (e) {
        var el = e.target;
        while (el && el !== tileContainer) {
            if (el.classList && el.classList.contains("tile")) {
                var gx = parseInt(el.getAttribute("data-gx"), 10);
                var gy = parseInt(el.getAttribute("data-gy"), 10);
                if (!isNaN(gx) && !isNaN(gy)) self.emit("tileClick", { x: gx, y: gy });
                return;
            }
            el = el.parentElement;
        }
    });

    // Keyboard shortcut: Ctrl+Z or Z for undo | X for exchange toggle
    document.addEventListener("keydown", function (e) {
        if (e.altKey || e.metaKey) return;
        if (e.key === "z" || e.key === "Z") {
            if (!e.ctrlKey) { e.preventDefault(); self.emit("undo"); }
        }
        if (e.key === "x" || e.key === "X") {
            e.preventDefault(); self.emit("exchangeToggle");
        }
        if (e.key === "b" || e.key === "B") {
            e.preventDefault(); self.emit("removeToggle");
        }
    });

    // ---- Touch swipe ----------------------------------------------------
    var board = document.querySelector(".board-shell");
    if (!board) return;

    board.addEventListener("touchstart", function (e) {
        if (e.touches.length !== 1) return;
        self.touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        e.preventDefault();
    }, { passive: false });

    board.addEventListener("touchmove", function (e) {
        e.preventDefault();
    }, { passive: false });

    board.addEventListener("touchend", function (e) {
        if (!self.touchStart || e.touches.length > 0) return;
        var touch = e.changedTouches[0];
        var dx = touch.clientX - self.touchStart.x;
        var dy = touch.clientY - self.touchStart.y;
        var adx = Math.abs(dx);
        var ady = Math.abs(dy);
        self.touchStart = null;

        if (Math.max(adx, ady) < 10) {
            // Tap — e.preventDefault() on touchstart kills all synthetic click
            // events inside .board-shell (retry button, tiles, etc). We handle
            // every tappable element here manually.
            var el = document.elementFromPoint(touch.clientX, touch.clientY);
            var node = el;
            while (node) {
                if (!node.classList) { node = node.parentElement; continue; }
                // Retry / New Game buttons inside the game-over overlay
                if (node.classList.contains("retry-button") ||
                    node.classList.contains("new-game-button")) {
                    self.emit("restart");
                    return;
                }
                // Tile tap in exchange mode
                if (node.classList.contains("tile")) {
                    var gx = parseInt(node.getAttribute("data-gx"), 10);
                    var gy = parseInt(node.getAttribute("data-gy"), 10);
                    if (!isNaN(gx) && !isNaN(gy)) self.emit("tileClick", { x: gx, y: gy });
                    return;
                }
                // Stop walking at board boundary
                if (node.classList.contains("board-shell")) break;
                node = node.parentElement;
            }
            return;
        }

        // Swipe — horizontal vs vertical, then sign
        self.emit("move", adx > ady ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    });
};
