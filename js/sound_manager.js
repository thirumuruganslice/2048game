// ==========================================================================
// SoundManager — Web Audio API synthesizer for 2048 Galaxy
// All sounds are procedurally generated; no external audio files required.
//
// Public API:
//   SoundManager.play(name)  — play a named sound (if not muted)
//   SoundManager.toggleMute()
//   SoundManager.isMuted()
//
// Sounds: move | merge | spawn | win | gameover | undo
//         swapSelect | swapConfirm | swap
//
// Swap flow (3 stages):
//   1. swapSelect  — fired when the FIRST tile is clicked (lock-on ping)
//   2. swapConfirm — fired when the SECOND tile is clicked (charge-up)
//   3. swap        — fired when the exchange actually executes (planet collision)
//
// Theme: deep-space / galaxy — whooshes, shimmer pulses, cosmic impacts
// ==========================================================================

var SoundManager = (function () {
    "use strict";

    // ── AudioContext (lazy-init on first user gesture) ─────────────────────
    var _ctx = null;
    var _muted = false;
    var _masterGain = null;

    function _getCtx() {
        if (!_ctx) {
            _ctx = new (window.AudioContext || window.webkitAudioContext)();
            _masterGain = _ctx.createGain();
            _masterGain.gain.value = 0.55;
            _masterGain.connect(_ctx.destination);
        }
        if (_ctx.state === "suspended") _ctx.resume();
        return _ctx;
    }

    // ── Unlock AudioContext on first user gesture ─────────────────────────
    // Browsers block AudioContext.start() until a user gesture has occurred.
    // This listener creates/resumes the context silently on any of the three
    // earliest possible gestures, then removes itself.
    function _unlockAudio() {
        _getCtx();
        ["pointerdown", "touchstart", "keydown"].forEach(function (ev) {
            document.removeEventListener(ev, _unlockAudio, true);
        });
    }
    ["pointerdown", "touchstart", "keydown"].forEach(function (ev) {
        document.addEventListener(ev, _unlockAudio, { capture: true, once: true, passive: true });
    });

    // ── Utility: harmonic soft-clip waveshaper curve ───────────────────────
    function _makeClipCurve(amount) {
        var n = 256;
        var curve = new Float32Array(n);
        var k = amount;
        for (var i = 0; i < n; i++) {
            var x = (i * 2) / n - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    // ── Utility: single oscillator with ADSR envelope ─────────────────────
    // freq     : Hz  (number or array [startHz, targetHz, timeOffset, ...])
    // type     : OscillatorType string
    // attack   : seconds
    // sustain  : peak gain 0–1
    // decay    : seconds (peak → silence)
    // delay    : seconds offset from ctx.currentTime
    // dest     : AudioNode destination (defaults to _masterGain)
    function _osc(freq, type, attack, sustain, decay, delay, dest) {
        var ctx = _getCtx();
        var osc = ctx.createOscillator();
        var env = ctx.createGain();
        osc.type = type;
        osc.frequency.value = Array.isArray(freq) ? freq[0] : freq;
        osc.connect(env);
        env.connect(dest || _masterGain);

        var now = ctx.currentTime + (delay || 0);
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(sustain, now + attack);
        env.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);

        osc.start(now);
        osc.stop(now + attack + decay + 0.05);

        // Frequency schedule: [startHz, toHz, offsetSec, toHz2, offsetSec2, ...]
        if (Array.isArray(freq)) {
            for (var i = 1; i < freq.length; i += 2) {
                osc.frequency.setValueAtTime(freq[i], now + freq[i + 1]);
            }
        }
        return osc;
    }

    // ── Utility: filtered white-noise burst ───────────────────────────────
    // duration   : s
    // filterStart: Hz (bandpass center at t=0)
    // filterEnd  : Hz (bandpass center at t=duration — sweep)
    // gainVal    : 0–1
    // delay      : s
    // dest       : AudioNode
    function _noise(duration, filterStart, filterEnd, gainVal, delay, dest) {
        var ctx = _getCtx();
        var sr = ctx.sampleRate;
        var len = Math.ceil(sr * (duration + 0.05));
        var buf = ctx.createBuffer(1, len, sr);
        var data = buf.getChannelData(0);
        for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

        var src = ctx.createBufferSource();
        src.buffer = buf;

        var filt = ctx.createBiquadFilter();
        filt.type = "bandpass";
        filt.Q.value = 0.85;
        filt.frequency.value = filterStart;

        var env = ctx.createGain();
        src.connect(filt);
        filt.connect(env);
        env.connect(dest || _masterGain);

        var now = ctx.currentTime + (delay || 0);
        filt.frequency.setValueAtTime(filterStart, now);
        filt.frequency.exponentialRampToValueAtTime(filterEnd || filterStart, now + duration);
        env.gain.setValueAtTime(gainVal, now);
        env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        src.start(now);
        src.stop(now + duration + 0.05);
    }

    // ── Power-up sustained loop state ─────────────────────────────────────
    // Nodes kept here so they can be killed when swap fires or is cancelled.
    var _puOsc1 = null;  // main rising sawtooth oscillator
    var _puOsc2 = null;  // sub-harmonic sine oscillator
    var _puNoiseSrc = null;  // looping noise source
    var _puGain = null;  // master gain for the whole power-up group
    var _puNoiseFilt = null;  // bandpass filter on the noise (for freq sweep)
    var _puStartTime = null;  // ctx.currentTime when loop started

    // Stop and release all power-up nodes instantly (25ms soft fade).
    function _stopPowerUp() {
        if (!_puGain) return;
        var ctx = _getCtx();
        var now = ctx.currentTime;
        var fade = 0.025;
        _puGain.gain.cancelScheduledValues(now);
        _puGain.gain.setValueAtTime(_puGain.gain.value, now);
        _puGain.gain.linearRampToValueAtTime(0, now + fade);
        var stopAt = now + fade + 0.01;
        try { _puOsc1.stop(stopAt); } catch (e) { }
        try { _puOsc2.stop(stopAt); } catch (e) { }
        try { _puNoiseSrc.stop(stopAt); } catch (e) { }
        _puOsc1 = _puOsc2 = _puNoiseSrc = _puGain = _puNoiseFilt = _puStartTime = null;
    }

    // ── Individual sounds ──────────────────────────────────────────────────

    // move — silky space-whoosh: swept noise + low sub pulse
    function _playMove() {
        _noise(0.10, 600, 120, 0.25, 0);
        _osc(55, "sine", 0.005, 0.18, 0.09, 0);
    }

    // merge — tile collision: deep thud + crystal shimmer
    function _playMerge() {
        _osc(65, "sine", 0.002, 0.80, 0.22, 0.00);
        _osc(130, "sine", 0.002, 0.40, 0.14, 0.00);
        _osc(210, "sawtooth", 0.002, 0.12, 0.08, 0.00);
        _osc(1320, "sine", 0.002, 0.22, 0.28, 0.02);
        _osc(1760, "sine", 0.002, 0.16, 0.35, 0.04);
        _osc(2640, "sine", 0.002, 0.10, 0.40, 0.07);
        _noise(0.06, 800, 3200, 0.18, 0);
    }

    // spawn — newborn-star chime: soft bell ping
    function _playSpawn() {
        _osc(1046, "sine", 0.003, 0.28, 0.30, 0.00);
        _osc(1568, "sine", 0.003, 0.12, 0.25, 0.01);
        _osc(2093, "sine", 0.003, 0.06, 0.20, 0.02);
    }

    // undo — time-reversal: descending ethereal tone sweep
    // undo — ✨ 3-star rewind: crisp, short, space-themed (~0.22s total)
    // Three quick descending bell-chime stars (G6 → E6 → C6) with a soft
    // upward swoosh underneath — like three stars briefly rewinding in the sky.
    function _playUndo() {
        // ── 3-note descending star chime: G6 → E6 → C6 ──
        var notes = [1568, 1318, 1046];
        var delays = [0.00, 0.06, 0.12];
        for (var i = 0; i < notes.length; i++) {
            _osc(notes[i], "sine", 0.002, 0.32, 0.14, delays[i]);     // bell body
            _osc(notes[i] * 2, "triangle", 0.001, 0.09, 0.10, delays[i]);     // airy shimmer
        }
        // ── Short upward swoosh (reverse-time feel) ──
        _noise(0.18, 200, 5000, 0.10, 0.00);
        // ── Tiny closing star-tick at the end ──
        _osc(2093, "sine", 0.001, 0.16, 0.10, 0.14);   // C7 sparkle close
    }

    // ── SWAP — Stage 1: Airy star-sparkle shimmer loop ────────────────────
    // Fired on FIRST tile click. Runs until stopped.
    // Feel: a star being gently held — soft glowing hum + twinkling shimmer.
    function _playSwapSelect() {
        _stopPowerUp(); // kill any lingering previous instance

        var ctx = _getCtx();
        var now = ctx.currentTime;
        _puStartTime = now;

        // ── Master gain: very gentle, barely-there sparkle ──
        _puGain = ctx.createGain();
        _puGain.gain.setValueAtTime(0, now);
        _puGain.gain.linearRampToValueAtTime(0.20, now + 0.12); // soft 120ms attack
        _puGain.gain.linearRampToValueAtTime(0.24, now + 4.0);  // barely swell
        _puGain.connect(_masterGain);

        // ── Osc 1: soft sine — C6, airy glow, very gently drifts up ──
        _puOsc1 = ctx.createOscillator();
        _puOsc1.type = "sine";
        _puOsc1.frequency.setValueAtTime(1046, now);          // C6
        _puOsc1.frequency.linearRampToValueAtTime(1318, now + 4.0); // E6 — gentle drift
        var g1 = ctx.createGain();
        g1.gain.value = 0.55;
        _puOsc1.connect(g1);
        g1.connect(_puGain);
        _puOsc1.start(now);

        // ── Osc 2: triangle — G6, adds a breathy shimmer harmonic ──
        _puOsc2 = ctx.createOscillator();
        _puOsc2.type = "triangle";
        _puOsc2.frequency.setValueAtTime(1568, now);          // G6
        _puOsc2.frequency.linearRampToValueAtTime(1760, now + 4.0); // A6
        var g2 = ctx.createGain();
        g2.gain.value = 0.35;
        _puOsc2.connect(g2);
        g2.connect(_puGain);
        _puOsc2.start(now);

        // ── Looping noise: very narrow high-pass — just a faint airy breath ──
        var sr = ctx.sampleRate;
        var bufLen = Math.round(sr * 0.5);
        var buf = ctx.createBuffer(1, bufLen, sr);
        var data = buf.getChannelData(0);
        for (var i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
        _puNoiseSrc = ctx.createBufferSource();
        _puNoiseSrc.buffer = buf;
        _puNoiseSrc.loop = true;
        _puNoiseFilt = ctx.createBiquadFilter();
        _puNoiseFilt.type = "highpass";
        _puNoiseFilt.Q.value = 0.5;
        _puNoiseFilt.frequency.setValueAtTime(6000, now); // very airy — barely audible
        var gn = ctx.createGain();
        gn.gain.value = 0.08; // extremely quiet — just air
        _puNoiseSrc.connect(_puNoiseFilt);
        _puNoiseFilt.connect(gn);
        gn.connect(_puGain);
        _puNoiseSrc.start(now);

        // ── Selection ping: soft C6 bell chime + G6 sparkle overtone ──
        _osc(1046, "sine", 0.002, 0.28, 0.30, 0.00); // C6
        _osc(1568, "sine", 0.002, 0.14, 0.24, 0.02); // G6
        _osc(2093, "triangle", 0.001, 0.08, 0.20, 0.04); // C7 shimmer
        _noise(0.05, 5000, 8000, 0.08, 0.00);             // soft star-tick
    }

    // ── SWAP — Stage 2: Sparkle ascent confirmation ───────────────────────
    // Fired on SECOND tile click. The shimmer loop is still running —
    // we brighten it gently and sprinkle an ascending star-chime arpeggio
    // over the 620ms window before the collision fires.
    function _playSwapConfirm() {
        if (!_puOsc1 || !_puGain) return; // safety: loop may not be running
        var ctx = _getCtx();
        var now = ctx.currentTime;

        // Gently lift the loop's pitch — still airy, just a little brighter
        _puOsc1.frequency.cancelScheduledValues(now);
        _puOsc1.frequency.setValueAtTime(_puOsc1.frequency.value, now);
        _puOsc1.frequency.linearRampToValueAtTime(1568, now + 0.55); // C6 → G6

        _puOsc2.frequency.cancelScheduledValues(now);
        _puOsc2.frequency.setValueAtTime(_puOsc2.frequency.value, now);
        _puOsc2.frequency.linearRampToValueAtTime(2093, now + 0.55); // G6 → C7

        // Gentle gain swell — not an overload, just a warm brightening
        _puGain.gain.cancelScheduledValues(now);
        _puGain.gain.setValueAtTime(_puGain.gain.value, now);
        _puGain.gain.linearRampToValueAtTime(0.32, now + 0.45);

        // ── Ascending sparkle arpeggio over the 620ms window ──
        // C6 → E6 → G6 → C7: rising star chimes leading into the collision
        var notes = [1046, 1318, 1568, 2093];
        var delays = [0.00, 0.12, 0.24, 0.38];
        for (var i = 0; i < notes.length; i++) {
            _osc(notes[i], "sine", 0.002, 0.22, 0.20, delays[i]);
            _osc(notes[i] * 2, "triangle", 0.001, 0.07, 0.14, delays[i] + 0.01);
        }
        // Tiny rising sparkle noise tick at each note
        _noise(0.04, 4000, 7000, 0.07, 0.00);
        _noise(0.04, 5000, 8000, 0.07, 0.24);
    }

    // ── SWAP — Stage 3: Planetary collision ────────────────────────────────
    // Fired when the swap executes. Kills the power-up loop first, then
    // detonates a 5-layer planetary impact.
    function _playSwap() {
        _stopPowerUp(); // cut the loop cleanly before the boom

        var ctx = _getCtx();
        var now = ctx.currentTime;

        // === LAYER 1: Sub-bass core impact (waveshaped) =====================
        var subOsc = ctx.createOscillator();
        var subEnv = ctx.createGain();
        var shaper = ctx.createWaveShaper();
        shaper.curve = _makeClipCurve(180);
        subOsc.type = "sine";
        subOsc.frequency.setValueAtTime(42, now);
        subOsc.frequency.exponentialRampToValueAtTime(22, now + 0.35);
        subOsc.connect(shaper);
        shaper.connect(subEnv);
        subEnv.connect(_masterGain);
        subEnv.gain.setValueAtTime(0, now);
        subEnv.gain.linearRampToValueAtTime(0.92, now + 0.001);
        subEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.90);
        subOsc.start(now);
        subOsc.stop(now + 0.95);

        _osc(58, "sine", 0.001, 0.78, 0.65, 0.00);
        _osc(82, "triangle", 0.001, 0.54, 0.48, 0.00);

        // === LAYER 2: Mid shockwave crunch ==================================
        _osc(120, "sawtooth", 0.001, 0.52, 0.22, 0.00);
        _osc(190, "sawtooth", 0.001, 0.34, 0.16, 0.00);
        _osc(260, "square", 0.001, 0.22, 0.11, 0.01);

        // === LAYER 3: Broadband crack + rumble (descending noise) ===========
        _noise(0.06, 7000, 500, 0.65, 0.000);
        _noise(0.15, 3000, 200, 0.42, 0.022);
        _noise(0.60, 600, 50, 0.30, 0.055);
        _noise(0.45, 1200, 120, 0.20, 0.085);

        // === LAYER 4: Crystal debris shimmer (6 partials) ===================
        _osc(1760, "sine", 0.001, 0.24, 0.72, 0.04);
        _osc(2640, "sine", 0.001, 0.19, 0.82, 0.06);
        _osc(3520, "sine", 0.001, 0.14, 0.78, 0.08);
        _osc(4400, "sine", 0.001, 0.10, 0.68, 0.10);
        _osc(5280, "sine", 0.001, 0.07, 0.58, 0.12);
        _osc(6160, "sine", 0.001, 0.04, 0.52, 0.14);

        // === LAYER 5: Deep resonant aftershock ring-out =====================
        _osc(44, "sine", 0.04, 0.40, 1.35, 0.08);
        _osc(88, "sine", 0.04, 0.24, 1.05, 0.10);
    }

    // win — galactic triumph: ascending C-major arpeggio fanfare
    function _playWin() {
        var notes = [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5];
        var delay = 0;
        for (var i = 0; i < notes.length; i++) {
            _osc(notes[i], "sine", 0.008, 0.50, 0.55, delay);
            _osc(notes[i], "triangle", 0.008, 0.20, 0.55, delay);
            delay += 0.10;
        }
        var chord = [523.25, 659.25, 783.99];
        for (var j = 0; j < chord.length; j++) {
            _osc(chord[j], "sine", 0.02, 0.35, 0.80, delay);
        }
        _noise(0.60, 400, 6000, 0.12, delay);
    }

    // gameover — black-hole collapse: descending minor phrase + sub rumble
    function _playGameover() {
        var notes = [440, 392, 349.23, 329.63, 261.63];
        var delay = 0;
        for (var i = 0; i < notes.length; i++) {
            _osc(notes[i], "sine", 0.02, 0.45, 0.50, delay);
            _osc(notes[i] * 0.5, "triangle", 0.02, 0.20, 0.50, delay);
            delay += 0.14;
        }
        _osc(40, "sine", 0.05, 0.55, 1.00, delay - 0.10);
        _noise(0.70, 180, 60, 0.22, 0.30);
    }

    // ── AIR SUCTION — Tile removal: vacuum / rushing-air absorption ───────
    // 1500ms arc matching CSS tile-bh-suck animation.
    //
    // Utility: builds a noise → bandpass → gain chain with a given Q so we
    // can model the resonant "whistle" of air through a narrowing hole.
    // ─────────────────────────────────────────────────────────────────────
    function _airRush(duration, freqStart, freqEnd, q, gainPeak, delay) {
        var ctx = _getCtx();
        var sr = ctx.sampleRate;
        var len = Math.ceil(sr * (duration + 0.05));
        var buf = ctx.createBuffer(1, len, sr);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

        var src = ctx.createBufferSource();
        src.buffer = buf;

        var bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.Q.value = q;
        bp.frequency.value = freqStart;

        var env = ctx.createGain();
        src.connect(bp);
        bp.connect(env);
        env.connect(_masterGain);

        var t = ctx.currentTime + (delay || 0);
        bp.frequency.setValueAtTime(freqStart, t);
        bp.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
        // Envelope: fast attack, hold, fast cut — sounds like a tight rush burst
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(gainPeak, t + 0.018);
        env.gain.setValueAtTime(gainPeak, t + duration * 0.72);
        env.gain.exponentialRampToValueAtTime(0.0001, t + duration);

        src.start(t);
        src.stop(t + duration + 0.05);
    }

    // Utility: lowpass body layer — adds the "chest" boom of rushing air
    function _airBody(duration, cutoffStart, cutoffEnd, gainPeak, delay) {
        var ctx = _getCtx();
        var sr = ctx.sampleRate;
        var len = Math.ceil(sr * (duration + 0.05));
        var buf = ctx.createBuffer(1, len, sr);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

        var src = ctx.createBufferSource();
        src.buffer = buf;

        var lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.Q.value = 1.4;
        lp.frequency.value = cutoffStart;

        var env = ctx.createGain();
        src.connect(lp);
        lp.connect(env);
        env.connect(_masterGain);

        var t = ctx.currentTime + (delay || 0);
        lp.frequency.setValueAtTime(cutoffStart, t);
        lp.frequency.exponentialRampToValueAtTime(cutoffEnd, t + duration);
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(gainPeak, t + 0.022);
        env.gain.setValueAtTime(gainPeak, t + duration * 0.68);
        env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        src.start(t);
        src.stop(t + duration + 0.05);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Stage 1  (0 – 280ms)  : Seal-break — faint wispy hiss as suction starts
    // Stage 2  (280 – 950ms): Main air rush — hard wideband whoosh with a
    //   resonant whistle (air screaming through the narrowing gap), plus a
    //   lowpass body layer so you feel the pressure drop in your chest
    // Stage 3  (950 – 1200ms): Peak / final pull — everything at max volume;
    //   a high-Q resonant scream at 2400→160 Hz cuts through the mix
    // Stage 4  (1200 – 1500ms): Seal pop — hard low-mid click as the hole
    //   closes shut, followed by a brief trailing hiss dying to silence
    function _playBlackHole() {
        var ctx = _getCtx();
        var now = ctx.currentTime;

        // ================================================================
        // STAGE 1 — Seal-break hiss (0 – 280ms)
        // ================================================================
        // Very faint high hiss — air seeping through before full suction
        _airRush(0.28, 9000, 5500, 1.2, 0.08, 0.000);
        _airRush(0.26, 7000, 4000, 1.0, 0.06, 0.040);
        // Barely audible low whisper — anticipation
        _airBody(0.28, 2200, 1200, 0.06, 0.000);

        // ================================================================
        // STAGE 2 — Main air rush (280ms – 950ms)
        // ================================================================
        var T1 = 0.280;

        // Primary whoosh: wide bandpass (Q=1.8) 8000→380 Hz — the roar of air
        _airRush(0.68, 8000, 380, 1.8, 0.82, T1);
        _airRush(0.65, 6200, 260, 1.5, 0.70, T1 + 0.030);
        _airRush(0.60, 4800, 180, 1.4, 0.58, T1 + 0.070);

        // Resonant whistle: high Q (5.0) sweep 3600→280 Hz — air through a hole
        _airRush(0.62, 3600, 280, 5.0, 0.38, T1 + 0.010);
        _airRush(0.58, 2800, 200, 4.5, 0.28, T1 + 0.060);

        // Body/pressure layer: lowpass drops 5000→200 Hz — feel the vacuum
        _airBody(0.68, 5000, 200, 0.55, T1);
        _airBody(0.64, 3200, 140, 0.42, T1 + 0.050);
        _airBody(0.58, 1800, 90, 0.30, T1 + 0.120);

        // ================================================================
        // STAGE 3 — Peak pull / final suction scream (950ms – 1200ms)
        // ================================================================
        var T2 = 0.950;

        // Everything at maximum — the last gasp before the seal
        _airRush(0.28, 9500, 420, 2.0, 0.95, T2);
        _airRush(0.26, 7000, 280, 1.8, 0.80, T2 + 0.015);

        // High-Q resonant scream — air screaming through a tiny closing gap
        _airRush(0.26, 2400, 160, 6.5, 0.45, T2 + 0.005);
        _airRush(0.22, 1800, 120, 5.5, 0.34, T2 + 0.030);

        // Sub pressure drop
        _airBody(0.28, 4500, 80, 0.60, T2);

        // ================================================================
        // STAGE 4 — Seal pop + silence (1200ms – 1500ms)
        // ================================================================
        var T3 = 1.200;

        // Hard click / snap — the hole sealing shut (Helmholtz pop)
        _noise(0.012, 8500, 3200, 0.80, T3);         // crack
        _noise(0.020, 2400, 700, 0.65, T3 + 0.004); // thud body

        // Sub-bass pressure equalisation thud: 80→22 Hz
        var popOsc = ctx.createOscillator();
        var popEnv = ctx.createGain();
        var popDrive = ctx.createWaveShaper();
        popDrive.curve = _makeClipCurve(180);
        popOsc.type = "sine";
        popOsc.frequency.setValueAtTime(80, now + T3 + 0.003);
        popOsc.frequency.exponentialRampToValueAtTime(22, now + T3 + 0.140);
        popOsc.connect(popDrive);
        popDrive.connect(popEnv);
        popEnv.connect(_masterGain);
        popEnv.gain.setValueAtTime(0, now + T3);
        popEnv.gain.linearRampToValueAtTime(1.00, now + T3 + 0.005);
        popEnv.gain.exponentialRampToValueAtTime(0.0001, now + T3 + 0.155);
        popOsc.start(now + T3);
        popOsc.stop(now + T3 + 0.165);

        // Trailing hiss — residual air dissipating into silence
        _airRush(0.28, 3500, 800, 1.2, 0.12, T3 + 0.018);
        _airRush(0.22, 1800, 400, 1.0, 0.07, T3 + 0.080);
    }


    // ── Dispatcher ─────────────────────────────────────────────────────────

    var _sounds = {
        move: _playMove,
        merge: _playMerge,
        spawn: _playSpawn,
        undo: _playUndo,
        swapSelect: _playSwapSelect,
        swapConfirm: _playSwapConfirm,
        swap: _playSwap,
        blackHole: _playBlackHole,
        win: _playWin,
        gameover: _playGameover
    };

    // Prevent win/gameover from firing multiple times per game
    var _terminalPlayed = false;

    function play(name) {
        if (_muted) return;
        var fn = _sounds[name];
        if (!fn) return;
        if ((name === "win" || name === "gameover")) {
            if (_terminalPlayed) return;
            _terminalPlayed = true;
        }
        try { fn(); } catch (e) { /* AudioContext blocked — silent fail */ }
    }

    function resetTerminal() {
        _terminalPlayed = false;
    }

    function toggleMute() {
        _muted = !_muted;
        if (_masterGain) {
            _masterGain.gain.cancelScheduledValues(_getCtx().currentTime);
            _masterGain.gain.setValueAtTime(_muted ? 0 : 0.55, _getCtx().currentTime);
        }
        return _muted;
    }

    function isMuted() { return _muted; }

    return { play: play, stopPowerUp: _stopPowerUp, toggleMute: toggleMute, isMuted: isMuted, resetTerminal: resetTerminal };
}());
