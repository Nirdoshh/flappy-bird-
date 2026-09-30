"use strict";

/* =====================================================================
   FLAPPY PEACOCK — a complete little game in one file.

   The file is split into 8 numbered sections. Read it top to bottom:

     1. CONFIG     every number you might want to change
     2. STATE      the data that changes while the game runs
     3. HELPERS    tiny reusable functions (clamp, lerp, rand...)
     4. SETUP      canvas, audio, high-score storage
     5. GAME FLOW  start / restart / game over
     6. UPDATE     the rules — physics, pipes, collisions, score
     7. DRAW       the pictures — sky, pipes, ground, bird, text
     8. WIRING     input + the main loop

   Golden rule for beginners: if you want the game to *feel* different,
   change a number in CONFIG. You almost never need to touch the rest.
   ===================================================================== */


/* =====================================================================
   1. CONFIG
   ===================================================================== */

const CONFIG = {
  // The playfield is always this size in game coordinates. If the screen
  // is bigger or smaller, we scale the canvas to fit (see resizeCanvas).
  world: { width: 360, height: 640 },

  /* --- the bird ---------------------------------------------------- */
  gravity: 2000,        // pulled down every second (px/s²). Bigger = falls faster.
  flapStrength: 620,     // instant upward speed from a flap (px/s)
  maxFallSpeed: 700,     // terminal velocity, stops the bird dropping forever
  birdStartX: 96,        // the bird never moves horizontally
  birdStartY: 300,
  birdRadius: 16,        // size of the invisible circle used for collisions.
                        // Deliberately smaller than the drawn peacock, which
                        // is what makes the game forgiving.
  tiltUp: -0.55,         // how far the nose points up, in radians
  tiltDown: 1.5,         // ...and down. 1.57 (≈90°) would be straight down.
  tiltSpeed: 9,          // how quickly the bird rotates between the two

  /* --- the pipes --------------------------------------------------- */
  pipe: {
    width: 58,
    capHeight: 24,       // the wider "lip" on the open end of a pipe
    capExtra: 6,         // how much wider on each side the lip is

    gapStart: 185,       // opening height at score 0
    gapMin: 130,         // opening height when difficulty is maxed out
    speedStart: 150,     // scroll speed at score 0 (px/s)
    speedMax: 235,       // scroll speed when difficulty is maxed out
    spacing: 190,        // horizontal gap between one pipe and the next
    gapWander: 70,       // max the opening may jump up or down per pipe

    // Keeps the opening fair: never higher than the top limit, never
    // lower than (ground - bottom limit).
    gapTopLimit: 60,
    gapBottomLimit: 80,
  },

  // Difficulty ramps from 0 at score 0 to 1 at this score.
  difficultyRamp: 20,

  // How long the game-over screen ignores input, so the flap that killed you
  // can't instantly restart the game.
  restartDelay: 0.6,

  groundHeight: 72,     // the strip of grass and dirt along the bottom

  /* --- colours ----------------------------------------------------- */
  colors: {
    skyTop: "#4ec0ea",
    skyBottom: "#cdeeff",
    grass: "#7cc950",
    grassDark: "#63a840",
    dirt: "#ded4a0",
    dirtLine: "#c9bd84",
    pipe: "#5ab552",
    pipeLight: "#77cd6b",
    pipeDark: "#3f8c39",
    /* --- the peacock -------------------------------------------------- */
    peacockBody: "#2f83ab",
    peacockBodyDark: "#1d6085",
    peacockNeck: "#48a0c4",
    peacockWing: "#2a7f6f",
    featherShaft: "#175b70",
    ocellusOuter: "#2fbfd0",  // the bright ring on a tail feather
    ocellusGold: "#e0ae4c",   // ...and the gold ring inside it
    ocellusInner: "#123f68",  // ...and the dark eye in the middle
    crestTip: "#f0c04a",
    beak: "#e3d3ab",
    eyeWhite: "#ffffff",
    eyeDark: "#12232e",
    text: "#ffffff",
  },
};


