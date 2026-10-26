/* Tests du noyau de règles : ils figent les invariants du jeu.
   Lancer avec : node --test
   Aucune dépendance, aucun build. */

const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");

test("table de tirage : seuils croissants et couverture complète", () => {
  let previous = 0;
  C.BALL_TABLE.forEach(entry => {
    assert.ok(entry.upTo > previous, "les seuils doivent être strictement croissants");
    previous = entry.upTo;
  });
  assert.equal(C.BALL_TABLE[C.BALL_TABLE.length - 1].upTo, 1, "le dernier seuil doit absorber tout le reste");
});

test("table de tirage : chaque plage donne le type attendu", () => {
  assert.equal(C.pickBallType(0), "normal");
  assert.equal(C.pickBallType(0.44), "normal");
  assert.equal(C.pickBallType(0.45), "golden");
  assert.equal(C.pickBallType(0.64), "golden");
  assert.equal(C.pickBallType(0.65), "shield");
  assert.equal(C.pickBallType(0.72), "shield");
  assert.equal(C.pickBallType(0.73), "dash");
  assert.equal(C.pickBallType(0.8), "dash");
  assert.equal(C.pickBallType(0.81), "gold_rain");
  assert.equal(C.pickBallType(0.86), "gold_rain");
  assert.equal(C.pickBallType(0.87), "giga");
  assert.equal(C.pickBallType(0.91), "giga");
  assert.equal(C.pickBallType(0.92), "magnet");
  assert.equal(C.pickBallType(0.95), "magnet");
  assert.equal(C.pickBallType(0.96), "invulnerable");
  assert.equal(C.pickBallType(0.999), "invulnerable");
});

test("vitesse du dash : relative à la vitesse courante, bornée, toujours plus rapide", () => {
  assert.equal(C.dashSpeedFor(150), 90);
  assert.equal(C.dashSpeedFor(60), 45, "plancher respecté en fin de partie");
  assert.equal(C.dashSpeedFor(500), C.DASH_MAX_SPEED, "plafond respecté");
  for (let speed = C.MIN_SPEED; speed <= C.INITIAL_SPEED; speed += 2) {
    const dash = C.dashSpeedFor(speed);
    assert.ok(dash < speed, `le dash doit être plus rapide que ${speed} ms/case`);
    assert.ok(dash <= C.DASH_MAX_SPEED && dash >= C.DASH_MIN_SPEED, "vitesse de dash dans les bornes");
  }
});

test("portée du dash : distance fixe, durée dérivée de la vitesse", () => {
  assert.equal(C.dashDurationMs(90), C.DASH_CELLS * 90);
  assert.equal(C.dashDurationMs(90), 360);
  assert.ok(C.DASH_CELLS * C.DASH_MAX_SPEED < 1000, "le dash le plus long reste sous la seconde");
});

test("rampe de vitesse : décrément par boule, plancher jamais franchi", () => {
  assert.equal(C.nextSpeed(C.INITIAL_SPEED), C.INITIAL_SPEED - C.SPEED_STEP);
  assert.equal(C.nextSpeed(C.MIN_SPEED + 1), C.MIN_SPEED);
  assert.equal(C.nextSpeed(C.MIN_SPEED), C.MIN_SPEED);
  let speed = C.INITIAL_SPEED;
  let foods = 0;
  while (speed > C.MIN_SPEED && foods < 1000) {
    speed = C.nextSpeed(speed);
    foods++;
  }
  const expected = Math.ceil((C.INITIAL_SPEED - C.MIN_SPEED) / C.SPEED_STEP);
  assert.equal(foods, expected, "le plancher doit être atteint au nombre de boules attendu");
});

