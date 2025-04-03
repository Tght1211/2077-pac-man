const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// 游戏状态
const gameState = {
  players: {},
  dots: {},
  powerPellets: {},
  ghosts: {},
  items: {},
  traps: {}, // 新增：陷阱
  aiEnemies: {}, // 新增：AI敌人
  gameLevel: 1,
  roundsCompleted: 0,
  mapWidth: 0, // 动态地图宽度
  mapHeight: 0 // 动态地图高度
};

// 地图大小
const MAX_MAP_WIDTH = 40;
const MAX_MAP_HEIGHT = 30;
const CELL_SIZE = 20;

// 道具类型
const ITEM_TYPES = {
  BOMB: 'bomb',           // 炸弹，可以清除范围内的所有豆子并获得分数
  SPEED_UP: 'speedUp',    // 速度提升
  FREEZE: 'freeze',       // 冻结其他玩家
  CONFUSION: 'confusion', // 干扰其他玩家的控制
  SHIELD: 'shield'        // 护盾，防止被干扰
};

// 道具持续时间(毫秒)
const ITEM_DURATION = {
  [ITEM_TYPES.SPEED_UP]: 5000,
  [ITEM_TYPES.FREEZE]: 3000,
  [ITEM_TYPES.CONFUSION]: 7000,
  [ITEM_TYPES.SHIELD]: 10000
};

// 陷阱类型
const TRAP_TYPES = {
  SPIKE: 'spike',     // 尖刺，直接淘汰
  SLOW: 'slow',       // 减速陷阱
  TELEPORT: 'teleport' // 随机传送
};

// AI敌人类型
const ENEMY_TYPES = {
  CHASER: 'chaser',   // 追逐最近的玩家
  WANDERER: 'wanderer', // 随机徘徊
  GUARDIAN: 'guardian'  // 守护某个区域
};

// 服务静态文件
app.use(express.static(path.join(__dirname, '../public')));

// 计算地图大小 - 基于客户端提供的尺寸动态调整
function calculateMapSize(clientWidth, clientHeight) {
  // 计算地图的实际格子数
  const mapWidth = Math.min(MAX_MAP_WIDTH, Math.floor(clientWidth / CELL_SIZE));
  const mapHeight = Math.min(MAX_MAP_HEIGHT, Math.floor(clientHeight / CELL_SIZE));
  
  gameState.mapWidth = mapWidth;
  gameState.mapHeight = mapHeight;
  
  return { mapWidth, mapHeight };
}

// 生成初始地图
function generateMap() {
  // 清除现有点和道具
  gameState.dots = {};
  gameState.powerPellets = {};
  gameState.items = {};
  gameState.traps = {}; // 清除陷阱
  gameState.aiEnemies = {}; // 清除AI敌人
  
  // 如果没有设置地图尺寸，使用默认值
  if (!gameState.mapWidth || !gameState.mapHeight) {
    gameState.mapWidth = MAX_MAP_WIDTH;
    gameState.mapHeight = MAX_MAP_HEIGHT;
  }
  
  // 生成点
  for (let x = 1; x < gameState.mapWidth - 1; x++) {
    for (let y = 1; y < gameState.mapHeight - 1; y++) {
      // 随机生成，难度越高点越少
      if (Math.random() > (0.3 + gameState.gameLevel * 0.02)) {
        const id = `dot-${x}-${y}`;
        gameState.dots[id] = {
          id,
          x: x * CELL_SIZE,
          y: y * CELL_SIZE,
          value: 10
        };
      }
    }
  }
  
  // 生成能量豆
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(Math.random() * (gameState.mapWidth - 2)) + 1;
    const y = Math.floor(Math.random() * (gameState.mapHeight - 2)) + 1;
    const id = `power-${x}-${y}`;
    
    // 删除该位置的普通豆子
    delete gameState.dots[`dot-${x}-${y}`];
    
    gameState.powerPellets[id] = {
      id,
      x: x * CELL_SIZE,
      y: y * CELL_SIZE,
      value: 50
    };
  }
  
  // 生成道具，根据游戏难度增加道具数量
  const itemCount = 3 + Math.floor(gameState.gameLevel / 2);
  for (let i = 0; i < itemCount; i++) {
    generateRandomItem();
  }
  
  // 生成陷阱，根据游戏难度增加数量
  const trapCount = 1 + Math.floor(gameState.gameLevel / 1.5);
  for (let i = 0; i < trapCount; i++) {
    generateRandomTrap();
  }
  
  // 生成AI敌人，根据难度增加数量
  const enemyCount = Math.floor(gameState.gameLevel / 2);
  for (let i = 0; i < enemyCount; i++) {
    generateAIEnemy();
  }
}