/* =====================================================================
   2. STATE

   `state` is everything that changes while you play. Notice it only ever
   holds plain data (numbers, booleans, an array) — no drawing or rules.
   ===================================================================== */

const state = {
  mode: "ready",   // "ready" (waiting) | "playing" | "over"
  score: 0,
  best: 0,
  pipes: [],       // objects that have been spawned and not yet passed
  scroll: 0,       // total distance travelled, used for the ground pattern
  readyTimer: 0,   // counts up while we wait for the first flap
  overTimer: 0,    // counts up after you die, gates the restart
  shake: 0,        // screen-shake strength, fades to 0
  landed: false,   // true once the dead bird has hit the ground

  bird: {
    x: CONFIG.birdStartX,
    y: CONFIG.birdStartY,
    vy: 0,          // vertical speed; negative means "going up"
    radius: CONFIG.birdRadius,
    tilt: 0,
    wingTimer: 0,   // drives the wing animation
  },
};


/* =====================================================================
   3. HELPERS
   ===================================================================== */

// Keeps a number inside a range.
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Linearly interpolates between a and b. `t` of 0 gives a, 1 gives b.
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// A random number somewhere between min and max.
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

// Top edge of the ground, in game coordinates.
function groundTop() {
  return CONFIG.world.height - CONFIG.groundHeight;
}


/* =====================================================================
   4. SETUP
   ===================================================================== */

// Get the 2D drawing tool. You draw with it using the same coordinates
// as a maths graph: (0, 0) is top-left, y grows downwards.
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// Scales the canvas to fit the screen while the game keeps thinking in
// 360x640 units. This is also what makes the game look sharp on retina
// screens — the backing store is drawn at devicePixelRatio resolution.
function resizeCanvas() {
  const { width, height } = CONFIG.world;
  const scale = Math.min(window.innerWidth / width, (window.innerHeight - 110) / height);

  canvas.style.width = width * scale + "px";
  canvas.style.height = height * scale + "px";

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale * dpr);
  canvas.height = Math.round(height * scale * dpr);

  // This single line says: "from now on, draw as if the canvas were
  // 360x640". Everything else in the file can ignore pixels and screen size.
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

/* --- sound ---------------------------------------------------------
   Sounds are synthesised with the Web Audio API, which means we need no
   audio files at all. Browsers refuse to play audio before the user has
   interacted with the page, so we only create the context on the first
   click/keypress (see Sound.unlock).
   ------------------------------------------------------------------ */

const Sound = {
  ctx: null,
  muted: false,

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },

  // One note: a wave that starts at `freq`, slides to `slideTo`, and fades out.
  tone({ freq = 440, slideTo = null, duration = 0.15, type = "sine", volume = 0.2 }) {
    if (this.muted || !this.ctx) return;

    const start = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    if (slideTo !== null) {
      oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    }

    // Ramp down to silence instead of cutting off, which avoids a click.
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(this.ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  },

  flap() {
    this.tone({ freq: 480, slideTo: 300, duration: 0.09, type: "square", volume: 0.09 });
  },

  point() {
    this.tone({ freq: 880, slideTo: 1320, duration: 0.1, type: "triangle", volume: 0.14 });
  },

  hit() {
    this.tone({ freq: 200, slideTo: 55, duration: 0.32, type: "sawtooth", volume: 0.16 });
  },
};

/* --- high score ----------------------------------------------------
   localStorage keeps data between visits. It can throw in private mode,
   hence the try/catch — the game must never break because saving failed.
   ------------------------------------------------------------------ */

const Storage = {
  key: "flappyBird.highScore",

  load() {
    try {
      return Number(localStorage.getItem(this.key)) || 0;
    } catch {
      return 0;
    }
  },

  save(value) {
    try {
      localStorage.setItem(this.key, String(value));
    } catch {
      /* ignore */
    }
  },
};


/* =====================================================================
   5. GAME FLOW — start, restart, end
   ===================================================================== */

