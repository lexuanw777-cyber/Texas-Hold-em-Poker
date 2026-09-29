// client.js — 德州扑克客户端
const socket = io();
let myId = null;
let state = null;

// 牌面工具（与服务端 poker.js 保持一致）
const SUIT = ['♠', '♥', '♦', '♣'];
const RANK = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
function cardToShort(c) { return RANK[c.rank] + SUIT[c.suit]; }
function isRed(c) { return c.suit === 1 || c.suit === 2; }

const $ = (id) => document.getElementById(id);

socket.on('connect', () => { myId = socket.id; });

// 大厅
let selectedMult = 5; // 默认倍率
document.querySelectorAll('.mult-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.mult-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMult = parseInt(btn.dataset.m, 10) || 1;
  };
});

$('joinBtn').onclick = () => {
  const name = $('nameInput').value.trim() || '玩家';
  const room = $('roomInput').value.trim() || 'default';
  socket.emit('join', { room, name, multiplier: selectedMult });
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
};

$('copyBtn').onclick = () => {
  if (state) navigator.clipboard.writeText(state.roomId).then(() => toast('房间号已复制: ' + state.roomId));
};
$('leaveBtn').onclick = () => { location.reload(); };

$('startBtn').onclick = () => socket.emit('start');

socket.on('joined', ({ roomId }) => { /* 已加入 */ });

socket.on('toast', (msg) => toast(msg));
socket.on('error', (msg) => toast(msg));

socket.on('state', (s) => { state = s; render(s); });

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add('hidden'), 2200);
}

function cardEl(c, small) {
  const d = document.createElement('div');
  d.className = 'card' + (small ? ' small' : '') + (c && isRed(c) ? ' red' : '');
  if (!c) { d.classList.add('back'); return d; }
  d.textContent = cardToShort(c);
  return d;
}

