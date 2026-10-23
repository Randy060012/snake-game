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
  let abilityCooldown = false;
  let currentGameMode = "classic";

  const initialSpeed = 150;
  let normalSpeed = initialSpeed;
  let dashSpeed = 50;
  const minSpeed = 60;

  // Mode Chrono & Obstacles
  let chronoTime = 60;
  let chronoInterval = null;
  let obstacleCollisions = 0;
  let obstacleFood = { x: 0, y: 0, active: false };

  // Capacités & Effets actifs
  let hasShield = false;
  let isInvulnerable = false;
  let invulnerabilityTimer = null;
  let isGiga = false;
  let magnetCharges = 0;
  let extraGoldFoods = [];

  let mainFood = { x: 0, y: 0, type: 'normal' };
  let snakeX = 5, snakeY = 10;
  let moveX = 1, moveY = 0;
  let lastMoveX = 1, lastMoveY = 0;
  let snakeBody = [];
  let intervalId = null;
  let score = 0;
  let startTime;

  // Données Joueur
  let playerData = JSON.parse(localStorage.getItem("snake_player_data")) || {
    highScore: 0,
    coins: 0,
    unlockedSkins: ["classic"],
    equippedSkin: "classic",
  };

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
              !(obstacleFood.x === x && obstacleFood.y === y) &&
              !extraGoldFoods.some(f => f.x === x && f.y === y);
    }
    return { x, y };
  };

  const changeFoodPosition = () => {
    let pos = getRandomPosition();
    mainFood.x = pos.x;
    mainFood.y = pos.y;

    let rand = Math.random();
    if (rand < 0.45) mainFood.type = 'normal';
    else if (rand < 0.65) mainFood.type = 'golden';
    else if (rand < 0.73) mainFood.type = 'shield';
    else if (rand < 0.81) mainFood.type = 'dash';
    else if (rand < 0.87) mainFood.type = 'gold_rain';
    else if (rand < 0.92) mainFood.type = 'giga';
    else if (rand < 0.96) mainFood.type = 'magnet';
    else mainFood.type = 'invulnerable';

    if (currentGameMode === "survival" && Math.random() < 0.3) {
      let oPos = getRandomPosition();
      obstacleFood = { x: oPos.x, y: oPos.y, active: true };
    }
  };

  function activateInvulnerability() {
    isInvulnerable = true;
    if (invulnerabilityTimer) clearTimeout(invulnerabilityTimer);

    // 3 secondes d'invulnérabilité
    invulnerabilityTimer = setTimeout(() => {
      isInvulnerable = false;
    }, 3000);
  }

  function applyFoodEffect(type) {
    if (type === 'normal') {
      score += 1;
      playSound('eat');
    } else {
      playSound('powerup');
      if (type === 'golden') score += 3;
      else if (type === 'shield') { score += 2; hasShield = true; }
      else if (type === 'dash') { score += 2; activateAbility(); }
      else if (type === 'gold_rain') {
        score += 2;
        extraGoldFoods = [];
        for (let i = 0; i < 3; i++) {
          let p = getRandomPosition();
          extraGoldFoods.push({ x: p.x, y: p.y });
        }
      }
      else if (type === 'giga') {
        score += 2;
        isGiga = true;
        setTimeout(() => { isGiga = false; }, 8000);
      }
      else if (type === 'magnet') { score += 2; magnetCharges = 3; }
      else if (type === 'invulnerable') { score += 3; activateInvulnerability(); }

      if (currentGameMode === "chrono") {
        chronoTime += 3;
        timerVal.innerText = chronoTime;
      }
    }
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
      let speed = isDashing ? dashSpeed : normalSpeed;
      intervalId = setInterval(createGame, speed);
      if (currentGameMode === "chrono") startChronoTimer();
    }
  };

  const createGame = () => {
    if (gameEnd || isPaused) return;

    snakeX += moveX;
    snakeY += moveY;

    // Traversée des murs si invulnérable
    if (isInvulnerable) {
      if (snakeX <= 0) snakeX = 30;
      else if (snakeX > 30) snakeX = 1;
      if (snakeY <= 0) snakeY = 30;
      else if (snakeY > 30) snakeY = 1;
    }

    lastMoveX = moveX;
    lastMoveY = moveY;

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
        return endGame();
      }
    }

    let ateFood = false;
    if (snakeX === mainFood.x && snakeY === mainFood.y) {
      applyFoodEffect(mainFood.type);
      changeFoodPosition();
      ateFood = true;
    }

    if (obstacleFood.active && snakeX === obstacleFood.x && snakeY === obstacleFood.y) {
      obstacleFood.active = false;
      if (!isInvulnerable) {
        obstacleCollisions++;
        if (obstacleCollisions >= 3) {
          gameEnd = true;
          return endGame();
        }
      }
    }

    for (let i = extraGoldFoods.length - 1; i >= 0; i--) {
      if (snakeX === extraGoldFoods[i].x && snakeY === extraGoldFoods[i].y) {
        score += 3;
        playSound('eat');
        extraGoldFoods.splice(i, 1);
        ateFood = true;
      }
    }

    if (ateFood) {
      scoreVal.innerText = score;
      snakeBody.push([snakeX, snakeY]);

      if (normalSpeed > minSpeed) {
        normalSpeed -= 2;
        if (normalSpeed < minSpeed) normalSpeed = minSpeed;
        if (!isDashing && !isPaused) {
          clearInterval(intervalId);
          intervalId = setInterval(createGame, normalSpeed);
        }
      }
    } else {
      snakeBody.unshift([snakeX, snakeY]);
      snakeBody.pop();
    }

    let html = "";
    let foodClasses = {
      normal: "food-normal", golden: "food-golden", shield: "food-shield",
      dash: "food-dash-item", gold_rain: "food-gold-rain", giga: "food-giga", 
      magnet: "food-magnet", invulnerable: "food-autopilot" // Utilise le même style visuel (bille orange)
    };

    html += `<div class="${foodClasses[mainFood.type]}" style="grid-area: ${mainFood.y} / ${mainFood.x}"></div>`;

    if (obstacleFood.active) {
      html += `<div class="obstacle-block" style="grid-area: ${obstacleFood.y} / ${obstacleFood.x}"></div>`;
    }

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
  };

  window.changeDirection = function(dir) {
    initAudio();
    if (isPaused) return;

    if (dir === "Left" && lastMoveX !== 1) { moveX = -1; moveY = 0; }
    else if (dir === "Up" && lastMoveY !== 1) { moveX = 0; moveY = -1; }
    else if (dir === "Right" && lastMoveX !== -1) { moveX = 1; moveY = 0; }
    else if (dir === "Down" && lastMoveY !== -1) { moveX = 0; moveY = 1; }
  };

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); togglePause(); }
    else if (e.code === "Enter") { e.preventDefault(); activateAbility(); }
    else if (e.key === "ArrowLeft") changeDirection("Left");
    else if (e.key === "ArrowUp") changeDirection("Up");
    else if (e.key === "ArrowRight") changeDirection("Right");
    else if (e.key === "ArrowDown") changeDirection("Down");
  });

  window.activateAbility = function() {
    initAudio();
    if (abilityCooldown || gameEnd || isPaused || !modalOverlay.classList.contains("hidden")) return;

    playSound('dash');
    abilityCooldown = true;
    isDashing = true;

    abilityBtn.classList.add("active");
    abilityText.innerHTML = `<i class="fa-solid fa-bolt"></i> DASH !`;

    clearInterval(intervalId);
    intervalId = setInterval(createGame, dashSpeed);

    setTimeout(() => {
      isDashing = false;
      abilityBtn.classList.remove("active");
      abilityBtn.classList.add("cooldown");

      if (!isPaused && !gameEnd) {
        clearInterval(intervalId);
        intervalId = setInterval(createGame, normalSpeed);
      }

      let cooldownTime = 3000;
      let startCld = Date.now();

      let cooldownInterval = setInterval(() => {
        let elapsed = Date.now() - startCld;
        let remainingPercent = Math.max(0, 100 - (elapsed / cooldownTime) * 100);
        cooldownOverlay.style.width = remainingPercent + "%";

        let remainingSeconds = ((cooldownTime - elapsed) / 1000).toFixed(1);
        if (remainingSeconds > 0) abilityText.innerText = `${remainingSeconds}s`;

        if (elapsed >= cooldownTime) {
          clearInterval(cooldownInterval);
          abilityCooldown = false;
          abilityBtn.classList.remove("cooldown");
          cooldownOverlay.style.width = "0%";
          abilityText.innerHTML = `<i class="fa-solid fa-bolt"></i> Dash`;
        }
      }, 50);
    }, 1500);
  };

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
    if (invulnerabilityTimer) clearTimeout(invulnerabilityTimer);

    intervalId = null;
    isDashing = false;
    isInvulnerable = false;

    let durationSeconds = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
    let coinsEarned = Math.floor(score * 10 + (score / durationSeconds) * 20);

    playerData.coins += coinsEarned;
    if (score > playerData.highScore) playerData.highScore = score;

    savePlayerData();

    gameOverScore.innerText = score;
    earnedCoins.innerText = coinsEarned;

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

    if (invulnerabilityTimer) clearTimeout(invulnerabilityTimer);

    gameEnd = false;
    isPaused = false;
    isDashing = false;
    hasShield = false;
    isGiga = false;
    isInvulnerable = false;
    obstacleCollisions = 0;
    obstacleFood.active = false;
    magnetCharges = 0;
    extraGoldFoods = [];

    normalSpeed = initialSpeed;
    score = 0;
    snakeX = 5; snakeY = 10;
    moveX = 1; moveY = 0; lastMoveX = 1; lastMoveY = 0;

    snakeBody = [[snakeX, snakeY]];
    scoreVal.innerText = score;
    changeFoodPosition();

    let countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        countdownText.innerText = count;
      } else {
        clearInterval(countdownTimer);
        modalOverlay.classList.add("hidden");
        countdownBox.classList.add("hidden");

        startTime = Date.now();
        clearInterval(intervalId);
        intervalId = setInterval(createGame, normalSpeed);

        if (currentGameMode === "chrono") startChronoTimer();
      }
    }, 1000);
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

  updateUI();
});