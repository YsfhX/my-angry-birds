// 模块化引入 Matter.js 的核心组件
const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Events = Matter.Events,
      Mouse = Matter.Mouse,
      MouseConstraint = Matter.MouseConstraint,
      Constraint = Matter.Constraint,
      Vector = Matter.Vector,
      Body = Matter.Body;

// 游戏全局状态
const Game = {
    engine: null,
    render: null,
    runner: null,
    score: 0,
    level: 0,
    bodies: {
        bird: null,
        sling: null,
        anchor: { x: 200, y: 0 }
    },
    particles: [], // 粒子数组
    width: window.innerWidth,
    height: window.innerHeight
};

// 关卡配置
const Levels = [
    // Level 1: 简单入门
    {
        setup: (w, h) => {
            const pX = w * 0.7;
            const pY = h - 150;
            return [
                Bodies.rectangle(pX, pY, 200, 20, { isStatic: true, label: 'platform', render: {fillStyle: '#8B4513'} }),
                Bodies.rectangle(pX - 40, pY - 30, 40, 40, { label: 'wood' }),
                Bodies.rectangle(pX + 40, pY - 30, 40, 40, { label: 'wood' }),
                Bodies.circle(pX, pY - 30, 20, { label: 'pig' }),
                Bodies.rectangle(pX, pY - 70, 120, 20, { label: 'wood' }), // 顶板
                Bodies.rectangle(pX, pY - 100, 40, 40, { label: 'wood' }),
                Bodies.circle(pX, pY - 140, 20, { label: 'pig' })
            ];
        }
    },
    // Level 2: 碉堡
    {
        setup: (w, h) => {
            const pX = w * 0.75;
            const pY = h - 150;
            let blocks = [
                Bodies.rectangle(pX, pY, 300, 20, { isStatic: true, label: 'platform', render: {fillStyle: '#8B4513'} }),
            ];
            // 生成一个金字塔
            for(let i=0; i<3; i++) {
                blocks.push(Bodies.rectangle(pX - 60 + i*60, pY - 30, 50, 50, { label: 'wood' }));
            }
            blocks.push(Bodies.circle(pX - 30, pY - 80, 20, { label: 'pig' }));
            blocks.push(Bodies.circle(pX + 30, pY - 80, 20, { label: 'pig' }));
            blocks.push(Bodies.rectangle(pX, pY - 130, 200, 20, { label: 'wood' })); // 长条
            blocks.push(Bodies.rectangle(pX, pY - 170, 40, 40, { label: 'ice' }));
            blocks.push(Bodies.circle(pX, pY - 210, 25, { label: 'pig' }));
            return blocks;
        }
    }
];

// 初始化游戏
function init() {
    const container = document.getElementById('game-container');
    Game.width = window.innerWidth;
    Game.height = window.innerHeight;
    Game.bodies.anchor = { x: Game.width * 0.2, y: Game.height - 200 };

    // 1. 创建引擎
    Game.engine = Engine.create();
    // 优化：调高迭代次数，防止物理穿透
    Game.engine.positionIterations = 8;
    Game.engine.velocityIterations = 8;

    // 2. 创建渲染器
    Game.render = Render.create({
        element: container,
        engine: Game.engine,
        options: {
            width: Game.width,
            height: Game.height,
            wireframes: false, // 必须关闭线框模式
            background: 'transparent', // 透明背景，让CSS背景显示
            pixelRatio: window.devicePixelRatio // 支持高清屏
        }
    });

    // 3. 鼠标/触摸交互
    const mouse = Mouse.create(Game.render.canvas);
    const mouseConstraint = MouseConstraint.create(Game.engine, {
        mouse: mouse,
        constraint: {
            stiffness: 0.1,
            render: { visible: false }
        }
    });
    
    // 关键修复：确保 Matter.js 正确处理 Canvas 的缩放
    // 避免高分屏下鼠标坐标不准的问题
    Game.render.mouse = mouse;

    Composite.add(Game.engine.world, mouseConstraint);

    // 4. 注册交互事件
    Events.on(mouseConstraint, 'startdrag', (e) => {
        // 只能拖小鸟
        if (e.body !== Game.bodies.bird) {
            e.source.body = null; // 禁止拖动其他物体
        }
    });

    Events.on(mouseConstraint, 'enddrag', (e) => {
        if (e.body === Game.bodies.bird) {
            fireBird();
        }
    });

    // 5. 碰撞事件
    Events.on(Game.engine, 'collisionStart', handleCollisions);

    // 6. 渲染循环挂钩 (用于绘制自定义画质)
    Events.on(Game.render, 'afterRender', renderLoop);

    // 启动
    Game.runner = Runner.create();
    Runner.run(Game.runner, Game.engine);
    Render.run(Game.render);

    // 加载第一关
    loadLevel(0);
}

