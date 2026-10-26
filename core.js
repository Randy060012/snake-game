/* Noyau de règles de Snake Arcade.
   Logique pure : aucune référence au DOM, à une minuterie ou au son.
   Chargé par <script src="core.js"> dans le navigateur (expose window.SnakeCore)
   et par require("./core.js") dans les tests node.
   Aucune dépendance, aucune étape de build : le jeu s'ouvre toujours par double-clic. */
(function (root) {
  "use strict";

  const GRID_SIZE = 30;

  // Vitesse de déplacement, en millisecondes par case
  const INITIAL_SPEED = 150;
  const MIN_SPEED = 90;
  const SPEED_STEP = 3;

  // Dash : portée fixe en cases, vitesse relative à la vitesse courante
  const DASH_CELLS = 4;
  const DASH_SPEED_RATIO = 0.6;
  const DASH_MIN_SPEED = 45;
  const DASH_MAX_SPEED = 90;
  const MAX_DASH_CHARGES = 3;
  const DASH_REGEN_SECONDS = 4;
  const TURN_QUEUE_MAX = 2;

  // Durées et valeurs des effets
  const GIGA_DURATION_MS = 8000;
  const GIGA_BONUS = 2;
  const INVULNERABLE_DURATION_MS = 3000;
  const MAGNET_CHARGES = 3;

  // Barème
  const BALL_SCORES = {
    normal: 1, golden: 3, shield: 2, dash: 2,
    gold_rain: 2, giga: 2, magnet: 2, invulnerable: 3
  };
  const EXTRA_GOLD_SCORE = 3;
  const COINS_PER_POINT = 10;
  const COINS_DENSITY_WEIGHT = 20;

  // Table de tirage des boules : seuils croissants
  const BALL_TABLE = [
    { upTo: 0.45, type: "normal" },
    { upTo: 0.65, type: "golden" },
    { upTo: 0.73, type: "shield" },
    { upTo: 0.81, type: "dash" },
    { upTo: 0.87, type: "gold_rain" },
    { upTo: 0.92, type: "giga" },
    { upTo: 0.96, type: "magnet" },
    { upTo: 1, type: "invulnerable" }
  ];

  const DIRECTIONS = {
    Left: { x: -1, y: 0 },
    Up: { x: 0, y: -1 },
    Right: { x: 1, y: 0 },
    Down: { x: 0, y: 1 }
  };
  const DIRECTION_LIST = [DIRECTIONS.Left, DIRECTIONS.Up, DIRECTIONS.Right, DIRECTIONS.Down];

  // Obstacles persistants (mode Obstacles)
  const OBSTACLE_EVERY_POINTS = 5;
  const OBSTACLE_MIN_AHEAD = 4;
  const MAX_OBSTACLES = 40;

  const cellKey = (x, y) => x + "," + y;

  function inBounds(x, y) {
    return x >= 1 && x <= GRID_SIZE && y >= 1 && y <= GRID_SIZE;
  }

  function pickBallType(rand) {
    for (let i = 0; i < BALL_TABLE.length; i++) {
      if (rand < BALL_TABLE[i].upTo) return BALL_TABLE[i].type;
    }
    return BALL_TABLE[BALL_TABLE.length - 1].type;
  }

  // Le dash reste lisible toute la partie : toujours ~1,6x la vitesse courante
  function dashSpeedFor(normalSpeed) {
    return Math.min(DASH_MAX_SPEED, Math.max(DASH_MIN_SPEED, Math.round(normalSpeed * DASH_SPEED_RATIO)));
  }

  function dashDurationMs(dashSpeed) {
    return DASH_CELLS * dashSpeed;
  }

  // Une boule mangée = un cran de vitesse en moins, jamais sous le plancher
  function nextSpeed(current, min, step) {
    const floor = min || MIN_SPEED;
    const decrement = step || SPEED_STEP;
    return current - decrement < floor ? floor : current - decrement;
  }

  function casesPerSecond(msPerCell) {
    return Math.round(1000 / msPerCell);
  }

  function speedRatio(normalSpeed, initial, min) {
    const top = initial || INITIAL_SPEED;
    const floor = min || MIN_SPEED;
    const span = top - floor;
    if (span <= 0) return 1;
    return Math.max(0, Math.min(1, (top - normalSpeed) / span));
  }

  const sameDirection = (a, b) => a.x === b.x && a.y === b.y;
  const isReversal = (a, b) => a.x === -b.x && a.y === -b.y;

  function directionFor(name) {
    return DIRECTIONS[name] || null;
  }

  /* Empile un virage sans jamais l'appliquer tout de suite.
     Le virage est validé contre la direction d'où il sera réellement appliqué :
     le dernier virage en attente s'il y en a un, sinon la direction en cours.
     Deux appuis rapprochés sont donc honorés l'un après l'autre, et un
     demi-tour reste impossible. Renvoie une nouvelle file (entrée non modifiée). */
  function enqueueTurn(queue, currentDir, name, maxQueue) {
    const next = directionFor(name);
    if (!next) return queue;
    const max = maxQueue || TURN_QUEUE_MAX;
    const base = queue.length > 0 ? queue[queue.length - 1] : currentDir;
    if (isReversal(next, base)) return queue;
    if (sameDirection(next, base)) return queue;
    if (queue.length >= max) return queue;
    return queue.concat([{ x: next.x, y: next.y }]);
  }

  // Consomme un seul virage par tick, dans l'ordre des appuis
  function consumeTurn(queue) {
    if (queue.length === 0) return { dir: null, queue: queue };
    return { dir: queue[0], queue: queue.slice(1) };
  }

  // Décompte en temps réel (donc gelé pendant une pause : la boucle ne tourne pas)
  function tickEffects(budgets, tickMs) {
    const next = {};
    const expired = [];
    Object.keys(budgets).forEach(key => {
      const left = budgets[key];
      if (left > 0) {
        const after = left - tickMs;
        if (after <= 0) {
          next[key] = 0;
          expired.push(key);
        } else {
          next[key] = after;
        }
      } else {
        next[key] = 0;
      }
    });
    return { budgets: next, expired: expired };
  }

  /* Pièces gagnées : un terme fixe (10 par point) et un terme de densité
     (20 x points par seconde). La densité est renvoyée en complément du fixe
     pour que l'affichage s'additionne exactement au total crédité. */
  function coinsFor(score, durationSeconds) {
    const seconds = Math.max(1, Math.floor(durationSeconds));
    const flat = score * COINS_PER_POINT;
    const densityRaw = (score / seconds) * COINS_DENSITY_WEIGHT;
    const total = Math.floor(flat + densityRaw);
    return { seconds: seconds, flat: flat, density: total - flat, total: total };
  }

  function effectRatio(left, total) {
    if (!total) return 0;
    return Math.max(0, Math.min(1, left / total));
  }

  function obstaclesDue(score, count) {
    if (count >= MAX_OBSTACLES) return false;
    return score >= (count + 1) * OBSTACLE_EVERY_POINTS;
  }

  /* Un bloc ne doit jamais apparaître dans l'axe du serpent, à moins de
     OBSTACLE_MIN_AHEAD cases devant sa tête : la mort doit être évitable. */
  function isTooCloseAhead(head, dir, cell, minAhead) {
    const ahead = (cell.x - head.x) * dir.x + (cell.y - head.y) * dir.y;
    const lateral = Math.abs((cell.x - head.x) * dir.y) + Math.abs((cell.y - head.y) * dir.x);
    if (lateral !== 0) return false;
    return ahead > 0 && ahead < (minAhead || OBSTACLE_MIN_AHEAD);
  }

  function obstacleFits(cell, ctx) {
    if (!inBounds(cell.x, cell.y)) return false;
    if (cell.x === ctx.head.x && cell.y === ctx.head.y) return false;
    const key = cellKey(cell.x, cell.y);
    if (ctx.blocked && ctx.blocked.has(key)) return false;
    if (isTooCloseAhead(ctx.head, ctx.dir, cell, ctx.minAhead)) return false;
    // le plateau doit rester franchissable : la nourriture reste atteignable
    // (la case de la nourriture est la cible, elle n'est jamais un obstacle)
    const blocked = new Set(ctx.blocked || []);
    blocked.delete(cellKey(ctx.food.x, ctx.food.y));
    blocked.add(key);
    return bfsReachable(blocked, ctx.head, ctx.food, GRID_SIZE);
  }

  function bfsReachable(blockedKeys, start, goal, size) {
    const blocked = blockedKeys instanceof Set ? blockedKeys : new Set(blockedKeys);
    const grid = size || GRID_SIZE;
    if (blocked.has(cellKey(goal.x, goal.y))) return false;
    if (start.x === goal.x && start.y === goal.y) return true;
    const seen = new Set([cellKey(start.x, start.y)]);
    const queue = [start];
    while (queue.length > 0) {
      const cur = queue.shift();
      for (let i = 0; i < DIRECTION_LIST.length; i++) {
        const d = DIRECTION_LIST[i];
        const nx = cur.x + d.x;
        const ny = cur.y + d.y;
        if (nx < 1 || nx > grid || ny < 1 || ny > grid) continue;
        const key = cellKey(nx, ny);
        if (seen.has(key) || blocked.has(key)) continue;
        if (nx === goal.x && ny === goal.y) return true;
        seen.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
    return false;
  }

  const api = {
    GRID_SIZE: GRID_SIZE,
    INITIAL_SPEED: INITIAL_SPEED,
    MIN_SPEED: MIN_SPEED,
    SPEED_STEP: SPEED_STEP,
    DASH_CELLS: DASH_CELLS,
    DASH_SPEED_RATIO: DASH_SPEED_RATIO,
    DASH_MIN_SPEED: DASH_MIN_SPEED,
    DASH_MAX_SPEED: DASH_MAX_SPEED,
    MAX_DASH_CHARGES: MAX_DASH_CHARGES,
    DASH_REGEN_SECONDS: DASH_REGEN_SECONDS,
    TURN_QUEUE_MAX: TURN_QUEUE_MAX,
    GIGA_DURATION_MS: GIGA_DURATION_MS,
    GIGA_BONUS: GIGA_BONUS,
    INVULNERABLE_DURATION_MS: INVULNERABLE_DURATION_MS,
    MAGNET_CHARGES: MAGNET_CHARGES,
    BALL_SCORES: BALL_SCORES,
    EXTRA_GOLD_SCORE: EXTRA_GOLD_SCORE,
    COINS_PER_POINT: COINS_PER_POINT,
    COINS_DENSITY_WEIGHT: COINS_DENSITY_WEIGHT,
    BALL_TABLE: BALL_TABLE,
    DIRECTIONS: DIRECTIONS,
    OBSTACLE_EVERY_POINTS: OBSTACLE_EVERY_POINTS,
    OBSTACLE_MIN_AHEAD: OBSTACLE_MIN_AHEAD,
    MAX_OBSTACLES: MAX_OBSTACLES,
    cellKey: cellKey,
    inBounds: inBounds,
    pickBallType: pickBallType,
    dashSpeedFor: dashSpeedFor,
    dashDurationMs: dashDurationMs,
    nextSpeed: nextSpeed,
    casesPerSecond: casesPerSecond,
    speedRatio: speedRatio,
    sameDirection: sameDirection,
    isReversal: isReversal,
    directionFor: directionFor,
    enqueueTurn: enqueueTurn,
    consumeTurn: consumeTurn,
    tickEffects: tickEffects,
    coinsFor: coinsFor,
    effectRatio: effectRatio,
    obstaclesDue: obstaclesDue,
    isTooCloseAhead: isTooCloseAhead,
    obstacleFits: obstacleFits,
    bfsReachable: bfsReachable
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.SnakeCore = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
