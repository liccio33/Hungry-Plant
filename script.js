// ========================================
// 1. 模型路径与基本变量
// ========================================

// 对应项目里的 my_model 文件夹
const MODEL_PATH = "./my_model/";

const $ = id => document.getElementById(id);

const canvas = $("garden");
const ctx = canvas.getContext("2d");

let model;
let webcam;
let running = false;
let session = 0;

// 手势与捕蝇草状态
let gesture = "none";
let target = 1;
let opening = 1;
let score = 0;

// 防止重复捕获
let armed = false;
let cooldownUntil = 0;

// 稳定识别，减少手势闪烁
let candidate = "";
let candidateSince = 0;

// 飞虫状态
let fly = {
    x: -50,
    y: 280,
    phase: Math.random() * 6,
    speed: 80
};

let nextFlyAt = 0;
let lastTime = 0;

// ========================================
// 手部位置追踪
// ========================================

let handTracker;
let lastTrackingTime = -Infinity;

// 捕虫区域当前的位置
let headX = 450;
let headY = 295;

// 手控制的目标位置
let targetHeadX = 450;
let targetHeadY = 295;

// 限制位置，防止头部移出画面
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

async function setupHandTracking() {
    if (handTracker) return;

    const {
        HandLandmarker,
        FilesetResolver
    } = await import(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
    );

    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    handTracker = await HandLandmarker.createFromOptions(
        vision,
        {
            baseOptions: {
                modelAssetPath:
                    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
            },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
        }
    );
}

function updateHandPosition() {
    if (!handTracker) return;

    const now = performance.now();

    // 不必每帧追踪，减少计算负担
    if (now - lastTrackingTime < 80) return;

    lastTrackingTime = now;

    const result = handTracker.detectForVideo(
        webcam.canvas,
        now
    );

    if (!result.landmarks.length) {
        // 手移出画面后，停留在最后的位置
        return;
    }

    const points = result.landmarks[0];

    // 用手腕和四个手指根部求平均，代表手掌中心
    // 比追踪指尖更适合张手、握拳的切换
    const palmIndices = [0, 5, 9, 13, 17];

    let palmX = 0;
    let palmY = 0;

    palmIndices.forEach(index => {
        palmX += points[index].x;
        palmY += points[index].y;
    });

    palmX /= palmIndices.length;
    palmY /= palmIndices.length;

    // webcam.canvas 已经镜像过，不需要再次反转 X
    // 将摄像头坐标映射到植物可移动的范围
    const normalizedX = clamp((palmX - 0.15) / 0.7, 0, 1);
    const normalizedY = clamp((palmY - 0.15) / 0.7, 0, 1);

    targetHeadX = 230 + normalizedX * 440;
    targetHeadY = 190 + normalizedY * 220;
}
// ========================================
// 2. 手势与捕虫逻辑
// ========================================

function feedback(text) {
    $("feedback").textContent = text;
}

function applyGesture(next) {
    // 持续保持相同手势，不重复触发
    if (next === gesture) return;

    gesture = next;

    if (next === "open") {
        target = 1;
        armed = true;

        feedback(
            "Trap open. Wait for the insect to enter the circle."
        );

    } else if (next === "closed") {
        target = 0;

        if (armed && performance.now() >= cooldownUntil) {
            armed = false;
            cooldownUntil = performance.now() + 1000;

            // 虫子与捕捉区域中心的距离
            const distance = Math.hypot(
            fly.x - headX,
            fly.y - headY
            );

            if (opening > 0.65 && distance < 78) {
                score++;
                $("score").textContent = score;

                // 捕获后暂时隐藏虫子
                fly.x = -1000;
                nextFlyAt = performance.now() + 1800;

                feedback(
                    "Caught! Open your hand to prepare the next trap."
                );

            } else {
                feedback(
                    "Missed! Open your hand and try a little later."
                );
            }

        } else {
            feedback(
                "Open your hand to prepare another snap."
            );
        }

    } else {
        // 没有手时保留当前形态，但取消捕捉准备
        armed = false;

        feedback(
            "Resting. Show an open hand when you are ready."
        );
    }
}


