(() => {
  "use strict";

  const track = document.querySelector(".bridge-track");
  if (!track) return;
  const frame = track.querySelector(".bridge-scene");
  const hint = track.querySelector(".bridge-scroll-hint");
  const hero = document.querySelector(".hero-scene");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const connection = navigator.connection;
  const local = location.protocol === "file:";
  const { hosted, local: localSource } = document.currentScript.dataset;
  const url = new URL(hosted, document.baseURI).href;
  const lifecycle = new AbortController();
  const { signal } = lifecycle;
  const viewport = new EventTarget();
  viewport.visible = false;
  const restricted = connection?.saveData || /^(slow-2g|2g|3g)$/.test(connection?.effectiveType)
    || (connection?.downlink > 0 && connection.downlink < 1.5);
  const compact = matchMedia("(pointer: coarse), (max-width: 720px)").matches;
  const margin = restricted ? 700 : compact ? 1050 : 1450;
  let introEnded = !document.documentElement.classList.contains("ice-intro-active");
  let homepageReady = false;
  let heroSettled = false;
  let approaching = false;
  let requested = false;
  let moduleHint;
  let introTimer;
  let localAssets;
  let nearObserver;
  let visibleObserver;
  let inFlight = 0;
  let completed = 0;
  let assetStart;

  const waiting = ["carpentry.hdr", "birch-color.webp", "bench-color.webp", "birch-normal.webp",
    "birch-surface.webp", "bench-normal.webp", "bench-surface.webp"];
  const assetCount = waiting.length;
  const assets = new Map(waiting.map((name) => {
    let resolve;
    let reject;
    const body = new Promise((accept, fail) => { resolve = accept; reject = fail; });
    body.catch(() => {}); // A prefetched request may fail before the viewer starts consuming it.
    return [name, { body, resolve, reject }];
  }));

  track.classList.toggle("has-scroll-sequence", !motion.matches);
  motion.addEventListener("change", () => {
    if (!requested) track.classList.toggle("has-scroll-sequence", !motion.matches);
  }, { signal });
  hint.hidden = false;
  hint.textContent = "Loading the workshop…";

  function pumpAssets() {
    if (signal.aborted || document.hidden || (local && !localAssets) || (!introEnded && restricted)) return;
    const limit = viewport.visible ? 5 : introEnded && approaching && !restricted ? 3 : !restricted ? 2 : 1;
    while (inFlight < limit && waiting.length) {
      const name = waiting.shift();
      const job = assets.get(name);
      assetStart ??= performance.mark("bridge:assets-start").startTime;
      inFlight++;
      const source = local ? localAssets[name] : new URL("./assets/bridge-workshop/" + name, document.baseURI);
      fetch(source, { signal, priority: viewport.visible ? "auto" : "low" }).then((response) => {
        if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
        return name.endsWith(".hdr") ? response.arrayBuffer() : response.blob();
      }).then((body) => {
        job.resolve(body);
        if (++completed !== assetCount) return;
        performance.mark("bridge:assets-ready");
        performance.measure("bridge:asset-download", "bridge:assets-start", "bridge:assets-ready");
        performance.measure("bridge:navigation-to-assets", { start: 0, end: "bridge:assets-ready" });
      }, job.reject).finally(() => {
        inFlight--;
        pumpAssets();
      });
    }
  }

  function preloadModule() {
    if (moduleHint || local) return;
    const hint = document.createElement("link");
    if (!hint.relList.supports("modulepreload")) return;
    hint.rel = "modulepreload";
    hint.href = url;
    hint.fetchPriority = "low";
    moduleHint = hint;
    document.head.append(hint);
  }

  async function waitForTurn() {
    signal.throwIfAborted();
    if (viewport.visible) {
      if (globalThis.scheduler?.yield) await globalThis.scheduler.yield();
      else await new Promise((resolve) => setTimeout(resolve, 0));
    } else {
      await new Promise((resolve) => {
        if (window.requestIdleCallback) requestIdleCallback(resolve, { timeout: approaching ? 100 : 220 });
        else setTimeout(resolve, 24);
      });
    }
    if (document.hidden && !signal.aborted) {
      await new Promise((resolve) => {
        function resume() {
          if (document.hidden && !signal.aborted) return;
          document.removeEventListener("visibilitychange", resume);
          signal.removeEventListener("abort", resume);
          resolve();
        }
        document.addEventListener("visibilitychange", resume);
        signal.addEventListener("abort", resume, { once: true });
      });
    }
    signal.throwIfAborted();
  }

  function loadLocalModule() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = localSource;
      window.addEventListener("ice:bridge-local", ({ detail }) => {
        localAssets = detail.assets;
        resolve(detail);
      }, { once: true, signal });
      script.addEventListener("error", () => reject(new Error("The local bridge bundle failed to load")), { once: true });
      script.addEventListener("load", () => {
        if (!localAssets) reject(new Error("The local bridge bundle did not start"));
      }, { once: true });
      document.head.append(script);
    });
  }

  async function prepare() {
    if (requested || signal.aborted || !homepageReady || document.hidden) return;
    if ((restricted && !approaching) || (!heroSettled && !viewport.visible)) return;
    requested = true;
    pumpAssets();
    try {
      await waitForTurn();
      const start = performance.now();
      const { startBridge } = await (local ? loadLocalModule() : import(url));
      const entry = performance.getEntriesByName(url, "resource").at(-1);
      performance.measure("bridge:module-load", { start });
      if (entry) performance.measure("bridge:module-fetch", { start: entry.startTime, end: entry.responseEnd });
      pumpAssets();
      await startBridge({ viewport, lifecycle, waitForTurn, async getAsset(name) {
        const job = assets.get(name);
        const body = await job.body;
        assets.delete(name);
        return body;
      } });
    } catch (error) {
      if (signal.aborted) return;
      lifecycle.abort();
      track.classList.remove("has-scroll-sequence");
      hint.textContent = "The workshop could not load. Reload to try again.";
      console.warn("The bridge workshop could not load.", error);
    }
  }

  function approach() {
    if (!approaching) {
      approaching = true;
      nearObserver?.disconnect();
    }
    prepare();
  }

  function setVisibility(visible, time) {
    if (viewport.visible === visible) return;
    viewport.visible = visible;
    if (visible) {
      if (!performance.getEntriesByName("bridge:entered").length) performance.mark("bridge:entered", { startTime: time });
      approach();
      if (introEnded) pumpAssets();
    }
    viewport.dispatchEvent(new Event("change"));
  }

  if ("IntersectionObserver" in window) {
    nearObserver = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) approach(); }, { rootMargin: `${margin}px 0px` });
    visibleObserver = new IntersectionObserver(([entry]) => setVisibility(entry.isIntersecting, entry.time));
    nearObserver.observe(frame);
    visibleObserver.observe(frame);
  } else {
    let check;
    const scheduleCheck = () => {
      if (check) return;
      check = requestAnimationFrame(() => {
        check = 0;
        const { top, bottom } = frame.getBoundingClientRect();
        if (top < innerHeight + margin && bottom > -margin) approach();
        setVisibility(top < innerHeight && bottom > 0, performance.now());
      });
    };
    window.addEventListener("scroll", scheduleCheck, { passive: true, signal });
    window.addEventListener("resize", scheduleCheck, { signal });
    signal.addEventListener("abort", () => cancelAnimationFrame(check), { once: true });
    scheduleCheck();
  }

  const heroReady = hero.decode?.().then(() => performance.mark("ice:hero-decoded"), () => {}) ?? Promise.resolve();
  heroReady.then(() => {
    heroSettled = true;
    prepare();
  });
  function finishIntro() {
    introEnded = true;
    clearTimeout(introTimer);
    requestAnimationFrame(() => {
      homepageReady = true;
      performance.mark("ice:homepage-ready");
      if (performance.getEntriesByName("ice:intro-end").length) {
        performance.measure("ice:intro-to-homepage", "ice:intro-end", "ice:homepage-ready");
      }
      // Let the homepage paint and handle input before launching renderer work.
      requestAnimationFrame(() => { if (!signal.aborted) prepare(); });
    });
  }

  document.addEventListener("ice:intro-start", () => {
    if (restricted || local) return;
    introTimer = setTimeout(async () => {
      await heroReady;
      if (introEnded || document.hidden || signal.aborted) return;
      preloadModule();
      pumpAssets();
    }, 1550);
  }, { once: true, signal });
  document.addEventListener("ice:intro-end", finishIntro, { once: true, signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (requested) pumpAssets();
    else prepare();
  }, { signal });
  window.addEventListener("pagehide", (event) => { if (!event.persisted) lifecycle.abort(); }, { signal });
  signal.addEventListener("abort", () => {
    clearTimeout(introTimer);
    nearObserver?.disconnect();
    visibleObserver?.disconnect();
    assets.forEach(({ reject }) => reject(signal.reason));
    assets.clear();
  }, { once: true });
  if (introEnded) finishIntro();
})();