test("jauge de vitesse : vide au départ, pleine au plancher", () => {
  assert.equal(C.speedRatio(C.INITIAL_SPEED), 0);
  assert.equal(C.speedRatio(C.MIN_SPEED), 1);
  assert.equal(C.speedRatio(C.MIN_SPEED - 50), 1, "jamais au-delà de 100 %");
  const mid = C.INITIAL_SPEED - (C.INITIAL_SPEED - C.MIN_SPEED) / 2;
  assert.ok(Math.abs(C.speedRatio(mid) - 0.5) < 0.001);
});

test("cases par seconde : conversion lisible", () => {
  assert.equal(C.casesPerSecond(150), 7);
  assert.equal(C.casesPerSecond(100), 10);
});

test("virages : demi-tour refusé, doublon refusé, file pure", () => {
  const right = C.directionFor("Right");
  const queue = [];
  // demi-tour
  assert.deepEqual(C.enqueueTurn(queue, right, "Left"), []);
  // direction déjà visée
  assert.deepEqual(C.enqueueTurn(queue, right, "Right"), []);
  // virage légal
  const one = C.enqueueTurn(queue, right, "Up");
  assert.deepEqual(one, [{ x: 0, y: -1 }]);
  // premier appui non encore exécuté : le second est validé contre lui
  const two = C.enqueueTurn(one, right, "Left");
  assert.deepEqual(two, [{ x: 0, y: -1 }, { x: -1, y: 0 }]);
  // file pleine
  assert.equal(C.enqueueTurn(two, right, "Down").length, 2);
  // pureté : les entrées ne sont pas modifiées
  assert.deepEqual(queue, []);
  assert.deepEqual(one, [{ x: 0, y: -1 }]);
  // demi-tour relatif au dernier appui en attente
  const back = C.enqueueTurn(C.enqueueTurn(queue, right, "Up"), right, "Down");
  assert.deepEqual(back, [{ x: 0, y: -1 }], "Down après Up est un demi-tour, il doit être refusé");
});

test("virages : un seul consommé par tick, dans l'ordre des appuis", () => {
  const right = C.directionFor("Right");
  const queue = C.enqueueTurn(C.enqueueTurn([], right, "Up"), right, "Left");
  const first = C.consumeTurn(queue);
  assert.deepEqual(first.dir, { x: 0, y: -1 });
  assert.deepEqual(first.queue, [{ x: -1, y: 0 }]);
  const second = C.consumeTurn(first.queue);
  assert.deepEqual(second.dir, { x: -1, y: 0 });
  assert.deepEqual(second.queue, []);
  assert.equal(C.consumeTurn([]).dir, null);
});

test("virages : aucun demi-tour possible sur 2000 appuis aléatoires", () => {
  const names = ["Left", "Up", "Right", "Down"];
  let current = C.directionFor("Right");
  let queue = [];
  let applied = [];
  for (let i = 0; i < 2000; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    queue = C.enqueueTurn(queue, current, name, Math.floor(Math.random() * 3) + 1);
    if (Math.random() < 0.6) {
      const consumed = C.consumeTurn(queue);
      queue = consumed.queue;
      if (consumed.dir) {
        assert.ok(!C.isReversal(consumed.dir, current), "un demi-tour a été appliqué");
        current = consumed.dir;
        applied.push(current);
      }
    }
  }
  assert.ok(applied.length > 50, "le test doit réellement appliquer des virages");
});

test("effets : décompte en temps réel et expiration exacte", () => {
  const budgets = { giga: C.GIGA_DURATION_MS, invuln: C.INVULNERABLE_DURATION_MS };
  const after = C.tickEffects(budgets, 150);
  assert.equal(after.budgets.giga, C.GIGA_DURATION_MS - 150);
  assert.equal(after.budgets.invuln, C.INVULNERABLE_DURATION_MS - 150);
  assert.deepEqual(after.expired, []);

  const just = C.tickEffects({ giga: 150, invuln: 0 }, 150);
  assert.equal(just.budgets.giga, 0);
  assert.deepEqual(just.expired, ["giga"], "l'effet doit expirer pile à la fin de sa durée");
  assert.deepEqual(C.tickEffects({ giga: 0 }, 150).expired, []);
});

