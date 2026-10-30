const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const speedDisplay = document.getElementById("speed");
const scoreDisplay = document.getElementById("score");
const nitroFill = document.getElementById("nitroFill");
const nitroPercent = document.getElementById("nitroPercent");
const nitroMessage = document.getElementById("nitroMessage");
const nitroPanel = document.querySelector(".nitro-panel");

const gameOverScreen = document.getElementById("gameOverScreen");
const finalScoreDisplay = document.getElementById("finalScore");
const bestScoreDisplay = document.getElementById("bestScore");
const restartButton = document.getElementById("restartButton");
const startScreen = document.getElementById("startScreen");
const startButton = document.getElementById("startButton");
const startBestScore = document.getElementById("startBestScore");
const pauseScreen = document.getElementById("pauseScreen");

let paused = false;

let gameStarted = false;

let width = 0;
let height = 0;
let lastTime = 0;

let roadOffset = 0;
let elapsedTime = 0;
let spawnTimer = 0;

let score = 0;
let bestScore = loadBestScore();

let gameOver = false;
let crashFlash = 0;

let nitro = 100;
let boosting = false;
let bikeLean = 0;
let nearMisses = 0;
let nearMissMessages = [];
let bikeLift = 0;

const keys = {
    left: false,
    right: false,
    nitro: false
};

const bike = {
    x: 0,
    y: 0,
    width: 34,
    height: 62,
    moveSpeed: 320
};

const laneCount = 3;

let roadLeft = 0;
let roadRight = 0;
let roadWidth = 0;

const traffic = [];
const crashParticles = [];
const carColors = [
    "#ff595e",
    "#ffca3a",
    "#4cc9f0",
    "#c77dff",
    "#f1f5f2",
    "#ff924c"
];

// ----------------------------------
// SOUND EFFECTS
// ----------------------------------

let audioContext = null;

function initAudio() {
    if (!audioContext) {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (AudioContextClass) {
            audioContext = new AudioContextClass();
        }
    }

    if (audioContext && audioContext.state === "suspended") {
        audioContext.resume();
    }
}

function playTone(startFrequency, endFrequency, duration, type, volume) {
    initAudio();

    if (!audioContext) {
        return;
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = type;

    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, endFrequency),
        now + duration
    );

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(
        0.001,
        now + duration
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start(now);
    oscillator.stop(now + duration);
}

function playNitroSound() {
    playTone(180, 700, 0.25, "sawtooth", 0.045);
}

function playNearMissSound() {
    playTone(650, 1100, 0.16, "sine", 0.06);
}

function playCrashSound() {
    playTone(180, 45, 0.45, "triangle", 0.12);
}

// ----------------------------------
// SAVED BEST SCORE
// ----------------------------------

function loadBestScore() {
    try {
        return Number(localStorage.getItem("highwayMotoBest")) || 0;
    } catch (error) {
        return 0;
    }
}

function saveBestScore(value) {
    try {
        localStorage.setItem("highwayMotoBest", value);
    } catch (error) {
        // The game can still work without local storage.
    }
}

// ----------------------------------
// CANVAS SIZE
// ----------------------------------

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;

    width = rect.width;
    height = rect.height;

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    roadWidth = Math.min(width * 0.65, 300);

    roadLeft = (width - roadWidth) / 2;
    roadRight = roadLeft + roadWidth;

    if (bike.x === 0) {
        bike.x = width / 2;
    }

    bike.y = height * 0.78;

    const margin = bike.width / 2 + 12;

    bike.x = Math.max(
        roadLeft + margin,
        Math.min(roadRight - margin, bike.x)
    );
}

// ----------------------------------
// DRAW BACKGROUND
// ----------------------------------

function drawBackground() {
    ctx.fillStyle = "#25452d";
    ctx.fillRect(0, 0, width, height);

    const grassOffset = (roadOffset * 0.65) % 70;

    ctx.fillStyle = "#315738";

    for (let y = -70 + grassOffset; y < height; y += 70) {
        ctx.fillRect(12, y, 7, 22);
        ctx.fillRect(width - 19, y + 25, 7, 22);
    }

    // Road.
    ctx.fillStyle = "#343a3d";
    ctx.fillRect(roadLeft, 0, roadWidth, height);

    // Dark road edges.
    ctx.fillStyle = "#292f32";
    ctx.fillRect(roadLeft, 0, 9, height);
    ctx.fillRect(roadRight - 9, 0, 9, height);

    // Road boundaries.
    ctx.fillStyle = "#e2e8dc";
    ctx.fillRect(roadLeft + 10, 0, 3, height);
    ctx.fillRect(roadRight - 13, 0, 3, height);
}

