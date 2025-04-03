// 游戏常量
const CELL_SIZE = 20;
const PLAYER_SIZE = 16;
const DOT_SIZE = 6;
const POWER_PELLET_SIZE = 12;
const FPS = 30;

// 道具类型和图标
const ITEM_TYPES = {
  BOMB: 'bomb',           // 炸弹
  SPEED_UP: 'speedUp',    // 速度提升
  FREEZE: 'freeze',       // 冻结其他玩家
  CONFUSION: 'confusion', // 干扰其他玩家的控制
  SHIELD: 'shield'        // 护盾
};

// 道具图标和颜色
const ITEM_ICONS = {
  [ITEM_TYPES.BOMB]: { emoji: '💣', color: '#ff5555' },
  [ITEM_TYPES.SPEED_UP]: { emoji: '⚡', color: '#ffff00' },
  [ITEM_TYPES.FREEZE]: { emoji: '❄️', color: '#00ffff' },
  [ITEM_TYPES.CONFUSION]: { emoji: '💫', color: '#ff00ff' },
  [ITEM_TYPES.SHIELD]: { emoji: '🛡️', color: '#00ff00' }
};

// 游戏状态
let gameState = {
  players: {},
  dots: {},
  powerPellets: {},
  ghosts: {},
  items: {},
  aiEnemies: {} // 添加AI敌人
};

let playerId = null;
let socket = null;
let canvas = null;
let ctx = null;
let lastUpdate = Date.now();
let keyState = {};
let leaderboardUpdateTimer = 0;
let gameLevel = 1;
let isMobile = false;
let activeItem = null; // 当前选择的道具
let touchPosition = { x: 0, y: 0 }; // 触摸/点击位置
let showTouchControls = false; // 是否显示触摸控制
let effectMessages = []; // 效果信息队列
let collectedItems = {}; // 已拾取道具记录

// DOM元素
const startScreen = document.getElementById('start-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name');
const startButton = document.getElementById('start-button');
const scoreElement = document.getElementById('score');
const playersCountElement = document.getElementById('players-count');
const leaderboardList = document.getElementById('leaderboard-list');
const levelDisplay = document.getElementById('level-display');
const inventoryContainer = document.getElementById('inventory-container');
const effectsContainer = document.getElementById('effects-container');
const touchControlsContainer = document.getElementById('touch-controls');
const collectedItemsContainer = document.getElementById('collected-items');

// 初始化游戏
function initGame() {
  // 检测是否为移动设备
  isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  showTouchControls = isMobile;
  
  // 设置Canvas
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  
  // 设置Canvas大小，确保适应不同设备
  resizeCanvas();
  
  // 连接到服务器
  socket = io();
  
  // 发送屏幕尺寸到服务器，用于地图调整
  socket.emit('client_screen_size', {
    width: canvas.width,
    height: canvas.height
  });
  
  // 监听服务器事件
  socket.on('game_state', handleGameState);
  socket.on('game_update', handleGameUpdate);
  socket.on('player_id', handlePlayerId);
  socket.on('player_joined', handlePlayerJoined);
  socket.on('player_left', handlePlayerLeft);
  socket.on('dot_eaten', handleDotEaten);
  socket.on('power_pellet_eaten', handlePowerPelletEaten);
  socket.on('map_reset', handleMapReset);
  socket.on('server_full', handleServerFull);
  socket.on('item_collected', handleItemCollected);
  socket.on('item_acquired', handleItemAcquired);
  socket.on('new_item', handleNewItem);
  socket.on('level_up', handleLevelUp);
  socket.on('bomb_explosion', handleBombExplosion);
  socket.on('player_frozen', handlePlayerFrozen);
  socket.on('player_confused', handlePlayerConfused);
  socket.on('player_speed_up', handlePlayerSpeedUp);
  socket.on('player_shield', handlePlayerShield);
  socket.on('effect_ended', handleEffectEnded);
  socket.on('game_level', handleGameLevel);
  socket.on('trap_warning', handleTrapWarning);
  socket.on('player_eliminated', handlePlayerEliminated);
  socket.on('player_trap_hit', handlePlayerTrapHit);
  socket.on('player_slowed', handlePlayerSlowed);
  socket.on('player_teleported', handlePlayerTeleported);
  socket.on('player_revived', handlePlayerRevived);
  socket.on('map_size', handleMapSize);
  socket.on('enemy_killed', handleEnemyKilled);
  socket.on('player_enemy_hit', handlePlayerEnemyHit);
  
  // 设置键盘事件和触摸事件
  setupInputHandlers();
  
  // 初始化UI
  updateInventoryUI();
  updateCollectedItemsUI(); // 初始化已拾取道具显示
  
  // 显示教程弹窗
  showTutorial();
  
  // 开始游戏循环
  requestAnimationFrame(gameLoop);
}

