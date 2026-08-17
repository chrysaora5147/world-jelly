import { writeFileSync } from "node:fs";

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const pageTarget = targets.find((target) => target.url === "http://127.0.0.1:3000/");

if (!pageTarget?.webSocketDebuggerUrl) {
  throw new Error("World Jelly tab was not found in Chrome DevTools targets.");
}

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
const pending = new Map();
const errors = [];
let id = 0;

function send(method, params = {}) {
  const messageId = ++id;
  ws.send(JSON.stringify({ id: messageId, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(messageId, { resolve, reject });
  });
}

await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
    return;
  }

  if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
    errors.push(`${message.params.type}: ${message.params.args.map((arg) => arg.value ?? arg.description).join(" ")}`);
  }

  if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params.entry.level)) {
    errors.push(`${message.params.entry.level}: ${message.params.entry.text}`);
  }
});

await send("Runtime.enable");
await send("Log.enable");
await send("Page.enable");
await send("DOM.enable");
await send("Page.bringToFront");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1200,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false
});
await send("Emulation.setTouchEmulationEnabled", { enabled: false });
await send("Page.reload", { ignoreCache: true });
let rect = null;
for (let attempt = 0; attempt < 24; attempt += 1) {
  const rectResult = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const jelly = document.querySelector('.jelly-hitbox');
      const counter = document.querySelector('.stat-block strong');
      const image = document.querySelector('.jelly-character-image');
      if (!jelly || !counter || !image?.complete || image.naturalWidth === 0) return null;
      const rect = jelly.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, counter: counter.textContent };
    })()`
  });
  rect = rectResult.result.value;
  if (rect) {
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 350));
}

if (!rect) {
  throw new Error("Could not find jelly hitbox or counter.");
}

await send("Runtime.evaluate", {
  awaitPromise: true,
  expression: `(async () => {
    const button = document.querySelector('.icon-button');
    if (button?.getAttribute('aria-label') === 'Mute sound') {
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  })()`
});
errors.length = 0;
await new Promise((resolve) => setTimeout(resolve, 500));

const desktopShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync("/Users/boss/Documents/Codex/2026-08-14/files-mentioned-by-the-user-codex/outputs/world-jelly-desktop.png", Buffer.from(desktopShot.data, "base64"));

async function captureReaction(reaction, filename) {
  await send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(() => {
      window.dispatchEvent(new CustomEvent('world-jelly:set-reaction', { detail: { reaction: '${reaction}' } }));
      return new Promise((resolve) => setTimeout(resolve, 260));
    })()`
  });
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`/Users/boss/Documents/Codex/2026-08-14/files-mentioned-by-the-user-codex/outputs/${filename}`, Buffer.from(shot.data, "base64"));
}

await captureReaction("default", "world-jelly-expression-default.png");
await captureReaction("surprised", "world-jelly-expression-surprised.png");
await captureReaction("excited", "world-jelly-expression-excited.png");
await captureReaction("squished", "world-jelly-expression-squished.png");
await captureReaction("annoyed", "world-jelly-expression-annoyed.png");
await captureReaction("dizzy", "world-jelly-expression-dizzy.png");
await captureReaction("sleepy", "world-jelly-expression-sleepy.png");
await captureReaction("blush", "world-jelly-expression-blush.png");
await captureReaction("curious", "world-jelly-expression-curious.png");