// Puts every value back to its starting position.
function resetGame() {
  state.score = 0;
  state.pipes = [];
  state.scroll = 0;
  state.readyTimer = 0;
  state.overTimer = 0;
  state.shake = 0;
  state.landed = false;

  state.bird.x = CONFIG.birdStartX;
  state.bird.y = CONFIG.birdStartY;
  state.bird.vy = 0;
  state.bird.tilt = 0;
  state.bird.radius = CONFIG.birdRadius;
  state.bird.wingTimer = 0;
}

function startGame() {
  resetGame();
  state.mode = "playing";
  flap(); // so your very first input actually lifts the bird
}

function endGame() {
  state.mode = "over";
  state.overTimer = 0;
  state.shake = 1; // fade this out to get the impact
  Sound.hit();

  if (state.score > state.best) {
    state.best = state.score;
    Storage.save(state.best);
  }
}

/* =====================================================================
   6. UPDATE — the rules
   ===================================================================== */

// Difficulty ramps smoothly from 0 (score 0) to 1 (CONFIG.difficultyRamp).
function getDifficulty() {
  const t = clamp(state.score / CONFIG.difficultyRamp, 0, 1);
  return {
    gapHeight: lerp(CONFIG.pipe.gapStart, CONFIG.pipe.gapMin, t),
    speed: lerp(CONFIG.pipe.speedStart, CONFIG.pipe.speedMax, t),
  };
}

function flap() {
  state.bird.vy = -CONFIG.flapStrength;
  state.bird.wingTimer = 0; // restart the wing animation
  Sound.flap();
}

// The one place the bird's position changes.
function updateBird(dt) {
  const bird = state.bird;

  // Before the first flap the bird just bobs up and down in place.
  if (state.mode === "ready") {
    state.readyTimer += dt;
    bird.y = CONFIG.birdStartY + Math.sin(state.readyTimer * 3) * 8;
    bird.vy = 0;
    bird.tilt = Math.cos(state.readyTimer * 3) * 0.15;
    bird.wingTimer = (bird.wingTimer + dt) % 0.7; // gentle idle wing flap
    return;
  }

  // Gravity: add a bit of downward speed, then move by speed × time.
  bird.vy = Math.min(bird.vy + CONFIG.gravity * dt, CONFIG.maxFallSpeed);
  bird.y += bird.vy * dt;

  // Tilt to match how fast we are falling: nose up when rising.
  const t = clamp(bird.vy / CONFIG.maxFallSpeed, -1, 1);
  const targetTilt = lerp(CONFIG.tiltUp, CONFIG.tiltDown, (t + 1) / 2);
  bird.tilt += (targetTilt - bird.tilt) * Math.min(1, CONFIG.tiltSpeed * dt);

  bird.wingTimer = Math.min(bird.wingTimer + dt, 0.35);

  // Stop the bird leaving the top of the screen — softer than killing it.
  if (bird.y < bird.radius) {
    bird.y = bird.radius;
    bird.vy = 0;
  }

  // After a crash the bird is out of play, so let it tumble to the ground
  // instead of sinking through it. `landed` tells update() to freeze.
  if (state.mode === "over") {
    const floor = groundTop() - bird.radius;
    if (bird.y >= floor) {
      bird.y = floor;
      bird.vy = 0;
      bird.tilt = CONFIG.tiltDown;
      state.landed = true;
    }
  }
}

// Moves the pipes left and adds a new one when there is room.
function updatePipes(dt, speed) {
  const width = CONFIG.pipe.width;

  for (const pipe of state.pipes) {
    pipe.x -= speed * dt;
  }

  // Throw away pipes that have gone off the left edge, so state.pipes
  // never grows without bound.
  state.pipes = state.pipes.filter((pipe) => pipe.x + width > -CONFIG.pipe.capExtra * 2);

  // Spawn when the newest pipe has travelled far enough from the last one.
  const last = state.pipes[state.pipes.length - 1];
  if (state.mode === "playing" && (!last || last.x < CONFIG.world.width - CONFIG.pipe.spacing)) {
    spawnPipe(last);
  }
}