// 显示教程弹窗
function showTutorial() {
  const tutorialModal = document.getElementById('tutorial-modal');
  const closeButton = document.getElementById('close-tutorial');
  
  tutorialModal.style.display = 'flex';
  
  closeButton.addEventListener('click', () => {
    tutorialModal.style.display = 'none';
  });
}

// 处理游戏难度
function handleGameLevel(level) {
  gameLevel = level;
  updateLevelDisplay();
}

// 处理游戏状态
function handleGameState(state) {
  gameState = state;
  updatePlayersCount();
  updateLeaderboard();
}

// 处理游戏更新
function handleGameUpdate(update) {
  gameState.players = update.players;
  gameState.items = update.items;
  gameState.aiEnemies = update.aiEnemies || {}; // 添加AI敌人
  updateScore();
  updatePlayersCount();
  
  // 每秒更新一次排行榜
  leaderboardUpdateTimer += 1000 / FPS;
  if (leaderboardUpdateTimer >= 1000) {
    updateLeaderboard();
    leaderboardUpdateTimer = 0;
  }
}

// 处理玩家ID
function handlePlayerId(id) {
  playerId = id;
}

// 处理玩家加入
function handlePlayerJoined(player) {
  gameState.players[player.id] = player;
  updatePlayersCount();
}

// 处理玩家离开
function handlePlayerLeft(id) {
  delete gameState.players[id];
  updatePlayersCount();
}

// 处理豆子被吃
function handleDotEaten(dotId) {
  delete gameState.dots[dotId];
}

// 处理能量豆被吃
function handlePowerPelletEaten(pelletId) {
  delete gameState.powerPellets[pelletId];
}

// 处理地图重置
function handleMapReset(newMap) {
  gameState.dots = newMap.dots;
  gameState.powerPellets = newMap.powerPellets;
  gameState.items = newMap.items;
  gameLevel = newMap.level;
  updateLevelDisplay();
  addEffectMessage(`回合结束！难度：${gameLevel}，陷阱数量：${newMap.traps}`);
}

// 处理难度增加
function handleLevelUp(level) {
  gameLevel = level;
  updateLevelDisplay();
  addEffectMessage(`难度增加！当前难度：${level}`);
}

// 处理服务器已满
function handleServerFull() {
  alert('服务器已满，请稍后再试！');
}

// 处理道具被收集
function handleItemCollected(data) {
  delete gameState.items[data.itemId];
  
  if (data.playerId === playerId) {
    // 记录已收集的道具
    const itemType = data.itemType;
    if (!collectedItems[itemType]) {
      collectedItems[itemType] = 0;
    }
    collectedItems[itemType]++;
    
    updateInventoryUI();
    updateCollectedItemsUI(); // 更新已拾取道具显示
  }
}

// 处理获得道具
function handleItemAcquired(itemType) {
  addEffectMessage(`获得道具: ${ITEM_ICONS[itemType].emoji}`);
  updateInventoryUI();
  
  // 振动反馈（移动设备）
  if (isMobile && navigator.vibrate) {
    navigator.vibrate(100);
  }
}

// 处理新道具出现
function handleNewItem(item) {
  gameState.items[item.id] = item;
}

// 处理炸弹爆炸
function handleBombExplosion(data) {
  // 创建爆炸动画效果
  createExplosionEffect(data.x, data.y, data.radius);
  addEffectMessage('💥 爆炸！');
}

// 创建爆炸效果
function createExplosionEffect(x, y, radius) {
  const explosionElement = document.createElement('div');
  explosionElement.className = 'explosion';
  explosionElement.style.left = `${x}px`;
  explosionElement.style.top = `${y}px`;
  explosionElement.style.width = `${radius * 2}px`;
  explosionElement.style.height = `${radius * 2}px`;
  
  gameScreen.appendChild(explosionElement);
  
  // 2秒后移除爆炸效果
  setTimeout(() => {
    gameScreen.removeChild(explosionElement);
  }, 2000);
}

// 处理玩家被冻结
function handlePlayerFrozen(duration) {
  addEffectMessage('❄️ 你被冻结了！');
}

// 处理玩家被干扰
function handlePlayerConfused(duration) {
  addEffectMessage('💫 你的控制被颠倒了！');
}

// 处理速度提升
function handlePlayerSpeedUp(duration) {
  addEffectMessage('⚡ 速度提升！');
}

// 处理护盾激活
function handlePlayerShield(duration) {
  addEffectMessage('🛡️ 护盾已激活！');
}