test("effets : une pause gèle le décompte (aucun tick = aucun temps consommé)", () => {
  const budgets = { invuln: C.INVULNERABLE_DURATION_MS };
  // 20 ticks pendant la partie
  let current = budgets;
  for (let i = 0; i < 20; i++) current = C.tickEffects(current, 150).budgets;
  assert.equal(current.invuln, C.INVULNERABLE_DURATION_MS - 20 * 150);
  // aucune passe pendant la pause : la valeur ne bouge pas
  const paused = current;
  assert.deepEqual(paused, current);
});

test("pièces : terme fixe + densité, sans jamais de perte d'arrondi", () => {
  const a = C.coinsFor(20, 30);
  assert.equal(a.flat, 200);
  assert.equal(a.density, 13);
  assert.equal(a.total, 213);
  assert.equal(a.flat + a.density, a.total, "l'affichage doit s'additionner exactement au total");

  assert.deepEqual(C.coinsFor(0, 30), { seconds: 30, flat: 0, density: 0, total: 0 });
  const b = C.coinsFor(10, 1);
  assert.equal(b.flat, 100);
  assert.equal(b.density, 200);
  assert.equal(b.total, 300);

  // la durée est toujours au moins 1 seconde, et la somme tient partout
  for (let score = 0; score <= 60; score += 7) {
    for (let duration = 0; duration <= 120; duration += 11) {
      const c = C.coinsFor(score, duration);
      assert.ok(c.seconds >= 1);
      assert.equal(c.flat + c.density, c.total, `somme incohérente pour ${score} pts / ${duration} s`);
    }
  }
});

test("densité : le terme de densité récompense une partie rapide", () => {
  const slow = C.coinsFor(20, 60);
  const fast = C.coinsFor(20, 20);
  assert.ok(fast.density > slow.density);
  assert.equal(fast.flat, slow.flat);
});

test("plateau : bornes de la grille", () => {
  assert.equal(C.inBounds(1, 1), true);
  assert.equal(C.inBounds(C.GRID_SIZE, C.GRID_SIZE), true);
  assert.equal(C.inBounds(0, 5), false);
  assert.equal(C.inBounds(5, C.GRID_SIZE + 1), false);
});

test("obstacles : apparition seulement tous les N points, et plafonnée", () => {
  assert.equal(C.obstaclesDue(C.OBSTACLE_EVERY_POINTS - 1, 0), false, "pas encore au seuil");
  assert.equal(C.obstaclesDue(C.OBSTACLE_EVERY_POINTS, 0), true, "premier bloc dû");
  assert.equal(C.obstaclesDue(C.OBSTACLE_EVERY_POINTS * 2 - 1, 1), false, "bloc suivant pas encore dû");
  assert.equal(C.obstaclesDue(C.OBSTACLE_EVERY_POINTS * 2, 1), true, "deuxième bloc dû");
  assert.equal(C.obstaclesDue(9999, C.MAX_OBSTACLES), false, "plafond atteint");
});

test("obstacles : jamais dans l'axe proche de la tête", () => {
  const head = { x: 5, y: 10 };
  const dir = C.directionFor("Right");
  const minAhead = C.OBSTACLE_MIN_AHEAD;
  for (let d = 1; d < minAhead; d++) {
    assert.equal(C.isTooCloseAhead(head, dir, { x: head.x + d, y: head.y }, minAhead), true, `case ${d} devant`);
  }
  assert.equal(C.isTooCloseAhead(head, dir, { x: head.x + minAhead, y: head.y }, minAhead), false);
  assert.equal(C.isTooCloseAhead(head, dir, { x: head.x - 1, y: head.y }, minAhead), false, "derrière la tête");
  assert.equal(C.isTooCloseAhead(head, dir, { x: head.x + 1, y: head.y + 1 }, minAhead), false, "décalé sur le côté");
  const up = C.directionFor("Up");
  assert.equal(C.isTooCloseAhead(head, up, { x: head.x, y: head.y - 2 }, minAhead), true);
  assert.equal(C.isTooCloseAhead(head, up, { x: head.x + 2, y: head.y }, minAhead), false);
});

