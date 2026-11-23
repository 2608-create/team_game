(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    modeTag: $('modeTag'),
    title: $('gameTitle'),
    description: $('gameDescription'),
    guide: $('guideText'),
    roundStatus: $('roundStatus'),
    score: $('scoreDisplay'),
    bestPower: $('bestPowerDisplay'),
    attempts: $('attemptDisplay'),
    stageMessage: $('stageMessage'),
    poolControls: $('poolControls'),
    dartControls: $('dartControls'),
    powerRange: $('powerRange'),
    powerValue: $('powerValue'),
    spinPad: $('spinPad'),
    spinPoint: $('spinPoint'),
    dartsLeft: $('dartsLeft'),
    saveScore: $('saveScoreBtn'),
    rankTitle: $('rankTitle'),
    rankStatus: $('rankStatus'),
    rankList: $('rankList'),
    username: $('username'),
    nicknameCount: $('nicknameCount'),
    toast: $('toast'),
    sensorPower: $('sensorPower'),
    sensorAim: $('sensorAim'),
    sensorSpin: $('sensorSpin'),
    powerMeter: $('powerMeter')
  };

  const colors = {
    lime: '#d4f36a',
    orange: '#ff8758',
    text: '#eff1e7',
    muted: '#aeb5a5',
    table: '#1d6945',
    rail: '#573b28',
    wood: '#8f6339'
  };
  const dartNumbers = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const dartCX = 280;
  const dartCY = 280;
  const dartRadius = 238;
  const table = { x: 38, y: 38, w: 784, h: 404, r: 11 };
  const ballRadius = 11;
  const pocketRadius = 19;
  const modeCopy = {
    POOL: {
      tag: '01 / POCKET BALL',
      title: '한 번의 스트로크, 정확하게.',
      description: '각도와 파워를 조절해 공을 포켓에 넣어 보세요.',
      guide: '포인터로 방향을 정한 뒤, 공의 반대 방향으로 드래그하세요.',
      rank: '포켓볼 리더보드'
    },
    DART: {
      tag: '02 / DART',
      title: '작은 조준, 큰 한 점.',
      description: '과녁을 겨냥해 세 번 던지고 점수를 모아 보세요.',
      guide: '과녁을 클릭하거나 터치해 다트를 던지세요.',
      rank: '다트 리더보드'
    }
  };

  let width = 860;
  let height = 480;
  let dpr = 1;
  let lastFrame = 0;
  let toastTimer = 0;
  const state = {
    mode: 'POOL',
    score: 0,
    attempts: 0,
    bestPower: 0,
    power: 55,
    spinX: 0,
    spinY: 0,
    aim: 0,
    pointer: { x: 280, y: 280, inside: false },
    pulling: false,
    pullStart: null,
    pullPower: 0,
    balls: [],
    pockets: [],
    darts: [],
    lastDart: null,
    rankRequest: 0
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function formatAngle(radians) {
    let degrees = Math.round(radians * 180 / Math.PI);
    if (degrees > 180) degrees -= 360;
    if (degrees < -180) degrees += 360;
    return degrees;
  }

  function showToast(message, isError) {
    window.clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.classList.toggle('is-error', Boolean(isError));
    ui.toast.classList.add('is-visible');
    toastTimer = window.setTimeout(() => ui.toast.classList.remove('is-visible'), 2800);
  }

  function updateScore(amount) {
    state.score = Math.max(0, state.score + amount);
    ui.score.textContent = String(state.score);
  }

  function updateStats() {
    ui.bestPower.textContent = state.attempts ? state.bestPower + '%' : '—';
    ui.attempts.textContent = String(state.attempts);
    ui.sensorPower.innerHTML = String(Math.round(state.power)) + '<span>%</span>';
    ui.sensorAim.innerHTML = String(formatAngle(state.aim)) + '<span>°</span>';
    ui.sensorSpin.innerHTML = String(Math.round(state.spinY * 100)) + '<span>%</span>';
    ui.powerMeter.style.width = clamp(state.power, 0, 100) + '%';
    ui.powerValue.textContent = Math.round(state.power) + '%';
    if (document.activeElement !== ui.powerRange) ui.powerRange.value = String(Math.round(state.power));
  }

  function setCanvasSize() {
    const ratio = window.devicePixelRatio || 1;
    dpr = Math.min(2, Math.max(1, ratio));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.aspectRatio = width + ' / ' + height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * width / rect.width,
      y: (event.clientY - rect.top) * height / rect.height
    };
  }

  function resetPool() {
    const x = table.x;
    const y = table.y;
    const w = table.w;
    const h = table.h;
    state.pockets = [
      { x: x, y: y }, { x: x + w / 2, y: y - 2 }, { x: x + w, y: y },
      { x: x, y: y + h }, { x: x + w / 2, y: y + h + 2 }, { x: x + w, y: y + h }
    ];
    state.balls = [{
      id: 0, x: x + 155, y: y + h / 2, vx: 0, vy: 0,
      color: '#f5f2df', active: true, spinX: 0, spinY: 0
    }];
    const ballColors = [
      '#f2d447', '#4d80df', '#df534b', '#8d5fc7', '#ec9149', '#4eae75', '#8c3a3e',
      '#202323', '#f2d447', '#4d80df', '#df534b', '#8d5fc7', '#ec9149', '#4eae75', '#8c3a3e'
    ];
    let id = 1;
    for (let column = 0; column < 5; column += 1) {
      for (let row = 0; row <= column; row += 1) {
        state.balls.push({
          id: id,
          x: x + 550 + column * ballRadius * 1.82,
          y: y + h / 2 - column * ballRadius + row * ballRadius * 2,
          vx: 0, vy: 0, color: ballColors[id - 1], active: true, spinX: 0, spinY: 0
        });
        id += 1;
      }
    }
    state.pulling = false;
    state.pullStart = null;
    state.pullPower = 0;
  }

  function resetDarts() {
    state.darts = [];
    state.lastDart = null;
    state.pointer = { x: dartCX, y: 92, inside: false };
    ui.dartsLeft.textContent = '3';
    ui.roundStatus.textContent = '3회 연습';
    ui.stageMessage.textContent = '과녁을 조준해 첫 다트를 던져 보세요.';
    $('throwDartBtn').disabled = false;
  }

  function resetCurrentGame() {
    state.score = 0;
    state.attempts = 0;
    state.bestPower = 0;
    state.power = 55;
    state.spinX = 0;
    state.spinY = 0;
    ui.score.textContent = '0';
    if (state.mode === 'POOL') {
      resetPool();
      ui.roundStatus.textContent = '연습 모드';
      ui.stageMessage.textContent = '목표를 정하고 첫 샷을 시작하세요.';
    } else {
      resetDarts();
    }
    setSpinPoint(0, 0);
    updateStats();
  }

  function switchGame(mode) {
    if (mode !== 'POOL' && mode !== 'DART') return;
    state.mode = mode;
    const copy = modeCopy[mode];
    ui.modeTag.textContent = copy.tag;
    ui.title.textContent = copy.title;
    ui.description.textContent = copy.description;
    ui.guide.textContent = copy.guide;
    ui.rankTitle.textContent = copy.rank;
    ui.poolControls.classList.toggle('is-hidden', mode !== 'POOL');
    ui.dartControls.classList.toggle('is-hidden', mode !== 'DART');
    document.querySelectorAll('.game-tab').forEach((tab) => {
      const active = tab.dataset.game === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    $('gamePanel').setAttribute('aria-labelledby', mode === 'POOL' ? 'tab-pool' : 'tab-dart');
    width = mode === 'POOL' ? 860 : 560;
    height = mode === 'POOL' ? 480 : 560;
    canvas.setAttribute('aria-label', mode === 'POOL'
      ? '포켓볼 게임 화면. 포인터로 방향을 정하고 반대 방향으로 드래그해 샷을 할 수 있습니다.'
      : '다트 게임 화면. 과녁을 클릭하거나 터치해 다트를 던질 수 있습니다.');
    setCanvasSize();
    resetCurrentGame();
    loadRankings();
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawDartSector(innerRadius, outerRadius, start, end, color) {
    ctx.beginPath();
    ctx.arc(dartCX, dartCY, outerRadius, start, end);
    ctx.arc(dartCX, dartCY, innerRadius, end, start, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#10130f';
    ctx.stroke();
  }

  function drawDartBoard() {
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#171b15');
    bg.addColorStop(1, '#11140f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.arc(dartCX, dartCY, dartRadius + 9, 0, Math.PI * 2);
    ctx.fillStyle = '#33271f';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dartCX, dartCY, dartRadius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#d5d1c2';
    ctx.fill();

    const segment = Math.PI * 2 / 20;
    const startBase = -Math.PI / 2 - segment / 2;
    for (let i = 0; i < 20; i += 1) {
      const start = startBase + i * segment;
      const end = start + segment;
      const light = i % 2 === 0;
      drawDartSector(25, 210, start, end, light ? '#e8e7dd' : '#252a23');
      drawDartSector(194, 210, start, end, light ? '#d34f44' : '#40865d');
      drawDartSector(112, 130, start, end, light ? '#d34f44' : '#40865d');
      const angle = start + segment / 2;
      ctx.fillStyle = '#eff1e7';
      ctx.font = '700 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(dartNumbers[i]), dartCX + Math.cos(angle) * 224, dartCY + Math.sin(angle) * 224);
    }
    ctx.beginPath();
    ctx.arc(dartCX, dartCY, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#40865d';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(dartCX, dartCY, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#d34f44';
    ctx.fill();

    state.darts.forEach((dart) => {
      ctx.save();
      ctx.translate(dart.x, dart.y);
      ctx.rotate(dart.angle);
      ctx.strokeStyle = '#d4f36a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-11, 10);
      ctx.lineTo(10, -11);
      ctx.stroke();
      ctx.fillStyle = '#f1f2e9';
      ctx.beginPath();
      ctx.arc(10, -11, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    const aim = state.pointer;
    if (state.darts.length < 3) {
      ctx.save();
      ctx.strokeStyle = 'rgba(212,243,106,.9)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, 12, 0, Math.PI * 2);
      ctx.moveTo(aim.x - 20, aim.y);
      ctx.lineTo(aim.x + 20, aim.y);
      ctx.moveTo(aim.x, aim.y - 20);
      ctx.lineTo(aim.x, aim.y + 20);
      ctx.stroke();
      ctx.restore();
    }

    if (state.lastDart) {
      ctx.fillStyle = 'rgba(16,19,15,.76)';
      roundRect(16, height - 49, 172, 32, 8);
      ctx.fill();
      ctx.fillStyle = colors.lime;
      ctx.font = '600 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(state.lastDart.label, 28, height - 33);
    }
  }

  function isBallsMoving() {
    return state.balls.some((ball) => ball.active && (Math.abs(ball.vx) > 0.05 || Math.abs(ball.vy) > 0.05));
  }

  function drawPoolTableScene(frameScale) {
    const x = table.x;
    const y = table.y;
    const w = table.w;
    const h = table.h;
    const scale = frameScale || 1;
    ctx.clearRect(0, 0, width, height);
    const backdrop = ctx.createLinearGradient(0, 0, 0, height);
    backdrop.addColorStop(0, '#20241b');
    backdrop.addColorStop(1, '#151810');
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    roundRect(x - 25, y - 24, w + 50, h + 48, 23);
    ctx.fillStyle = colors.rail;
    ctx.fill();
    ctx.restore();
    roundRect(x - 9, y - 8, w + 18, h + 16, 17);
    ctx.fillStyle = '#a47a4b';
    ctx.fill();
    roundRect(x, y, w, h, 14);
    const felt = ctx.createLinearGradient(x, y, x + w, y + h);
    felt.addColorStop(0, '#247a50');
    felt.addColorStop(.55, '#176b43');
    felt.addColorStop(1, '#115638');
    ctx.fillStyle = felt;
    ctx.fill();
    state.pockets.forEach((pocket) => {
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, pocketRadius + 3, 0, Math.PI * 2);
      ctx.fillStyle = '#332317';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, pocketRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#090b08';
      ctx.fill();
    });

    state.balls.forEach((ball) => {
      if (!ball.active) return;
      ball.x += ball.vx * scale;
      ball.y += ball.vy * scale;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (ball.id === 0 && speed > .2) ball.vy += ball.spinX * speed * .0016 * scale;
      const friction = Math.pow(.986, scale);
      ball.vx *= friction;
      ball.vy *= friction;
      ball.spinX *= Math.pow(.994, scale);
      ball.spinY *= Math.pow(.992, scale);
      if (Math.hypot(ball.vx, ball.vy) < .055) { ball.vx = 0; ball.vy = 0; }
      if (ball.x - ballRadius < x) { ball.x = x + ballRadius; ball.vx = Math.abs(ball.vx) * .88; ball.vy += ball.spinX * .2; }
      if (ball.x + ballRadius > x + w) { ball.x = x + w - ballRadius; ball.vx = -Math.abs(ball.vx) * .88; ball.vy -= ball.spinX * .2; }
      if (ball.y - ballRadius < y) { ball.y = y + ballRadius; ball.vy = Math.abs(ball.vy) * .88; ball.vx -= ball.spinX * .2; }
      if (ball.y + ballRadius > y + h) { ball.y = y + h - ballRadius; ball.vy = -Math.abs(ball.vy) * .88; ball.vx += ball.spinX * .2; }
    });

    for (let i = 0; i < state.balls.length; i += 1) {
      const first = state.balls[i];
      if (!first.active) continue;
      for (let j = i + 1; j < state.balls.length; j += 1) {
        const second = state.balls[j];
        if (!second.active) continue;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy);
        const minimum = ballRadius * 2;
        if (distance === 0 || distance >= minimum) continue;
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = (minimum - distance) / 2;
        first.x -= nx * overlap;
        first.y -= ny * overlap;
        second.x += nx * overlap;
        second.y += ny * overlap;
        const relativeVelocity = (first.vx - second.vx) * nx + (first.vy - second.vy) * ny;
        if (relativeVelocity > 0) {
          first.vx -= relativeVelocity * nx;
          first.vy -= relativeVelocity * ny;
          second.vx += relativeVelocity * nx;
          second.vy += relativeVelocity * ny;
          if (first.id === 0 && Math.abs(first.spinY) > .1) {
            second.vx += nx * first.spinY * .65;
            second.vy += ny * first.spinY * .65;
            first.vx -= nx * first.spinY * .2;
            first.vy -= ny * first.spinY * .2;
          }
        }
      }
    }

    state.balls.forEach((ball) => {
      if (!ball.active) return;
      const pocket = state.pockets.find((item) => Math.hypot(ball.x - item.x, ball.y - item.y) < pocketRadius - 1);
      if (!pocket) return;
      if (ball.id === 0) {
        ball.x = x + 155;
        ball.y = y + h / 2;
        ball.vx = 0;
        ball.vy = 0;
        ball.spinX = 0;
        ball.spinY = 0;
        updateScore(-50);
        ui.stageMessage.textContent = '수구가 포켓에 빠졌어요. -50점';
      } else {
        ball.active = false;
        updateScore(ball.id === 8 ? 150 : 100);
        ui.stageMessage.textContent = ball.id === 8 ? '8번 공 성공! +150점' : '공을 넣었어요! +100점';
      }
    });

    const cueBall = state.balls[0];
    if (cueBall && cueBall.active && !isBallsMoving()) {
      const rayLength = 260;
      ctx.save();
      ctx.setLineDash([5, 6]);
      ctx.strokeStyle = 'rgba(244,245,233,.58)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cueBall.x, cueBall.y);
      ctx.lineTo(cueBall.x + Math.cos(state.aim) * rayLength, cueBall.y + Math.sin(state.aim) * rayLength);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(212,243,106,.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cueBall.x + Math.cos(state.aim) * rayLength, cueBall.y + Math.sin(state.aim) * rayLength, ballRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      const cueBackX = cueBall.x - Math.cos(state.aim) * (ballRadius + 12 + state.pullPower * .45);
      const cueBackY = cueBall.y - Math.sin(state.aim) * (ballRadius + 12 + state.pullPower * .45);
      ctx.beginPath();
      ctx.moveTo(cueBackX, cueBackY);
      ctx.lineTo(cueBackX - Math.cos(state.aim) * 170, cueBackY - Math.sin(state.aim) * 170);
      ctx.strokeStyle = '#c89a62';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cueBackX, cueBackY);
      ctx.lineTo(cueBackX - Math.cos(state.aim) * 18, cueBackY - Math.sin(state.aim) * 18);
      ctx.strokeStyle = '#e6d2aa';
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    state.balls.forEach((ball) => {
      if (!ball.active) return;
      const gradient = ctx.createRadialGradient(ball.x - 3.5, ball.y - 4, 1, ball.x, ball.y, ballRadius + 1);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(.22, ball.color);
      gradient.addColorStop(1, ball.id === 0 ? '#b9b9af' : ball.color);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.24)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (ball.id > 0) {
        if (ball.id > 8) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, ballRadius - 1, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = '#f5f2df';
          ctx.fillRect(ball.x - ballRadius, ball.y - 4, ballRadius * 2, 8);
          ctx.restore();
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0,0,0,.25)';
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f5f2df';
        ctx.fill();
        ctx.fillStyle = '#12150f';
        ctx.font = '700 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(ball.id), ball.x, ball.y + .5);
      }
    });
  }

  function dartScoreAt(x, y) {
    const dx = x - dartCX;
    const dy = y - dartCY;
    const distance = Math.hypot(dx, dy);
    if (distance <= 10) return { points: 50, label: '불스아이 +50' };
    if (distance <= 25) return { points: 25, label: '싱글 불 +25' };
    if (distance > 210) return { points: 0, label: 'MISS · 0점' };
    const segment = Math.PI * 2 / 20;
    const startBase = -Math.PI / 2 - segment / 2;
    let angle = Math.atan2(dy, dx) - startBase;
    angle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const number = dartNumbers[Math.floor(angle / segment) % 20];
    if (distance >= 112 && distance <= 130) return { points: number * 3, label: '트리플 ' + number + ' · +' + number * 3 };
    if (distance >= 194 && distance <= 210) return { points: number * 2, label: '더블 ' + number + ' · +' + number * 2 };
    return { points: number, label: '싱글 ' + number + ' · +' + number };
  }

  function throwDart() {
    if (state.mode !== 'DART' || state.darts.length >= 3) return;
    const x = clamp(state.pointer.x, 0, width);
    const y = clamp(state.pointer.y, 0, height);
    const result = dartScoreAt(x, y);
    const angle = Math.atan2(y - dartCY, x - dartCX) + Math.PI / 4;
    state.darts.push({ x: x, y: y, angle: angle });
    state.lastDart = result;
    state.attempts += 1;
    state.power = 65;
    state.bestPower = Math.max(state.bestPower, 65);
    updateScore(result.points);
    ui.dartsLeft.textContent = String(Math.max(0, 3 - state.darts.length));
    ui.stageMessage.textContent = result.label + ' · ' + (3 - state.darts.length) + '개 남음';
    if (state.darts.length >= 3) {
      ui.roundStatus.textContent = '라운드 완료';
      ui.stageMessage.textContent = '3회 플레이 완료 · 새 라운드를 시작해 보세요.';
      $('throwDartBtn').disabled = true;
    }
    updateStats();
  }

  function shootPool(power) {
    if (state.mode !== 'POOL' || isBallsMoving()) return;
    const cueBall = state.balls[0];
    if (!cueBall || !cueBall.active) return;
    const amount = clamp(Number(power), 10, 100);
    const speed = 2.4 + amount * .135;
    cueBall.vx = Math.cos(state.aim) * speed;
    cueBall.vy = Math.sin(state.aim) * speed;
    cueBall.spinX = state.spinX * amount * .03;
    cueBall.spinY = state.spinY * amount * .035;
    state.power = amount;
    state.bestPower = Math.max(state.bestPower, Math.round(amount));
    state.attempts += 1;
    state.pullPower = 0;
    ui.stageMessage.textContent = '스트로크 시작 · 파워 ' + Math.round(amount) + '%';
    updateStats();
  }

  function setSpinPoint(x, y) {
    state.spinX = clamp(x, -1, 1);
    state.spinY = clamp(y, -1, 1);
    ui.spinPoint.style.left = (50 + state.spinX * 36) + '%';
    ui.spinPoint.style.top = (50 - state.spinY * 36) + '%';
    ui.spinPoint.setAttribute('aria-valuenow', String(Math.round(state.spinY * 100)));
    updateStats();
  }

  function updateSpinFromPointer(event) {
    const rect = ui.spinPad.getBoundingClientRect();
    const radius = Math.min(rect.width, rect.height) / 2 - 13;
    let dx = event.clientX - rect.left - rect.width / 2;
    let dy = event.clientY - rect.top - rect.height / 2;
    const distance = Math.hypot(dx, dy);
    if (distance > radius) { dx = dx / distance * radius; dy = dy / distance * radius; }
    setSpinPoint(dx / radius, -dy / radius);
  }

  function canvasPointerDown(event) {
    const point = canvasPoint(event);
    state.pointer = { x: point.x, y: point.y, inside: true };
    if (state.mode === 'DART') {
      state.aim = Math.atan2(point.y - dartCY, point.x - dartCX);
      throwDart();
      return;
    }
    if (isBallsMoving() || !state.balls[0].active) return;
    const cueBall = state.balls[0];
    state.aim = Math.atan2(point.y - cueBall.y, point.x - cueBall.x);
    state.pointer = { x: point.x, y: point.y, inside: true };
    state.pulling = true;
    state.pullStart = point;
    state.pullPower = 0;
    canvas.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    const point = canvasPoint(event);
    state.pointer = { x: point.x, y: point.y, inside: true };
    if (state.mode === 'DART') {
      state.aim = Math.atan2(point.y - dartCY, point.x - dartCX);
      state.power = 0;
      updateStats();
      return;
    }
    if (state.mode !== 'POOL') return;
    const cueBall = state.balls[0];
    if (!state.pulling) {
      state.aim = Math.atan2(point.y - cueBall.y, point.x - cueBall.x);
      updateStats();
      return;
    }
    const dx = state.pullStart.x - point.x;
    const dy = state.pullStart.y - point.y;
    const pull = Math.max(0, dx * Math.cos(state.aim) + dy * Math.sin(state.aim));
    state.pullPower = clamp(pull * .45, 0, 100);
    state.power = state.pullPower || Number(ui.powerRange.value);
    updateStats();
  }

  function pointerUp() {
    if (state.mode !== 'POOL' || !state.pulling) return;
    state.pulling = false;
    if (state.pullPower >= 8) shootPool(state.pullPower);
    else {
      state.pullPower = 0;
      state.power = Number(ui.powerRange.value);
      updateStats();
    }
  }

  async function saveScore() {
    const username = ui.username.value.trim();
    if (!username) { showToast('먼저 닉네임을 입력해 주세요.', true); ui.username.focus(); return; }
    if (state.score <= 0) { showToast('점수를 얻은 뒤 기록을 저장할 수 있어요.', true); return; }
    ui.saveScore.disabled = true;
    try {
      const response = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: username, game_type: state.mode, score: state.score })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '기록을 저장하지 못했습니다.');
      try {
        window.localStorage.setItem('pro-arena-nickname', username);
      } catch (storageError) {
        // Saving a score does not depend on browser storage.
      }
      showToast('플레이 기록을 저장했습니다.');
      loadRankings();
    } catch (error) {
      showToast(error.message || '기록 저장 중 오류가 발생했습니다.', true);
    } finally {
      ui.saveScore.disabled = false;
    }
  }

  function renderFrame(time) {
    const elapsed = lastFrame ? clamp((time - lastFrame) / 16.67, .5, 2) : 1;
    lastFrame = time;
    if (state.mode === 'POOL') drawPoolTableScene(elapsed);
    else drawDartBoard();
    window.requestAnimationFrame(renderFrame);
  }

  async function loadRankings() {
    const requestId = ++state.rankRequest;
    ui.rankStatus.textContent = '기록을 불러오는 중입니다.';
    ui.rankStatus.classList.remove('is-error');
    ui.rankList.replaceChildren();
    try {
      const response = await fetch('/api/scores/' + state.mode, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('리더보드를 불러오지 못했습니다.');
      const rows = await response.json();
      if (requestId !== state.rankRequest) return;
      renderRankings(Array.isArray(rows) ? rows.slice(0, 5) : []);
    } catch (error) {
      if (requestId !== state.rankRequest) return;
      ui.rankStatus.textContent = '기록을 불러오지 못했습니다. 서버 연결을 확인해 주세요.';
      ui.rankStatus.classList.add('is-error');
    }
  }

  function renderRankings(rows) {
    ui.rankList.replaceChildren();
    ui.rankStatus.classList.remove('is-error');
    if (rows.length === 0) {
      ui.rankStatus.textContent = '아직 등록된 기록이 없습니다.';
      const empty = document.createElement('li');
      empty.className = 'empty-rank';
      empty.textContent = '첫 기록의 주인공이 되어 보세요.';
      ui.rankList.append(empty);
      return;
    }
    ui.rankStatus.textContent = '상위 플레이어 ' + rows.length + '명';
    rows.forEach((row, index) => {
      const item = document.createElement('li');
      const number = document.createElement('span');
      const name = document.createElement('span');
      const score = document.createElement('strong');
      number.className = 'rank-number';
      name.className = 'rank-name';
      score.className = 'rank-score';
      number.textContent = String(index + 1).padStart(2, '0');
      name.textContent = String(row.username || '플레이어');
      score.textContent = Number(row.score || 0).toLocaleString('ko-KR');
      item.append(number, name, score);
      ui.rankList.append(item);
    });
  }

  function bindEvents() {
    document.querySelectorAll('.game-tab').forEach((tab) => {
      tab.addEventListener('click', () => switchGame(tab.dataset.game));
    });
    $('resetBtn').addEventListener('click', resetCurrentGame);
    $('resetSpinBtn').addEventListener('click', () => setSpinPoint(0, 0));
    $('shootBtn').addEventListener('click', () => shootPool(Number(ui.powerRange.value)));
    $('throwDartBtn').addEventListener('click', throwDart);
    $('newRoundBtn').addEventListener('click', resetDarts);
    ui.saveScore.addEventListener('click', saveScore);
    ui.powerRange.addEventListener('input', () => {
      state.power = Number(ui.powerRange.value);
      updateStats();
    });
    ui.username.addEventListener('input', () => {
      ui.nicknameCount.textContent = ui.username.value.length + ' / 16';
    });
    canvas.addEventListener('pointerdown', canvasPointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', pointerUp);
    canvas.addEventListener('pointercancel', () => { state.pulling = false; state.pullPower = 0; });
    canvas.addEventListener('pointerleave', () => {
      if (!state.pulling) state.pointer.inside = false;
    });
    canvas.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (state.mode === 'DART') throwDart();
        else shootPool(Number(ui.powerRange.value));
      }
      if (state.mode === 'POOL' && event.key.startsWith('Arrow')) {
        event.preventDefault();
        const adjustment = event.shiftKey ? .25 : .08;
        if (event.key === 'ArrowLeft') state.aim -= adjustment;
        if (event.key === 'ArrowRight') state.aim += adjustment;
        if (event.key === 'ArrowUp') state.aim -= adjustment;
        if (event.key === 'ArrowDown') state.aim += adjustment;
        updateStats();
      }
    });
    ui.spinPad.addEventListener('pointerdown', (event) => {
      updateSpinFromPointer(event);
      ui.spinPad.setPointerCapture(event.pointerId);
    });
    ui.spinPad.addEventListener('pointermove', (event) => {
      if (event.buttons) updateSpinFromPointer(event);
    });
    ui.spinPoint.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? .18 : .07;
      if (event.key === 'ArrowLeft') state.spinX = clamp(state.spinX - step, -1, 1);
      else if (event.key === 'ArrowRight') state.spinX = clamp(state.spinX + step, -1, 1);
      else if (event.key === 'ArrowUp') state.spinY = clamp(state.spinY + step, -1, 1);
      else if (event.key === 'ArrowDown') state.spinY = clamp(state.spinY - step, -1, 1);
      else return;
      event.preventDefault();
      setSpinPoint(state.spinX, state.spinY);
    });
    window.addEventListener('resize', setCanvasSize);
  }

  function init() {
    try {
      const savedName = window.localStorage.getItem('pro-arena-nickname');
      if (savedName) ui.username.value = savedName;
    } catch (error) {
      // The game remains usable when browser storage is unavailable.
    }
    ui.nicknameCount.textContent = ui.username.value.length + ' / 16';
    bindEvents();
    resetPool();
    setCanvasSize();
    updateStats();
    loadRankings();
    window.requestAnimationFrame(renderFrame);
  }

  init();
})();
