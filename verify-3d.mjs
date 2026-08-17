import { writeFileSync } from "node:fs";

const baseUrl = "http://127.0.0.1:3000/jelly-3d";
const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const pageTarget =
  targets.find((target) => target.url.startsWith("http://127.0.0.1:3000")) ??
  targets.find((target) => target.type === "page");

if (!pageTarget?.webSocketDebuggerUrl) {
  throw new Error("Chrome DevTools page target was not found.");
}

const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
const pending = new Map();
const issues = [];
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
    issues.push(`${message.params.type}: ${message.params.args.map((arg) => arg.value ?? arg.description).join(" ")}`);
  }

  if (message.method === "Log.entryAdded" && ["error", "warning"].includes(message.params.entry.level)) {
    issues.push(`${message.params.entry.level}: ${message.params.entry.text}`);
  }
});

async function waitForCanvas() {
  for (let attempt = 0; attempt < 28; attempt += 1) {
    const result = await send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => {
        const canvas = document.querySelector('.jelly-3d-canvas canvas');
        const tabs = [...document.querySelectorAll('.jelly-3d-tabs a')].map((item) => item.textContent);
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          tabs,
          bodyWidth: document.body.scrollWidth,
          viewportWidth: window.innerWidth,
          pixels: canvas.width * canvas.height
        };
      })()`
    });
    if (result.result.value?.pixels > 0) {
      return result.result.value;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("3D jelly canvas was not found.");
}

async function canvasPoint(x, y) {
  const result = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const rect = document.querySelector('.jelly-3d-canvas canvas').getBoundingClientRect();
      return {
        x: rect.left + rect.width * ${x},
        y: rect.top + rect.height * ${y}
      };
    })()`
  });
  return result.result.value;
}

async function capture(filename) {
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(
    `/Users/boss/Documents/Codex/2026-08-14/files-mentioned-by-the-user-codex/outputs/${filename}`,
    Buffer.from(shot.data, "base64")
  );
}

async function interact(filename, points) {
  const first = await canvasPoint(points[0].x, points[0].y);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: first.x, y: first.y, button: "left", buttons: 1 });
  for (const point of points.slice(1)) {
    const next = await canvasPoint(point.x, point.y);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: next.x, y: next.y, button: "left", buttons: 1 });
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await new Promise((resolve) => setTimeout(resolve, 220));
  await capture(filename);
  const last = await canvasPoint(points.at(-1).x, points.at(-1).y);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: last.x, y: last.y, button: "left", buttons: 0 });
  await new Promise((resolve) => setTimeout(resolve, 700));
}

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
await send("Page.navigate", { url: baseUrl });
const initial = await waitForCanvas();
issues.length = 0;
await new Promise((resolve) => setTimeout(resolve, 900));
await capture("world-jelly-3d-default.png");
await interact("world-jelly-3d-poke.png", [{ x: 0.5, y: 0.52 }]);
await interact("world-jelly-3d-side-poke.png", [{ x: 0.35, y: 0.54 }]);
await interact("world-jelly-3d-stretch.png", [
  { x: 0.5, y: 0.42 },
  { x: 0.5, y: 0.24 },
  { x: 0.5, y: 0.16 }
]);
await interact("world-jelly-3d-squish.png", [
  { x: 0.5, y: 0.34 },
  { x: 0.5, y: 0.55 },
  { x: 0.5, y: 0.7 }
]);

const interactionResult = await send("Runtime.evaluate", {
  awaitPromise: true,
  returnByValue: true,
  expression: `(async () => {
    const muteButton = document.querySelector('.jelly-3d-controls .icon-button:last-child');
    const wireButton = document.querySelector('.jelly-3d-controls .icon-button:first-child');
    const muteBefore = muteButton?.getAttribute('aria-label');
    muteButton?.click();
    wireButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 160));
    const muteAfter = muteButton?.getAttribute('aria-label');
    const wireAfter = wireButton?.getAttribute('aria-label');
    wireButton?.click();
    return { muteBefore, muteAfter, wireAfter };
  })()`
});

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
await send("Page.navigate", { url: baseUrl });
const mobile = await waitForCanvas();
await new Promise((resolve) => setTimeout(resolve, 1000));
await capture("world-jelly-3d-mobile.png");

ws.close();

console.log(
  JSON.stringify(
    {
      route: baseUrl,
      initial,
      mobile,
      interaction: interactionResult.result.value,
      consoleIssues: issues,
      screenshots: [
        "outputs/world-jelly-3d-default.png",
        "outputs/world-jelly-3d-poke.png",
        "outputs/world-jelly-3d-side-poke.png",
        "outputs/world-jelly-3d-stretch.png",
        "outputs/world-jelly-3d-squish.png",
        "outputs/world-jelly-3d-mobile.png"
      ]
    },
    null,
    2
  )
);