function loadLevel(idx) {
    Game.level = idx;
    const world = Game.engine.world;
    
    // 清理除了鼠标约束外的所有物体
    Composite.clear(world, false, true); // keepStatic=false, deep=true (保留constraint需小心)
    // 实际上我们想保留鼠标约束，所以手动清除
    const bodies = Composite.allBodies(world);
    Composite.remove(world, bodies);
    const constraints = Composite.allConstraints(world).filter(c => c.label !== 'Mouse Constraint');
    Composite.remove(world, constraints);

    // 重置分数
    if(idx === 0) {
        Game.score = 0;
        updateScore(0);
    }

    // 1. 创建地面
    const ground = Bodies.rectangle(Game.width/2, Game.height + 20, Game.width, 100, { 
        isStatic: true, label: 'ground', friction: 1
    });

    // 2. 创建小鸟
    Game.bodies.bird = Bodies.circle(Game.bodies.anchor.x, Game.bodies.anchor.y, 20, { 
        label: 'bird', density: 0.004, restitution: 0.6 
    });

    // 3. 创建弹弓
    Game.bodies.sling = Constraint.create({
        pointA: Game.bodies.anchor,
        bodyB: Game.bodies.bird,
        stiffness: 0.05,
        length: 1,
        damping: 0.01,
        render: { visible: false } // 自定义绘制
    });

    // 4. 加载关卡特定物体
    const levelBodies = Levels[idx].setup(Game.width, Game.height);

    Composite.add(world, [ground, Game.bodies.bird, Game.bodies.sling, ...levelBodies]);
    
    // 隐藏UI弹窗
    document.getElementById('modal').classList.add('hidden');
}

function fireBird() {
    const bird = Game.bodies.bird;
    const anchor = Game.bodies.anchor;
    
    // 计算拉拽距离
    const dist = Vector.magnitude(Vector.sub(bird.position, anchor));

    // 只有拉开一定距离才发射
    if (dist > 20) {
        // 延迟释放，让弹力生效一瞬间
        setTimeout(() => {
            Composite.remove(Game.engine.world, Game.bodies.sling);
            Game.bodies.sling = null;
            // 3秒后检查胜负
            setTimeout(checkWin, 3500);
        }, 20);
    } else {
        // 距离太短，取消发射，复位
        // Matter.js 的 Constraint 会自动拉回去，这里不需要做太多
    }
}

function handleCollisions(event) {
    const pairs = event.pairs;
    pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        const speed = pair.collision.normalImpulse; // 冲击力

        [bodyA, bodyB].forEach(body => {
            if (body.label === 'pig') {
                // 猪很脆弱，撞击力大于3就死
                if (speed > 3) {
                    killPig(body);
                }
            } else if (body.label === 'wood' || body.label === 'ice') {
                // 箱子需要更大的力
                if (speed > 15) {
                    createParticles(body.position.x, body.position.y, body.label === 'wood' ? '#deb887' : '#a5f2f3', 5);
                    Composite.remove(Game.engine.world, body);
                    updateScore(50);
                }
            }
        });
    });
}

function killPig(pigBody) {
    if(pigBody.isDead) return; // 防止重复触发
    pigBody.isDead = true;
    
    // 粒子特效
    createParticles(pigBody.position.x, pigBody.position.y, '#76c893', 10);
    
    // 加分
    updateScore(500);
    
    // 移除
    Composite.remove(Game.engine.world, pigBody);
    
    // 检查是否胜利
    checkWin();
}

