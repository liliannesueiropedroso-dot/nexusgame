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
  options: Html5CompileOptions,
  projectMode: '2d' | '3d' = '2d'
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

  const touchControlsHtml = `
  <div id="nx-touch-controls" class="${options.touchControls ? '' : 'hidden'}" aria-label="Controles táctiles">
    <div id="nx-joystick-zone">
      <div id="nx-joystick-ring">
        <div id="nx-joystick-knob"></div>
      </div>
    </div>
    <div class="nx-touch-actions">
      <button type="button" class="nx-action-btn nx-btn-dash" data-btn="dash" aria-label="Dash">DASH</button>
      <button type="button" class="nx-action-btn nx-btn-act" data-btn="action" aria-label="Acción">ACCIÓN</button>
      <button type="button" class="nx-action-btn nx-btn-jump" data-btn="jump" aria-label="Saltar">SALTAR</button>
    </div>
  </div>`;

  const fullscreenBtnHtml = options.showFullscreenButton
    ? '<button type="button" id="nx-fs-btn" title="Pantalla completa" aria-label="Pantalla completa">[ ]</button>'
    : '';

  const runtimeScripts =
    projectMode === '3d'
      ? `  <script src="js/three.min.js"></script>
  <script src="js/portal-sdk.js"></script>
  <script src="js/nexus-3d-runtime.js"></script>`
      : `  <script src="js/pixi.min.js"></script>
  <script src="js/portal-sdk.js"></script>
  <script src="js/nexus-runtime.js"></script>`;

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

${runtimeScripts}
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
  inset: 0;
  pointer-events: none;
  z-index: 15;
  touch-action: none;
  user-select: none;
}

#nx-joystick-zone {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 55%;
  width: 45%;
  max-width: 340px;
  pointer-events: auto;
  touch-action: none;
}

#nx-joystick-ring {
  position: absolute;
  left: 22px;
  bottom: 22px;
  width: 112px;
  height: 112px;
  border-radius: 9999px;
  border: 2px solid rgba(56, 189, 248, 0.55);
  background: rgba(15, 23, 42, 0.68);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

#nx-joystick-knob {
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  border: 2px solid rgba(255, 255, 255, 0.85);
  background: rgba(148, 163, 184, 0.72);
  pointer-events: none;
}

.nx-touch-actions {
  position: absolute;
  right: 22px;
  bottom: 22px;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}

.nx-action-btn {
  pointer-events: auto;
  border-radius: 9999px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  background: rgba(24, 24, 27, 0.72);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  touch-action: none;
}

