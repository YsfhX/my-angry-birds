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
      Vector = Matter.Vector;

// 游戏全局状态
const Game = {
    engine: null,
    render: null,
    runner: null,
    score: 0,
    bodies: {
        bird: null,
        sling: null,
        anchor: { x: 200, y: 0 }
    },
    particles: [],
    width: window.innerWidth,
    height: window.innerHeight
};

// 关卡配置
const Levels = [
    {
        setup: (w, h) => {
            const pX = w * 0.7;
            const pY = h - 150;
            return [
                Bodies.rectangle(pX, pY, 200, 20, { isStatic: true, label: 'platform', render: {fillStyle: '#8B4513'} }),
                Bodies.rectangle(pX - 40, pY - 30, 40, 40, { label: 'wood' }),
                Bodies.rectangle(pX + 40, pY - 30, 40, 40, { label: 'wood' }),
                Bodies.circle(pX, pY - 30, 20, { label: 'pig' }),
                Bodies.rectangle(pX, pY - 70, 120, 20, { label: 'wood' }),
                Bodies.rectangle(pX, pY - 100, 40, 40, { label: 'wood' }),
                Bodies.circle(pX, pY - 140, 20, { label: 'pig' })
            ];
        }
    },
    {
        setup: (w, h) => {
            const pX = w * 0.75;
            const pY = h - 150;
            let blocks = [
                Bodies.rectangle(pX, pY, 300, 20, { isStatic: true, label: 'platform', render: {fillStyle: '#8B4513'} }),
            ];
            for(let i=0; i<3; i++) {
                blocks.push(Bodies.rectangle(pX - 60 + i*60, pY - 30, 50, 50, { label: 'wood' }));
            }
            blocks.push(Bodies.circle(pX - 30, pY - 80, 20, { label: 'pig' }));
            blocks.push(Bodies.circle(pX + 30, pY - 80, 20, { label: 'pig' }));
            blocks.push(Bodies.rectangle(pX, pY - 130, 200, 20, { label: 'wood' }));
            blocks.push(Bodies.rectangle(pX, pY - 170, 40, 40, { label: 'ice' }));
            blocks.push(Bodies.circle(pX, pY - 210, 25, { label: 'pig' }));
            return blocks;
        }
    }
];

function init() {
    const container = document.getElementById('game-container');
    // 强制重置宽高，防止滚动条
    Game.width = window.innerWidth;
    Game.height = window.innerHeight;
    Game.bodies.anchor = { x: Game.width * 0.2, y: Game.height - 200 };

    // 1. 创建引擎
    Game.engine = Engine.create();
    Game.engine.positionIterations = 8;
    Game.engine.velocityIterations = 8;

    // 2. 创建渲染器 (关键修改：去掉 pixelRatio，使用默认分辨率以保证坐标准确)
    Game.render = Render.create({
        element: container,
        engine: Game.engine,
        options: {
            width: Game.width,
            height: Game.height,
            wireframes: false,
            background: 'transparent'
            // 注意：这里去掉了 pixelRatio，虽然画面可能没那么锐利，但能确保鼠标点哪是哪
        }
    });

    // 3. 鼠标控制 (关键修复)
    const mouse = Mouse.create(Game.render.canvas);
    
    const mouseConstraint = MouseConstraint.create(Game.engine, {
        mouse: mouse,
        constraint: {
            stiffness: 0.1, // 稍微调软一点，让手感更像皮筋
            render: { visible: false }
        }
    });

    Composite.add(Game.engine.world, mouseConstraint);
    Game.render.mouse = mouse; // 同步鼠标给渲染器

    // 4. 事件监听：这次我们先允许拖拽所有物体，用来测试鼠标是否工作！
    Events.on(mouseConstraint, 'startdrag', (e) => {
        // 如果你拖动的是鸟，我们才记录状态；
        // 但现在你可以试着拖一下箱子，看看能不能动。如果箱子能动，鸟不能动，说明是鸟的问题。
        // 如果都动不了，说明是鼠标问题。
    });

    Events.on(mouseConstraint, 'enddrag', (e) => {
        if (e.body === Game.bodies.bird) {
            fireBird();
        }
    });
    
    // 增加一个鼠标样式变化，当你指到物体时，鼠标变成小手
    Events.on(mouseConstraint, 'mousemove', function(event) {
        const mousePosition = event.mouse.position;
        const bodies = Composite.allBodies(Game.engine.world);
        const found = Matter.Query.point(bodies, mousePosition);
        document.body.style.cursor = found.length > 0 ? 'pointer' : 'default';
    });

    Events.on(Game.engine, 'collisionStart', handleCollisions);
    Events.on(Game.render, 'afterRender', renderLoop);

    Game.runner = Runner.create();
    Runner.run(Game.runner, Game.engine);
    Render.run(Game.render);

    loadLevel(0);
}

