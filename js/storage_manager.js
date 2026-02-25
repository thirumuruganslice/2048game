// ==========================================================================
// LocalStorageManager — Persistence layer with fallback
// ==========================================================================

window.fakeStorage = {
    _data: {},
    setItem: function (id, val) { return this._data[id] = String(val); },
    getItem: function (id) { return this._data.hasOwnProperty(id) ? this._data[id] : undefined; },
    removeItem: function (id) { return delete this._data[id]; },
    clear: function () { return this._data = {}; }
};

function LocalStorageManager() {
    this.bestScoreKey = "ft2048-bestScore";
    this.gameStateKey = "ft2048-gameState";
    this.themeKey = "ft2048-theme";

    var supported = this.localStorageSupported();
    this.storage = supported ? window.localStorage : window.fakeStorage;
}

LocalStorageManager.prototype.localStorageSupported = function () {
    var testKey = "test";
    try {
        var storage = window.localStorage;
        storage.setItem(testKey, "1");
        storage.removeItem(testKey);
        return true;
    } catch (error) {
        return false;
    }
};

// Best score
LocalStorageManager.prototype.getBestScore = function () {
    return this.storage.getItem(this.bestScoreKey) || 0;
};

LocalStorageManager.prototype.setBestScore = function (score) {
    this.storage.setItem(this.bestScoreKey, score);
};

// Game state
LocalStorageManager.prototype.getGameState = function () {
    var stateJSON = this.storage.getItem(this.gameStateKey);
    return stateJSON ? JSON.parse(stateJSON) : null;
};

LocalStorageManager.prototype.setGameState = function (gameState) {
    this.storage.setItem(this.gameStateKey, JSON.stringify(gameState));
};

LocalStorageManager.prototype.clearGameState = function () {
    this.storage.removeItem(this.gameStateKey);
};

// Theme
LocalStorageManager.prototype.getTheme = function () {
    return this.storage.getItem(this.themeKey) || "light";
};

LocalStorageManager.prototype.setTheme = function (theme) {
    this.storage.setItem(this.themeKey, theme);
};
