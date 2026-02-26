// ==========================================================================
// application.js — bootstrap entry point
// ==========================================================================

window.requestAnimationFrame(function () {
    new GameManager(4, InputManager, HTMLActuator);
});
