/**
 * 人类行为模拟模块
 *
 * 通过 CDP Input 事件模拟真人操作：
 * - 贝塞尔曲线鼠标轨迹（速度曲线 + Perlin 噪声时序）
 * - 随机滚动（变速度）
 * - 逐字输入 + 打字节奏
 * - 操作间随机停顿
 *
 * 用法:
 *   import { moveMouse, clickHuman, typeHuman } from './human-behavior.mjs';
 *   await moveMouse(send, 100, 100, 500, 300);
 *   await clickHuman(send, 500, 300);
 *   await typeHuman(send, 'input[name="q"]', 'search text');
 */

// Perlin noise approximation for timing variation
function perlinNoise(t) {
  const x = Math.sin(t * 12.9898 + t * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

// Cubic bezier point
function bezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

// Velocity profile: slow start, fast middle, slow end (ease in-out)
function velocityProfile(t) {
  // Smoothstep: 3t^2 - 2t^3
  return t * t * (3 - 2 * t);
}

/**
 * 模拟真人鼠标移动（贝塞尔曲线 + 速度曲线）
 */
export async function moveMouse(send, startX, startY, endX, endY) {
  // Random control points for bezier curve
  const cp1x = startX + (endX - startX) * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * 100;
  const cp1y = startY + (endY - startY) * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * 80;
  const cp2x = startX + (endX - startX) * (0.5 + Math.random() * 0.3) + (Math.random() - 0.5) * 100;
  const cp2y = startY + (endY - startY) * (0.5 + Math.random() * 0.3) + (Math.random() - 0.5) * 80;

  const steps = 8 + Math.floor(Math.random() * 8); // 8-15 intermediate points
  let prevX = startX, prevY = startY;

  // Move to start position
  await send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: Math.round(startX), y: Math.round(startY)
  });

  for (let i = 1; i <= steps; i++) {
    const rawT = i / steps;
    const t = velocityProfile(rawT);

    let x = bezierPoint(t, startX, cp1x, cp2x, endX);
    let y = bezierPoint(t, startY, cp1y, cp2y, endY);

    // Add micro-tremor (1-3px jitter)
    x += (Math.random() - 0.5) * 3;
    y += (Math.random() - 0.5) * 3;

    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: Math.round(x), y: Math.round(y)
    });

    // Perlin noise timing: varies delay per step
    const baseDelay = 15 + Math.random() * 20;
    const noise = perlinNoise(i * 0.5 + Date.now() * 0.001) * 10;
    const delay = Math.max(5, baseDelay + noise);
    await new Promise(r => setTimeout(r, delay));

    prevX = x;
    prevY = y;
  }
}

/**
 * 模拟真人点击（先移动，停顿，再点击）
 */
export async function clickHuman(send, x, y) {
  // Get current mouse position (approximate from center of viewport)
  const startX = 960 + (Math.random() - 0.5) * 200;
  const startY = 540 + (Math.random() - 0.5) * 200;

  await moveMouse(send, startX, startY, x, y);

  // Pause before clicking (50-150ms, like a real person)
  await new Promise(r => setTimeout(r, 50 + Math.random() * 100));

  await send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1
  });

  // Release after short delay
  await new Promise(r => setTimeout(r, 30 + Math.random() * 50));

  await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1
  });
}

/**
 * 模拟随机滚动
 */
export async function scrollRandom(send, amount) {
  const totalScroll = amount || (200 + Math.random() * 400);
  const steps = 3 + Math.floor(Math.random() * 4);
  let scrolled = 0;

  for (let i = 0; i < steps; i++) {
    const chunk = totalScroll / steps * (0.5 + Math.random());
    scrolled += chunk;
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 960, y: 540,
      deltaX: 0,
      deltaY: Math.round(chunk)
    });
    // Variable delay between scroll steps
    await new Promise(r => setTimeout(r, 50 + Math.random() * 150));
  }
}

/**
 * 模拟真人逐字输入（打字节奏 + 偶尔停顿）
 */
export async function typeHuman(send, selector, text, baseDelay = 60) {
  // Focus the element first
  await send('Runtime.evaluate', {
    expression: `(function(){
      var el = document.querySelector('${selector}');
      if(!el) return 'NOT_FOUND';
      el.focus();
      el.value = '';
      el.dispatchEvent(new Event('focus', {bubbles:true}));
      return 'OK';
    })()`,
    returnByValue: true,
  });

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const escaped = char.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    // Dispatch CDP key event (for anti-spam detection)
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
      key: char,
      code: `Key${char.toUpperCase()}`,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: char,
      code: `Key${char.toUpperCase()}`,
    });

    // Also update DOM value
    await send('Runtime.evaluate', {
      expression: `(function(){
        var el = document.querySelector('${selector}');
        if(!el) return;
        el.value += '${escaped}';
        el.dispatchEvent(new Event('input', {bubbles:true}));
      })()`,
    });

    // Typing rhythm: base delay + Perlin noise + occasional "thinking" pause
    let delay = baseDelay + Math.random() * 40;
    const noise = perlinNoise(i * 0.3 + Date.now() * 0.001);
    delay += noise * 25;

    // 10% chance of a longer pause (simulating thinking/reading)
    if (Math.random() < 0.1) {
      delay += 150 + Math.random() * 250;
    }

    await new Promise(r => setTimeout(r, Math.max(20, delay)));
  }

  // Dispatch change event after all input
  await send('Runtime.evaluate', {
    expression: `(function(){
      var el = document.querySelector('${selector}');
      if(el) el.dispatchEvent(new Event('change', {bubbles:true}));
    })()`,
  });

  return 'OK';
}

/**
 * 操作间随机停顿
 */
export async function randomPause(minMs = 500, maxMs = 3000) {
  const delay = minMs + Math.random() * (maxMs - minMs);
  await new Promise(r => setTimeout(r, delay));
}