function loadLevel(idx) {
    Game.level = idx;
    const world = Game.engine.world;
    Composite.clear(world, false, true); 
    
    // 彻底清理旧物体
    const bodies = Composite.allBodies(world);
    Composite.remove(world, bodies);
    // 保留鼠标约束
    const constraints = Composite.allConstraints(world).filter(c => c.label !== 'Mouse Constraint');
    Composite.remove(world, constraints);

    if(idx === 0) {
        Game.score = 0;
        updateScore(0);
    }

    const ground = Bodies.rectangle(Game.width/2, Game.height + 20, Game.width, 100, { 
        isStatic: true, label: 'ground', friction: 1, render: { fillStyle: '#558b2f' }
    });

    // 鸟改大一点，更容易点中 (半径 20 -> 25)
    Game.bodies.bird = Bodies.circle(Game.bodies.anchor.x, Game.bodies.anchor.y, 25, { 
        label: 'bird', density: 0.004, restitution: 0.6 
    });

    Game.bodies.sling = Constraint.create({
        pointA: Game.bodies.anchor,
        bodyB: Game.bodies.bird,
        stiffness: 0.05,
        length: 1,
        damping: 0.01,
        render: { visible: false }
    });

    const levelBodies = Levels[idx].setup(Game.width, Game.height);
    Composite.add(world, [ground, Game.bodies.bird, Game.bodies.sling, ...levelBodies]);
    
    document.getElementById('modal').classList.add('hidden');
}

function fireBird() {
    const bird = Game.bodies.bird;
    const anchor = Game.bodies.anchor;
    const dist = Vector.magnitude(Vector.sub(bird.position, anchor));

    if (dist > 20) {
        setTimeout(() => {
            Composite.remove(Game.engine.world, Game.bodies.sling);
            Game.bodies.sling = null;
            setTimeout(checkWin, 3500);
        }, 20);
    }
}

function handleCollisions(event) {
    const pairs = event.pairs;
    pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        const speed = pair.collision.normalImpulse;
        [bodyA, bodyB].forEach(body => {
            if (body.label === 'pig' && speed > 3) killPig(body);
            else if ((body.label === 'wood' || body.label === 'ice') && speed > 12) {
                createParticles(body.position.x, body.position.y, body.label === 'wood' ? '#deb887' : '#a5f2f3', 5);
                Composite.remove(Game.engine.world, body);
                updateScore(50);
            }
        });
    });
}

function killPig(pigBody) {
    if(pigBody.isDead) return;
    pigBody.isDead = true;
    createParticles(pigBody.position.x, pigBody.position.y, '#76c893', 10);
    updateScore(500);
    Composite.remove(Game.engine.world, pigBody);
    checkWin();
}

function checkWin() {
    const pigs = Composite.allBodies(Game.engine.world).filter(b => b.label === 'pig');
    if (pigs.length === 0) {
        showModal('胜利!', `得分: ${Game.score}`, true);
    } else if (!Game.bodies.sling) {
        setTimeout(() => {
             const pigsStill = Composite.allBodies(Game.engine.world).filter(b => b.label === 'pig');
             if(pigsStill.length > 0) showModal('失败', `得分: ${Game.score}`, false);
             else showModal('胜利!', `得分: ${Game.score}`, true);
        }, 1500);
    }
}

function createParticles(x, y, color, count) {
    for(let i=0; i<count; i++) {
        Game.particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0, color: color
        });
    }
}