// Adds one pipe. Each pipe remembers its own gap size, so a pipe already
// on screen never changes shape just because the difficulty went up.
function spawnPipe(previous) {
  const pipe = CONFIG.pipe;
  const difficulty = getDifficulty();

  const minCenter = pipe.gapTopLimit + difficulty.gapHeight / 2;
  const maxCenter = groundTop() - pipe.gapBottomLimit - difficulty.gapHeight / 2;

  // Only wander a limited distance from the previous opening. Without this
  // you could get an impossible jump from one gap to the next.
  let center = previous
    ? previous.gapCenter + randomBetween(-pipe.gapWander, pipe.gapWander)
    : randomBetween(minCenter, maxCenter);

  state.pipes.push({
    x: CONFIG.world.width,
    gapCenter: clamp(center, minCenter, maxCenter),
    gapHeight: difficulty.gapHeight,
    scored: false, // has the player already earned a point from this pipe?
  });
}

// True if a circle overlaps a rectangle. Used for every collision here.
function circleHitsRect(cx, cy, radius, rx, ry, rw, rh) {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < radius * radius;
}

function checkCollisions() {
  const bird = state.bird;
  const { x, y, radius } = bird;

  // Into the ground?
  if (y + radius >= groundTop()) return true;

  // Into a pipe? Each pipe is two rectangles: one above the gap, one below.
  for (const pipe of state.pipes) {
    const gapTop = pipe.gapCenter - pipe.gapHeight / 2;
    const gapBottom = pipe.gapCenter + pipe.gapHeight / 2;

    if (circleHitsRect(x, y, radius, pipe.x, -20, CONFIG.pipe.width, gapTop + 20)) return true;
    if (circleHitsRect(x, y, radius, pipe.x, gapBottom, CONFIG.pipe.width, CONFIG.world.height + 20 - gapBottom)) {
      return true;
    }
  }

  return false;
}

// Award a point for each pipe the bird has flown completely past.
function updateScore() {
  for (const pipe of state.pipes) {
    if (!pipe.scored && pipe.x + CONFIG.pipe.width < state.bird.x) {
      pipe.scored = true;
      state.score++;
      Sound.point();

      if (state.score > state.best) {
        state.best = state.score;
        Storage.save(state.best);
      }
    }
  }
}

/* --- the main rules step ------------------------------------------
   Called once per animation frame with `dt` = seconds since the last one.
   Nothing here uses a fixed "pixels per frame", which is why the game
   feels the same on a 60Hz laptop and a 120Hz phone.
   ------------------------------------------------------------------ */
function update(dt) {
  updateBird(dt);

  if (state.mode === "ready") return;

  // Counts up after a crash. handleAction() won't restart until it passes
  // CONFIG.restartDelay, so the flap that killed you can't instantly restart.
  if (state.mode === "over") state.overTimer += dt;

  // After a crash the world keeps crawling until the bird lands.
  const baseSpeed = getDifficulty().speed;
  const speed = state.mode === "over" ? baseSpeed * 0.35 : baseSpeed;

  updatePipes(dt, speed);
  state.scroll += speed * dt;

  if (state.landed) return; // bird has hit the dirt, everything is frozen
  if (state.mode === "over") return;

  if (checkCollisions()) {
    endGame();
    return;
  }

  updateScore();
}


/* =====================================================================
   7. DRAW — the pictures
   ===================================================================== */

function draw() {
  const { width, height } = CONFIG.world;

  // The -20/+40 padding is extra room for the screen shake in draw().
  ctx.clearRect(-20, -20, width + 40, height + 40);

  ctx.save();
  if (state.shake > 0) {
    const amount = state.shake * 6;
    ctx.translate(randomBetween(-amount, amount), randomBetween(-amount, amount));
    state.shake = Math.max(0, state.shake - 0.06);
  }

  drawSky();
  drawPipes();
  drawGround();
  drawBird();
  if (state.mode === "playing" || state.mode === "over") drawScore();
  drawMessages();

  ctx.restore();
}