function checkWin() {
    // 统计剩余的猪
    const pigs = Composite.allBodies(Game.engine.world).filter(b => b.label === 'pig');
    
    if (pigs.length === 0) {
        showModal('胜利!', `得分: ${Game.score}`, true);
    } else if (!Game.bodies.sling) {
        // 弹弓没了，猪还在 -> 失败
        // 再给点时间看看会不会因为滚动撞死
        setTimeout(() => {
             const pigsStill = Composite.allBodies(Game.engine.world).filter(b => b.label === 'pig');
             if(pigsStill.length > 0) {
                 showModal('失败', `得分: ${Game.score}`, false);
             } else {
                 showModal('胜利!', `得分: ${Game.score}`, true);
             }
        }, 1500);
    }
}

function createParticles(x, y, color, count) {
    for(let i=0; i<count; i++) {
        Game.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0,
            color: color
        });
    }
}

// --- 核心：高级渲染循环 ---
function renderLoop() {
    const ctx = Game.render.context;
    const bodies = Composite.allBodies(Game.engine.world);

    // 1. 绘制辅助线 (瞄准预测)
    if (Game.bodies.sling && Game.bodies.bird) {
        drawTrajectory(ctx);
        drawSlingRubber(ctx);
    }

    // 2. 绘制所有物理实体 (使用美化效果)
    bodies.forEach(body => {
        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);

        if (body.label === 'bird') drawBird(ctx);
        else if (body.label === 'pig') drawPig(ctx);
        else if (body.label === 'wood') drawBox(ctx, body, '#DEB887', '#8B4513');
        else if (body.label === 'ice') drawBox(ctx, body, 'rgba(200,255,255,0.6)', '#fff');
        else if (body.label === 'platform') drawBox(ctx, body, '#5D4037', '#3E2723');
        else if (body.label === 'ground') drawGround(ctx);

        ctx.restore();
    });

    // 3. 绘制粒子
    updateAndDrawParticles(ctx);
    
    // 4. 绘制弹弓前部 (遮挡鸟)
    if (Game.bodies.sling) {
        drawSlingFront(ctx);
    }
}

// --- 绘图函数集 (3D 质感) ---