// 处理效果结束
function handleEffectEnded(effectType) {
  switch (effectType) {
    case 'frozen':
      addEffectMessage('你解冻了！');
      break;
    case 'confused':
      addEffectMessage('控制恢复正常！');
      break;
    case 'speedUp':
      addEffectMessage('速度恢复正常');
      break;
    case 'shield':
      addEffectMessage('护盾消失了');
      break;
  }
}

// 添加效果信息
function addEffectMessage(message) {
  const effectMsg = {
    text: message,
    createdAt: Date.now(),
    duration: 2000 // 显示2秒
  };
  
  effectMessages.push(effectMsg);
  
  // 更新效果显示
  updateEffectsDisplay();
}

// 更新效果显示
function updateEffectsDisplay() {
  effectsContainer.innerHTML = '';
  
  // 过滤掉过期的效果信息
  const now = Date.now();
  effectMessages = effectMessages.filter(msg => now - msg.createdAt < msg.duration);
  
  // 显示效果信息
  effectMessages.forEach(msg => {
    const effectElement = document.createElement('div');
    effectElement.className = 'effect-message';
    effectElement.textContent = msg.text;
    
    // 根据时间设置透明度
    const elapsed = now - msg.createdAt;
    const opacity = 1 - (elapsed / msg.duration);
    effectElement.style.opacity = opacity;
    
    effectsContainer.appendChild(effectElement);
  });
}

// 设置用户输入处理
function setupInputHandlers() {
  // 键盘事件
  document.addEventListener('keydown', (e) => {
    keyState[e.code] = true;
    
    // 选择道具
    if (e.code >= 'Digit1' && e.code <= 'Digit5') {
      const index = parseInt(e.code.slice(-1)) - 1;
      selectItemByIndex(index);
    }
    
    // 使用道具
    if (e.code === 'Space') {
      useActiveItem();
    }
  });
  
  document.addEventListener('keyup', (e) => {
    keyState[e.code] = false;
  });
  
  // 鼠标事件
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    touchPosition.x = e.clientX - rect.left;
    touchPosition.y = e.clientY - rect.top;
  });
  
  // 设置触摸控制
  if (isMobile) {
    setupTouchControls();
  }
  
  // 窗口大小调整
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (isMobile) {
      setupTouchControls(); // 重新调整触摸控制
    }
  });
  
  // 设置道具提示关闭按钮
  const closeInstructionBtn = document.querySelector('.close-instruction');
  if (closeInstructionBtn) {
    closeInstructionBtn.addEventListener('click', () => {
      document.getElementById('item-instruction').style.display = 'none';
    });
  }
  
  // 开始按钮点击
  startButton.addEventListener('click', () => {
    const playerName = playerNameInput.value.trim();
    socket.emit('join_game', playerName);
    startScreen.classList.remove('active');
    gameScreen.classList.add('active');
    
    // 如果是移动设备，显示触摸控件
    if (showTouchControls) {
      touchControlsContainer.style.display = 'flex';
    }
    
    // 显示道具使用说明
    const itemInstruction = document.getElementById('item-instruction');
    itemInstruction.style.display = 'flex';
    
    // 5秒后自动隐藏
    setTimeout(() => {
      itemInstruction.style.display = 'none';
    }, 5000);
  });
  
  // 回车键提交
  playerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      startButton.click();
    }
  });
}

// 设置触摸控制
function setupTouchControls() {
  // 清空现有控制
  touchControlsContainer.innerHTML = '';
  
  // 显示触摸控制
  touchControlsContainer.style.display = 'flex';
  
  // 创建方向键容器
  const dpadContainer = document.createElement('div');
  dpadContainer.className = 'dpad-container';
  
  // 创建方向按钮
  const directions = [
    { key: 'ArrowUp', text: '↑', class: 'dir-up', gridArea: '1 / 2 / 2 / 3' },
    { key: 'ArrowRight', text: '→', class: 'dir-right', gridArea: '2 / 3 / 3 / 4' },
    { key: 'ArrowDown', text: '↓', class: 'dir-down', gridArea: '3 / 2 / 4 / 3' },
    { key: 'ArrowLeft', text: '←', class: 'dir-left', gridArea: '2 / 1 / 3 / 2' }
  ];
  
  directions.forEach(dir => {
    const button = document.createElement('div');
    button.className = `touch-btn ${dir.class}`;
    button.innerHTML = dir.text;
    
    // 触摸事件
    button.addEventListener('touchstart', (e) => {
      e.preventDefault();
      keyState[dir.key] = true;
      
      // 添加按下效果
      button.style.transform = 'scale(0.95)';
      button.style.opacity = '0.9';
      
      // 振动反馈
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    });
    
    button.addEventListener('touchend', (e) => {
      e.preventDefault();
      keyState[dir.key] = false;
      
      // 移除按下效果
      button.style.transform = 'none';
      button.style.opacity = '1';
    });
    
    dpadContainer.appendChild(button);
  });
  
  // 创建使用道具按钮
  const useButton = document.createElement('div');
  useButton.className = 'touch-btn item-use';
  useButton.innerHTML = '使用道具';
  
  useButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    useActiveItem();
    
    // 添加按下效果
    useButton.style.transform = 'scale(0.95)';
    useButton.style.opacity = '0.9';
    
    // 振动反馈
    if (navigator.vibrate) {
      navigator.vibrate(70);
    }
  });
  
  useButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    // 移除按下效果
    useButton.style.transform = 'none';
    useButton.style.opacity = '1';
  });
  
  dpadContainer.appendChild(useButton);
  touchControlsContainer.appendChild(dpadContainer);
}

