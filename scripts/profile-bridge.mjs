import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const args = process.argv.slice(2);
const setting = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const chrome = process.env.CHROME_PATH ?? (process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "google-chrome");
const root = resolve(setting("root", "."));
const base = setting("base", "/");
const mobile = args.includes("--mobile");
const slow = args.includes("--slow");
const rapid = args.includes("--rapid");
const noWebGL = args.includes("--no-webgl");
const verify = args.includes("--verify");
const captures = setting("captures");
const failAsset = setting("fail-asset");
const observe = Number(setting("observe-ms", 0));
const mime = new Map([
  [".html", "text/html"], [".css", "text/css"], [".js", "text/javascript"],
  [".webp", "image/webp"], [".svg", "image/svg+xml"], [".jpeg", "image/jpeg"], [".woff2", "font/woff2"],
]);

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const path = resolve(root, pathname.slice(base.length) || "index.html");
  try {
    if (!pathname.startsWith(base) || !path.startsWith(root + sep) || (failAsset && pathname.endsWith("/" + failAsset))) {
      throw new Error("Unavailable path");
    }
    let body = await readFile(path);
    if (extname(path) === ".html" && args.includes("--no-intro")) {
      body = Buffer.from(body.toString().replace('data-ice-intro="on"', 'data-ice-intro="off"'));
    }
    response.writeHead(200, {
      "Content-Type": mime.get(extname(path)) ?? "application/octet-stream",
      "Cache-Control": extname(path) === ".html" ? "no-cache" : "public, max-age=600",
      "Content-Length": body.length,
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));

const profile = await mkdtemp(join(tmpdir(), "ice-profile-"));
const browserFlags = ["--headless", "--no-first-run", "--disable-background-networking", "--remote-debugging-port=0",
  `--user-data-dir=${profile}`, "about:blank"];
if (args.includes("--software")) browserFlags.unshift("--use-angle=swiftshader", "--enable-unsafe-swiftshader");
if (args.includes("--d3d11")) browserFlags.unshift("--enable-gpu", "--use-angle=d3d11");
if (args.includes("--no-sandbox")) browserFlags.unshift("--no-sandbox");
if (noWebGL) browserFlags.unshift("--disable-webgl");
const browser = spawn(chrome, browserFlags, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
let socket;
try {
  const endpoint = await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome's debugger did not start")), 10000);
    browser.on("exit", () => reject(new Error("Chrome exited before the profile completed")));
    browser.on("error", reject);
    browser.stderr.on("data", (data) => {
      const url = String(data).match(/DevTools listening on (ws:\/\/[^/]+)/)?.[1];
      if (url) {
        clearTimeout(timer);
        done(url.replace("ws:", "http:"));
      }
    });
  });
  const [target] = (await (await fetch(endpoint + "/json/list")).json()).filter(({ type }) => type === "page");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const messages = [];
  socket.addEventListener("message", ({ data }) => {
    const event = JSON.parse(data);
    if (event.id) {
      const { done, reject } = pending.get(event.id);
      pending.delete(event.id);
      if (event.error) reject(new Error(event.error.message));
      else done(event.result);
    }
    if (event.method === "Runtime.exceptionThrown") {
      messages.push(event.params.exceptionDetails.exception?.description ?? event.params.exceptionDetails.text);
    }
    if (event.method === "Runtime.consoleAPICalled" && ["warning", "error"].includes(event.params.type)) {
      messages.push(event.params.args.map(({ value, description }) => value ?? description).join(" "));
    }
  });
  const send = (method, params = {}) => new Promise((done, reject) => {
    pending.set(++id, { done, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const run = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description);
    return result.result.value;
  };
  async function chromeMetric(name) {
    const { metrics } = await send("Performance.getMetrics");
    return metrics.find((entry) => entry.name === name)?.value;
  }
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Performance.enable");
  await send("Emulation.setDeviceMetricsOverride", mobile
    ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
    : { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  if (slow) {
    await send("Network.emulateNetworkConditions", {
      offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750, connectionType: "cellular3g",
    });
    await send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    if (${args.includes("--save-data")} && navigator.connection) {
      Object.defineProperty(navigator.connection, 'saveData', { value: true });
    }
    window.profile = { lcp: null, shifts: [], tasks: [], frames: 0, first: null, enter: null, intro: {}, metrics: {} };
    const data = window.profile;
    for (const type of ['largest-contentful-paint','layout-shift','longtask','measure','mark']) {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (type === 'largest-contentful-paint') data.lcp = { ms: entry.startTime, element: entry.element?.className, url: entry.url };
          if (type === 'layout-shift' && !entry.hadRecentInput) {
            data.shifts.push([entry.startTime, entry.value, entry.sources.map(({ node }) => node?.id || node?.className || node?.nodeName)]);
          }
          if (type === 'longtask') data.tasks.push([Math.round(entry.startTime), Math.round(entry.duration)]);
          if (type === 'measure' || type === 'mark') data.metrics[entry.name] = Math.round(type === 'mark' ? entry.startTime : entry.duration);
        }
      }).observe({ type, buffered: true });
    }
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...args) {
      const gl = getContext.apply(this, args);
      if (gl && this.id === 'bridge-canvas' && args[0] === 'webgl2' && !gl.profiled) {
        gl.profiled = true;
        window.profileGL = gl;
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        data.renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        let calls = 0, triangles = 0;
        for (const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
          const draw = gl[name];
          gl[name] = function (...params) {
            calls++;
            if (params[0] === gl.TRIANGLES) {
              const count = name.includes('Elements') ? params[1] : params[2];
              const instances = name === 'drawElementsInstanced' ? params[4] : name === 'drawArraysInstanced' ? params[3] : 1;
              triangles += count * instances / 3;
            }
            return draw.apply(gl, params);
          };
        }
        const clear = gl.clear;
        let last = -1;
        gl.clear = function (...params) {
          if (gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) === null) {
            const time = document.timeline.currentTime;
            if (time !== last) {
              last = time;
              requestAnimationFrame(() => { data.gpu = { calls, triangles: Math.round(triangles) }; calls = triangles = 0; });
              if (!this.canvas.hidden) data.frames++;
            }
          }
          return clear.apply(gl, params);
        };
      }
      return gl;
    };
    document.addEventListener('DOMContentLoaded', () => {
      const overlay = document.querySelector('#ice-intro');
      const canvas = document.querySelector('#bridge-canvas');
      new MutationObserver(() => {
        if (!overlay.hidden && data.intro.start == null) data.intro.start = performance.now();
      }).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
      new MutationObserver(() => {
        if (!document.documentElement.classList.contains('ice-intro-active') && data.intro.reveal == null) data.intro.reveal = performance.now();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      new MutationObserver(() => {
        if (!canvas.hidden && data.first == null) requestAnimationFrame(() => { data.first ??= performance.now(); });
      }).observe(canvas, { attributes: true, attributeFilter: ['hidden'] });
      new IntersectionObserver(([entry], observer) => {
        if (!entry.isIntersecting) return;
        data.enter = entry.time;
        observer.disconnect();
      }).observe(canvas.closest('.bridge-scene'));
    });
  ` });

  async function capture(name) {
    if (!captures) return;
    await mkdir(captures, { recursive: true });
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(captures, name + ".png"), Buffer.from(data, "base64"));
  }

  async function seek(progress) {
    await run(`(() => {
      const track = document.querySelector('.bridge-track');
      const panel = document.querySelector('.bridge-scene');
      scrollTo({ top: scrollY + track.getBoundingClientRect().top + (track.offsetHeight - panel.offsetHeight) * ${progress}, behavior: 'instant' });
    })()`);
    for (let attempt = 0; attempt < 32; attempt++) {
      const ready = await run(`Math.abs(Number(document.querySelector('.bridge-debug')?.dataset.progress) - ${progress}) < .002`);
      if (ready) return run("({ ...document.querySelector('.bridge-debug').dataset })");
      await delay(125);
    }
    return null;
  }

  async function visit(cache) {
    messages.length = 0;
    if (cache === "cold") await send("Network.clearBrowserCache");
    const url = args.includes("--file") ? new URL("file:///" + join(root, "index.html").replaceAll("\\", "/")).href
      : `http://127.0.0.1:${server.address().port}${base}`;
    await send("Page.navigate", { url: url + "?intro=1" + (verify || captures ? "&bridgeDebug=1" : "") });
    if (observe) {
      await delay(observe);
      const state = await run(`({ lcp: profile.lcp, metrics: profile.metrics, saveData: navigator.connection?.saveData,
        resources: performance.getEntriesByType('resource').map(({ name }) => new URL(name).pathname),
        canvasHidden: document.querySelector('#bridge-canvas')?.hidden })`);
      console.log(JSON.stringify({ cache, ...state, messages }, null, 2));
      return;
    }
    await delay(Number(setting("enter-ms", rapid ? 1250 : 6300)));
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await run("Boolean(document.querySelector('.hero-model'))")) break;
      await delay(100);
    }
    if (rapid) await run("document.querySelector('.intro-skip')?.click()");
    if (captures && !rapid) await capture(cache + "-homepage");
    await run("document.querySelector('.bridge-track').scrollIntoView({ behavior: 'instant' })");
    for (let attempt = 0; attempt < 180; attempt++) {
      if (await run("profile.first !== null || /WebGL|could not|interrupted/.test(document.querySelector('.bridge-scroll-hint').textContent)")) break;
      await delay(100);
    }
    const walkthrough = await run(`new Promise((done) => {
      const track = document.querySelector('.bridge-track');
      const scene = document.querySelector('.bridge-scene');
      const top = scrollY + track.getBoundingClientRect().top;
      const travel = track.offsetHeight - scene.offsetHeight;
      const start = performance.now(), frames = profile.frames;
      function step(now) {
        const progress = Math.min((now - start) / 2800, 1);
        scrollTo({ top: top + Math.round(travel * progress * 0.95), behavior: 'instant' });
        if (progress < 1) requestAnimationFrame(step);
        else done({ frames: profile.frames - frames, ms: now - start });
      }
      requestAnimationFrame(step);
    })`);
    await delay(600);
    const start = await run("profile.frames");
    const cpuStart = await chromeMetric("TaskDuration");
    await delay(750);
    const idleCpuMs = ((await chromeMetric("TaskDuration")) - cpuStart) * 1000;
    const end = await run("profile.frames");
    const rest = await run(`(() => {
      const data = profile;
      const details = document.querySelector('.bridge-debug')?.dataset;
      let cls = 0, session = 0, start = 0, last = 0;
      for (const [time, value] of data.shifts) {
        if (time - last >= 1000 || time - start >= 5000) { session = 0; start = time; }
        session += value; last = time; cls = Math.max(cls, session);
      }
      const resources = performance.getEntriesByType('resource');
      const totals = [...resources, ...performance.getEntriesByType('navigation')];
      const sum = (key) => totals.reduce((bytes, entry) => bytes + entry[key], 0);
      return { ...data, cls, delay: data.first == null ? null : Math.max(0, data.first - data.enter),
        transfer: sum('transferSize'), decoded: sum('decodedBodySize'),
        details: details ? { ...details } : null,
        resources: resources.map(entry => [new URL(entry.name).pathname.split('/').at(-1), Math.round(entry.startTime), Math.round(entry.responseEnd), entry.transferSize, entry.decodedBodySize]),
        registrationLinks: [...document.querySelectorAll('a[href*="forms.gle"]')].map(link => link.getAttribute('href')) };
    })()`);
    const heap = await chromeMetric("JSHeapUsedSize");
    const checks = {};
    if ((verify || captures) && rest.first !== null) {
      checks.complete = await seek(1);
      await capture(cache + "-bridge-complete");
      checks.reverse = await seek(0.44);
      await capture(cache + "-bridge-reverse");
    }
    await run("scrollTo({ top: 0, behavior: 'instant' })");
    await delay(350);
    const offscreen = await run("profile.frames");
    await delay(550);
    const offscreenFrames = await run("profile.frames") - offscreen;
    if (verify) {
      checks.programmeDialog = await run(`(() => {
        document.querySelector('[data-module="workshop"]').click();
        const dialog = document.querySelector('#module-dialog');
        const opened = dialog.open && document.querySelector('#dialog-title').textContent === 'Technical Workshop';
        dialog.querySelector('.dialog-close').click();
        return opened && !dialog.open;
      })()`);
      if (mobile) checks.mobileNavigation = await run(`(() => {
        const menu = document.querySelector('.mobile-nav');
        menu.open = true;
        menu.querySelector('a').click();
        return !menu.open;
      })()`);
      if (rest.first !== null) {
        checks.reentry = await seek(0.75);
        const other = await send("Target.createTarget", { url: "about:blank" });
        await send("Target.activateTarget", { targetId: other.targetId });
        await delay(500);
        checks.inactiveTab = await run(`({ state: document.visibilityState, frames: profile.frames })`);
        await delay(700);
        checks.inactiveTab.framesDrawn = await run("profile.frames") - checks.inactiveTab.frames;
        delete checks.inactiveTab.frames;
        await send("Target.closeTarget", { targetId: other.targetId });
        checks.contextLossSupported = await run(`(() => {
          const extension = profileGL.getExtension('WEBGL_lose_context');
          extension?.loseContext();
          return Boolean(extension);
        })()`);
        await delay(400);
      }
      checks.fallback = await run(`({
        canvasHidden: document.querySelector('#bridge-canvas').hidden,
        previewVisible: getComputedStyle(document.querySelector('#bridge-preview')).opacity === '1' && !document.querySelector('#bridge-preview').hidden,
        hint: document.querySelector('.bridge-scroll-hint').textContent
      })`);
    }
    console.log(JSON.stringify({ cache, mobile, slow, rapid, ...rest, idleFrames: end - start, offscreenFrames,
      idleCpuMs, scrollFPS: Math.round(walkthrough.frames * 1000 / walkthrough.ms), jsHeapUsed: heap, checks, messages }, null, 2));
  }

  await visit("cold");
  if (args.includes("--warm")) await visit("warm");
} finally {
  socket?.close();
  browser.kill();
  server.close();
}