// ========================================
// 3. 不使用摄像头的试玩按钮
// ========================================

document.querySelectorAll("[data-gesture]").forEach(button => {
    button.onclick = () => {
        if (!running) {
            applyGesture(button.dataset.gesture);
        }
    };
});

function demoEnabled(enabled) {
    document.querySelectorAll("[data-gesture]").forEach(button => {
        button.disabled = !enabled;
    });
}


// ========================================
// 4. 启动与停止摄像头
// ========================================

function stopCamera(message = "Camera is off · demo mode") {
    running = false;
    session++;

    if (webcam) {
        webcam.stop();
    }

    $("webcam-container").replaceChildren();
    $("label-container").replaceChildren();

    $("start").disabled = false;
    $("stop").disabled = true;

    demoEnabled(true);
    applyGesture("none");

    $("status").textContent = message;
}

$("stop").onclick = () => {
    stopCamera();
};

$("start").onclick = async () => {
    const token = ++session;

    $("start").disabled = true;
    demoEnabled(false);

    $("status").textContent =
        "Loading model and requesting camera…";

    try {
        if (!window.tmImage) {
            throw new Error(
                "Libraries did not load. Check your internet connection."
            );
        }

        model = model || await tmImage.load(
            MODEL_PATH + "model.json",
            MODEL_PATH + "metadata.json"
        );


        $("status").textContent = "Loading hand tracking…";

        await setupHandTracking();

        lastTrackingTime = -Infinity;


        webcam = new tmImage.Webcam(224, 224, true);

        await webcam.setup();
        await webcam.play();

        if (token !== session) {
            webcam.stop();
            return;
        }

        $("webcam-container").replaceChildren(webcam.canvas);

        const labelElements = model.getClassLabels().map(() => {
            return document.createElement("div");
        });

        $("label-container").replaceChildren(...labelElements);

        running = true;
        candidate = "";

        applyGesture("none");

        $("stop").disabled = false;
        $("status").textContent =
            "Camera on · show an open hand";

        predictLoop(token);

    } catch (error) {
        stopCamera(
            "Could not start: " + error.message
        );
    }
};


// ========================================
// 5. 持续识别手势
// ========================================

async function predictLoop(token) {
    if (!running || token !== session) return;

    try {
        webcam.update();

        updateHandPosition();

        const predictions = await model.predict(webcam.canvas);

        if (!running || token !== session) return;

        predictions.forEach((prediction, index) => {
            $("label-container").children[index].textContent =
                prediction.className +
                ": " +
                Math.round(prediction.probability * 100) +
                "%";
        });

        const best = predictions.reduce((a, b) => {
            return a.probability > b.probability ? a : b;
        });

        // 置信度达到 75% 才采用该类别
        const next = best.probability >= 0.75
            ? best.className.toLowerCase()
            : "none";

        if (next !== candidate) {
            candidate = next;
            candidateSince = performance.now();
        }

        // 手势稳定 180 毫秒后才触发
        if (performance.now() - candidateSince >= 100) {
            applyGesture(next);
        }

        $("status").textContent =
            "Detected: " +
            gesture +
            (best.probability < 0.75 ? " · uncertain / idle" : "");

        requestAnimationFrame(() => predictLoop(token));

    } catch (error) {
        stopCamera(
            "Prediction stopped: " + error.message
        );
    }
}

window.addEventListener("pagehide", () => {
    if (webcam) {
        webcam.stop();
    }
});


// ========================================
// 6. 基础绘图：椭圆
// ========================================