// 选择道具
function selectItemByIndex(index) {
  if (!playerId || !gameState.players[playerId]) return;
  
  const player = gameState.players[playerId];
  const items = Object.keys(player.inventory || {});
  
  if (items.length > index) {
    activeItem = items[index];
    updateInventoryUI();
  }
}

// 使用当前道具
function useActiveItem() {
  if (!activeItem || !playerId || !gameState.players[playerId]) return;
  
  const player = gameState.players[playerId];
  
  // 默认在玩家位置使用道具
  useItem(activeItem, { x: player.x, y: player.y });
}

// 使用指定道具
function useItem(itemType, position) {
  if (!playerId || !gameState.players[playerId]) return;
  
  socket.emit('use_item', itemType, position);
  
  // 更新UI
  activeItem = null;
  updateInventoryUI();
}

// 更新库存UI
function updateInventoryUI() {
  inventoryContainer.innerHTML = '';
  
  // 检查玩家是否存在
  if (!playerId || !gameState.players[playerId]) return;
  
  const player = gameState.players[playerId];
  
  if (!player.inventory) return;
  
  // 为每个道具创建一个库存项
  Object.entries(player.inventory).forEach(([itemType, count], index) => {
    if (count > 0) {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'inventory-item';
      itemDiv.dataset.type = itemType;
      
      // 如果是激活的道具，添加激活样式
      if (activeItem === itemType) {
        itemDiv.classList.add('active');
      }
      
      const icon = document.createElement('span');
      icon.className = 'item-icon';
      icon.style.color = ITEM_ICONS[itemType].color;
      icon.textContent = ITEM_ICONS[itemType].emoji;
      
      const countSpan = document.createElement('span');
      countSpan.className = 'item-count';
      countSpan.textContent = count;
      
      const keySpan = document.createElement('span');
      keySpan.className = 'item-key';
      keySpan.textContent = isMobile ? '' : `${index + 1}`;
      
      itemDiv.appendChild(icon);
      itemDiv.appendChild(countSpan);
      itemDiv.appendChild(keySpan);
      
      // 添加点击事件
      itemDiv.addEventListener('click', () => {
        selectItemByIndex(index);
      });
      
      inventoryContainer.appendChild(itemDiv);
    }
  });
}

// 更新难度显示
function updateLevelDisplay() {
  levelDisplay.textContent = `难度: ${gameLevel}`;
}

// 游戏循环
function gameLoop() {
  const now = Date.now();
  const deltaTime = now - lastUpdate;
  
  // 控制帧率
  if (deltaTime > 1000 / FPS) {
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 处理玩家方向键操作
    handleDirectionKeys();
    
    // 渲染游戏元素
    renderGame();
    
    // 更新效果显示
    updateEffectsDisplay();
    
    lastUpdate = now;
  }
  
  // 继续循环
  requestAnimationFrame(gameLoop);
}

// 添加地图边界逻辑
function isWithinBoundary(x, y) {
  return (
    x >= CELL_SIZE / 2 && 
    x <= canvas.width - CELL_SIZE / 2 && 
    y >= CELL_SIZE / 2 && 
    y <= canvas.height - CELL_SIZE / 2
  );
}

// 处理方向键
function handleDirectionKeys() {
  if (!playerId || !gameState.players[playerId]) return;
  
  let direction = null;
  
  // WASD或方向键控制
  if (keyState['KeyW'] || keyState['ArrowUp']) {
    direction = 'up';
  } else if (keyState['KeyS'] || keyState['ArrowDown']) {
    direction = 'down';
  } else if (keyState['KeyA'] || keyState['ArrowLeft']) {
    direction = 'left';
  } else if (keyState['KeyD'] || keyState['ArrowRight']) {
    direction = 'right';
  }
  
  if (direction && gameState.players[playerId].direction !== direction) {
    // 边界检查将在服务器端实现
    socket.emit('player_move', direction);
    gameState.players[playerId].direction = direction;
  }
}