function renderLoop() {
    const ctx = Game.render.context;
    const bodies = Composite.allBodies(Game.engine.world);

    if (Game.bodies.sling && Game.bodies.bird) {
        drawTrajectory(ctx);
        drawSlingRubber(ctx);
    }

    bodies.forEach(body => {
        ctx.save();
        ctx.translate(body.position.x, body.position.y);
        ctx.rotate(body.angle);

        if (body.label === 'bird') drawBird(ctx, 25); // 注意半径传参
        else if (body.label === 'pig') drawPig(ctx);
        else if (body.label === 'wood') drawBox(ctx, body, '#DEB887', '#8B4513');
        else if (body.label === 'ice') drawBox(ctx, body, 'rgba(200,255,255,0.6)', '#fff');
        else if (body.label === 'platform') drawBox(ctx, body, '#5D4037', '#3E2723');
        // ground 已经在底层通过 matter 自带 render 绘制了，这里不重复画，或者你想覆盖也可以

        ctx.restore();
    });

    updateAndDrawParticles(ctx);
    
    if (Game.bodies.sling) drawSlingFront(ctx);
}

// 绘图函数保持一致，稍作调整
function drawBird(ctx, r) {
    let grd = ctx.createRadialGradient(-5, -5, 2, 0, 0, r);
    grd.addColorStop(0, "#ff5252"); grd.addColorStop(1, "#b71c1c");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
    
    ctx.fillStyle = "white";
    ctx.beginPath(); ctx.arc(7, -8, 6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-7, -8, 6, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "black";
    ctx.beginPath(); ctx.arc(7, -8, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(-7, -8, 2, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#ffca28";
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(10, 5); ctx.lineTo(0, 10); ctx.fill();
}

function drawPig(ctx) {
    let grd = ctx.createRadialGradient(-5, -5, 2, 0, 0, 20);
    grd.addColorStop(0, "#9ccc65"); grd.addColorStop(1, "#33691e");
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#8bc34a";
    ctx.beginPath(); ctx.ellipse(0, 4, 8, 6, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#1b5e20";
    ctx.beginPath(); ctx.arc(-3, 4, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, 4, 2, 0, Math.PI*2); ctx.fill();
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
    ctx.fillStyle = mainColor; ctx.fillRect(-w/2, -h/2, w, h);
    ctx.strokeStyle = borderColor; ctx.lineWidth = 3; ctx.strokeRect(-w/2, -h/2, w, h);
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-w/2, -h/2); ctx.lineTo(w/2, h/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w/2, -h/2); ctx.lineTo(-w/2, h/2); ctx.stroke();
}

function drawSlingRubber(ctx) {
    ctx.beginPath();
    ctx.moveTo(Game.bodies.anchor.x - 15, Game.bodies.anchor.y - 15);
    ctx.lineTo(Game.bodies.bird.position.x, Game.bodies.bird.position.y);
    ctx.lineWidth = 6; ctx.strokeStyle = '#3e2723'; ctx.stroke();
}

function drawSlingFront(ctx) {
    const anc = Game.bodies.anchor;
    ctx.fillStyle = '#795548'; ctx.fillRect(anc.x - 5, anc.y, 10, 60);
    ctx.strokeStyle = '#795548'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(anc.x, anc.y); ctx.lineTo(anc.x - 15, anc.y - 25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(anc.x, anc.y); ctx.lineTo(anc.x + 15, anc.y - 25); ctx.stroke();
    if (Game.bodies.sling && Game.bodies.bird) {
        ctx.beginPath(); ctx.moveTo(anc.x + 15, anc.y - 25);
        ctx.lineTo(Game.bodies.bird.position.x, Game.bodies.bird.position.y);
        ctx.lineWidth = 6; ctx.strokeStyle = '#3e2723'; ctx.stroke();
    }
}

function drawTrajectory(ctx) {
    const birdPos = Game.bodies.bird.position;
    const anchor = Game.bodies.anchor;
    const force = Vector.sub(anchor, birdPos);
    ctx.beginPath();
    let currX = birdPos.x; let currY = birdPos.y;
    let velocityX = force.x * 0.15; let velocityY = force.y * 0.15;
    for(let i=0; i<15; i++) {
        currX += velocityX; currY += velocityY; velocityY += 1;
        ctx.arc(currX, currY, 3, 0, Math.PI*2); ctx.closePath();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
}

function updateAndDrawParticles(ctx) {
    for(let i = Game.particles.length - 1; i >= 0; i--) {
        let p = Game.particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.5; p.life -= 0.05;
        if(p.life <= 0) { Game.particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 + p.life * 2, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

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
            nextBtn.style.display = 'none';
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

window.addEventListener('keydown', (e) => { if(e.key === 'r' || e.key === 'R') loadLevel(Game.level); });
window.addEventListener('resize', () => location.reload());

init();
