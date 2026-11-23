const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = Number(process.env.PORT) || 3000;
const dataDirectory = process.env.DATA_DIR || path.join(__dirname, 'data');
const scoresFile = path.join(dataDirectory, 'scores.json');
const maxSavedScores = 5000;
const supportedGames = new Set(['POOL', 'DART']);

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function isValidScore(record) {
  return record
    && Number.isSafeInteger(record.id)
    && typeof record.username === 'string'
    && (record.game_type === 'POOL' || record.game_type === 'DART')
    && Number.isSafeInteger(record.score)
    && record.score >= 0
    && typeof record.created_at === 'string';
}

function readScores() {
  try {
    const data = JSON.parse(fs.readFileSync(scoresFile, 'utf8'));
    if (!Array.isArray(data)) return [];
    return data.filter(isValidScore).slice(-maxSavedScores);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not read score data:', error.message);
    return [];
  }
}

let scores = readScores();
let nextId = scores.reduce((largest, item) => Math.max(largest, item.id), 0) + 1;
let writeQueue = Promise.resolve();

function persistScores() {
  const snapshot = JSON.stringify(scores, null, 2);
  const write = writeQueue.then(async () => {
    await fs.promises.mkdir(dataDirectory, { recursive: true });
    const temporaryFile = scoresFile + '.tmp';
    await fs.promises.writeFile(temporaryFile, snapshot, 'utf8');
    await fs.promises.rename(temporaryFile, scoresFile);
  });
  writeQueue = write.catch(() => {});
  return write;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', storage: 'local-json' });
});

app.get('/api/scores/:game_type', (req, res) => {
  const gameType = String(req.params.game_type || '').toUpperCase();
  if (!supportedGames.has(gameType)) {
    return res.status(400).json({ error: 'game_type은 POOL 또는 DART여야 합니다.' });
  }
  const leaderboard = scores
    .filter((item) => item.game_type === gameType)
    .sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at))
    .slice(0, 5)
    .map(({ id, username, game_type, score, created_at }) => ({ id, username, game_type, score, created_at }));
  return res.json(leaderboard);
});

app.post('/api/scores', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const username = typeof body.username === 'string'
    ? body.username.normalize('NFC').trim().replace(/\s+/g, ' ')
    : '';
  const gameType = typeof body.game_type === 'string' ? body.game_type.toUpperCase() : '';
  const score = Number(body.score);

  if (username.length < 1 || username.length > 16) {
    return res.status(400).json({ error: '닉네임은 1자 이상 16자 이하로 입력해 주세요.' });
  }
  if (!supportedGames.has(gameType)) {
    return res.status(400).json({ error: '게임 모드를 확인해 주세요.' });
  }
  if (!Number.isSafeInteger(score) || score < 1 || score > 100000) {
    return res.status(400).json({ error: '점수는 1점 이상 100,000점 이하의 정수여야 합니다.' });
  }

  const record = {
    id: nextId++,
    username,
    game_type: gameType,
    score,
    created_at: new Date().toISOString()
  };
  scores.push(record);
  if (scores.length > maxSavedScores) scores = scores.slice(-maxSavedScores);

  try {
    await persistScores();
    return res.status(201).json({ success: true, score: record });
  } catch (error) {
    scores = scores.filter((item) => item.id !== record.id);
    nextId = Math.max(1, nextId - 1);
    console.error('Could not save score:', error.message);
    return res.status(500).json({ error: '기록 저장 중 오류가 발생했습니다.' });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: '요청한 API를 찾을 수 없습니다.' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '요청 본문이 올바른 JSON이 아닙니다.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: '요청 본문이 너무 큽니다.' });
  }
  console.error('Request failed:', error.message);
  return res.status(500).json({ error: '요청 처리 중 오류가 발생했습니다.' });
});

app.listen(port, () => {
  console.log('PRO ARENA server listening on port ' + port);
});