// ----------------------------------
// ROAD MARKINGS AND BOOST EFFECT
// ----------------------------------

function drawLaneMarkings() {
    const laneWidth = roadWidth / laneCount;
    const dashHeight = 36;
    const gap = 28;

    ctx.fillStyle = "#d7ddd5";

    for (let lane = 1; lane < laneCount; lane++) {
        const x = roadLeft + lane * laneWidth;

        for (
            let y = -dashHeight + roadOffset % (dashHeight + gap);
            y < height;
            y += dashHeight + gap
        ) {
            ctx.fillRect(x - 2, y, 4, dashHeight);
        }
    }

    // Speed lines appear during nitro.
    if (boosting) {
        ctx.strokeStyle = "rgba(166, 243, 106, 0.45)";
        ctx.lineWidth = 2;

        for (let i = 0; i < 12; i++) {
            const x = roadLeft + Math.random() * roadWidth;
            const y = Math.random() * height;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + 15 + Math.random() * 25);
            ctx.stroke();
        }
    }
}

// ----------------------------------
// DRAW MOTORCYCLE
// ----------------------------------

function drawMotorcycle() {
    ctx.save();
ctx.translate(0, -bikeLift);
    ctx.save();
    ctx.translate(bike.x, bike.y);
    ctx.rotate(bikeLean);
    // Shadow.
    ctx.fillStyle = "#111a";
    ctx.beginPath();
    ctx.ellipse(
        3, 5,
        bike.width * 0.65,
        bike.height * 0.52,
        0, 0, Math.PI * 2
    );
    ctx.fill();

    // Tyres.
    ctx.fillStyle = "#111315";

    ctx.beginPath();
    ctx.roundRect(-7, 9, 14, 22, 5);
    ctx.fill();

    ctx.beginPath();
    ctx.roundRect(-6, -29, 12, 20, 5);
    ctx.fill();

    // Main body.
    ctx.fillStyle = boosting ? "#ffe66d" : "#a6f36a";

    ctx.beginPath();
    ctx.moveTo(0, -29);
    ctx.lineTo(11, -12);
    ctx.lineTo(9, 13);
    ctx.lineTo(0, 24);
    ctx.lineTo(-9, 13);
    ctx.lineTo(-11, -12);
    ctx.closePath();
    ctx.fill();

    // Seat.
    ctx.fillStyle = "#202724";

    ctx.beginPath();
    ctx.roundRect(-6, -7, 12, 20, 4);
    ctx.fill();

    // Headlight.
    ctx.fillStyle = "#fff5b5";

    ctx.beginPath();
    ctx.ellipse(0, -25, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rear light.
    ctx.fillStyle = "#ff5353";
    ctx.fillRect(-4, 22, 8, 3);

    // Handlebar.
    ctx.strokeStyle = "#d4ded6";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(-12, -17);
    ctx.lineTo(12, -17);
    ctx.stroke();

    // Nitro flame behind the bike.
    if (boosting) {
        ctx.fillStyle = "#ff924c";

        ctx.beginPath();
        ctx.moveTo(-5, 27);
        ctx.lineTo(0, 44 + Math.random() * 10);
        ctx.lineTo(5, 27);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#ffe66d";

        ctx.beginPath();
        ctx.moveTo(-2, 27);
        ctx.lineTo(0, 37 + Math.random() * 5);
        ctx.lineTo(2, 27);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
    ctx.restore();
}

// ----------------------------------
// DRAW TRAFFIC CARS
// ----------------------------------

function drawCar(car) {
    const w = car.width;
    const h = car.height;

    ctx.save();
    ctx.translate(car.x, car.y);

    // Shadow.
    ctx.fillStyle = "#1119";

    ctx.beginPath();
    ctx.roundRect(-w / 2 + 3, -h / 2 + 4, w, h, 7);
    ctx.fill();

    // Main body.
    ctx.fillStyle = car.color;

    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 7);
    ctx.fill();

    // Front windscreen.
    ctx.fillStyle = "#b9dce7";

    ctx.beginPath();
    ctx.roundRect(-w * 0.34, -h * 0.28, w * 0.68, h * 0.23, 4);
    ctx.fill();

    // Rear window.
    ctx.fillStyle = "#273a45";

    ctx.beginPath();
    ctx.roundRect(-w * 0.31, h * 0.12, w * 0.62, h * 0.20, 3);
    ctx.fill();

    // Headlights.
    ctx.fillStyle = "#fff4bd";
    ctx.fillRect(-w * 0.36, -h / 2 + 3, w * 0.22, 4);
    ctx.fillRect(w * 0.14, -h / 2 + 3, w * 0.22, 4);

    // Rear lights.
    ctx.fillStyle = "#ff4545";
    ctx.fillRect(-w * 0.36, h / 2 - 6, w * 0.22, 4);
    ctx.fillRect(w * 0.14, h / 2 - 6, w * 0.22, 4);

    // Side mirrors.
    ctx.fillStyle = "#202724";
    ctx.fillRect(-w / 2 - 3, -h * 0.20, 4, 8);
    ctx.fillRect(w / 2 - 1, -h * 0.20, 4, 8);


    // Flashing amber lane-change indicator.
    if (car.indicatorSide !== 0) {
        const isFlashing = Math.floor(performance.now() / 180) % 2 === 0;

        if (isFlashing) {
            ctx.fillStyle = "#ffb000";
            ctx.shadowColor = "#ffb000";
            ctx.shadowBlur = 12;

            if (car.indicatorSide === -1) {
                ctx.fillRect(-w / 2 + 2, -h / 2 + 3, 10, 8);
            } else {
                ctx.fillRect(w / 2 - 12, -h / 2 + 3, 10, 8);
            }

            ctx.shadowBlur = 0;
        }
    }


    ctx.restore();
}

function drawTraffic() {
    for (const car of traffic) {
        drawCar(car);
    }
}


// ----------------------------------
// TRAFFIC GENERATION
// ----------------------------------


function spawnTraffic() {
    const laneWidth = roadWidth / laneCount;
    const lane = Math.floor(Math.random() * laneCount);

    // Avoid spawning too close to another car in the same lane.
    const tooClose = traffic.some(function(car) {
        return (
            (car.lane === lane || car.targetLane === lane) &&
            car.y < 135
        );
    });

    if (tooClose) {
        return;
    }

    const isLarge = Math.random() < 0.2;
    const difficulty = 1 + Math.min(elapsedTime / 30, 1.5);

    traffic.push({
        lane: lane,
        targetLane: lane,

        x: roadLeft + laneWidth * (lane + 0.5),
        y: -60,

        width: isLarge ? 48 : 38,
        height: isLarge ? 78 : 62,

        color: carColors[
            Math.floor(Math.random() * carColors.length)
        ],

        speed: (180 + Math.random() * 100) * difficulty,

        // Decide which cars can change lanes.
        canChangeLane: Math.random() < 0.65,

        // Lane-change system.
        laneChangeTimer: 0.03 + Math.random() * 0.15,
        indicatorTimer: 0,
        indicatorSide: 0,
        changingLane: false,

        nearMissChecked: false
    });
}


// ----------------------------------
// NITRO SYSTEM
// ----------------------------------

function updateNitro(deltaTime) {
    const wasBoosting = boosting;
    const wantsBoost = keys.nitro && nitro > 0 && !gameOver;

    // Different Nitro consumption and recharge rates.
    const nitroDrainRate = 25;
    const nitroRechargeRate = 12;

    if (wantsBoost) {
        nitro -= nitroDrainRate * deltaTime;
    } else {
        nitro += nitroRechargeRate * deltaTime;
    }

    nitro = Math.max(0, Math.min(100, nitro));

    // Stop boosting immediately when Nitro reaches zero.
    boosting = keys.nitro && nitro > 0 && !gameOver;

    nitroFill.style.width = nitro + "%";
    nitroPercent.textContent = Math.round(nitro) + "%";

    if (boosting && !wasBoosting) {
        playNitroSound();
    }

    if (boosting) {
        nitroPanel.classList.add("boosting");
        nitroMessage.textContent = "BOOST ACTIVE!";
    } else {
        nitroPanel.classList.remove("boosting");

        if (nitro <= 0) {
            nitroMessage.textContent = "RECHARGING...";
        } else if (nitro < 30) {
            nitroMessage.textContent = "LOW NITRO";
        } else {
            nitroMessage.textContent = "HOLD SPACE TO BOOST";
        }
    }
}

// ----------------------------------
// UPDATE TRAFFIC
// ----------------------------------





function updateTraffic(deltaTime) {
// Move the bike upward during Nitro and downward when Nitro stops.
// Bike movement during and after Nitro.
if (boosting) {
    bikeLift += 180 * deltaTime;

    const maxLift = bike.y - height * 0.2;
    bikeLift = Math.min(bikeLift, maxLift);
} else {
    bikeLift = Math.max(0, bikeLift - 300 * deltaTime);
}
    spawnTimer += deltaTime;

    const spawnInterval = Math.max(0.55, 1.15 - elapsedTime * 0.008);

    if (spawnTimer >= spawnInterval) {
        spawnTraffic();
        spawnTimer = 0;
    }

    const trafficMultiplier = boosting ? 1.45 : 1;
    const laneWidth = roadWidth / laneCount;

    for (const car of traffic) {
        car.y += car.speed * trafficMultiplier * deltaTime;

        // Count down the indicator before changing lanes.
        // Cars that cannot change lanes will move straight.
if (!car.canChangeLane) {
    continue;
}
        if (car.indicatorTimer > 0) {
            car.indicatorTimer -= deltaTime;

            if (car.indicatorTimer <= 0) {
                car.indicatorTimer = 0;
                car.changingLane = true;
            }
        }

        // Choose an adjacent lane when it is time to move.
        if (!car.changingLane && car.indicatorTimer <= 0) {
            car.laneChangeTimer -= deltaTime;

            if (car.laneChangeTimer <= 0) {
                let possibleLanes = [];

                if (car.lane > 0) {
                    possibleLanes.push(car.lane - 1);
                }

                if (car.lane < laneCount - 1) {
                    possibleLanes.push(car.lane + 1);
                }

                if (possibleLanes.length > 0) {
                    const nextLane = possibleLanes[
                        Math.floor(Math.random() * possibleLanes.length)
                    ];

                    car.targetLane = nextLane;
                    car.indicatorSide = nextLane < car.lane ? -1 : 1;
                    car.indicatorTimer = 0.25;
                } else {
                    car.laneChangeTimer = 1;
                }
            }
        }

        // Move sideways after the indicator period.
        if (car.changingLane) {
            const targetX =
                roadLeft + laneWidth * (car.targetLane + 0.5);

            const difference = targetX - car.x;
            const moveAmount = 180 * deltaTime;

            if (Math.abs(difference) <= moveAmount) {
                car.x = targetX;
                car.lane = car.targetLane;
                car.changingLane = false;
                car.indicatorSide = 0;
                car.laneChangeTimer = 0.5 + Math.random() * 0.5;
            } else {
                car.x += Math.sign(difference) * moveAmount;
            }
        }
    }

    // Remove cars that leave the screen.
    for (let i = traffic.length - 1; i >= 0; i--) {
        if (traffic[i].y - traffic[i].height / 2 > height) {
            traffic.splice(i, 1);
        }
    }
}




// ----------------------------------
// COLLISION DETECTION
// ----------------------------------

function rectanglesOverlap(a, b) {
    return (
        a.x - a.width / 2 < b.x + b.width / 2 &&
        a.x + a.width / 2 > b.x - b.width / 2 &&
        a.y - a.height / 2 < b.y + b.height / 2 &&
        a.y + a.height / 2 > b.y - b.height / 2
    );
}

function checkCollisions() {
    // Use the actual visual position of the motorcycle.
    const bikeBox = {
        x: bike.x,
        y: bike.y - bikeLift,
        width: bike.width * 0.65,
        height: bike.height * 0.65
    };

    for (const car of traffic) {
        const carBox = {
            x: car.x,
            y: car.y,
            width: car.width * 0.85,
            height: car.height * 0.90
        };

        if (rectanglesOverlap(bikeBox, carBox)) {
            endGame();
            return true;
        }
    }

    return false;
}

// ----------------------------------
// NEAR-MISS BONUS
// ----------------------------------

function checkNearMisses() {
    for (const car of traffic) {
        // Only check a car once, when it passes the bike.
        if (car.nearMissChecked) {
            continue;
        }

        if (car.y + car.height / 2 < bike.y) {
            continue;
        }

        car.nearMissChecked = true;

        const horizontalDistance = Math.abs(car.x - bike.x);

        // Avoid rewarding a collision or a distant car.
        if (
            horizontalDistance > 24 &&
            horizontalDistance < 70
        ) {
            const bonus = boosting ? 200 : 100;

            score += bonus;
            nearMisses++;
            playNearMissSound();
            nearMissMessages.push({
                x: bike.x,
                y: bike.y - 55,
                text: "+" + bonus + " NEAR MISS",
                life: 1
            });
        }
    }
}

function updateNearMissMessages(deltaTime) {
    for (const message of nearMissMessages) {
        message.y -= 45 * deltaTime;
        message.life -= deltaTime;
    }

    nearMissMessages = nearMissMessages.filter(function(message) {
        return message.life > 0;
    });
}

function drawNearMissMessages() {
    ctx.save();

    ctx.textAlign = "center";
    ctx.font = "bold 15px Arial";

    for (const message of nearMissMessages) {
        ctx.globalAlpha = Math.min(1, message.life);

        ctx.fillStyle = "#ffe66d";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 5;

        ctx.fillText(
            message.text,
            message.x,
            message.y
        );
    }

    ctx.restore();
}

// ----------------------------------
// SCORE
// ----------------------------------

function updateScore(deltaTime) {
    // Survival points.
    const scoreMultiplier = boosting ? 2 : 1;

    score += 10 * scoreMultiplier * deltaTime;

    score = Math.floor(score);

    scoreDisplay.textContent = score;

    // Display speed.
    const baseSpeed = 80 + Math.min(elapsedTime * 1.5, 40);
    const displayedSpeed = Math.round(
        baseSpeed * (boosting ? 1.5 : 1)
    );

    speedDisplay.textContent = displayedSpeed;
}

// ----------------------------------
// GAME OVER AND RESTART
// ----------------------------------

function endGame() {
    if (gameOver) {
        return;
    }

    gameOver = true;
boosting = false;
crashFlash = 0.35;

createCrashParticles();
playCrashSound();
    if (score > bestScore) {
        bestScore = score;
        saveBestScore(bestScore);
    }

    finalScoreDisplay.textContent = Math.floor(score);
    bestScoreDisplay.textContent = bestScore;
    startBestScore.textContent = bestScore;
    gameOverScreen.classList.remove("hidden");

    nitroPanel.classList.remove("boosting");
}
// ----------------------------------
// CRASH PARTICLES
// ----------------------------------

function createCrashParticles() {
    crashParticles.length = 0;

    for (let i = 0; i < 32; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 80 + Math.random() * 260;

        crashParticles.push({
            x: bike.x,
            y: bike.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.5 + Math.random() * 0.7,
            maxLife: 1.2,
            size: 3 + Math.random() * 5,
            color: ["#ff595e", "#ffca3a", "#ffffff", "#ff924c"][
                Math.floor(Math.random() * 4)
            ]
        });
    }
}

function updateCrashParticles(deltaTime) {
    for (const particle of crashParticles) {
        particle.x += particle.vx * deltaTime;
        particle.y += particle.vy * deltaTime;

        particle.vx *= 0.97;
        particle.vy *= 0.97;

        particle.life -= deltaTime;
    }

    for (let i = crashParticles.length - 1; i >= 0; i--) {
        if (crashParticles[i].life <= 0) {
            crashParticles.splice(i, 1);
        }
    }
}

function drawCrashParticles() {
    ctx.save();

    for (const particle of crashParticles) {
        ctx.globalAlpha = Math.max(
            0,
            particle.life / particle.maxLife
        );

        ctx.fillStyle = particle.color;

        ctx.beginPath();
        ctx.arc(
            particle.x,
            particle.y,
            particle.size,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }

    ctx.restore();
}
function restartGame() {
    paused = false;
pauseScreen.classList.add("hidden");
    gameStarted = true;
startScreen.classList.add("hidden");
    score = 0;
    elapsedTime = 0;
    spawnTimer = 0;
    roadOffset = 0;

    lastTime = 0;
    gameOver = false;
    crashFlash = 0;

    nitro = 100;
boosting = false;
bikeLift = 0;
bikeLean = 0;
nearMisses = 0;
crashParticles.length = 0;

    traffic.length = 0;
    nearMissMessages = [];

    bike.x = width / 2;
    bike.y = height * 0.78;

    keys.left = false;
    keys.right = false;
    keys.nitro = false;

    scoreDisplay.textContent = "0";
    speedDisplay.textContent = "80";

    gameOverScreen.classList.add("hidden");

    updateNitro(0);
}

// ----------------------------------
// MAIN UPDATE
// ----------------------------------

function update(deltaTime) {
    if (gameOver) {
        return;
    }

    elapsedTime += deltaTime;

    updateNitro(deltaTime);

    // Road speed increases as the game progresses.
const normalRoadSpeed = 260 + Math.min(elapsedTime * 8, 400);
const roadSpeed = boosting
    ? normalRoadSpeed * 1.45
    : normalRoadSpeed;

roadOffset += roadSpeed * deltaTime;

    // Steering.
    // Steering.
if (keys.left) {
    bike.x -= bike.moveSpeed * deltaTime;
}

if (keys.right) {
    bike.x += bike.moveSpeed * deltaTime;
}

// Smoothly lean the bike while steering.
let targetLean = 0;

if (keys.left) {
    targetLean = -0.18;
}

if (keys.right) {
    targetLean = 0.18;
}

bikeLean += (targetLean - bikeLean) * Math.min(1, deltaTime * 10);

    // Keep the motorcycle on the road.
    const margin = bike.width / 2 + 12;

    bike.x = Math.max(
        roadLeft + margin,
        Math.min(roadRight - margin, bike.x)
    );

    updateTraffic(deltaTime);

    // Collisions must be checked before near-miss bonuses.
    const crashed = checkCollisions();

    if (crashed) {
        return;
    }

    checkNearMisses();

    updateNearMissMessages(deltaTime);
    updateScore(deltaTime);
}

// ----------------------------------
// DRAW EVERYTHING
// ----------------------------------

function draw() {
    ctx.clearRect(0, 0, width, height);

    drawBackground();
    drawLaneMarkings();
    drawTraffic();
    drawMotorcycle();
    drawCrashParticles();
    drawNearMissMessages();

    // Brief red flash after a crash.
    if (crashFlash > 0) {
        ctx.fillStyle = "rgba(255, 60, 60, " + crashFlash + ")";
        ctx.fillRect(0, 0, width, height);
    }
    
}

// ----------------------------------
// GAME LOOP
// ----------------------------------

function gameLoop(timestamp) {
    if (lastTime === 0) {
        lastTime = timestamp;
    }

    const deltaTime = Math.min(
        (timestamp - lastTime) / 1000,
        0.05
    );

    lastTime = timestamp;

    // Run gameplay only after the player starts.
    if (gameStarted && !paused) {
        update(deltaTime);
        updateCrashParticles(deltaTime);

        if (crashFlash > 0) {
            crashFlash = Math.max(0, crashFlash - deltaTime);
        }
    }

    draw();

    requestAnimationFrame(gameLoop);
}

// ----------------------------------
// KEYBOARD CONTROLS
// ----------------------------------

window.addEventListener("keydown", function(event) {
    initAudio();
    const key = event.key.toLowerCase();
    // Pause and resume using P.
if (key === "p" && !event.repeat && gameStarted && !gameOver) {
    paused = !paused;

    pauseScreen.classList.toggle("hidden", !paused);

    keys.left = false;
    keys.right = false;
    keys.nitro = false;

    return;
}
    
    if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.code === "Space"
    ) {
        event.preventDefault();
    }

    if (event.key === "ArrowLeft" || key === "a") {
        keys.left = true;
    }

    if (event.key === "ArrowRight" || key === "d") {
        keys.right = true;
    }

    if (event.code === "Space") {
        keys.nitro = true;
    }

    if (event.key === "Enter" && gameOver) {
        restartGame();
    }
});

window.addEventListener("keyup", function(event) {
    const key = event.key.toLowerCase();

    if (event.key === "ArrowLeft" || key === "a") {
        keys.left = false;
    }

    if (event.key === "ArrowRight" || key === "d") {
        keys.right = false;
    }

    if (event.code === "Space") {
        keys.nitro = false;
    }
});

window.addEventListener("blur", function() {
    keys.left = false;
    keys.right = false;
    keys.nitro = false;
});

restartButton.addEventListener("click", restartGame);
startButton.addEventListener("click", function() {
    initAudio();
    restartGame();
});

window.addEventListener("resize", resizeCanvas);

// ----------------------------------
// START THE GAME
// ----------------------------------

resizeCanvas();

scoreDisplay.textContent = "0";
bestScoreDisplay.textContent = bestScore;
startBestScore.textContent = bestScore;

updateNitro(0);

requestAnimationFrame(gameLoop);