async function jellyPoint(x, y) {
  const result = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const rect = document.querySelector('.jelly-hitbox').getBoundingClientRect();
      return {
        x: rect.left + rect.width * ${x},
        y: rect.top + rect.height * ${y}
      };
    })()`
  });
  return result.result.value;
}

async function captureInteraction(filename, points) {
  const first = await jellyPoint(points[0].x, points[0].y);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: first.x, y: first.y, button: "left", buttons: 1 });
  for (const point of points.slice(1)) {
    const next = await jellyPoint(point.x, point.y);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: next.x, y: next.y, button: "left", buttons: 1 });
    await new Promise((resolve) => setTimeout(resolve, 34));
  }
  await new Promise((resolve) => setTimeout(resolve, 180));
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(`/Users/boss/Documents/Codex/2026-08-14/files-mentioned-by-the-user-codex/outputs/${filename}`, Buffer.from(shot.data, "base64"));
  const last = await jellyPoint(points.at(-1).x, points.at(-1).y);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last.x, y: last.y, button: "left", buttons: 0 });
  await new Promise((resolve) => setTimeout(resolve, 560));
}

await captureInteraction("world-jelly-center-poke.png", [{ x: 0.5, y: 0.5 }]);
await captureInteraction("world-jelly-side-poke.png", [{ x: 0.23, y: 0.54 }]);
await captureInteraction(
  "world-jelly-vertical-stretch.png",
  [
    { x: 0.5, y: 0.36 },
    { x: 0.5, y: 0.22 },
    { x: 0.5, y: 0.08 }
  ]
);
await captureInteraction(
  "world-jelly-downward-squish.png",
  [
    { x: 0.5, y: 0.3 },
    { x: 0.5, y: 0.52 },
    { x: 0.5, y: 0.72 }
  ]
);

await send("Runtime.evaluate", {
  awaitPromise: true,
  expression: `(() => {
    const jelly = document.querySelector('.jelly-hitbox');
    const rect = jelly.getBoundingClientRect();
    const fire = (type, x, y) => jelly.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: rect.left + rect.width * x,
      clientY: rect.top + rect.height * y,
      buttons: type === 'pointerup' ? 0 : 1,
      button: 0
    }));
    fire('pointerdown', 0.50, 0.50); fire('pointerup', 0.50, 0.50);
    fire('pointerdown', 0.35, 0.45); fire('pointerup', 0.35, 0.45);
    fire('pointerdown', 0.66, 0.53); fire('pointerup', 0.66, 0.53);
    fire('pointerdown', 0.50, 0.45);
    fire('pointermove', 0.94, 0.10);
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  })()`
});
const reactionShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync("/Users/boss/Documents/Codex/2026-08-14/files-mentioned-by-the-user-codex/outputs/world-jelly-reaction.png", Buffer.from(reactionShot.data, "base64"));
await send("Runtime.evaluate", {
  awaitPromise: true,
  expression: `(() => {
    const jelly = document.querySelector('.jelly-hitbox');
    const rect = jelly.getBoundingClientRect();
    const fire = (type, x, y) => jelly.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      clientX: rect.left + rect.width * x,
      clientY: rect.top + rect.height * y,
      buttons: type === 'pointerup' ? 0 : 1,
      button: 0
    }));
    fire('pointerup', 0.94, 0.10);
    for (let i = 0; i < 8; i += 1) {
      const x = i % 2 ? 0.58 : 0.42;
      const y = 0.44 + (i % 3) * 0.08;
      fire('pointerdown', x, y);
      fire('pointerup', x, y);
    }
    return new Promise((resolve) => requestAnimationFrame(resolve));
  })()`
});
await new Promise((resolve) => setTimeout(resolve, 900));

const interactionResult = await send("Runtime.evaluate", {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const counter = document.querySelector('.stat-block strong')?.textContent;
    const muteButton = document.querySelector('.icon-button');
    const muteBefore = muteButton?.getAttribute('aria-label');
    muteButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const muteAfterFirstClick = muteButton?.getAttribute('aria-label');
    muteButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const muteAfterSecondClick = muteButton?.getAttribute('aria-label');
    const modalButton = document.querySelector('.give-button');
    modalButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 120));
    return {
      counter,
      muteBefore,
      muteAfterFirstClick,
      muteAfterSecondClick,
      modalText: document.querySelector('.modal-panel h2')?.textContent,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth
    };
  })()`
});

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
await send("Page.reload", { ignoreCache: true });
await new Promise((resolve) => setTimeout(resolve, 1200));
const mobileShot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
writeFileSync("/Users/boss/Documents/Codex/2026-08-14/files-mentioned-by-the-user-codex/outputs/world-jelly-mobile.png", Buffer.from(mobileShot.data, "base64"));

ws.close();

console.log(JSON.stringify({
  initialCounter: rect.counter,
  afterInteraction: interactionResult.result.value,
  consoleIssues: errors,
  screenshots: [
    "outputs/world-jelly-desktop.png",
    "outputs/world-jelly-expression-default.png",
    "outputs/world-jelly-expression-surprised.png",
    "outputs/world-jelly-expression-excited.png",
    "outputs/world-jelly-expression-squished.png",
    "outputs/world-jelly-expression-annoyed.png",
    "outputs/world-jelly-expression-dizzy.png",
    "outputs/world-jelly-expression-sleepy.png",
    "outputs/world-jelly-expression-blush.png",
    "outputs/world-jelly-expression-curious.png",
    "outputs/world-jelly-center-poke.png",
    "outputs/world-jelly-side-poke.png",
    "outputs/world-jelly-vertical-stretch.png",
    "outputs/world-jelly-downward-squish.png",
    "outputs/world-jelly-mobile.png",
    "outputs/world-jelly-reaction.png"
  ]
}, null, 2));
