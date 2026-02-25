// ==========================================================================
// InputManager — Keyboard, touch, swipe, and button input handling
// ==========================================================================

function InputManager() {
    this.events = {};

    if (window.navigator.msPointerEnabled) {
        this.eventTouchstart = "MSPointerDown";
        this.eventTouchmove = "MSPointerMove";
        this.eventTouchend = "MSPointerUp";
    } else {
        this.eventTouchstart = "touchstart";
        this.eventTouchmove = "touchmove";
        this.eventTouchend = "touchend";
    }

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

    var map = {
        38: 0, // Up
        39: 1, // Right
        40: 2, // Down
        37: 3, // Left
        75: 0, // K (vim up)
        76: 1, // L (vim right)
        74: 2, // J (vim down)
        72: 3, // H (vim left)
        87: 0, // W
        68: 1, // D
        83: 2, // S
        65: 3  // A
    };

    // Keyboard
    document.addEventListener("keydown", function (event) {
        var modifiers = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
        var mapped = map[event.which];

        if (!modifiers) {
            if (mapped !== undefined) {
                event.preventDefault();
                self.emit("move", mapped);
            }

            // Z = Undo
            if (event.which === 90) {
                event.preventDefault();
                self.emit("undo");
            }

            // R = Restart
            if (event.which === 82) {
                self.restart.call(self, event);
            }
        }

        // Ctrl+Z = Undo
        if (event.ctrlKey && event.which === 90) {
            event.preventDefault();
            self.emit("undo");
        }
    });

    // Buttons
    this.bindButtonPress(".retry-button", this.restart);
    this.bindButtonPress(".restart-button", this.restart);
    this.bindButtonPress(".keep-playing-button", this.keepPlaying);
    this.bindButtonPress(".undo-button", this.undo);
    this.bindButtonPress(".delete-tile-button", this.deleteTileMode);

    // Cancel delete mode
    var cancelBtn = document.querySelector(".cancel-delete-btn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", function (e) {
            e.preventDefault();
            self.emit("cancelDelete");
        });
    }

    // Touch / Swipe
    var touchStartClientX, touchStartClientY;
    var gameContainer = document.getElementsByClassName("game-container")[0];

    gameContainer.addEventListener(this.eventTouchstart, function (event) {
        if ((!window.navigator.msPointerEnabled && event.touches.length > 1) ||
            event.targetTouches.length > 1) return;

        if (window.navigator.msPointerEnabled) {
            touchStartClientX = event.pageX;
            touchStartClientY = event.pageY;
        } else {
            touchStartClientX = event.touches[0].clientX;
            touchStartClientY = event.touches[0].clientY;
        }

        event.preventDefault();
    });

    gameContainer.addEventListener(this.eventTouchmove, function (event) {
        event.preventDefault();
    });

    gameContainer.addEventListener(this.eventTouchend, function (event) {
        if ((!window.navigator.msPointerEnabled && event.touches.length > 0) ||
            event.targetTouches.length > 0) return;

        var touchEndClientX, touchEndClientY;
        if (window.navigator.msPointerEnabled) {
            touchEndClientX = event.pageX;
            touchEndClientY = event.pageY;
        } else {
            touchEndClientX = event.changedTouches[0].clientX;
            touchEndClientY = event.changedTouches[0].clientY;
        }

        var dx = touchEndClientX - touchStartClientX;
        var absDx = Math.abs(dx);
        var dy = touchEndClientY - touchStartClientY;
        var absDy = Math.abs(dy);

        if (Math.max(absDx, absDy) > 10) {
            self.emit("move", absDx > absDy ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
        }
    });

    // Tile click for delete mode
    gameContainer.addEventListener("click", function (event) {
        var tileEl = event.target.closest(".tile");
        if (tileEl && gameContainer.classList.contains("delete-mode")) {
            var posMatch = tileEl.className.match(/tile-position-(\d+)-(\d+)/);
            if (posMatch) {
                self.emit("deleteTile", {
                    x: parseInt(posMatch[1]) - 1,
                    y: parseInt(posMatch[2]) - 1,
                    element: tileEl
                });
            }
        }
    });
};

InputManager.prototype.restart = function (event) {
    event.preventDefault();
    this.emit("restart");
};

InputManager.prototype.keepPlaying = function (event) {
    event.preventDefault();
    this.emit("keepPlaying");
};

InputManager.prototype.undo = function (event) {
    event.preventDefault();
    this.emit("undo");
};

InputManager.prototype.deleteTileMode = function (event) {
    event.preventDefault();
    this.emit("deleteTileMode");
};

InputManager.prototype.bindButtonPress = function (selector, fn) {
    var button = document.querySelector(selector);
    if (button) {
        button.addEventListener("click", fn.bind(this));
        button.addEventListener(this.eventTouchend, fn.bind(this));
    }
};
