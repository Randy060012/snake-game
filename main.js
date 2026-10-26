// Attendre que le HTML soit totalement chargé avant d'initialiser les sélecteurs et événements
document.addEventListener("DOMContentLoaded", () => {

  // Éléments DOM
  const playBoard = document.querySelector(".play-board");
  const scoreVal = document.querySelector(".score-val");
  const highScoreVal = document.querySelector(".high-score-val");
  const coinsVal = document.querySelector(".coins-val");

  const modalOverlay = document.getElementById("modalOverlay");
  const startBox = document.getElementById("startBox");
  const countdownBox = document.getElementById("countdownBox");
  const countdownText = document.getElementById("countdownText");
  const gameOverBox = document.getElementById("gameOverBox");
  const shopBox = document.getElementById("shopBox");
  const infoBox = document.getElementById("infoBox");
  const pauseBox = document.getElementById("pauseBox");

  const gameModeSelect = document.getElementById("gameModeSelect");
  const timerContainer = document.getElementById("timerContainer");
  const timerVal = document.getElementById("timerVal");

  const gameOverScore = document.querySelector(".game-over-score");
  const earnedCoins = document.querySelector(".earned-coins");
  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.querySelector(".restart-btn");
  const shopToggleBtns = document.querySelectorAll(".shop-toggle-btn");
  const closeShopBtn = document.querySelector(".close-shop-btn");
  const infoBtn = document.getElementById("infoBtn");
  const closeInfoBtn = document.querySelector(".close-info-btn");

  const abilityBtn = document.getElementById("abilityBtn");
  const abilityText = document.getElementById("abilityText");
  const cooldownOverlay = document.getElementById("cooldownOverlay");
  const effectsBar = document.getElementById("effectsBar");
  const upgradeItems = document.getElementById("upgradeItems");
  const speedFill = document.getElementById("speedFill");
  const speedValue = document.getElementById("speedValue");
  const recordVal = document.querySelector(".record-val");
  const newRecordTag = document.getElementById("newRecord");
  const bdScore = document.querySelector(".bd-score");
  const bdFlat = document.querySelector(".bd-flat");
  const bdDensity = document.querySelector(".bd-density");
  const bdDensityCoins = document.querySelector(".bd-density-coins");

  // Noyau de règles (core.js) : source unique des constantes et des règles,
  // verrouillée par la suite de tests (node --test).
  const C = window.SnakeCore;

  // ==========================================
  // 🔊 MOTEUR AUDIO WEB AUDIO API
  // ==========================================
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) audioCtx = new AudioContext();
  }

  function playSound(type) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    if (type === 'eat') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } 
    else if (type === 'powerup') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } 
    else if (type === 'dash') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(400, now + 0.15);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } 
    else if (type === 'gameover') {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(80, now + 0.5);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  }

  // État du jeu
  let gameEnd = false;
  let isPaused = false;
  let isDashing = false;
  let currentGameMode = "classic";
  let turnQueue = []; // virages en attente, un seul consommé par tick

  const initialSpeed = C.INITIAL_SPEED;
  const minSpeed = C.MIN_SPEED;
  const speedStep = C.SPEED_STEP;
  let normalSpeed = initialSpeed;
  let dashSpeed = C.DASH_MAX_SPEED;

  // Dash — valeurs effectives, éventuellement améliorées en boutique (applyUpgrades)
  let dashCells = C.DASH_CELLS;
  let maxDashCharges = C.MAX_DASH_CHARGES;
  let dashRegenSeconds = C.DASH_REGEN_SECONDS;
  let dashCellsLeft = 0;
  let dashCharges = 1;
  let regenMs = 0; // progression vers la prochaine charge

  // Mode Chrono & Obstacles
  let chronoTime = 60;
  let chronoInterval = null;
  const MAX_OBSTACLE_COLLISIONS = 3;
  let obstacleCollisions = 0;
  let obstacles = []; // murs persistants du mode Obstacles

  // Capacités & Effets actifs
  const GIGA_DURATION_MS = C.GIGA_DURATION_MS;
  const INVULNERABLE_DURATION_MS = C.INVULNERABLE_DURATION_MS;
  const MAGNET_CHARGES = C.MAGNET_CHARGES;
  let hasShield = false;
  let isInvulnerable = false;
  let invulnMsLeft = 0;
  let isGiga = false;
  let gigaMsLeft = 0;
  let magnetCharges = 0;
  let extraGoldFoods = [];

  let mainFood = { x: 0, y: 0, type: 'normal' };
  let snakeX = 5, snakeY = 10;
  let moveX = 1, moveY = 0;
  let snakeBody = [];
  let intervalId = null;
  let tickMs = initialSpeed; // durée du tick en cours, sert à décompter les effets en temps réel
  let score = 0;
  let startTime;

  // Données Joueur — sauvegarde versionnée, migrée depuis l'ancien format
  const STORAGE_KEY = "snake_player_data";
  const STORAGE_VERSION = 2;

  const UPGRADES = [
    { key: "regen", label: "Recharge du Dash : 4s → 2,5s", cost: 400 },
    { key: "range", label: "Portée du Dash : 4 → 6 cases", cost: 500 },
    { key: "charges", label: "Charges de Dash : 3 → 4", cost: 350 },
  ];

  function loadPlayerData() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { raw = null; }
    if (!raw || typeof raw !== "object") raw = {};
    return {
      v: STORAGE_VERSION,
      highScore: raw.highScore || 0,
      coins: raw.coins || 0,
      unlockedSkins: Array.isArray(raw.unlockedSkins) && raw.unlockedSkins.length ? raw.unlockedSkins : ["classic"],
      equippedSkin: raw.equippedSkin || "classic",
      upgrades: (raw.upgrades && typeof raw.upgrades === "object") ? raw.upgrades : {},
    };
  }

  let playerData = loadPlayerData();

  // Les améliorations changent le jeu, pas la palette : elles s'appliquent ici,
  // en un seul endroit, pour que le reste du code lise une valeur déjà résolue.
  function applyUpgrades() {
    dashCells = playerData.upgrades.range ? 6 : C.DASH_CELLS;
    maxDashCharges = playerData.upgrades.charges ? 4 : C.MAX_DASH_CHARGES;
    dashRegenSeconds = playerData.upgrades.regen ? 2.5 : C.DASH_REGEN_SECONDS;
    if (dashCharges > maxDashCharges) dashCharges = maxDashCharges;
    updateDashUi();
  }

  function savePlayerData() {
    localStorage.setItem("snake_player_data", JSON.stringify(playerData));
    updateUI();
  }

  function updateUI() {
    if (highScoreVal) highScoreVal.innerText = playerData.highScore;
    if (coinsVal) coinsVal.innerText = playerData.coins;
  }

  const getRandomPosition = () => {
    let x, y, valid = false;
    while (!valid) {
      x = Math.floor(Math.random() * 30) + 1;
      y = Math.floor(Math.random() * 30) + 1;
      valid = !snakeBody.some(segment => segment[0] === x && segment[1] === y) &&
              !(mainFood.x === x && mainFood.y === y) &&
              !obstacles.some(o => o.x === x && o.y === y) &&
              !extraGoldFoods.some(f => f.x === x && f.y === y);
    }
    return { x, y };
  };

  const changeFoodPosition = () => {
    let pos = getRandomPosition();
    mainFood.x = pos.x;
    mainFood.y = pos.y;

    mainFood.type = C.pickBallType(Math.random());

  };

  /* Mode Obstacles : le plateau garde une mémoire. Un mur tous les
     OBSTACLE_EVERY_POINTS points, jamais dans l'axe proche de la tête et jamais
     là où il fermerait le plateau (noyau : obstacleFits + bfsReachable). */
  function addObstacleIfDue() {
    if (currentGameMode !== "survival") return;
    if (!C.obstaclesDue(score, obstacles.length)) return;

    const blocked = new Set();
    snakeBody.forEach(s => blocked.add(C.cellKey(s[0], s[1])));
    obstacles.forEach(o => blocked.add(C.cellKey(o.x, o.y)));

    const ctx = {
      head: { x: snakeX, y: snakeY },
      dir: { x: moveX, y: moveY },
      food: { x: mainFood.x, y: mainFood.y },
      blocked: blocked,
      minAhead: C.OBSTACLE_MIN_AHEAD,
    };

    for (let attempt = 0; attempt < 40; attempt++) {
      const cell = {
        x: Math.floor(Math.random() * C.GRID_SIZE) + 1,
        y: Math.floor(Math.random() * C.GRID_SIZE) + 1,
      };
      if (C.obstacleFits(cell, ctx)) {
        obstacles.push(cell);
        return;
      }
    }
  }

  function activateInvulnerability() {
    // Durée décomptée par la boucle de jeu : la pause la gèle donc naturellement
    isInvulnerable = true;
    invulnMsLeft = INVULNERABLE_DURATION_MS;
  }

  function applyFoodEffect(type) {
    score += C.BALL_SCORES[type] || 0;

    // Aura Giga : chaque boule vaut 2 points de plus tant qu'elle est active
    if (isGiga) score += C.GIGA_BONUS;

    if (type === 'normal') {
      playSound('eat');
    } else {
      playSound('powerup');
      if (type === 'shield') hasShield = true;
      else if (type === 'dash') addDashCharge();
      else if (type === 'gold_rain') {
        extraGoldFoods = [];
        for (let i = 0; i < 3; i++) {
          let p = getRandomPosition();
          extraGoldFoods.push({ x: p.x, y: p.y });
        }
      }
      else if (type === 'giga') {
        isGiga = true;
        gigaMsLeft = GIGA_DURATION_MS;
      }
      else if (type === 'magnet') magnetCharges = MAGNET_CHARGES;
      else if (type === 'invulnerable') activateInvulnerability();

      if (currentGameMode === "chrono") {
        chronoTime += 3;
        timerVal.innerText = chronoTime;
      }
    }
  }

  // Un seul endroit (re)programme la boucle de jeu, pour garder tickMs synchronisé
  function setLoopInterval(ms) {
    clearInterval(intervalId);
    tickMs = ms;
    intervalId = setInterval(createGame, ms);
  }

  window.togglePause = function() {
    if (gameEnd || (intervalId === null && !isPaused)) return;
    isPaused = !isPaused;

    if (isPaused) {
      clearInterval(intervalId);
      if (chronoInterval) clearInterval(chronoInterval);
      modalOverlay.classList.remove("hidden");
      pauseBox.classList.remove("hidden");
    } else {
      modalOverlay.classList.add("hidden");
      pauseBox.classList.add("hidden");
      setLoopInterval(isDashing ? dashSpeed : normalSpeed);
      if (currentGameMode === "chrono") startChronoTimer();
    }
  };

  const createGame = () => {
    if (gameEnd || isPaused) return;
    if (!stepSnake()) return; // partie terminée : endGame a déjà pris la main
    renderBoard();
  };

  /* Un tick de jeu : virages, durées des effets, déplacement, collisions,
     nourriture, score. Renvoie false quand la partie vient de se terminer. */
  const stepSnake = () => {
    // Un seul virage est consommé par tick, dans l'ordre des appuis
    const turn = C.consumeTurn(turnQueue);
    if (turn.dir) { moveX = turn.dir.x; moveY = turn.dir.y; }
    turnQueue = turn.queue;

    // Le dash couvre exactement dashCells cases, puis rend la main
    if (isDashing) {
      dashCellsLeft--;
      if (dashCellsLeft <= 0) endDash();
      else updateDashUi();
    }

    // Durées des effets actifs, décomptées en temps réel (donc gelées en pause)
    const effects = C.tickEffects({ giga: gigaMsLeft, invuln: invulnMsLeft }, tickMs);
    gigaMsLeft = effects.budgets.giga;
    invulnMsLeft = effects.budgets.invuln;
    effects.expired.forEach(key => {
      if (key === "giga") isGiga = false;
      else isInvulnerable = false;
    });

    // Mode Obstacles : un mur ne se traverse pas. On cogne, on ne bouge pas de ce
    // tick, on perd un choc — et le bloc reste (le plateau garde sa mémoire).
    const nextX = snakeX + moveX;
    const nextY = snakeY + moveY;
    if (!isInvulnerable && obstacles.some(o => o.x === nextX && o.y === nextY)) {
      obstacleCollisions++;
      updateEffectsUi();
      if (obstacleCollisions >= MAX_OBSTACLE_COLLISIONS) {
        gameEnd = true;
        endGame();
        return false;
      }
      return true;
    }

    snakeX = nextX;
    snakeY = nextY;

    // Traversée des murs si invulnérable
    if (isInvulnerable) {
      if (snakeX <= 0) snakeX = 30;
      else if (snakeX > 30) snakeX = 1;
      if (snakeY <= 0) snakeY = 30;
      else if (snakeY > 30) snakeY = 1;
    }

    if (magnetCharges > 0) {
      mainFood.x = snakeX;
      mainFood.y = snakeY;
      magnetCharges--;
    }

    let hitWall = (snakeX <= 0 || snakeX > 30 || snakeY <= 0 || snakeY > 30);
    let hitSelf = snakeBody.some((segment, index) => index !== 0 && snakeX === segment[0] && snakeY === segment[1]);

    if (!isInvulnerable && (hitWall || hitSelf)) {
      if (hasShield) {
        hasShield = false;
        if (hitWall) {
          if (snakeX <= 0) snakeX = 1;
          if (snakeX > 30) snakeX = 30;
          if (snakeY <= 0) snakeY = 1;
          if (snakeY > 30) snakeY = 30;
        }
      } else {
        gameEnd = true;
        endGame();
        return false;
      }
    }

    let ateFood = false;
    if (snakeX === mainFood.x && snakeY === mainFood.y) {
      applyFoodEffect(mainFood.type);
      changeFoodPosition();
      ateFood = true;
    }

    for (let i = extraGoldFoods.length - 1; i >= 0; i--) {
      if (snakeX === extraGoldFoods[i].x && snakeY === extraGoldFoods[i].y) {
        score += C.EXTRA_GOLD_SCORE;
        if (isGiga) score += C.GIGA_BONUS;
        playSound('eat');
        extraGoldFoods.splice(i, 1);
        ateFood = true;
      }
    }

    if (ateFood) {
      scoreVal.innerText = score;
      snakeBody.push([snakeX, snakeY]);
      addObstacleIfDue();

      if (normalSpeed > minSpeed) {
        normalSpeed = C.nextSpeed(normalSpeed, minSpeed, speedStep);
        if (!isDashing && !isPaused) setLoopInterval(normalSpeed);
      }
    } else {
      snakeBody.unshift([snakeX, snakeY]);
      snakeBody.pop();
    }

    return true;
  };

  // Rendu du plateau : uniquement de l'affichage, aucune décision de jeu
  const renderBoard = () => {
    let html = "";
    let foodClasses = {
      normal: "food-normal", golden: "food-golden", shield: "food-shield",
      dash: "food-dash-item", gold_rain: "food-gold-rain", giga: "food-giga", 
      magnet: "food-magnet", invulnerable: "food-autopilot" // Utilise le même style visuel (bille orange)
    };

    html += `<div class="${foodClasses[mainFood.type]}" style="grid-area: ${mainFood.y} / ${mainFood.x}"></div>`;

    obstacles.forEach(o => {
      html += `<div class="obstacle-block" style="grid-area: ${o.y} / ${o.x}"></div>`;
    });

    extraGoldFoods.forEach(f => {
      html += `<div class="food-golden" style="grid-area: ${f.y} / ${f.x}"></div>`;
    });

    let skinClass = `snake-skin-${playerData.equippedSkin}`;
    let dashClass = isDashing ? "dash-effect" : "";
    let shieldClass = hasShield ? "shield-effect" : "";
    let gigaClass = isGiga ? "giga-effect" : "";
    let magnetClass = magnetCharges > 0 ? "magnet-effect" : "";
    let invulnerableClass = isInvulnerable ? "invulnerable-effect" : "";

    for (let i = 0; i < snakeBody.length; i++) {
      let isHead = (i === 0);
      let headStyle = (isDashing && isHead) ? "transform: scale(1.15);" : "";
      html += `<div class="snake ${skinClass} ${dashClass} ${shieldClass} ${gigaClass} ${magnetClass} ${invulnerableClass}" style="grid-area: ${snakeBody[i][1]} / ${snakeBody[i][0]}; ${headStyle}"></div>`;
    }

    playBoard.innerHTML = html;
    updateEffectsUi();
    speedFill.style.width = Math.round(C.speedRatio(normalSpeed, initialSpeed, minSpeed) * 100) + "%";
    speedValue.innerText = C.casesPerSecond(tickMs) + " cases/s";
  };

  window.changeDirection = function(dir) {
    initAudio();
    if (isPaused || gameEnd) return;
    // Règle des virages (demi-tour refusé, file de 2) : décidée par le noyau, testée
    turnQueue = C.enqueueTurn(turnQueue, { x: moveX, y: moveY }, dir, C.TURN_QUEUE_MAX);
  };

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); togglePause(); }
    else if (e.code === "Enter") { e.preventDefault(); activateAbility(); }
    else if (e.key === "ArrowLeft") changeDirection("Left");
    else if (e.key === "ArrowUp") changeDirection("Up");
    else if (e.key === "ArrowRight") changeDirection("Right");
    else if (e.key === "ArrowDown") changeDirection("Down");
  });

  // Affiche l'état du dash : temps restant, charges disponibles ou temps de recharge
  function updateDashUi() {
    const remainingSeconds = ((Math.max(0, dashCellsLeft) * dashSpeed) / 1000).toFixed(1).replace(".", ",");

    const regenTotal = dashRegenSeconds * 1000;

    if (isDashing) {
      abilityText.innerHTML = `<i class="fa-solid fa-bolt"></i> ${remainingSeconds} s`;
    } else if (dashCharges > 0) {
      abilityText.innerHTML = `<i class="fa-solid fa-bolt"></i> Dash ${dashCharges}/${maxDashCharges}`;
    } else {
      abilityText.innerHTML = `<i class="fa-solid fa-bolt"></i> ${Math.ceil((regenTotal - regenMs) / 1000)}s`;
    }

    abilityBtn.classList.toggle("cooldown", !isDashing && dashCharges === 0);

    const regenPercent = (isDashing || dashCharges >= maxDashCharges)
      ? 0
      : (regenMs / regenTotal) * 100;
    cooldownOverlay.style.width = regenPercent + "%";
  }

  function addDashCharge() {
    // La bille bleue recharge complètement le dash, sans le déclencher
    dashCharges = maxDashCharges;
    regenMs = 0;
    updateDashUi();
  }

  const secondsFr = ms => (ms / 1000).toFixed(1).replace(".", ",");

  // Un bandeau par effet actif : barre qui se vide pour les durées, compteur sinon
  function effectChip(label, ratio, valueText, kind) {
    const track = ratio === null
      ? ""
      : `<span class="effect-track"><span class="effect-fill" style="width:${Math.max(0, Math.min(1, ratio)) * 100}%"></span></span>`;
    return `<span class="effect-chip effect-${kind}"><span class="effect-label">${label}</span>${track}<span class="effect-value">${valueText}</span></span>`;
  }

  function updateEffectsUi() {
    const chips = [];
    if (isGiga) chips.push(effectChip("Giga", gigaMsLeft / GIGA_DURATION_MS, secondsFr(gigaMsLeft) + "s", "giga"));
    if (isInvulnerable) chips.push(effectChip("Invincible", invulnMsLeft / INVULNERABLE_DURATION_MS, secondsFr(invulnMsLeft) + "s", "invuln"));
    if (hasShield) chips.push(effectChip("Bouclier", null, "1 choc", "shield"));
    if (magnetCharges > 0) chips.push(effectChip("Aimant", magnetCharges / MAGNET_CHARGES, "×" + magnetCharges, "magnet"));
    if (currentGameMode === "survival") {
      // Chocs restants avant la fin de partie (murs franchis = murs perdus)
      const lives = Math.max(0, MAX_OBSTACLE_COLLISIONS - obstacleCollisions);
      chips.push(effectChip("Chocs", lives / MAX_OBSTACLE_COLLISIONS, lives + "/" + MAX_OBSTACLE_COLLISIONS, "wall"));
    }
    effectsBar.innerHTML = chips.join("");
    effectsBar.classList.toggle("hidden", chips.length === 0);
  }

  function endDash() {
    if (!isDashing) return;

    isDashing = false;
    dashCellsLeft = 0;
    abilityBtn.classList.remove("active");

    if (!isPaused && !gameEnd) setLoopInterval(normalSpeed);

    updateDashUi();
  }

  window.activateAbility = function() {
    initAudio();
    if (gameEnd || isPaused || isDashing || dashCharges <= 0) return;
    if (!modalOverlay.classList.contains("hidden")) return;

    dashCharges--;
    regenMs = 0;
    playSound('dash');

    // Vitesse relative : le dash garde la même lisibilité du début à la fin de la partie
    dashSpeed = C.dashSpeedFor(normalSpeed);
    dashCellsLeft = dashCells;
    isDashing = true;

    abilityBtn.classList.add("active");
    updateDashUi();

    setLoopInterval(dashSpeed);
  };

  /* Un seul endroit connaît l'état d'une partie : ajouter une mécanique ne peut
     plus laisser un reliquat derrière soi (c'est ce qui faisait survivre le dash
     à une pause et les effets au game over). */
  function clearActiveEffects() {
    isDashing = false;
    dashCellsLeft = 0;
    abilityBtn.classList.remove("active");
    isInvulnerable = false;
    invulnMsLeft = 0;
    isGiga = false;
    gigaMsLeft = 0;
    hasShield = false;
    magnetCharges = 0;
    updateEffectsUi();
  }

  function resetRunState() {
    clearActiveEffects();

    gameEnd = false;
    isPaused = false;
    obstacleCollisions = 0;
    obstacles = [];
    extraGoldFoods = [];

    normalSpeed = initialSpeed;
    dashSpeed = C.DASH_MAX_SPEED;
    dashCharges = 1;
    regenMs = 0;
    turnQueue = [];
    intervalId = null;
    score = 0;
    snakeX = 5; snakeY = 10;
    moveX = 1; moveY = 0;
    snakeBody = [[snakeX, snakeY]];
  }

  function startChronoTimer() {
    if (chronoInterval) clearInterval(chronoInterval);
    chronoInterval = setInterval(() => {
      if (!isPaused && !gameEnd) {
        chronoTime--;
        timerVal.innerText = chronoTime;
        if (chronoTime <= 0) {
          clearInterval(chronoInterval);
          gameEnd = true;
          endGame();
        }
      }
    }, 1000);
  }

  const endGame = () => {
    playSound('gameover');
    clearInterval(intervalId);
    if (chronoInterval) clearInterval(chronoInterval);

    intervalId = null;
    clearActiveEffects();

    const durationSeconds = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
    const coins = C.coinsFor(score, durationSeconds);
    const isNewRecord = score > playerData.highScore;

    playerData.coins += coins.total;
    if (isNewRecord) playerData.highScore = score;

    savePlayerData();

    // Fin de partie lisible : le score, le record, et d'où viennent les pièces
    gameOverScore.innerText = score;
    earnedCoins.innerText = coins.total;
    if (recordVal) recordVal.innerText = playerData.highScore;
    if (newRecordTag) newRecordTag.classList.toggle("hidden", !isNewRecord);
    if (bdScore) bdScore.innerText = score;
    if (bdFlat) bdFlat.innerText = coins.flat;
    if (bdDensity) bdDensity.innerText = (score / coins.seconds).toFixed(2).replace(".", ",");
    if (bdDensityCoins) bdDensityCoins.innerText = coins.density;

    startBox.classList.add("hidden");
    countdownBox.classList.add("hidden");
    shopBox.classList.add("hidden");
    infoBox.classList.add("hidden");
    pauseBox.classList.add("hidden");

    modalOverlay.classList.remove("hidden");
    gameOverBox.classList.remove("hidden");
  };

  const startCountdown = () => {
    initAudio();
    currentGameMode = gameModeSelect.value;

    startBox.classList.add("hidden");
    gameOverBox.classList.add("hidden");
    shopBox.classList.add("hidden");
    infoBox.classList.add("hidden");
    pauseBox.classList.add("hidden");
    countdownBox.classList.remove("hidden");

    if (currentGameMode === "chrono") {
      chronoTime = 60;
      timerVal.innerText = chronoTime;
      timerContainer.classList.remove("hidden");
    } else {
      timerContainer.classList.add("hidden");
    }

    let count = 5;
    countdownText.innerText = count;

    resetRunState();
    scoreVal.innerText = score;
    changeFoodPosition();
    updateDashUi();
    updateEffectsUi();

    let countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        countdownText.innerText = count;
      } else {
        clearInterval(countdownTimer);
        modalOverlay.classList.add("hidden");
        countdownBox.classList.add("hidden");

        startTime = Date.now();
        setLoopInterval(normalSpeed);

        if (currentGameMode === "chrono") startChronoTimer();
      }
    }, 1000);
  };

  function renderUpgradeShop() {
    if (!upgradeItems) return;
    upgradeItems.innerHTML = UPGRADES.map(u => {
      const owned = !!playerData.upgrades[u.key];
      return `<button class="skin-btn upgrade-btn"${owned ? " disabled" : ""} onclick="buyUpgrade('${u.key}')">` +
        `${u.label}<br><span class="upgrade-cost">${owned ? "Acquise" : u.cost + " pièces"}</span></button>`;
    }).join("");
  }

  window.buyUpgrade = function(key) {
    const upgrade = UPGRADES.find(u => u.key === key);
    if (!upgrade || playerData.upgrades[key]) return;
    if (playerData.coins < upgrade.cost) { alert("Pas assez de pièces !"); return; }

    playerData.coins -= upgrade.cost;
    playerData.upgrades[key] = true;
    applyUpgrades();
    savePlayerData();
    renderUpgradeShop();
  };

  window.buyOrEquipSkin = function(skinName, cost) {
    if (playerData.unlockedSkins.includes(skinName)) {
      playerData.equippedSkin = skinName;
    } else if (playerData.coins >= cost) {
      playerData.coins -= cost;
      playerData.unlockedSkins.push(skinName);
      playerData.equippedSkin = skinName;
    } else {
      alert("Pas assez de pièces !");
    }
    savePlayerData();
  };

  // Événements Modales
  startBtn.addEventListener("click", startCountdown);
  restartBtn.addEventListener("click", startCountdown);

  shopToggleBtns.forEach(btn => btn.addEventListener("click", () => {
    startBox.classList.add("hidden");
    gameOverBox.classList.add("hidden");
    renderUpgradeShop();
    shopBox.classList.remove("hidden");
    modalOverlay.classList.remove("hidden");
  }));

  closeShopBtn.addEventListener("click", () => {
    shopBox.classList.add("hidden");
    startBox.classList.remove("hidden");
  });

  infoBtn.addEventListener("click", () => {
    startBox.classList.add("hidden");
    infoBox.classList.remove("hidden");
    modalOverlay.classList.remove("hidden");
  });

  closeInfoBtn.addEventListener("click", () => {
    infoBox.classList.add("hidden");
    startBox.classList.remove("hidden");
  });

  // Recharge automatique d'une charge de dash (durée issue des améliorations),
  // gelée en pause, pendant le compte à rebours et après un game over.
  setInterval(() => {
    if (gameEnd || isPaused || intervalId === null) return;
    if (dashCharges >= maxDashCharges) {
      regenMs = 0;
      updateDashUi();
      return;
    }
    regenMs += 250;
    if (regenMs >= dashRegenSeconds * 1000) {
      regenMs = 0;
      dashCharges++;
    }
    updateDashUi();
  }, 250);

  applyUpgrades();
  renderUpgradeShop();
  updateDashUi();
  updateUI();
});