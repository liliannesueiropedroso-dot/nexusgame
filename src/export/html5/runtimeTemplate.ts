import type { Html5CompileOptions } from './portalSdks';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateIndexHtml(
  gameTitle: string,
  options: Html5CompileOptions
): string {
  let sdkHeadScript = '';
  if (options.portal === 'poki') {
    sdkHeadScript =
      '  <script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>\n';
  } else if (options.portal === 'crazygames') {
    sdkHeadScript =
      '  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n';
  } else if (options.portal === 'playgama') {
    sdkHeadScript =
      '  <script src="https://bridge.playgama.com/playgama-bridge.js"></script>\n';
  } else if (options.portal === 'custom' && options.customSdkUrl?.trim()) {
    sdkHeadScript = `  <script src="${escapeHtml(options.customSdkUrl.trim())}"></script>\n`;
  }

  const touchControlsHtml = options.touchControls
    ? `
  <div id="nx-touch-controls" aria-label="Controles táctiles">
    <div class="nx-dpad">
      <button type="button" data-key="left" aria-label="Izquierda">&#9664;</button>
      <button type="button" data-key="up" aria-label="Arriba">&#9650;</button>
      <button type="button" data-key="down" aria-label="Abajo">&#9660;</button>
      <button type="button" data-key="right" aria-label="Derecha">&#9654;</button>
    </div>
    <button type="button" class="nx-action-btn" data-key="jump" aria-label="Saltar">SALTAR</button>
  </div>`
    : '';

  const fullscreenBtnHtml = options.showFullscreenButton
    ? '<button type="button" id="nx-fs-btn" title="Pantalla completa" aria-label="Pantalla completa">[ ]</button>'
    : '';

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>${escapeHtml(gameTitle)}</title>
${sdkHeadScript}  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <div id="nx-root">
    <div id="nx-stage-wrap"></div>
    <div id="nx-hud">
      <div id="nx-score-box" class="hidden">Puntos: <span id="nx-score">0</span></div>
      <div id="nx-hud-actions">
        <button type="button" id="nx-pause-btn">Pausa</button>
        ${fullscreenBtnHtml}
      </div>
    </div>
    <div id="nx-pause-overlay" class="hidden">
      <div class="nx-modal">
        <h2>Juego en pausa</h2>
        <button type="button" id="nx-resume-btn">Continuar</button>
      </div>
    </div>
    ${touchControlsHtml}
  </div>

  <script src="js/pixi.min.js"></script>
  <script src="js/portal-sdk.js"></script>
  <script src="js/nexus-runtime.js"></script>
</body>
</html>
`;
}

export function generateGameCss(): string {
  return `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #nx-root {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: #0b0b0e;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #f4f4f5;
  touch-action: none;
  user-select: none;
}

#nx-root {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

#nx-stage-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

#nx-stage-wrap canvas {
  display: block;
}

#nx-hud {
  position: absolute;
  top: 10px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
  z-index: 10;
}

#nx-score-box {
  background: rgba(15, 23, 42, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

#nx-hud-actions {
  display: flex;
  gap: 8px;
  pointer-events: auto;
}