function drawSky() {
  const { width, height } = CONFIG.world;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, CONFIG.colors.skyTop);
  sky.addColorStop(1, CONFIG.colors.skyBottom);

  ctx.fillStyle = sky;
  ctx.fillRect(-20, -20, width + 40, height + 40);
}

function drawPipes() {
  for (const pipe of state.pipes) {
    const gapTop = pipe.gapCenter - pipe.gapHeight / 2;
    const gapBottom = pipe.gapCenter + pipe.gapHeight / 2;

    // Top pipe: runs from above the screen down to the gap, lip at the bottom.
    drawPipeBody(pipe.x, -20, CONFIG.pipe.width, gapTop + 20, true);
    // Bottom pipe: runs from the gap to below the screen, lip at the top.
    drawPipeBody(pipe.x, gapBottom, CONFIG.pipe.width, CONFIG.world.height + 20 - gapBottom, false);
  }
}

// One pipe segment plus its wider lip. `lipAtBottom` says which end the
// open end is on.
function drawPipeBody(x, y, w, h, lipAtBottom) {
  const colors = CONFIG.colors;

  ctx.fillStyle = colors.pipe;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = colors.pipeLight;
  ctx.fillRect(x + w * 0.16, y, w * 0.2, h);
  ctx.fillStyle = colors.pipeDark;
  ctx.fillRect(x + w * 0.74, y, w * 0.09, h);

  const lipWidth = w + CONFIG.pipe.capExtra * 2;
  const lipX = x - CONFIG.pipe.capExtra;
  const lipY = lipAtBottom ? y + h - CONFIG.pipe.capHeight : y;

  ctx.fillStyle = colors.pipe;
  ctx.fillRect(lipX, lipY, lipWidth, CONFIG.pipe.capHeight);
  ctx.fillStyle = colors.pipeLight;
  ctx.fillRect(lipX + lipWidth * 0.16, lipY, lipWidth * 0.2, CONFIG.pipe.capHeight);
  ctx.fillStyle = colors.pipeDark;
  ctx.fillRect(lipX + lipWidth * 0.74, lipY, lipWidth * 0.09, CONFIG.pipe.capHeight);
}

function drawGround() {
  const { width } = CONFIG.world;
  const top = groundTop();
  const colors = CONFIG.colors;

  ctx.fillStyle = colors.dirt;
  ctx.fillRect(-20, top, width + 40, CONFIG.groundHeight + 20);

  // Scrolling diagonal stripes give a sense of speed.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-20, top, width + 40, CONFIG.groundHeight);
  ctx.clip();

  ctx.strokeStyle = colors.dirtLine;
  ctx.lineWidth = 7;
  const offset = -(state.scroll % 28);
  for (let x = offset; x < width + 28; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, CONFIG.world.height + 20);
    ctx.lineTo(x + CONFIG.groundHeight, top);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = colors.grass;
  ctx.fillRect(-20, top, width + 40, 13);
  ctx.fillStyle = colors.grassDark;
  ctx.fillRect(-20, top + 13, width + 40, 4);
}

// The peacock is drawn in four passes, back to front:
//   tail fan -> body + wing -> neck + head -> crest, beak, eye
// Everything is drawn in "bird space": the origin is the bird's centre and
// +x is the way it is travelling.
function drawBird() {
  const bird = state.bird;

  ctx.save();
  ctx.translate(bird.x, bird.y);
  ctx.rotate(bird.tilt);

  drawTail();
  drawBody(bird);
  drawHead();

  ctx.restore();
}