// 生成随机道具
function generateRandomItem() {
  const x = Math.floor(Math.random() * (gameState.mapWidth - 2)) + 1;
  const y = Math.floor(Math.random() * (gameState.mapHeight - 2)) + 1;
  const id = `item-${uuidv4().substring(0, 8)}`;
  
  // 获取随机道具类型
  const itemTypes = Object.values(ITEM_TYPES);
  const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
  
  // 删除该位置的普通豆子
  delete gameState.dots[`dot-${x}-${y}`];
  
  gameState.items[id] = {
    id,
    type: itemType,
    x: x * CELL_SIZE,
    y: y * CELL_SIZE
  };
}

// 生成随机陷阱
function generateRandomTrap() {
  // 随机选择陷阱位置
  let x, y;
  let attempts = 0;
  const maxAttempts = 20; // 最大尝试次数
  
  // 确保陷阱不会与其他物体重叠
  do {
    x = Math.floor(Math.random() * (gameState.mapWidth - 2)) + 1;
    y = Math.floor(Math.random() * (gameState.mapHeight - 2)) + 1;
    attempts++;
    
    // 避免无限循环
    if (attempts >= maxAttempts) {
      return; // 无法放置陷阱，退出
    }
  } while (
    gameState.dots[`dot-${x}-${y}`] || 
    Object.values(gameState.powerPellets).some(p => p.x === x * CELL_SIZE && p.y === y * CELL_SIZE) ||
    Object.values(gameState.items).some(i => i.x === x * CELL_SIZE && i.y === y * CELL_SIZE) ||
    Object.values(gameState.traps).some(t => t.x === x * CELL_SIZE && t.y === y * CELL_SIZE)
  );
  
  // 删除该位置的普通豆子
  delete gameState.dots[`dot-${x}-${y}`];
  
  // 决定陷阱类型，难度越高，尖刺陷阱越多
  let trapType;
  const rand = Math.random();
  
  if (rand < 0.2 + gameState.gameLevel * 0.05) {
    trapType = TRAP_TYPES.SPIKE;
  } else if (rand < 0.6) {
    trapType = TRAP_TYPES.SLOW;
  } else {
    trapType = TRAP_TYPES.TELEPORT;
  }
  
  // 创建陷阱
  const id = `trap-${uuidv4().substring(0, 8)}`;
  gameState.traps[id] = {
    id,
    type: trapType,
    x: x * CELL_SIZE,
    y: y * CELL_SIZE,
    // 陷阱属性是隐藏的，但会在玩家接近时显示警告
    visible: false,
    // 陷阱检测范围
    detectionRadius: CELL_SIZE * 2
  };
}

// 生成AI敌人
function generateAIEnemy() {
  const id = `enemy-${uuidv4().substring(0, 8)}`;
  
  // 随机位置
  const x = Math.floor(Math.random() * (gameState.mapWidth - 2) + 1) * CELL_SIZE;
  const y = Math.floor(Math.random() * (gameState.mapHeight - 2) + 1) * CELL_SIZE;
  
  // 随机敌人类型
  const enemyTypes = Object.values(ENEMY_TYPES);
  const enemyType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
  
  // 随机颜色 - 基于类型
  let color;
  switch (enemyType) {
    case ENEMY_TYPES.CHASER:
      color = '#ff3333'; // 红色
      break;
    case ENEMY_TYPES.WANDERER:
      color = '#ffcc00'; // 黄色
      break;
    case ENEMY_TYPES.GUARDIAN:
      color = '#3399ff'; // 蓝色
      break;
    default:
      color = '#ff33cc'; // 粉色（默认）
  }
  
  // 创建AI敌人
  gameState.aiEnemies[id] = {
    id,
    type: enemyType,
    x,
    y,
    direction: ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)],
    speed: 3 + (gameState.gameLevel * 0.5), // 速度随难度增加
    color,
    targetX: null, // 目标坐标 (对于守护者类型)
    targetY: null,
    lastDirectionChange: Date.now(),
    directionChangeCooldown: 500, // 毫秒
    size: CELL_SIZE // 尺寸
  };
  
  // 如果是守护者类型，设置守护区域
  if (enemyType === ENEMY_TYPES.GUARDIAN) {
    gameState.aiEnemies[id].targetX = x;
    gameState.aiEnemies[id].targetY = y;
    gameState.aiEnemies[id].guardRadius = CELL_SIZE * 5; // 守护半径
  }
}