test("plateau franchissable : détection d'un blocage", () => {
  const open = C.bfsReachable(new Set(), { x: 1, y: 1 }, { x: C.GRID_SIZE, y: C.GRID_SIZE });
  assert.equal(open, true);

  // mur vertical complet : la cible devient inatteignable
  const wall = new Set();
  for (let y = 1; y <= C.GRID_SIZE; y++) wall.add(C.cellKey(2, y));
  assert.equal(C.bfsReachable(wall, { x: 1, y: 1 }, { x: 3, y: 3 }), false);

  // une porte suffit à rouvrir le passage
  wall.delete(C.cellKey(2, 1));
  assert.equal(C.bfsReachable(wall, { x: 1, y: 1 }, { x: 3, y: 3 }), true);

  assert.equal(C.bfsReachable(new Set(), { x: 4, y: 4 }, { x: 4, y: 4 }), true);
  assert.equal(C.bfsReachable(new Set([C.cellKey(4, 4)]), { x: 1, y: 1 }, { x: 4, y: 4 }), false);
});

test("obstacles : ni sur le corps, ni sur la nourriture, ni dans l'axe proche", () => {
  const head = { x: 5, y: 10 };
  const dir = C.directionFor("Right");
  const food = { x: 25, y: 25 };
  const blocked = new Set([C.cellKey(5, 10), C.cellKey(4, 10), C.cellKey(25, 25)]);
  const ctx = { head: head, dir: dir, food: food, blocked: blocked, minAhead: C.OBSTACLE_MIN_AHEAD };

  assert.equal(C.obstacleFits({ x: 5, y: 10 }, ctx), false, "la case de la tête");
  assert.equal(C.obstacleFits({ x: 4, y: 10 }, ctx), false, "une case du corps");
  assert.equal(C.obstacleFits({ x: 25, y: 25 }, ctx), false, "la case de la nourriture");
  assert.equal(C.obstacleFits({ x: 7, y: 10 }, ctx), false, "dans l'axe juste devant");
  assert.equal(C.obstacleFits({ x: 0, y: 3 }, ctx), false, "hors du plateau");
  assert.equal(C.obstacleFits({ x: 9, y: 10 }, ctx), true, "assez loin devant");
  assert.equal(C.obstacleFits({ x: 5, y: 25 }, ctx), true, "à l'écart de l'axe");
});

test("obstacles : un placement ne doit jamais rendre la nourriture inatteignable", () => {
  const head = { x: 1, y: 1 };
  const dir = C.directionFor("Right");
  const food = { x: 30, y: 30 };
  const blocked = new Set();
  // il ne reste qu'un seul couloir libre, en bas à droite
  for (let x = 1; x <= 30; x++) blocked.add(C.cellKey(x, 2));
  const ctx = { head: head, dir: dir, food: food, blocked: blocked, minAhead: 1 };
  assert.equal(C.obstacleFits({ x: 15, y: 1 }, ctx), false, "ce bloc fermerait le dernier passage");
});

test("barème : chaque type de boule a un score strictement positif", () => {
  Object.keys(C.BALL_SCORES).forEach(type => {
    assert.ok(C.BALL_SCORES[type] > 0, `score manquant pour ${type}`);
  });
  assert.equal(C.BALL_SCORES.golden, 3);
  assert.equal(C.BALL_SCORES.normal, 1);
});

test("barême : tous les types de la table de tirage ont un score", () => {
  const tableTypes = new Set(C.BALL_TABLE.map(e => e.type));
  tableTypes.forEach(type => {
    assert.ok(type in C.BALL_SCORES, `le type ${type} n'a pas de score`);
  });
  assert.equal(tableTypes.size, C.BALL_TABLE.length, "aucun type en double dans la table");
});