function render(s) {
  $('roomTag').textContent = '房间: ' + s.roomId;
  const stageMap = { waiting:'等待开始', preflop:'翻牌前', flop:'翻牌', turn:'转牌', river:'河牌', showdown:'摊牌', ended:'已结束' };
  $('stageTag').textContent = stageMap[s.stage] || s.stage + ' · 第' + s.handNumber + '手';
  $('multTag').textContent = `倍率 ×${s.multiplier || 1} · 盲注 ${s.smallBlind}/${s.bigBlind} · 起始 ${s.startChips}`;

  // 公共牌
  const comm = $('community');
  comm.innerHTML = '';
  for (let i = 0; i < 5; i++) comm.appendChild(cardEl(s.community[i]));

  // 底池
  $('pot').textContent = '底池: ' + s.pot;

  // 座位
  const seats = $('seats');
  seats.innerHTML = '';
  const n = s.players.length;
  const cx = 50, cy = 50, rx = 44, ry = 36;
  s.players.forEach((p, i) => {
    const ang = (-90 + i * (360 / Math.max(n, 1))) * Math.PI / 180;
    const x = cx + rx * Math.cos(ang);
    const y = cy + ry * Math.sin(ang);
    const el = document.createElement('div');
    el.className = 'seat';
    if (p.id === myId) el.style.outline = '2px solid #4af';
    if (s.currentSeat === p.seat && ['preflop','flop','turn','river'].includes(s.stage)) el.classList.add('active');
    if (p.folded) el.classList.add('folded');
    if (p.sittingOut) el.classList.add('out');
    el.style.left = x + '%';
    el.style.top = y + '%';
    let blind = '';
    if (p.isButton) blind += '<span class="dealer">D</span> ';
    if (p.isSB) blind += '<span class="blind">小盲</span> ';
    if (p.isBB) blind += '<span class="blind">大盲</span> ';
    let badges = p.folded ? '已弃牌' : (p.allIn ? '全下' : (p.lastAction || ''));
    el.innerHTML = `
      <div class="pname">${escapeHtml(p.name)} ${blind}</div>
      <div class="chips">${p.chips} 筹</div>
      <div class="bet">${p.bet ? '下注 ' + p.bet : ''}</div>
      <div class="badges">${badges}</div>`;
    seats.appendChild(el);
  });

  // 你的底牌
  const me = s.players.find(p => p.id === myId);
  const yc = $('yourCards');
  yc.innerHTML = '';
  if (me) {
    (me.hole.length ? me.hole : [null, null]).forEach(c => yc.appendChild(cardEl(c)));
  }

  // 动作区
  renderActions(s, me);

  // 日志
  $('log').innerHTML = s.log.map(l => `<div>${escapeHtml(l.msg)}</div>`).join('');

  // 记分板
  const sb = $('scoreBody');
  sb.innerHTML = '';
  (s.scoreboard || []).forEach((row, i) => {
    const tr = document.createElement('tr');
    if (row.id === myId) tr.classList.add('me');
    const st = row.stats || { handsPlayed:0, handsWon:0, totalWon:0, biggestPot:0 };
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${escapeHtml(row.name)}</td>
      <td>${row.chips}</td>
      <td>${st.handsPlayed}</td>
      <td>${st.handsWon}</td>
      <td>${st.totalWon}</td>
      <td>${st.biggestPot}</td>`;
    sb.appendChild(tr);
  });

  // 开始遮罩
  const overlay = $('startOverlay');
  if (s.stage === 'waiting' || s.stage === 'ended') {
    overlay.classList.remove('hidden');
    const ready = s.players.filter(p => p.chips > 0 && !p.sittingOut).length;
    $('waitingHint').textContent = s.stage === 'ended'
      ? (s.players.filter(p => p.chips > 0).length < 2 ? '筹码不足，游戏结束。刷新页面重开。' : '点击开始下一局')
      : `已就位 ${ready} 人，至少 2 人即可开始`;
    $('startBtn').textContent = s.stage === 'ended' ? '再来一局' : '开始游戏';
  } else {
    overlay.classList.add('hidden');
  }

  // 摊牌
  const sd = $('showdownOverlay');
  if (s.stage === 'showdown' && s.showdown && s.showdown.length > 1) {
    sd.classList.remove('hidden');
    sd.innerHTML = '<h2 style="color:var(--gold)">摊牌</h2>' + s.showdown.map(p => {
      const handName = p.hand ? handNameFn(p.hand) : '';
      return `<div class="sd-card"><div>${escapeHtml(p.name)}</div><div class="hn">${handName}</div></div>`;
    }).join('');
  } else {
    sd.classList.add('hidden');
  }
}

function renderActions(s, me) {
  const box = $('actions');
  box.innerHTML = '';
  if (!me) return;
  if (!['preflop','flop','turn','river'].includes(s.stage)) return;
  if (s.currentSeat !== me.seat) {
    box.innerHTML = '<span style="color:#9fc">等待其他玩家行动…</span>';
    return;
  }
  const L = s.legal;
  if (!L) return;

  const foldBtn = document.createElement('button');
  foldBtn.className = 'btn-fold';
  foldBtn.textContent = '弃牌';
  foldBtn.onclick = () => socket.emit('action', { type: 'fold' });
  box.appendChild(foldBtn);

  const callBtn = document.createElement('button');
  callBtn.className = 'btn-call';
  if (L.canCheck) callBtn.textContent = '过牌';
  else callBtn.textContent = '跟注 ' + L.callAmount;
  callBtn.onclick = () => socket.emit('action', { type: L.canCheck ? 'check' : 'call' });
  box.appendChild(callBtn);

  // 加注
  const raiseWrap = document.createElement('div');
  raiseWrap.className = 'raise-box';
  const min = L.minRaiseTo;
  const max = L.maxRaiseTo;
  const range = document.createElement('input');
  range.type = 'range'; range.min = min; range.max = max; range.value = min;
  const num = document.createElement('input');
  num.type = 'number'; num.min = min; num.max = max; num.value = min;
  range.oninput = () => num.value = range.value;
  num.oninput = () => range.value = num.value;
  const raiseBtn = document.createElement('button');
  raiseBtn.className = 'btn-raise';
  raiseBtn.textContent = '加注';
  raiseBtn.disabled = max < min;
  raiseBtn.onclick = () => {
    let amt = parseInt(num.value, 10);
    if (isNaN(amt)) amt = min;
    amt = Math.max(min, Math.min(max, amt));
    socket.emit('action', { type: 'raise', amount: amt });
  };
  raiseWrap.appendChild(range);
  raiseWrap.appendChild(num);
  raiseWrap.appendChild(raiseBtn);
  box.appendChild(raiseWrap);
}

function handNameFn(h) {
  const RANK = { 2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'J',12:'Q',13:'K',14:'A' };
  const r = h.tb.map(x => RANK[x]);
  const names = ['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
  let base = names[h.cat] || '';
  if (h.cat === 4) base += (h.tb[0] === 5 ? ' A-5' : ' 到' + RANK[h.tb[0]]);
  if (h.cat === 8 && h.tb[0] === 14) base = '皇家同花顺';
  return base + ' ' + r.join(' ');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