// 生成初始地图
generateMap();

// 处理Socket连接
io.on('connection', (socket) => {
  console.log('玩家连接:', socket.id);
  
  // 限制最多99名玩家
  if (Object.keys(gameState.players).length >= 99) {
    socket.emit('server_full');
    socket.disconnect();
    return;
  }

  // 玩家加入游戏
  socket.on('join_game', (playerName) => {
    const playerId = socket.id;
    const playerColor = getRandomColor();
    
    // 随机位置
    const x = Math.floor(Math.random() * (gameState.mapWidth - 2) + 1) * CELL_SIZE;
    const y = Math.floor(Math.random() * (gameState.mapHeight - 2) + 1) * CELL_SIZE;
    
    gameState.players[playerId] = {
      id: playerId,
      name: playerName || `玩家-${playerId.substring(0, 4)}`,
      x,
      y,
      direction: 'right',
      score: 0,
      color: playerColor,
      isPowered: false,
      poweredTime: 0,
      // 新增道具效果状态
      effects: {
        speedUp: { active: false, endTime: 0 },
        frozen: { active: false, endTime: 0 },
        confused: { active: false, endTime: 0 },
        shield: { active: false, endTime: 0 },
        slow: { active: false, endTime: 0 } // 新增减速效果
      },
      // 已收集的道具
      inventory: {},
      isAlive: true // 新增玩家存活状态
    };
    
    // 告知玩家初始游戏状态
    socket.emit('game_state', gameState);
    socket.emit('player_id', playerId);
    socket.emit('game_level', gameState.gameLevel);
    
    // 广播新玩家加入
    io.emit('player_joined', gameState.players[playerId]);
  });
  
  // 处理客户端发送的屏幕尺寸
  socket.on('client_screen_size', (data) => {
    if (data.width && data.height) {
      calculateMapSize(data.width, data.height);
      
      // 如果地图尺寸发生变化，可能需要重新生成地图
      if (Object.keys(gameState.dots).length === 0) {
        generateMap();
      }
      
      // 通知客户端地图尺寸
      socket.emit('map_size', {
        width: gameState.mapWidth * CELL_SIZE,
        height: gameState.mapHeight * CELL_SIZE,
        cellSize: CELL_SIZE
      });
    }
  });
  
  // 处理玩家移动
  socket.on('player_move', (direction) => {
    const playerId = socket.id;
    if (gameState.players[playerId]) {
      const player = gameState.players[playerId];
      
      // 如果玩家被冻结，无法移动
      if (player.effects.frozen.active) {
        return;
      }
      
      // 如果玩家被干扰，控制相反
      if (player.effects.confused.active) {
        switch (direction) {
          case 'up': direction = 'down'; break;
          case 'down': direction = 'up'; break;
          case 'left': direction = 'right'; break;
          case 'right': direction = 'left'; break;
        }
      }
      
      player.direction = direction;
    }
  });
  
  // 处理道具使用
  socket.on('use_item', (itemType, targetPosition) => {
    const playerId = socket.id;
    const player = gameState.players[playerId];
    
    if (!player || !player.inventory[itemType]) {
      return;
    }
    
    // 移除玩家的道具
    player.inventory[itemType]--;
    if (player.inventory[itemType] <= 0) {
      delete player.inventory[itemType];
    }
    
    // 处理不同道具效果
    switch (itemType) {
      case ITEM_TYPES.BOMB:
        // 炸弹效果：清除范围内的豆子并获得分数
        const bombRadius = 100; // 炸弹爆炸半径
        let pointsGained = 0;
        
        // 检查范围内的豆子
        Object.values(gameState.dots).forEach(dot => {
          const distance = Math.sqrt(
            Math.pow(targetPosition.x - dot.x, 2) + 
            Math.pow(targetPosition.y - dot.y, 2)
          );
          
          if (distance <= bombRadius) {
            pointsGained += dot.value;
            delete gameState.dots[dot.id];
            io.emit('dot_eaten', dot.id);
          }
        });
        
        // 检查范围内的能量豆
        Object.values(gameState.powerPellets).forEach(pellet => {
          const distance = Math.sqrt(
            Math.pow(targetPosition.x - pellet.x, 2) + 
            Math.pow(targetPosition.y - pellet.y, 2)
          );
          
          if (distance <= bombRadius) {
            pointsGained += pellet.value;
            delete gameState.powerPellets[pellet.id];
            io.emit('power_pellet_eaten', pellet.id);
          }
        });
        
        // 增加玩家分数
        player.score += pointsGained;
        
        // 发送炸弹爆炸效果
        io.emit('bomb_explosion', {
          x: targetPosition.x,
          y: targetPosition.y,
          radius: bombRadius,
          playerId: playerId
        });
        break;
        
      case ITEM_TYPES.FREEZE:
        // 冻结其他玩家
        Object.values(gameState.players).forEach(targetPlayer => {
          // 不影响自己和有护盾的玩家
          if (targetPlayer.id !== playerId && !targetPlayer.effects.shield.active) {
            targetPlayer.effects.frozen.active = true;
            targetPlayer.effects.frozen.endTime = Date.now() + ITEM_DURATION[ITEM_TYPES.FREEZE];
            
            // 通知被冻结的玩家
            io.to(targetPlayer.id).emit('player_frozen', ITEM_DURATION[ITEM_TYPES.FREEZE]);
          }
        });
        break;
        
      case ITEM_TYPES.CONFUSION:
        // 干扰其他玩家控制
        Object.values(gameState.players).forEach(targetPlayer => {
          // 不影响自己和有护盾的玩家
          if (targetPlayer.id !== playerId && !targetPlayer.effects.shield.active) {
            targetPlayer.effects.confused.active = true;
            targetPlayer.effects.confused.endTime = Date.now() + ITEM_DURATION[ITEM_TYPES.CONFUSION];
            
            // 通知被干扰的玩家
            io.to(targetPlayer.id).emit('player_confused', ITEM_DURATION[ITEM_TYPES.CONFUSION]);
          }
        });
        break;
        
      case ITEM_TYPES.SPEED_UP:
        // 增加自己的速度
        player.effects.speedUp.active = true;
        player.effects.speedUp.endTime = Date.now() + ITEM_DURATION[ITEM_TYPES.SPEED_UP];
        socket.emit('player_speed_up', ITEM_DURATION[ITEM_TYPES.SPEED_UP]);
        break;
        
      case ITEM_TYPES.SHIELD:
        // 激活护盾
        player.effects.shield.active = true;
        player.effects.shield.endTime = Date.now() + ITEM_DURATION[ITEM_TYPES.SHIELD];
        socket.emit('player_shield', ITEM_DURATION[ITEM_TYPES.SHIELD]);
        break;
    }
    
    // 广播道具使用信息
    io.emit('item_used', {
      playerId: playerId,
      itemType: itemType,
      position: targetPosition
    });
  });
  
  // 处理玩家断开连接
  socket.on('disconnect', () => {
    console.log('玩家断开连接:', socket.id);
    const playerId = socket.id;
    
    if (gameState.players[playerId]) {
      delete gameState.players[playerId];
      io.emit('player_left', playerId);
    }
  });
});