// The fanned tail. Drawn first so the body overlaps it, which is what makes
// it read as a peacock rather than a fan of feathers behind a blob.
function drawTail() {
  const colors = CONFIG.colors;
  const feathers = 9;
  const originX = -2;
  const originY = 6;

  for (let i = 0; i < feathers; i++) {
    const t = i / (feathers - 1);

    // Sweep from up-and-back (135°) through straight back (180°) to
    // down-and-back (225°). In canvas, +y points down, so these angles
    // open out behind the bird.
    const angle = lerp(Math.PI * 0.75, Math.PI * 1.25, t);

    // Longest feather in the middle of the fan, so it looks like a fan.
    const length = 26 * (0.66 + 0.34 * Math.cos((t - 0.5) * Math.PI));

    const tipX = originX + Math.cos(angle) * length;
    const tipY = originY + Math.sin(angle) * length;

    // The shaft.
    ctx.strokeStyle = colors.featherShaft;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // The "eye" at the tip: three concentric ovals, squashed across the
    // feather rather than along it. Rotating first lines the long axis up
    // with the shaft.
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(angle);
    const rings = [
      [6.2, 5.4, colors.ocellusOuter],
      [4.1, 3.6, colors.ocellusGold],
      [2.1, 1.9, colors.ocellusInner],
    ];
    for (const [rx, ry, color] of rings) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawBody(bird) {
  const colors = CONFIG.colors;

  // Body.
  ctx.fillStyle = colors.peacockBody;
  ctx.beginPath();
  ctx.ellipse(0, 2, 15, 12, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // Darker underside, for a bit of shape.
  ctx.fillStyle = colors.peacockBodyDark;
  ctx.beginPath();
  ctx.ellipse(2, 7, 11, 6, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // Wing. Sweeps up and back down once per flap, exactly like before.
  const wingProgress = bird.wingTimer / 0.35;
  ctx.save();
  ctx.rotate(-0.35 + Math.sin(wingProgress * Math.PI) * 0.9);
  ctx.fillStyle = colors.peacockWing;
  ctx.beginPath();
  ctx.ellipse(-3, 0, 9.5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHead() {
  const colors = CONFIG.colors;

  // The long neck: a single stroked curve, drawn thick with round ends.
  ctx.strokeStyle = colors.peacockNeck;
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(6, -2);
  ctx.quadraticCurveTo(16, -10, 12, -21);
  ctx.stroke();

  const hx = 12;
  const hy = -23;

  // Crest: three thin stalks, each ending in a little ball. This one detail
  // does more than any other to say "peacock".
  ctx.strokeStyle = colors.peacockNeck;
  ctx.lineWidth = 1.4;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(hx, hy - 2);
    ctx.lineTo(hx + i * 3.5, hy - 9);
    ctx.stroke();

    ctx.fillStyle = colors.crestTip;
    ctx.beginPath();
    ctx.arc(hx + i * 3.5, hy - 9.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head.
  ctx.fillStyle = colors.peacockBody;
  ctx.beginPath();
  ctx.arc(hx, hy, 5, 0, Math.PI * 2);
  ctx.fill();

  // Beak.
  ctx.fillStyle = colors.beak;
  ctx.beginPath();
  ctx.moveTo(hx + 3, hy - 1);
  ctx.lineTo(hx + 10, hy + 1.5);
  ctx.lineTo(hx + 3, hy + 4);
  ctx.closePath();
  ctx.fill();

  // Eye.
  ctx.fillStyle = colors.eyeWhite;
  ctx.beginPath();
  ctx.arc(hx + 1.5, hy - 1.5, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.eyeDark;
  ctx.beginPath();
  ctx.arc(hx + 2.2, hy - 1.5, 1.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawScore() {
  drawText(String(state.score), CONFIG.world.width / 2, 46, { size: 40 });
}

// The title screen and the game-over panel.
function drawMessages() {
  const { width, height } = CONFIG.world;

  if (state.mode === "ready") {
    drawText("FLAPPY PEACOCK", width / 2, height * 0.2, { size: 28 });
    drawText("Tap, click or press Space to flap", width / 2, height * 0.28, {
      size: 14,
      color: "#0d3c58",
      stroke: false,
    });
    if (state.best > 0) {
      drawText("Best: " + state.best, width / 2, height * 0.78, { size: 16 });
    }
    return;
  }

  if (state.mode === "over") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.fillRect(-20, -20, width + 40, height + 40);

    drawText("GAME OVER", width / 2, height * 0.3, { size: 30 });

    // Score panel.
    const panelW = 210;
    const panelH = 116;
    const panelX = (width - panelW) / 2;
    const panelY = height * 0.4;

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    fillRoundedRect(panelX, panelY, panelW, panelH, 12);

    drawText("SCORE", panelX + panelW * 0.3, panelY + 30, { size: 13, color: "#8a6d3b", stroke: false });
    drawText("BEST", panelX + panelW * 0.72, panelY + 30, { size: 13, color: "#8a6d3b", stroke: false });
    drawText(String(state.score), panelX + panelW * 0.3, panelY + 66, { size: 30, color: "#2b2b2b", stroke: false });
    drawText(String(state.best), panelX + panelW * 0.72, panelY + 66, { size: 30, color: "#2b2b2b", stroke: false });

    if (state.score === state.best && state.score > 0) {
      drawText("NEW BEST!", width / 2, panelY - 22, { size: 18, color: "#ffe066" });
    }

    // Small pause so the click that killed you can't restart instantly.
    if (state.overTimer > CONFIG.restartDelay) {
      drawText("Tap or press Space to play again", width / 2, height * 0.78, { size: 14 });
    }
  }
}

// Fills a rounded rectangle. ctx.roundRect is recent, so fall back to a
// plain rectangle on older browsers rather than throwing (an exception
// inside draw() would stop the animation loop for good).
function fillRoundedRect(x, y, w, h, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();
}

// One helper for every piece of text, so fonts stay consistent.
function drawText(text, x, y, { size = 20, color = CONFIG.colors.text, stroke = true } = {}) {
  ctx.font = "bold " + size + "px 'Trebuchet MS', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (stroke) {
    ctx.lineWidth = Math.max(2, size / 9);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.strokeText(text, x, y);
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}


/* =====================================================================
   8. WIRING — input and the main loop
   ===================================================================== */

// Every way of playing does the same thing: flap, start, or restart.
function handleAction() {
  Sound.unlock(); // must happen inside a real user interaction

  if (state.mode === "ready") {
    startGame();
  } else if (state.mode === "playing") {
    flap();
  } else if (state.overTimer > CONFIG.restartDelay) {
    startGame();
  }
}

window.addEventListener("keydown", (event) => {
  if (event.repeat) return; // holding the key should not machine-gun flaps
  if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") {
    event.preventDefault(); // stop Space from scrolling the page
    handleAction();
  }
});

// pointerdown covers mouse, touch and pen with one listener.
canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  handleAction();
});

// Right-click on the canvas would otherwise pop up a menu mid-game.
canvas.addEventListener("contextmenu", (event) => event.preventDefault());

// Mute button.
const muteButton = document.getElementById("muteButton");
muteButton.addEventListener("click", () => {
  Sound.unlock();
  Sound.muted = !Sound.muted;
  muteButton.textContent = "Sound: " + (Sound.muted ? "Off" : "On");
  muteButton.setAttribute("aria-pressed", String(Sound.muted));
  // Otherwise Space would "click" this button and flap at the same time.
  muteButton.blur();
});

/* --- the main loop -------------------------------------------------
   requestAnimationFrame calls `loop` once per frame, roughly 60 times a
   second, and hands us the current timestamp in milliseconds. We turn
   that into `dt` in seconds.
   ------------------------------------------------------------------ */
let lastTime = performance.now();

function loop(now) {
  // Clamped to 0.05s so a backgrounded tab can't teleport the bird into
  // a pipe the instant you switch back.
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

// Put everything back to the starting position and begin.
state.best = Storage.load();
resetGame();
requestAnimationFrame(loop);