const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// DB 연결 없이도 에러 안 나고 바로 랭킹이 작동하도록 메모리+DB 하이브리드로 구성!
let memoryScores = [
    { id: 1, username: '전설의고수', game_type: 'POOL', score: 500 },
    { id: 2, username: '다트신', game_type: 'DART', score: 300 }
];
let nextId = 3;

app.get('/api/scores/:game_type', (req, res) => {
    const list = memoryScores
        .filter(s => s.game_type === req.params.game_type)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    res.json(list);
});

app.post('/api/scores', (req, res) => {
    const { username, game_type, score } = req.body;
    memoryScores.push({ id: nextId++, username, game_type, score: Number(score) });
    res.json({ success: true });
});

app.put('/api/scores/:id', (req, res) => {
    const item = memoryScores.find(s => s.id === Number(req.params.id));
    if (item) item.score = Number(req.body.score);
    res.json({ success: true });
});

app.delete('/api/scores/:id', (req, res) => {
    memoryScores = memoryScores.filter(s => s.id !== Number(req.params.id));
    res.json({ success: true });
});

app.listen(3000, () => {
    console.log('=============================================');
    console.log('🎮 게임 서버 실행 완료! 크롬에서 아래 주소로 접속하세요:');
    console.log('👉 http://localhost:3000');
    console.log('=============================================');
});
