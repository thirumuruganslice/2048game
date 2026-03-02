/* global requestAnimationFrame, cancelAnimationFrame */
/**
 * SpaceEffects — Canvas particle engine for 2048 Galaxy
 * -------------------------------------------------------
 * Provides tiered space-themed collision effects:
 *   2–4    : Stellar sparkle  (tiny floating motes)
 *   8–16   : Comet shower     (streaking particles)
 *   32–64  : Plasma burst     (energetic ring + spread)
 *   128–256: Supergiant flare (nebula puff + shockwave)
 *   512    : Supernova        (multi-ring + heavy particles)
 *   1024   : Quasar vortex    (spiral + shockwave + shake)
 *   2048+  : Cosmic implosion (everything, max intensity)
 */

var SpaceEffects = (function () {
    "use strict";

    /* ── internal state ──────────────────────────────────── */
    var canvas, ctx;
    var particles = [];
    var rafId = null;
    var isRunning = false;
    var boardShell = null;
    var MAX_PARTICLES = 200; /* hard cap — prevents pile-up on rapid merges */

    /* ── tier configurations ─────────────────────────────── */
    /*
       Each tier entry:
         count      : number of particles
         colors     : palette to pick from (hex strings)
         spread     : max launch radius (px, scaled from tile center)
         speed      : base velocity multiplier
         life       : max lifespan in frames (≈60fps)
         radii      : [min, max] particle pixel sizes
         shapes     : array of shape names to pick from
         rings      : number of shockwave rings to emit
         ringDur    : ring expansion duration (ms)
         ringMaxPx  : ring final diameter (px)
         nebula     : whether to show nebula puff cloud
         shake      : whether to shake the board shell
         flashSize  : flash burst diameter (px)
    */
    var TIERS = {
        2: {
            count: 10, spread: 36, speed: 1.5, life: 30,
            radii: [1.4, 2.6],
            colors: ["#c8d8ff", "#aabeff", "#e8f0ff", "#ffffff", "#8898cc"],
            shapes: ["sparkle"],
            rings: 0, ringDur: 0, ringMaxPx: 0,
            nebula: false, shake: null, flashSize: 90
        },
        4: {
            count: 16, spread: 44, speed: 1.8, life: 34,
            radii: [1.6, 3.0],
            colors: ["#c0a8ff", "#a080ff", "#dcc8ff", "#ffffff", "#7050d0"],
            shapes: ["sparkle", "circle"],
            rings: 1, ringDur: 280, ringMaxPx: 100,
            nebula: false, shake: null, flashSize: 110
        },
        8: {
            count: 24, spread: 58, speed: 2.2, life: 37,
            radii: [1.8, 3.4],
            colors: ["#40c8ff", "#20a8ff", "#80e0ff", "#ffffff", "#0090e0"],
            shapes: ["sparkle", "circle", "streak"],
            rings: 1, ringDur: 290, ringMaxPx: 130,
            nebula: false, shake: null, flashSize: 130
        },
        16: {
            count: 30, spread: 70, speed: 2.6, life: 40,
            radii: [2.0, 3.8],
            colors: ["#30e8c8", "#20c0a0", "#70f0d8", "#ffffff", "#008870"],
            shapes: ["sparkle", "circle", "streak"],
            rings: 1, ringDur: 305, ringMaxPx: 150,
            nebula: false, shake: null, flashSize: 155
        },
        32: {
            count: 38, spread: 86, speed: 3.0, life: 42,
            radii: [2.2, 4.2],
            colors: ["#50f08a", "#30c868", "#80ff9a", "#ffffff", "#008840"],
            shapes: ["circle", "streak", "sparkle"],
            rings: 2, ringDur: 320, ringMaxPx: 175,
            nebula: false, shake: null, flashSize: 185
        },
        64: {
            count: 46, spread: 105, speed: 3.5, life: 44,
            radii: [2.4, 4.8],
            colors: ["#ffc830", "#ff9000", "#ffe880", "#ffffff", "#cc6000"],
            shapes: ["circle", "star4", "streak", "sparkle"],
            rings: 2, ringDur: 330, ringMaxPx: 205,
            nebula: false, shake: null, flashSize: 215
        },
        128: {
            count: 54, spread: 128, speed: 4.2, life: 46,
            radii: [2.6, 5.4],
            colors: ["#ff8820", "#ff5000", "#ffc080", "#ffffff", "#cc3000", "#ff7040"],
            shapes: ["circle", "star4", "streak", "sparkle"],
            rings: 3, ringDur: 340, ringMaxPx: 240,
            nebula: true, shake: null, flashSize: 260
        },
        256: {
            count: 64, spread: 148, speed: 5.0, life: 48,
            radii: [2.8, 5.8],
            colors: ["#ff4020", "#ff1800", "#ff8060", "#ffffff", "#cc0000", "#ff3050"],
            shapes: ["circle", "star4", "streak", "sparkle"],
            rings: 3, ringDur: 350, ringMaxPx: 275,
            nebula: true, shake: null, flashSize: 295
        },
        512: {
            count: 76, spread: 175, speed: 5.2, life: 50,
            radii: [3.0, 6.2],
            colors: ["#e030e0", "#a010c0", "#f080f0", "#ffffff", "#800090", "#cc40ff"],
            shapes: ["circle", "star4", "streak", "sparkle", "lightning"],
            rings: 3, ringDur: 360, ringMaxPx: 315,
            nebula: true, shake: "sfx-shake", flashSize: 340,
            screenFlash: false, doubleBurst: true
        },
        1024: {
            count: 88, spread: 210, speed: 5.8, life: 52,
            radii: [3.2, 6.8],
            colors: ["#60e0ff", "#20beff", "#ffffff", "#aaffff", "#0090d0", "#a0f0ff"],
            shapes: ["circle", "star4", "streak", "comet", "lightning", "sparkle"],
            rings: 4, ringDur: 385, ringMaxPx: 390,
            nebula: true, shake: "sfx-shake-heavy", flashSize: 415,
            screenFlash: true, doubleBurst: true
        },
        2048: {
            count: 100, spread: 255, speed: 6.5, life: 55,
            radii: [3.5, 7.5],
            colors: ["#ffe040", "#ffffff", "#ffaa00", "#ffff80", "#ff8800", "#fffac8", "#fff0a0"],
            shapes: ["circle", "star4", "streak", "comet", "lightning", "sparkle"],
            rings: 5, ringDur: 420, ringMaxPx: 480,
            nebula: true, shake: "sfx-shake-cosmic", flashSize: 510,
            screenFlash: true, doubleBurst: true, multiNebula: true
        }
    };

    /* ── helper: pick random element ─────────────────────── */
    function pick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function rand(min, max) {
        return min + Math.random() * (max - min);
    }

    /* ── resolve tier config for any tile value ──────────── */
    function getTier(value) {
        var keys = [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2];
        for (var i = 0; i < keys.length; i++) {
            if (value >= keys[i]) return { key: keys[i], cfg: TIERS[keys[i]] };
        }
        return { key: 2, cfg: TIERS[2] };
    }

    /* ── tier CSS class name ─────────────────────────────── */
    function tierClass(key) {
        return "t" + key;
    }

    /* ══ Canvas setup ═════════════════════════════════════ */
    function initCanvas() {
        if (canvas) return;
        canvas = document.createElement("canvas");
        canvas.id = "space-fx-canvas";
        document.body.appendChild(canvas);
        ctx = canvas.getContext("2d");
        resize();
        window.addEventListener("resize", resize);
    }

    function resize() {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    /* ══ Particle factory ════════════════════════════════ */

    function createParticle(cx, cy, cfg, key) {
        var angle = rand(0, Math.PI * 2);
        var radius = rand(0, cfg.spread);
        /* initial pos offset slightly from center for natural spread */
        var ox = rand(-cfg.radii[1] * 2, cfg.radii[1] * 2);
        var oy = rand(-cfg.radii[1] * 2, cfg.radii[1] * 2);
        var speed = rand(cfg.speed * 0.5, cfg.speed * 1.5);
        var shape = pick(cfg.shapes);
        var life = rand(cfg.life * 0.6, cfg.life);
        var size = rand(cfg.radii[0], cfg.radii[1]);
        var color = pick(cfg.colors);

        var isComet = shape === "comet";
        var isStar = shape === "star4" || shape === "star6";
        var isLightning = shape === "lightning";

        /* Higher-value particles get stronger glow — capped to keep GPU happy */
        var glowRadius = key >= 512 ? size * 2.2
            : key >= 128 ? size * 1.8
                : key >= 32 ? size * 1.4
                    : size * 0.9;

        /* Pre-bake lightning bolt jitter — draw reuses these every frame
           so Math.random() is never called in the hot draw path. */
        var boltPts = null;
        if (isLightning) {
            var SEG = 5;
            boltPts = [];
            var boltLen = rand(size * 7, size * 11);
            for (var li = 0; li <= SEG; li++) {
                boltPts.push({
                    t: li / SEG,
                    j: li === 0 || li === SEG ? 0 : (Math.random() - 0.5) * boltLen * 0.5
                });
            }
        }

        var p = {
            x: cx + ox,
            y: cy + oy,
            vx: Math.cos(angle) * speed * rand(0.7, 1.3),
            vy: Math.sin(angle) * speed * rand(0.7, 1.3),
            ax: 0,          /* acceleration for spiral */
            ay: key >= 1024 ? rand(0.03, 0.07) : 0,  /* quasar gravity */
            life: life,
            maxLife: life,
            size: size,
            color: color,
            shape: shape,
            glowR: glowRadius,
            trail: isComet ? [] : null,
            points: isStar ? (shape === "star4" ? 4 : 6) : 0,
            boltPts: boltPts,
            rotation: rand(0, Math.PI * 2),
            rotSpeed: rand(-0.12, 0.12),
            twinkle: (shape === "sparkle") ? rand(0.04, 0.10) : 0,
            twinkleP: Math.random() * Math.PI * 2,
            decel: rand(0.96, 0.99)       /* friction */
        };
        return p;
    }

    /* ══ Drawing helpers ═════════════════════════════════ */

    function drawCircle(p, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        if (p.glowR > 0) {
            ctx.shadowBlur = p.glowR * 0.9;
            ctx.shadowColor = p.color;
        }
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawSparkle(p, alpha) {
        /* Classic 4-point star with twinkle */
        var twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(p.twinkleP));
        var sa = Math.min(1, alpha * 1.2 * twinkle);
        var r = p.size * twinkle;

        ctx.save();
        ctx.globalAlpha = sa;
        ctx.shadowBlur = p.glowR * 1.4;
        ctx.shadowColor = p.color;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = r * 0.25;

        var arms = 4;
        var outerR = r * 2.2;
        var innerR = r * 0.3;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.beginPath();
        for (var i = 0; i < arms * 2; i++) {
            var a = (i / (arms * 2)) * Math.PI * 2;
            var rr = i % 2 === 0 ? outerR : innerR;
            i === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
                : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
    }

    function drawStar(p, alpha, points) {
        var sa = Math.min(1, alpha * 1.1);
        var r = p.size;
        var outerR = r * 2.0;
        var innerR = r * 0.7;

        ctx.save();
        ctx.globalAlpha = sa;
        ctx.shadowBlur = p.glowR * 1.2;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.beginPath();
        for (var i = 0; i < points * 2; i++) {
            var a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
            var rr = i % 2 === 0 ? outerR : innerR;
            i === 0 ? ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
                : ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    function drawStreak(p, alpha) {
        /* Short energy streak aligned with velocity */
        var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed < 0.01) { drawCircle(p, alpha); return; }
        var nx = p.vx / speed;
        var ny = p.vy / speed;
        var len = p.size * 4 * Math.min(speed, 4);

        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha * 1.15);
        ctx.shadowBlur = p.glowR * 0.9;
        ctx.shadowColor = p.color;
        var grad = ctx.createLinearGradient(
            p.x, p.y,
            p.x - nx * len, p.y - ny * len
        );
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, "transparent");
        ctx.strokeStyle = grad;
        ctx.lineWidth = p.size * 0.9;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - nx * len, p.y - ny * len);
        ctx.stroke();
        /* head dot */
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawComet(p, alpha) {
        /* Comet with persistent trail — NO shadowBlur on trail (perf) */
        if (!p.trail) { drawStreak(p, alpha); return; }
        ctx.save();
        ctx.shadowBlur = 0;
        for (var i = 0; i < p.trail.length; i++) {
            var t = p.trail[i];
            var ta = alpha * (i / p.trail.length) * 0.45;
            ctx.globalAlpha = ta;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            var ts = p.size * (0.15 + 0.7 * (i / p.trail.length));
            ctx.arc(t.x, t.y, ts, 0, Math.PI * 2);
            ctx.fill();
        }
        /* bright head — only the head gets glow */
        ctx.shadowBlur = p.glowR * 1.5;
        ctx.shadowColor = "#ffffff";
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.65;
        ctx.shadowBlur = 0;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawNova(p, alpha) {
        /* Four-pointed radiating cross with bright core */
        var r = p.size;
        var armLen = r * 5.5;
        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha * 1.2);
        ctx.shadowBlur = p.glowR * 2;
        ctx.shadowColor = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        /* draw 4 arms as tapered lines */
        for (var a = 0; a < 4; a++) {
            ctx.save();
            ctx.rotate(a * Math.PI / 2);
            var grad = ctx.createLinearGradient(0, 0, 0, -armLen);
            grad.addColorStop(0, p.color);
            grad.addColorStop(0.4, p.color);
            grad.addColorStop(1, "transparent");
            ctx.strokeStyle = grad;
            ctx.lineWidth = r * 0.55;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -armLen);
            ctx.stroke();
            ctx.restore();
        }
        /* bright core */
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#ffffff";
        ctx.shadowBlur = p.glowR * 2;
        ctx.shadowColor = "#ffffff";
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
        ctx.fill();
        /* coloured halo */
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawLightning(p, alpha) {
        /* Uses pre-baked bolt points — zero Math.random() calls per frame */
        var pts = p.boltPts;
        if (!pts || pts.length < 2) { drawCircle(p, alpha); return; }
        var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (speed < 0.01) { drawCircle(p, alpha); return; }
        var nx = p.vx / speed;
        var ny = p.vy / speed;
        var len = p.size * 9;
        var perp_x = -ny;
        var perp_y = nx;

        ctx.save();
        ctx.globalAlpha = Math.min(1, alpha * 1.25);
        ctx.shadowBlur = p.glowR * 1.8;
        ctx.shadowColor = p.color;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * 0.85;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        for (var s = 1; s < pts.length; s++) {
            ctx.lineTo(
                p.x + nx * len * pts[s].t + perp_x * pts[s].j,
                p.y + ny * len * pts[s].t + perp_y * pts[s].j
            );
        }
        ctx.stroke();
        /* bright white core */
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = p.size * 0.26;
        ctx.shadowBlur = p.glowR * 1.2;
        ctx.shadowColor = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        for (var s2 = 1; s2 < pts.length; s2++) {
            ctx.lineTo(
                p.x + nx * len * pts[s2].t + perp_x * pts[s2].j,
                p.y + ny * len * pts[s2].t + perp_y * pts[s2].j
            );
        }
        ctx.stroke();
        ctx.restore();
    }

    function drawParticle(p) {
        var progress = p.life / p.maxLife;
        /* Alpha curve: fast in, smooth out */
        var alpha = progress < 0.15
            ? (progress / 0.15)
            : Math.pow(progress, 0.7);

        p.twinkleP += p.twinkle;
        p.rotation += p.rotSpeed;

        switch (p.shape) {
            case "sparkle": drawSparkle(p, alpha); break;
            case "star4": drawStar(p, alpha, 4); break;
            case "star6": drawStar(p, alpha, 6); break;
            case "streak": drawStreak(p, alpha); break;
            case "comet": drawComet(p, alpha); break;
            case "nova": drawNova(p, alpha); break;
            case "lightning": drawLightning(p, alpha); break;
            default: drawCircle(p, alpha); break;
        }
    }

    /* ══ Game loop ═══════════════════════════════════════ */
    function step() {
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        /* if pool grew too large, cull the oldest particles first */
        if (particles.length > MAX_PARTICLES) {
            particles.splice(0, particles.length - MAX_PARTICLES);
        }

        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];

            /* record comet trail */
            if (p.trail !== null) {
                p.trail.push({ x: p.x, y: p.y });
                if (p.trail.length > 8) p.trail.shift();
            }

            /* physics */
            p.vx *= p.decel;
            p.vy *= p.decel;
            p.vy += p.ay;   /* gravity pull for quasar effect */
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 1;

            if (p.life <= 0) {
                particles.splice(i, 1);
            } else {
                drawParticle(p);
            }
        }

        if (particles.length > 0) {
            rafId = requestAnimationFrame(step);
        } else {
            rafId = null;
            isRunning = false;
        }
    }

    function startLoop() {
        if (!isRunning) {
            isRunning = true;
            rafId = requestAnimationFrame(step);
        }
    }

    /* ══ DOM overlays (rings, flash, nebula) ════════════ */

    function spawnRing(cx, cy, tierKey, diameter, duration, delay) {
        var ring = document.createElement("div");
        ring.className = "sfx-ring " + tierClass(tierKey);
        ring.style.cssText = [
            "left:" + cx + "px",
            "top:" + cy + "px",
            "width:" + diameter + "px",
            "height:" + diameter + "px",
            "animation-duration:" + duration + "ms",
            "animation-delay:" + delay + "ms"
        ].join(";");
        document.body.appendChild(ring);
        ring.addEventListener("animationend", function () {
            if (ring.parentNode) ring.parentNode.removeChild(ring);
        });
    }

    function spawnFlash(cx, cy, tierKey, size) {
        var flash = document.createElement("div");
        flash.className = "sfx-flash " + tierClass(tierKey);
        flash.style.cssText = [
            "left:" + cx + "px",
            "top:" + cy + "px",
            "width:" + size + "px",
            "height:" + size + "px"
        ].join(";");
        document.body.appendChild(flash);
        flash.addEventListener("animationend", function () {
            if (flash.parentNode) flash.parentNode.removeChild(flash);
        });
    }

    function spawnNebula(cx, cy, tierKey, size) {
        var neb = document.createElement("div");
        neb.className = "sfx-nebula " + tierClass(tierKey);
        neb.style.cssText = [
            "left:" + cx + "px",
            "top:" + cy + "px",
            "width:" + (size * 2.8) + "px",
            "height:" + (size * 2.8) + "px"
        ].join(";");
        document.body.appendChild(neb);
        neb.addEventListener("animationend", function () {
            if (neb.parentNode) neb.parentNode.removeChild(neb);
        });
    }

    /* shakeClass: "sfx-shake" | "sfx-shake-heavy" | "sfx-shake-cosmic" */
    function triggerShake(shakeClass) {
        if (!boardShell) boardShell = document.querySelector(".board-shell");
        if (!boardShell) return;
        var cls = shakeClass || "sfx-shake";
        boardShell.classList.remove("sfx-shake", "sfx-shake-heavy", "sfx-shake-cosmic");
        void boardShell.offsetWidth;   /* force reflow to restart animation */
        boardShell.classList.add(cls);
        boardShell.addEventListener("animationend", function h() {
            boardShell.classList.remove("sfx-shake", "sfx-shake-heavy", "sfx-shake-cosmic");
            boardShell.removeEventListener("animationend", h);
        });
    }

    function spawnScreenFlash(tierKey) {
        var el = document.createElement("div");
        el.className = "sfx-screen-flash " + tierClass(tierKey);
        document.body.appendChild(el);
        el.addEventListener("animationend", function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
    }

    /* ══ Public API ══════════════════════════════════════ */

    /**
     * init() — call once after DOM is ready.
     * Creates the canvas overlay.
     */
    function init() {
        initCanvas();
    }

    /**
     * trigger(tileValue, tileElement)
     * Fire the effect for a merged tile.
     *   tileValue  : the value of the resulting merged tile (e.g. 8, 256, 2048)
     *   tileElement: the tile DOM element (used for position)
     */
    function trigger(tileValue, tileElement) {
        if (!canvas || !ctx) initCanvas();

        var t = getTier(tileValue);
        var cfg = t.cfg;
        var key = t.key;

        /* get tile center in viewport coords */
        var rect = tileElement.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;

        /* ── screen flash (1024+) ── */
        if (cfg.screenFlash) {
            spawnScreenFlash(key);
        }

        /* ── flash burst ── */
        spawnFlash(cx, cy, key, cfg.flashSize);

        /* ── nebula puff (128+) ── */
        if (cfg.nebula) {
            spawnNebula(cx, cy, key, cfg.flashSize);
        }

        /* ── multi-nebula ring (2048 only): 6 nebula clouds in a hex ring ── */
        if (cfg.multiNebula) {
            var nebulaRingR = cfg.flashSize * 0.55;
            for (var ni = 0; ni < 6; ni++) {
                var na = (ni / 6) * Math.PI * 2;
                var nx2 = cx + Math.cos(na) * nebulaRingR;
                var ny2 = cy + Math.sin(na) * nebulaRingR;
                ; (function (nnx, nny, nDelay) {
                    setTimeout(function () {
                        spawnNebula(nnx, nny, key, cfg.flashSize * 0.55);
                    }, nDelay);
                }(nx2, ny2, ni * 55));
            }
        }

        /* ── shockwave rings ── */
        for (var r = 0; r < cfg.rings; r++) {
            /* rings scale: small tight, medium, large, wider, widest */
            var ringScales = [0.40, 0.62, 0.82, 1.0, 1.18];
            var ringDiam = cfg.ringMaxPx * (ringScales[r] || (0.5 + r * 0.3));
            var ringDelay = r * 85;
            spawnRing(cx, cy, key, ringDiam, cfg.ringDur + r * 40, ringDelay);
        }

        /* ── screen shake ── */
        if (cfg.shake) {
            var shakeClass = cfg.shake;
            setTimeout(function () { triggerShake(shakeClass); }, 60);
            /* second tremor aftershock for 1024+ */
            if (key >= 1024) {
                setTimeout(function () { triggerShake("sfx-shake"); }, 380);
            }
        }

        /* ── particles: first wave ── */
        var count = cfg.count;
        /* Clamp so a single burst never floods the pool */
        var available = MAX_PARTICLES - particles.length;
        var toSpawn = Math.min(count, Math.max(available, 0));
        for (var i = 0; i < toSpawn; i++) {
            particles.push(createParticle(cx, cy, cfg, key));
        }
        startLoop();

        /* ── second wave burst (512+): smaller delayed scatter ── */
        if (cfg.doubleBurst) {
            var burstCfg = {
                count: Math.min(18, Math.round(cfg.count * 0.22)),
                spread: cfg.spread * 1.4,
                speed: cfg.speed * 0.65,
                life: cfg.life * 0.6,
                radii: [cfg.radii[0] * 0.65, cfg.radii[1] * 0.65],
                colors: cfg.colors,
                shapes: ["sparkle", "streak"]
            };
            setTimeout(function () {
                for (var bi = 0; bi < burstCfg.count; bi++) {
                    particles.push(createParticle(cx, cy, burstCfg, key));
                }
            }, 180);
        }
    }

    /**
     * triggerSplit(boardElement)
     * ──────────────────────────
     * Cosmic fission effect fired when the player undoes a move.
     * Particles radiate outward from the board centre in two opposing
     * "ion-stream" clusters (like a nucleus splitting), plus contracting
     * shockwave rings and a full-viewport time-rewind overlay.
     */
    function triggerSplit(boardElement) {
        if (!canvas || !ctx) initCanvas();

        /* board centre in viewport coords */
        var rect = boardElement.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var boardR = Math.min(rect.width, rect.height) * 0.46;

        /* ── full-screen rewind tint ──────────────────────── */
        var overlay = document.createElement("div");
        overlay.className = "sfx-undo-overlay";
        document.body.appendChild(overlay);
        overlay.addEventListener("animationend", function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        });

        /* ── central fission flash ────────────────────────── */
        var flash = document.createElement("div");
        flash.className = "sfx-undo-flash";
        flash.style.cssText = "left:" + cx + "px;top:" + cy + "px;" +
            "width:" + (boardR * 1.6) + "px;height:" + (boardR * 1.6) + "px;";
        document.body.appendChild(flash);
        flash.addEventListener("animationend", function () {
            if (flash.parentNode) flash.parentNode.removeChild(flash);
        });

        /* ── three contracting rings (inner → outer, staggered) ── */
        var ringData = [
            { cls: "sfx-undo-ring inner", diam: boardR * 0.9, delay: 0 },
            { cls: "sfx-undo-ring", diam: boardR * 1.5, delay: 55 },
            { cls: "sfx-undo-ring outer", diam: boardR * 2.1, delay: 115 }
        ];
        ringData.forEach(function (rd) {
            setTimeout(function () {
                var ring = document.createElement("div");
                ring.className = rd.cls;
                ring.style.cssText = "left:" + cx + "px;top:" + cy + "px;" +
                    "width:" + rd.diam + "px;height:" + rd.diam + "px;";
                document.body.appendChild(ring);
                ring.addEventListener("animationend", function () {
                    if (ring.parentNode) ring.parentNode.removeChild(ring);
                });
            }, rd.delay);
        });

        /* ── fission particle streams ─────────────────────── */
        /*
           Two opposing ion-stream clusters flying apart (like nuclear fission),
           plus a scattered halo of sparkles and streaks around the full ring.
        */
        var FISSION_COLORS = [
            "#a0e8ff", "#60d0ff", "#ffffff", "#c0f0ff",
            "#40b8e0", "#e8f8ff", "#80c8f0", "#20a0d8"
        ];

        /* Cluster A — bursts toward upper-left quadrant */
        var clusterAngle = Math.random() * Math.PI * 2;   /* random axis */
        for (var a = 0; a < 70; a++) {
            var spread = (Math.random() - 0.5) * 0.9;    /* ±52° fan */
            var angle = clusterAngle + spread;
            var spd = 2.8 + Math.random() * 3.8;
            var shp = ["sparkle", "streak", "star4", "comet"][Math.floor(Math.random() * 4)];
            particles.push({
                x: cx + (Math.random() - 0.5) * 10,
                y: cy + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                ax: 0, ay: 0,
                life: 50 + Math.random() * 40,
                maxLife: 90,
                size: 1.8 + Math.random() * 3.2,
                color: FISSION_COLORS[Math.floor(Math.random() * FISSION_COLORS.length)],
                shape: shp,
                glowR: 4 + Math.random() * 6,
                trail: shp === "comet" ? [] : null,
                points: shp === "star4" ? 4 : (shp === "star6" ? 6 : 0),
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.18,
                twinkle: shp === "sparkle" ? 0.06 + Math.random() * 0.06 : 0,
                twinkleP: Math.random() * Math.PI * 2,
                decel: 0.94 + Math.random() * 0.04
            });
        }

        /* Cluster B — opposite direction */
        var oppAngle = clusterAngle + Math.PI;
        for (var b = 0; b < 70; b++) {
            var spread2 = (Math.random() - 0.5) * 0.9;
            var angle2 = oppAngle + spread2;
            var spd2 = 2.8 + Math.random() * 3.8;
            var shp2 = ["sparkle", "streak", "star4", "nova"][Math.floor(Math.random() * 4)];
            particles.push({
                x: cx + (Math.random() - 0.5) * 10,
                y: cy + (Math.random() - 0.5) * 10,
                vx: Math.cos(angle2) * spd2,
                vy: Math.sin(angle2) * spd2,
                ax: 0, ay: 0,
                life: 50 + Math.random() * 40,
                maxLife: 90,
                size: 1.8 + Math.random() * 3.2,
                color: FISSION_COLORS[Math.floor(Math.random() * FISSION_COLORS.length)],
                shape: shp2,
                glowR: 4 + Math.random() * 6,
                trail: shp2 === "comet" ? [] : null,
                points: shp2 === "star4" ? 4 : (shp2 === "star6" ? 6 : 0),
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.18,
                twinkle: shp2 === "sparkle" ? 0.06 + Math.random() * 0.06 : 0,
                twinkleP: Math.random() * Math.PI * 2,
                decel: 0.94 + Math.random() * 0.04
            });
        }

        /* Scattered halo — 360° sparkle ring */
        for (var h = 0; h < 40; h++) {
            var ha = Math.random() * Math.PI * 2;
            var hr = boardR * (0.2 + Math.random() * 0.4);
            var hspd = 1.2 + Math.random() * 1.8;
            particles.push({
                x: cx + Math.cos(ha) * hr * 0.15,
                y: cy + Math.sin(ha) * hr * 0.15,
                vx: Math.cos(ha) * hspd,
                vy: Math.sin(ha) * hspd,
                ax: 0, ay: 0,
                life: 35 + Math.random() * 30,
                maxLife: 65,
                size: 1.2 + Math.random() * 2.0,
                color: FISSION_COLORS[Math.floor(Math.random() * FISSION_COLORS.length)],
                shape: "sparkle",
                glowR: 3 + Math.random() * 4,
                trail: null,
                points: 0,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.14,
                twinkle: 0.05 + Math.random() * 0.07,
                twinkleP: Math.random() * Math.PI * 2,
                decel: 0.95 + Math.random() * 0.03
            });
        }

        startLoop();
    }

    /* expose */
    return { init: init, trigger: trigger, triggerSplit: triggerSplit };

}());

/* Auto-init when DOM is ready */
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", SpaceEffects.init);
} else {
    SpaceEffects.init();
}