.nx-btn-dash { width: 48px; height: 48px; background: rgba(124, 58, 237, 0.78); border-color: rgba(167, 139, 250, 0.8); }
.nx-btn-act { width: 56px; height: 56px; background: rgba(217, 119, 6, 0.8); border-color: rgba(251, 191, 36, 0.8); }
.nx-btn-jump { width: 66px; height: 66px; background: rgba(5, 150, 105, 0.85); border-color: rgba(52, 211, 153, 0.85); }

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
      if (col.enabled === false) return;
      if (col.shape === 'smart_alpha' && col.smartRects && col.smartRects.length > 0) {
        var sw = Math.max(4, Math.abs(obj.transform.width * sx));
        var sh = Math.max(4, Math.abs(obj.transform.height * sy));
        var baseLeft = obj.transform.x - sw * obj.transform.anchorX;
        var baseTop = obj.transform.y - sh * obj.transform.anchorY;
        var flipX = Boolean(obj.sprite && obj.sprite.flipX);
        var flipY = Boolean(obj.sprite && obj.sprite.flipY);
        col.smartRects.forEach(function (sr) {
          var rx = flipX ? Math.max(0, 1 - (sr.x + sr.w)) : sr.x;
          var ry = flipY ? Math.max(0, 1 - (sr.y + sr.h)) : sr.y;
          var rw = Math.max(2, sr.w * sw);
          var rh = Math.max(2, sr.h * sh);
          var sleft = baseLeft + rx * sw;
          var stop = baseTop + ry * sh;
          out.push({ kind: 'box', left: sleft, right: sleft + rw, top: stop, bottom: stop + rh, cx: sleft + rw * 0.5, cy: stop + rh * 0.5, radius: Math.max(rw, rh) * 0.5, isSensor: Boolean(col.isSensor), layer: col.layer || objLayer, mask: col.mask });
        });
        return;
      }
      var cw = Math.max(1, col.width * sx);
      var ch = Math.max(1, col.height * sy);
      var cx = obj.transform.x + (0.5 - obj.transform.anchorX) * obj.transform.width * sx + (col.offsetX || 0) * sx;
      var cy = obj.transform.y + (0.5 - obj.transform.anchorY) * obj.transform.height * sy + (col.offsetY || 0) * sy;
      if (col.shape === 'circle') {
        var r = Math.max(1, (col.radius || Math.max(col.width, col.height) * 0.5) * Math.max(sx, sy));
        out.push({ kind: 'circle', left: cx - r, right: cx + r, top: cy - r, bottom: cy + r, cx: cx, cy: cy, radius: r, isSensor: Boolean(col.isSensor), layer: col.layer || objLayer, mask: col.mask });
      } else {
        out.push({ kind: 'box', left: cx - cw * 0.5, right: cx + cw * 0.5, top: cy - ch * 0.5, bottom: cy + ch * 0.5, cx: cx, cy: cy, radius: Math.max(cw, ch) * 0.5, isSensor: Boolean(col.isSensor), layer: col.layer || objLayer, mask: col.mask });
      }
    });
    return out;
  }

  function computeJoystickVector(dx, dy, maxRadius, deadzone) {
    var rad = Math.max(8, maxRadius || 42);
    var dz = Math.max(0, Math.min(0.6, deadzone !== undefined ? deadzone : 0.16));
    var dist = Math.hypot(dx, dy);
    if (dist <= 0.0001) return { x: 0, y: 0, magnitude: 0 };
    var rawMag = Math.min(1, dist / rad);
    if (rawMag <= dz) return { x: 0, y: 0, magnitude: 0 };
    var rescaled = Math.min(1, (rawMag - dz) / Math.max(0.05, 1 - dz));
    return { x: (dx / dist) * rescaled, y: (dy / dist) * rescaled, magnitude: rescaled };
  }

  function evalAnimAtomic(raw, ctx) {
    var cond = String(raw || '').trim();
    if (!cond || cond === 'manual') return false;
    var low = cond.toLowerCase();
    if (low === 'falling' || low === 'isfalling') {
      return !ctx.isGrounded && Number(ctx.vy || 0) <= 0;
    }
    if (low === '!falling' || low === '!isfalling') {
      return ctx.isGrounded || Number(ctx.vy || 0) > 0;
    }
    if (cond === 'animFinished' || cond === 'animFinished == true') {
      return Boolean(ctx.animFinished || (ctx.animProgress !== undefined && ctx.animProgress >= 0.99));
    }
    if (cond === '!animFinished' || cond === 'animFinished == false') {
      return !(ctx.animFinished || (ctx.animProgress !== undefined && ctx.animProgress >= 0.99));
    }
    if (cond === '!isGrounded') return !ctx.isGrounded;
    if (cond === 'isGrounded') return Boolean(ctx.isGrounded);
    if (cond.indexOf('!keyPressed:') === 0) {
      var kp1 = cond.slice(12).trim();
      return kp1 ? !(ctx.justPressedKeys && ctx.justPressedKeys.has(kp1)) : false;
    }
    if (cond.indexOf('keyPressed:') === 0) {
      var kp2 = cond.slice(11).trim();
      return kp2 ? Boolean(ctx.justPressedKeys && ctx.justPressedKeys.has(kp2)) : false;
    }
    if (cond.indexOf('!keyHeld:') === 0) {
      var k1 = cond.slice(9).trim();
      return k1 ? !ctx.heldKeys.has(k1) : false;
    }
    if (cond.indexOf('keyHeld:') === 0) {
      var k2 = cond.slice(8).trim();
      return k2 ? ctx.heldKeys.has(k2) : false;
    }
    var ms = cond.match(/^speed\\s*(>=|<=|>|<|==|!=)\\s*(-?\\d+(?:\\.\\d+)?)$/);
    if (ms) {
      var v1 = Number(ms[2]);
      if (ms[1] === '>=') return ctx.speed >= v1;
      if (ms[1] === '<=') return ctx.speed <= v1;
      if (ms[1] === '>') return ctx.speed > v1;
      if (ms[1] === '<') return ctx.speed < v1;
      if (ms[1] === '!=') return ctx.speed !== v1;
      return ctx.speed === v1;
    }
    var mvy = cond.match(/^vy\\s*(>=|<=|>|<|==|!=)\\s*(-?\\d+(?:\\.\\d+)?)$/);
    if (mvy) {
      var v2 = Number(mvy[2]);
      if (mvy[1] === '>=') return ctx.vy >= v2;
      if (mvy[1] === '<=') return ctx.vy <= v2;
      if (mvy[1] === '>') return ctx.vy > v2;
      if (mvy[1] === '<') return ctx.vy < v2;
      if (mvy[1] === '!=') return ctx.vy !== v2;
      return ctx.vy === v2;
    }
    var mg = cond.match(/^isGrounded\\s*(==|!=)\\s*(true|false)$/);
    if (mg) return mg[1] === '!=' ? String(ctx.isGrounded) !== mg[2] : String(ctx.isGrounded) === mg[2];
    if (cond.indexOf('var:') === 0) {
      var mv = cond.slice(4).match(/^([a-zA-Z0-9_]+)\\s*(>=|<=|>|<|==|!=)\\s*(.+)$/);
      if (mv) {
        var lv = ctx.variables && ctx.variables.has(mv[1]) ? ctx.variables.get(mv[1]) : 0;
        var rv = mv[3].trim();
        var ln = Number(lv); var rn = Number(rv);
        if (!isNaN(ln) && !isNaN(rn)) {
          if (mv[2] === '>=') return ln >= rn;
          if (mv[2] === '<=') return ln <= rn;
          if (mv[2] === '>') return ln > rn;
          if (mv[2] === '<') return ln < rn;
          if (mv[2] === '!=') return ln !== rn;
          return ln === rn;
        }
        return mv[2] === '!=' ? String(lv) !== rv : String(lv) === rv;
      }
    }
    return false;
  }

  function evalAnimExpr2d(expr, ctx) {
    var trimmed = String(expr || '').trim();
    if (!trimmed || trimmed === 'manual') return false;
    return trimmed.split('||').some(function (grp) {
      var parts = grp.split('&&');
      return parts.length > 0 && parts.every(function (p) { return evalAnimAtomic(p, ctx); });
    });
  }

  function isTerminalNode2d(node) {
    var lbl = ((node.name || '') + ' ' + (node.clipName || '')).toLowerCase();
    var c = String(node.conditionExpr || '').toLowerCase();
    return c.indexOf('var:') >= 0 || c.indexOf('death') >= 0 || lbl.indexOf('death') >= 0 || lbl.indexOf('morir') >= 0 || lbl.indexOf('dead') >= 0;
  }

  function isLocomotionNode2d(node, initialId) {
    if (node.id === initialId) return true;
    var lbl = ((node.name || '') + ' ' + (node.clipName || '')).toLowerCase();
    return /(idle|reposo|quiet|stand|walk|camin|andar|run|corr|sprint|move|mover)/.test(lbl);
  }

  function nodeTriggerMatches2d(node, ctx) {
    var key = String(node.triggerKey || '').trim();
    var cond = String(node.conditionExpr || '').trim();
    var hasCond = cond.length > 0 && cond !== 'manual';
    if (!key && !hasCond) return false;
    if (key) {
      var mode = node.triggerKeyMode || 'pressed';
      var okKey = mode === 'held' ? Boolean(ctx.heldKeys && ctx.heldKeys.has(key)) : Boolean(ctx.justPressedKeys && ctx.justPressedKeys.has(key));
      if (!okKey) return false;
    }
    if (hasCond && !evalAnimExpr2d(cond, ctx)) return false;
    return true;
  }

  function resolveSmartLocomotion2d(fsm, curNode, ctx) {
    var others = (fsm.states || []).filter(function (s) { return s.id !== curNode.id; });
    if (others.length === 0) return null;
    function byPat(re) {
      return others.find(function (s) { return re.test(((s.name || '') + ' ' + (s.clipName || '')).toLowerCase()); });
    }
    var idleN = byPat(/\\b(idle|reposo|quieto|quieta|stand|espera)\\b/) || others.find(function (s) { return s.id === fsm.initialStateId; }) || others[0];
    var walkN = byPat(/\\b(walk|caminar|camina|andar|anda|trotar|move|mover)\\b/);
    var runN = byPat(/\\b(run|correr|corre|sprint|dash_move)\\b/);
    var runMatched = false;
    if (runN) {
      if (runN.triggerKey) {
        var rm = runN.triggerKeyMode || 'held';
        runMatched = rm === 'held' ? Boolean(ctx.heldKeys && ctx.heldKeys.has(runN.triggerKey)) : Boolean(ctx.justPressedKeys && ctx.justPressedKeys.has(runN.triggerKey));
      }
      if (!runMatched && runN.conditionExpr && runN.conditionExpr !== 'manual') runMatched = evalAnimExpr2d(runN.conditionExpr, ctx);
      if (!runMatched) {
        runMatched = (fsm.transitions || []).some(function (t) {
          return t.toStateId === runN.id && t.conditionExpr && t.conditionExpr !== 'manual' && evalAnimExpr2d(t.conditionExpr, ctx);
        });
      }
    }
    var sprintHeld = Boolean(ctx.heldKeys && (ctx.heldKeys.has('ShiftLeft') || ctx.heldKeys.has('ShiftRight')));
    if (!(ctx.speed > 0.1)) return idleN || null;
    if (runN && (runMatched || sprintHeld || ctx.speed > 5.5 || !walkN)) return runN;
    if (walkN) return walkN;
    return runN || idleN || null;
  }

  function shouldAutoReturn2d(node, ctx) {
    var mode = node.returnMode || 'none';
    if (mode === 'none') return false;
    var trigKey = String(node.triggerKey || '').trim();
    if (trigKey && (node.triggerKeyMode || 'pressed') !== 'held' && ctx.justPressedKeys && ctx.justPressedKeys.has(trigKey)) return false;
    var on = node.returnOn || 'auto';
    if (on === 'auto') {
      if (trigKey && node.triggerKeyMode === 'held') on = 'keyReleased';
      else if (/jump|salt|fall|caer|aire|air/.test(((node.name || '') + ' ' + (node.clipName || '')).toLowerCase())) on = 'grounded';
      else if (node.loopMode === 'LoopOnce' || trigKey) on = 'animFinished';
      else return false;
    }
    if (on === 'grounded') return Boolean(ctx.isGrounded && Number(ctx.vy || 0) <= 0.15);
    if (on === 'animFinished') return Boolean(ctx.animFinished || (ctx.animProgress !== undefined && ctx.animProgress >= 0.99));
    if (on === 'keyReleased') return trigKey ? !(ctx.heldKeys && ctx.heldKeys.has(trigKey)) : false;
    return false;
  }

  function stepAnimFsm2d(fsm, curState, ctx) {
    if (!fsm || !fsm.states || fsm.states.length === 0) return null;
    var cur = fsm.states.find(function (s) { return s.name === curState || s.id === curState; });
    if (!cur) {
      cur = fsm.states.find(function (s) { return s.id === fsm.initialStateId; }) || fsm.states[0];
      return { changed: true, stateName: cur.name, clipName: cur.clipName, timeScale: cur.timeScale || 1, loopMode: cur.loopMode || 'LoopRepeat', node: cur };
    }
    function mkRes(nxt) {
      return { changed: true, stateName: nxt.name, clipName: nxt.clipName, timeScale: nxt.timeScale || 1, loopMode: nxt.loopMode || 'LoopRepeat', node: nxt };
    }
    var trs = fsm.transitions || [];
    var curTerm = isTerminalNode2d(cur);
    function checkList(list) {
      for (var i = 0; i < list.length; i++) {
        var tr = list[i];
        if (!evalAnimExpr2d(tr.conditionExpr, ctx)) continue;
        var nxt = fsm.states.find(function (s) { return s.id === tr.toStateId; });
        if (nxt && nxt.id !== cur.id) return mkRes(nxt);
      }
      return null;
    }
    var wTerm = trs.filter(function (t) { return t.fromStateId === '*' && (String(t.conditionExpr || '').indexOf('var:') >= 0 || String(t.conditionExpr || '').indexOf('<= 0') >= 0); });
    var r1 = checkList(wTerm);
    if (r1) return r1;
    for (var ti = 0; ti < fsm.states.length; ti++) {
      var stT = fsm.states[ti];
      if (stT.id !== cur.id && stT.fromAnyState && isTerminalNode2d(stT) && nodeTriggerMatches2d(stT, ctx)) return mkRes(stT);
    }
    if (!curTerm) {
      for (var ai = 0; ai < fsm.states.length; ai++) {
        var stA = fsm.states[ai];
        if (stA.id !== cur.id && stA.fromAnyState && !isTerminalNode2d(stA) && nodeTriggerMatches2d(stA, ctx)) return mkRes(stA);
      }
    }
    var direct = trs.filter(function (t) { return t.fromStateId === cur.id; });
    var r2 = checkList(direct);
    if (r2) return r2;
    if (!curTerm && isLocomotionNode2d(cur, fsm.initialStateId)) {
      for (var li = 0; li < fsm.states.length; li++) {
        var stL = fsm.states[li];
        if (stL.id !== cur.id && !stL.fromAnyState && nodeTriggerMatches2d(stL, ctx)) return mkRes(stL);
      }
    }
    var wGen = trs.filter(function (t) { return t.fromStateId === '*' && wTerm.indexOf(t) < 0; });
    var r3 = checkList(wGen);
    if (r3) return r3;
    if (shouldAutoReturn2d(cur, ctx)) {
      var ret = null;
      if (cur.returnMode === 'state' && cur.returnStateId) ret = fsm.states.find(function (s) { return s.id === cur.returnStateId; }) || null;
      else if (cur.returnMode === 'idle') ret = fsm.states.find(function (s) { return /\\b(idle|reposo|quieto|quieta|stand)\\b/i.test((s.name || '') + ' ' + (s.clipName || '')); }) || fsm.states.find(function (s) { return s.id === fsm.initialStateId; }) || fsm.states[0];
      else if (cur.returnMode === 'smart_locomotion') ret = resolveSmartLocomotion2d(fsm, cur, ctx);
      if (ret && ret.id !== cur.id) return mkRes(ret);
    }
    return { changed: false, stateName: cur.name, clipName: cur.clipName, timeScale: cur.timeScale || 1, loopMode: cur.loopMode || 'LoopRepeat', node: cur };
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

  function startBufferedSound(buf, vol, pitchMul, ch, loop, spatialX, spatialY, maxDist) {
    if (!audioCtx || !buf) return null;
    var src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.loop = Boolean(loop);
    src.playbackRate.value = Math.max(0.25, Math.min(3, pitchMul || 1));
    var g = audioCtx.createGain();
    var clipVol = Math.max(0, Math.min(2, vol !== undefined ? vol : 1));
    g.gain.value = clipVol;
    src.connect(g);
    var destBus = getBusNode(ch || 'sfx');
    if (spatialX !== undefined && spatialY !== undefined && typeof activeSim !== 'undefined' && activeSim) {
      var maxD = Math.max(120, maxDist || 720);
      var lX = (activeSim.cameraPos ? activeSim.cameraPos.x : 0) + (typeof stageW !== 'undefined' ? stageW * 0.5 : 640);
      var lY = (activeSim.cameraPos ? activeSim.cameraPos.y : 0) + (typeof stageH !== 'undefined' ? stageH * 0.5 : 360);
      var dx = Number(spatialX) - lX;
      var dy = Number(spatialY) - lY;
      var dist = Math.hypot(dx, dy);
      g.gain.value = clipVol * Math.max(0, 1 - dist / maxD);
      if (typeof audioCtx.createStereoPanner === 'function') {
        var panner = audioCtx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, dx / (maxD * 0.6)));
        g.connect(panner);
        panner.connect(destBus);
      } else {
        g.connect(destBus);
      }
    } else {
      g.connect(destBus);
    }
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
      if (currentMusicGain && audioCtx) currentMusicGain.gain.setTargetAtTime(safeVol, audioCtx.currentTime, 0.04);
      return;
    }
    var fadeSec = 1.5;
    var prevSrc = currentMusicSource;
    var prevGain = currentMusicGain;
    var hadPrev = Boolean(prevSrc && prevGain && audioCtx);
    if (hadPrev) {
      try {
        var nowFade = audioCtx.currentTime;
        prevGain.gain.cancelScheduledValues(nowFade);
        prevGain.gain.setValueAtTime(Math.max(0.001, prevGain.gain.value), nowFade);
        prevGain.gain.linearRampToValueAtTime(0.0001, nowFade + fadeSec);
        prevSrc.onended = null;
        prevSrc.stop(nowFade + fadeSec + 0.04);
      } catch (_) {}
      currentMusicSource = null;
      currentMusicGain = null;
      currentMusicAssetId = null;
    } else {
      stopMusic();
    }
    var cmd = { assetId: assetId, volume: safeVol, loop: loop !== false, keepIfSame: keepIfSame !== false, crossfade: hadPrev };
    pendingMusicCmd = cmd;
    var ctx = ensureAudio();
    if (!ctx || ctx.state !== 'running') return;
    function startBuf(buf) {
      if (!buf || !pendingMusicCmd || pendingMusicCmd.assetId !== assetId || !audioCtx || audioCtx.state !== 'running') return;
      var doFade = pendingMusicCmd.crossfade;
      pendingMusicCmd = null;
      var src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.loop = cmd.loop;
      var g = audioCtx.createGain();
      var nowM = audioCtx.currentTime;
      if (doFade) {
        g.gain.setValueAtTime(0.001, nowM);
        g.gain.linearRampToValueAtTime(Math.max(0.001, cmd.volume), nowM + fadeSec);
      } else {
        g.gain.value = cmd.volume;
      }
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

  function playAudioAsset(assetId, volume, pitchMul, ch, loop, spatialX, spatialY, maxDist) {
    if (!assetId) return;
    var chName = ch || 'sfx';
    if (chName === 'music') {
      playMusicAsset(assetId, volume, loop !== false, false);
      return;
    }
    var ctx = ensureAudio();
    if (!ctx || getChannelGain(chName) <= 0.001) return;
    if (audioBuffers.has(assetId)) {
      startBufferedSound(audioBuffers.get(assetId), volume, pitchMul, chName, loop, spatialX, spatialY, maxDist);
    } else {
      decodeAssetIfNeeded(assetId).then(function (buf) {
        if (buf) startBufferedSound(buf, volume, pitchMul, chName, loop, spatialX, spatialY, maxDist);
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
      explosion: { rate: 60, maxParticles: 140, speedMin: 90, speedMax: 280, angleDeg: 0, spreadDeg: 360, gravity: 120, sizeStart: 7, sizeEnd: 1, lifetime: 0.45, colorStart: '#fde047', colorEnd: '#dc2626', blendAlpha: 1 },
      liquid: { rate: 36, maxParticles: 140, speedMin: 60, speedMax: 150, angleDeg: -85, spreadDeg: 40, gravity: 360, sizeStart: 8, sizeEnd: 5, lifetime: 0.9, colorStart: '#7dd3fc', colorEnd: '#0284c7', blendAlpha: 0.88, particleShape: 'liquid', emitterShape: 'cone', drag: 0.25 },
      waterfall: { rate: 55, maxParticles: 180, speedMin: 90, speedMax: 180, angleDeg: 90, spreadDeg: 18, gravity: 420, sizeStart: 10, sizeEnd: 14, lifetime: 1.1, colorStart: '#bae6fd', colorEnd: '#0369a1', blendAlpha: 0.78, particleShape: 'liquid', emitterShape: 'box', emitterRadius: 24, turbulence: 22 },
      ripple: { rate: 12, maxParticles: 40, speedMin: 0, speedMax: 8, angleDeg: 0, spreadDeg: 360, gravity: 0, sizeStart: 4, sizeEnd: 26, lifetime: 0.85, colorStart: '#e0f2fe', colorEnd: '#38bdf8', blendAlpha: 0.75, particleShape: 'ring', emitterShape: 'ring', sizeCurve: [0.3, 0.75, 1, 1.1], alphaCurve: [0.9, 0.65, 0.25, 0] }
    };
    return map[preset] || map.explosion;
  }

  function sampleVfxCurve2D(curve, t, fallbackStart, fallbackEnd) {
    var cl = Math.max(0, Math.min(1, t));
    if (curve && curve.length >= 2) {
      var sc = cl * (curve.length - 1);
      var i0 = Math.min(curve.length - 2, Math.floor(sc));
      var f = sc - i0;
      var v0 = curve[i0] !== undefined ? curve[i0] : 1;
      var v1 = curve[i0 + 1] !== undefined ? curve[i0 + 1] : v0;
      return fallbackStart * (v0 + (v1 - v0) * f);
    }
    return fallbackStart + (fallbackEnd - fallbackStart) * cl;
  }

  function getMaxDpr2D(sc) {
    var perf = sc && sc.renderQuality ? sc.renderQuality.performanceMode : 'balanced_60fps';
    if (perf === 'ultra_fast') return 1;
    if (perf === 'high_quality') return 2;
    return 1.5;
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
      resolution: Math.min(window.devicePixelRatio || 1, 1.5),
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
    var lightCanvas = document.createElement('canvas');
    lightCanvas.width = Math.max(64, stageW);
    lightCanvas.height = Math.max(64, stageH);
    var lightCtx = lightCanvas.getContext('2d');
    var lightTexture = PIXI.Texture.from(lightCanvas);
    var lightSprite = new PIXI.Sprite(lightTexture);
    lightSprite.blendMode = 'add';
    lightSprite.visible = false;
    var singleLightCanvas = document.createElement('canvas');
    var fxGraphics = new PIXI.Graphics();
    var transitionGraphics = new PIXI.Graphics();
    world.addChild(bgRect);
    world.addChild(sceneRoot);
    world.addChild(lightSprite);
    world.addChild(fxGraphics);
    world.addChild(transitionGraphics);
    app.stage.addChild(world);

    function renderLighting2DExport(sim) {
      var lights = (sim.scene.objects || []).filter(function (o) { return o.visible && o.type === 'light_2d' && o.light2d; });
      if (lights.length === 0 || !lightCtx) {
        lightSprite.visible = false;
        return;
      }
      lightSprite.visible = true;
      lightCtx.globalCompositeOperation = 'source-over';
      lightCtx.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
      var occluders = (sim.scene.objects || []).filter(function (o) {
        return o.visible && o.type !== 'light_2d' && ((o.colliders && o.colliders.some(function (c) { return !c.isTrigger; })) || (o.components && o.components.some(function (c) { return c.enabled && c.type === 'solid'; })));
      });
      var sCtx = singleLightCanvas.getContext('2d');
      lights.forEach(function (lObj) {
        var cfg = lObj.light2d;
        var radius = Math.max(10, Number(cfg.radius || 220));
        var intensity = Math.max(0, Math.min(3, Number(cfg.intensity !== undefined ? cfg.intensity : 1)));
        var softness = Math.max(0, Math.min(1, Number(cfg.softness !== undefined ? cfg.softness : 0.7)));
        if (intensity <= 0.001) return;
        var hex = String(cfg.color || '#fef08a').replace('#', '');
        var fullHex = hex.length === 3 ? hex.split('').map(function (c) { return c + c; }).join('') : hex;
        var nHex = parseInt(fullHex, 16) || 0xfef08a;
        var cr = (nHex >> 16) & 255, cg = (nHex >> 8) & 255, cb = nHex & 255;
        var cx = lObj.transform.x - sim.cameraPos.x, cy = lObj.transform.y - sim.cameraPos.y;
        var dia = Math.ceil(radius * 2) + 4;
        if (singleLightCanvas.width !== dia || singleLightCanvas.height !== dia) {
          singleLightCanvas.width = dia; singleLightCanvas.height = dia;
        } else if (sCtx) {
          sCtx.globalCompositeOperation = 'source-over';
          sCtx.clearRect(0, 0, dia, dia);
        }
        if (!sCtx) return;
        var lc = dia * 0.5;
        sCtx.save();
        if (cfg.kind === 'spot') {
          var dirRad = ((Number(cfg.directionDeg || 0)) * Math.PI) / 180;
          var coneRad = Math.max(0.15, ((Number(cfg.coneAngleDeg || 60) * 0.5) * Math.PI) / 180);
          sCtx.beginPath(); sCtx.moveTo(lc, lc);
          sCtx.arc(lc, lc, radius, dirRad - coneRad, dirRad + coneRad);
          sCtx.closePath(); sCtx.clip();
        }
        var grad = sCtx.createRadialGradient(lc, lc, 0, lc, lc, radius);
        var coreStop = Math.max(0.02, Math.min(0.95, 1 - softness));
        var midStop = Math.max(coreStop + 0.01, Math.min(0.98, coreStop + (1 - coreStop) * 0.55));
        var maxAlpha = Math.min(0.88, intensity * 0.48);
        grad.addColorStop(0, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + maxAlpha + ')');
        grad.addColorStop(coreStop, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (maxAlpha * 0.85) + ')');
        grad.addColorStop(midStop, 'rgba(' + cr + ',' + cg + ',' + cb + ',' + (maxAlpha * 0.35) + ')');
        grad.addColorStop(1, 'rgba(' + cr + ',' + cg + ',' + cb + ',0)');
        sCtx.fillStyle = grad;
        sCtx.fillRect(0, 0, dia, dia);
        sCtx.restore();
        if (cfg.castShadows) {
          sCtx.save();
          sCtx.globalCompositeOperation = 'destination-out';
          sCtx.fillStyle = 'rgba(0,0,0,0.92)';
          occluders.forEach(function (occ) {
            var ow = Math.abs(occ.transform.width * occ.transform.scaleX), oh = Math.abs(occ.transform.height * occ.transform.scaleY);
            var ox = occ.transform.x - ow * (occ.transform.anchorX || 0.5) - sim.cameraPos.x;
            var oy = occ.transform.y - oh * (occ.transform.anchorY || 0.5) - sim.cameraPos.y;
            var corners = [[ox, oy], [ox + ow, oy], [ox + ow, oy + oh], [ox, oy + oh]];
            var minA = Infinity, maxA = -Infinity, cP1 = corners[0], cP2 = corners[0];
            var refA = Math.atan2(oy + oh * 0.5 - cy, ox + ow * 0.5 - cx);
            corners.forEach(function (pt) {
              var a = Math.atan2(Math.sin(Math.atan2(pt[1] - cy, pt[0] - cx) - refA), Math.cos(Math.atan2(pt[1] - cy, pt[0] - cx) - refA));
              if (a < minA) { minA = a; cP1 = pt; }
              if (a > maxA) { maxA = a; cP2 = pt; }
            });
            if (Math.hypot(ox + ow * 0.5 - cx, oy + oh * 0.5 - cy) <= radius * 1.15) {
              var ext = radius * 2;
              var l1x = cP1[0] - cx + lc, l1y = cP1[1] - cy + lc, l2x = cP2[0] - cx + lc, l2y = cP2[1] - cy + lc;
              var ang1 = refA + minA, ang2 = refA + maxA;
              sCtx.beginPath();
              sCtx.moveTo(l1x, l1y);
              sCtx.lineTo(l1x + Math.cos(ang1) * ext, l1y + Math.sin(ang1) * ext);
              sCtx.lineTo(l2x + Math.cos(ang2) * ext, l2y + Math.sin(ang2) * ext);
              sCtx.lineTo(l2x, l2y);
              sCtx.closePath();
              sCtx.fill();
            }
          });
          sCtx.restore();
        }
        lightCtx.drawImage(singleLightCanvas, cx - lc, cy - lc);
      });
      lightTexture.source.update();
    }

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
        scriptObjectData: new Map(),
        startedScriptBindings: new Set(),
        scriptActivePairs: new Set(),
        scriptTweens: [],
        dynamicWidgets: [],
        dynamicToasts: [],
        shakeRemaining: 0,
        shakeIntensity: 0,
        mpSocket: null,
        mpRemotes: new Map(),
        mpRoomId: (sc.multiplayer && sc.multiplayer.roomId) || 'sala_global',
        mpPlayerId: 'p2d_' + Math.random().toString(36).slice(2, 9),
        mpLastSend: 0
      };
    }

    function createDisplayForObject(obj, sim) {
      var w = obj.transform.width;
      var h = obj.transform.height;
      var ax = obj.transform.anchorX;
      var ay = obj.transform.anchorY;
      var node;

      if (obj.type === 'sprite') {
        var fsmSt = obj.sprite && obj.sprite.animation ? obj.sprite.animation.fsmActiveState : null;
        var resolvedAid = (fsmSt && fsmSt.assetId) || (obj.sprite && obj.sprite.assetId);
        var baseTex = resolvedAid ? textures.get(resolvedAid) : null;
        if (baseTex) {
          baseTex.source.scaleMode = obj.sprite.sampling === 'nearest' ? 'nearest' : 'linear';
          var anim = obj.sprite.animation;
          var activeTex = baseTex;
          if ((anim && anim.enabled) || fsmSt) {
            var cols = Math.max(1, (fsmSt && fsmSt.cols) || (anim && anim.cols) || 1);
            var rows = Math.max(1, (fsmSt && fsmSt.rows) || (anim && anim.rows) || 1);
            var startF = fsmSt ? Math.max(0, fsmSt.startFrame || 0) : 0;
            var total = fsmSt
              ? Math.max(1, Math.min(fsmSt.frameCount || 1, cols * rows - startF))
              : Math.max(1, Math.min((anim && anim.frameCount) || cols * rows, cols * rows));
            var frames = [];
            for (var f = 0; f < total; f++) {
              var fi = Math.min(cols * rows - 1, startF + f);
              frames.push(sliceSubTexture(baseTex, fi % cols, Math.floor(fi / cols), cols, rows));
            }
            var animSprite = new PIXI.AnimatedSprite(frames);
            var layA = computeSpriteLayout(w, h, ax, ay, frames[0].width, frames[0].height, obj.sprite.fitMode || 'contain', obj.sprite.cropRect);
            animSprite.anchor.set(ax, ay);
            animSprite.position.set(layA.offsetX, layA.offsetY);
            animSprite.width = Math.max(1, layA.drawWidth);
            animSprite.height = Math.max(1, layA.drawHeight);
            animSprite.tint = parseColor(obj.sprite.tint, 0xffffff);
            var aFps = (fsmSt && fsmSt.fps) || (anim && anim.fps) || 8;
            var aLoop = fsmSt ? fsmSt.loop !== false : (!anim || anim.loop !== false);
            animSprite.animationSpeed = Math.max(0.01, aFps / 60);
            animSprite.loop = aLoop;
            if (!anim || anim.playing !== false) animSprite.play();
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
            wrapA.__fsmKey = (resolvedAid || '') + ':' + cols + ':' + rows + ':' + startF + ':' + total + ':' + aFps + ':' + aLoop;
            wrapA.__animSprite = animSprite;
            node = wrapA;
          } else {
            var lay = computeSpriteLayout(w, h, ax, ay, activeTex.width, activeTex.height, obj.sprite.fitMode || 'contain', obj.sprite.cropRect);
            if (lay.sourceCrop) {
              activeTex = new PIXI.Texture({ source: activeTex.source, frame: new PIXI.Rectangle(lay.sourceCrop.x, lay.sourceCrop.y, lay.sourceCrop.width, lay.sourceCrop.height) });
            }
            if (obj.sprite.fitMode === 'nine_slice') {
              var ns = obj.sprite.nineSlice || { left: 16, right: 16, top: 16, bottom: 16 };
              var wrapNs = new PIXI.Container();
              var nsSpr = new PIXI.NineSliceSprite({
                texture: activeTex,
                leftWidth: Math.max(1, Number(ns.left || 16)),
                topHeight: Math.max(1, Number(ns.top || 16)),
                rightWidth: Math.max(1, Number(ns.right || 16)),
                bottomHeight: Math.max(1, Number(ns.bottom || 16)),
                width: Math.max(1, w),
                height: Math.max(1, h)
              });
              nsSpr.position.set(-w * ax, -h * ay);
              nsSpr.tint = parseColor(obj.sprite.tint, 0xffffff);
              wrapNs.addChild(nsSpr);
              node = wrapNs;
            } else if (lay.tiled) {
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

    var uiOverlay = document.createElement('div');
    uiOverlay.id = 'nx-ui-widgets-layer';
    uiOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:15;overflow:hidden;';
    var widgetsHost2D = document.createElement('div');
    widgetsHost2D.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    var dynWidgetsHost2D = document.createElement('div');
    dynWidgetsHost2D.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:35;';
    var toastHost2D = document.createElement('div');
    toastHost2D.style.cssText = 'position:absolute;top:16px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;z-index:45;';
    var dialogueHost2D = document.createElement('div');
    dialogueHost2D.style.cssText = 'position:absolute;left:50%;bottom:24px;transform:translateX(-50%);width:min(680px,92%);pointer-events:auto;z-index:55;display:none;';
    uiOverlay.appendChild(widgetsHost2D);
    uiOverlay.appendChild(dynWidgetsHost2D);
    uiOverlay.appendChild(toastHost2D);
    uiOverlay.appendChild(dialogueHost2D);
    document.getElementById('nx-root').appendChild(uiOverlay);

    var assetPathMap2D = new Map();
    (gameData.assets || []).forEach(function (a) { assetPathMap2D.set(a.id, a.path); });
    var i18nCfg2D = gameData.i18n || { defaultLocale: 'es', autoDetectBrowser: true, entries: {} };
    var activeLocale2D = i18nCfg2D.defaultLocale || 'es';
    if (i18nCfg2D.autoDetectBrowser && typeof navigator !== 'undefined') {
      var navLang2D = String(navigator.language || '').toLowerCase().slice(0, 2);
      if (navLang2D === 'es' || navLang2D === 'en' || navLang2D === 'pt') activeLocale2D = navLang2D;
    }
    var dataTables2D = gameData.dataTables || [];
    var dialogues2D = gameData.dialogues || [];
    var activeDialogue2D = null;

    function t2D(key) {
      var ent = i18nCfg2D && i18nCfg2D.entries ? i18nCfg2D.entries[key] : null;
      if (!ent) return key;
      return ent[activeLocale2D] || ent[i18nCfg2D.defaultLocale || 'es'] || ent.es || ent.en || ent.pt || key;
    }
    function queryDataTable2D(tableRef, rowKey) {
      var tbl = dataTables2D.find(function (tb) { return tb.id === tableRef || String(tb.name || '').toLowerCase() === String(tableRef || '').toLowerCase(); });
      if (!tbl) return null;
      if (rowKey === undefined || rowKey === null || rowKey === '') return tbl.rows || [];
      if (typeof rowKey === 'number') return (tbl.rows && tbl.rows[rowKey]) || null;
      var m = (tbl.rows || []).find(function (r) { return String(r.id || '') === String(rowKey) || String(r.name || '') === String(rowKey); });
      if (m) return m;
      var num = Number(rowKey);
      return !isNaN(num) && tbl.rows ? (tbl.rows[num] || null) : null;
    }
    function evalDialogueCond2D(expr, sim) {
      var raw = String(expr || '').trim();
      if (!raw) return true;
      var m = raw.match(/^([a-zA-Z0-9_.-]+)\\s*(==|!=|>=|<=|>|<)\\s*(.+)$/);
      if (!m) return Boolean(sim && sim.variables.get(raw));
      var lhs = sim ? sim.variables.get(m[1]) : undefined;
      var rhs = m[3].trim();
      if ((rhs[0] === '"' && rhs[rhs.length - 1] === '"') || (rhs[0] === "'" && rhs[rhs.length - 1] === "'")) rhs = rhs.slice(1, -1);
      else if (rhs === 'true') rhs = true;
      else if (rhs === 'false') rhs = false;
      else if (!isNaN(Number(rhs))) rhs = Number(rhs);
      var ln = Number(lhs), rn = Number(rhs);
      var bothN = typeof lhs === 'number' || (typeof rhs === 'number' && !isNaN(ln) && String(lhs || '') !== '');
      if (m[2] === '==') return bothN ? ln === rn : String(lhs || '') === String(rhs || '');
      if (m[2] === '!=') return bothN ? ln !== rn : String(lhs || '') !== String(rhs || '');
      if (m[2] === '>') return ln > rn;
      if (m[2] === '>=') return ln >= rn;
      if (m[2] === '<') return ln < rn;
      if (m[2] === '<=') return ln <= rn;
      return true;
    }
    function interpDialogueStr2D(txt, sim) {
      var out = String(txt || '').replace(/@t\\(([^)]+)\\)/g, function (_m, k) { return t2D(String(k).trim()); });
      return out.replace(/\\{\\{([a-zA-Z0-9_.-]+)\\}\\}/g, function (_m, k) {
        var v = sim && sim.variables ? sim.variables.get(k) : '';
        return v === undefined || v === null ? '' : String(v);
      });
    }
    function renderDialogueOverlay2D() {
      if (!activeDialogue2D || !activeSim) {
        dialogueHost2D.style.display = 'none';
        dialogueHost2D.innerHTML = '';
        return;
      }
      dialogueHost2D.style.display = 'block';
      var st = activeDialogue2D;
      var portraitUrl = st.portraitAssetId ? assetPathMap2D.get(st.portraitAssetId) : null;
      var shown = st.fullText.slice(0, Math.floor(st.revealedChars));
      dialogueHost2D.innerHTML = '';
      var box = document.createElement('div');
      box.style.cssText = 'background:rgba(15,23,42,0.96);border:2px solid rgba(56,189,248,0.55);border-radius:14px;padding:14px 16px;box-shadow:0 12px 32px rgba(0,0,0,0.6);display:flex;gap:14px;align-items:flex-start;font-family:sans-serif;color:#f8fafc;';
      if (portraitUrl) {
        var img = document.createElement('img');
        img.src = portraitUrl;
        img.style.cssText = 'width:68px;height:68px;border-radius:10px;object-fit:cover;border:1px solid rgba(148,163,184,0.4);flex-shrink:0;';
        box.appendChild(img);
      }
      var col = document.createElement('div');
      col.style.cssText = 'flex:1;min-width:0;';
      var spk = document.createElement('div');
      spk.style.cssText = 'font-size:12px;font-weight:700;color:#38bdf8;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;';
      spk.textContent = st.speaker || 'NPC';
      var body = document.createElement('div');
      body.style.cssText = 'font-size:14px;line-height:1.45;min-height:40px;color:#e2e8f0;';
      body.textContent = shown;
      col.appendChild(spk);
      col.appendChild(body);
      var btns = document.createElement('div');
      btns.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;justify-content:flex-end;';
      if (!st.finishedTyping) {
        var skipB = document.createElement('button');
        skipB.textContent = 'Continuar';
        skipB.style.cssText = 'background:#334155;color:#f8fafc;border:1px solid #475569;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;';
        skipB.onclick = function () { advanceDialogue2D(null); };
        btns.appendChild(skipB);
      } else if (st.choices && st.choices.length > 0) {
        st.choices.forEach(function (ch, idx) {
          var cb = document.createElement('button');
          cb.textContent = ch.text;
          cb.style.cssText = 'background:#0284c7;color:#ffffff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;';
          cb.onclick = function () { advanceDialogue2D(idx); };
          btns.appendChild(cb);
        });
      } else {
        var nextB = document.createElement('button');
        nextB.textContent = st.nextNodeId ? 'Siguiente' : 'Cerrar';
        nextB.style.cssText = 'background:#0284c7;color:#ffffff;border:none;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;';
        nextB.onclick = function () { advanceDialogue2D(null); };
        btns.appendChild(nextB);
      }
      col.appendChild(btns);
      box.appendChild(col);
      dialogueHost2D.appendChild(box);
    }
    function openDialogueNode2D(graph, nodeId) {
      if (!graph || !graph.nodes || graph.nodes.length === 0 || !activeSim) { activeDialogue2D = null; renderDialogueOverlay2D(); return; }
      var node = graph.nodes.find(function (n) { return n.id === nodeId; }) || graph.nodes.find(function (n) { return n.id === graph.startNodeId; }) || graph.nodes[0];
      if (!node) { activeDialogue2D = null; renderDialogueOverlay2D(); return; }
      var ft = interpDialogueStr2D(node.text, activeSim);
      var visChoices = (node.choices || []).filter(function (c) { return evalDialogueCond2D(c.conditionExpr, activeSim); }).map(function (c) {
        return Object.assign({}, c, { text: interpDialogueStr2D(c.text, activeSim) });
      });
      activeDialogue2D = {
        graphId: graph.id, nodeId: node.id, speaker: interpDialogueStr2D(node.speaker, activeSim),
        portraitAssetId: node.portraitAssetId || null, fullText: ft,
        revealedChars: ft.length <= 1 ? ft.length : 1, typewriterSpeed: Math.max(5, Math.min(200, node.typewriterSpeed || 45)),
        finishedTyping: ft.length <= 1, choices: visChoices, nextNodeId: node.nextNodeId || null
      };
      renderDialogueOverlay2D();
    }
    function startDialogue2D(idOrName) {
      var g = dialogues2D.find(function (d) { return d.id === idOrName || d.name === idOrName; });
      if (g) openDialogueNode2D(g, g.startNodeId);
    }
    function advanceDialogue2D(choiceIdx) {
      if (!activeDialogue2D || !activeSim) return;
      if (!activeDialogue2D.finishedTyping) {
        activeDialogue2D.revealedChars = activeDialogue2D.fullText.length;
        activeDialogue2D.finishedTyping = true;
        renderDialogueOverlay2D();
        return;
      }
      var g = dialogues2D.find(function (d) { return d.id === activeDialogue2D.graphId; });
      var nextId = activeDialogue2D.nextNodeId;
      if (choiceIdx !== null && choiceIdx >= 0 && activeDialogue2D.choices[choiceIdx]) {
        var ch = activeDialogue2D.choices[choiceIdx];
        if (ch.actionVar) {
          if (ch.actionOp === 'add') activeSim.variables.set(ch.actionVar, Number(activeSim.variables.get(ch.actionVar) || 0) + Number(ch.actionValue || 0));
          else activeSim.variables.set(ch.actionVar, ch.actionValue !== undefined ? ch.actionValue : true);
        }
        if (ch.actionEvent) activeSim.emittedEvents.push(ch.actionEvent);
        nextId = ch.nextNodeId || null;
      } else if (activeDialogue2D.choices && activeDialogue2D.choices.length > 0) {
        return;
      }
      if (!g || !nextId) { activeDialogue2D = null; renderDialogueOverlay2D(); return; }
      openDialogueNode2D(g, nextId);
    }

    function compileUserScript2D(sc) {
      if (!sc || sc.kind !== 'script') return null;
      var raw = String(sc.code || '');
      var commentParams = {};
      var pmRe = /\\/\\/\\s*@param\\s+([a-zA-Z0-9_]+)\\s*:\\s*(number|boolean|string)\\s*=\\s*([^\\r\\n]+)/g;
      var pm;
      while ((pm = pmRe.exec(raw)) !== null) {
        var pk = pm[1], pt = pm[2], pv = pm[3].trim();
        commentParams[pk] = pt === 'number' ? (Number(pv) || 0) : pt === 'boolean' ? pv === 'true' : pv.replace(/^['"]|['"]$/g, '');
      }
      var cleaned = raw
        .replace(/^\\s*import\\s+[\\s\\S]*?\\s+from\\s+['"][^'"]+['"];?\\s*$/gm, '')
        .replace(/^\\s*import\\s+['"][^'"]+['"];?\\s*$/gm, '')
        .replace(/^\\s*export\\s*\\{[^}]*\\};?\\s*$/gm, '')
        .replace(/^\\s*export\\s+default\\s+/gm, 'var __nexusDefaultExport = ')
        .replace(/^\\s*export\\s+(async\\s+)?function\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm, function (_m, ak, fnN) { return (ak ? 'async ' : '') + 'function ' + fnN; })
        .replace(/^\\s*export\\s+class\\s+/gm, 'class ')
        .replace(/^\\s*export\\s+(const|let|var)\\s+/gm, '$1 ');
      var fnNames = new Set(['onStart', 'onUpdate', 'onCollisionEnter', 'onClick', 'onDestroy']);
      var fnRe = /(?:export\\s+)?(?:async\\s+)?function\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\(/g;
      var mFn;
      while ((mFn = fnRe.exec(raw)) !== null) fnNames.add(mFn[1]);
      var vrRe = /(?:^|\\n)\\s*(?:export\\s+)?(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=/g;
      while ((mFn = vrRe.exec(raw)) !== null) {
        if (mFn[1] !== 'params' && mFn[1] !== '__nexusDefaultExport') fnNames.add(mFn[1]);
      }
      var autoExpose = Array.from(fnNames).map(function (n) {
        return 'try { if (typeof ' + n + ' === "function" && typeof result[' + JSON.stringify(n) + '] !== "function") result[' + JSON.stringify(n) + '] = ' + n + '; } catch (_) {}';
      }).join('\\n');
      var wrapped = '"use strict";\\nvar exports = {};\\nvar module = { exports: exports };\\nvar __nexusDefaultExport = undefined;\\n' + cleaned +
        '\\nvar result = {};' +
        '\\nif (typeof __nexusDefaultExport === "object" && __nexusDefaultExport !== null) { Object.assign(result, __nexusDefaultExport); }' +
        '\\nelse if (typeof __nexusDefaultExport === "function") {' +
        '\\n  var _pr = __nexusDefaultExport.prototype;' +
        '\\n  if (_pr && (typeof _pr.onStart === "function" || typeof _pr.onUpdate === "function" || typeof _pr.onCollisionEnter === "function")) {' +
        '\\n    try { var _ins = new __nexusDefaultExport(); if (_ins && typeof _ins === "object") { Object.assign(result, _ins); Object.getOwnPropertyNames(_pr).forEach(function (_k) { if (_k !== "constructor" && typeof _pr[_k] === "function" && !result[_k]) result[_k] = _pr[_k].bind(_ins); }); } } catch (_) {}' +
        '\\n  } else { result.onUpdate = __nexusDefaultExport; }' +
        '\\n}' +
        '\\nif (module.exports && typeof module.exports === "object" && Object.keys(module.exports).length > 0) Object.assign(result, module.exports);' +
        '\\ntry { if (typeof params === "object" && params !== null && !result.params) result.params = params; } catch (_) {}' +
        '\\n' + autoExpose + '\\nreturn result;';
      try {
        var hooks = new Function(wrapped)() || {};
        if (Object.keys(commentParams).length > 0) {
          hooks.params = Object.assign({}, commentParams, hooks.params && typeof hooks.params === 'object' ? hooks.params : {});
        }
        return { id: sc.id, name: sc.name, hooks: hooks };
      } catch (e) {
        console.warn('[NEXUS Script Error]', sc.name, e);
        return { id: sc.id, name: sc.name, hooks: Object.keys(commentParams).length > 0 ? { params: commentParams } : {}, error: e instanceof Error ? e.message : String(e) };
      }
    }

    var compiledScripts2D = new Map();
    (gameData.scripts || []).forEach(function (sc) {
      var resC = compileUserScript2D(sc);
      if (resC) compiledScripts2D.set(sc.id, resC);
    });

    function makeScriptHandle2D(obj, sim, objMap, params) {
      var body = sim.bodies.get(obj.id);
      if (!sim.scriptObjectData) sim.scriptObjectData = new Map();
      var data = sim.scriptObjectData.get(obj.id);
      if (!data) { data = {}; sim.scriptObjectData.set(obj.id, data); }
      return {
        get id() { return obj.id; },
        get name() { return obj.name; },
        get type() { return obj.type; },
        get tags() { return obj.tags || []; },
        get x() { return obj.transform.x; },
        set x(v) { if (Number.isFinite(v)) obj.transform.x = v; },
        get y() { return obj.transform.y; },
        set y(v) { if (Number.isFinite(v)) obj.transform.y = v; },
        get z() { return 0; },
        set z(_v) {},
        get rx() { return 0; },
        set rx(_v) {},
        get ry() { return 0; },
        set ry(_v) {},
        get rz() { return obj.transform.rotation; },
        set rz(v) { if (Number.isFinite(v)) obj.transform.rotation = v; },
        get rotation() { return obj.transform.rotation; },
        set rotation(v) { if (Number.isFinite(v)) obj.transform.rotation = v; },
        get vx() { return body ? body.vx : 0; },
        set vx(v) { if (body && Number.isFinite(v)) { body.vx = v; body.scriptVelocityDriven = true; } },
        get vy() { return body ? body.vy : 0; },
        set vy(v) { if (body && Number.isFinite(v)) { body.vy = v; body.scriptVelocityDriven = true; } },
        get vz() { return 0; },
        set vz(_v) {},
        get scaleX() { return obj.transform.scaleX; },
        set scaleX(v) { if (Number.isFinite(v)) obj.transform.scaleX = v; },
        get scaleY() { return obj.transform.scaleY; },
        set scaleY(v) { if (Number.isFinite(v)) obj.transform.scaleY = v; },
        get scaleZ() { return 1; },
        set scaleZ(_v) {},
        get opacity() { return obj.opacity; },
        set opacity(v) { if (Number.isFinite(v)) obj.opacity = v; },
        get visible() { return obj.visible; },
        set visible(v) { obj.visible = Boolean(v); },
        get isGrounded() { return Boolean(body && body.grounded); },
        get speed() { return body ? Math.hypot(body.vx, body.vy) : 0; },
        data: data,
        params: params || {},
        hasTag: function (tag) { return Array.isArray(obj.tags) && obj.tags.indexOf(tag) >= 0; },
        addTag: function (tag) { if (!Array.isArray(obj.tags)) obj.tags = []; if (tag && obj.tags.indexOf(tag) < 0) obj.tags.push(tag); },
        removeTag: function (tag) { if (Array.isArray(obj.tags)) obj.tags = obj.tags.filter(function (t) { return t !== tag; }); },
        moveTowards: function (targetOrX, speedOrY, dtOrMaxStep, maybeDt) {
          var tx = obj.transform.x, ty = obj.transform.y, maxStep = 0;
          if (typeof targetOrX === 'object' && targetOrX !== null) {
            tx = Number(targetOrX.x !== undefined ? targetOrX.x : obj.transform.x);
            ty = Number(targetOrX.y !== undefined ? targetOrX.y : obj.transform.y);
            maxStep = Number(speedOrY || 0) * Number(dtOrMaxStep || 0);
          } else {
            tx = Number(targetOrX); ty = Number(speedOrY);
            maxStep = maybeDt !== undefined ? Number(dtOrMaxStep || 0) * Number(maybeDt || 0) : Number(dtOrMaxStep || 0);
          }
          if (!Number.isFinite(tx) || !Number.isFinite(ty) || maxStep <= 0) return;
          var dx = tx - obj.transform.x, dy = ty - obj.transform.y, d = Math.hypot(dx, dy);
          if (d > 0.001) { var s = Math.min(d, maxStep); obj.transform.x += (dx / d) * s; obj.transform.y += (dy / d) * s; }
        },
        applyImpulse: function (ix, iy) { if (body) { body.vx += Number(ix || 0); body.vy += Number(iy || 0); body.scriptVelocityDriven = true; } },
        setVelocity: function (vx, vy) { if (body) { body.vx = Number(vx || 0); body.vy = Number(vy || 0); body.scriptVelocityDriven = true; } },
        playAnim: function (clipName) { if (obj.sprite && obj.sprite.animation) { obj.sprite.animation.activeClip = clipName; obj.sprite.animation.playing = true; } },
        setAnimState: function (stateName) {
          var stList = obj.animStateMachine && obj.animStateMachine.states ? obj.animStateMachine.states : [];
          var matched = stList.find(function (s) { return s.name === stateName || s.id === stateName; });
          var resolvedName = matched ? matched.name : stateName;
          obj.stateMachine = { currentState: resolvedName, states: stList.map(function (s) { return s.name; }) };
          if (obj.sprite) {
            if (!obj.sprite.animation) {
              obj.sprite.animation = { enabled: true, cols: (matched && matched.cols) || 4, rows: (matched && matched.rows) || 1, frameCount: (matched && matched.frameCount) || 4, fps: 8, loop: true, playing: true };
            }
            var a2 = obj.sprite.animation;
            a2.enabled = true;
            a2.playing = true;
            a2.activeClip = matched ? matched.clipName : stateName;
            if (matched) {
              a2.fsmActiveState = {
                stateName: matched.name,
                assetId: matched.assetId || obj.sprite.assetId,
                cols: matched.cols || a2.cols || 4,
                rows: matched.rows || a2.rows || 1,
                startFrame: matched.startFrame || 0,
                frameCount: matched.frameCount || a2.frameCount || 4,
                fps: Math.max(1, (a2.fps || 8) * Math.max(0.1, matched.timeScale || 1)),
                loop: matched.loopMode !== 'LoopOnce'
              };
            }
          }
        },
        playState: function (stateName) { this.setAnimState(stateName); },
        call: function (methodName) {
          var extraArgs = Array.prototype.slice.call(arguments, 1);
          var list = obj.scriptBindings || [];
          for (var i = 0; i < list.length; i++) {
            var b = list[i]; if (!b.enabled) continue;
            var e = compiledScripts2D.get(b.scriptId);
            if (e && e.hooks && typeof e.hooks[methodName] === 'function') {
              var mPrm = Object.assign({}, e.hooks.params || {}, b.params || {});
              var fnArgs = [makeScriptHandle2D(obj, sim, objMap, mPrm)].concat(extraArgs).concat([makeScriptApi2D(sim, objMap, 0)]);
              return e.hooks[methodName].apply(e.hooks, fnArgs);
            }
          }
          return undefined;
        },
        destroy: function () { obj.visible = false; }
      };
    }

    function makeSceneScriptHandle2D(sid, sim, objMap, params) {
      if (!sim.scriptObjectData) sim.scriptObjectData = new Map();
      var key = '__scene__:' + sim.scene.id + ':' + sid;
      var data = sim.scriptObjectData.get(key);
      if (!data) { data = {}; sim.scriptObjectData.set(key, data); }
      return {
        id: sim.scene.id, name: sim.scene.name, type: 'scene', tags: ['scene'],
        x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, rotation: 0, vx: 0, vy: 0, vz: 0,
        scaleX: 1, scaleY: 1, scaleZ: 1, opacity: 1, visible: true, isGrounded: false, speed: 0,
        data: data, params: params || {},
        hasTag: function (t) { return t === 'scene'; }, addTag: function () {}, removeTag: function () {},
        moveTowards: function () {}, applyImpulse: function () {}, setVelocity: function () {},
        playAnim: function () {}, setAnimState: function () {}, playState: function () {},
        call: function (methodName) {
          var extraArgs = Array.prototype.slice.call(arguments, 1);
          var e = compiledScripts2D.get(sid);
          if (e && e.hooks && typeof e.hooks[methodName] === 'function') {
            var fnArgs = [makeSceneScriptHandle2D(sid, sim, objMap, Object.assign({}, e.hooks.params || {}))].concat(extraArgs).concat([makeScriptApi2D(sim, objMap, 0)]);
            return e.hooks[methodName].apply(e.hooks, fnArgs);
          }
          return undefined;
        },
        destroy: function () {}
      };
    }

    function makeScriptApi2D(sim, objMap, dt) {
      var playSfx2D = function (id, v) {
        var vol = v !== undefined ? Number(v) : 0.85;
        if (rawAudioData && rawAudioData.has(id)) playAudioAsset(id, vol, 1, 'sfx', false);
        else playSynth(id || 'coin', vol, 1, 'sfx');
      };
      return {
        dt: dt,
        time: sim.elapsed,
        findByName: function (name) {
          var f = sim.scene.objects.find(function (o) { return o.visible && o.name === name; });
          return f ? makeScriptHandle2D(f, sim, objMap, {}) : null;
        },
        findById: function (id) {
          var f = objMap.get(id);
          return f && f.visible ? makeScriptHandle2D(f, sim, objMap, {}) : null;
        },
        findByTag: function (tag) {
          return sim.scene.objects.filter(function (o) { return o.visible && o.tags && o.tags.indexOf(tag) >= 0; }).map(function (o) { return makeScriptHandle2D(o, sim, objMap, {}); });
        },
        getAll: function () {
          return sim.scene.objects.filter(function (o) { return o.visible; }).map(function (o) { return makeScriptHandle2D(o, sim, objMap, {}); });
        },
        spawnPrefab: function (nameOrId, x, y) {
          var sx = x !== undefined ? x : stageW * 0.5, sy = y !== undefined ? y : stageH * 0.5;
          var pfFound = null;
          prefabMap.forEach(function (pf) { if (!pfFound && (pf.id === nameOrId || pf.name === nameOrId)) pfFound = pf; });
          if (pfFound && pfFound.objects && pfFound.objects.length > 0) {
            var rootOrig = pfFound.objects.find(function (o) { return o.id === pfFound.rootObjectId; }) || pfFound.objects[0];
            var bx = rootOrig ? rootOrig.transform.x : 0, by = rootOrig ? rootOrig.transform.y : 0;
            var spawnedFirst = null;
            pfFound.objects.forEach(function (orig, idx) {
              var copy = cloneData(orig);
              copy.id = 'inst_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '_' + idx;
              copy.parentId = null; copy.visible = true;
              copy.transform.x = sx + (orig.transform.x - bx); copy.transform.y = sy + (orig.transform.y - by);
              sim.scene.objects.push(copy); sim.bodies.set(copy.id, createBodyForObj(copy)); objMap.set(copy.id, copy);
              var dn = createDisplayForObject(copy, sim); sim.nodeMap.set(copy.id, dn); sceneRoot.addChild(dn);
              if (!spawnedFirst) spawnedFirst = copy;
            });
            return spawnedFirst ? makeScriptHandle2D(spawnedFirst, sim, objMap, {}) : null;
          }
          var tplO = sim.scene.objects.find(function (o) { return o.id === nameOrId || o.name === nameOrId; });
          if (tplO) {
            var cloned = cloneIntoScene(sim, objMap, tplO, sx, sy);
            return makeScriptHandle2D(cloned, sim, objMap, {});
          }
          return null;
        },
        destroyById: function (id) { var f = objMap.get(id); if (f) f.visible = false; },
        emitEvent: function (evn) { if (evn) sim.emittedEvents.push(evn); },
        log: function (m) { console.log('[NEXUS Script]', m); },
        vars: {
          get: function (n) { return sim.variables.get(n); },
          set: function (n, val) {
            sim.variables.set(n, val);
            if (sim.persistentVarNames.has(n)) writeStoredVar(n, val);
            if ((n === 'puntos' || n === 'score') && scoreSpan) scoreSpan.textContent = String(val);
          },
          add: function (n, d) {
            var nv = (Number(sim.variables.get(n) || 0) || 0) + Number(d || 0);
            sim.variables.set(n, nv);
            if (sim.persistentVarNames.has(n)) writeStoredVar(n, nv);
            if ((n === 'puntos' || n === 'score') && scoreSpan) scoreSpan.textContent = String(nv);
            return nv;
          }
        },
        audio: {
          play: playSfx2D,
          playSfx: playSfx2D,
          playMusic: function (id, vol) { playMusicAsset(id, vol !== undefined ? vol : 0.8, true, true); },
          stopMusic: function () { stopMusic(); },
          setBusVolume: function (bus, vol) { buses[bus] = Math.max(0, Math.min(1, Number(vol || 0.8))); syncBusGains(); },
          setBusMuted: function (bus, muted) { buses.muted = buses.muted || {}; buses.muted[bus] = Boolean(muted); syncBusGains(); }
        },
        particles: {
          burst: function (x, y, presetOrColor, countOrPreset, maybeCount) {
            var cnt = typeof countOrPreset === 'number' ? countOrPreset : (typeof maybeCount === 'number' ? maybeCount : 16);
            var rawSt = typeof presetOrColor === 'string' ? presetOrColor : (typeof countOrPreset === 'string' ? countOrPreset : '#fde047');
            var colHex = rawSt.indexOf('#') === 0 ? rawSt : '#fde047';
            sim.particles.push({ x: Number(x || 0), y: Number(y || 0), color: parseColor(colHex, 0xfde047), count: Math.max(4, Math.min(40, Number(cnt) || 14)), age: 0, duration: 0.45 });
          }
        },
        vfx: {
          emit: function (opts) {
            if (!opts) return;
            var tgt = typeof opts.target === 'string'
              ? sim.scene.objects.find(function (o) { return o.id === opts.target || o.name === opts.target; })
              : (opts.target && opts.target.id ? objMap.get(opts.target.id) : null);
            var x = opts.x !== undefined ? Number(opts.x) : (tgt ? tgt.transform.x : stageW * 0.5);
            var y = opts.y !== undefined ? Number(opts.y) : (tgt ? tgt.transform.y : stageH * 0.5);
            var presetId = opts.preset || 'sparks';
            var defs = getParticleDefaults(presetId);
            emitBurstFromConfig(sim, x, y, Object.assign({}, defs, { preset: presetId, colorStart: opts.color || defs.colorStart }), Math.max(4, Math.min(60, Number(opts.count !== undefined ? opts.count : 20))));
          },
          spawnBurst: function (x, y, zOrPreset, presetOrColor, count) {
            var rawSt = typeof zOrPreset === 'string' ? zOrPreset : (presetOrColor || 'sparks');
            var isHex = rawSt.indexOf('#') === 0;
            var presetId = !isHex ? rawSt : 'sparks';
            var defs = getParticleDefaults(presetId);
            emitBurstFromConfig(sim, Number(x || 0), Number(y || 0), Object.assign({}, defs, { preset: presetId, colorStart: isHex ? rawSt : defs.colorStart }), Math.max(4, Math.min(60, Number(count !== undefined ? count : 20))));
          }
        },
        tween: function (target, props, durationSec) {
          var tid = typeof target === 'string' ? target : (target && target.id);
          var twO = sim.scene.objects.find(function (o) { return o.id === tid || o.name === tid; });
          if (!twO || !props) return;
          var from = {}, to = {};
          Object.keys(props).forEach(function (k) {
            var v = props[k];
            if (typeof v !== 'number' || !isFinite(v)) return;
            to[k] = v;
            if (k === 'x') from[k] = twO.transform.x;
            else if (k === 'y') from[k] = twO.transform.y;
            else if (k === 'rotation' || k === 'rz') from[k] = twO.transform.rotation;
            else if (k === 'scaleX') from[k] = twO.transform.scaleX;
            else if (k === 'scaleY') from[k] = twO.transform.scaleY;
            else if (k === 'opacity') from[k] = twO.opacity;
          });
          if (!sim.scriptTweens) sim.scriptTweens = [];
          sim.scriptTweens.push({ targetId: twO.id, elapsed: 0, duration: Math.max(0.02, durationSec || 0.35), from: from, to: to });
        },
        camera: {
          shake: function (i, d) { sim.shakeIntensity = Math.max(sim.shakeIntensity, Number(i || 8)); sim.shakeRemaining = Math.max(sim.shakeRemaining, Number(d || 0.25)); },
          switchCamera: function (ref) {
            var f = sim.scene.objects.find(function (o) { return o.id === ref || o.name === ref; });
            if (f) { sim.scene.cameraConfig = sim.scene.cameraConfig || {}; sim.scene.cameraConfig.followObjectId = f.id; }
          },
          getForward: function () { return { x: 1, y: 0, z: 0 }; },
          getRight: function () { return { x: 1, y: 0, z: 0 }; },
          setPosition: function (x, y) {
            if (Number.isFinite(x)) sim.cameraPos.x = x;
            if (Number.isFinite(y)) sim.cameraPos.y = y;
          },
          lookAt: function (x, y) {
            if (Number.isFinite(x)) sim.cameraPos.x = x - stageW * 0.5;
            if (Number.isFinite(y)) sim.cameraPos.y = y - stageH * 0.5;
          },
          blendTo: function (opts) {
            if (!opts) return;
            if (opts.x !== undefined && Number.isFinite(opts.x)) sim.cameraPos.x = opts.x;
            if (opts.y !== undefined && Number.isFinite(opts.y)) sim.cameraPos.y = opts.y;
          }
        },
        scene: {
          load: function (ref) { var t = scenes.find(function (s) { return s.id === ref || s.name === ref; }); sim.pendingSceneCommand = { kind: 'load', sceneId: t ? t.id : String(ref), transition: 'fadeBlack' }; },
          restart: function () { sim.pendingSceneCommand = { kind: 'restart', transition: 'fadeBlack' }; },
          nextLevel: function () { sim.pendingSceneCommand = { kind: 'nextLevel', sceneId: sim.scene.nextSceneId, transition: 'fadeBlack' }; }
        },
        dialogue: {
          start: function (idOrName) { startDialogue2D(String(idOrName || '')); },
          close: function () { activeDialogue2D = null; renderDialogueOverlay2D(); },
          isOpen: function () { return Boolean(activeDialogue2D); }
        },
        data: {
          get: function (tableNameOrId, rowKeyOrIdx) { return queryDataTable2D(tableNameOrId, rowKeyOrIdx); },
          listTables: function () { return dataTables2D.map(function (t) { return t.name; }); }
        },
        i18n: {
          t: function (key) { return t2D(String(key || '')); },
          getLocale: function () { return activeLocale2D; },
          setLocale: function (loc) { if (loc === 'es' || loc === 'en' || loc === 'pt') { activeLocale2D = loc; syncWidgetsDom2D(sim); } }
        },
        ui: {
          open: function (t) { setWidgetDisplay(t, 'open'); },
          close: function (t) { setWidgetDisplay(t, 'close'); },
          toggle: function (t) { setWidgetDisplay(t, 'toggle'); },
          showToast: function (text, durationSec) {
            if (!sim.dynamicToasts) sim.dynamicToasts = [];
            var clean = String(text || '').trim();
            if (!clean) return;
            sim.dynamicToasts.push({ id: 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), text: clean, remaining: Math.max(0.4, Number(durationSec !== undefined ? durationSec : 2.5)) });
            if (sim.dynamicToasts.length > 5) sim.dynamicToasts.shift();
            syncWidgetsDom2D(sim);
          },
          createWidget: function (id, html, opts) {
            if (!sim.dynamicWidgets) sim.dynamicWidgets = [];
            var cid = String(id || '').trim();
            if (!cid) return;
            var idx = sim.dynamicWidgets.findIndex(function (w) { return w.id === cid; });
            var ent = { id: cid, html: String(html || ''), x: opts && opts.x !== undefined ? opts.x : 24, y: opts && opts.y !== undefined ? opts.y : 24, css: opts && opts.css, visible: true };
            if (idx >= 0) sim.dynamicWidgets[idx] = ent;
            else sim.dynamicWidgets.push(ent);
            syncWidgetsDom2D(sim);
          },
          updateWidget: function (id, patch) {
            if (!sim.dynamicWidgets || !patch) return;
            var w = sim.dynamicWidgets.find(function (item) { return item.id === id; });
            if (!w) return;
            if (patch.html !== undefined) w.html = patch.html;
            if (patch.text !== undefined) w.html = patch.text;
            if (patch.visible !== undefined) w.visible = Boolean(patch.visible);
            syncWidgetsDom2D(sim);
          },
          removeWidget: function (id) {
            if (!sim.dynamicWidgets) return;
            var idx = sim.dynamicWidgets.findIndex(function (item) { return item.id === id; });
            if (idx >= 0) { sim.dynamicWidgets.splice(idx, 1); syncWidgetsDom2D(sim); }
          },
          clearWidgets: function () {
            if (!sim.dynamicWidgets) return;
            sim.dynamicWidgets.length = 0;
            syncWidgetsDom2D(sim);
          }
        },
        spawn: {
          clone: function (nameOrId, x, y) {
            var tpl = sim.scene.objects.find(function (o) { return o.id === nameOrId || o.name === nameOrId; });
            if (tpl) {
              var sp = cloneIntoScene(sim, objMap, tpl, x !== undefined ? x : stageW * 0.5, y !== undefined ? y : stageH * 0.5);
              return makeScriptHandle2D(sp, sim, objMap, {});
            }
            return makeScriptApi2D(sim, objMap, dt).spawnPrefab(nameOrId, x, y);
          },
          primitive: function (shape, opts) {
            var o = opts || {};
            var id = 'prim2d_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            var size = Math.max(16, Number(o.sx !== undefined ? o.sx : 1) * 48);
            var hSize = Math.max(16, Number(o.sy !== undefined ? o.sy : 1) * 48);
            var pObj = {
              id: id,
              name: o.name || ('Forma_' + (sim.scene.objects.length + 1)),
              type: shape === 'sphere' ? 'circle' : 'rectangle',
              parentId: null, visible: true, locked: false, opacity: 1, layer: 'World', tags: ['spawned'],
              transform: { x: Number(o.x !== undefined ? o.x : stageW * 0.5), y: Number(o.y !== undefined ? o.y : stageH * 0.5), rotation: 0, scaleX: 1, scaleY: 1, width: size, height: hSize, anchorX: 0.5, anchorY: 0.5 },
              rectangle: shape !== 'sphere' ? { fillColor: o.color || '#38bdf8', strokeColor: '#ffffff', strokeWidth: 0, cornerRadius: 4 } : undefined,
              circle: shape === 'sphere' ? { fillColor: o.color || '#38bdf8', strokeColor: '#ffffff', strokeWidth: 0, radius: size * 0.5 } : undefined,
              components: o.physics === false ? [] : [{ id: id + '_c', type: o.dynamic ? 'rigidbody_box' : 'solid', enabled: true, config: {} }]
            };
            sim.scene.objects.push(pObj);
            objMap.set(id, pObj);
            sim.bodies.set(id, createBodyForObj(pObj));
            var dn = createDisplayForObject(pObj, sim);
            sim.nodeMap.set(id, dn);
            sceneRoot.addChild(dn);
            return makeScriptHandle2D(pObj, sim, objMap, {});
          }
        },
        world: {
          raycast: function (ox, oy, _oz, dx, dy, _dz, maxDist) {
            var md = maxDist !== undefined ? Number(maxDist) : 800;
            var dLen = Math.hypot(dx, dy) || 1;
            var ndx = dx / dLen, ndy = dy / dLen;
            var steps = 32;
            for (var s = 1; s <= steps; s++) {
              var dist = (md * s) / steps;
              var px = ox + ndx * dist, py = oy + ndy * dist;
              for (var ci = 0; ci < sim.scene.objects.length; ci++) {
                var cand = sim.scene.objects[ci];
                if (!cand.visible) continue;
                var cols = getWorldColliders(cand);
                if (cols.some(function (c) { return px >= c.left && px <= c.right && py >= c.top && py <= c.bottom; })) {
                  return { hit: true, objectId: cand.id, objectName: cand.name, distance: dist, x: px, y: py, z: 0 };
                }
              }
            }
            return { hit: false, distance: md, x: ox + ndx * md, y: oy + ndy * md, z: 0 };
          },
          getTerrainHeight: function () { return 0; }
        },
        lights: {
          setSun: function (opts) {
            if (!opts || !sim.scene.lighting) return;
            if (opts.intensity !== undefined) sim.scene.lighting.ambientIntensity = Number(opts.intensity);
            if (opts.color !== undefined) sim.scene.lighting.ambientColor = String(opts.color);
          },
          setLight: function (nameOrId, opts) {
            if (!opts) return;
            var lObj = sim.scene.objects.find(function (o) { return o.id === nameOrId || o.name === nameOrId; });
            if (!lObj || !lObj.light2d) return;
            if (opts.intensity !== undefined) lObj.light2d.intensity = Number(opts.intensity);
            if (opts.color !== undefined) lObj.light2d.color = String(opts.color);
            if (opts.distance !== undefined) lObj.light2d.radius = Number(opts.distance);
            if (opts.visible !== undefined) lObj.visible = Boolean(opts.visible);
          }
        },
        input: {
          isHeld: function (k) { return keyMatch(k, input); },
          justPressed: function (k) { return keyMatch(k, input) && !keyMatch(k, sim.prevInput); },
          getAxis: function () {
            var kx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
            var ky = (input.down ? 1 : 0) - (input.up ? 1 : 0);
            return { x: Math.abs(input.axisX || 0) > 0.05 ? input.axisX : kx, y: Math.abs(input.axisY || 0) > 0.05 ? input.axisY : ky };
          }
        },
        multiplayer: {
          isConnected: function () { return Boolean(sim.mpSocket && sim.mpSocket.readyState === 1); },
          getRemotePlayers: function () { return sim.mpRemotes ? Array.from(sim.mpRemotes.values()) : []; },
          broadcast: function (evName, payload) {
            if (sim.mpSocket && sim.mpSocket.readyState === 1) {
              try { sim.mpSocket.send(JSON.stringify({ type: 'custom_event', roomId: sim.mpRoomId || 'sala_global', playerId: sim.mpPlayerId, event: String(evName || ''), data: payload || {} })); } catch (_) {}
            }
          }
        }
      };
    }

    function scopeCss2D(rawCss, scopeAttr) {
      if (!rawCss || !rawCss.trim()) return '';
      var prefix = '[data-nx-widget="' + scopeAttr + '"]';
      return rawCss.replace(/(^|\\})\\s*([^{}@]+)\\{/g, function (_, brace, sel) {
        var tr = sel.trim();
        if (!tr) return brace + ' {';
        if (/^(from|to|\\d+%)$/.test(tr)) return brace + '\\n' + tr + ' {';
        var pts = tr.split(',').map(function (s) {
          var p = s.trim();
          if (!p) return '';
          if (p === ':host' || p === ':root' || p === 'body') return prefix;
          return p.indexOf(prefix) >= 0 ? p : prefix + ' ' + p;
        }).filter(Boolean).join(', ');
        return brace + '\\n' + pts + ' {';
      });
    }

    function applyRepeatsAndI18n2D(container) {
      if (!container) return;
      container.querySelectorAll('[data-nexus-i18n]').forEach(function (el) {
        var k = el.getAttribute('data-nexus-i18n');
        if (k) el.textContent = t2D(k);
      });
      container.querySelectorAll('[data-nexus-repeat]').forEach(function (el) {
        var tRef = el.getAttribute('data-nexus-repeat');
        var rows = queryDataTable2D(tRef);
        if (!Array.isArray(rows)) return;
        if (!el.__nxTplHtml) {
          var rowEl = el.querySelector('[data-nexus-row]') || el.firstElementChild;
          el.__nxTplHtml = rowEl ? rowEl.outerHTML : '<div>{{name}}</div>';
        }
        var sig = activeLocale2D + ':' + JSON.stringify(rows);
        if (el.__nxLastSig === sig) return;
        el.__nxLastSig = sig;
        el.innerHTML = rows.map(function (r) {
          return el.__nxTplHtml.replace(/@t\\(([^)]+)\\)/g, function (_m, k) { return t2D(String(k).trim()); })
            .replace(/\\{\\{([a-zA-Z0-9_.-]+)\\}\\}/g, function (_m, c) { return r[c] !== undefined && r[c] !== null ? String(r[c]) : ''; });
        }).join('');
      });
    }

    function syncWidgetsDom2D(sim) {
      if (!sim) return;
      applyRepeatsAndI18n2D(widgetsHost2D);
      applyRepeatsAndI18n2D(dynWidgetsHost2D);
      widgetsHost2D.querySelectorAll('[data-nexus-var], [data-nexus-progress]').forEach(function (el) {
        var vn = el.getAttribute('data-nexus-var');
        if (vn && sim.variables.has(vn)) el.textContent = String(sim.variables.get(vn));
        var pg = el.getAttribute('data-nexus-progress');
        if (pg) {
          var ps = pg.split('/');
          var v = Number(sim.variables.get(ps[0]) || 0);
          var m = Math.max(1, Number(ps[1] || 100));
          el.style.width = Math.max(0, Math.min(100, (v / m) * 100)) + '%';
        }
      });
      var dynArr = sim.dynamicWidgets || [];
      var dynKey = dynArr.map(function (w) { return w.id + '|' + w.visible + '|' + w.x + '|' + w.y + '|' + w.html; }).join(';;');
      if (dynWidgetsHost2D.__lastKey !== dynKey) {
        dynWidgetsHost2D.__lastKey = dynKey;
        dynWidgetsHost2D.innerHTML = '';
        var dynCss = '';
        dynArr.forEach(function (dw) {
          if (!dw.visible) return;
          if (dw.css) dynCss += scopeCss2D(dw.css, dw.id) + '\\n';
          var dEl = document.createElement('div');
          dEl.setAttribute('data-nx-widget', dw.id);
          dEl.style.cssText = 'position:absolute;left:' + (dw.x || 24) + 'px;top:' + (dw.y || 24) + 'px;pointer-events:auto;z-index:35;';
          dEl.innerHTML = String(dw.html || '').replace(/@t\\(([^)]+)\\)/g, function (_m, k) { return t2D(String(k).trim()); });
          dynWidgetsHost2D.appendChild(dEl);
        });
        var dynStyle = document.getElementById('nx-dyn-widgets-style-2d');
        if (dynCss) {
          if (!dynStyle) {
            dynStyle = document.createElement('style');
            dynStyle.id = 'nx-dyn-widgets-style-2d';
            document.head.appendChild(dynStyle);
          }
          dynStyle.textContent = dynCss;
        } else if (dynStyle) {
          dynStyle.textContent = '';
        }
      }
      var toasts = sim.dynamicToasts || [];
      var tKey = toasts.map(function (t) { return t.id + ':' + t.text; }).join('|');
      if (toastHost2D.__lastKey !== tKey) {
        toastHost2D.__lastKey = tKey;
        toastHost2D.innerHTML = '';
        toasts.forEach(function (t) {
          var badge = document.createElement('div');
          badge.style.cssText = 'background:rgba(15,23,42,0.92);color:#f8fafc;border:1px solid rgba(56,189,248,0.45);border-radius:10px;padding:7px 14px;font:600 13px/1.3 sans-serif;box-shadow:0 6px 20px rgba(0,0,0,0.45);';
          badge.textContent = t.text;
          toastHost2D.appendChild(badge);
        });
      }
    }

    function mountWidgetsForSim(sim) {
      widgetsHost2D.innerHTML = '';
      dynWidgetsHost2D.innerHTML = '';
      dynWidgetsHost2D.__lastKey = '';
      toastHost2D.innerHTML = '';
      toastHost2D.__lastKey = '';
      var oldStyle = document.getElementById('nx-widgets-style-2d');
      if (oldStyle) oldStyle.remove();
      var st = document.createElement('style');
      st.id = 'nx-widgets-style-2d';
      var cssTxt = '';
      (sim.scene.objects || []).forEach(function (o) {
        if (o.type !== 'ui_widget' || !o.uiWidget) return;
        var w = o.uiWidget;
        cssTxt += scopeCss2D(w.css || '', o.id) + '\\n';
        var el = document.createElement('div');
        el.setAttribute('data-nx-widget', o.id);
        el.style.cssText = 'position:absolute;left:' + o.transform.x + 'px;top:' + o.transform.y + 'px;width:' + o.transform.width + 'px;height:' + o.transform.height + 'px;pointer-events:' + (w.interactive !== false ? 'auto' : 'none') + ';z-index:' + (w.zIndex || 25) + ';display:' + (o.visible && w.visibleAtStart !== false ? 'block' : 'none') + ';';
        el.innerHTML = String(w.html || '').replace(/@t\\(([^)]+)\\)/g, function (_m, k) { return t2D(String(k).trim()); });
        el.addEventListener('click', function (ev) {
          var tgt = ev.target && ev.target.closest ? ev.target.closest('[data-nexus-action]') : null;
          if (!tgt) return;
          var act = tgt.getAttribute('data-nexus-action') || '';
          var prm = tgt.getAttribute('data-nexus-param') || '';
          var val = tgt.getAttribute('data-nexus-value') || '';
          if (act === 'pause.toggle') setPaused(!paused);
          else if (act === 'ui.closeSelf') el.style.display = 'none';
          else if (act === 'scene.restart') loadSceneById(sim.scene.id, 'none');
          else if (act === 'scene.load') loadSceneById(prm, 'fadeBlack');
          else if (act === 'audio.play') playSynth(prm || 'coin', Number(val || 0.8), 1, 'ui');
          else if (act === 'var.add') sim.variables.set(prm, Number(sim.variables.get(prm) || 0) + Number(val || 1));
          else if (act === 'var.set') sim.variables.set(prm, isNaN(Number(val)) ? val : Number(val));
          else if (act === 'event.emit') sim.emittedEvents.push(prm);
          else if (act === 'dialogue.start') startDialogue2D(prm);
        });
        widgetsHost2D.appendChild(el);
      });
      st.textContent = cssTxt;
      document.head.appendChild(st);
      syncWidgetsDom2D(sim);
    }

    function setWidgetDisplay(targetIdOrName, op) {
      var targetEl = widgetsHost2D.querySelector('[data-nx-widget="' + targetIdOrName + '"]') || dynWidgetsHost2D.querySelector('[data-nx-widget="' + targetIdOrName + '"]');
      if (!targetEl && activeSim) {
        var found = activeSim.scene.objects.find(function (o) { return o.type === 'ui_widget' && o.name === targetIdOrName; });
        if (found) targetEl = widgetsHost2D.querySelector('[data-nx-widget="' + found.id + '"]');
      }
      if (!targetEl) return;
      if (op === 'open') targetEl.style.display = 'block';
      else if (op === 'close') targetEl.style.display = 'none';
      else targetEl.style.display = targetEl.style.display === 'none' ? 'block' : 'none';
    }

    function connectMultiplayer2D(sim) {
      if (!sim || !sim.scene || !sim.scene.multiplayer || !sim.scene.multiplayer.enabled) return;
      if (typeof WebSocket === 'undefined' || typeof location === 'undefined') return;
      var mp = sim.scene.multiplayer;
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = mp.serverUrl || (proto + '//' + location.host + '/ws/multiplayer');
      try {
        var ws = new WebSocket(wsUrl);
        sim.mpSocket = ws;
        ws.addEventListener('open', function () {
          try {
            ws.send(JSON.stringify({
              type: 'join',
              roomId: sim.mpRoomId || 'sala_global',
              playerId: sim.mpPlayerId,
              name: sim.mpPlayerId,
              mode: '2d',
              sceneId: sim.scene.id,
              maxPlayers: mp.maxPlayers || 16
            }));
          } catch (_) {}
        });
        ws.addEventListener('message', function (ev) {
          try {
            var msg = JSON.parse(String(ev.data));
            if (msg.type === 'room_snapshot' && msg.snapshot) {
              sim.mpRoomId = msg.snapshot.roomId || sim.mpRoomId;
              sim.mpRemotes.clear();
              (msg.snapshot.players || []).forEach(function (pl) {
                if (pl && pl.playerId !== sim.mpPlayerId) sim.mpRemotes.set(pl.playerId, pl);
              });
            } else if ((msg.type === 'player_joined' || msg.type === 'player_state') && msg.player) {
              if (msg.player.playerId !== sim.mpPlayerId) sim.mpRemotes.set(msg.player.playerId, msg.player);
            } else if (msg.type === 'player_left' && msg.playerId) {
              sim.mpRemotes.delete(String(msg.playerId));
            }
          } catch (_) {}
        });
      } catch (_) {}
    }

    function loadSceneById(sceneId, transition) {
      var target = scenes.find(function (s) { return s.id === sceneId; });
      if (!target) return false;
      if (activeSim) {
        syncPersistentFrom(activeSim);
        if (activeSim.mpSocket) { try { activeSim.mpSocket.close(); } catch (_) {} activeSim.mpSocket = null; }
      }
      sceneStack = [];
      activeSim = buildSimState(target);
      if (app.renderer) {
        app.renderer.resolution = Math.min(window.devicePixelRatio || 1, getMaxDpr2D(activeSim.scene));
        resizeWorld();
      }
      mountActiveScene(activeSim);
      mountWidgetsForSim(activeSim);
      queueSceneMusic(activeSim, false);
      connectMultiplayer2D(activeSim);
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

    // Entradas universales (KeyboardEvent.code), Joystick Analógico 360°, Gamepad y Puntero
    var pressedKeys = new Set();
    var justPressedKeys2d = new Set();
    var swipeStart = null;
    var touchCfg = gameData.settings && gameData.settings.touchControls ? gameData.settings.touchControls : {};
    var touchOverlayEl = document.getElementById('nx-touch-controls');
    if (touchOverlayEl && (touchCfg.enabledByDefault || ${JSON.stringify(Boolean(options.touchControls))})) {
      touchOverlayEl.classList.remove('hidden');
      touchOverlayEl.style.opacity = String(Math.max(0.25, Math.min(1, touchCfg.opacity || 0.85)));
    }
    var touchAxis = { x: 0, y: 0 };
    var touchBtns = { jump: false, action: false, dash: false };
    var input = {
      left: false, right: false, up: false, down: false, jump: false, action1: false, action2: false,
      axisX: 0, axisY: 0,
      pointerX: undefined, pointerY: undefined, pointerDown: false, pointerJustPressed: false, pointerJustReleased: false, swipeDir: null, pressedKeys: []
    };
    function pollGamepadState() {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
      var pads = navigator.getGamepads();
      if (!pads) return null;
      for (var i = 0; i < pads.length; i++) {
        var pd = pads[i];
        if (!pd || !pd.connected) continue;
        var rx = pd.axes[0] || 0;
        var ry = pd.axes[1] || 0;
        var dl = pd.buttons[14] && pd.buttons[14].pressed ? -1 : 0;
        var dr = pd.buttons[15] && pd.buttons[15].pressed ? 1 : 0;
        var du = pd.buttons[12] && pd.buttons[12].pressed ? -1 : 0;
        var dd = pd.buttons[13] && pd.buttons[13].pressed ? 1 : 0;
        var v = computeJoystickVector(Math.abs(rx) > 0.18 ? rx : dl + dr, Math.abs(ry) > 0.18 ? ry : du + dd, 1, 0.18);
        return {
          x: v.x, y: v.y,
          jump: Boolean(pd.buttons[0] && pd.buttons[0].pressed),
          action: Boolean((pd.buttons[2] && pd.buttons[2].pressed) || (pd.buttons[1] && pd.buttons[1].pressed)),
          dash: Boolean((pd.buttons[3] && pd.buttons[3].pressed) || (pd.buttons[5] && pd.buttons[5].pressed) || (pd.buttons[7] && pd.buttons[7].pressed))
        };
      }
      return null;
    }
    function syncLegacyKeys() {
      var gp = pollGamepadState();
      var kX = (pressedKeys.has('ArrowRight') || pressedKeys.has('KeyD') ? 1 : 0) - (pressedKeys.has('ArrowLeft') || pressedKeys.has('KeyA') ? 1 : 0);
      var kY = (pressedKeys.has('ArrowDown') || pressedKeys.has('KeyS') ? 1 : 0) - (pressedKeys.has('ArrowUp') || pressedKeys.has('KeyW') ? 1 : 0);
      var ax = kX !== 0 ? kX : (Math.abs(touchAxis.x) > 0.05 ? touchAxis.x : (gp ? gp.x : 0));
      var ay = kY !== 0 ? kY : (Math.abs(touchAxis.y) > 0.05 ? touchAxis.y : (gp ? gp.y : 0));
      input.axisX = ax;
      input.axisY = ay;
      input.left = pressedKeys.has('ArrowLeft') || pressedKeys.has('KeyA') || ax < -0.22;
      input.right = pressedKeys.has('ArrowRight') || pressedKeys.has('KeyD') || ax > 0.22;
      input.up = pressedKeys.has('ArrowUp') || pressedKeys.has('KeyW') || ay < -0.22;
      input.down = pressedKeys.has('ArrowDown') || pressedKeys.has('KeyS') || ay > 0.22;
      input.jump = pressedKeys.has('Space') || touchBtns.jump || Boolean(gp && gp.jump);
      input.action1 = pressedKeys.has('KeyE') || pressedKeys.has('KeyJ') || pressedKeys.has('KeyZ') || touchBtns.action || Boolean(gp && gp.action);
      input.action2 = pressedKeys.has('KeyK') || pressedKeys.has('KeyX') || pressedKeys.has('ShiftLeft') || touchBtns.dash || Boolean(gp && gp.dash);
      input.pressedKeys = Array.from(pressedKeys);
    }
    function clearAllInput() {
      pressedKeys.clear();
      touchAxis.x = 0; touchAxis.y = 0;
      touchBtns.jump = false; touchBtns.action = false; touchBtns.dash = false;
      syncLegacyKeys();
      input.pointerDown = false;
    }
    window.addEventListener('keydown', function (e) {
      ensureAudio();
      var code = e.code || e.key;
      if (code) {
        if (!pressedKeys.has(code)) justPressedKeys2d.add(code);
        pressedKeys.add(code);
      }
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
        var hasScriptClick = !uiOnly && o.scriptBindings && o.scriptBindings.some(function (b) { var ce = b.enabled && compiledScripts2D.get(b.scriptId); return ce && ce.hooks && typeof ce.hooks.onClick === 'function'; });
        if (o.type !== 'ui_button' && !hasClickTrigger && !hasScriptClick) continue;
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

    var joyZone = document.getElementById('nx-joystick-zone');
    var joyRing = document.getElementById('nx-joystick-ring');
    var joyKnob = document.getElementById('nx-joystick-knob');
    var joyPid = null;
    var joyOrig = { x: 0, y: 0 };
    var joySize = Math.max(84, Math.min(180, touchCfg.joystickSize || 112));
    var joyMaxTravel = Math.round(joySize * 0.38);
    if (joyRing && joyKnob) {
      joyRing.style.width = joySize + 'px';
      joyRing.style.height = joySize + 'px';
      joyKnob.style.width = Math.round(joySize * 0.44) + 'px';
      joyKnob.style.height = Math.round(joySize * 0.44) + 'px';
    }
    if (joyZone && joyRing && joyKnob) {
      joyZone.addEventListener('pointerdown', function (e) {
        if (joyPid !== null) return;
        ensureAudio();
        e.stopPropagation();
        try { joyZone.setPointerCapture(e.pointerId); } catch (_) {}
        joyPid = e.pointerId;
        if (touchCfg.mode === 'floating') {
          var zr = joyZone.getBoundingClientRect();
          var lx = Math.max(8, Math.min(zr.width - joySize - 8, e.clientX - zr.left - joySize * 0.5));
          var ly = Math.max(8, Math.min(zr.height - joySize - 8, e.clientY - zr.top - joySize * 0.5));
          joyRing.style.left = lx + 'px'; joyRing.style.top = ly + 'px'; joyRing.style.bottom = 'auto';
          joyOrig = { x: e.clientX, y: e.clientY };
        } else {
          var rr = joyRing.getBoundingClientRect();
          joyOrig = { x: rr.left + rr.width * 0.5, y: rr.top + rr.height * 0.5 };
        }
        var dx0 = e.clientX - joyOrig.x; var dy0 = e.clientY - joyOrig.y;
        var d0 = Math.hypot(dx0, dy0); var c0 = Math.min(joyMaxTravel, d0);
        joyKnob.style.transform = 'translate3d(' + (d0 > 0.01 ? (dx0 / d0) * c0 : 0).toFixed(1) + 'px,' + (d0 > 0.01 ? (dy0 / d0) * c0 : 0).toFixed(1) + 'px,0)';
        var v0 = computeJoystickVector(dx0, dy0, joyMaxTravel, touchCfg.deadzone);
        touchAxis.x = v0.x; touchAxis.y = v0.y;
        syncLegacyKeys();
      });
      joyZone.addEventListener('pointermove', function (e) {
        if (joyPid !== e.pointerId) return;
        e.stopPropagation();
        var dx1 = e.clientX - joyOrig.x; var dy1 = e.clientY - joyOrig.y;
        var d1 = Math.hypot(dx1, dy1); var c1 = Math.min(joyMaxTravel, d1);
        joyKnob.style.transform = 'translate3d(' + (d1 > 0.01 ? (dx1 / d1) * c1 : 0).toFixed(1) + 'px,' + (d1 > 0.01 ? (dy1 / d1) * c1 : 0).toFixed(1) + 'px,0)';
        var v1 = computeJoystickVector(dx1, dy1, joyMaxTravel, touchCfg.deadzone);
        touchAxis.x = v1.x; touchAxis.y = v1.y;
        syncLegacyKeys();
      });
      function resetTouchStick(e) {
        if (joyPid !== e.pointerId) return;
        joyPid = null;
        joyKnob.style.transform = 'translate3d(0px,0px,0)';
        if (touchCfg.mode === 'floating') {
          joyRing.style.left = '22px'; joyRing.style.bottom = '22px'; joyRing.style.top = 'auto';
        }
        touchAxis.x = 0; touchAxis.y = 0;
        syncLegacyKeys();
      }
      joyZone.addEventListener('pointerup', resetTouchStick);
      joyZone.addEventListener('pointercancel', resetTouchStick);
    }
    document.querySelectorAll('[data-btn]').forEach(function (btn) {
      var bName = btn.getAttribute('data-btn');
      btn.addEventListener('pointerdown', function (e) {
        ensureAudio(); e.stopPropagation();
        touchBtns[bName] = true; syncLegacyKeys();
      });
      function upBtn(e) { e.stopPropagation(); touchBtns[bName] = false; syncLegacyKeys(); }
      btn.addEventListener('pointerup', upBtn);
      btn.addEventListener('pointercancel', upBtn);
      btn.addEventListener('pointerleave', upBtn);
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

    function collectSolids(sim, damageZones) {
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
            var tileIdx = Number(tm.cells[key]);
            var tMeta = tm.tileTypes && tm.tileTypes[String(tileIdx)] ? tm.tileTypes[String(tileIdx)] : { collision: 'solid' };
            var cKind = tMeta.collision || 'solid';
            if (cKind === 'none') return;
            var p = key.split(',');
            var l = ox + Number(p[0]) * tw;
            var t = oy + Number(p[1]) * th;
            if (cKind === 'damage') {
              if (damageZones) damageZones.push({ left: l, right: l + tw, top: t, bottom: t + th, dps: Math.max(1, Number(tMeta.damagePerSec !== undefined ? tMeta.damagePerSec : 15)) });
              return;
            }
            boxes.push({ left: l, right: l + tw, top: t, bottom: t + th, layer: obj.layer || 'Ground', mask: undefined, oneWay: cKind === 'one_way' });
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
          if (s.oneWay) continue;
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
            if (s.oneWay) {
              var prevBot = c.bottom - body.vy * FIXED_DT;
              if (body.vy >= 0 && prevBot <= s.top + 8) {
                obj.transform.y -= c.bottom - s.top; body.vy = 0; body.grounded = true;
              }
              continue;
            }
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
      if (sim.emitterParticles.length >= 480) return;
      var angB = ((cfg.angleDeg || 0) * Math.PI) / 180;
      var sprR = ((cfg.spreadDeg || 360) * Math.PI) / 180;
      var sMin = Math.min(cfg.speedMin || 40, cfg.speedMax || 120);
      var sMax = Math.max(cfg.speedMin || 40, cfg.speedMax || 120);
      var ox = x + (cfg.offsetX || 0);
      var oy = y + (cfg.offsetY || 0);
      var eShape = cfg.emitterShape || 'point';
      var eRad = Math.max(0, cfg.emitterRadius !== undefined ? cfg.emitterRadius : 18);
      var pShape = cfg.particleShape || ((cfg.preset === 'liquid' || cfg.preset === 'waterfall') ? 'liquid' : (cfg.preset === 'ripple' ? 'ring' : 'circle'));
      for (var i = 0; i < count; i++) {
        var a = angB + (Math.random() - 0.5) * sprR;
        var s = sMin + Math.random() * (sMax - sMin);
        var sxO = 0, syO = 0;
        if (eShape === 'ring') {
          var ra = Math.random() * Math.PI * 2;
          sxO = Math.cos(ra) * eRad; syO = Math.sin(ra) * eRad;
        } else if (eShape === 'sphere') {
          var sa = Math.random() * Math.PI * 2;
          var sr = Math.sqrt(Math.random()) * eRad;
          sxO = Math.cos(sa) * sr; syO = Math.sin(sa) * sr;
        } else if (eShape === 'box') {
          sxO = (Math.random() - 0.5) * eRad * 2;
          syO = (Math.random() - 0.5) * eRad * 2;
        }
        sim.emitterParticles.push({
          x: ox + sxO, y: oy + syO, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gravity: cfg.gravity || 0,
          drag: Math.max(0, cfg.drag || 0),
          turbulence: Math.max(0, cfg.turbulence || 0),
          particleShape: pShape,
          sizeCurve: cfg.sizeCurve,
          alphaCurve: cfg.alphaCurve,
          speedCurve: cfg.speedCurve,
          sizeStart: cfg.sizeStart || 5, sizeEnd: cfg.sizeEnd !== undefined ? cfg.sizeEnd : 1,
          colorStart: cfg.colorStart || '#fde047', colorEnd: cfg.colorEnd || '#ef4444',
          alpha: cfg.alphaStart !== undefined ? cfg.alphaStart : (cfg.blendAlpha !== undefined ? cfg.blendAlpha : 0.9),
          alphaEnd: cfg.alphaEnd !== undefined ? cfg.alphaEnd : 0,
          additive: Boolean(cfg.additive),
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

    function hasAiLos2D(ax, ay, bx, by, solids) {
      var d = Math.hypot(bx - ax, by - ay);
      var steps = Math.max(2, Math.ceil(d / 16));
      for (var s = 1; s < steps; s++) {
        var t = s / steps;
        var px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        for (var j = 0; j < solids.length; j++) {
          var sc = solids[j];
          if (!sc.isSensor && px >= sc.left && px <= sc.right && py >= sc.top && py <= sc.bottom) return false;
        }
      }
      return true;
    }

    function resolveActionTarget2D(ref, objMap, ctx) {
      if (!ref) return undefined;
      var s = String(ref).trim();
      if (!s) return undefined;
      if (s === '$self' || s === 'self') return ctx && ctx.owner ? ctx.owner : undefined;
      if (s === '$other' || s === 'other') return ctx && ctx.other ? ctx.other : undefined;
      var direct = objMap.get(s);
      if (direct) return direct;
      var found;
      objMap.forEach(function (o) { if (!found && o.name === s) found = o; });
      return found;
    }

    function runActionList(actions, mechId, sim, objMap, ctx) {
      for (var i = 0; i < actions.length; i++) {
        var act = actions[i];
        var p = act.parameters || {};
        if (act.type === 'wait') {
          var rem = actions.slice(i + 1);
          if (rem.length > 0) sim.pendingWaits.push({ remainingSec: Math.max(0.01, Number(p.seconds || p.duration || 0.5)), actions: rem, mechId: mechId, ctx: ctx });
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
          var to = resolveActionTarget2D(p.target, objMap, ctx);
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
          var ts = resolveActionTarget2D(p.target, objMap, ctx); if (ts) ts.visible = true;
        } else if (act.type === 'object.move') {
          var tm = resolveActionTarget2D(p.target, objMap, ctx); if (tm) { tm.transform.x += Number(p.dx || 0); tm.transform.y += Number(p.dy || 0); }
        } else if (act.type === 'object.teleport') {
          var tt = resolveActionTarget2D(p.target, objMap, ctx);
          if (tt) {
            if (p.toCheckpoint && sim.checkpoint) { tt.transform.x = sim.checkpoint.x; tt.transform.y = sim.checkpoint.y; }
            else { if (p.x !== undefined) tt.transform.x = Number(p.x); if (p.y !== undefined) tt.transform.y = Number(p.y); }
            var tb = sim.bodies.get(tt.id); if (tb) { tb.vx = 0; tb.vy = 0; }
          }
        } else if (act.type === 'object.spawn') {
          var tplO = resolveActionTarget2D(p.target, objMap, ctx);
          if (tplO) {
            var ancS = p.atObjectId ? resolveActionTarget2D(p.atObjectId, objMap, ctx) : null;
            cloneIntoScene(sim, objMap, tplO, ancS ? ancS.transform.x + Number(p.offsetX || 0) : Number(p.x !== undefined ? p.x : tplO.transform.x), ancS ? ancS.transform.y + Number(p.offsetY || 0) : Number(p.y !== undefined ? p.y : tplO.transform.y));
          }
        } else if (act.type === 'object.setProperty') {
          var spO = resolveActionTarget2D(p.target, objMap, ctx);
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
          var rtO = resolveActionTarget2D(p.target, objMap, ctx); var lkO = resolveActionTarget2D(p.lookAtTarget, objMap, ctx);
          if (rtO && lkO) rtO.transform.rotation = (Math.atan2(lkO.transform.y - rtO.transform.y, lkO.transform.x - rtO.transform.x) * 180) / Math.PI;
        } else if (act.type === 'object.flash') {
          var flO = resolveActionTarget2D(p.target, objMap, ctx); var flC = String(p.color || '#ffffff'); var flD = Math.max(0.05, Number(p.duration || 0.18));
          if (flO) sim.flashTimers.set(flO.id, { color: flC, remaining: flD });
          else sim.screenFlash = { color: flC, alpha: 0.7, duration: flD, age: 0 };
        } else if (act.type === 'component.toggle') {
          var ctO = resolveActionTarget2D(p.target, objMap, ctx);
          if (ctO && p.componentType) (ctO.components || []).forEach(function (c) { if (c.type === p.componentType) c.enabled = p.enabled === 'toggle' ? !c.enabled : Boolean(p.enabled !== false); });
        } else if (act.type === 'physics.impulse') {
          var io = resolveActionTarget2D(p.target, objMap, ctx);
          var ib = io ? sim.bodies.get(io.id) : null; if (ib) { ib.vx += Number(p.ix || 0); ib.vy += Number(p.iy || 0); }
        } else if (act.type === 'physics.force') {
          var fo2 = resolveActionTarget2D(p.target, objMap, ctx);
          var fb = fo2 ? sim.bodies.get(fo2.id) : null; if (fb) { fb.ax += Number(p.fx || 0); fb.ay += Number(p.fy || 0); }
        } else if (act.type === 'physics.setVelocity') {
          var vo = resolveActionTarget2D(p.target, objMap, ctx);
          var vb = vo ? sim.bodies.get(vo.id) : null;
          if (vb) { if (p.vx !== undefined && p.vx !== '') vb.vx = Number(p.vx); if (p.vy !== undefined && p.vy !== '') vb.vy = Number(p.vy); }
        } else if (act.type === 'health.damage') {
          var ho = resolveActionTarget2D(p.target, objMap, ctx);
          if (ho) applyDamage(sim, ho, Math.max(0, Number(p.amount || 10)), Number(p.invulnerability !== undefined ? p.invulnerability : 0.35));
        } else if (act.type === 'health.heal') {
          var hho = resolveActionTarget2D(p.target, objMap, ctx);
          var hbo = hho ? sim.bodies.get(hho.id) : null;
          if (hbo) { hbo.health = Math.min(hbo.maxHealth, hbo.health + Math.max(0, Number(p.amount || 20))); sim.variables.set('salud', hbo.health); }
        } else if (act.type === 'animation.play') {
          var anO = resolveActionTarget2D(p.target, objMap, ctx);
          if (anO && anO.sprite && anO.sprite.animation) {
            anO.sprite.animation.enabled = true; anO.sprite.animation.playing = true;
            if (p.clip) anO.sprite.animation.activeClip = String(p.clip);
          }
        } else if (act.type === 'tween.play') {
          var twO = resolveActionTarget2D(p.target, objMap, ctx); var tName = String(p.trackName || '').trim();
          if (twO && twO.tweens) {
            twO.tweens.forEach(function (tr) {
              if (!tName || tr.name === tName || tr.id === tName) sim.tweenStates.set(twO.id + ':' + tr.id, { elapsed: 0, playing: true });
            });
          }
        } else if (act.type === 'state.set') {
          var stObj = resolveActionTarget2D(p.target, objMap, ctx);
          if (stObj) stObj.stateMachine = { currentState: String(p.state || 'idle'), states: (stObj.stateMachine && stObj.stateMachine.states) || [] };
        } else if (act.type === 'checkpoint.save') {
          var cpo = resolveActionTarget2D(p.target, objMap, ctx); if (cpo) sim.checkpoint = { x: cpo.transform.x, y: cpo.transform.y };
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
          var anc = p.atObjectId ? resolveActionTarget2D(p.atObjectId, objMap, ctx) : null;
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
          var ptObj = resolveActionTarget2D(p.target, objMap, ctx);
          sim.particles.push({ x: ptObj ? ptObj.transform.x : stageW / 2, y: ptObj ? ptObj.transform.y : stageH / 2, color: parseColor(p.color, 0x34d399), count: Math.min(24, Number(p.count || 12)), age: 0, duration: 0.45 });
        } else if (act.type === 'particles.emit') {
          var peObj = resolveActionTarget2D(p.target, objMap, ctx);
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
        } else if (act.type === 'ui.openInterface' && p.target) {
          setWidgetDisplay(String(p.target), 'open');
        } else if (act.type === 'ui.closeInterface' && p.target) {
          setWidgetDisplay(String(p.target), 'close');
        } else if (act.type === 'ui.toggleInterface' && p.target) {
          setWidgetDisplay(String(p.target), 'toggle');
        } else if (act.type === 'dialogue.start') {
          startDialogue2D(String(p.dialogueId || p.target || ''));
        } else if (act.type === 'script.call' && p.methodName) {
          var mName = String(p.methodName).trim();
          var argArr = p.arg !== undefined && p.arg !== '' ? [p.arg] : null;
          var targetO = p.target ? resolveActionTarget2D(String(p.target), objMap, ctx) : null;
          if (targetO) {
            try {
              var th = makeScriptHandle2D(targetO, sim, objMap, {});
              if (argArr) th.call(mName, argArr[0]);
              else th.call(mName);
            } catch (err) { console.warn('[NEXUS script.call]', err); }
          } else if (p.scriptId) {
            var scE = compiledScripts2D.get(String(p.scriptId));
            if (scE && scE.hooks && typeof scE.hooks[mName] === 'function') {
              var mFn = scE.hooks[mName];
              var apiCall = makeScriptApi2D(sim, objMap, 0);
              var calledObj = false;
              sim.scene.objects.forEach(function (so) {
                var sb = (so.scriptBindings || []).find(function (b) { return b.enabled && b.scriptId === String(p.scriptId); });
                if (sb) {
                  calledObj = true;
                  var sh = makeScriptHandle2D(so, sim, objMap, Object.assign({}, scE.hooks.params || {}, sb.params || {}));
                  var fArgs = argArr ? [sh, argArr[0], apiCall] : (mFn.length >= 3 ? [sh, undefined, apiCall] : [sh, apiCall]);
                  try { mFn.apply(scE.hooks, fArgs); } catch (err) { console.warn('[NEXUS script.call]', scE.name, err); }
                }
              });
              if (!calledObj) {
                var scH = makeSceneScriptHandle2D(String(p.scriptId), sim, objMap, Object.assign({}, scE.hooks.params || {}));
                var sArgs = argArr ? [scH, argArr[0], apiCall] : (mFn.length >= 3 ? [scH, undefined, apiCall] : [scH, apiCall]);
                try { mFn.apply(scE.hooks, sArgs); } catch (err) { console.warn('[NEXUS script.call]', scE.name, err); }
              }
            }
          }
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
        var et = players[0]; var etB = sim.bodies.get(et.id);
        var edx = et.transform.x - obj.transform.x; var edy = et.transform.y - obj.transform.y; var ed = Math.hypot(edx, edy);
        var ecFlee = Number(cfg.fleeHealthRatio !== undefined ? cfg.fleeHealthRatio : (obj.aiAgent && obj.aiAgent.fleeHealthRatio !== undefined ? obj.aiAgent.fleeHealthRatio : 0.25));
        var ecInsist = Number(cfg.insistDamageRatio !== undefined ? cfg.insistDamageRatio : (obj.aiAgent && obj.aiAgent.insistDamageRatio !== undefined ? obj.aiAgent.insistDamageRatio : 0.45));
        var ecFleeing = (body.maxHealth > 0 ? body.health / body.maxHealth : 1) <= ecFlee;
        var ecInsisting = !ecFleeing && (etB && etB.maxHealth > 0 ? etB.health / etB.maxHealth : 1) <= ecInsist;
        var ecFov = Number(cfg.visionFovDeg !== undefined ? cfg.visionFovDeg : (obj.aiAgent && obj.aiAgent.visionFovDeg !== undefined ? obj.aiAgent.visionFovDeg : 140));
        var ecFace = obj.sprite && obj.sprite.flipX ? -1 : 1;
        var ecInCone = ecFov >= 359 || (ed > 0.001 ? (edx / ed) * ecFace : 1) >= Math.cos(((Math.min(360, ecFov) * 0.5) * Math.PI) / 180) || ed <= 96;
        var ecLos = cfg.requireLineOfSight !== true || hasAiLos2D(obj.transform.x, obj.transform.y, et.transform.x, et.transform.y, solids);
        if ((ecFleeing || (ecInCone && ecLos)) && ed <= Number(cfg.detectRadius || 480) && (ecFleeing || ed > 4) && ed > 0.001) {
          var ecDirX = ecFleeing ? -edx : edx; var ecDirY = ecFleeing ? -edy : edy;
          var ecLen = Math.hypot(ecDirX, ecDirY) || 1;
          var es = Number(cfg.speed || 145) * (ecFleeing ? 1.12 : ecInsisting ? 1.25 : 1);
          body.vx = (ecDirX / ecLen) * es; body.vy = (ecDirY / ecLen) * es;
          obj.transform.x += body.vx * dt; if (cfg.respectSolids !== false) resolveH(obj, body, solids);
          obj.transform.y += body.vy * dt; if (cfg.respectSolids !== false) resolveV(obj, body, solids);
          if (obj.sprite) obj.sprite.flipX = body.vx < 0;
        } else { body.vx = 0; body.vy = 0; }
        if (!ecFleeing && Number(cfg.contactDamage || 15) > 0 && ed < (obj.transform.width + et.transform.width) * 0.45) applyDamage(sim, et, Number(cfg.contactDamage || 15), 0.5);
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
      } else if (c.type === 'world.resource_node') {
        var rKey = 'res_resp:' + obj.id;
        var rRem = sim.runtimeTimers.get(rKey) || 0;
        if (rRem > 0) {
          var nRem = Math.max(0, rRem - dt);
          sim.runtimeTimers.set(rKey, nRem);
          if (nRem <= 0) obj.visible = true;
        } else if (players[0] && players[0].id !== obj.id) {
          var rRad = Math.max(24, Number(cfg.interactRadius || 56));
          var rD = Math.hypot(players[0].transform.x - obj.transform.x, players[0].transform.y - obj.transform.y);
          var rTrig = rD <= rRad && (cfg.autoPickup !== false || (keyMatch('KeyE', input) && !wasK('KeyE')));
          if (rTrig) {
            var itemId = String(cfg.itemId || 'crystal');
            var amt = Math.max(1, Math.round(Number(cfg.amount || 1)));
            var ik = 'inv_' + itemId;
            sim.variables.set(ik, (Number(sim.variables.get(ik) || 0) || 0) + amt);
            sim.variables.set('puntos', (Number(sim.variables.get('puntos') || 0) || 0) + amt * 10);
            playSynth('coin', 0.85, 1, 'sfx');
            var respS = Number(cfg.respawnSec || 20);
            obj.visible = false;
            if (respS > 0) sim.runtimeTimers.set(rKey, respS);
          }
        }
      } else if (c.type === 'tool.fishing_rod') {
        var cKey = String(cfg.castKey || 'KeyF');
        var rodK = 'rod_cd:' + c.id;
        var rodRem = sim.runtimeTimers.get(rodK) || 0;
        if (rodRem > 0) {
          var rodNext = Math.max(0, rodRem - dt);
          sim.runtimeTimers.set(rodK, rodNext);
          if (rodNext <= 0) {
            var pool = String(cfg.fishPool || 'trucha,salmon,pez_dorado').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            var fish = pool[Math.floor(Math.random() * Math.max(1, pool.length))] || 'trucha';
            sim.variables.set('inv_' + fish, (Number(sim.variables.get('inv_' + fish) || 0) || 0) + 1);
            playSynth('coin', 0.85, 1.15, 'sfx');
          }
        } else if (keyMatch(cKey, input) && !wasK(cKey)) {
          sim.runtimeTimers.set(rodK, Math.max(0.4, Number(cfg.biteTimeSec || 1.8)));
        }
      } else if (c.type === 'tool.capture_net') {
        var netKey = String(cfg.swingKey || 'KeyG');
        var netK = 'net_cd:' + c.id;
        var netCd = Math.max(0, (sim.runtimeTimers.get(netK) || 0) - dt);
        sim.runtimeTimers.set(netK, netCd);
        if (netCd <= 0 && keyMatch(netKey, input) && !wasK(netKey)) {
          sim.runtimeTimers.set(netK, Math.max(0.25, Number(cfg.cooldownSec || 1.0)));
          var nRad = Math.max(24, Number(cfg.radius || 110));
          sim.scene.objects.forEach(function (cand) {
            if (!cand.visible || cand.id === obj.id) return;
            var rn = (cand.components || []).find(function (cc) { return cc.enabled && cc.type === 'world.resource_node'; });
            if (rn && Math.hypot(cand.transform.x - obj.transform.x, cand.transform.y - obj.transform.y) <= nRad) {
              var iId = String(rn.config.itemId || 'crystal');
              sim.variables.set('inv_' + iId, (Number(sim.variables.get('inv_' + iId) || 0) || 0) + 1);
              cand.visible = false;
            }
          });
        }
      } else if (c.type === 'tool.harvest') {
        var hKey = String(cfg.swingKey || 'KeyE');
        var harvK = 'harv_cd:' + c.id;
        var harvCd = Math.max(0, (sim.runtimeTimers.get(harvK) || 0) - dt);
        sim.runtimeTimers.set(harvK, harvCd);
        if (harvCd <= 0 && keyMatch(hKey, input) && !wasK(hKey)) {
          sim.runtimeTimers.set(harvK, Math.max(0.2, Number(cfg.cooldownSec || 0.45)));
          var hRng = Math.max(24, Number(cfg.range || 85));
          for (var hi = 0; hi < sim.scene.objects.length; hi++) {
            var hc = sim.scene.objects[hi];
            if (!hc.visible || hc.id === obj.id) continue;
            var hNode = (hc.components || []).find(function (cc) { return cc.enabled && (cc.type === 'world.resource_node' || cc.type === 'world.crop_farm'); });
            if (hNode && Math.hypot(hc.transform.x - obj.transform.x, hc.transform.y - obj.transform.y) <= hRng) {
              var hItem = String(hNode.config.itemId || hNode.config.harvestItem || 'recurso');
              sim.variables.set('inv_' + hItem, (Number(sim.variables.get('inv_' + hItem) || 0) || 0) + 1);
              hc.visible = false;
              playSynth('hit', 0.65, 1, 'sfx');
              break;
            }
          }
        }
      } else if (c.type === 'physics.water_buoyancy') {
        var wLvl = Number(cfg.waterLevel !== undefined ? cfg.waterLevel : stageH * 0.65);
        if (obj.transform.y > wLvl) {
          body.vy += (wLvl - obj.transform.y) * Number(cfg.buoyancy || 12) * dt;
          body.vy *= Math.max(0, 1 - 4 * dt);
        }
      } else if (c.type === 'vehicle.watercraft' || c.type === 'vehicle.mount') {
        var bKey = String(cfg.boardKey || 'KeyE');
        var bsK = 'boarded:' + obj.id;
        var boarded = sim.runtimeTimers.get(bsK) === 1;
        if (players[0] && players[0].id !== obj.id) {
          var bDist = Math.hypot(players[0].transform.x - obj.transform.x, players[0].transform.y - obj.transform.y);
          if (keyMatch(bKey, input) && !wasK(bKey) && (boarded || bDist <= 90)) {
            boarded = !boarded;
            sim.runtimeTimers.set(bsK, boarded ? 1 : 0);
            var links = sim.scene.wiringLinks || [];
            links.forEach(function (lk) {
              if (lk.sourceObjectId === obj.id && lk.targetBehavior === 'juice.camera_follow' && lk.action === 'setTarget') {
                sim.cameraFollowOverrideId = boarded ? obj.id : players[0].id;
              }
            });
          }
          if (boarded) {
            var vSpd = Number(cfg.maxSpeed || 220);
            var vx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
            var vy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
            body.vx = vx * vSpd; body.vy = vy * vSpd;
            obj.transform.x += body.vx * dt; obj.transform.y += body.vy * dt;
            players[0].transform.x = obj.transform.x; players[0].transform.y = obj.transform.y;
          }
        }
      } else if (c.type === 'survival.vitals') {
        var hDrain = Number(cfg.hungerDrainPerMin || 3) / 60;
        var tDrain = Number(cfg.thirstDrainPerMin || 4) / 60;
        sim.variables.set('hambre', Math.max(0, (Number(sim.variables.get('hambre') !== undefined ? sim.variables.get('hambre') : 100)) - hDrain * dt));
        sim.variables.set('sed', Math.max(0, (Number(sim.variables.get('sed') !== undefined ? sim.variables.get('sed') : 100)) - tDrain * dt));
      } else if (c.type === 'rpg.loot_drop') {
        var lkDone = 'loot_done:' + c.id;
        if (body.health <= 0 && !sim.runtimeTimers.has(lkDone)) {
          sim.runtimeTimers.set(lkDone, 1);
          var lItem = String(cfg.itemId || 'gold_coin');
          var lAmt = Math.max(1, Math.round(Number(cfg.minAmount || 1)));
          sim.variables.set('inv_' + lItem, (Number(sim.variables.get('inv_' + lItem) || 0) || 0) + lAmt);
        }
      } else if (c.type === 'ui.menu_nav') {
        var tsId = String(cfg.targetSceneId || '');
        if ((clickedSet.has(obj.id) || (keyMatch('Enter', input) && !wasK('Enter'))) && tsId && !sim.pendingSceneCommand) {
          sim.pendingSceneCommand = { kind: 'load', sceneId: tsId, transition: 'fadeBlack' };
        }
      }
    }

    function stepFixedSim(sim, dt) {
      sim.elapsed += dt;
      if (sim.dynamicToasts && sim.dynamicToasts.length > 0) {
        for (var dti = sim.dynamicToasts.length - 1; dti >= 0; dti--) {
          sim.dynamicToasts[dti].remaining -= dt;
          if (sim.dynamicToasts[dti].remaining <= 0) sim.dynamicToasts.splice(dti, 1);
        }
      }
      if (sim.screenFlash) { sim.screenFlash.age += dt; if (sim.screenFlash.age >= sim.screenFlash.duration) sim.screenFlash = null; }
      sim.flashTimers.forEach(function (fl, id) { fl.remaining -= dt; if (fl.remaining <= 0) sim.flashTimers.delete(id); });

      if (activeDialogue2D && !activeDialogue2D.finishedTyping) {
        activeDialogue2D.revealedChars = Math.min(activeDialogue2D.fullText.length, activeDialogue2D.revealedChars + activeDialogue2D.typewriterSpeed * dt);
        if (activeDialogue2D.revealedChars >= activeDialogue2D.fullText.length) activeDialogue2D.finishedTyping = true;
        renderDialogueOverlay2D();
      }

      var objMap = new Map();
      sim.scene.objects.forEach(function (o) { objMap.set(o.id, o); });
      var damageZones = [];
      var solids = collectSolids(sim, damageZones);

      if (sim.pendingWaits.length > 0) {
        var keep = [];
        sim.pendingWaits.forEach(function (w) {
          w.remainingSec -= dt;
          if (w.remainingSec <= 0) runActionList(w.actions, w.mechId, sim, objMap, w.ctx);
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
        if (obj.type === 'light_2d' && obj.light2d) {
          var lFl = (obj.components || []).find(function (c) { return c.enabled && c.type === 'lighting.flicker'; });
          if (lFl) {
            if (obj.light2d.__baseInt === undefined) obj.light2d.__baseInt = obj.light2d.intensity;
            obj.light2d.intensity = Math.max(0.1, obj.light2d.__baseInt * (1 + Math.sin(sim.elapsed * Number(lFl.config.speed || 8)) * Number(lFl.config.amount || 0.25)));
          }
        }
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
            var tgt = players[0]; var tgB = sim.bodies.get(tgt.id);
            var dxP = tgt.transform.x - obj.transform.x; var dyP = tgt.transform.y - obj.transform.y; var distP = Math.hypot(dxP, dyP);
            var cFlee = Number(c.config.fleeHealthRatio !== undefined ? c.config.fleeHealthRatio : (obj.aiAgent && obj.aiAgent.fleeHealthRatio !== undefined ? obj.aiAgent.fleeHealthRatio : 0.25));
            var cInsist = Number(c.config.insistDamageRatio !== undefined ? c.config.insistDamageRatio : (obj.aiAgent && obj.aiAgent.insistDamageRatio !== undefined ? obj.aiAgent.insistDamageRatio : 0.45));
            var isFlee2 = (body.maxHealth > 0 ? body.health / body.maxHealth : 1) <= cFlee;
            var isInsist2 = !isFlee2 && (tgB && tgB.maxHealth > 0 ? tgB.health / tgB.maxHealth : 1) <= cInsist;
            var vFov2 = Number(c.config.visionFovDeg !== undefined ? c.config.visionFovDeg : (obj.aiAgent && obj.aiAgent.visionFovDeg !== undefined ? obj.aiAgent.visionFovDeg : 140));
            var faceX2 = obj.sprite && obj.sprite.flipX ? -1 : 1;
            var inCone2 = vFov2 >= 359 || (distP > 0.001 ? (dxP / distP) * faceX2 : 1) >= Math.cos(((Math.min(360, vFov2) * 0.5) * Math.PI) / 180) || distP <= 96;
            var hasLos2 = c.config.requireLineOfSight !== true || hasAiLos2D(obj.transform.x, obj.transform.y, tgt.transform.x, tgt.transform.y, solids);
            if ((isFlee2 || (inCone2 && hasLos2)) && distP <= Number(c.config.detectRadius || 420) && (isFlee2 || distP > Number(c.config.stopDistance || 36)) && distP > 0.001) {
              var gxP = isFlee2 ? -dxP : dxP; var gyP = isFlee2 ? -dyP : dyP; var glP = Math.hypot(gxP, gyP) || 1;
              var cSpd = Number(c.config.speed || 130) * (isFlee2 ? 1.12 : isInsist2 ? 1.25 : 1);
              body.vx = (gxP / glP) * cSpd; body.vy = (gyP / glP) * cSpd;
              obj.transform.x += body.vx * dt; resolveH(obj, body, solids);
              obj.transform.y += body.vy * dt; resolveV(obj, body, solids);
              if (obj.sprite) obj.sprite.flipX = body.vx < 0;
            } else { body.vx = 0; body.vy = 0; }
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
          var mx = Math.abs(input.axisX || 0) > 0.08 ? input.axisX : ((input.right ? 1 : 0) - (input.left ? 1 : 0));
          if (body.grounded) { body.coyoteTimer = prm.coyoteTime; body.jumpsUsed = 0; }
          else body.coyoteTimer = Math.max(0, body.coyoteTimer - dt);
          if (jumpJustPressed) body.jumpBufferTimer = prm.jumpBuffer;
          else body.jumpBufferTimer = Math.max(0, body.jumpBufferTimer - dt);
          var rate = Math.abs(mx) > 0.02 ? prm.acceleration * (body.grounded ? 1 : prm.airControl) : prm.deceleration * (body.grounded ? prm.groundFriction : prm.airControl * 0.7);
          body.vx = moveTowards(body.vx + body.ax * dt, mx * prm.maxSpeed, rate * dt);
          body.ax = 0;
          if (mx < -0.05 && obj.sprite) obj.sprite.flipX = true;
          if (mx > 0.05 && obj.sprite) obj.sprite.flipX = false;
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
          var dx = Math.abs(input.axisX || 0) > 0.08 ? input.axisX : ((input.right ? 1 : 0) - (input.left ? 1 : 0));
          var dy = Math.abs(input.axisY || 0) > 0.08 ? input.axisY : ((input.down ? 1 : 0) - (input.up ? 1 : 0));
          var magT = Math.hypot(dx, dy);
          if (magT > 1) { dx /= magT; dy /= magT; }
          body.vx = moveTowards(body.vx + body.ax * dt, dx * tp.maxSpeed, (Math.abs(dx) > 0.02 ? tp.acceleration : tp.deceleration) * dt);
          body.vy = moveTowards(body.vy + body.ay * dt, dy * tp.maxSpeed, (Math.abs(dy) > 0.02 ? tp.acceleration : tp.deceleration) * dt);
          body.ax = 0; body.ay = 0;
          if (dx < -0.05 && obj.sprite) obj.sprite.flipX = true;
          if (dx > 0.05 && obj.sprite) obj.sprite.flipX = false;
          obj.transform.x += body.vx * dt; resolveH(obj, body, solids);
          obj.transform.y += body.vy * dt; resolveV(obj, body, solids);
        } else if (!hasExtCtrl && obj.rigidbody && obj.rigidbody.bodyType === 'dynamic') {
          body.vy += 1200 * (obj.rigidbody.gravityScale !== undefined ? obj.rigidbody.gravityScale : 1) * dt;
          body.vx += body.ax * dt; body.vy += body.ay * dt; body.ax = 0; body.ay = 0;
          obj.transform.x += body.vx * dt; resolveH(obj, body, solids);
          obj.transform.y += body.vy * dt; resolveV(obj, body, solids);
        } else if (!hasExtCtrl && body.scriptVelocityDriven) {
          obj.transform.x += body.vx * dt;
          obj.transform.y += body.vy * dt;
        }
      });

      if (players.length > 0) {
        var pCols = players.map(function (p) { return getWorldColliders(p); });
        if (damageZones.length > 0) {
          players.forEach(function (pl, pIdx) {
            var pcs = pCols[pIdx];
            for (var dzi = 0; dzi < damageZones.length; dzi++) {
              var dz = damageZones[dzi];
              if (pcs.some(function (pc) { return colsOverlap(pc, dz); })) {
                applyDamage(sim, pl, Math.max(1, dz.dps * 0.35), 0.35);
                break;
              }
            }
          });
        }
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
        var collisionPairs = [];
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
                  if ((ev === 'collision.enter' || ev === 'trigger.enter') && !pSet.has(pk)) { trig = true; collisionPairs.push({ owner: sObj, other: tObj }); }
                  else if (ev === 'collision.stay') { trig = true; collisionPairs.push({ owner: sObj, other: tObj }); }
                } else if ((ev === 'collision.exit' || ev === 'trigger.exit') && pSet.has(pk)) { trig = true; collisionPairs.push({ owner: sObj, other: tObj }); }
              });
            });
          }
        }
        if (!trig) return;
        var conds = mech.conditions || [];
        var comb = mech.conditionCombinator || 'all';
        var condOk = conds.length === 0 ? true : comb === 'any' ? conds.some(function (c) { return evalCondition(c, sim, objMap); }) : comb === 'none' ? conds.every(function (c) { return !evalCondition(c, sim, objMap); }) : conds.every(function (c) { return evalCondition(c, sim, objMap); });
        if (condOk) {
          if (collisionPairs.length > 0) {
            collisionPairs.forEach(function (pair) { runActionList(mech.actions || [], mech.id, sim, objMap, pair); });
          } else {
            runActionList(mech.actions || [], mech.id, sim, objMap);
          }
        }
      });

      // Avanzar tweens de scripts nexus.tween()
      if (sim.scriptTweens && sim.scriptTweens.length > 0) {
        var keepTw = [];
        sim.scriptTweens.forEach(function (tw) {
          tw.elapsed += dt;
          var r = Math.min(1, tw.elapsed / tw.duration);
          var ease = 1 - Math.pow(1 - r, 2);
          var twO = objMap.get(tw.targetId);
          if (twO) {
            Object.keys(tw.to).forEach(function (pr) {
              var sVal = tw.from[pr] !== undefined ? tw.from[pr] : tw.to[pr];
              var val = sVal + (tw.to[pr] - sVal) * ease;
              if (pr === 'x') twO.transform.x = val;
              else if (pr === 'y') twO.transform.y = val;
              else if (pr === 'rotation' || pr === 'rz') twO.transform.rotation = val;
              else if (pr === 'scaleX') twO.transform.scaleX = val;
              else if (pr === 'scaleY') twO.transform.scaleY = val;
              else if (pr === 'opacity') twO.opacity = Math.max(0, Math.min(1, val));
            });
          }
          if (r < 1) keepTw.push(tw);
        });
        sim.scriptTweens = keepTw;
      }

      // Ejecutar Scripts JS de escena y de objetos (onStart por binding, onCollisionEnter simétrico, onUpdate, onClick)
      var api2d = makeScriptApi2D(sim, objMap, dt);
      if (!sim.startedScriptBindings) sim.startedScriptBindings = new Set();
      if (!sim.scriptActivePairs) sim.scriptActivePairs = new Set();

      (sim.scene.scriptIds || []).forEach(function (sid) {
        var sKey = 'scene:' + sid;
        if (sim.startedScriptBindings.has(sKey)) return;
        sim.startedScriptBindings.add(sKey);
        var e = compiledScripts2D.get(sid);
        if (e && e.hooks && typeof e.hooks.onStart === 'function') {
          try { e.hooks.onStart(makeSceneScriptHandle2D(sid, sim, objMap, Object.assign({}, e.hooks.params || {})), api2d); }
          catch (err) { console.warn('[NEXUS Script Error]', e.name, err); }
        }
      });

      sim.scene.objects.slice().forEach(function (obj) {
        (obj.scriptBindings || []).forEach(function (b) {
          if (!b.enabled) return;
          var bKey = 'obj:' + obj.id + ':' + b.id;
          if (sim.startedScriptBindings.has(bKey)) return;
          sim.startedScriptBindings.add(bKey);
          var e = compiledScripts2D.get(b.scriptId);
          if (e && e.hooks && typeof e.hooks.onStart === 'function') {
            try { e.hooks.onStart(makeScriptHandle2D(obj, sim, objMap, Object.assign({}, e.hooks.params || {}, b.params || {})), api2d); }
            catch (err) { console.warn('[NEXUS Script Error]', obj.name, e.name, err); }
          }
        });
      });

      var nextScriptPairs = new Set();
      var scObjs = sim.scene.objects.filter(function (o) { return o.visible && o.type !== 'ui_widget'; });
      var hasColScripts = scObjs.some(function (o) {
        return (o.scriptBindings || []).some(function (b) {
          var ce = b.enabled && compiledScripts2D.get(b.scriptId);
          return ce && ce.hooks && typeof ce.hooks.onCollisionEnter === 'function';
        });
      });
      if (hasColScripts) {
        var boxCache2d = new Map();
        var getBoxes2d = function (o) {
          var c = boxCache2d.get(o.id);
          if (!c) { c = getWorldColliders(o); boxCache2d.set(o.id, c); }
          return c;
        };
        for (var si = 0; si < scObjs.length; si++) {
          var sa = scObjs[si];
          var saHas = (sa.scriptBindings || []).some(function (b) { var ce = b.enabled && compiledScripts2D.get(b.scriptId); return ce && ce.hooks && typeof ce.hooks.onCollisionEnter === 'function'; });
          var saCols = getBoxes2d(sa);
          if (saCols.length === 0) continue;
          for (var sj = si + 1; sj < scObjs.length; sj++) {
            var sb = scObjs[sj];
            var sbHas = (sb.scriptBindings || []).some(function (b) { var ce = b.enabled && compiledScripts2D.get(b.scriptId); return ce && ce.hooks && typeof ce.hooks.onCollisionEnter === 'function'; });
            if (!saHas && !sbHas) continue;
            var sbCols = getBoxes2d(sb);
            if (sbCols.length === 0) continue;
            var hit2d = saCols.some(function (ac) { return sbCols.some(function (bc) { return canLayersCollide(ac.layer, bc.layer, ac.mask, bc.mask) && colsOverlap(ac, bc); }); });
            if (!hit2d) continue;
            var pk2d = sa.id < sb.id ? (sa.id + '|' + sb.id) : (sb.id + '|' + sa.id);
            nextScriptPairs.add(pk2d);
            if (!sim.scriptActivePairs.has(pk2d)) {
              (sa.scriptBindings || []).forEach(function (bind) {
                if (!bind.enabled) return;
                var ent = compiledScripts2D.get(bind.scriptId);
                if (ent && ent.hooks && typeof ent.hooks.onCollisionEnter === 'function') {
                  try { ent.hooks.onCollisionEnter(makeScriptHandle2D(sa, sim, objMap, Object.assign({}, ent.hooks.params || {}, bind.params || {})), makeScriptHandle2D(sb, sim, objMap, {}), api2d); }
                  catch (err) { console.warn('[NEXUS Script Error]', ent.name, err); }
                }
              });
              (sb.scriptBindings || []).forEach(function (bind) {
                if (!bind.enabled) return;
                var ent = compiledScripts2D.get(bind.scriptId);
                if (ent && ent.hooks && typeof ent.hooks.onCollisionEnter === 'function') {
                  try { ent.hooks.onCollisionEnter(makeScriptHandle2D(sb, sim, objMap, Object.assign({}, ent.hooks.params || {}, bind.params || {})), makeScriptHandle2D(sa, sim, objMap, {}), api2d); }
                  catch (err) { console.warn('[NEXUS Script Error]', ent.name, err); }
                }
              });
            }
          }
        }
      }
      sim.scriptActivePairs = nextScriptPairs;

      (sim.scene.scriptIds || []).forEach(function (sid) {
        var e = compiledScripts2D.get(sid);
        if (e && e.hooks && typeof e.hooks.onUpdate === 'function') {
          try { e.hooks.onUpdate(makeSceneScriptHandle2D(sid, sim, objMap, Object.assign({}, e.hooks.params || {})), dt, api2d); }
          catch (err) { console.warn('[NEXUS Script Error]', e.name, err); }
        }
      });

      sim.scene.objects.slice().forEach(function (obj) {
        if (!obj.visible || !obj.scriptBindings) return;
        obj.scriptBindings.forEach(function (b) {
          if (!b.enabled) return;
          var e = compiledScripts2D.get(b.scriptId);
          if (!e || !e.hooks) return;
          var prm = Object.assign({}, e.hooks.params || {}, b.params || {});
          if (typeof e.hooks.onUpdate === 'function') {
            try { e.hooks.onUpdate(makeScriptHandle2D(obj, sim, objMap, prm), dt, api2d); }
            catch (err) { console.warn('[NEXUS Script Error]', obj.name, e.name, err); }
          }
          if (clickedSet.has(obj.id) && typeof e.hooks.onClick === 'function') {
            try { e.hooks.onClick(makeScriptHandle2D(obj, sim, objMap, prm), api2d); }
            catch (err) { console.warn('[NEXUS Script Error]', obj.name, e.name, err); }
          }
        });
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
        if (obj.type === 'sprite' && obj.sprite && obj.animStateMachine && obj.animStateMachine.states && obj.animStateMachine.states.length > 0) {
          var bodyF = sim.bodies.get(obj.id);
          if (bodyF) {
            var curFsm = (obj.sprite.animation && obj.sprite.animation.fsmActiveState && obj.sprite.animation.fsmActiveState.stateName) || (obj.stateMachine && obj.stateMachine.currentState) || '';
            var nodeA = sim.nodeMap.get(obj.id);
            var sprA = nodeA && nodeA.__animSprite;
            var fsmTKey = 'fsm_t:' + obj.id;
            var stateEl = (sim.runtimeTimers.get(fsmTKey) || 0) + dt;
            sim.runtimeTimers.set(fsmTKey, stateEl);
            var animProg = 0, animFin = false;
            var fCount = (obj.sprite.animation && obj.sprite.animation.fsmActiveState && obj.sprite.animation.fsmActiveState.frameCount) || (sprA ? sprA.totalFrames : 1) || 1;
            var fFps = (obj.sprite.animation && obj.sprite.animation.fsmActiveState && obj.sprite.animation.fsmActiveState.fps) || (obj.sprite.animation && obj.sprite.animation.fps) || 8;
            var isLoop = obj.sprite.animation && obj.sprite.animation.fsmActiveState ? obj.sprite.animation.fsmActiveState.loop !== false : (sprA ? Boolean(sprA.loop) : true);
            var clipDur = Math.max(0.05, fCount / Math.max(1, fFps));
            if (sprA && sprA.totalFrames > 0) {
              animProg = Math.min(1, (sprA.currentFrame + 1) / sprA.totalFrames);
              animFin = !sprA.loop && (sprA.currentFrame >= sprA.totalFrames - 1 || stateEl >= clipDur);
            } else {
              animProg = isLoop ? (stateEl % clipDur) / clipDur : Math.min(1, stateEl / clipDur);
              animFin = !isLoop && stateEl >= clipDur;
            }
            var fsmRes = stepAnimFsm2d(obj.animStateMachine, curFsm, { speed: Math.hypot(bodyF.vx, bodyF.vy), vy: -bodyF.vy, isGrounded: bodyF.grounded, animFinished: animFin, animProgress: animProg, heldKeys: pressedKeys, justPressedKeys: justPressedKeys2d, variables: sim.variables });
            if (fsmRes && (fsmRes.changed || !obj.sprite.animation || !obj.sprite.animation.fsmActiveState)) {
              sim.runtimeTimers.set(fsmTKey, 0);
              if (!obj.sprite.animation) obj.sprite.animation = { enabled: true, cols: fsmRes.node.cols || 4, rows: fsmRes.node.rows || 1, frameCount: fsmRes.node.frameCount || 4, fps: 8, loop: true, playing: true };
              var anim2 = obj.sprite.animation;
              anim2.enabled = true; anim2.playing = true; anim2.activeClip = fsmRes.clipName;
              anim2.fsmActiveState = {
                stateName: fsmRes.stateName,
                assetId: fsmRes.node.assetId || obj.sprite.assetId,
                cols: fsmRes.node.cols || anim2.cols,
                rows: fsmRes.node.rows || anim2.rows,
                startFrame: fsmRes.node.startFrame || 0,
                frameCount: fsmRes.node.frameCount || anim2.frameCount,
                fps: Math.max(1, (anim2.fps || 8) * Math.max(0.1, fsmRes.timeScale || 1)),
                loop: fsmRes.loopMode !== 'LoopOnce'
              };
              obj.stateMachine = { currentState: fsmRes.stateName, states: obj.animStateMachine.states.map(function (s) { return s.name; }) };
            } else if (fsmRes && fsmRes.node) {
              var evList2d = (fsmRes.node.frameEvents || []).concat((obj.sprite && obj.sprite.frameEvents) || []);
              if (evList2d.length > 0) {
                var fePrevK = 'fe2d:' + obj.id + ':' + fsmRes.node.id;
                var curFr2d = sprA && sprA.totalFrames > 0 ? sprA.currentFrame : (Math.floor(stateEl * Math.max(1, fFps)) % Math.max(1, fCount));
                var prevFr2d = sim.runtimeTimers.get(fePrevK);
                if (curFr2d !== prevFr2d) {
                  sim.runtimeTimers.set(fePrevK, curFr2d);
                  evList2d.forEach(function (fe) {
                    if (fe.frameIndex === curFr2d) {
                      if (fe.eventName) sim.emittedEvents.push(fe.eventName);
                      if (fe.soundAssetId) playAudioAsset(fe.soundAssetId, 0.9, 1, 'sfx', false, obj.transform.x, obj.transform.y, 720);
                    }
                  });
                }
              }
            }
          }
        }
        var emList = [];
        if (obj.particleEmitter && obj.particleEmitter.enabled) {
          emList.push(obj.particleEmitter);
          if (obj.particleEmitter.layers && obj.particleEmitter.layers.length > 0) {
            obj.particleEmitter.layers.forEach(function (ly) {
              if (ly && ly.enabled !== false) emList.push(Object.assign({}, obj.particleEmitter, ly));
            });
          }
        }
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
      justPressedKeys2d.clear();
      if (sim.emitterParticles.length > 0) {
        sim.emitterParticles = sim.emitterParticles.filter(function (pt, idxP) {
          pt.age += dt; if (pt.age >= pt.maxAge) return false;
          var etP = Math.min(1, pt.age / Math.max(0.05, pt.maxAge));
          pt.vy += pt.gravity * dt;
          if (pt.drag > 0) {
            var dp = Math.max(0, 1 - pt.drag * dt);
            pt.vx *= dp; pt.vy *= dp;
          }
          if (pt.turbulence > 0) {
            pt.vx += Math.sin(pt.age * 7.3 + idxP) * pt.turbulence * dt;
          }
          var spScale = pt.speedCurve && pt.speedCurve.length >= 2 ? sampleVfxCurve2D(pt.speedCurve, etP, 1, 1) : 1;
          pt.x += pt.vx * spScale * dt; pt.y += pt.vy * spScale * dt;
          return true;
        });
      }

      var camCfg = sim.scene.cameraConfig;
      var cTgt = (sim.cameraFollowOverrideId ? objMap.get(sim.cameraFollowOverrideId) : null) || (camCfg && camCfg.followObjectId ? objMap.get(camCfg.followObjectId) : sim.scene.objects.find(function (o) { return o.visible && o.components && o.components.some(function (c) { return c.enabled && c.type === 'juice.camera_follow'; }); }));
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

      if (activeSim) {
        syncWidgetsDom2D(activeSim);
      }

      syncLegacyKeys();
      var sim = activeSim;
      sceneRoot.position.set(-sim.cameraPos.x, -sim.cameraPos.y);

      sim.scene.objects.forEach(function (obj) {
        var node = sim.nodeMap.get(obj.id);
        if (!node) return;
        if (obj.type === 'sprite' && obj.sprite && obj.sprite.animation && obj.sprite.animation.fsmActiveState) {
          var fst = obj.sprite.animation.fsmActiveState;
          var fAid = fst.assetId || obj.sprite.assetId || '';
          var desiredKey = fAid + ':' + (fst.cols || 1) + ':' + (fst.rows || 1) + ':' + (fst.startFrame || 0) + ':' + (fst.frameCount || 1) + ':' + (fst.fps || 8) + ':' + (fst.loop !== false);
          if (node.__fsmKey !== desiredKey) {
            var parentC = node.parent || sceneRoot;
            var chIdx = parentC.children.indexOf(node);
            var rebuilt = createDisplayForObject(obj, sim);
            if (chIdx >= 0) parentC.addChildAt(rebuilt, chIdx); else parentC.addChild(rebuilt);
            node.destroy({ children: true, texture: false, textureSource: false });
            sim.nodeMap.set(obj.id, rebuilt);
            node = rebuilt;
          }
        }
        var sq = sim.visualSquash.get(obj.id);
        node.position.set(obj.transform.x, obj.transform.y);
        node.rotation = obj.transform.rotation * DEG_TO_RAD;
        node.scale.set(obj.transform.scaleX * (sq ? sq.sx : 1) * (obj.sprite && obj.sprite.flipX ? -1 : 1), obj.transform.scaleY * (sq ? sq.sy : 1) * (obj.sprite && obj.sprite.flipY ? -1 : 1));
        node.alpha = Math.max(0, Math.min(1, obj.opacity));
        node.visible = obj.visible;
        if (obj.visible && obj.optimization) {
          var opt = obj.optimization;
          var pad = Math.max(Math.abs(obj.transform.width * obj.transform.scaleX), Math.abs(obj.transform.height * obj.transform.scaleY)) + 80;
          if (opt.frustumCulling && !obj.parentId && (obj.transform.x < sim.cameraPos.x - pad || obj.transform.x > sim.cameraPos.x + stageW + pad || obj.transform.y < sim.cameraPos.y - pad || obj.transform.y > sim.cameraPos.y + stageH + pad)) {
            node.visible = false;
          }
          if (node.visible && opt.fadeEnabled) {
            var cxO = sim.cameraPos.x + stageW * 0.5;
            var cyO = sim.cameraPos.y + stageH * 0.5;
            var dO = Math.hypot(obj.transform.x - cxO, obj.transform.y - cyO);
            var fSt = Math.max(10, opt.fadeStart !== undefined ? opt.fadeStart : 380);
            var fEn = Math.max(fSt + 20, opt.fadeEnd !== undefined ? opt.fadeEnd : 620);
            if (dO >= fEn) node.visible = false;
            else if (dO > fSt) node.alpha *= Math.max(0, Math.min(1, 1 - (dO - fSt) / (fEn - fSt)));
          }
        }
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
        var aEnd = pt.alphaEnd !== undefined ? pt.alphaEnd : 0;
        var curAlpha = Math.max(0, Math.min(1, sampleVfxCurve2D(pt.alphaCurve, et, pt.alpha, aEnd)));
        var curSz = Math.max(1, sampleVfxCurve2D(pt.sizeCurve, et, pt.sizeStart, pt.sizeEnd));
        var col = parseColor(et < 0.5 ? pt.colorStart : pt.colorEnd, 0xf97316);
        var px = pt.x - sim.cameraPos.x;
        var py = pt.y - sim.cameraPos.y;
        if (pt.particleShape === 'ring') {
          fxGraphics.circle(px, py, curSz);
          fxGraphics.stroke({ width: 2, color: col, alpha: curAlpha });
        } else if (pt.particleShape === 'liquid') {
          fxGraphics.ellipse(px, py, curSz * 0.72, curSz * 1.45);
          fxGraphics.fill({ color: col, alpha: curAlpha });
        } else {
          fxGraphics.circle(px, py, curSz);
          fxGraphics.fill({ color: col, alpha: curAlpha });
        }
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
      renderLighting2DExport(sim);

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