#nx-hud-actions button,
.nx-modal button {
  background: rgba(24, 24, 27, 0.85);
  color: #f4f4f5;
  border: 1px solid rgba(161, 161, 170, 0.35);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

#nx-hud-actions button:hover,
.nx-modal button:hover {
  background: #2563eb;
  border-color: #3b82f6;
}

#nx-pause-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}

.nx-modal {
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 10px;
  padding: 24px 32px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.nx-modal h2 {
  font-size: 16px;
}

#nx-touch-controls {
  position: absolute;
  bottom: 14px;
  left: 14px;
  right: 14px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  pointer-events: none;
  z-index: 15;
}

.nx-dpad {
  display: flex;
  gap: 6px;
  pointer-events: auto;
}

.nx-dpad button,
.nx-action-btn {
  pointer-events: auto;
  min-width: 44px;
  height: 44px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(24, 24, 27, 0.65);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.nx-action-btn {
  padding: 0 16px;
}

.hidden {
  display: none !important;
}
`;
}

export function generatePortalSdkJs(options: Html5CompileOptions): string {
  return `(function () {
  var TARGET = ${JSON.stringify(options.portal)};
  var initialized = false;
  var playing = false;
  var memStorage = {};

  function emitPortalEvent(type) {
    try {
      window.dispatchEvent(new CustomEvent('nx-portal-event', { detail: { type: type } }));
    } catch (_) {}
  }

  function storageGet(key) {
    if (Object.prototype.hasOwnProperty.call(memStorage, key)) return memStorage[key];
    try {
      var val = window.localStorage.getItem('nx_portal_' + key);
      if (val !== null) memStorage[key] = val;
      return val;
    } catch (_) {
      return null;
    }
  }

  function storageSet(key, value) {
    var str = String(value);
    memStorage[key] = str;
    try { window.localStorage.setItem('nx_portal_' + key, str); } catch (_) {}
    try {
      if (TARGET === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.data) {
        window.CrazyGames.SDK.data.setItem(key, str);
      } else if (TARGET === 'playgama' && window.bridge && window.bridge.storage) {
        window.bridge.storage.set(key, str).catch(function () {});
      }
    } catch (_) {}
  }

  function getLeaderboard(boardId) {
    var k = 'lb_' + (boardId || 'default');
    var raw = storageGet(k);
    if (!raw) {
      try { raw = window.localStorage.getItem('nx_leaderboard'); } catch (_) {}
    }
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
    } catch (_) {
      return [];
    }
  }

  function submitScore(boardId, score, playerName) {
    var k = 'lb_' + (boardId || 'default');
    var list = getLeaderboard(boardId);
    list.push({ name: String(playerName || 'Jugador'), score: Math.round(Number(score) || 0), date: Date.now() });
    list.sort(function (a, b) { return b.score - a.score; });
    list = list.slice(0, 10);
    var json = JSON.stringify(list);
    storageSet(k, json);
    try { window.localStorage.setItem('nx_leaderboard', json); } catch (_) {}
    try {
      if (TARGET === 'playgama' && window.bridge && window.bridge.leaderboards && window.bridge.leaderboards.setScore) {
        window.bridge.leaderboards.setScore({ id: boardId || 'default', score: Math.round(Number(score) || 0) }).catch(function () {});
      }
    } catch (_) {}
    return list;
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    try {
      if (TARGET === 'poki' && window.PokiSDK) {
        await window.PokiSDK.init();
      } else if (TARGET === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK) {
        await window.CrazyGames.SDK.init();
        if (window.CrazyGames.SDK.game && window.CrazyGames.SDK.game.loadingStart) {
          window.CrazyGames.SDK.game.loadingStart();
        }
      } else if (TARGET === 'playgama' && window.bridge) {
        await window.bridge.initialize();
      }
    } catch (err) {
      console.warn('[NexusPortal] SDK fallback activo:', err);
    }
  }

  function loadingFinished() {
    try {
      if (TARGET === 'poki' && window.PokiSDK && window.PokiSDK.gameLoadingFinished) {
        window.PokiSDK.gameLoadingFinished();
      } else if (TARGET === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.game) {
        window.CrazyGames.SDK.game.loadingStop();
      } else if (TARGET === 'playgama' && window.bridge && window.bridge.platform) {
        window.bridge.platform.sendMessage('game_ready');
      }
    } catch (err) {
      console.warn('[NexusPortal] loadingFinished:', err);
    }
  }

  function gameplayStart() {
    if (playing) return;
    playing = true;
    try {
      if (TARGET === 'poki' && window.PokiSDK && window.PokiSDK.gameplayStart) {
        window.PokiSDK.gameplayStart();
      } else if (TARGET === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.game) {
        window.CrazyGames.SDK.game.gameplayStart();
      }
    } catch (err) {
      console.warn('[NexusPortal] gameplayStart:', err);
    }
  }

  function gameplayStop() {
    if (!playing) return;
    playing = false;
    try {
      if (TARGET === 'poki' && window.PokiSDK && window.PokiSDK.gameplayStop) {
        window.PokiSDK.gameplayStop();
      } else if (TARGET === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.game) {
        window.CrazyGames.SDK.game.gameplayStop();
      }
    } catch (err) {
      console.warn('[NexusPortal] gameplayStop:', err);
    }
  }

  async function showAd() {
    gameplayStop();
    try {
      if (TARGET === 'poki' && window.PokiSDK && window.PokiSDK.commercialBreak) {
        await window.PokiSDK.commercialBreak();
      } else if (TARGET === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.ad) {
        await window.CrazyGames.SDK.ad.requestAd('midgame');
      } else if (TARGET === 'playgama' && window.bridge && window.bridge.advertisement) {
        await window.bridge.advertisement.showInterstitial();
      }
    } catch (err) {
      console.warn('[NexusPortal] showAd:', err);
    }
    emitPortalEvent('adClosed');
    gameplayStart();
  }

  async function showRewarded() {
    gameplayStop();
    var rewarded = false;
    try {
      if (TARGET === 'poki' && window.PokiSDK && window.PokiSDK.rewardedBreak) {
        rewarded = Boolean(await window.PokiSDK.rewardedBreak());
      } else if (TARGET === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.ad) {
        await window.CrazyGames.SDK.ad.requestAd('rewarded');
        rewarded = true;
      } else if (TARGET === 'playgama' && window.bridge && window.bridge.advertisement) {
        await window.bridge.advertisement.showRewarded();
        rewarded = true;
      } else {
        rewarded = true;
      }
    } catch (err) {
      console.warn('[NexusPortal] showRewarded:', err);
    }
    if (rewarded) emitPortalEvent('rewarded');
    emitPortalEvent('adClosed');
    gameplayStart();
    return rewarded;
  }

  window.NexusPortal = {
    target: TARGET,
    init: init,
    loadingFinished: loadingFinished,
    gameplayStart: gameplayStart,
    gameplayStop: gameplayStop,
    showAd: showAd,
    showInterstitial: showAd,
    showRewarded: showRewarded,
    storageGet: storageGet,
    storageSet: storageSet,
    submitScore: submitScore,
    getLeaderboard: getLeaderboard
  };
})();
`;
}

export function generatePlaygamaConfig(gameTitle: string): string {
  return JSON.stringify(
    {
      name: gameTitle,
      sdk: 'playgama-bridge',
      engine: 'nexus-game-engine',
      version: '1.0.0',
      orientation: 'any',
    },
    null,
    2
  );
}

export function generateNexusRuntimeJs(options: Html5CompileOptions): string {
  return `(async function () {
  var SCALE_MODE = ${JSON.stringify(options.scaleMode)};
  var DEG_TO_RAD = Math.PI / 180;
  var FIXED_DT = 1 / 60;

  function parseColor(hex, fallback) {
    if (!hex) return fallback;
    var clean = String(hex).trim().replace(/^#/, '');
    var n = parseInt(clean, 16);
    return Number.isFinite(n) ? n : fallback;
  }

  function cloneData(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function moveTowards(cur, tgt, maxDelta) {
    if (Math.abs(tgt - cur) <= maxDelta) return tgt;
    return cur + Math.sign(tgt - cur) * maxDelta;
  }

  var PLATFORMER_PROFILES = {
    preciso: { maxSpeed: 220, acceleration: 1500, deceleration: 2100, airControl: 0.85, groundFriction: 1.0, jumpForce: 500, gravity: 1280, fallGravityMultiplier: 1.35, maxFallSpeed: 760, coyoteTime: 0.1, jumpBuffer: 0.1, variableJumpCut: 0.52, maxJumps: 1 },
    suave: { maxSpeed: 240, acceleration: 900, deceleration: 1050, airControl: 0.72, groundFriction: 0.85, jumpForce: 520, gravity: 1180, fallGravityMultiplier: 1.25, maxFallSpeed: 720, coyoteTime: 0.12, jumpBuffer: 0.12, variableJumpCut: 0.55, maxJumps: 1 },
    arcade: { maxSpeed: 280, acceleration: 2600, deceleration: 3200, airControl: 0.95, groundFriction: 1.1, jumpForce: 560, gravity: 1450, fallGravityMultiplier: 1.45, maxFallSpeed: 840, coyoteTime: 0.08, jumpBuffer: 0.1, variableJumpCut: 0.45, maxJumps: 2 },
    realista: { maxSpeed: 195, acceleration: 780, deceleration: 1200, airControl: 0.5, groundFriction: 1.0, jumpForce: 470, gravity: 1350, fallGravityMultiplier: 1.2, maxFallSpeed: 780, coyoteTime: 0.07, jumpBuffer: 0.08, variableJumpCut: 0.65, maxJumps: 1 }
  };

  function resolvePlatformerConfig(cfg) {
    cfg = cfg || {};
    var pName = cfg.profile && PLATFORMER_PROFILES[cfg.profile] ? cfg.profile : 'preciso';
    var base = PLATFORMER_PROFILES[pName];
    var spd = cfg.maxSpeed !== undefined ? Number(cfg.maxSpeed) : cfg.speed !== undefined ? Number(cfg.speed) : base.maxSpeed;
    return {
      maxSpeed: spd,
      acceleration: cfg.acceleration !== undefined ? Number(cfg.acceleration) : base.acceleration,
      deceleration: cfg.deceleration !== undefined ? Number(cfg.deceleration) : base.deceleration,
      airControl: cfg.airControl !== undefined ? Number(cfg.airControl) : base.airControl,
      groundFriction: cfg.groundFriction !== undefined ? Number(cfg.groundFriction) : base.groundFriction,
      jumpForce: cfg.jumpForce !== undefined ? Number(cfg.jumpForce) : base.jumpForce,
      gravity: cfg.gravity !== undefined ? Number(cfg.gravity) : base.gravity,
      fallGravityMultiplier: cfg.fallGravityMultiplier !== undefined ? Number(cfg.fallGravityMultiplier) : base.fallGravityMultiplier,
      maxFallSpeed: cfg.maxFallSpeed !== undefined ? Number(cfg.maxFallSpeed) : base.maxFallSpeed,
      coyoteTime: cfg.coyoteTime !== undefined ? Number(cfg.coyoteTime) : base.coyoteTime,
      jumpBuffer: cfg.jumpBuffer !== undefined ? Number(cfg.jumpBuffer) : base.jumpBuffer,
      variableJumpCut: cfg.variableJumpCut !== undefined ? Number(cfg.variableJumpCut) : base.variableJumpCut,
      maxJumps: cfg.maxJumps !== undefined ? Math.max(1, Number(cfg.maxJumps)) : base.maxJumps
    };
  }

  function resolveTopDownConfig(cfg) {
    cfg = cfg || {};
    var maxSpeed = cfg.maxSpeed !== undefined ? Number(cfg.maxSpeed) : cfg.speed !== undefined ? Number(cfg.speed) : 210;
    return {
      maxSpeed: maxSpeed,
      acceleration: cfg.acceleration !== undefined ? Number(cfg.acceleration) : 1400,
      deceleration: cfg.deceleration !== undefined ? Number(cfg.deceleration) : 1800
    };
  }

  function computeSpriteLayout(boxW, boxH, ax, ay, texW, texH, mode, cropRect) {
    boxW = Math.max(1, boxW);
    boxH = Math.max(1, boxH);
    texW = Math.max(1, texW);
    texH = Math.max(1, texH);
    mode = mode || 'contain';
    var frameLeft = -boxW * ax;
    var frameTop = -boxH * ay;
    var centerX = frameLeft + boxW * 0.5;
    var centerY = frameTop + boxH * 0.5;
    if (mode === 'original') {
      return { offsetX: 0, offsetY: 0, drawWidth: texW, drawHeight: texH, sourceCrop: null, needsClipMask: false, frameLeft: -texW * ax, frameTop: -texH * ay, frameWidth: texW, frameHeight: texH, tiled: false };
    }
    if (mode === 'contain') {
      var s1 = Math.min(boxW / texW, boxH / texH);
      var dw1 = Math.max(1, texW * s1);
      var dh1 = Math.max(1, texH * s1);
      return { offsetX: centerX - (0.5 - ax) * dw1, offsetY: centerY - (0.5 - ay) * dh1, drawWidth: dw1, drawHeight: dh1, sourceCrop: null, needsClipMask: false, frameLeft: frameLeft, frameTop: frameTop, frameWidth: boxW, frameHeight: boxH, tiled: false };
    }
    if (mode === 'cover') {
      var s2 = Math.max(boxW / texW, boxH / texH);
      var dw2 = Math.max(1, texW * s2);
      var dh2 = Math.max(1, texH * s2);
      return { offsetX: centerX - (0.5 - ax) * dw2, offsetY: centerY - (0.5 - ay) * dh2, drawWidth: dw2, drawHeight: dh2, sourceCrop: null, needsClipMask: true, frameLeft: frameLeft, frameTop: frameTop, frameWidth: boxW, frameHeight: boxH, tiled: false };
    }
    if (mode === 'crop' && cropRect) {
      var cx = Math.max(0, Math.min(texW - 1, Math.floor(cropRect.x || 0)));
      var cy = Math.max(0, Math.min(texH - 1, Math.floor(cropRect.y || 0)));
      var cw = Math.max(1, Math.min(texW - cx, Math.floor(cropRect.width || texW)));
      var ch = Math.max(1, Math.min(texH - cy, Math.floor(cropRect.height || texH)));
      var s3 = Math.min(boxW / cw, boxH / ch);
      var dw3 = Math.max(1, cw * s3);
      var dh3 = Math.max(1, ch * s3);
      return { offsetX: centerX - (0.5 - ax) * dw3, offsetY: centerY - (0.5 - ay) * dh3, drawWidth: dw3, drawHeight: dh3, sourceCrop: { x: cx, y: cy, width: cw, height: ch }, needsClipMask: false, frameLeft: frameLeft, frameTop: frameTop, frameWidth: boxW, frameHeight: boxH, tiled: false };
    }
    if (mode === 'tile') {
      return { offsetX: 0, offsetY: 0, drawWidth: boxW, drawHeight: boxH, sourceCrop: null, needsClipMask: false, frameLeft: frameLeft, frameTop: frameTop, frameWidth: boxW, frameHeight: boxH, tiled: true };
    }
    return { offsetX: 0, offsetY: 0, drawWidth: boxW, drawHeight: boxH, sourceCrop: null, needsClipMask: false, frameLeft: frameLeft, frameTop: frameTop, frameWidth: boxW, frameHeight: boxH, tiled: false };
  }

  function interpolateText(raw, vars, bindVar) {
    if (bindVar && vars.has(bindVar)) {
      var bv = vars.get(bindVar);
      if (String(raw).indexOf('{') >= 0) {
        return String(raw).replace(/\\{([a-zA-Z0-9_]+)\\}/g, function (_, k) { return vars.has(k) ? String(vars.get(k)) : ''; });
      }
      return String(raw) + ': ' + String(bv);
    }
    return String(raw).replace(/\\{([a-zA-Z0-9_]+)\\}/g, function (_, k) { return vars.has(k) ? String(vars.get(k)) : '0'; });
  }

  function getWorldColliders(obj) {
    var cols = obj.colliders;
    var sx = Math.abs(obj.transform.scaleX);
    var sy = Math.abs(obj.transform.scaleY);
    var objLayer = obj.layer || 'Default';
    if (!cols || cols.length === 0) {
      var w = Math.max(1, obj.transform.width * sx);
      var h = Math.max(1, obj.transform.height * sy);
      var left = obj.transform.x - w * obj.transform.anchorX;
      var top = obj.transform.y - h * obj.transform.anchorY;
      var isTrig = obj.components && obj.components.some(function (c) {
        return c.enabled && (c.type === 'collectible' || c.type === 'goal_portal' || c.type === 'checkpoint');
      });
      return [{ kind: obj.type === 'circle' ? 'circle' : 'box', left: left, right: left + w, top: top, bottom: top + h, cx: left + w * 0.5, cy: top + h * 0.5, radius: Math.max(w, h) * 0.5, isSensor: Boolean(isTrig), layer: obj.type && obj.type.indexOf('ui_') === 0 ? 'UI' : objLayer, mask: undefined }];
    }
    var out = [];
    cols.forEach(function (col) {
      if (!col.enabled) return;
      var cw = Math.max(1, col.width * sx);
      var ch = Math.max(1, col.height * sy);
      var cx = obj.transform.x + (0.5 - obj.transform.anchorX) * obj.transform.width * sx + (col.offsetX || 0) * sx;
      var cy = obj.transform.y + (0.5 - obj.transform.anchorY) * obj.transform.height * sy + (col.offsetY || 0) * sy;
      if (col.shape === 'circle') {
        var r = Math.max(1, (col.radius || Math.max(col.width, col.height) * 0.5) * Math.max(sx, sy));
        out.push({ kind: 'circle', left: cx - r, right: cx + r, top: cy - r, bottom: cy + r, cx: cx, cy: cy, radius: r, isSensor: col.isSensor, layer: col.layer || objLayer, mask: col.mask });
      } else {
        out.push({ kind: 'box', left: cx - cw * 0.5, right: cx + cw * 0.5, top: cy - ch * 0.5, bottom: cy + ch * 0.5, cx: cx, cy: cy, radius: Math.max(cw, ch) * 0.5, isSensor: col.isSensor, layer: col.layer || objLayer, mask: col.mask });
      }
    });
    return out;
  }

  function canLayersCollide(aLayer, bLayer, aMask, bMask) {
    if (aLayer === 'UI' || bLayer === 'UI') return false;
    var aAllowsB = !aMask || aMask.length === 0 || aMask.indexOf(bLayer) >= 0;
    var bAllowsA = !bMask || bMask.length === 0 || bMask.indexOf(aLayer) >= 0;
    return aAllowsB && bAllowsA;
  }

  function colsOverlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  // Web Audio API autónomo profesional con buses persistentes y música de fondo
  var buses = { master: 0.85, music: 0.7, sfx: 0.9, ui: 0.8, muted: {} };
  var audioCtx = null;
  var masterGain = null;
  var busGains = { music: null, sfx: null, ui: null };
  var rawAudioData = new Map();
  var audioBuffers = new Map();
  var decodingPromises = new Map();
  var activeSfxSources = new Set();
  var currentMusicSource = null;
  var currentMusicGain = null;
  var currentMusicAssetId = null;
  var pendingMusicCmd = null;

  function syncBusGains() {
    if (!audioCtx || !masterGain) return;
    var now = audioCtx.currentTime;
    var mMuted = Boolean(buses.muted && buses.muted.master);
    masterGain.gain.setValueAtTime(mMuted ? 0 : Math.max(0, Math.min(1, buses.master !== undefined ? buses.master : 0.85)), now);
    ['music', 'sfx', 'ui'].forEach(function (ch) {
      var node = busGains[ch];
      if (!node) return;
      var chMuted = Boolean(buses.muted && buses.muted[ch]);
      var val = buses[ch] !== undefined ? buses[ch] : 0.85;
      node.gain.setValueAtTime(chMuted ? 0 : Math.max(0, Math.min(1, val)), now);
    });
  }

  function getBusNode(ch) {
    if (!audioCtx) return null;
    return busGains[ch] || busGains.sfx || masterGain || audioCtx.destination;
  }

  function decodeAssetIfNeeded(assetId) {
    if (audioBuffers.has(assetId)) return Promise.resolve(audioBuffers.get(assetId));
    if (decodingPromises.has(assetId)) return decodingPromises.get(assetId);
    if (!audioCtx || !rawAudioData.has(assetId)) return Promise.resolve(null);
    var copy = rawAudioData.get(assetId).slice(0);
    var pr = audioCtx.decodeAudioData(copy).then(function (buf) {
      audioBuffers.set(assetId, buf);
      decodingPromises.delete(assetId);
      return buf;
    }).catch(function () {
      decodingPromises.delete(assetId);
      return null;
    });
    decodingPromises.set(assetId, pr);
    return pr;
  }

  function startBufferedSound(buf, vol, pitchMul, ch, loop) {
    if (!audioCtx || !buf) return null;
    var src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.loop = Boolean(loop);
    src.playbackRate.value = Math.max(0.25, Math.min(3, pitchMul || 1));
    var g = audioCtx.createGain();
    g.gain.value = Math.max(0, Math.min(2, vol !== undefined ? vol : 1));
    src.connect(g);
    g.connect(getBusNode(ch || 'sfx'));
    activeSfxSources.add(src);
    src.onended = function () { activeSfxSources.delete(src); };
    src.start(0);
    return src;
  }

  function stopMusic() {
    pendingMusicCmd = null;
    if (currentMusicSource) {
      try { currentMusicSource.stop(); } catch (_) {}
      try { currentMusicSource.disconnect(); } catch (_) {}
      currentMusicSource = null;
    }
    if (currentMusicGain) {
      try { currentMusicGain.disconnect(); } catch (_) {}
      currentMusicGain = null;
    }
    currentMusicAssetId = null;
  }

  function stopAllAudio() {
    stopMusic();
    activeSfxSources.forEach(function (src) {
      try { src.stop(); } catch (_) {}
      try { src.disconnect(); } catch (_) {}
    });
    activeSfxSources.clear();
  }

  function playMusicAsset(assetId, vol, loop, keepIfSame) {
    if (!assetId) return;
    var safeVol = Math.max(0, Math.min(1.5, vol !== undefined ? vol : 0.8));
    if (keepIfSame !== false && currentMusicAssetId === assetId && currentMusicSource) {
      if (currentMusicGain && audioCtx) currentMusicGain.gain.setValueAtTime(safeVol, audioCtx.currentTime);
      return;
    }
    stopMusic();
    var cmd = { assetId: assetId, volume: safeVol, loop: loop !== false, keepIfSame: keepIfSame !== false };
    pendingMusicCmd = cmd;
    var ctx = ensureAudio();
    if (!ctx || ctx.state !== 'running') return;
    function startBuf(buf) {
      if (!buf || !pendingMusicCmd || pendingMusicCmd.assetId !== assetId || !audioCtx || audioCtx.state !== 'running') return;
      pendingMusicCmd = null;
      var src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.loop = cmd.loop;
      var g = audioCtx.createGain();
      g.gain.value = cmd.volume;
      src.connect(g);
      g.connect(getBusNode('music'));
      currentMusicSource = src;
      currentMusicGain = g;
      currentMusicAssetId = assetId;
      src.onended = function () {
        if (currentMusicSource === src) {
          currentMusicSource = null;
          currentMusicGain = null;
          currentMusicAssetId = null;
        }
      };
      src.start(0);
    }
    if (audioBuffers.has(assetId)) startBuf(audioBuffers.get(assetId));
    else decodeAssetIfNeeded(assetId).then(startBuf);
  }

  function ensureAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) {
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.connect(audioCtx.destination);
      busGains.music = audioCtx.createGain();
      busGains.sfx = audioCtx.createGain();
      busGains.ui = audioCtx.createGain();
      busGains.music.connect(masterGain);
      busGains.sfx.connect(masterGain);
      busGains.ui.connect(masterGain);
      syncBusGains();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(function () {
        if (pendingMusicCmd) {
          var cmd = pendingMusicCmd;
          playMusicAsset(cmd.assetId, cmd.volume, cmd.loop, cmd.keepIfSame);
        }
      }).catch(function () {});
    } else if (pendingMusicCmd && !currentMusicSource) {
      var pcmd = pendingMusicCmd;
      playMusicAsset(pcmd.assetId, pcmd.volume, pcmd.loop, pcmd.keepIfSame);
    }
    return audioCtx;
  }

  function playSynth(preset, volume, pitchMul, ch) {
    var ctx = ensureAudio();
    var chName = ch || 'sfx';
    if (!ctx || getChannelGain(chName) <= 0.001) return;
    var now = ctx.currentTime;
    var pMul = Math.max(0.25, Math.min(3, pitchMul || 1));
    var vMul = Math.max(0.05, Math.min(2, volume !== undefined ? volume : 1));
    var dest = getBusNode(chName);
    function tone(type, f1, f2, off, dur, vol) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f1 * pMul, now + off);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f2 * pMul), now + off + dur);
      g.gain.setValueAtTime(Math.min(1, vol * vMul), now + off);
      g.gain.exponentialRampToValueAtTime(0.001, now + off + dur);
      o.connect(g);
      g.connect(dest);
      o.start(now + off);
      o.stop(now + off + dur + 0.01);
    }
    if (preset === 'jump') tone('square', 220, 560, 0, 0.16, 0.18);
    else if (preset === 'hit') tone('sawtooth', 170, 55, 0, 0.18, 0.25);
    else if (preset === 'step') tone('triangle', 140, 90, 0, 0.06, 0.14);
    else if (preset === 'powerup' || preset === 'win') {
      tone('triangle', 440, 554, 0, 0.08, 0.2);
      tone('triangle', 554, 659, 0.08, 0.08, 0.2);
      tone('triangle', 659, 880, 0.16, 0.14, 0.22);
    } else {
      tone('square', 987.77, 987.77, 0, 0.07, 0.18);
      tone('square', 1318.51, 1318.51, 0.07, 0.16, 0.18);
    }
  }

  function playAudioAsset(assetId, volume, pitchMul, ch, loop) {
    if (!assetId) return;
    var chName = ch || 'sfx';
    if (chName === 'music') {
      playMusicAsset(assetId, volume, loop !== false, false);
      return;
    }
    var ctx = ensureAudio();
    if (!ctx || getChannelGain(chName) <= 0.001) return;
    if (audioBuffers.has(assetId)) {
      startBufferedSound(audioBuffers.get(assetId), volume, pitchMul, chName, loop);
    } else {
      decodeAssetIfNeeded(assetId).then(function (buf) {
        if (buf) startBufferedSound(buf, volume, pitchMul, chName, loop);
      });
    }
  }

  function getChannelGain(ch) {
    if (buses.muted && (buses.muted.master || buses.muted[ch])) return 0;
    var m = buses.master !== undefined ? buses.master : 0.85;
    var c = buses[ch] !== undefined ? buses[ch] : 0.85;
    return Math.max(0, Math.min(1, m * c));
  }

  function evalEasing(easing, t) {
    var x = Math.max(0, Math.min(1, t));
    if (easing === 'easeIn') return x * x * x;
    if (easing === 'easeOut') return 1 - Math.pow(1 - x, 3);
    if (easing === 'easeInOut') return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    if (easing === 'bounce') {
      var n1 = 7.5625; var d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) { var y1 = x - 1.5 / d1; return n1 * y1 * y1 + 0.75; }
      if (x < 2.5 / d1) { var y2 = x - 2.25 / d1; return n1 * y2 * y2 + 0.9375; }
      var y3 = x - 2.625 / d1;
      return n1 * y3 * y3 + 0.984375;
    }
    return x;
  }

  function getParticleDefaults(preset) {
    var map = {
      fire: { rate: 30, maxParticles: 100, speedMin: 40, speedMax: 110, angleDeg: -90, spreadDeg: 36, gravity: -40, sizeStart: 8, sizeEnd: 2, lifetime: 0.65, colorStart: '#facc15', colorEnd: '#ef4444', blendAlpha: 0.9 },
      smoke: { rate: 16, maxParticles: 80, speedMin: 20, speedMax: 55, angleDeg: -90, spreadDeg: 45, gravity: -20, sizeStart: 6, sizeEnd: 18, lifetime: 1.2, colorStart: '#94a3b8', colorEnd: '#334155', blendAlpha: 0.55 },
      sparks: { rate: 36, maxParticles: 120, speedMin: 120, speedMax: 260, angleDeg: -90, spreadDeg: 140, gravity: 340, sizeStart: 4, sizeEnd: 1, lifetime: 0.5, colorStart: '#fef08a', colorEnd: '#f97316', blendAlpha: 1 },
      magic: { rate: 24, maxParticles: 90, speedMin: 25, speedMax: 80, angleDeg: 0, spreadDeg: 360, gravity: -15, sizeStart: 5, sizeEnd: 1, lifetime: 0.9, colorStart: '#c084fc', colorEnd: '#38bdf8', blendAlpha: 0.95 },
      dust: { rate: 14, maxParticles: 60, speedMin: 15, speedMax: 45, angleDeg: 180, spreadDeg: 60, gravity: 25, sizeStart: 5, sizeEnd: 2, lifetime: 0.55, colorStart: '#d6d3d1', colorEnd: '#78716c', blendAlpha: 0.6 },
      rain: { rate: 45, maxParticles: 160, speedMin: 260, speedMax: 340, angleDeg: 95, spreadDeg: 8, gravity: 160, sizeStart: 3, sizeEnd: 3, lifetime: 1.1, colorStart: '#60a5fa', colorEnd: '#3b82f6', blendAlpha: 0.7 },
      snow: { rate: 20, maxParticles: 120, speedMin: 25, speedMax: 55, angleDeg: 90, spreadDeg: 30, gravity: 12, sizeStart: 4, sizeEnd: 3, lifetime: 2.4, colorStart: '#ffffff', colorEnd: '#cbd5e1', blendAlpha: 0.85 },
      explosion: { rate: 60, maxParticles: 140, speedMin: 90, speedMax: 280, angleDeg: 0, spreadDeg: 360, gravity: 120, sizeStart: 7, sizeEnd: 1, lifetime: 0.45, colorStart: '#fde047', colorEnd: '#dc2626', blendAlpha: 1 }
    };
    return map[preset] || map.explosion;
  }

  function applyObjectTweens(obj, dt, tweenStates) {
    if (!obj.tweens || obj.tweens.length === 0) return;
    for (var i = 0; i < obj.tweens.length; i++) {
      var tr = obj.tweens[i];
      var key = obj.id + ':' + tr.id;
      var ts = tweenStates.get(key);
      if (!ts) { ts = { elapsed: 0, playing: Boolean(tr.autoPlay) }; tweenStates.set(key, ts); }
      if (!ts.playing) continue;
      ts.elapsed += dt;
      var delay = Math.max(0, tr.delay || 0);
      if (ts.elapsed < delay) continue;
      var dur = Math.max(0.05, tr.duration || 0.5);
      var prog = (ts.elapsed - delay) / dur;
      if (tr.pingPong) {
        var cyc = Math.floor(prog); var frac = prog - cyc;
        if (!tr.loop && cyc >= 2) { prog = 0; ts.playing = false; }
        else prog = cyc % 2 === 1 ? 1 - frac : frac;
      } else if (tr.loop) {
        prog = prog % 1;
      } else if (prog >= 1) {
        prog = 1; ts.playing = false;
      }
      var v = tr.from + (tr.to - tr.from) * evalEasing(tr.easing || 'linear', prog);
      if (tr.property === 'x') obj.transform.x = v;
      else if (tr.property === 'y') obj.transform.y = v;
      else if (tr.property === 'scaleX') obj.transform.scaleX = v;
      else if (tr.property === 'scaleY') obj.transform.scaleY = v;
      else if (tr.property === 'rotation') obj.transform.rotation = v;
      else if (tr.property === 'opacity') obj.opacity = Math.max(0, Math.min(1, v));
    }
  }

  async function boot() {
    if (window.NexusPortal) {
      await window.NexusPortal.init();
    }
    var resp = await fetch('data/game.json');
    if (!resp.ok) throw new Error('No se pudo cargar data/game.json');
    var gameData = await resp.json();
    var stageW = gameData.settings.width || 1280;
    var stageH = gameData.settings.height || 720;
    var scenes = gameData.scenes || [];
    var prefabMap = new Map();
    (gameData.prefabs || []).forEach(function (pf) { prefabMap.set(pf.id, pf); });

    buses = gameData.audioBuses || { master: 0.85, music: 0.7, sfx: 0.9, ui: 0.8, muted: {} };
    syncBusGains();

    var host = document.getElementById('nx-stage-wrap');
    var app = new PIXI.Application();
    await app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: parseColor(gameData.settings.backgroundColor, 0x131b2e),
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: ['webgl', 'canvas']
    });
    host.appendChild(app.canvas);

    var textures = new Map();
    var assets = gameData.assets || [];
    var audioExts = ['wav', 'mp3', 'ogg', 'm4a', 'aac', 'flac', 'webm'];
    for (var i = 0; i < assets.length; i++) {
      var asset = assets[i];
      try {
        if (asset.kind === 'audio' || audioExts.indexOf(asset.format) >= 0) {
          var aRes = await fetch(asset.path);
          if (aRes.ok) {
            var ab = await aRes.arrayBuffer();
            rawAudioData.set(asset.id, ab);
            if (audioCtx && audioCtx.state === 'running') {
              await decodeAssetIfNeeded(asset.id);
            }
          }
        } else {
          var tex = await PIXI.Assets.load(asset.path);
          textures.set(asset.id, tex);
        }
      } catch (e) {
        console.warn('Error cargando recurso:', asset.path, e);
      }
    }

    var world = new PIXI.Container();
    var bgRect = new PIXI.Graphics();
    var sceneRoot = new PIXI.Container();
    var fxGraphics = new PIXI.Graphics();
    var transitionGraphics = new PIXI.Graphics();
    world.addChild(bgRect);
    world.addChild(sceneRoot);
    world.addChild(fxGraphics);
    world.addChild(transitionGraphics);
    app.stage.addChild(world);

    var baseWorldPos = { x: 0, y: 0 };
    var currentScale = 1;
    function resizeWorld() {
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      app.renderer.resize(vw, vh);
      currentScale = SCALE_MODE === 'cover' ? Math.max(vw / stageW, vh / stageH) : Math.min(vw / stageW, vh / stageH);
      world.scale.set(currentScale, currentScale);
      baseWorldPos.x = (vw - stageW * currentScale) / 2;
      baseWorldPos.y = (vh - stageH * currentScale) / 2;
      world.position.set(baseWorldPos.x, baseWorldPos.y);
    }
    window.addEventListener('resize', resizeWorld);
    resizeWorld();

    function readStoredVar(name, fallback) {
      if (!window.NexusPortal || !window.NexusPortal.storageGet) return fallback;
      var raw = window.NexusPortal.storageGet('nx_var_' + name);
      if (raw === null || raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (_) { return fallback; }
    }
    function writeStoredVar(name, val) {
      if (window.NexusPortal && window.NexusPortal.storageSet) {
        window.NexusPortal.storageSet('nx_var_' + name, JSON.stringify(val));
      }
    }

    var persistentVarNames = new Set();
    var persistentVars = new Map();
    (gameData.variables || []).forEach(function (v) {
      if (v.persistent) {
        persistentVarNames.add(v.name);
        persistentVars.set(v.name, readStoredVar(v.name, v.initialValue));
      } else if (v.scope === 'global' || v.scope === 'match') {
        persistentVars.set(v.name, v.initialValue);
      }
    });
    if (!persistentVars.has('puntos')) persistentVars.set('puntos', 0);
    var sharedLeaderboard = window.NexusPortal && window.NexusPortal.getLeaderboard ? window.NexusPortal.getLeaderboard('default') : [];

    var scoreBox = document.getElementById('nx-score-box');
    var scoreSpan = document.getElementById('nx-score');

    function sliceSubTexture(baseTex, col, row, cols, rows) {
      var sc = Math.max(1, cols || 1);
      var sr = Math.max(1, rows || 1);
      var fw = Math.max(1, Math.floor(baseTex.width / sc));
      var fh = Math.max(1, Math.floor(baseTex.height / sr));
      var sx = Math.min(Math.max(0, col * fw), Math.max(0, baseTex.width - 1));
      var sy = Math.min(Math.max(0, row * fh), Math.max(0, baseTex.height - 1));
      return new PIXI.Texture({ source: baseTex.source, frame: new PIXI.Rectangle(sx, sy, Math.max(1, Math.min(fw, baseTex.width - sx)), Math.max(1, Math.min(fh, baseTex.height - sy))) });
    }

    var sceneStack = [];
    var transitionEffect = null;
    var activeSim = null;

    function createBodyForObj(obj) {
      var comps = obj.components || [];
      var hc = comps.find(function (c) { return c.enabled && (c.type === 'health' || c.type === 'combat.health_system'); });
      var dst = comps.find(function (c) { return c.enabled && c.type === 'arcade.destructible'; });
      var pc = comps.find(function (c) { return c.enabled && c.type === 'projectile'; });
      var maxHp = Number(hc ? (hc.config.maxHealth !== undefined ? hc.config.maxHealth : hc.config.maxHp || 100) : dst ? (dst.config.hitsToBreak || 3) : 100);
      var curHp = hc ? Number(hc.config.currentHealth !== undefined ? hc.config.currentHealth : hc.config.currentHp !== undefined ? hc.config.currentHp : maxHp) : maxHp;
      return {
        vx: pc ? Number(pc.config.vx !== undefined ? pc.config.vx : 360) : 0,
        vy: pc ? Number(pc.config.vy || 0) : 0,
        ax: 0, ay: 0, grounded: false, wasGrounded: false, coyoteTimer: 0, jumpBufferTimer: 0, jumpsUsed: 0,
        originX: obj.transform.x, originY: obj.transform.y, patrolPhase: 0, waypointIndex: 0, waypointForward: true, customInitialized: false,
        health: curHp, maxHealth: maxHp, invulnerableTimer: 0,
        lifetimeRemaining: pc ? Number(pc.config.lifetime !== undefined ? pc.config.lifetime : pc.config.lifetimeSec || 2.5) : undefined
      };
    }

    function buildSimState(sourceScene) {
      var sc = cloneData(sourceScene);
      var vars = new Map();
      (gameData.variables || []).forEach(function (v) { vars.set(v.name, v.initialValue); });
      persistentVars.forEach(function (val, key) { vars.set(key, val); });
      if (!vars.has('puntos')) vars.set('puntos', 0);
      var bodies = new Map();
      (sc.objects || []).forEach(function (o) { bodies.set(o.id, createBodyForObj(o)); });
      return {
        scene: sc,
        elapsed: 0,
        bodies: bodies,
        variables: vars,
        prevVariables: new Map(vars),
        persistentVarNames: new Set(persistentVarNames),
        leaderboard: sharedLeaderboard.slice(0, 10),
        leaderboardDirty: true,
        nodeMap: new Map(),
        animatedSprites: [],
        sceneStarted: false,
        activeCollisions: new Set(),
        activeTriggers: new Set(),
        prevInput: { left: false, right: false, up: false, down: false, jump: false, action1: false, action2: false, pressedKeys: [], pointerDown: false },
        timerAcc: new Map(),
        runtimeTimers: new Map(),
        tweenStates: new Map(),
        pendingWaits: [],
        clickedObjectIds: [],
        hoveredObjectId: null,
        emittedEvents: [],
        portalEventsQueue: [],
        countdownZeroQueue: [],
        pendingSceneCommand: null,
        checkpoint: null,
        cameraPos: { x: 0, y: 0 },
        particles: [],
        emitterParticles: [],
        screenFlash: null,
        flashTimers: new Map(),
        visualSquash: new Map(),
        shakeRemaining: 0,
        shakeIntensity: 0
      };
    }

    function createDisplayForObject(obj, sim) {
      var w = obj.transform.width;
      var h = obj.transform.height;
      var ax = obj.transform.anchorX;
      var ay = obj.transform.anchorY;
      var node;

      if (obj.type === 'sprite') {
        var baseTex = obj.sprite && obj.sprite.assetId ? textures.get(obj.sprite.assetId) : null;
        if (baseTex) {
          baseTex.source.scaleMode = obj.sprite.sampling === 'nearest' ? 'nearest' : 'linear';
          var anim = obj.sprite.animation;
          var activeTex = baseTex;
          if (anim && anim.enabled) {
            var cols = Math.max(1, anim.cols || 1);
            var rows = Math.max(1, anim.rows || 1);
            var total = Math.max(1, Math.min(anim.frameCount || cols * rows, cols * rows));
            var frames = [];
            for (var f = 0; f < total; f++) frames.push(sliceSubTexture(baseTex, f % cols, Math.floor(f / cols), cols, rows));
            var animSprite = new PIXI.AnimatedSprite(frames);
            var layA = computeSpriteLayout(w, h, ax, ay, frames[0].width, frames[0].height, obj.sprite.fitMode || 'contain', obj.sprite.cropRect);
            animSprite.anchor.set(ax, ay);
            animSprite.position.set(layA.offsetX, layA.offsetY);
            animSprite.width = Math.max(1, layA.drawWidth);
            animSprite.height = Math.max(1, layA.drawHeight);
            animSprite.tint = parseColor(obj.sprite.tint, 0xffffff);
            animSprite.animationSpeed = Math.max(0.01, (anim.fps || 8) / 60);
            animSprite.loop = anim.loop !== false;
            if (anim.playing !== false) animSprite.play();
            sim.animatedSprites.push(animSprite);
            var wrapA = new PIXI.Container();
            wrapA.addChild(animSprite);
            if (layA.needsClipMask) {
              var maskA = new PIXI.Graphics();
              maskA.rect(layA.frameLeft, layA.frameTop, layA.frameWidth, layA.frameHeight);
              maskA.fill({ color: 0xffffff, alpha: 1 });
              wrapA.addChild(maskA);
              animSprite.mask = maskA;
            }
            node = wrapA;
          } else {
            var lay = computeSpriteLayout(w, h, ax, ay, activeTex.width, activeTex.height, obj.sprite.fitMode || 'contain', obj.sprite.cropRect);
            if (lay.sourceCrop) {
              activeTex = new PIXI.Texture({ source: activeTex.source, frame: new PIXI.Rectangle(lay.sourceCrop.x, lay.sourceCrop.y, lay.sourceCrop.width, lay.sourceCrop.height) });
            }
            if (lay.tiled) {
              var tileSpr = new PIXI.TilingSprite({ texture: activeTex, width: lay.drawWidth, height: lay.drawHeight });
              tileSpr.anchor.set(ax, ay);
              tileSpr.tint = parseColor(obj.sprite.tint, 0xffffff);
              node = tileSpr;
            } else {
              var wrap = new PIXI.Container();
              var spr = new PIXI.Sprite(activeTex);
              spr.anchor.set(ax, ay);
              spr.position.set(lay.offsetX, lay.offsetY);
              spr.width = Math.max(1, lay.drawWidth);
              spr.height = Math.max(1, lay.drawHeight);
              spr.tint = parseColor(obj.sprite.tint, 0xffffff);
              wrap.addChild(spr);
              if (lay.needsClipMask) {
                var mask = new PIXI.Graphics();
                mask.rect(lay.frameLeft, lay.frameTop, lay.frameWidth, lay.frameHeight);
                mask.fill({ color: 0xffffff, alpha: 1 });
                wrap.addChild(mask);
                spr.mask = mask;
              }
              node = wrap;
            }
          }
        } else {
          node = new PIXI.Container();
        }
      } else if (obj.type === 'rectangle') {
        var rg = new PIXI.Graphics();
        var r = obj.rectangle || {};
        var leftR = -w * ax;
        var topR = -h * ay;
        if ((r.cornerRadius || 0) > 0) rg.roundRect(leftR, topR, w, h, Math.min(r.cornerRadius, w / 2, h / 2));
        else rg.rect(leftR, topR, w, h);
        rg.fill({ color: parseColor(r.fillColor, 0x3b82f6), alpha: 1 });
        if ((r.strokeWidth || 0) > 0) rg.stroke({ width: r.strokeWidth, color: parseColor(r.strokeColor, 0x93c5fd) });
        node = rg;
      } else if (obj.type === 'circle') {
        var cg = new PIXI.Graphics();
        var c = obj.circle || {};
        cg.ellipse((0.5 - ax) * w, (0.5 - ay) * h, Math.max(1, w / 2), Math.max(1, h / 2));
        cg.fill({ color: parseColor(c.fillColor, 0x10b981), alpha: 1 });
        if ((c.strokeWidth || 0) > 0) cg.stroke({ width: c.strokeWidth, color: parseColor(c.strokeColor, 0x6ee7b7) });
        node = cg;
      } else if (obj.type === 'text') {
        var t = obj.text || {};
        var pText = new PIXI.Text({
          text: interpolateText(t.text || '', sim.variables, t.bindVariable),
          style: new PIXI.TextStyle({ fontFamily: t.fontFamily || 'sans-serif', fontSize: Math.max(8, t.fontSize || 28), fontWeight: t.fontWeight === 'bold' ? '700' : '400', fill: parseColor(t.color, 0xffffff), align: t.align || 'center' })
        });
        pText.anchor.set(ax, ay);
        node = pText;
      } else if (obj.type === 'ui_panel') {
        var pg = new PIXI.Graphics();
        var p = obj.uiPanel || {};
        var lP = -w * ax;
        var tP = -h * ay;
        var radP = Math.min(p.borderRadius !== undefined ? p.borderRadius : 10, w / 2, h / 2);
        if (radP > 0) pg.roundRect(lP, tP, w, h, radP);
        else pg.rect(lP, tP, w, h);
        pg.fill({ color: parseColor(p.bgColor, 0x18181f), alpha: 0.94 });
        if ((p.borderWidth !== undefined ? p.borderWidth : 2) > 0) pg.stroke({ width: p.borderWidth !== undefined ? p.borderWidth : 2, color: parseColor(p.borderColor, 0x3b82f6) });
        node = pg;
      } else if (obj.type === 'ui_button') {
        var bc = new PIXI.Container();
        var b = obj.uiButton || {};
        var lB = -w * ax;
        var tB = -h * ay;
        var radB = Math.min(b.borderRadius !== undefined ? b.borderRadius : 8, w / 2, h / 2);
        var bg = new PIXI.Graphics();
        if (radB > 0) bg.roundRect(lB, tB, w, h, radB);
        else bg.rect(lB, tB, w, h);
        bg.fill({ color: parseColor(b.bgColor, 0x2563eb), alpha: 1 });
        bg.stroke({ width: 2, color: parseColor(b.borderColor, 0x60a5fa) });
        var bl = new PIXI.Text({
          text: b.text || 'Botón',
          style: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: Math.max(10, b.fontSize || 18), fontWeight: '700', fill: parseColor(b.textColor, 0xffffff), align: 'center' })
        });
        bl.anchor.set(0.5, 0.5);
        bl.position.set(lB + w * 0.5, tB + h * 0.5);
        bc.addChild(bg);
        bc.addChild(bl);
        bc.__btnGraphics = bg;
        node = bc;
      } else if (obj.type === 'ui_progress_bar') {
        var pbc = new PIXI.Container();
        pbc.__pbGraphics = new PIXI.Graphics();
        pbc.__pbLabel = new PIXI.Text({
          text: '',
          style: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: Math.max(10, Math.min(16, Math.round(h * 0.55))), fontWeight: '700', fill: 0xf8fafc })
        });
        pbc.__pbLabel.anchor.set(0.5, 0.5);
        pbc.__pbLabel.position.set(-w * ax + w * 0.5, -h * ay + h * 0.5);
        pbc.addChild(pbc.__pbGraphics);
        pbc.addChild(pbc.__pbLabel);
        node = pbc;
      } else if (obj.type === 'ui_leaderboard') {
        var lbc = new PIXI.Container();
        lbc.__lbRowsContainer = new PIXI.Container();
        var lb = obj.uiLeaderboard || {};
        var lL = -w * ax; var tL = -h * ay;
        var lbg = new PIXI.Graphics();
        lbg.roundRect(lL, tL, w, h, 10);
        lbg.fill({ color: parseColor(lb.bgColor, 0x0f172a), alpha: 0.94 });
        lbg.stroke({ width: 2, color: parseColor(lb.borderColor, 0x334155) });
        lbg.roundRect(lL + 4, tL + 4, Math.max(10, w - 8), 32, 6);
        lbg.fill({ color: parseColor(lb.accentColor, 0xf59e0b), alpha: 0.16 });
        var lTitle = new PIXI.Text({
          text: lb.title || 'MEJORES PUNTUACIONES',
          style: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 13, fontWeight: '700', fill: parseColor(lb.accentColor, 0xf59e0b) })
        });
        lTitle.anchor.set(0.5, 0.5);
        lTitle.position.set(lL + w * 0.5, tL + 20);
        lbc.addChild(lbg);
        lbc.addChild(lTitle);
        lbc.addChild(lbc.__lbRowsContainer);
        node = lbc;
      } else if (obj.type === 'tilemap') {
        var tc = new PIXI.Container();
        var tm = obj.tilemap;
        if (tm) {
          var ox = -tm.cols * tm.tileWidth * ax;
          var oy = -tm.rows * tm.tileHeight * ay;
          var tsTex = tm.assetId ? textures.get(tm.assetId) : null;
          var tileCache = new Map();
          var fallbackColors = [0x3b82f6, 0x10b981, 0xf59e0b, 0x64748b, 0xec4899, 0x8b5cf6];
          var fbG = new PIXI.Graphics();
          Object.keys(tm.cells || {}).forEach(function (key) {
            var parts = key.split(',');
            var col = Number(parts[0]);
            var row = Number(parts[1]);
            var tileIdx = tm.cells[key];
            var px = ox + col * tm.tileWidth;
            var py = oy + row * tm.tileHeight;
            if (tsTex) {
              var cached = tileCache.get(tileIdx);
              if (!cached) {
                var tsC = Math.max(1, tm.tilesetCols || 1);
                var tsR = Math.max(1, tm.tilesetRows || 1);
                cached = sliceSubTexture(tsTex, tileIdx % tsC, Math.floor(tileIdx / tsC) % tsR, tsC, tsR);
                tileCache.set(tileIdx, cached);
              }
              var ts = new PIXI.Sprite(cached);
              ts.position.set(px, py);
              ts.width = tm.tileWidth;
              ts.height = tm.tileHeight;
              tc.addChild(ts);
            } else {
              fbG.rect(px, py, tm.tileWidth, tm.tileHeight);
              fbG.fill({ color: fallbackColors[Math.abs(tileIdx) % fallbackColors.length], alpha: 0.9 });
            }
          });
          tc.addChild(fbG);
        }
        node = tc;
      } else {
        node = new PIXI.Container();
      }
      return node;
    }

    function mountActiveScene(sim) {
      var removed = sceneRoot.removeChildren();
      removed.forEach(function (ch) { ch.destroy({ children: true, texture: false, textureSource: false }); });
      bgRect.clear();
      bgRect.rect(0, 0, stageW, stageH);
      bgRect.fill({ color: parseColor(sim.scene.backgroundColor || gameData.settings.backgroundColor, 0x131b2e), alpha: 1 });

      sim.nodeMap.clear();
      sim.animatedSprites = [];

      var hasCollectibles = (sim.scene.mechanics || []).length > 0;
      sim.scene.objects.forEach(function (obj) {
        if (obj.components && obj.components.some(function (c) { return c.enabled && c.type === 'collectible'; })) hasCollectibles = true;
        var node = createDisplayForObject(obj, sim);
        node.position.set(obj.transform.x, obj.transform.y);
        node.rotation = obj.transform.rotation * DEG_TO_RAD;
        node.scale.set(obj.transform.scaleX * (obj.sprite && obj.sprite.flipX ? -1 : 1), obj.transform.scaleY * (obj.sprite && obj.sprite.flipY ? -1 : 1));
        node.alpha = obj.opacity;
        node.visible = obj.visible;
        sim.nodeMap.set(obj.id, node);
      });

      sim.scene.objects.forEach(function (obj) {
        var node = sim.nodeMap.get(obj.id);
        if (!node) return;
        if (obj.parentId && sim.nodeMap.has(obj.parentId)) sim.nodeMap.get(obj.parentId).addChild(node);
        else sceneRoot.addChild(node);
      });

      if (scoreBox) scoreBox.classList.toggle('hidden', !hasCollectibles);
      if (scoreSpan) scoreSpan.textContent = String(sim.variables.get('puntos') || 0);
    }

    function syncPersistentFrom(sim) {
      var pNames = new Set(['puntos', 'salud']);
      (gameData.variables || []).forEach(function (v) {
        if (v.scope === 'global' || v.scope === 'match') pNames.add(v.name);
      });
      pNames.forEach(function (k) {
        if (sim.variables.has(k)) persistentVars.set(k, sim.variables.get(k));
      });
    }

    function queueSceneMusic(sim, isOverlay) {
      var bgm = sim && sim.scene && sim.scene.backgroundMusic;
      if (bgm && bgm.assetId && bgm.autoPlay !== false) {
        playMusicAsset(bgm.assetId, bgm.volume !== undefined ? bgm.volume : 0.8, bgm.loop !== false, bgm.keepPlayingIfSameTrack !== false);
      } else if (!isOverlay && !(bgm && bgm.keepPlayingIfSameTrack)) {
        stopMusic();
      }
    }

    function loadSceneById(sceneId, transition) {
      var target = scenes.find(function (s) { return s.id === sceneId; });
      if (!target) return false;
      if (activeSim) syncPersistentFrom(activeSim);
      sceneStack = [];
      activeSim = buildSimState(target);
      mountActiveScene(activeSim);
      queueSceneMusic(activeSim, false);
      if (transition && transition !== 'none') transitionEffect = { type: transition, progress: 0, duration: 0.3 };
      return true;
    }

    function pushOverlayById(sceneId, transition) {
      var target = scenes.find(function (s) { return s.id === sceneId; });
      if (!target) return false;
      if (activeSim) {
        syncPersistentFrom(activeSim);
        sceneStack.push(activeSim);
      }
      activeSim = buildSimState(target);
      mountActiveScene(activeSim);
      queueSceneMusic(activeSim, true);
      if (transition && transition !== 'none') transitionEffect = { type: transition, progress: 0, duration: 0.2 };
      return true;
    }

    function popOverlay() {
      if (sceneStack.length === 0) return false;
      var popped = activeSim;
      if (activeSim) syncPersistentFrom(activeSim);
      activeSim = sceneStack.pop();
      persistentVars.forEach(function (val, k) { activeSim.variables.set(k, val); });
      mountActiveScene(activeSim);
      if (popped && popped.scene && popped.scene.backgroundMusic && popped.scene.backgroundMusic.assetId) {
        queueSceneMusic(activeSim, sceneStack.length > 0);
      }
      return true;
    }

    function nextLevelScene(explicitId, transition) {
      var cur = activeSim.scene;
      var cid = explicitId || cur.nextSceneId;
      if (cid && loadSceneById(cid, transition)) return true;
      var idx = scenes.findIndex(function (s) { return s.id === cur.id; });
      var nextLvl = scenes.slice(idx + 1).find(function (s) { return (s.kind || 'level') === 'level'; });
      if (nextLvl) return loadSceneById(nextLvl.id, transition);
      if (scenes[idx + 1]) return loadSceneById(scenes[idx + 1].id, transition);
      return false;
    }

    var startScene = scenes.find(function (s) { return s.id === (gameData.initialSceneId || gameData.activeSceneId); }) || scenes[0];
    loadSceneById(startScene.id, 'none');

    // Entradas universales (KeyboardEvent.code) y puntero/táctil
    var pressedKeys = new Set();
    var swipeStart = null;
    var input = {
      left: false, right: false, up: false, down: false, jump: false, action1: false, action2: false,
      pointerX: undefined, pointerY: undefined, pointerDown: false, pointerJustPressed: false, pointerJustReleased: false, swipeDir: null, pressedKeys: []
    };
    function syncLegacyKeys() {
      input.left = pressedKeys.has('ArrowLeft') || pressedKeys.has('KeyA');
      input.right = pressedKeys.has('ArrowRight') || pressedKeys.has('KeyD');
      input.up = pressedKeys.has('ArrowUp') || pressedKeys.has('KeyW');
      input.down = pressedKeys.has('ArrowDown') || pressedKeys.has('KeyS');
      input.jump = pressedKeys.has('Space');
      input.action1 = pressedKeys.has('KeyE') || pressedKeys.has('KeyJ') || pressedKeys.has('KeyZ');
      input.action2 = pressedKeys.has('KeyK') || pressedKeys.has('KeyX') || pressedKeys.has('ShiftLeft');
      input.pressedKeys = Array.from(pressedKeys);
    }
    function clearAllInput() {
      pressedKeys.clear();
      syncLegacyKeys();
      input.pointerDown = false;
    }
    window.addEventListener('keydown', function (e) {
      ensureAudio();
      var code = e.code || e.key;
      if (code) pressedKeys.add(code);
      syncLegacyKeys();
    });
    window.addEventListener('keyup', function (e) {
      var code = e.code || e.key;
      if (code) pressedKeys.delete(code);
      syncLegacyKeys();
    });
    window.addEventListener('blur', clearAllInput);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) clearAllInput();
    });
    window.addEventListener('nx-portal-event', function (e) {
      if (activeSim && e && e.detail && (e.detail.type === 'adClosed' || e.detail.type === 'rewarded')) {
        activeSim.portalEventsQueue.push(e.detail.type);
      }
    });

    function toWorldCoords(clientX, clientY) {
      var rect = app.canvas.getBoundingClientRect();
      var camX = activeSim ? activeSim.cameraPos.x : 0;
      var camY = activeSim ? activeSim.cameraPos.y : 0;
      return {
        x: (clientX - rect.left - baseWorldPos.x) / currentScale + camX,
        y: (clientY - rect.top - baseWorldPos.y) / currentScale + camY
      };
    }

    function pickClickableAt(clientX, clientY, uiOnly) {
      if (!activeSim) return null;
      var pt = toWorldCoords(clientX, clientY);
      var objs = activeSim.scene.objects;
      for (var i = objs.length - 1; i >= 0; i--) {
        var o = objs[i];
        if (!o.visible) continue;
        var hasClickTrigger = !uiOnly && o.components && o.components.some(function (c) { return c.enabled && c.type === 'audio.sound_trigger' && c.config && c.config.event === 'onClick'; });
        if (o.type !== 'ui_button' && !hasClickTrigger) continue;
        var w = Math.abs(o.transform.width * o.transform.scaleX);
        var h = Math.abs(o.transform.height * o.transform.scaleY);
        var l = o.transform.x - w * o.transform.anchorX;
        var t = o.transform.y - h * o.transform.anchorY;
        if (pt.x >= l && pt.x <= l + w && pt.y >= t && pt.y <= t + h) return o.id;
      }
      return null;
    }

    app.canvas.addEventListener('pointermove', function (e) {
      var pt = toWorldCoords(e.clientX, e.clientY);
      input.pointerX = pt.x; input.pointerY = pt.y;
      if (!activeSim) return;
      var hid = pickClickableAt(e.clientX, e.clientY, true);
      activeSim.hoveredObjectId = hid;
      app.canvas.style.cursor = pickClickableAt(e.clientX, e.clientY, false) ? 'pointer' : 'default';
    });
    app.canvas.addEventListener('pointerdown', function (e) {
      ensureAudio();
      var pt = toWorldCoords(e.clientX, e.clientY);
      input.pointerX = pt.x; input.pointerY = pt.y;
      input.pointerDown = true; input.pointerJustPressed = true;
      swipeStart = { x: e.clientX, y: e.clientY };
      if (!activeSim) return;
      var cid = pickClickableAt(e.clientX, e.clientY, false);
      if (cid) activeSim.clickedObjectIds.push(cid);
    });
    window.addEventListener('pointerup', function (e) {
      input.pointerDown = false; input.pointerJustReleased = true;
      if (swipeStart) {
        var dx = e.clientX - swipeStart.x; var dy = e.clientY - swipeStart.y;
        if (Math.hypot(dx, dy) >= 42) {
          input.swipeDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        }
        swipeStart = null;
      }
    });

    document.querySelectorAll('[data-key]').forEach(function (btn) {
      var k = btn.getAttribute('data-key');
      btn.addEventListener('pointerdown', function () { ensureAudio(); input[k] = true; });
      btn.addEventListener('pointerup', function () { input[k] = false; });
      btn.addEventListener('pointercancel', function () { input[k] = false; });
      btn.addEventListener('pointerleave', function () { input[k] = false; });
    });

    var paused = false;
    var pauseOverlay = document.getElementById('nx-pause-overlay');
    var pauseBtn = document.getElementById('nx-pause-btn');
    var resumeBtn = document.getElementById('nx-resume-btn');
    var fsBtn = document.getElementById('nx-fs-btn');

    function setPaused(next) {
      paused = next;
      if (pauseOverlay) pauseOverlay.classList.toggle('hidden', !paused);
      if (window.NexusPortal) {
        if (paused) window.NexusPortal.gameplayStop();
        else window.NexusPortal.gameplayStart();
      }
      if (activeSim) {
        activeSim.animatedSprites.forEach(function (s) { if (paused) s.stop(); else s.play(); });
      }
    }
    if (pauseBtn) pauseBtn.addEventListener('click', function () { setPaused(!paused); });
    if (resumeBtn) resumeBtn.addEventListener('click', function () { setPaused(false); });
    if (fsBtn) {
      fsBtn.addEventListener('click', function () {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {});
        else document.exitFullscreen().catch(function () {});
      });
    }

    function collectSolids(sim) {
      var boxes = [];
      sim.scene.objects.forEach(function (obj) {
        if (!obj.visible) return;
        var hasSolid = obj.components && obj.components.some(function (c) { return c.enabled && c.type === 'solid'; });
        var isStatic = obj.rigidbody && obj.rigidbody.bodyType === 'static';
        if (!hasSolid && !isStatic) return;
        if (obj.type === 'tilemap' && obj.tilemap && hasSolid) {
          var tm = obj.tilemap;
          var tw = tm.tileWidth * obj.transform.scaleX;
          var th = tm.tileHeight * obj.transform.scaleY;
          var ox = obj.transform.x - tm.cols * tw * obj.transform.anchorX;
          var oy = obj.transform.y - tm.rows * th * obj.transform.anchorY;
          Object.keys(tm.cells || {}).forEach(function (key) {
            var p = key.split(',');
            var l = ox + Number(p[0]) * tw;
            var t = oy + Number(p[1]) * th;
            boxes.push({ left: l, right: l + tw, top: t, bottom: t + th, layer: obj.layer || 'Ground', mask: undefined });
          });
        } else {
          getWorldColliders(obj).forEach(function (c) {
            if (!c.isSensor) boxes.push(c);
          });
        }
      });
      return boxes;
    }

    function resolveH(obj, body, solids) {
      var cols = getWorldColliders(obj).filter(function (c) { return !c.isSensor; });
      for (var i = 0; i < cols.length; i++) {
        for (var j = 0; j < solids.length; j++) {
          var c = cols[i]; var s = solids[j];
          if (!canLayersCollide(c.layer, s.layer, c.mask, s.mask)) continue;
          if (colsOverlap(c, s)) {
            if (body.vx > 0) obj.transform.x -= c.right - s.left;
            else if (body.vx < 0) obj.transform.x += s.right - c.left;
            body.vx = 0;
            return true;
          }
        }
      }
      return false;
    }

    function resolveV(obj, body, solids) {
      body.grounded = false;
      var cols = getWorldColliders(obj).filter(function (c) { return !c.isSensor; });
      for (var i = 0; i < cols.length; i++) {
        for (var j = 0; j < solids.length; j++) {
          var c = cols[i]; var s = solids[j];
          if (!canLayersCollide(c.layer, s.layer, c.mask, s.mask)) continue;
          if (colsOverlap(c, s)) {
            if (body.vy > 0) { obj.transform.y -= c.bottom - s.top; body.vy = 0; body.grounded = true; }
            else if (body.vy < 0) { obj.transform.y += s.bottom - c.top; body.vy = 0; }
          }
        }
      }
    }

    function keyMatch(key, inp) {
      if (inp.pressedKeys && Array.isArray(inp.pressedKeys) && inp.pressedKeys.indexOf(key) >= 0) return true;
      if (key === 'Space') return Boolean(inp.jump);
      if (key === 'ArrowLeft' || key === 'KeyA') return Boolean(inp.left);
      if (key === 'ArrowRight' || key === 'KeyD') return Boolean(inp.right);
      if (key === 'ArrowUp' || key === 'KeyW') return Boolean(inp.up);
      if (key === 'ArrowDown' || key === 'KeyS') return Boolean(inp.down);
      if (key === 'KeyE' || key === 'KeyJ' || key === 'KeyZ') return Boolean(inp.action1);
      if (key === 'KeyK' || key === 'KeyX' || key === 'ShiftLeft') return Boolean(inp.action2);
      return false;
    }

    function cmpVal(lv, op, rv) {
      var ln = Number(lv); var rn = Number(rv);
      var bothNum = !isNaN(ln) && !isNaN(rn) && String(lv).trim() !== '' && String(rv).trim() !== '';
      var a = bothNum ? ln : lv; var b = bothNum ? rn : rv;
      if (op === '>') return a > b;
      if (op === '>=') return a >= b;
      if (op === '<') return a < b;
      if (op === '<=') return a <= b;
      if (op === '!=') return String(lv) !== String(rv);
      return bothNum ? a === b : String(lv) === String(rv);
    }

    function readObjProp(obj, prop, sim) {
      var bd = sim.bodies.get(obj.id);
      if (prop === 'x') return obj.transform.x;
      if (prop === 'y') return obj.transform.y;
      if (prop === 'rotation') return obj.transform.rotation;
      if (prop === 'scaleX') return obj.transform.scaleX;
      if (prop === 'scaleY') return obj.transform.scaleY;
      if (prop === 'opacity') return obj.opacity;
      if (prop === 'vx') return bd ? bd.vx : 0;
      if (prop === 'vy') return bd ? bd.vy : 0;
      if (prop === 'health') return bd ? bd.health : 0;
      if (prop === 'visible') return obj.visible;
      if (prop === 'flipped') return Boolean(obj.sprite && obj.sprite.flipX);
      return 0;
    }

    function evalCondition(cond, sim, objMap) {
      if (cond.type === 'boolean') return Boolean(sim.variables.get(cond.variable)) === (cond.value === undefined ? true : Boolean(cond.value));
      if (cond.type === 'variable.compare') return cmpVal(sim.variables.get(cond.variable) !== undefined ? sim.variables.get(cond.variable) : 0, cond.operator || '==', cond.value !== undefined ? cond.value : 0);
      if (cond.type === 'variable.objectCompare') return cmpVal(sim.variables.get(cond.variable) || 0, cond.operator || '==', sim.variables.get(cond.secondaryVariable) || 0);
      if (cond.type === 'object.visible') { var o = objMap.get(cond.target); return Boolean(o && o.visible === (cond.value === undefined ? true : Boolean(cond.value))); }
      if (cond.type === 'object.exists') return Boolean(objMap.get(cond.target));
      if (cond.type === 'object.grounded') { var bd = sim.bodies.get(cond.target); return Boolean(bd && bd.grounded === (cond.value === undefined ? true : Boolean(cond.value))); }
      if (cond.type === 'object.property') { var opo = objMap.get(cond.target); return opo ? cmpVal(readObjProp(opo, cond.property || 'x', sim), cond.operator || '==', cond.value || 0) : false; }
      if (cond.type === 'object.hasTag') { var hto = objMap.get(cond.target); var tg = String(cond.tag || cond.value || '').trim(); return Boolean(hto && tg && hto.tags && hto.tags.indexOf(tg) >= 0); }
      if (cond.type === 'object.animating') { var ao = objMap.get(cond.target); return Boolean(ao && ao.sprite && ao.sprite.animation && ao.sprite.animation.enabled && ao.sprite.animation.playing); }
      if (cond.type === 'object.flipped') { var fo = objMap.get(cond.target); return Boolean(fo && Boolean(fo.sprite && fo.sprite.flipX) === (cond.value === undefined ? true : Boolean(cond.value))); }
      if (cond.type === 'health.compare') { var hbd = sim.bodies.get(cond.target); return hbd ? cmpVal(hbd.health, cond.operator || '<=', Number(cond.value || 0)) : false; }
      if (cond.type === 'state.is') { var so = objMap.get(cond.target); return Boolean(so && so.stateMachine && so.stateMachine.currentState === String(cond.value || '')); }
      if (cond.type === 'input.held') return keyMatch(cond.key || 'Space', input);
      if (cond.type === 'distance.less') {
        var da = objMap.get(cond.target); var db = objMap.get(cond.secondaryTarget);
        if (!da || !db || !da.visible || !db.visible) return false;
        return Math.hypot(da.transform.x - db.transform.x, da.transform.y - db.transform.y) <= Number(cond.value || 120);
      }
      if (cond.type === 'distance.greater') {
        var ga = objMap.get(cond.target); var gb = objMap.get(cond.secondaryTarget);
        if (!ga || !gb || !ga.visible || !gb.visible) return false;
        return Math.hypot(ga.transform.x - gb.transform.x, ga.transform.y - gb.transform.y) > Number(cond.value || 200);
      }
      if (cond.type === 'random.chance') return Math.random() * 100 < Math.max(0, Math.min(100, Number(cond.value !== undefined ? cond.value : 50)));
      return true;
    }

    function applyDamage(sim, target, dmg, invuln) {
      var hb = sim.bodies.get(target.id);
      if (!hb || hb.invulnerableTimer > 0) return false;
      var comps = target.components || [];
      if (comps.some(function (c) { return c.enabled && c.type === 'combat.shield_block' && c.config._active; })) return false;
      hb.health = Math.max(0, hb.health - Math.max(0, dmg));
      hb.invulnerableTimer = invuln !== undefined ? invuln : 0.35;
      if (comps.some(function (c) { return c.enabled && (c.type === 'player_platformer' || c.type === 'player_topdown' || c.type === 'movement.platformer_pro' || c.type === 'movement.topdown_8dir' || c.type === 'movement.vehicle_drift'); })) {
        sim.variables.set('salud', hb.health);
      }
      if (comps.some(function (c) { return c.enabled && c.type === 'juice.hit_flash'; })) {
        sim.flashTimers.set(target.id, { color: '#ffffff', remaining: 0.14 });
      }
      var shk = comps.find(function (c) { return c.enabled && c.type === 'juice.screen_shake'; });
      if (shk) {
        sim.shakeIntensity = Math.max(sim.shakeIntensity, Number(shk.config.intensity || 8));
        sim.shakeRemaining = Math.max(sim.shakeRemaining, Number(shk.config.duration || 0.25));
      }
      if (hb.health <= 0) {
        var drop = comps.find(function (c) { return c.enabled && c.type === 'economy.currency_drop'; });
        if (drop) {
          var dvn = String(drop.config.variable || 'puntos');
          var dnext = (Number(sim.variables.get(dvn) || 0) || 0) + Number(drop.config.amount || 25);
          sim.variables.set(dvn, dnext);
          if (sim.persistentVarNames.has(dvn)) writeStoredVar(dvn, dnext);
          if (dvn === 'puntos' && scoreSpan) scoreSpan.textContent = String(dnext);
        }
        var hpSys = comps.find(function (c) { return c.enabled && c.type === 'combat.health_system'; });
        if (!hpSys || hpSys.config.destroyOnZero !== false) {
          target.visible = false;
          comps.forEach(function (c) {
            if (c.enabled && c.type === 'audio.sound_trigger' && c.config && c.config.event === 'onDestroy') {
              var aid = String(c.config.audioAssetId || '');
              var chD = c.config.channel || 'sfx';
              var vD = Number(c.config.volume !== undefined ? c.config.volume : 1);
              var pD = Number(c.config.pitch || 1);
              if (aid) playAudioAsset(aid, vD, pD, chD, false);
              else playSynth(c.config.preset || 'hit', vD, pD, chD);
            }
          });
        }
      }
      return true;
    }

    function emitBurstFromConfig(sim, x, y, cfg, count) {
      if (sim.emitterParticles.length >= 420) return;
      var angB = ((cfg.angleDeg || 0) * Math.PI) / 180;
      var sprR = ((cfg.spreadDeg || 360) * Math.PI) / 180;
      var sMin = Math.min(cfg.speedMin || 40, cfg.speedMax || 120);
      var sMax = Math.max(cfg.speedMin || 40, cfg.speedMax || 120);
      for (var i = 0; i < count; i++) {
        var a = angB + (Math.random() - 0.5) * sprR;
        var s = sMin + Math.random() * (sMax - sMin);
        sim.emitterParticles.push({
          x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gravity: cfg.gravity || 0,
          sizeStart: cfg.sizeStart || 5, sizeEnd: cfg.sizeEnd !== undefined ? cfg.sizeEnd : 1,
          colorStart: cfg.colorStart || '#fde047', colorEnd: cfg.colorEnd || '#ef4444',
          alpha: cfg.blendAlpha !== undefined ? cfg.blendAlpha : 0.9,
          age: 0, maxAge: Math.max(0.08, (cfg.lifetime || 0.6) * (0.85 + Math.random() * 0.3))
        });
      }
    }

    function cloneIntoScene(sim, objMap, tpl, x, y) {
      var copy = cloneData(tpl);
      copy.id = 'clone_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      copy.name = tpl.name + '_' + (sim.scene.objects.length + 1);
      copy.visible = true;
      copy.transform.x = x; copy.transform.y = y;
      sim.scene.objects.push(copy);
      sim.bodies.set(copy.id, createBodyForObj(copy));
      objMap.set(copy.id, copy);
      var dn = createDisplayForObject(copy, sim);
      sim.nodeMap.set(copy.id, dn);
      sceneRoot.addChild(dn);
      return copy;
    }

    function spawnProjRuntime(sim, objMap, owner, vx, vy, dmg, color, layer, homingTag) {
      var pid = 'proj_' + Math.random().toString(36).slice(2, 9);
      var pObj = {
        id: pid, name: 'Proyectil_' + (sim.scene.objects.length + 1), type: 'circle', parentId: null,
        visible: true, locked: false, opacity: 1, layer: layer, tags: [layer === 'Enemy' ? 'EnemyProjectile' : 'PlayerProjectile'],
        transform: { x: owner.transform.x + (vx >= 0 ? 18 : -18), y: owner.transform.y, rotation: (Math.atan2(vy, vx) * 180) / Math.PI, scaleX: 1, scaleY: 1, width: 14, height: 14, anchorX: 0.5, anchorY: 0.5 },
        circle: { fillColor: color || '#facc15', strokeColor: '#ffffff', strokeWidth: 1.5, radius: 7 },
        components: [{ id: pid + '_p', type: 'projectile', enabled: true, config: { vx: vx, vy: vy, damage: dmg, lifetimeSec: 2.5, destroyOnSolid: true, ownerId: owner.id } }]
      };
      if (homingTag) pObj.components.push({ id: pid + '_h', type: 'combat.homing_missile', enabled: true, config: { speed: Math.hypot(vx, vy) || 320, turnRate: 6, targetTag: homingTag, damage: dmg } });
      sim.scene.objects.push(pObj);
      objMap.set(pid, pObj);
      sim.bodies.set(pid, createBodyForObj(pObj));
      var dn = createDisplayForObject(pObj, sim);
      sim.nodeMap.set(pid, dn);
      sceneRoot.addChild(dn);
    }

    function runActionList(actions, mechId, sim, objMap) {
      for (var i = 0; i < actions.length; i++) {
        var act = actions[i];
        var p = act.parameters || {};
        if (act.type === 'wait') {
          var rem = actions.slice(i + 1);
          if (rem.length > 0) sim.pendingWaits.push({ remainingSec: Math.max(0.01, Number(p.seconds || p.duration || 0.5)), actions: rem, mechId: mechId });
          break;
        }
        if (act.type === 'variable.add') {
          var vn = String(p.variable || 'puntos');
          var nv = (Number(sim.variables.get(vn) || 0) || 0) + (Number(p.amount !== undefined ? p.amount : 1) || 0);
          sim.variables.set(vn, nv);
          if (sim.persistentVarNames.has(vn)) writeStoredVar(vn, nv);
          if ((vn === 'puntos' || vn === 'score') && scoreSpan) scoreSpan.textContent = String(nv);
        } else if (act.type === 'variable.set') {
          var vs = String(p.variable || 'puntos');
          var rawVal = p.value;
          var parsedV = typeof rawVal === 'boolean' || typeof rawVal === 'number' ? rawVal : (!isNaN(Number(rawVal)) && String(rawVal).trim() !== '' ? Number(rawVal) : String(rawVal || ''));
          sim.variables.set(vs, parsedV);
          if (sim.persistentVarNames.has(vs)) writeStoredVar(vs, parsedV);
          if ((vs === 'puntos' || vs === 'score') && scoreSpan) scoreSpan.textContent = String(parsedV);
        } else if (act.type === 'audio.beep') {
          var rp = Number(p.randomPitch || 0); var rv = Number(p.randomVolume || 0);
          var pitch = Number(p.pitch || 1) + (rp > 0 ? (Math.random() * 2 - 1) * rp : 0);
          var vol = Number(p.volume || 1) + (rv > 0 ? (Math.random() * 2 - 1) * rv : 0);
          playSynth(p.preset || 'coin', Math.max(0.05, Math.min(2, vol)), pitch, p.channel || 'sfx');
        } else if (act.type === 'audio.play') {
          var rpA = Number(p.randomPitch || 0);
          var pitchA = Number(p.pitch || 1) + (rpA > 0 ? (Math.random() * 2 - 1) * rpA : 0);
          playAudioAsset(p.assetId || p.asset, Number(p.volume !== undefined ? p.volume : 1), pitchA, p.channel || 'sfx', Boolean(p.loop));
        } else if (act.type === 'music.play') {
          playMusicAsset(p.assetId || p.asset, p.volume !== undefined ? Number(p.volume) : 0.85, p.loop !== false, p.keepIfSame !== false);
        } else if (act.type === 'music.stop') {
          stopMusic();
        } else if (act.type === 'audio.stopAll') {
          stopAllAudio();
        } else if (act.type === 'audio.setVolume') {
          var ch = p.channel || 'master';
          buses[ch] = Math.max(0, Math.min(1, Number(p.volume !== undefined ? p.volume : 0.8)));
          syncBusGains();
        } else if (act.type === 'object.destroy' || act.type === 'object.hide') {
          var to = objMap.get(p.target);
          if (to && to.visible) {
            to.visible = false;
            (to.components || []).forEach(function (c) {
              if (c.enabled && c.type === 'audio.sound_trigger' && c.config && c.config.event === 'onDestroy') {
                var aid = String(c.config.audioAssetId || '');
                var chD = c.config.channel || 'sfx';
                var vD = Number(c.config.volume !== undefined ? c.config.volume : 1);
                var pD = Number(c.config.pitch || 1);
                if (aid) playAudioAsset(aid, vD, pD, chD, false);
                else playSynth(c.config.preset || 'hit', vD, pD, chD);
              }
            });
          }
        } else if (act.type === 'object.show') {
          var ts = objMap.get(p.target); if (ts) ts.visible = true;
        } else if (act.type === 'object.move') {
          var tm = objMap.get(p.target); if (tm) { tm.transform.x += Number(p.dx || 0); tm.transform.y += Number(p.dy || 0); }
        } else if (act.type === 'object.teleport') {
          var tt = objMap.get(p.target);
          if (tt) {
            if (p.toCheckpoint && sim.checkpoint) { tt.transform.x = sim.checkpoint.x; tt.transform.y = sim.checkpoint.y; }
            else { if (p.x !== undefined) tt.transform.x = Number(p.x); if (p.y !== undefined) tt.transform.y = Number(p.y); }
            var tb = sim.bodies.get(tt.id); if (tb) { tb.vx = 0; tb.vy = 0; }
          }
        } else if (act.type === 'object.spawn') {
          var tplO = objMap.get(p.target);
          if (tplO) {
            var ancS = p.atObjectId ? objMap.get(p.atObjectId) : null;
            cloneIntoScene(sim, objMap, tplO, ancS ? ancS.transform.x + Number(p.offsetX || 0) : Number(p.x !== undefined ? p.x : tplO.transform.x), ancS ? ancS.transform.y + Number(p.offsetY || 0) : Number(p.y !== undefined ? p.y : tplO.transform.y));
          }
        } else if (act.type === 'object.setProperty') {
          var spO = objMap.get(p.target);
          if (spO) {
            var pr = String(p.property || 'opacity'); var pv = Number(p.value || 0);
            if (pr === 'x') spO.transform.x = pv;
            else if (pr === 'y') spO.transform.y = pv;
            else if (pr === 'rotation') spO.transform.rotation = pv;
            else if (pr === 'scaleX') spO.transform.scaleX = pv;
            else if (pr === 'scaleY') spO.transform.scaleY = pv;
            else if (pr === 'opacity') spO.opacity = Math.max(0, Math.min(1, pv));
            else if (pr === 'flipX' && spO.sprite) spO.sprite.flipX = Boolean(p.value);
            else if (pr === 'text' && spO.text) spO.text.text = String(p.value || '');
          }
        } else if (act.type === 'object.rotateToward') {
          var rtO = objMap.get(p.target); var lkO = objMap.get(p.lookAtTarget);
          if (rtO && lkO) rtO.transform.rotation = (Math.atan2(lkO.transform.y - rtO.transform.y, lkO.transform.x - rtO.transform.x) * 180) / Math.PI;
        } else if (act.type === 'object.flash') {
          var flO = objMap.get(p.target); var flC = String(p.color || '#ffffff'); var flD = Math.max(0.05, Number(p.duration || 0.18));
          if (flO) sim.flashTimers.set(flO.id, { color: flC, remaining: flD });
          else sim.screenFlash = { color: flC, alpha: 0.7, duration: flD, age: 0 };
        } else if (act.type === 'component.toggle') {
          var ctO = objMap.get(p.target);
          if (ctO && p.componentType) (ctO.components || []).forEach(function (c) { if (c.type === p.componentType) c.enabled = p.enabled === 'toggle' ? !c.enabled : Boolean(p.enabled !== false); });
        } else if (act.type === 'physics.impulse') {
          var ib = sim.bodies.get(p.target); if (ib) { ib.vx += Number(p.ix || 0); ib.vy += Number(p.iy || 0); }
        } else if (act.type === 'physics.force') {
          var fb = sim.bodies.get(p.target); if (fb) { fb.ax += Number(p.fx || 0); fb.ay += Number(p.fy || 0); }
        } else if (act.type === 'physics.setVelocity') {
          var vb = sim.bodies.get(p.target);
          if (vb) { if (p.vx !== undefined && p.vx !== '') vb.vx = Number(p.vx); if (p.vy !== undefined && p.vy !== '') vb.vy = Number(p.vy); }
        } else if (act.type === 'health.damage') {
          var ho = objMap.get(p.target);
          if (ho) applyDamage(sim, ho, Math.max(0, Number(p.amount || 10)), Number(p.invulnerability !== undefined ? p.invulnerability : 0.35));
        } else if (act.type === 'health.heal') {
          var hbo = sim.bodies.get(p.target);
          if (hbo) { hbo.health = Math.min(hbo.maxHealth, hbo.health + Math.max(0, Number(p.amount || 20))); sim.variables.set('salud', hbo.health); }
        } else if (act.type === 'animation.play') {
          var anO = objMap.get(p.target);
          if (anO && anO.sprite && anO.sprite.animation) {
            anO.sprite.animation.enabled = true; anO.sprite.animation.playing = true;
            if (p.clip) anO.sprite.animation.activeClip = String(p.clip);
          }
        } else if (act.type === 'tween.play') {
          var twO = objMap.get(p.target); var tName = String(p.trackName || '').trim();
          if (twO && twO.tweens) {
            twO.tweens.forEach(function (tr) {
              if (!tName || tr.name === tName || tr.id === tName) sim.tweenStates.set(twO.id + ':' + tr.id, { elapsed: 0, playing: true });
            });
          }
        } else if (act.type === 'state.set') {
          var stObj = objMap.get(p.target);
          if (stObj) stObj.stateMachine = { currentState: String(p.state || 'idle'), states: (stObj.stateMachine && stObj.stateMachine.states) || [] };
        } else if (act.type === 'checkpoint.save') {
          var cpo = objMap.get(p.target); if (cpo) sim.checkpoint = { x: cpo.transform.x, y: cpo.transform.y };
        } else if (act.type === 'scene.load' && p.sceneId) {
          sim.pendingSceneCommand = { kind: 'load', sceneId: String(p.sceneId), transition: p.transition || 'fadeBlack' };
        } else if (act.type === 'scene.overlay' && p.sceneId) {
          sim.pendingSceneCommand = { kind: 'overlay', sceneId: String(p.sceneId), transition: p.transition || 'none' };
        } else if (act.type === 'scene.pop') {
          sim.pendingSceneCommand = { kind: 'pop' };
        } else if (act.type === 'scene.restart') {
          sim.pendingSceneCommand = { kind: 'restart', transition: p.transition || 'fadeBlack' };
        } else if (act.type === 'scene.nextLevel') {
          sim.pendingSceneCommand = { kind: 'nextLevel', sceneId: sim.scene.nextSceneId, transition: p.transition || 'fadeBlack' };
        } else if (act.type === 'scene.pause') {
          setPaused(!paused);
        } else if (act.type === 'prefab.spawn' && prefabMap.has(p.prefabId)) {
          var pf = prefabMap.get(p.prefabId);
          var anc = p.atObjectId ? objMap.get(p.atObjectId) : null;
          var sx = anc ? anc.transform.x + Number(p.offsetX || 0) : Number(p.x || 640);
          var sy = anc ? anc.transform.y + Number(p.offsetY || 0) : Number(p.y || 360);
          var rootOrig = pf.objects.find(function (o) { return o.id === pf.rootObjectId; }) || pf.objects[0];
          var bx = rootOrig ? rootOrig.transform.x : 0; var by = rootOrig ? rootOrig.transform.y : 0;
          pf.objects.forEach(function (orig, idx) {
            var copy = cloneData(orig);
            copy.id = 'inst_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '_' + idx;
            copy.parentId = null;
            copy.transform.x = sx + (orig.transform.x - bx);
            copy.transform.y = sy + (orig.transform.y - by);
            sim.scene.objects.push(copy);
            sim.bodies.set(copy.id, createBodyForObj(copy));
            objMap.set(copy.id, copy);
            var dn = createDisplayForObject(copy, sim);
            sim.nodeMap.set(copy.id, dn);
            sceneRoot.addChild(dn);
          });
        } else if (act.type === 'camera.shake') {
          sim.shakeIntensity = Math.max(sim.shakeIntensity, Number(p.intensity || 8));
          sim.shakeRemaining = Math.max(sim.shakeRemaining, Number(p.duration || 0.25));
        } else if (act.type === 'particles.burst') {
          var ptObj = objMap.get(p.target);
          sim.particles.push({ x: ptObj ? ptObj.transform.x : stageW / 2, y: ptObj ? ptObj.transform.y : stageH / 2, color: parseColor(p.color, 0x34d399), count: Math.min(24, Number(p.count || 12)), age: 0, duration: 0.45 });
        } else if (act.type === 'particles.emit') {
          var peObj = objMap.get(p.target);
          var defs = getParticleDefaults(p.preset || 'explosion');
          emitBurstFromConfig(sim, peObj ? peObj.transform.x : Number(p.x || stageW / 2), peObj ? peObj.transform.y : Number(p.y || stageH / 2), Object.assign({}, defs, { colorStart: p.color || defs.colorStart }), Math.max(4, Math.min(48, Number(p.count || 18))));
        } else if (act.type === 'storage.save') {
          var svn = String(p.variable || 'puntos');
          if (sim.variables.has(svn)) { sim.persistentVarNames.add(svn); writeStoredVar(svn, sim.variables.get(svn)); }
        } else if (act.type === 'storage.load') {
          var lvn = String(p.variable || 'puntos');
          var lv = readStoredVar(lvn, sim.variables.has(lvn) ? sim.variables.get(lvn) : 0);
          sim.variables.set(lvn, lv);
          if ((lvn === 'puntos' || lvn === 'score') && scoreSpan) scoreSpan.textContent = String(lv);
        } else if (act.type === 'leaderboard.submit') {
          var lvar = String(p.variable || 'puntos');
          var scVal = Number(sim.variables.get(lvar) || 0) || 0;
          var pName = String(p.playerName || 'Jugador').trim() || 'Jugador';
          if (window.NexusPortal && window.NexusPortal.submitScore) {
            sharedLeaderboard = window.NexusPortal.submitScore('default', scVal, pName);
          } else {
            sharedLeaderboard.push({ name: pName, score: Math.round(scVal), date: Date.now() });
            sharedLeaderboard.sort(function (a, b) { return b.score - a.score; });
            sharedLeaderboard = sharedLeaderboard.slice(0, 10);
          }
          sim.leaderboard = sharedLeaderboard.slice(0, 10);
          sim.leaderboardDirty = true;
        } else if (act.type === 'event.emit' && p.eventName) {
          sim.emittedEvents.push(String(p.eventName));
        }
      }
    }

    function stepExtendedComp(obj, c, sim, objMap, players, solids, dt, clickedSet) {
      var body = sim.bodies.get(obj.id);
      if (!body) return;
      var cfg = c.config || {};
      var wasK = function (k) { return keyMatch(k, sim.prevInput); };
      if (c.type === 'movement.sine_float') {
        var ph = sim.elapsed * Number(cfg.frequency || 1.2) * Math.PI * 2;
        if (cfg.axis === 'x') obj.transform.x = body.originX + Math.sin(ph) * Number(cfg.amplitude || 14);
        else obj.transform.y = body.originY + Math.sin(ph) * Number(cfg.amplitude || 14);
      } else if (c.type === 'movement.orbit') {
        body.patrolPhase += ((Number(cfg.angularSpeed || 140) * Math.PI) / 180) * dt;
        var ocx = body.originX; var ocy = body.originY;
        var otg = String(cfg.targetTag || '').trim();
        if (otg) {
          var co = sim.scene.objects.find(function (o) { return o.visible && o.id !== obj.id && ((o.tags && o.tags.indexOf(otg) >= 0) || o.name === otg); });
          if (co) { ocx = co.transform.x; ocy = co.transform.y; }
        }
        var orad = Number(cfg.radius || 80);
        obj.transform.x = ocx + Math.cos(body.patrolPhase) * orad;
        obj.transform.y = ocy + Math.sin(body.patrolPhase) * orad;
      } else if (c.type === 'movement.follow_mouse' && input.pointerX !== undefined && input.pointerY !== undefined) {
        var fdx = input.pointerX - obj.transform.x; var fdy = input.pointerY - obj.transform.y;
        var fdist = Math.hypot(fdx, fdy);
        if (fdist > Number(cfg.stopDistance || 6)) {
          var fspd = Number(cfg.speed || 320);
          if (fspd <= 0) { obj.transform.x = input.pointerX; obj.transform.y = input.pointerY; }
          else { var fst = Math.min(fdist, fspd * dt); obj.transform.x += (fdx / fdist) * fst; obj.transform.y += (fdy / fdist) * fst; }
        }
      } else if (c.type === 'movement.look_at_mouse' && input.pointerX !== undefined && input.pointerY !== undefined) {
        obj.transform.rotation = (Math.atan2(input.pointerY - obj.transform.y, input.pointerX - obj.transform.x) * 180) / Math.PI + Number(cfg.offsetDeg || 0);
      } else if (c.type === 'movement.constant_velocity') {
        body.vx = Number(cfg.vx !== undefined ? cfg.vx : -120); body.vy = Number(cfg.vy || 0);
        obj.transform.x += body.vx * dt; obj.transform.y += body.vy * dt;
      } else if (c.type === 'movement.screen_wrap') {
        var wm = Number(cfg.margin || 24);
        if (obj.transform.x < -wm) obj.transform.x = stageW + wm; else if (obj.transform.x > stageW + wm) obj.transform.x = -wm;
        if (obj.transform.y < -wm) obj.transform.y = stageH + wm; else if (obj.transform.y > stageH + wm) obj.transform.y = -wm;
      } else if (c.type === 'movement.keep_in_bounds') {
        var kpad = Number(cfg.padding || 16);
        var khw = Math.abs(obj.transform.width * obj.transform.scaleX) * 0.5;
        var khh = Math.abs(obj.transform.height * obj.transform.scaleY) * 0.5;
        obj.transform.x = Math.max(kpad + khw, Math.min(stageW - kpad - khw, obj.transform.x));
        obj.transform.y = Math.max(kpad + khh, Math.min(stageH - kpad - khh, obj.transform.y));
      } else if (c.type === 'movement.path_waypoints') {
        var pts = String(cfg.waypoints || '').split(';').map(function (s) { return s.split(',').map(function (n) { return Number(n.trim()); }); }).filter(function (a) { return a.length >= 2 && isFinite(a[0]) && isFinite(a[1]); });
        if (pts.length >= 2) {
          var pspd = Math.max(5, Number(cfg.speed || 140));
          var idx = Math.max(0, Math.min(pts.length - 1, body.waypointIndex || 0));
          var tpt = pts[idx]; var pdx = tpt[0] - obj.transform.x; var pdy = tpt[1] - obj.transform.y; var pd = Math.hypot(pdx, pdy);
          if (pd <= pspd * dt + 2) {
            obj.transform.x = tpt[0]; obj.transform.y = tpt[1];
            if (cfg.pingPong) {
              if (body.waypointForward !== false) { if (idx + 1 >= pts.length) { body.waypointForward = false; body.waypointIndex = Math.max(0, idx - 1); } else body.waypointIndex = idx + 1; }
              else { if (idx - 1 < 0) { body.waypointForward = true; body.waypointIndex = Math.min(pts.length - 1, 1); } else body.waypointIndex = idx - 1; }
            } else body.waypointIndex = (idx + 1) % pts.length;
          } else {
            body.vx = (pdx / pd) * pspd; body.vy = (pdy / pd) * pspd;
            obj.transform.x += body.vx * dt; obj.transform.y += body.vy * dt;
            if (cfg.rotateToPath) obj.transform.rotation = (Math.atan2(pdy, pdx) * 180) / Math.PI;
          }
        }
      } else if (c.type === 'movement.elastic_bounce') {
        if (!body.customInitialized) { body.vx = Number(cfg.vx !== undefined ? cfg.vx : 240); body.vy = Number(cfg.vy !== undefined ? cfg.vy : 190); body.customInitialized = true; }
        var rest = Number(cfg.restitution !== undefined ? cfg.restitution : 1);
        obj.transform.x += body.vx * dt;
        var ecx = getWorldColliders(obj);
        if (solids.some(function (sc) { return ecx.some(function (mc) { return !mc.isSensor && canLayersCollide(mc.layer, sc.layer, mc.mask, sc.mask) && colsOverlap(mc, sc); }); })) { obj.transform.x -= body.vx * dt; body.vx = -body.vx * rest; }
        obj.transform.y += body.vy * dt;
        var ecy = getWorldColliders(obj);
        if (solids.some(function (sc) { return ecy.some(function (mc) { return !mc.isSensor && canLayersCollide(mc.layer, sc.layer, mc.mask, sc.mask) && colsOverlap(mc, sc); }); })) { obj.transform.y -= body.vy * dt; body.vy = -body.vy * rest; }
        if (cfg.bounceStageEdges !== false) {
          var bhw = Math.abs(obj.transform.width * obj.transform.scaleX) * 0.5; var bhh = Math.abs(obj.transform.height * obj.transform.scaleY) * 0.5;
          if (obj.transform.x - bhw < 0) { obj.transform.x = bhw; body.vx = Math.abs(body.vx) * rest; } else if (obj.transform.x + bhw > stageW) { obj.transform.x = stageW - bhw; body.vx = -Math.abs(body.vx) * rest; }
          if (obj.transform.y - bhh < 0) { obj.transform.y = bhh; body.vy = Math.abs(body.vy) * rest; } else if (obj.transform.y + bhh > stageH) { obj.transform.y = stageH - bhh; body.vy = -Math.abs(body.vy) * rest; }
        }
      } else if (c.type === 'movement.vehicle_drift') {
        var steer = (keyMatch('ArrowRight', input) || keyMatch('KeyD', input) ? 1 : 0) - (keyMatch('ArrowLeft', input) || keyMatch('KeyA', input) ? 1 : 0);
        var thr = (keyMatch('ArrowUp', input) || keyMatch('KeyW', input) ? 1 : 0) - (keyMatch('ArrowDown', input) || keyMatch('KeyS', input) ? 0.6 : 0);
        obj.transform.rotation = (obj.transform.rotation + steer * Number(cfg.turnSpeed || 200) * dt) % 360;
        var vrad = (obj.transform.rotation * Math.PI) / 180; var vfx = Math.cos(vrad); var vfy = Math.sin(vrad);
        body.vx += vfx * thr * Number(cfg.accelerateSpeed || 520) * dt; body.vy += vfy * thr * Number(cfg.accelerateSpeed || 520) * dt;
        var vrx = -vfy; var vry = vfx; var fwdS = body.vx * vfx + body.vy * vfy; var latS = body.vx * vrx + body.vy * vry;
        var dLat = latS * Math.max(0, 1 - Math.max(0.02, Math.min(1, Number(cfg.driftFactor || 0.18))) * 10 * dt);
        body.vx = vfx * fwdS + vrx * dLat; body.vy = vfy * fwdS + vry * dLat;
        var damp = Math.max(0, 1 - Number(cfg.drag || 1.4) * dt); body.vx *= damp; body.vy *= damp;
        var curS = Math.hypot(body.vx, body.vy); var mSpd = Number(cfg.maxSpeed || 380);
        if (curS > mSpd) { body.vx = (body.vx / curS) * mSpd; body.vy = (body.vy / curS) * mSpd; }
        obj.transform.x += body.vx * dt; resolveH(obj, body, solids);
        obj.transform.y += body.vy * dt; resolveV(obj, body, solids);
      } else if (c.type === 'movement.topdown_8dir') {
        var spM = keyMatch(String(cfg.sprintKey || 'ShiftLeft'), input) ? Number(cfg.sprintMultiplier || 1.6) : 1;
        var ms8 = Number(cfg.maxSpeed || 220) * spM;
        var mx8 = (keyMatch('ArrowRight', input) || keyMatch('KeyD', input) || input.right ? 1 : 0) - (keyMatch('ArrowLeft', input) || keyMatch('KeyA', input) || input.left ? 1 : 0);
        var my8 = (keyMatch('ArrowDown', input) || keyMatch('KeyS', input) || input.down ? 1 : 0) - (keyMatch('ArrowUp', input) || keyMatch('KeyW', input) || input.up ? 1 : 0);
        if (mx8 !== 0 && my8 !== 0) { mx8 *= 0.7071; my8 *= 0.7071; }
        body.vx = moveTowards(body.vx, mx8 * ms8, (mx8 !== 0 ? Number(cfg.acceleration || 1600) : Number(cfg.deceleration || 2000)) * dt);
        body.vy = moveTowards(body.vy, my8 * ms8, (my8 !== 0 ? Number(cfg.acceleration || 1600) : Number(cfg.deceleration || 2000)) * dt);
        if (cfg.rotateToMovement && (Math.abs(mx8) > 0.01 || Math.abs(my8) > 0.01)) obj.transform.rotation = (Math.atan2(my8, mx8) * 180) / Math.PI;
        obj.transform.x += body.vx * dt; resolveH(obj, body, solids);
        obj.transform.y += body.vy * dt; resolveV(obj, body, solids);
      } else if (c.type === 'movement.dash') {
        var dk = String(cfg.key || 'ShiftLeft'); var dcdK = 'dash_cd:' + obj.id; var dacK = 'dash_act:' + obj.id;
        var dcd = Math.max(0, (sim.runtimeTimers.get(dcdK) || 0) - dt); var dac = Math.max(0, (sim.runtimeTimers.get(dacK) || 0) - dt);
        sim.runtimeTimers.set(dcdK, dcd); sim.runtimeTimers.set(dacK, dac);
        if (keyMatch(dk, input) && !wasK(dk) && dcd <= 0 && dac <= 0) {
          var ddx = (input.right ? 1 : 0) - (input.left ? 1 : 0) || (obj.sprite && obj.sprite.flipX ? -1 : 1);
          var ddy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
          var dlen = Math.hypot(ddx, ddy) || 1; var dspd = Number(cfg.speed || 580);
          body.vx = (ddx / dlen) * dspd; body.vy = (ddy / dlen) * dspd;
          sim.runtimeTimers.set(dacK, Number(cfg.duration || 0.15)); sim.runtimeTimers.set(dcdK, Number(cfg.cooldown || 0.6));
        }
      } else if (c.type === 'movement.double_jump') {
        var jk = String(cfg.jumpKey || 'Space'); var uk = 'dj_used:' + obj.id;
        if (body.grounded) sim.runtimeTimers.set(uk, 0);
        else if (keyMatch(jk, input) && !wasK(jk)) {
          var us = sim.runtimeTimers.get(uk) || 0;
          if (us < Math.max(1, Number(cfg.extraJumps || 1))) { body.vy = -Number(cfg.jumpForce || 460); sim.runtimeTimers.set(uk, us + 1); }
        }
      } else if (c.type === 'movement.moving_platform') {
        var mpDist = Number(cfg.distance || 160); var mpSpd = Number(cfg.speed || 100);
        body.patrolPhase += (mpDist > 0 ? mpSpd / mpDist : 0) * dt;
        var prevX = obj.transform.x; var prevY = obj.transform.y;
        if (cfg.axis === 'y') obj.transform.y = body.originY + Math.sin(body.patrolPhase) * mpDist;
        else obj.transform.x = body.originX + Math.sin(body.patrolPhase) * mpDist;
        var mdx = obj.transform.x - prevX; var mdy = obj.transform.y - prevY;
        var pBox = getWorldColliders(obj)[0];
        if (pBox) players.forEach(function (pl) {
          var plBox = getWorldColliders(pl)[0];
          if (plBox && plBox.right > pBox.left && plBox.left < pBox.right && Math.abs(plBox.bottom - pBox.top) <= 10) { pl.transform.x += mdx; pl.transform.y += mdy; }
        });
      } else if (c.type === 'movement.conveyor') {
        var cvBox = getWorldColliders(obj)[0];
        if (cvBox) players.forEach(function (pl) {
          var plBox = getWorldColliders(pl)[0];
          if (plBox && plBox.right > cvBox.left && plBox.left < cvBox.right && Math.abs(plBox.bottom - cvBox.top) <= 10) pl.transform.x += Number(cfg.speedX || 140) * dt;
        });
      } else if (c.type === 'movement.gravity_zone') {
        var zCols = getWorldColliders(obj);
        players.forEach(function (pl) {
          var plCols = getWorldColliders(pl);
          if (plCols.some(function (pc) { return zCols.some(function (zc) { return colsOverlap(pc, zc); }); })) {
            var pb = sim.bodies.get(pl.id); if (pb) pb.vy += Number(cfg.gravityForce !== undefined ? cfg.gravityForce : -650) * dt;
          }
        });
      } else if (c.type === 'ai.enemy_chaser' && players.length > 0) {
        var et = players[0]; var edx = et.transform.x - obj.transform.x; var edy = et.transform.y - obj.transform.y; var ed = Math.hypot(edx, edy);
        if (ed <= Number(cfg.detectRadius || 480) && ed > 4) {
          var es = Number(cfg.speed || 145); body.vx = (edx / ed) * es; body.vy = (edy / ed) * es;
          obj.transform.x += body.vx * dt; if (cfg.respectSolids !== false) resolveH(obj, body, solids);
          obj.transform.y += body.vy * dt; if (cfg.respectSolids !== false) resolveV(obj, body, solids);
          if (obj.sprite) obj.sprite.flipX = edx < 0;
        }
        if (Number(cfg.contactDamage || 15) > 0 && ed < (obj.transform.width + et.transform.width) * 0.45) applyDamage(sim, et, Number(cfg.contactDamage || 15), 0.5);
      } else if (c.type === 'ai.turret_shooter' && players.length > 0) {
        var tt = players[0]; var tdx = tt.transform.x - obj.transform.x; var tdy = tt.transform.y - obj.transform.y; var td = Math.hypot(tdx, tdy);
        var tk = 'turret:' + obj.id; var tcd = Math.max(0, (sim.runtimeTimers.get(tk) || 0) - dt); sim.runtimeTimers.set(tk, tcd);
        if (td <= Number(cfg.range || 450) && td > 1) {
          if (cfg.rotateToTarget !== false) obj.transform.rotation = (Math.atan2(tdy, tdx) * 180) / Math.PI;
          if (tcd <= 0) {
            sim.runtimeTimers.set(tk, Math.max(0.1, Number(cfg.fireRateSec || 1.4)));
            var ps = Number(cfg.projectileSpeed || 340);
            spawnProjRuntime(sim, objMap, obj, (tdx / td) * ps, (tdy / td) * ps, Number(cfg.damage || 15), String(cfg.projectileColor || '#ef4444'), 'Enemy');
          }
        }
      } else if (c.type === 'ai.fsm_enemy') {
        var fT = players[0]; var fD = fT ? Math.hypot(fT.transform.x - obj.transform.x, fT.transform.y - obj.transform.y) : Infinity;
        if (fT && fD <= Number(cfg.attackRange || 64)) {
          obj.stateMachine = { currentState: 'attack', states: ['patrol', 'chase', 'attack'] };
          applyDamage(sim, fT, Number(cfg.attackDamage || 20), 0.6);
        } else if (fT && fD <= Number(cfg.detectRadius || 360)) {
          obj.stateMachine = { currentState: 'chase', states: ['patrol', 'chase', 'attack'] };
          var fdx = fT.transform.x - obj.transform.x; var fdy = fT.transform.y - obj.transform.y; var fcs = Number(cfg.chaseSpeed || 175);
          obj.transform.x += (fdx / fD) * fcs * dt; obj.transform.y += (fdy / fD) * fcs * dt;
          if (obj.sprite) obj.sprite.flipX = fdx < 0;
        } else {
          obj.stateMachine = { currentState: 'patrol', states: ['patrol', 'chase', 'attack'] };
          var fpd = Number(cfg.patrolDistance || 120);
          body.patrolPhase += (fpd > 0 ? Number(cfg.patrolSpeed || 85) / fpd : 0) * dt;
          obj.transform.x = body.originX + Math.sin(body.patrolPhase) * fpd;
        }
      } else if (c.type === 'ai.flee_player' && players.length > 0) {
        var flT = players[0]; var fldx = obj.transform.x - flT.transform.x; var fldy = obj.transform.y - flT.transform.y; var fld = Math.hypot(fldx, fldy);
        if (fld < Number(cfg.fleeRadius || 240) && fld > 1) {
          var fls = Number(cfg.speed || 160); obj.transform.x += (fldx / fld) * fls * dt; obj.transform.y += (fldy / fld) * fls * dt;
          if (obj.sprite) obj.sprite.flipX = fldx < 0;
        }
      } else if (c.type === 'ai.charger_dash' && players.length > 0) {
        var caK = 'chg_act:' + obj.id; var ccK = 'chg_cd:' + obj.id;
        var ca = Math.max(0, (sim.runtimeTimers.get(caK) || 0) - dt); var cc = Math.max(0, (sim.runtimeTimers.get(ccK) || 0) - dt);
        sim.runtimeTimers.set(caK, ca); sim.runtimeTimers.set(ccK, cc);
        if (ca > 0) { obj.transform.x += body.vx * dt; obj.transform.y += body.vy * dt; }
        else if (cc <= 0) {
          var ct = players[0]; var cdx = ct.transform.x - obj.transform.x; var cdy = ct.transform.y - obj.transform.y; var cd = Math.hypot(cdx, cdy);
          if (cd <= Number(cfg.detectRadius || 340) && cd > 1) {
            var cs = Number(cfg.chargeSpeed || 440); body.vx = (cdx / cd) * cs; body.vy = (cdy / cd) * cs;
            sim.runtimeTimers.set(caK, Number(cfg.chargeDuration || 0.45)); sim.runtimeTimers.set(ccK, Number(cfg.chargeDuration || 0.45) + Number(cfg.cooldown || 1.6));
          }
        }
      } else if (c.type === 'combat.projectile_spawner') {
        var fk = String(cfg.fireKey || 'KeyJ'); var fcdK = 'fire_cd:' + obj.id;
        var fcd = Math.max(0, (sim.runtimeTimers.get(fcdK) || 0) - dt); sim.runtimeTimers.set(fcdK, fcd);
        if (keyMatch(fk, input) && !wasK(fk) && fcd <= 0) {
          sim.runtimeTimers.set(fcdK, Math.max(0.05, Number(cfg.cooldown || 0.25)));
          var bAng = 0; var am = String(cfg.aimMode || 'facing');
          if (am === 'mouse' && input.pointerX !== undefined && input.pointerY !== undefined) bAng = Math.atan2(input.pointerY - obj.transform.y, input.pointerX - obj.transform.x);
          else if (am === 'up') bAng = -Math.PI / 2;
          else if (am === 'right') bAng = 0;
          else bAng = (obj.sprite && obj.sprite.flipX) ? Math.PI : (obj.transform.rotation * Math.PI) / 180;
          var prSpd = Number(cfg.projectileSpeed || 560); var prDmg = Number(cfg.damage || 25); var prCol = String(cfg.color || '#facc15'); var pat = String(cfg.pattern || 'single');
          if (pat === 'fan') {
            var fc = Math.max(2, Math.min(9, Number(cfg.fanCount || 3))); var fsr = (Number(cfg.spreadDeg || 30) * Math.PI) / 180;
            for (var fi = 0; fi < fc; fi++) { var ang = bAng + (fi / (fc - 1) - 0.5) * fsr; spawnProjRuntime(sim, objMap, obj, Math.cos(ang) * prSpd, Math.sin(ang) * prSpd, prDmg, prCol, 'Projectile'); }
          } else if (pat === 'burst') {
            for (var bi = 0; bi < 3; bi++) { var sm = 1 + bi * 0.14; spawnProjRuntime(sim, objMap, obj, Math.cos(bAng) * prSpd * sm, Math.sin(bAng) * prSpd * sm, prDmg, prCol, 'Projectile'); }
          } else if (pat === 'homing') {
            spawnProjRuntime(sim, objMap, obj, Math.cos(bAng) * prSpd, Math.sin(bAng) * prSpd, prDmg, prCol, 'Projectile', 'Enemy');
          } else {
            spawnProjRuntime(sim, objMap, obj, Math.cos(bAng) * prSpd, Math.sin(bAng) * prSpd, prDmg, prCol, 'Projectile');
          }
          if (cfg.soundAssetId) playAudioAsset(String(cfg.soundAssetId), 1, 1, 'sfx', false);
          else playSynth('step', 1, 1.4, 'sfx');
        }
      } else if (c.type === 'combat.homing_missile') {
        var hSpd = Number(cfg.speed || 320); var hTurn = Number(cfg.turnRate || 6); var hTag = String(cfg.targetTag || 'Enemy');
        var cands = sim.scene.objects.filter(function (o) { return o.visible && o.id !== obj.id && ((o.tags && o.tags.indexOf(hTag) >= 0) || o.layer === hTag || o.name.indexOf(hTag) >= 0); });
        if (cands.length > 0) {
          var best = cands[0]; var bestD = Infinity;
          cands.forEach(function (cdO) { var dd = Math.hypot(cdO.transform.x - obj.transform.x, cdO.transform.y - obj.transform.y); if (dd < bestD) { bestD = dd; best = cdO; } });
          var dAng = Math.atan2(best.transform.y - obj.transform.y, best.transform.x - obj.transform.x);
          var cAng = Math.atan2(body.vy, body.vx); var diff = dAng - cAng;
          while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
          var nAng = cAng + Math.max(-hTurn * dt, Math.min(hTurn * dt, diff));
          body.vx = Math.cos(nAng) * hSpd; body.vy = Math.sin(nAng) * hSpd; obj.transform.rotation = (nAng * 180) / Math.PI;
        }
      } else if (c.type === 'combat.contact_damage') {
        var cdmg = Number(cfg.damage || 20); var knock = Number(cfg.knockback || 240); var atg = String(cfg.affectTag || '').trim();
        var tgts = atg ? sim.scene.objects.filter(function (o) { return o.visible && o.id !== obj.id && o.tags && o.tags.indexOf(atg) >= 0; }) : players;
        var myC = getWorldColliders(obj);
        tgts.forEach(function (t) {
          var tC = getWorldColliders(t);
          if (myC.some(function (mc) { return tC.some(function (tc) { return colsOverlap(mc, tc); }); })) {
            if (applyDamage(sim, t, cdmg, 0.5) && knock > 0) { var tb = sim.bodies.get(t.id); if (tb) { tb.vx = (t.transform.x >= obj.transform.x ? 1 : -1) * knock; tb.vy = -knock * 0.45; } }
          }
        });
      } else if (c.type === 'combat.melee_attack') {
        var mk = String(cfg.attackKey || 'KeyK'); var mcdK = 'melee_cd:' + obj.id;
        var mcd = Math.max(0, (sim.runtimeTimers.get(mcdK) || 0) - dt); sim.runtimeTimers.set(mcdK, mcd);
        if (keyMatch(mk, input) && !wasK(mk) && mcd <= 0) {
          sim.runtimeTimers.set(mcdK, Number(cfg.cooldown || 0.35));
          var mrng = Number(cfg.range || 76); var mdmg = Number(cfg.damage || 35);
          var hx = obj.transform.x + (obj.sprite && obj.sprite.flipX ? -1 : 1) * mrng * 0.5; var hy = obj.transform.y;
          sim.particles.push({ x: hx, y: hy, color: 0xf8fafc, count: 8, age: 0, duration: 0.2 });
          sim.scene.objects.forEach(function (oth) {
            if (!oth.visible || oth.id === obj.id) return;
            if (oth.components && oth.components.some(function (oc) { return oc.enabled && (oc.type === 'health' || oc.type === 'combat.health_system' || oc.type === 'arcade.destructible'); })) {
              if (Math.hypot(oth.transform.x - hx, oth.transform.y - hy) <= mrng) applyDamage(sim, oth, mdmg, 0.25);
            }
          });
          if (cfg.soundAssetId) playAudioAsset(String(cfg.soundAssetId), 1, 1, 'sfx', false);
        }
      } else if (c.type === 'combat.shield_block') {
        cfg._active = keyMatch(String(cfg.shieldKey || 'KeyL'), input);
      } else if (c.type === 'combat.auto_destroy_offscreen') {
        var om = Number(cfg.margin || 160);
        if (obj.transform.x < -om || obj.transform.x > stageW + om || obj.transform.y < -om || obj.transform.y > stageH + om) obj.visible = false;
      } else if (c.type === 'economy.auto_magnet') {
        var mrad = Number(cfg.radius || 180); var mpull = Number(cfg.pullSpeed || 340);
        sim.scene.objects.forEach(function (oth) {
          if (!oth.visible || oth.id === obj.id) return;
          if (!oth.components || !oth.components.some(function (oc) { return oc.enabled && (oc.type === 'collectible' || oc.type === 'arcade.collectible_magnet_target'); })) return;
          var mdx = obj.transform.x - oth.transform.x; var mdy = obj.transform.y - oth.transform.y; var md = Math.hypot(mdx, mdy);
          if (md <= mrad && md > 1) { oth.transform.x += (mdx / md) * mpull * dt; oth.transform.y += (mdy / md) * mpull * dt; }
        });
      } else if (c.type === 'arcade.wave_spawner' || c.type === 'arcade.spawner_interval') {
        var tplK = String(cfg.templateObjectId || '').trim();
        if (tplK) {
          var spIv = Math.max(0.2, Number(cfg.intervalSec || 2.5)); var spK = 'spawner:' + c.id;
          var spAcc = (sim.runtimeTimers.get(spK) || 0) + dt;
          if (spAcc >= spIv) {
            sim.runtimeTimers.set(spK, spAcc - spIv);
            var maxA = c.type === 'arcade.wave_spawner' ? Number(cfg.maxActive || 8) : 99;
            var actC = sim.scene.objects.filter(function (o) { return o.visible && o.id.indexOf('clone_') === 0; }).length;
            if (actC < maxA) {
              var tplObj = sim.scene.objects.find(function (o) { return o.id === tplK || o.name === tplK; });
              if (tplObj) {
                var spr = c.type === 'arcade.wave_spawner' ? Number(cfg.spreadRadius || 120) : 0;
                var ang = Math.random() * Math.PI * 2; var rad = Math.random() * spr;
                cloneIntoScene(sim, objMap, tplObj, obj.transform.x + Math.cos(ang) * rad, obj.transform.y + Math.sin(ang) * rad);
              }
            }
          } else sim.runtimeTimers.set(spK, spAcc);
        }
      } else if (c.type === 'arcade.timer_countdown') {
        var cdVar = String(cfg.variable || 'tiempo'); var cdInitK = 'cd_init:' + c.id;
        if (!sim.runtimeTimers.has(cdInitK)) { sim.runtimeTimers.set(cdInitK, 1); if (!sim.variables.has(cdVar)) sim.variables.set(cdVar, Number(cfg.startSeconds || 60)); }
        var curT = Number(sim.variables.get(cdVar) || 0);
        if (curT > 0) {
          var nxtRounded = Math.round(Math.max(0, curT - dt) * 100) / 100;
          sim.variables.set(cdVar, nxtRounded);
          if (nxtRounded <= 0) { sim.countdownZeroQueue.push(cdVar); if (cfg.eventOnZero) sim.emittedEvents.push(String(cfg.eventOnZero)); }
        }
      } else if (c.type === 'arcade.score_multiplier') {
        var mv = String(cfg.multiplierVar || 'multiplicador'); if (!sim.variables.has(mv)) sim.variables.set(mv, Number(cfg.value || 2));
      } else if (c.type === 'arcade.combo_timer') {
        var cv = String(cfg.comboVar || 'combo'); var cdec = Math.max(0.2, Number(cfg.decaySec || 3));
        var ccur = Number(sim.variables.get(cv) || 0); var clK = 'combo_last:' + c.id; var ctK = 'combo_t:' + c.id;
        if (ccur > (sim.runtimeTimers.get(clK) || 0)) sim.runtimeTimers.set(ctK, 0);
        else if (ccur > 0) {
          var ct = (sim.runtimeTimers.get(ctK) || 0) + dt;
          if (ct >= cdec) { sim.variables.set(cv, 0); sim.runtimeTimers.set(ctK, 0); } else sim.runtimeTimers.set(ctK, ct);
        }
        sim.runtimeTimers.set(clK, Number(sim.variables.get(cv) || 0));
      } else if (c.type === 'arcade.bounce_pad') {
        var bpCols = getWorldColliders(obj);
        players.forEach(function (pl) {
          var plC = getWorldColliders(pl);
          if (bpCols.some(function (pc) { return plC.some(function (lc) { return colsOverlap(pc, lc); }); })) {
            var pb = sim.bodies.get(pl.id); if (pb) { pb.vy = -Number(cfg.bounceForce || 760); pb.grounded = false; playSynth('jump', 1, 1.3, 'sfx'); }
          }
        });
      } else if (c.type === 'arcade.teleporter') {
        var tpK = 'tp_cd:' + c.id; var tpCd = Math.max(0, (sim.runtimeTimers.get(tpK) || 0) - dt); sim.runtimeTimers.set(tpK, tpCd);
        if (tpCd <= 0) {
          var tpCols = getWorldColliders(obj);
          players.forEach(function (pl) {
            var plC = getWorldColliders(pl);
            if (tpCols.some(function (pc) { return plC.some(function (lc) { return colsOverlap(pc, lc); }); })) {
              pl.transform.x = Number(cfg.destX || 200); pl.transform.y = Number(cfg.destY || 200);
              sim.runtimeTimers.set(tpK, Number(cfg.cooldown || 1)); playSynth('powerup', 1, 1, 'sfx');
            }
          });
        }
      } else if (c.type === 'arcade.hazard_spike') {
        var hsCols = getWorldColliders(obj);
        players.forEach(function (pl) {
          var plC = getWorldColliders(pl);
          if (hsCols.some(function (pc) { return plC.some(function (lc) { return colsOverlap(pc, lc); }); })) {
            if (applyDamage(sim, pl, Number(cfg.damage || 25), 0.5) && cfg.respawnAtCheckpoint && sim.checkpoint) { pl.transform.x = sim.checkpoint.x; pl.transform.y = sim.checkpoint.y; }
          }
        });
      } else if (c.type === 'juice.hit_flash') {
        obj.opacity = body.invulnerableTimer > 0 ? (Math.sin(sim.elapsed * Number(cfg.blinkRate || 18) * Math.PI) > 0 ? 1 : 0.35) : 1;
      } else if (c.type === 'juice.pulse_scale') {
        var psV = 1 + Math.sin(sim.elapsed * Number(cfg.speed || 2) * Math.PI * 2) * Number(cfg.amount || 0.08);
        sim.visualSquash.set(obj.id, { sx: psV, sy: psV });
      } else if (c.type === 'juice.squash_stretch') {
        var sqI = Number(cfg.intensity || 0.22); var curSq = sim.visualSquash.get(obj.id) || { sx: 1, sy: 1 };
        var tSx = 1; var tSy = 1;
        if (!body.grounded && Math.abs(body.vy) > 90) { tSx = 1 - sqI * 0.65; tSy = 1 + sqI; }
        else if (body.grounded && !body.wasGrounded) { tSx = 1 + sqI; tSy = 1 - sqI * 0.65; }
        body.wasGrounded = body.grounded;
        sim.visualSquash.set(obj.id, { sx: curSq.sx + (tSx - curSq.sx) * Math.min(1, dt * 14), sy: curSq.sy + (tSy - curSq.sy) * Math.min(1, dt * 14) });
      } else if (c.type === 'juice.ghost_trail' && Math.hypot(body.vx, body.vy) >= Number(cfg.minSpeed || 120)) {
        var trK = 'trail:' + obj.id; var trAcc = (sim.runtimeTimers.get(trK) || 0) + dt;
        if (trAcc >= 0.05) {
          sim.runtimeTimers.set(trK, 0);
          sim.emitterParticles.push({ x: obj.transform.x, y: obj.transform.y, vx: 0, vy: 0, gravity: 0, sizeStart: Math.max(4, Math.min(14, obj.transform.width * 0.25)), sizeEnd: 1, colorStart: String(cfg.color || '#38bdf8'), colorEnd: String(cfg.color || '#38bdf8'), alpha: 0.45, age: 0, maxAge: 0.28 });
        } else sim.runtimeTimers.set(trK, trAcc);
      } else if (c.type === 'juice.fade_after_time') {
        var fk2 = 'fade:' + c.id; var ft = (sim.runtimeTimers.get(fk2) || 0) + dt; sim.runtimeTimers.set(fk2, ft);
        var fdel = Number(cfg.delaySec || 1);
        if (ft > fdel) { var fp = (ft - fdel) / Math.max(0.1, Number(cfg.fadeDuration || 0.8)); obj.opacity = Math.max(0, 1 - fp); if (fp >= 1) obj.visible = false; }
      } else if (c.type === 'juice.auto_flip_velocity' && obj.sprite) {
        var fthr = Number(cfg.threshold || 5);
        if (body.vx < -fthr) obj.sprite.flipX = true; else if (body.vx > fthr) obj.sprite.flipX = false;
      } else if (c.type === 'juice.sound_on_collision') {
        var scK = 'snd_col:' + c.id; var scCd = Math.max(0, (sim.runtimeTimers.get(scK) || 0) - dt); sim.runtimeTimers.set(scK, scCd);
        if (scCd <= 0 && players.length > 0) {
          var myCols = getWorldColliders(obj);
          if (players.some(function (pl) { var pc = getWorldColliders(pl); return myCols.some(function (mc) { return pc.some(function (lc) { return colsOverlap(mc, lc); }); }); })) {
            sim.runtimeTimers.set(scK, Number(cfg.cooldown || 0.35));
            var scAid = String(cfg.audioAssetId || '');
            var scVol = Number(cfg.volume !== undefined ? cfg.volume : 1);
            var scPitch = Number(cfg.pitch || 1);
            if (scAid) playAudioAsset(scAid, scVol, scPitch, 'sfx', false);
            else playSynth(cfg.preset || 'hit', scVol, scPitch, 'sfx');
          }
        }
      } else if (c.type === 'audio.sound_trigger') {
        var stEv = String(cfg.event || 'onTouchPlayer');
        if (stEv !== 'onDestroy') {
          var stCdK = 'snd_trig_cd:' + c.id;
          var stCd = Math.max(0, (sim.runtimeTimers.get(stCdK) || 0) - dt);
          sim.runtimeTimers.set(stCdK, stCd);
          var stFire = false;
          if (stEv === 'onStart') {
            var stStartK = 'snd_trig_start:' + c.id;
            if (!sim.runtimeTimers.has(stStartK)) { sim.runtimeTimers.set(stStartK, 1); stFire = true; }
          } else if (stEv === 'onClick') {
            if (clickedSet && clickedSet.has(obj.id) && stCd <= 0) stFire = true;
          } else if (stEv === 'onKeyPressed') {
            var stKey = String(cfg.key || 'KeyE');
            if (keyMatch(stKey, input) && !wasK(stKey) && stCd <= 0) stFire = true;
          } else if (stEv === 'onInterval') {
            var stIv = Math.max(0.05, Number(cfg.cooldown || 2));
            var stIntK = 'snd_trig_int:' + c.id;
            var stAcc = (sim.runtimeTimers.get(stIntK) || 0) + dt;
            if (stAcc >= stIv) { sim.runtimeTimers.set(stIntK, stAcc - stIv); stFire = true; }
            else sim.runtimeTimers.set(stIntK, stAcc);
          } else if (stEv === 'onTouchPlayer' && stCd <= 0 && players.length > 0) {
            var stCols = getWorldColliders(obj);
            if (players.some(function (pl) { var pc = getWorldColliders(pl); return stCols.some(function (mc) { return pc.some(function (lc) { return colsOverlap(mc, lc); }); }); })) stFire = true;
          }
          if (stFire) {
            if (stEv !== 'onInterval') sim.runtimeTimers.set(stCdK, Math.max(0.05, Number(cfg.cooldown || 0.4)));
            var stAid = String(cfg.audioAssetId || '');
            var stCh = cfg.channel || 'sfx';
            var stVol = Math.max(0, Math.min(2, Number(cfg.volume !== undefined ? cfg.volume : 1)));
            var stBaseP = Number(cfg.pitch || 1);
            var stRandP = Number(cfg.randomPitch || 0);
            var stPitch = Math.max(0.25, Math.min(3, stBaseP + (stRandP > 0 ? (Math.random() * 2 - 1) * stRandP : 0)));
            if (stAid) playAudioAsset(stAid, stVol, stPitch, stCh, Boolean(cfg.loop));
            else playSynth(cfg.preset || 'powerup', stVol, stPitch, stCh);
          }
        }
      } else if (c.type === 'audio.music_zone') {
        var mzAid = String(cfg.audioAssetId || '');
        if (mzAid) {
          var mzMode = String(cfg.triggerMode || 'onTouchPlayer');
          var mzK = 'mzone_fired:' + c.id;
          if (mzMode === 'onStart') {
            if (!sim.runtimeTimers.has(mzK)) {
              sim.runtimeTimers.set(mzK, 1);
              playMusicAsset(mzAid, Number(cfg.volume !== undefined ? cfg.volume : 0.8), cfg.loop !== false, cfg.keepIfSame !== false);
            }
          } else if (players.length > 0) {
            var mzCols = getWorldColliders(obj);
            var mzTouch = players.some(function (pl) { var pc = getWorldColliders(pl); return mzCols.some(function (mc) { return pc.some(function (lc) { return colsOverlap(mc, lc); }); }); });
            if (mzTouch && !sim.runtimeTimers.get(mzK)) {
              sim.runtimeTimers.set(mzK, 1);
              playMusicAsset(mzAid, Number(cfg.volume !== undefined ? cfg.volume : 0.8), cfg.loop !== false, cfg.keepIfSame !== false);
            } else if (!mzTouch && sim.runtimeTimers.get(mzK)) {
              sim.runtimeTimers.delete(mzK);
            }
          }
        }
      }
    }

    function stepFixedSim(sim, dt) {
      sim.elapsed += dt;
      if (sim.screenFlash) { sim.screenFlash.age += dt; if (sim.screenFlash.age >= sim.screenFlash.duration) sim.screenFlash = null; }
      sim.flashTimers.forEach(function (fl, id) { fl.remaining -= dt; if (fl.remaining <= 0) sim.flashTimers.delete(id); });

      var objMap = new Map();
      sim.scene.objects.forEach(function (o) { objMap.set(o.id, o); });
      var solids = collectSolids(sim);

      if (sim.pendingWaits.length > 0) {
        var keep = [];
        sim.pendingWaits.forEach(function (w) {
          w.remainingSec -= dt;
          if (w.remainingSec <= 0) runActionList(w.actions, w.mechId, sim, objMap);
          else keep.push(w);
        });
        sim.pendingWaits = keep;
      }

      var clickedSet = new Set(sim.clickedObjectIds);
      sim.clickedObjectIds = [];
      clickedSet.forEach(function (cid) {
        var btn = objMap.get(cid);
        if (btn && btn.visible && btn.type === 'ui_button' && btn.uiButton) {
          if (btn.uiButton.clickSoundAssetId) {
            playAudioAsset(btn.uiButton.clickSoundAssetId, btn.uiButton.clickSoundVolume !== undefined ? btn.uiButton.clickSoundVolume : 1, 1, 'ui', false);
          } else if (btn.uiButton.clickSoundPreset !== 'none') {
            playSynth(btn.uiButton.clickSoundPreset || 'coin', btn.uiButton.clickSoundVolume !== undefined ? btn.uiButton.clickSoundVolume : 1, 1, 'ui');
          }
          var act = btn.uiButton.onClickAction;
          if (act === 'load_scene' && btn.uiButton.targetSceneId) sim.pendingSceneCommand = { kind: 'load', sceneId: btn.uiButton.targetSceneId, transition: btn.uiButton.transition || 'fadeBlack' };
          else if (act === 'overlay_scene' && btn.uiButton.targetSceneId) sim.pendingSceneCommand = { kind: 'overlay', sceneId: btn.uiButton.targetSceneId, transition: btn.uiButton.transition || 'none' };
          else if (act === 'pop_scene') sim.pendingSceneCommand = { kind: 'pop' };
          else if (act === 'restart_scene') sim.pendingSceneCommand = { kind: 'restart', transition: btn.uiButton.transition || 'fadeBlack' };
          else if (act === 'next_level') sim.pendingSceneCommand = { kind: 'nextLevel', sceneId: sim.scene.nextSceneId, transition: btn.uiButton.transition || 'fadeBlack' };
          else if (act === 'emit_event' && btn.uiButton.eventName) sim.emittedEvents.push(btn.uiButton.eventName);
        }
      });

      var players = sim.scene.objects.filter(function (o) {
        return o.visible && o.components && o.components.some(function (c) {
          return c.enabled && (c.type === 'player_platformer' || c.type === 'player_topdown' || c.type === 'movement.platformer_pro' || c.type === 'movement.topdown_8dir' || c.type === 'movement.vehicle_drift');
        });
      });

      var zeroHealthIds = new Set();
      var jumpJustPressed = (input.jump && !sim.prevInput.jump) || (input.up && !sim.prevInput.up);
      var jumpReleased = (!input.jump && sim.prevInput.jump) || (!input.up && sim.prevInput.up);

      sim.scene.objects.slice().forEach(function (obj) {
        if (!obj.visible) return;
        applyObjectTweens(obj, dt, sim.tweenStates);
        var body = sim.bodies.get(obj.id);
        if (!body) return;
        if (body.invulnerableTimer > 0) body.invulnerableTimer = Math.max(0, body.invulnerableTimer - dt);

        var comps = obj.components || [];
        comps.forEach(function (c) {
          if (!c.enabled) return;
          if (c.type === 'spin') obj.transform.rotation = (obj.transform.rotation + Number(c.config.degPerSec || 90) * dt) % 360;
          else if (c.type === 'patrol') {
            var dist = Number(c.config.distance || 120); var spd = Number(c.config.speed || 90);
            body.patrolPhase += (dist > 0 ? spd / dist : 0) * dt;
            var off = Math.sin(body.patrolPhase) * dist;
            if (c.config.axis === 'y') obj.transform.y = body.originY + off; else obj.transform.x = body.originX + off;
          } else if (c.type === 'chase_player' && players.length > 0) {
            var tgt = players[0]; var dxP = tgt.transform.x - obj.transform.x; var dyP = tgt.transform.y - obj.transform.y; var distP = Math.hypot(dxP, dyP);
            if (distP <= Number(c.config.detectRadius || 420) && distP > Number(c.config.stopDistance || 36) && distP > 0.001) {
              var cSpd = Number(c.config.speed || 130);
              obj.transform.x += (dxP / distP) * cSpd * dt; obj.transform.y += (dyP / distP) * cSpd * dt;
              if (obj.sprite) obj.sprite.flipX = dxP < 0;
            }
          } else if (c.type === 'projectile') {
            obj.transform.x += body.vx * dt; obj.transform.y += body.vy * dt;
            if (c.config.destroyOnSolid) {
              var pCols = getWorldColliders(obj);
              if (solids.some(function (sb) { return pCols.some(function (pc) { return colsOverlap(pc, sb); }); })) obj.visible = false;
            }
            if (obj.visible) {
              var ownerId = String(c.config.ownerId || ''); var dmg = Number(c.config.damage || 25); var pC2 = getWorldColliders(obj);
              for (var ti = 0; ti < sim.scene.objects.length; ti++) {
                var tg = sim.scene.objects[ti];
                if (!tg.visible || tg.id === obj.id || tg.id === ownerId) continue;
                var isEP = obj.layer === 'Enemy'; var isTP = players.some(function (p) { return p.id === tg.id; });
                if ((isEP && !isTP) || (!isEP && isTP)) continue;
                if (!tg.components || !tg.components.some(function (tc) { return tc.enabled && (tc.type === 'health' || tc.type === 'combat.health_system' || tc.type === 'arcade.destructible'); })) continue;
                var tCols = getWorldColliders(tg);
                if (pC2.some(function (pc) { return tCols.some(function (tc) { return colsOverlap(pc, tc); }); })) {
                  applyDamage(sim, tg, dmg, 0.12); obj.visible = false;
                  sim.particles.push({ x: obj.transform.x, y: obj.transform.y, color: 0xf97316, count: 8, age: 0, duration: 0.25 });
                  break;
                }
              }
            }
            if (body.lifetimeRemaining !== undefined) { body.lifetimeRemaining -= dt; if (body.lifetimeRemaining <= 0) obj.visible = false; }
          } else {
            stepExtendedComp(obj, c, sim, objMap, players, solids, dt, clickedSet);
          }
        });

        var platPro = comps.find(function (c) { return c.enabled && c.type === 'movement.platformer_pro'; });
        var plat = comps.find(function (c) { return c.enabled && c.type === 'player_platformer'; });
        var td = comps.find(function (c) { return c.enabled && c.type === 'player_topdown'; });
        var hasExtCtrl = comps.some(function (c) { return c.enabled && (c.type === 'movement.topdown_8dir' || c.type === 'movement.vehicle_drift'); });

        if (platPro) {
          var pcfg = platPro.config || {};
          var pMaxS = Number(pcfg.maxSpeed || 260); var pAcc = Number(pcfg.acceleration || 1900); var pDec = Number(pcfg.deceleration || 2400);
          var pJump = Number(pcfg.jumpForce || 520); var pGrav = Number(pcfg.gravity || 1320); var pMaxJ = Math.max(1, Number(pcfg.maxJumps || 2));
          var mvX = (keyMatch('ArrowRight', input) || keyMatch('KeyD', input) || input.right ? 1 : 0) - (keyMatch('ArrowLeft', input) || keyMatch('KeyA', input) || input.left ? 1 : 0);
          var dKey = String(pcfg.dashKey || 'ShiftLeft'); var daK = 'ppro_dash:' + obj.id; var dcK = 'ppro_cd:' + obj.id;
          var da = Math.max(0, (sim.runtimeTimers.get(daK) || 0) - dt); var dc = Math.max(0, (sim.runtimeTimers.get(dcK) || 0) - dt);
          sim.runtimeTimers.set(daK, da); sim.runtimeTimers.set(dcK, dc);
          if (pcfg.dashEnabled !== false && keyMatch(dKey, input) && !keyMatch(dKey, sim.prevInput) && dc <= 0 && da <= 0) {
            var dX = mvX !== 0 ? mvX : (obj.sprite && obj.sprite.flipX ? -1 : 1); var dY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
            var dl = Math.hypot(dX, dY) || 1; var dSp = Number(pcfg.dashSpeed || 640);
            body.vx = (dX / dl) * dSp; body.vy = (dY / dl) * dSp * 0.65;
            sim.runtimeTimers.set(daK, Number(pcfg.dashDuration || 0.16)); sim.runtimeTimers.set(dcK, Number(pcfg.dashCooldown || 0.5));
            playSynth('step', 1, 1.6, 'sfx');
          }
          if (body.grounded) { body.coyoteTimer = Number(pcfg.coyoteTime || 0.12); body.jumpsUsed = 0; } else body.coyoteTimer = Math.max(0, body.coyoteTimer - dt);
          if (jumpJustPressed) body.jumpBufferTimer = 0.12; else body.jumpBufferTimer = Math.max(0, body.jumpBufferTimer - dt);
          if (da <= 0) { body.vx = moveTowards(body.vx + body.ax * dt, mvX * pMaxS, (mvX !== 0 ? pAcc : pDec) * dt); body.ax = 0; }
          if (mvX < 0 && obj.sprite) obj.sprite.flipX = true; if (mvX > 0 && obj.sprite) obj.sprite.flipX = false;
          obj.transform.x += body.vx * dt; var hitW = resolveH(obj, body, solids);
          var wallS = Boolean(pcfg.wallSlideEnabled !== false && !body.grounded && hitW && body.vy > 0);
          if (wallS && jumpJustPressed) {
            body.vx = (mvX > 0 ? -1 : 1) * Number(pcfg.wallJumpForceX || 320); body.vy = -Number(pcfg.wallJumpForceY || 490); body.jumpBufferTimer = 0;
          } else {
            var cg = body.coyoteTimer > 0 && body.jumpsUsed === 0; var ca2 = !cg && body.jumpsUsed < pMaxJ && jumpJustPressed;
            if (body.jumpBufferTimer > 0 && (cg || ca2)) {
              body.vy = -pJump; body.grounded = false; body.coyoteTimer = 0; body.jumpBufferTimer = 0; body.jumpsUsed += 1;
              if (pcfg.jumpSoundAssetId) playAudioAsset(String(pcfg.jumpSoundAssetId), 1, 1, 'sfx', false);
            }
          }
          if (jumpReleased && body.vy < 0) body.vy *= 0.5;
          if (da <= 0) { body.vy = Math.min(wallS ? Number(pcfg.wallSlideSpeed || 95) : 960, body.vy + (pGrav + body.ay) * dt); body.ay = 0; }
          obj.transform.y += body.vy * dt; resolveV(obj, body, solids);
        } else if (plat) {
          var prm = resolvePlatformerConfig(plat.config);
          var mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
          if (body.grounded) { body.coyoteTimer = prm.coyoteTime; body.jumpsUsed = 0; }
          else body.coyoteTimer = Math.max(0, body.coyoteTimer - dt);
          if (jumpJustPressed) body.jumpBufferTimer = prm.jumpBuffer;
          else body.jumpBufferTimer = Math.max(0, body.jumpBufferTimer - dt);
          var rate = mx !== 0 ? prm.acceleration * (body.grounded ? 1 : prm.airControl) : prm.deceleration * (body.grounded ? prm.groundFriction : prm.airControl * 0.7);
          body.vx = moveTowards(body.vx + body.ax * dt, mx * prm.maxSpeed, rate * dt);
          body.ax = 0;
          if (mx < 0 && obj.sprite) obj.sprite.flipX = true;
          if (mx > 0 && obj.sprite) obj.sprite.flipX = false;
          var canG = body.coyoteTimer > 0 && body.jumpsUsed === 0;
          var canA = !canG && body.jumpsUsed < prm.maxJumps && jumpJustPressed;
          if (body.jumpBufferTimer > 0 && (canG || canA)) {
            body.vy = -prm.jumpForce; body.grounded = false; body.coyoteTimer = 0; body.jumpBufferTimer = 0; body.jumpsUsed += 1;
            if (plat.config && plat.config.jumpSoundAssetId) playAudioAsset(String(plat.config.jumpSoundAssetId), 1, 1, 'sfx', false);
          }
          if (jumpReleased && body.vy < 0) body.vy *= prm.variableJumpCut;
          var grav = body.vy > 0 ? prm.gravity * prm.fallGravityMultiplier : prm.gravity;
          body.vy = Math.min(prm.maxFallSpeed, body.vy + (grav + body.ay) * dt);
          body.ay = 0;
          obj.transform.x += body.vx * dt; var hw2 = resolveH(obj, body, solids);
          var ws2 = comps.find(function (c) { return c.enabled && c.type === 'movement.wall_slide'; });
          if (ws2 && !body.grounded && hw2 && body.vy > 0) {
            body.vy = Math.min(body.vy, Number(ws2.config.slideMaxFall || 90));
            if (jumpJustPressed) { body.vx = (mx > 0 ? -1 : 1) * Number(ws2.config.kickX || 300); body.vy = -Number(ws2.config.kickY || 480); }
          }
          obj.transform.y += body.vy * dt; resolveV(obj, body, solids);
        } else if (td) {
          var tp = resolveTopDownConfig(td.config);
          var dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
          var dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
          if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
          body.vx = moveTowards(body.vx + body.ax * dt, dx * tp.maxSpeed, (dx !== 0 ? tp.acceleration : tp.deceleration) * dt);
          body.vy = moveTowards(body.vy + body.ay * dt, dy * tp.maxSpeed, (dy !== 0 ? tp.acceleration : tp.deceleration) * dt);
          body.ax = 0; body.ay = 0;
          if (dx < 0 && obj.sprite) obj.sprite.flipX = true;
          if (dx > 0 && obj.sprite) obj.sprite.flipX = false;
          obj.transform.x += body.vx * dt; resolveH(obj, body, solids);
          obj.transform.y += body.vy * dt; resolveV(obj, body, solids);
        } else if (!hasExtCtrl && obj.rigidbody && obj.rigidbody.bodyType === 'dynamic') {
          body.vy += 1200 * (obj.rigidbody.gravityScale !== undefined ? obj.rigidbody.gravityScale : 1) * dt;
          body.vx += body.ax * dt; body.vy += body.ay * dt; body.ax = 0; body.ay = 0;
          obj.transform.x += body.vx * dt; resolveH(obj, body, solids);
          obj.transform.y += body.vy * dt; resolveV(obj, body, solids);
        }
      });

      if (players.length > 0) {
        var pCols = players.map(function (p) { return getWorldColliders(p); });
        sim.scene.objects.forEach(function (obj) {
          if (!obj.visible) return;
          var bd = sim.bodies.get(obj.id);
          if (bd && bd.health <= 0 && obj.components && obj.components.some(function (c) { return c.enabled && (c.type === 'health' || c.type === 'combat.health_system'); })) zeroHealthIds.add(obj.id);
          var cp = obj.components && obj.components.find(function (c) { return c.enabled && c.type === 'checkpoint'; });
          var goal = obj.components && obj.components.find(function (c) { return c.enabled && c.type === 'goal_portal'; });
          if (!cp && !goal) return;
          var oCols = getWorldColliders(obj);
          var hit = pCols.some(function (pcs) { return pcs.some(function (pc) { return oCols.some(function (oc) { return colsOverlap(pc, oc); }); }); });
          if (hit) {
            if (cp) sim.checkpoint = { x: obj.transform.x, y: obj.transform.y };
            if (goal && !sim.pendingSceneCommand) {
              var tid = String(goal.config.targetSceneId || sim.scene.nextSceneId || '');
              sim.pendingSceneCommand = tid ? { kind: 'load', sceneId: tid, transition: goal.config.transition || 'fadeBlack' } : { kind: 'nextLevel', transition: goal.config.transition || 'fadeBlack' };
            }
          }
        });
      }

      var mechanics = (sim.scene.mechanics || []).filter(function (m) { return m.enabled; }).slice();
      mechanics.sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); });
      var collisionHandled = new Set();
      mechanics.forEach(function (m) {
        if (m.trigger && (m.trigger.event === 'collision.enter' || m.trigger.event === 'trigger.enter') && m.trigger.target) collisionHandled.add(m.trigger.target);
      });

      var nextCollisions = new Set();
      var nextTriggers = new Set();
      var emittedThisFrame = sim.emittedEvents.slice(); sim.emittedEvents = [];
      var portalEvThisFrame = sim.portalEventsQueue.slice(); sim.portalEventsQueue = [];
      var cdZeroThisFrame = sim.countdownZeroQueue.slice(); sim.countdownZeroQueue = [];

      mechanics.forEach(function (mech) {
        var ev = mech.trigger ? mech.trigger.event : '';
        var trig = false;
        if (ev === 'scene.start' && !sim.sceneStarted) trig = true;
        else if (ev === 'scene.paused' && paused) trig = true;
        else if (ev === 'tick') trig = true;
        else if (ev === 'ui.click' && mech.trigger.target && clickedSet.has(mech.trigger.target)) trig = true;
        else if (ev === 'mouse.clickGlobal' && input.pointerJustPressed) trig = true;
        else if (ev === 'mouse.hold' && input.pointerDown) trig = true;
        else if (ev === 'mouse.release' && input.pointerJustReleased) trig = true;
        else if (ev === 'touch.swipe' && input.swipeDir && (!mech.trigger.swipeDir || mech.trigger.swipeDir === 'any' || mech.trigger.swipeDir === input.swipeDir)) trig = true;
        else if (ev === 'portal.adClosed' && portalEvThisFrame.indexOf('adClosed') >= 0) trig = true;
        else if (ev === 'portal.rewarded' && portalEvThisFrame.indexOf('rewarded') >= 0) trig = true;
        else if (ev === 'countdown.zero' && cdZeroThisFrame.length > 0 && (!mech.trigger.variable || cdZeroThisFrame.indexOf(mech.trigger.variable) >= 0)) trig = true;
        else if (ev === 'custom.event' && mech.trigger.eventName && emittedThisFrame.indexOf(mech.trigger.eventName) >= 0) trig = true;
        else if (ev === 'variable.changed' && mech.trigger.variable && sim.variables.get(mech.trigger.variable) !== sim.prevVariables.get(mech.trigger.variable)) trig = true;
        else if (ev === 'health.zero' && mech.trigger.target && zeroHealthIds.has(mech.trigger.target)) trig = true;
        else if (ev === 'input.pressed' || ev === 'input.held' || ev === 'input.released') {
          var k = mech.trigger.key || 'Space';
          var d = keyMatch(k, input); var w = keyMatch(k, sim.prevInput);
          if (ev === 'input.pressed' && d && !w) trig = true;
          else if (ev === 'input.held' && d) trig = true;
          else if (ev === 'input.released' && !d && w) trig = true;
        } else if (ev === 'timer.elapsed') {
          var iv = Math.max(0.05, Number(mech.trigger.intervalSec || 1));
          var acc = (sim.timerAcc.get(mech.id) || 0) + dt;
          if (acc >= iv) { sim.timerAcc.set(mech.id, acc - iv); trig = true; }
          else sim.timerAcc.set(mech.id, acc);
        } else if (ev === 'collision.enter' || ev === 'collision.stay' || ev === 'collision.exit' || ev === 'trigger.enter' || ev === 'trigger.exit') {
          var tObjs = sim.scene.objects.filter(function (o) {
            if (!o.visible) return false;
            if (mech.trigger.target && o.id === mech.trigger.target) return true;
            if (mech.trigger.tag && o.tags && o.tags.indexOf(mech.trigger.tag) >= 0) return true;
            if (mech.trigger.layer && o.layer === mech.trigger.layer) return true;
            return false;
          });
          var srcs = mech.trigger.sourceObjectId ? [objMap.get(mech.trigger.sourceObjectId)].filter(function (x) { return x && x.visible; }) : players;
          if (tObjs.length > 0 && srcs.length > 0) {
            tObjs.forEach(function (tObj) {
              var tCols = getWorldColliders(tObj);
              srcs.forEach(function (sObj) {
                if (sObj.id === tObj.id) return;
                var sCols = getWorldColliders(sObj);
                var ov = sCols.some(function (sc) { return tCols.some(function (tc) { return canLayersCollide(sc.layer, tc.layer, sc.mask, tc.mask) && colsOverlap(sc, tc); }); });
                var pk = mech.id + ':' + sObj.id + ':' + tObj.id;
                var isTr = ev === 'trigger.enter' || ev === 'trigger.exit';
                var pSet = isTr ? sim.activeTriggers : sim.activeCollisions;
                var nSet = isTr ? nextTriggers : nextCollisions;
                if (ov) {
                  nSet.add(pk);
                  if ((ev === 'collision.enter' || ev === 'trigger.enter') && !pSet.has(pk)) trig = true;
                  else if (ev === 'collision.stay') trig = true;
                } else if ((ev === 'collision.exit' || ev === 'trigger.exit') && pSet.has(pk)) trig = true;
              });
            });
          }
        }
        if (!trig) return;
        var conds = mech.conditions || [];
        var comb = mech.conditionCombinator || 'all';
        var condOk = conds.length === 0 ? true : comb === 'any' ? conds.some(function (c) { return evalCondition(c, sim, objMap); }) : comb === 'none' ? conds.every(function (c) { return !evalCondition(c, sim, objMap); }) : conds.every(function (c) { return evalCondition(c, sim, objMap); });
        if (condOk) runActionList(mech.actions || [], mech.id, sim, objMap);
      });

      sim.sceneStarted = true;
      sim.activeCollisions = nextCollisions;
      sim.activeTriggers = nextTriggers;
      sim.prevInput = Object.assign({}, input, { pressedKeys: Array.from(pressedKeys) });
      sim.prevVariables = new Map(sim.variables);
      input.pointerJustPressed = false; input.pointerJustReleased = false; input.swipeDir = null;

      if (players.length > 0) {
        var pBoxes = players.map(getWorldColliders);
        sim.scene.objects.forEach(function (obj) {
          if (!obj.visible || !obj.components || collisionHandled.has(obj.id)) return;
          var col = obj.components.find(function (c) { return c.enabled && (c.type === 'collectible' || c.type === 'arcade.collectible_magnet_target'); });
          if (!col) return;
          var cb = getWorldColliders(obj);
          if (pBoxes.some(function (pcs) { return pcs.some(function (pc) { return cb.some(function (oc) { return colsOverlap(pc, oc); }); }); })) {
            obj.visible = false;
            var mult = Number(sim.variables.get('multiplicador') || 1) || 1;
            var np = (Number(sim.variables.get('puntos') || 0) || 0) + Math.round(Number(col.config.points || 10) * mult);
            sim.variables.set('puntos', np);
            if (sim.persistentVarNames.has('puntos')) writeStoredVar('puntos', np);
            if (scoreSpan) scoreSpan.textContent = String(np);
            var colVol = Number(col.config.soundVolume !== undefined ? col.config.soundVolume : 1);
            if (col.config.soundAssetId) playAudioAsset(String(col.config.soundAssetId), colVol, 1, 'sfx', false);
            else playSynth('coin', colVol, 1, 'sfx');
            sim.particles.push({ x: obj.transform.x, y: obj.transform.y, color: 0x34d399, count: 10, age: 0, duration: 0.4 });
          }
        });
      }

      sim.scene.objects.forEach(function (obj) {
        if (!obj.visible) return;
        var emList = [];
        if (obj.particleEmitter && obj.particleEmitter.enabled) emList.push(obj.particleEmitter);
        (obj.components || []).forEach(function (c) {
          if (c.enabled && c.type === 'juice.particle_emitter') {
            var defs = getParticleDefaults(c.config.preset || 'fire');
            emList.push(Object.assign({}, defs, { rate: Number(c.config.rate || defs.rate), sizeStart: Number(c.config.size || defs.sizeStart), lifetime: Number(c.config.lifetime || defs.lifetime), colorStart: String(c.config.color || defs.colorStart) }));
          }
        });
        emList.forEach(function (em, idx) {
          var ek = 'em:' + obj.id + ':' + idx;
          var eAcc = (sim.runtimeTimers.get(ek) || 0) + dt * Math.max(0.5, em.rate || 20);
          var eCnt = Math.floor(eAcc); sim.runtimeTimers.set(ek, eAcc - eCnt);
          if (eCnt > 0) emitBurstFromConfig(sim, obj.transform.x, obj.transform.y, em, Math.min(12, eCnt));
        });
      });
      if (sim.emitterParticles.length > 0) {
        sim.emitterParticles = sim.emitterParticles.filter(function (pt) {
          pt.age += dt; if (pt.age >= pt.maxAge) return false;
          pt.vy += pt.gravity * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; return true;
        });
      }

      var camCfg = sim.scene.cameraConfig;
      var cTgt = camCfg && camCfg.followObjectId ? objMap.get(camCfg.followObjectId) : sim.scene.objects.find(function (o) { return o.visible && o.components && o.components.some(function (c) { return c.enabled && c.type === 'juice.camera_follow'; }); });
      if (cTgt) {
        var fc = (cTgt.components || []).find(function (c) { return c.enabled && c.type === 'juice.camera_follow'; });
        var dX = cTgt.transform.x - stageW * 0.5; var dY = cTgt.transform.y - stageH * 0.5;
        var dzW = ((camCfg && camCfg.deadzoneW) || 0) * 0.5; var dzH = ((camCfg && camCfg.deadzoneH) || 0) * 0.5;
        var tX = sim.cameraPos.x; var tY = sim.cameraPos.y;
        if (Math.abs(dX - tX) > dzW) tX = dX - Math.sign(dX - tX) * dzW;
        if (Math.abs(dY - tY) > dzH) tY = dY - Math.sign(dY - tY) * dzH;
        var lerp = Math.max(0.02, Math.min(1, Number((fc && fc.config.lerp) || (camCfg && camCfg.lerp) || 0.14)));
        var prevCX = sim.cameraPos.x; var prevCY = sim.cameraPos.y;
        sim.cameraPos.x += (tX - sim.cameraPos.x) * lerp; sim.cameraPos.y += (tY - sim.cameraPos.y) * lerp;
        if ((fc && fc.config.clampToBounds) || (camCfg && camCfg.clampToBounds)) {
          sim.cameraPos.x = Math.max(0, Math.min(Math.max(stageW, (camCfg && camCfg.worldWidth) || stageW) - stageW, sim.cameraPos.x));
          sim.cameraPos.y = Math.max(0, Math.min(Math.max(stageH, (camCfg && camCfg.worldHeight) || stageH) - stageH, sim.cameraPos.y));
        }
        var dCX = sim.cameraPos.x - prevCX; var dCY = sim.cameraPos.y - prevCY;
        if (dCX !== 0 || dCY !== 0) {
          sim.scene.objects.forEach(function (o) {
            var px = (o.components || []).find(function (c) { return c.enabled && c.type === 'juice.parallax_layer'; });
            if (px) { o.transform.x += dCX * (1 - Number(px.config.factorX !== undefined ? px.config.factorX : 0.4)); o.transform.y += dCY * (1 - Number(px.config.factorY !== undefined ? px.config.factorY : 0.15)); }
          });
        }
      }
    }

    if (window.NexusPortal) {
      window.NexusPortal.loadingFinished();
      window.NexusPortal.gameplayStart();
    }

    var accumulator = 0;
    app.ticker.add(function (ticker) {
      if (paused || !activeSim) return;
      var rawDt = Math.min(ticker.deltaMS / 1000, 0.1);
      if (transitionEffect) {
        transitionEffect.progress += rawDt / Math.max(0.05, transitionEffect.duration);
        if (transitionEffect.progress >= 1) transitionEffect = null;
      }

      accumulator += rawDt;
      var steps = 0;
      while (accumulator >= FIXED_DT && steps < 5) {
        stepFixedSim(activeSim, FIXED_DT);
        accumulator -= FIXED_DT;
        steps += 1;
        if (activeSim.pendingSceneCommand) {
          var cmd = activeSim.pendingSceneCommand;
          activeSim.pendingSceneCommand = null;
          if (cmd.kind === 'load' && cmd.sceneId) loadSceneById(cmd.sceneId, cmd.transition);
          else if (cmd.kind === 'overlay' && cmd.sceneId) pushOverlayById(cmd.sceneId, cmd.transition);
          else if (cmd.kind === 'pop') popOverlay();
          else if (cmd.kind === 'restart') loadSceneById(activeSim.scene.id, cmd.transition);
          else if (cmd.kind === 'nextLevel') nextLevelScene(cmd.sceneId, cmd.transition);
          break;
        }
      }

      var sim = activeSim;
      sceneRoot.position.set(-sim.cameraPos.x, -sim.cameraPos.y);

      sim.scene.objects.forEach(function (obj) {
        var node = sim.nodeMap.get(obj.id);
        if (!node) return;
        var sq = sim.visualSquash.get(obj.id);
        node.position.set(obj.transform.x, obj.transform.y);
        node.rotation = obj.transform.rotation * DEG_TO_RAD;
        node.scale.set(obj.transform.scaleX * (sq ? sq.sx : 1) * (obj.sprite && obj.sprite.flipX ? -1 : 1), obj.transform.scaleY * (sq ? sq.sy : 1) * (obj.sprite && obj.sprite.flipY ? -1 : 1));
        node.alpha = Math.max(0, Math.min(1, obj.opacity));
        node.visible = obj.visible;
        if (obj.type === 'text' && obj.text) {
          node.text = interpolateText(obj.text.text || '', sim.variables, obj.text.bindVariable);
        } else if (obj.type === 'ui_progress_bar' && obj.uiProgressBar && node.__pbGraphics) {
          var bar = obj.uiProgressBar;
          var maxV = Math.max(1, bar.maxValue || 100);
          var rawV = bar.variable ? Number(sim.variables.get(bar.variable) !== undefined ? sim.variables.get(bar.variable) : maxV) : maxV * 0.75;
          var ratio = Math.max(0, Math.min(1, (Number.isFinite(rawV) ? rawV : 0) / maxV));
          var w = obj.transform.width; var h = obj.transform.height;
          var l = -w * obj.transform.anchorX; var t = -h * obj.transform.anchorY;
          var g = node.__pbGraphics;
          g.clear();
          g.roundRect(l, t, w, h, Math.min(6, h / 2));
          g.fill({ color: parseColor(bar.bgColor, 0x1e293b), alpha: 1 });
          if (ratio > 0) {
            g.roundRect(l + 2, t + 2, Math.max(4, (w - 4) * ratio), Math.max(4, h - 4), Math.min(4, h / 2));
            g.fill({ color: parseColor(bar.fillColor, 0x10b981), alpha: 1 });
          }
          g.roundRect(l, t, w, h, Math.min(6, h / 2));
          g.stroke({ width: 1.5, color: parseColor(bar.borderColor, 0x475569) });
          if (node.__pbLabel) { node.__pbLabel.visible = bar.showLabel !== false; node.__pbLabel.text = Math.round(rawV) + ' / ' + maxV; }
        } else if (obj.type === 'ui_leaderboard' && node.__lbRowsContainer && sim.leaderboardDirty) {
          var rc = node.__lbRowsContainer;
          rc.removeChildren().forEach(function (ch) { ch.destroy({ children: true }); });
          var lb = obj.uiLeaderboard || {}; var maxR = Math.max(1, Math.min(10, lb.maxEntries || 5));
          var lw = obj.transform.width; var lh = obj.transform.height; var ll = -lw * obj.transform.anchorX; var lt = -lh * obj.transform.anchorY;
          var rows = sim.leaderboard.slice(0, maxR);
          if (rows.length === 0) {
            var emT = new PIXI.Text({ text: 'Sin récords aún', style: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 12, fill: 0x94a3b8 }) });
            emT.anchor.set(0.5, 0.5); emT.position.set(ll + lw * 0.5, lt + lh * 0.55); rc.addChild(emT);
          } else {
            var stepR = Math.max(22, (lh - 46) / maxR);
            rows.forEach(function (ent, rIdx) {
              var ry = lt + 46 + rIdx * stepR;
              var rt = new PIXI.Text({ text: '#' + (rIdx + 1) + '  ' + ent.name, style: new PIXI.TextStyle({ fontFamily: 'sans-serif', fontSize: 12, fontWeight: rIdx === 0 ? '700' : '400', fill: parseColor(lb.textColor, 0xf8fafc) }) });
              rt.position.set(ll + 14, ry); rc.addChild(rt);
              var st = new PIXI.Text({ text: String(ent.score), style: new PIXI.TextStyle({ fontFamily: 'monospace', fontSize: 12, fontWeight: '700', fill: parseColor(lb.accentColor, 0xf59e0b) }) });
              st.anchor.set(1, 0); st.position.set(ll + lw - 14, ry); rc.addChild(st);
            });
          }
        } else if (obj.type === 'ui_button' && obj.uiButton && node.__btnGraphics) {
          var isH = sim.hoveredObjectId === obj.id;
          var b = obj.uiButton; var wb = obj.transform.width; var hb = obj.transform.height;
          var lb2 = -wb * obj.transform.anchorX; var tb2 = -hb * obj.transform.anchorY;
          var rad = Math.min(b.borderRadius !== undefined ? b.borderRadius : 8, wb / 2, hb / 2);
          var bg = node.__btnGraphics; bg.clear();
          if (rad > 0) bg.roundRect(lb2, tb2, wb, hb, rad); else bg.rect(lb2, tb2, wb, hb);
          bg.fill({ color: parseColor(isH ? b.hoverColor : b.bgColor, isH ? 0x3b82f6 : 0x2563eb), alpha: 1 });
          bg.stroke({ width: 2, color: parseColor(b.borderColor, 0x60a5fa) });
        }
      });
      sim.leaderboardDirty = false;

      fxGraphics.clear();
      sim.particles = sim.particles.filter(function (pt) {
        pt.age += rawDt;
        if (pt.age >= pt.duration) return false;
        var t = pt.age / pt.duration;
        for (var k = 0; k < pt.count; k++) {
          var ang = (Math.PI * 2 * k) / pt.count;
          var spd = 55 + (k % 3) * 35;
          fxGraphics.circle(pt.x + Math.cos(ang) * spd * pt.age - sim.cameraPos.x, pt.y + Math.sin(ang) * spd * pt.age - 18 * pt.age - sim.cameraPos.y, Math.max(1.5, 4 * (1 - t * 0.7)));
          fxGraphics.fill({ color: pt.color, alpha: 1 - t });
        }
        return true;
      });
      sim.emitterParticles.forEach(function (pt) {
        var et = Math.min(1, pt.age / Math.max(0.05, pt.maxAge));
        fxGraphics.circle(pt.x - sim.cameraPos.x, pt.y - sim.cameraPos.y, Math.max(1, pt.sizeStart + (pt.sizeEnd - pt.sizeStart) * et));
        fxGraphics.fill({ color: parseColor(et < 0.5 ? pt.colorStart : pt.colorEnd, 0xf97316), alpha: Math.max(0, pt.alpha * (1 - et)) });
      });
      sim.scene.objects.forEach(function (obj) {
        if (!obj.visible) return;
        var fl = sim.flashTimers.get(obj.id);
        if (fl) {
          fxGraphics.rect(obj.transform.x - obj.transform.width * obj.transform.anchorX - sim.cameraPos.x, obj.transform.y - obj.transform.height * obj.transform.anchorY - sim.cameraPos.y, obj.transform.width, obj.transform.height);
          fxGraphics.fill({ color: parseColor(fl.color, 0xffffff), alpha: 0.6 });
        }
        var hpC = (obj.components || []).find(function (c) { return c.enabled && ((c.type === 'combat.health_system' && c.config.showFloatingBar !== false) || c.type === 'juice.floating_hp_bar'); });
        var hbd = sim.bodies.get(obj.id);
        if (hpC && hbd && hbd.maxHealth > 0) {
          var bw = Number(hpC.config.width || 48); var bx = obj.transform.x - bw * 0.5 - sim.cameraPos.x;
          var by = obj.transform.y - obj.transform.height * obj.transform.anchorY - Number(hpC.config.offsetY || 12) - 6 - sim.cameraPos.y;
          var r = Math.max(0, Math.min(1, hbd.health / hbd.maxHealth));
          fxGraphics.roundRect(bx, by, bw, 6, 2); fxGraphics.fill({ color: 0x0f172a, alpha: 0.85 });
          if (r > 0) { fxGraphics.roundRect(bx + 1, by + 1, Math.max(2, (bw - 2) * r), 4, 1); fxGraphics.fill({ color: parseColor(hpC.config.fillColor, 0x22c55e), alpha: 1 }); }
        }
      });

      transitionGraphics.clear();
      if (sim.screenFlash) {
        var sfA = sim.screenFlash.alpha * (1 - Math.min(1, sim.screenFlash.age / Math.max(0.05, sim.screenFlash.duration)));
        if (sfA > 0.01) { transitionGraphics.rect(0, 0, stageW, stageH); transitionGraphics.fill({ color: parseColor(sim.screenFlash.color, 0xffffff), alpha: sfA }); }
      }
      if (transitionEffect) {
        var al = Math.max(0, Math.min(1, 1 - transitionEffect.progress));
        if (al > 0.01) {
          transitionGraphics.rect(0, 0, stageW, stageH);
          transitionGraphics.fill({ color: transitionEffect.type === 'fadeWhite' ? 0xffffff : 0x050508, alpha: al });
        }
      }

      if (sim.shakeRemaining > 0) {
        sim.shakeRemaining = Math.max(0, sim.shakeRemaining - rawDt);
        world.position.set(baseWorldPos.x + (Math.random() - 0.5) * sim.shakeIntensity * 2, baseWorldPos.y + (Math.random() - 0.5) * sim.shakeIntensity * 2);
      } else {
        world.position.set(baseWorldPos.x, baseWorldPos.y);
      }
    });
  }

  boot().catch(function (err) {
    console.error('[NEXUS HTML5 Runtime Error]', err);
  });
})();
`;
}