function drawBird(ctx) {
    // 红色球体渐变
    let grd = ctx.createRadialGradient(-5, -5, 2, 0, 0, 20);
    grd.addColorStop(0, "#ff5252");
    grd.addColorStop(1, "#b71c1c");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill();
    
    // 眼睛
    ctx.fillStyle = "white";
    ctx.beginPath(); ctx.arc(7, -8, 6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-7, -8, 6, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "black";
    ctx.beginPath(); ctx.arc(7, -8, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-7, -8, 2, 0, Math.PI*2); ctx.fill();
    
    // 眉毛
    ctx.fillStyle = "#333";
    ctx.fillRect(-10, -15, 20, 5);

    // 嘴
    ctx.fillStyle = "#ffca28";
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(10, 5); ctx.lineTo(0, 10); ctx.fill();
}

function drawPig(ctx) {
    // 绿色球体
    let grd = ctx.createRadialGradient(-5, -5, 2, 0, 0, 20);
    grd.addColorStop(0, "#9ccc65");
    grd.addColorStop(1, "#33691e");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill();

    // 鼻子
    ctx.fillStyle = "#8bc34a";
    ctx.beginPath(); ctx.ellipse(0, 4, 8, 6, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#1b5e20";
    ctx.beginPath(); ctx.arc(-3, 4, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, 4, 2, 0, Math.PI*2); ctx.fill();

    // 眼睛
    ctx.fillStyle = "white";
    ctx.beginPath(); ctx.arc(-8, -5, 5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -5, 5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "black";
    ctx.beginPath(); ctx.arc(-8, -5, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(8, -5, 2, 0, Math.PI*2); ctx.fill();
}

function drawBox(ctx, body, mainColor, borderColor) {
    const w = body.bounds.max.x - body.bounds.min.x;
    const h = body.bounds.max.y - body.bounds.min.y;
    
    ctx.fillStyle = mainColor;
    ctx.fillRect(-w/2, -h/2, w, h);
    
    // 内阴影效果
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(-w/2, -h/2, w, h);
    
    // X 纹理
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-w/2, -h/2); ctx.lineTo(w/2, h/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w/2, -h/2); ctx.lineTo(-w/2, h/2); ctx.stroke();
}

function drawGround(ctx) {
    ctx.fillStyle = '#558b2f';
    ctx.fillRect(-Game.width/2, -50, Game.width, 100);
    // 草皮顶层
    ctx.fillStyle = '#7cb342';
    ctx.fillRect(-Game.width/2, -50, Game.width, 10);
}

function drawSlingRubber(ctx) {
    ctx.beginPath();
    ctx.moveTo(Game.bodies.anchor.x - 15, Game.bodies.anchor.y - 15);
    ctx.lineTo(Game.bodies.bird.position.x, Game.bodies.bird.position.y);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#3e2723';
    ctx.stroke();
}

function drawSlingFront(ctx) {
    const anc = Game.bodies.anchor;
    // 弹弓支架
    ctx.fillStyle = '#795548';
    ctx.fillRect(anc.x - 5, anc.y, 10, 60); // 柱子
    
    // 叉子
    ctx.strokeStyle = '#795548';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(anc.x, anc.y);
    ctx.lineTo(anc.x - 15, anc.y - 25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(anc.x, anc.y);
    ctx.lineTo(anc.x + 15, anc.y - 25);
    ctx.stroke();

    // 右边的皮筋 (画在最上面)
    if (Game.bodies.sling && Game.bodies.bird) {
        ctx.beginPath();
        ctx.moveTo(anc.x + 15, anc.y - 25);
        ctx.lineTo(Game.bodies.bird.position.x, Game.bodies.bird.position.y);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#3e2723';
        ctx.stroke();
    }
}

function drawTrajectory(ctx) {
    // 简单的抛物线预测
    const birdPos = Game.bodies.bird.position;
    const anchor = Game.bodies.anchor;
    const force = Vector.sub(anchor, birdPos); // 反向力
    
    ctx.beginPath();
    let currX = birdPos.x;
    let currY = birdPos.y;
    let velocityX = force.x * 0.15; // 缩放系数，需根据 physics 调整
    let velocityY = force.y * 0.15;
    
    for(let i=0; i<15; i++) {
        currX += velocityX;
        currY += velocityY;
        velocityY += 1; // 重力模拟
        ctx.arc(currX, currY, 3, 0, Math.PI*2);
        ctx.closePath();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
}

function updateAndDrawParticles(ctx) {
    for(let i = Game.particles.length - 1; i >= 0; i--) {
        let p = Game.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.5; // 重力
        p.life -= 0.05;
        
        if(p.life <= 0) {
            Game.particles.splice(i, 1);
            continue;
        }
        
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 + p.life * 2, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

// --- UI 逻辑 ---
function updateScore(add) {
    Game.score += add;
    document.getElementById('score').innerText = Game.score;
}

function showModal(title, scoreText, isWin) {
    const m = document.getElementById('modal');
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-score').innerText = scoreText;
    
    const nextBtn = document.getElementById('btn-next');
    const retryBtn = document.getElementById('btn-retry');

    if (isWin) {
        if (Game.level < Levels.length - 1) {
            nextBtn.style.display = 'block';
            nextBtn.onclick = () => loadLevel(Game.level + 1);
        } else {
            nextBtn.style.display = 'none'; // 通关了
            document.getElementById('modal-title').innerText = "全通关!";
        }
        retryBtn.innerText = "重玩本关";
    } else {
        nextBtn.style.display = 'none';
        retryBtn.innerText = "再试一次";
    }
    
    retryBtn.onclick = () => loadLevel(Game.level);
    m.classList.remove('hidden');
}

// 键盘监听
window.addEventListener('keydown', (e) => {
    if(e.key === 'r' || e.key === 'R') loadLevel(Game.level);
});

// 窗口大小调整
window.addEventListener('resize', () => {
    // 简单处理：刷新页面防止坐标错乱
    location.reload();
});

// 启动
init();