// 游戏循环
const FPS = 30;
setInterval(() => {
  // 更新玩家位置
  Object.values(gameState.players).forEach(player => {
    // 如果玩家已经被淘汰，跳过更新
    if (!player.isAlive) {
      return;
    }
    
    // 如果玩家被冻结，无法移动
    if (player.effects.frozen.active) {
      if (Date.now() > player.effects.frozen.endTime) {
        player.effects.frozen.active = false;
        io.to(player.id).emit('effect_ended', 'frozen');
      } else {
        return; // 跳过移动
      }
    }
    
    // 更新其他效果状态
    if (player.effects.confused.active && Date.now() > player.effects.confused.endTime) {
      player.effects.confused.active = false;
      io.to(player.id).emit('effect_ended', 'confused');
    }
    
    if (player.effects.speedUp.active && Date.now() > player.effects.speedUp.endTime) {
      player.effects.speedUp.active = false;
      io.to(player.id).emit('effect_ended', 'speedUp');
    }
    
    if (player.effects.shield.active && Date.now() > player.effects.shield.endTime) {
      player.effects.shield.active = false;
      io.to(player.id).emit('effect_ended', 'shield');
    }
    
    if (player.effects.slow.active && Date.now() > player.effects.slow.endTime) {
      player.effects.slow.active = false;
      io.to(player.id).emit('effect_ended', 'slow');
    }
    
    // 根据速度提升/减速效果调整速度
    let baseSpeed = 5;
    // 如果减速，速度减半
    if (player.effects.slow.active) {
      baseSpeed = baseSpeed * 0.5;
    }
    // 如果速度提升，速度增加1.5倍
    const speed = player.effects.speedUp.active ? baseSpeed * 1.5 : baseSpeed;
    
    // 根据方向移动，确保玩家不会超出地图边界
    switch (player.direction) {
      case 'up':
        player.y = Math.max(CELL_SIZE, player.y - speed);
        break;
      case 'down':
        player.y = Math.min((gameState.mapHeight - 1) * CELL_SIZE, player.y + speed);
        break;
      case 'left':
        player.x = Math.max(CELL_SIZE, player.x - speed);
        break;
      case 'right':
        player.x = Math.min((gameState.mapWidth - 1) * CELL_SIZE, player.x + speed);
        break;
    }
    
    // 检查豆子碰撞
    Object.values(gameState.dots).forEach(dot => {
      if (isColliding(player, dot)) {
        player.score += dot.value;
        delete gameState.dots[dot.id];
        io.emit('dot_eaten', dot.id);
      }
    });
    
    // 检查能量豆碰撞
    Object.values(gameState.powerPellets).forEach(powerPellet => {
      if (isColliding(player, powerPellet)) {
        player.score += powerPellet.value;
        player.isPowered = true;
        player.poweredTime = 10000; // 10秒
        delete gameState.powerPellets[powerPellet.id];
        io.emit('power_pellet_eaten', powerPellet.id);
      }
    });
    
    // 检查道具碰撞
    Object.values(gameState.items).forEach(item => {
      if (isColliding(player, item)) {
        // 添加到玩家库存
        if (!player.inventory[item.type]) {
          player.inventory[item.type] = 0;
        }
        player.inventory[item.type]++;
        
        // 从地图中移除道具
        delete gameState.items[item.id];
        
        // 通知所有玩家道具被收集
        io.emit('item_collected', {
          itemId: item.id,
          playerId: player.id,
          itemType: item.type
        });
        
        // 通知收集者获得道具
        io.to(player.id).emit('item_acquired', item.type);
      }
    });
    
    // 检查陷阱碰撞和接近
    Object.values(gameState.traps).forEach(trap => {
      // 计算玩家和陷阱的距离
      const distance = Math.sqrt(
        Math.pow(player.x - trap.x, 2) + 
        Math.pow(player.y - trap.y, 2)
      );
      
      // 如果玩家接近陷阱，但没有碰到，发送警告
      if (distance <= trap.detectionRadius && distance > CELL_SIZE / 2) {
        // 向玩家发送陷阱警告
        io.to(player.id).emit('trap_warning', {
          x: trap.x,
          y: trap.y,
          distance: distance
        });
      }
      
      // 如果玩家碰到陷阱
      if (isColliding(player, trap)) {
        // 根据陷阱类型应用效果
        switch (trap.type) {
          case TRAP_TYPES.SPIKE:
            // 尖刺陷阱：立即淘汰玩家
            player.isAlive = false;
            
            // 通知玩家被淘汰
            io.to(player.id).emit('player_eliminated', {
              reason: 'trap',
              trapType: trap.type
            });
            
            // 通知所有玩家有人被淘汰
            io.emit('player_trap_hit', {
              playerId: player.id,
              trapId: trap.id,
              trapType: trap.type
            });
            
            // 陷阱被触发后移除
            delete gameState.traps[trap.id];
            break;
            
          case TRAP_TYPES.SLOW:
            // 减速陷阱：玩家速度减半
            if (!player.effects.shield.active) { // 如果玩家有护盾则不受影响
              player.effects.slow.active = true;
              player.effects.slow.endTime = Date.now() + 5000; // 5秒减速
              
              io.to(player.id).emit('player_slowed', 5000);
              io.emit('player_trap_hit', {
                playerId: player.id,
                trapId: trap.id,
                trapType: trap.type
              });
            }
            
            // 陷阱被触发后移除
            delete gameState.traps[trap.id];
            break;
            
          case TRAP_TYPES.TELEPORT:
            // 传送陷阱：随机传送玩家到地图上的某个位置
            if (!player.effects.shield.active) { // 如果玩家有护盾则不受影响
              // 原位置
              const oldX = player.x;
              const oldY = player.y;
              
              // 新位置
              player.x = Math.floor(Math.random() * (gameState.mapWidth - 2) + 1) * CELL_SIZE;
              player.y = Math.floor(Math.random() * (gameState.mapHeight - 2) + 1) * CELL_SIZE;
              
              io.to(player.id).emit('player_teleported', {
                from: { x: oldX, y: oldY },
                to: { x: player.x, y: player.y }
              });
              
              io.emit('player_trap_hit', {
                playerId: player.id,
                trapId: trap.id,
                trapType: trap.type
              });
            }
            
            // 陷阱被触发后移除
            delete gameState.traps[trap.id];
            break;
        }
      }
    });
    
    // 更新能量状态
    if (player.isPowered) {
      player.poweredTime -= 1000 / FPS;
      if (player.poweredTime <= 0) {
        player.isPowered = false;
      }
    }
  });
  
  // 更新AI敌人位置和行为
  Object.values(gameState.aiEnemies).forEach(enemy => {
    // 检查是否需要改变方向
    const now = Date.now();
    if (now - enemy.lastDirectionChange > enemy.directionChangeCooldown) {
      enemy.lastDirectionChange = now;
      
      // 根据敌人类型采取不同的策略
      switch (enemy.type) {
        case ENEMY_TYPES.CHASER:
          // 寻找最近的玩家并追逐
          let closestPlayer = null;
          let minDistance = Infinity;
          
          Object.values(gameState.players).forEach(player => {
            if (player.isAlive) {
              const distance = Math.sqrt(
                Math.pow(player.x - enemy.x, 2) + 
                Math.pow(player.y - enemy.y, 2)
              );
              
              if (distance < minDistance) {
                minDistance = distance;
                closestPlayer = player;
              }
            }
          });
          
          // 如果有玩家，朝玩家方向移动
          if (closestPlayer) {
            if (Math.random() < 0.7) { // 70%概率做出正确决策
              // 水平移动
              if (closestPlayer.x < enemy.x) {
                enemy.direction = 'left';
              } else if (closestPlayer.x > enemy.x) {
                enemy.direction = 'right';
              }
              // 垂直移动
              else if (closestPlayer.y < enemy.y) {
                enemy.direction = 'up';
              } else {
                enemy.direction = 'down';
              }
            } else {
              // 随机移动 - 增加一些不可预测性
              enemy.direction = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
            }
          }
          break;
          
        case ENEMY_TYPES.WANDERER:
          // 随机改变方向
          if (Math.random() < 0.3) { // 30%的概率改变方向
            enemy.direction = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
          }
          break;
          
        case ENEMY_TYPES.GUARDIAN:
          // 检查是否超出守护区域
          const distanceToGuardArea = Math.sqrt(
            Math.pow(enemy.targetX - enemy.x, 2) + 
            Math.pow(enemy.targetY - enemy.y, 2)
          );
          
          if (distanceToGuardArea > enemy.guardRadius) {
            // 返回守护区域
            if (enemy.targetX < enemy.x) {
              enemy.direction = 'left';
            } else if (enemy.targetX > enemy.x) {
              enemy.direction = 'right';
            } else if (enemy.targetY < enemy.y) {
              enemy.direction = 'up';
            } else {
              enemy.direction = 'down';
            }
          } else {
            // 在守护区域内随机移动
            if (Math.random() < 0.2) {
              enemy.direction = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
            }
          }
          break;
      }
    }
    
    // 根据方向移动敌人，确保不会超出地图边界
    switch (enemy.direction) {
      case 'up':
        enemy.y = Math.max(CELL_SIZE, enemy.y - enemy.speed);
        break;
      case 'down':
        enemy.y = Math.min((gameState.mapHeight - 1) * CELL_SIZE, enemy.y + enemy.speed);
        break;
      case 'left':
        enemy.x = Math.max(CELL_SIZE, enemy.x - enemy.speed);
        break;
      case 'right':
        enemy.x = Math.min((gameState.mapWidth - 1) * CELL_SIZE, enemy.x + enemy.speed);
        break;
    }
    
    // 检查敌人与玩家的碰撞
    Object.values(gameState.players).forEach(player => {
      if (player.isAlive && isColliding(enemy, player)) {
        // 如果玩家有护盾，不受伤害
        if (player.effects.shield.active) {
          return;
        }
        
        // 如果玩家处于能力状态，可以消灭敌人
        if (player.isPowered) {
          // 玩家消灭敌人
          delete gameState.aiEnemies[enemy.id];
          
          // 奖励玩家积分
          player.score += 200;
          
          // 通知客户端
          io.emit('enemy_killed', {
            enemyId: enemy.id,
            playerId: player.id,
            scoreGained: 200
          });
        } else {
          // 玩家被敌人击中
          player.isAlive = false;
          
          // 通知玩家被淘汰
          io.to(player.id).emit('player_eliminated', {
            reason: 'enemy',
            enemyType: enemy.type
          });
          
          // 通知所有玩家
          io.emit('player_enemy_hit', {
            playerId: player.id,
            enemyId: enemy.id,
            enemyType: enemy.type
          });
        }
      }
    });
  });
  
  // 偶尔生成新道具，难度越高生成频率越高
  if (Math.random() < 0.003 * gameState.gameLevel && Object.keys(gameState.items).length < 5 + gameState.gameLevel) {
    generateRandomItem();
    io.emit('new_item', Object.values(gameState.items)[Object.keys(gameState.items).length - 1]);
  }
  
  // 偶尔生成新陷阱，根据难度和现有陷阱数量调整
  if (Math.random() < 0.001 * gameState.gameLevel && Object.keys(gameState.traps).length < 2 + gameState.gameLevel) {
    generateRandomTrap();
  }
  
  // 当游戏中没有活着的玩家或者豆子被吃完时结束回合并增加难度
  const livingPlayersCount = Object.values(gameState.players).filter(p => p.isAlive).length;
  if ((livingPlayersCount === 0 && Object.keys(gameState.players).length > 0) || 
      (Object.keys(gameState.dots).length === 0 && Object.keys(gameState.powerPellets).length === 0)) {
    
    gameState.roundsCompleted++;
    
    // 每完成3回合增加难度
    if (gameState.roundsCompleted % 3 === 0) {
      gameState.gameLevel++;
      io.emit('level_up', gameState.gameLevel);
    }
    
    // 重新生成地图
    generateMap();
    
    // 复活所有玩家
    Object.values(gameState.players).forEach(player => {
      if (!player.isAlive) {
        player.isAlive = true;
        player.x = Math.floor(Math.random() * (gameState.mapWidth - 2) + 1) * CELL_SIZE;
        player.y = Math.floor(Math.random() * (gameState.mapHeight - 2) + 1) * CELL_SIZE;
        
        // 重置玩家状态
        player.isPowered = false;
        player.poweredTime = 0;
        
        // 重置效果
        player.effects.speedUp.active = false;
        player.effects.frozen.active = false;
        player.effects.confused.active = false;
        player.effects.shield.active = false;
        player.effects.slow.active = false;
        
        // 通知玩家复活
        io.to(player.id).emit('player_revived');
      }
    });
    
    io.emit('map_reset', { 
      dots: gameState.dots, 
      powerPellets: gameState.powerPellets,
      items: gameState.items,
      traps: Object.keys(gameState.traps).length, // 只发送陷阱数量，不发送位置
      level: gameState.gameLevel
    });
  }
  
  // 广播游戏状态
  io.emit('game_update', {
    players: gameState.players,
    items: gameState.items,
    aiEnemies: gameState.aiEnemies // 添加AI敌人信息
  });
}, 1000 / FPS);

// 碰撞检测函数
function isColliding(obj1, obj2) {
  const distance = Math.sqrt(
    Math.pow(obj1.x - obj2.x, 2) + Math.pow(obj1.y - obj2.y, 2)
  );
  return distance < CELL_SIZE / 2;
}

// 生成随机颜色
function getRandomColor() {
  const neonColors = [
    '#ff00ff', // 粉红色
    '#00ffff', // 青色
    '#ff0000', // 红色
    '#00ff00', // 绿色
    '#0000ff', // 蓝色
    '#ffff00'  // 黄色
  ];
  return neonColors[Math.floor(Math.random() * neonColors.length)];
}

// 生成初始地图
generateMap();

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
}); 