function ellipse(x, y, rx, ry, color, rotation = 0) {
    ctx.beginPath();

    ctx.ellipse(
        x,
        y,
        rx,
        ry,
        rotation,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = color;
    ctx.fill();
}





// ========================================
// 8. 绘制一半捕虫叶
// side: 左右方向
// openness: 张开程度，0 为闭合，1 为展开
// ========================================

function lobe(side, openness) {
    ctx.save();
    ctx.scale(side, 1);

    const width = 19 + openness * 108;
    const height = 108;

    // 粉紫色叶心过渡到黄绿色边缘
    const gradient = ctx.createRadialGradient(
        width * 0.24,
        -48,
        4,
        width * 0.32,
        -48,
        width * 0.8
    );

    gradient.addColorStop(0, "#d84d95");
    gradient.addColorStop(0.28, "#d96aa7");
    gradient.addColorStop(0.54, "#e3a6bf");
    gradient.addColorStop(0.72, "#dce5a1");
    gradient.addColorStop(0.86, "#a9c653");
    gradient.addColorStop(1, "#527b31");

    // 捕虫叶轮廓
    ctx.beginPath();
    ctx.moveTo(0, 32);

// 下半边：向内收，侧面更直
ctx.bezierCurveTo(
    width * 0.60,
    25,
    width * 0.72,
    -22,
    width * 0.72,
    -66
);

// 上半边：保持圆润的顶部
ctx.bezierCurveTo(
    width * 0.72,
    -110,
    width * 0.36,
    -133,
    0,
    -height
);

    ctx.bezierCurveTo(
        -5,
        -58,
        -4,
        0,
        0,
        32
    );

// ========================================
// 沿嘴巴轮廓形成颜色过渡
// 使用现有 mouthEdge()，与嘴巴形状保持一致
// ========================================

// 制作与嘴巴一致的形状
const colorShape = new Path2D();

colorShape.moveTo(0, 32);

for (let i = 1; i <= 120; i++) {
    const point = mouthEdge(i / 120);
    colorShape.lineTo(point.x, point.y);
}

// 与原来嘴巴内侧的曲线一致
colorShape.bezierCurveTo(
    -5, -58,
    -4, 0,
    0, 32
);

colorShape.closePath();

// 从外缘到叶心的颜色
const colors = [
    [89, 130, 55],    // 外缘：草绿色
    [166, 199, 99],   // 嫩绿
    [221, 232, 169],  // 奶油黄绿
    [243, 204, 215],  // 淡粉
    [231, 153, 188],  // 柔粉
    [235, 141, 187]   // 中心：玫瑰粉
];

// 数字越大，过渡越细腻，但绘制开销也越大
const layers = 40;

// 颜色向这个位置收拢
const centerX = width * 0.28;
const centerY = -42;

ctx.save();

// 限制颜色不超出当前嘴巴轮廓
ctx.clip();

for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);

    // 外层大，内层逐渐缩小
    const size = 1 - t * 0.88;

    // 计算相邻颜色之间的过渡色
    const position = Math.pow(t, 0.5) * (colors.length - 1);
    const index = Math.min(
        Math.floor(position),
        colors.length - 2
    );

    const mix = position - index;

    const color = colors[index].map((value, channel) => {
        return Math.round(
            value +
            (colors[index + 1][channel] - value) * mix
        );
    });

    ctx.save();

    ctx.translate(centerX, centerY);
    ctx.scale(size, size);
    ctx.translate(-centerX, -centerY);

    ctx.fillStyle =
        `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

    ctx.fill(colorShape);

    ctx.restore();
}

ctx.restore();

    ctx.strokeStyle = "#72963e";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 将细节限制在叶片内部
    ctx.save();
    ctx.clip();

    // 细叶脉
    for (let i = 0; i < 10; i++) {
        const t = i / 9;

        ctx.beginPath();
        ctx.moveTo(0, 25 - t * 120);

        ctx.quadraticCurveTo(
            width * 0.42,
            -5 - t * 100,
            width * (0.68 + 0.22 * Math.sin(t * 3)),
            -5 - t * 108
        );

        ctx.strokeStyle = "rgba(131, 67, 94, 0.19)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
    }

    // 固定分布的细小斑点，避免动画时闪烁
    for (let i = 0; i < 110; i++) {
        const x = ((i * 47) % 101) / 101 * width;
        const y = -115 + ((i * 31) % 137);

        ellipse(
            x,
            y,
            0.6 + (i % 3) * 0.25,
            0.9,
            "rgba(116, 69, 85, 0.12)"
        );
    }

    ctx.restore();

    // 叶片边缘的细长尖刺
 // 计算原来嘴巴外缘上的位置
function mouthEdge(t) {
    let points;
    let u;

    if (t <= 0.5) {
        u = t * 2;

        points = [
            { x: 0, y: 32 },
            { x: width * 0.60, y: 25 },
            { x: width * 0.72, y: -22 },
            { x: width * 0.72, y: -66 }
        ];
    } else {
        u = (t - 0.5) * 2;

        points = [
            { x: width * 0.72, y: -66 },
            { x: width * 0.72, y: -110 },
            { x: width * 0.36, y: -133 },
            { x: 0, y: -height }
        ];
    }

    const v = 1 - u;

    return {
        x:
            v ** 3 * points[0].x +
            3 * v ** 2 * u * points[1].x +
            3 * v * u ** 2 * points[2].x +
            u ** 3 * points[3].x,

        y:
            v ** 3 * points[0].y +
            3 * v ** 2 * u * points[1].y +
            3 * v * u ** 2 * points[2].y +
            u ** 3 * points[3].y
    };
}

// 叶片边缘的细长尖刺
for (let i = 0; i < 12; i++) {
    const angle = -1.36 + i / 11 * 2.8;

    const x = Math.cos(angle) * width * 0.72;
    const y = -42 + Math.sin(angle) * 72;

    const length = (19 + (i % 4) * 4 + openness * 6) * 1.8;

    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;

    // 找到距离原来刺根最近的嘴巴边缘
    let closestT = 0;
    let closestDistance = Infinity;

    for (let j = 0; j <= 160; j++) {
        const t = j / 160;
        const point = mouthEdge(t);

        const distance =
            (point.x - x) ** 2 +
            (point.y - y) ** 2;

        if (distance < closestDistance) {
            closestDistance = distance;
            closestT = t;
        }
    }

    const root = mouthEdge(closestT);

    // 计算边缘方向，让刺根贴着嘴巴排列
    const before = mouthEdge(Math.max(0, closestT - 0.001));
    const after = mouthEdge(Math.min(1, closestT + 0.001));

    let tangentX = after.x - before.x;
    let tangentY = after.y - before.y;

    const tangentLength = Math.hypot(tangentX, tangentY);

    tangentX /= tangentLength;
    tangentY /= tangentLength;

    // 外侧方向
    const normalX = -tangentY;
    const normalY = tangentX;

    // 根部略微伸入嘴巴，避免出现空隙
    const overlap = 2;

    const rootX = root.x - normalX * overlap;
    const rootY = root.y - normalY * overlap;

    // 刺根宽度，保持细长
    const halfRootWidth = 5;

    ctx.beginPath();

    // 只移动根部
    ctx.moveTo(
        rootX - tangentX * halfRootWidth,
        rootY - tangentY * halfRootWidth
    );

    // 保留原来的控制点和尖端位置
    ctx.quadraticCurveTo(
        x + dx * 0.45,
        y + dy * 0.4,
        x + dx,
        y + dy - 8
    );

    ctx.quadraticCurveTo(
        x + dx * 0.3,
        y + dy * 0.2,
        rootX + tangentX * halfRootWidth,
        rootY + tangentY * halfRootWidth
    );

    ctx.closePath();

    // 保留原来的尖刺颜色
    ctx.fillStyle = i % 3 === 0
        ? "#466d32"
        : "#6b9038";

    ctx.fill();
}

    ctx.restore();
}


// ========================================
// 9. 组合左右两片捕虫叶
// ========================================

function trap(
    x,
    y,
    scale,
    angle,
    openness,
    alpha = 1
) {
    ctx.save();

    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    lobe(-1, openness);
    lobe(1, openness);

    // 中间连接线
    ctx.beginPath();
    ctx.moveTo(0, 35);
    ctx.quadraticCurveTo(-3, -35, 0, -105);

    ctx.strokeStyle = "#7f9850";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}


// ========================================
// 10. 绘制弯曲的细茎
// ========================================

function stalk(x, y, baseX, baseY, width) {
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);

    ctx.bezierCurveTo(
        baseX - 20,
        baseY - 100,
        x + 10,
        y + 90,
        x,
        y
    );

    const gradient = ctx.createLinearGradient(
        x - 5,
        0,
        x + 8,
        0
    );

    gradient.addColorStop(0, "#426d37");
    gradient.addColorStop(0.5, "#86a647");
    gradient.addColorStop(1, "#bed07a");

    ctx.strokeStyle = gradient;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.stroke();
}


// ========================================
// 11. 每一帧绘制整个场景
// ========================================

function draw(time) {
    const dt = Math.min(
        (time - lastTime) / 1000 || 0,
        0.04
    );

    lastTime = time;

    // 数字越大，头部跟随越快
    const followSpeed = 18;
    const followAmount = 1 - Math.exp(-followSpeed * dt);

    headX += (targetHeadX - headX) * followAmount;
    headY += (targetHeadY - headY) * followAmount;

    // 平滑过渡到张开或闭合状态
    opening += (target - opening) * Math.min(1, dt * 20);

    ctx.clearRect(0, 0, 900, 650);

    // 浅绿色背景
    const background = ctx.createLinearGradient(
        0,
        0,
        900,
        650
    );

    background.addColorStop(0, "#e8ecdd");
    background.addColorStop(0.6, "#dbe5d9");
    background.addColorStop(1, "#c6d8cc");

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, 900, 650);

    // 柔和的背景光
    const glow = ctx.createRadialGradient(
        440,
        220,
        30,
        440,
        220,
        360
    );

    glow.addColorStop(0, "rgba(255, 255, 239, 0.6)");
    glow.addColorStop(1, "rgba(255, 255, 239, 0)");

    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 900, 650);

    // 底部阴影
    ellipse(
        458,
        615,
        230,
        14,
        "rgba(60, 90, 56, 0.10)"
    );

    // 周围小株的位置、大小、角度与张开程度
    const plants = [
        { x: 270, y: 247, s: 0.55, a: -0.33, o: 0.75 },
        { x: 622, y: 190, s: 0.59, a: 0.24, o: 0.37 },
        { x: 690, y: 381, s: 0.43, a: 0.28, o: 0.6 },
        { x: 204, y: 438, s: 0.42, a: -0.51, o: 0.5 },
        { x: 335, y: 443, s: 0.48, a: -0.25, o: 0.7 },
        { x: 592, y: 470, s: 0.62, a: 0.3, o: 0.48 }
    ];

    plants.forEach((plant, index) => {
        const sway = Math.sin(time / 2300 + index) * 3;

        stalk(
            plant.x + sway,
            plant.y + 15,
            400 + index * 18,
            620,
            3 + plant.s * 2
        );



        trap(
            plant.x + sway,
            plant.y,
            plant.s,
            plant.a + Math.sin(time / 3000 + index) * 0.02,
            plant.o,
            0.88
        );
    });



    // 中央主株的茎与叶片
    stalk(headX, headY + 70, 451, 620, 7);



    // 中央主株：由手势控制
    trap(
        headX,
        headY + 49,
        1.14,
        -0.035,
        opening
    );

    // 捕捉范围提示
    ctx.strokeStyle = "rgba(60, 85, 49, 0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 8]);

    ctx.beginPath();
    ctx.arc(headX, headY, 78, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);

    // 飞虫
    if (time >= nextFlyAt) {
        if (fly.x < -100 || fly.x > 970) {
            fly = {
                x: -40,
                y: 295,
                phase: Math.random() * 6,
                speed: 85 + Math.random() * 40
            };
        }

        fly.x += fly.speed * dt;

        fly.y =
            295 +
            Math.sin(fly.x / 65 + fly.phase) * 40;

        // 左翅膀
        ellipse(
            fly.x - 7,
            fly.y - 9,
            10,
            5 + Math.abs(Math.sin(time / 45)) * 5,
            "rgba(255, 255, 246, 0.85)",
            -0.5
        );

        // 右翅膀
        ellipse(
            fly.x + 7,
            fly.y - 9,
            10,
            5 + Math.abs(Math.cos(time / 45)) * 5,
            "rgba(255, 255, 246, 0.85)",
            0.5
        );

        // 身体和头部
        ellipse(fly.x, fly.y, 10, 6, "#344435");
        ellipse(fly.x + 8, fly.y - 2, 4, 4, "#243027");
    }

    requestAnimationFrame(draw);
}

// 启动动画
requestAnimationFrame(draw);