// 渲染游戏
function renderGame() {
  // 绘制地图边界
  drawMapBorder();
  
  // 绘制网格
  drawGrid();
  
  // 绘制豆子
  drawDots();
  
  // 绘制能量豆
  drawPowerPellets();
  
  // 绘制道具
  drawItems();
  
  // 绘制AI敌人
  drawAIEnemies();
  
  // 绘制玩家
  drawPlayers();
}

// 绘制地图边界
function drawMapBorder() {
  ctx.strokeStyle = 'rgba(255, 0, 255, 0.8)';
  ctx.lineWidth = 3;
  
  // 绘制矩形边框
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.stroke();
  
  // 添加霓虹效果
  ctx.shadowColor = '#ff00ff';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// 绘制网格
function drawGrid() {
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  
  // 绘制垂直线
  for (let x = 0; x < canvas.width; x += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  
  // 绘制水平线
  for (let y = 0; y < canvas.height; y += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

// 绘制豆子
function drawDots() {
  ctx.fillStyle = '#FFFF00';
  
  Object.values(gameState.dots).forEach(dot => {
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, DOT_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    
    // 添加辉光效果
    ctx.shadowColor = '#FFFF00';
    ctx.shadowBlur = 5;
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

// 绘制能量豆
function drawPowerPellets() {
  Object.values(gameState.powerPellets).forEach(pellet => {
    // 外圈辉光
    ctx.beginPath();
    ctx.arc(pellet.x, pellet.y, POWER_PELLET_SIZE, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
    ctx.fill();
    
    // 内圈
    ctx.beginPath();
    ctx.arc(pellet.x, pellet.y, POWER_PELLET_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#FF00FF';
    ctx.fill();
    
    // 添加辉光效果
    ctx.shadowColor = '#FF00FF';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

// 绘制道具
function drawItems() {
  Object.values(gameState.items).forEach(item => {
    const icon = ITEM_ICONS[item.type];
    
    // 绘制道具背景
    ctx.beginPath();
    ctx.arc(item.x, item.y, CELL_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${hexToRgb(icon.color)}, 0.3)`;
    ctx.fill();
    
    // 添加辉光效果
    ctx.shadowColor = icon.color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
    
    // 绘制道具图标
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon.emoji, item.x, item.y);
  });
}

// 绘制AI敌人
function drawAIEnemies() {
  Object.values(gameState.aiEnemies || {}).forEach(enemy => {
    // 保存上下文
    ctx.save();
    
    // 绘制敌人
    ctx.translate(enemy.x, enemy.y);
    
    // 确定敌人颜色
    ctx.fillStyle = enemy.color || '#ff3333';
    
    // 根据敌人类型绘制不同形状
    switch (enemy.type) {
      case 'chaser':
        // 绘制红色追踪者（三角形）
        ctx.beginPath();
        ctx.moveTo(0, -CELL_SIZE / 2);
        ctx.lineTo(CELL_SIZE / 2, CELL_SIZE / 2);
        ctx.lineTo(-CELL_SIZE / 2, CELL_SIZE / 2);
        ctx.closePath();
        ctx.fill();
        break;
        
      case 'wanderer':
        // 绘制黄色徘徊者（正方形）
        ctx.fillRect(-CELL_SIZE / 2, -CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
        break;
        
      case 'guardian':
        // 绘制蓝色守卫者（圆形）
        ctx.beginPath();
        ctx.arc(0, 0, CELL_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      default:
        // 默认形状
        ctx.beginPath();
        ctx.arc(0, 0, CELL_SIZE / 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // 添加敌人特效
    ctx.shadowColor = enemy.color || '#ff3333';
    ctx.shadowBlur = 10;
    ctx.fill();
    
    // 绘制敌人眼睛
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(-CELL_SIZE / 4, -CELL_SIZE / 8, CELL_SIZE / 8, 0, Math.PI * 2);
    ctx.arc(CELL_SIZE / 4, -CELL_SIZE / 8, CELL_SIZE / 8, 0, Math.PI * 2);
    ctx.fill();
    
    // 绘制敌人瞳孔
    ctx.fillStyle = 'black';
    
    // 根据敌人方向调整瞳孔位置
    let pupilOffsetX = 0;
    let pupilOffsetY = 0;
    
    switch (enemy.direction) {
      case 'up': pupilOffsetY = -2; break;
      case 'down': pupilOffsetY = 2; break;
      case 'left': pupilOffsetX = -2; break;
      case 'right': pupilOffsetX = 2; break;
    }
    
    ctx.beginPath();
    ctx.arc(-CELL_SIZE / 4 + pupilOffsetX, -CELL_SIZE / 8 + pupilOffsetY, CELL_SIZE / 16, 0, Math.PI * 2);
    ctx.arc(CELL_SIZE / 4 + pupilOffsetX, -CELL_SIZE / 8 + pupilOffsetY, CELL_SIZE / 16, 0, Math.PI * 2);
    ctx.fill();
    
    // 恢复上下文
    ctx.restore();
  });
}

// 绘制玩家
function drawPlayers() {
  Object.values(gameState.players).forEach(player => {
    const isCurrentPlayer = player.id === playerId;
    
    // 跳过被淘汰的玩家
    if (!player.isAlive) return;
    
    // 保存上下文
    ctx.save();
    
    // 绘制玩家形状
    ctx.translate(player.x, player.y);
    
    // 计算方向角度
    let angle = 0;
    switch (player.direction) {
      case 'right': angle = 0; break;
      case 'down': angle = Math.PI / 2; break;
      case 'left': angle = Math.PI; break;
      case 'up': angle = Math.PI * 3 / 2; break;
    }
    
    // 旋转至正确方向
    ctx.rotate(angle);
    
    // 绘制吃豆人基本形状
    ctx.beginPath();
    
    // 嘴巴张合动画
    const mouthOpen = (Date.now() % 400) < 200;
    const startAngle = mouthOpen ? Math.PI / 6 : 0;
    const endAngle = mouthOpen ? Math.PI * 11 / 6 : Math.PI * 2;
    
    ctx.arc(0, 0, PLAYER_SIZE / 2, startAngle, endAngle);
    ctx.lineTo(0, 0);
    ctx.closePath();
    
    // 填充主体颜色
    ctx.fillStyle = player.color;
    
    // 玩家状态效果
    if (player.isPowered) {
      ctx.shadowColor = player.color;
      ctx.shadowBlur = 15;
    }
    
    // 绘制其他效果
    if (player.effects) {
      if (player.effects.frozen && player.effects.frozen.active) {
        ctx.shadowColor = '#00ffff'; // 蓝色
        ctx.shadowBlur = 15;
      }
      
      if (player.effects.confused && player.effects.confused.active) {
        // 绘制混乱符号
        ctx.strokeStyle = '#ff00ff';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, PLAYER_SIZE * 0.7 + i * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      
      if (player.effects.speedUp && player.effects.speedUp.active) {
        // 绘制速度线
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 1;
        
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(-PLAYER_SIZE / 2 - i * 3, 0);
          ctx.lineTo(-PLAYER_SIZE / 2 - i * 5, 0);
          ctx.stroke();
        }
      }
      
      if (player.effects.shield && player.effects.shield.active) {
        // 绘制护盾
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, PLAYER_SIZE * 0.8, 0, Math.PI * 2);
        ctx.stroke();
      }
      
      if (player.effects.slow && player.effects.slow.active) {
        // 绘制减速效果
        ctx.strokeStyle = '#ff8800';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(0, 0, PLAYER_SIZE * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    
    // 当前玩家增加亮度
    if (isCurrentPlayer) {
      ctx.globalAlpha = 1.0;
      
      // 添加描边
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.globalAlpha = 0.9;
    }
    
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
    
    // 恢复上下文
    ctx.restore();
    
    // 绘制玩家名字
    ctx.font = '10px "Press Start 2P"';
    ctx.fillStyle = player.color;
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x, player.y - PLAYER_SIZE - 5);
    
    // 绘制玩家分数
    ctx.font = '8px "Press Start 2P"';
    ctx.fillStyle = 'white';
    ctx.fillText(player.score, player.x, player.y - PLAYER_SIZE - 15);
  });
}

// 更新分数显示
function updateScore() {
  if (playerId && gameState.players[playerId]) {
    scoreElement.textContent = gameState.players[playerId].score;
  }
}

// 更新在线玩家数量
function updatePlayersCount() {
  const count = Object.keys(gameState.players).length;
  playersCountElement.textContent = count;
}

// 更新排行榜
function updateLeaderboard() {
  // 清空排行榜
  leaderboardList.innerHTML = '';
  
  // 按分数排序玩家
  const sortedPlayers = Object.values(gameState.players).sort((a, b) => b.score - a.score);
  
  // 添加前10名到排行榜
  sortedPlayers.slice(0, 10).forEach((player, index) => {
    const playerItem = document.createElement('div');
    playerItem.className = 'player-item';
    
    const rankSpan = document.createElement('span');
    rankSpan.className = 'player-rank';
    rankSpan.textContent = `#${index + 1}`;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'player-name';
    nameSpan.textContent = player.name;
    
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'player-score';
    scoreSpan.textContent = player.score;
    
    // 如果是当前玩家，高亮显示
    if (player.id === playerId) {
      playerItem.style.color = player.color;
      rankSpan.style.textShadow = `0 0 5px ${player.color}`;
      scoreSpan.style.textShadow = `0 0 5px ${player.color}`;
    }
    
    playerItem.appendChild(rankSpan);
    playerItem.appendChild(nameSpan);
    playerItem.appendChild(scoreSpan);
    
    leaderboardList.appendChild(playerItem);
  });
}

// 调整窗口大小时重设Canvas
window.addEventListener('resize', resizeCanvas);

// 重设Canvas大小
function resizeCanvas() {
  const gameContainer = document.querySelector('.game-container');
  const containerWidth = gameContainer.clientWidth;
  const containerHeight = gameContainer.clientHeight;
  
  // 计算合适的Canvas大小，保留足够空间给控制按钮
  let canvasWidth, canvasHeight;
  
  if (isMobile) {
    // 在移动设备上，给控制按钮和其他UI元素预留空间
    canvasWidth = Math.min(containerWidth - 20, containerHeight * 0.7);
    canvasHeight = Math.min(containerHeight - 180, containerWidth * 0.9);
  } else {
    // 在桌面设备上，最大化Canvas大小
    canvasWidth = Math.min(containerWidth - 40, containerHeight * 0.9);
    canvasHeight = Math.min(containerHeight - 60, containerWidth * 0.7);
  }
  
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  
  // 确保Canvas的CSS尺寸与实际尺寸匹配
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;
  
  // 如果已连接到服务器，发送新的屏幕尺寸
  if (socket && socket.connected) {
    socket.emit('client_screen_size', {
      width: canvasWidth,
      height: canvasHeight
    });
  }
}

// 将十六进制颜色转换为RGB格式
function hexToRgb(hex) {
  // 移除#号
  hex = hex.replace('#', '');
  
  // 解析RGB值
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return `${r}, ${g}, ${b}`;
}

// 处理陷阱警告
function handleTrapWarning(data) {
  // 在玩家靠近陷阱时显示警告
  createTrapWarning(data.x, data.y);
}

// 创建陷阱警告
function createTrapWarning(x, y) {
  // 检查是否已存在该位置的警告
  const existingWarning = document.querySelector(`.trap-warning[data-x="${x}"][data-y="${y}"]`);
  if (existingWarning) return;
  
  const warningElement = document.createElement('div');
  warningElement.className = 'trap-warning';
  warningElement.textContent = '⚠️';
  warningElement.style.left = `${x}px`;
  warningElement.style.top = `${y}px`;
  warningElement.setAttribute('data-x', x);
  warningElement.setAttribute('data-y', y);
  
  gameScreen.appendChild(warningElement);
  
  // 1秒后移除警告
  setTimeout(() => {
    if (warningElement.parentNode) {
      gameScreen.removeChild(warningElement);
    }
  }, 1000);
}

// 处理玩家被淘汰
function handlePlayerEliminated(data) {
  if (data.reason === 'trap') {
    addEffectMessage('❌ 你触发了陷阱！已淘汰');
    
    // 播放淘汰动画
    createEliminationEffect();
  }
}

// 创建淘汰效果
function createEliminationEffect() {
  // 添加整屏红色闪烁效果
  const eliminationElement = document.createElement('div');
  eliminationElement.className = 'elimination-effect';
  
  gameScreen.appendChild(eliminationElement);
  
  // 2秒后移除效果
  setTimeout(() => {
    gameScreen.removeChild(eliminationElement);
  }, 2000);
}

// 处理陷阱触发
function handlePlayerTrapHit(data) {
  const player = gameState.players[data.playerId];
  if (!player) return;
  
  // 添加陷阱触发特效
  if (data.trapType === 'spike') {
    createDeathEffect(player.x, player.y);
  } else if (data.trapType === 'slow') {
    createSlowEffect(player.x, player.y);
  } else if (data.trapType === 'teleport') {
    createTeleportEffect(player.x, player.y);
  }
}

// 创建死亡效果
function createDeathEffect(x, y) {
  const deathElement = document.createElement('div');
  deathElement.className = 'death-effect';
  deathElement.style.left = `${x}px`;
  deathElement.style.top = `${y}px`;
  
  gameScreen.appendChild(deathElement);
  
  // 2秒后移除效果
  setTimeout(() => {
    gameScreen.removeChild(deathElement);
  }, 2000);
}

// 创建减速效果
function createSlowEffect(x, y) {
  const slowElement = document.createElement('div');
  slowElement.className = 'slow-effect';
  slowElement.style.left = `${x}px`;
  slowElement.style.top = `${y}px`;
  slowElement.textContent = '🐌';
  
  gameScreen.appendChild(slowElement);
  
  // 2秒后移除效果
  setTimeout(() => {
    gameScreen.removeChild(slowElement);
  }, 2000);
}

// 创建传送效果
function createTeleportEffect(x, y) {
  const teleportElement = document.createElement('div');
  teleportElement.className = 'teleport-effect';
  teleportElement.style.left = `${x}px`;
  teleportElement.style.top = `${y}px`;
  
  gameScreen.appendChild(teleportElement);
  
  // 1秒后移除效果
  setTimeout(() => {
    gameScreen.removeChild(teleportElement);
  }, 1000);
}

// 处理玩家被减速
function handlePlayerSlowed(duration) {
  addEffectMessage('🐌 你被减速了！');
}

// 处理玩家被传送
function handlePlayerTeleported(data) {
  addEffectMessage('✨ 你被传送了！');
  createTeleportEffect(data.from.x, data.from.y);
}

// 处理玩家复活
function handlePlayerRevived() {
  addEffectMessage('🔄 你已复活！');
}

// 更新已拾取道具显示
function updateCollectedItemsUI() {
  collectedItemsContainer.innerHTML = '<h3>已拾取道具</h3>';
  
  // 统计道具数量
  let hasItems = false;
  
  for (const [itemType, count] of Object.entries(collectedItems)) {
    if (count > 0) {
      hasItems = true;
      const itemDiv = document.createElement('div');
      itemDiv.className = 'collected-item';
      
      const icon = document.createElement('span');
      icon.className = 'collected-item-icon';
      icon.style.color = ITEM_ICONS[itemType].color;
      icon.textContent = ITEM_ICONS[itemType].emoji;
      
      const countSpan = document.createElement('span');
      countSpan.className = 'collected-item-count';
      countSpan.textContent = `x${count}`;
      
      itemDiv.appendChild(icon);
      itemDiv.appendChild(countSpan);
      collectedItemsContainer.appendChild(itemDiv);
    }
  }
  
  // 如果没有拾取道具，隐藏面板
  collectedItemsContainer.style.display = hasItems ? 'flex' : 'none';
}

// 处理地图尺寸
function handleMapSize(data) {
  // 设置地图尺寸相关属性
  const mapWidth = data.width;
  const mapHeight = data.height;
  const cellSize = data.cellSize;
  
  // 调整Canvas大小以匹配地图尺寸
  if (canvas) {
    // 保持原比例，确保整个地图可见
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight;
    
    // 计算合适的Canvas大小，确保地图完全显示
    const canvasWidth = Math.min(mapWidth, containerWidth * 0.95);
    const canvasHeight = Math.min(mapHeight, containerHeight * 0.8);
    
    // 调整Canvas大小
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }
  
  addEffectMessage(`地图大小: ${mapWidth / cellSize}x${mapHeight / cellSize}`);
}

// 处理玩家被敌人击中
function handlePlayerEnemyHit(data) {
  const player = gameState.players[data.playerId];
  if (!player) return;
  
  // 创建击中效果
  createDeathEffect(player.x, player.y);
  
  // 如果是当前玩家，添加提示信息
  if (data.playerId === playerId) {
    addEffectMessage('⚠️ 你被敌人击败了！');
  }
}

// 处理敌人被击败
function handleEnemyKilled(data) {
  // 如果是当前玩家击败的敌人，显示得分
  if (data.playerId === playerId) {
    addEffectMessage(`🎯 击败敌人 +${data.scoreGained}分`);
    
    // 播放击败动画效果
    const enemy = gameState.aiEnemies[data.enemyId];
    if (enemy) {
      createEnemyDefeatEffect(enemy.x, enemy.y);
    }
  }
}

// 创建敌人击败效果
function createEnemyDefeatEffect(x, y) {
  const effectElement = document.createElement('div');
  effectElement.className = 'enemy-defeat-effect';
  effectElement.style.left = `${x}px`;
  effectElement.style.top = `${y}px`;
  
  gameScreen.appendChild(effectElement);
  
  // 2秒后移除效果
  setTimeout(() => {
    if (effectElement.parentNode) {
      gameScreen.removeChild(effectElement);
    }
  }, 2000);
}

// 初始化游戏
document.addEventListener('DOMContentLoaded', initGame); 