import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Code2,
  FileCode2,
  Layout,
  Link2,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  AlertCircle,
  X,
} from 'lucide-react';
import type {
  DataTableDef,
  DialogueGraph,
  GameObjectData,
  I18nConfig,
  ProjectVariable,
  SceneData,
} from '../../engine/core/types';
import {
  extractScriptParamsSchema,
  validateScriptSyntax,
} from '../../engine/scripting/scriptRuntime';
import type { NexusScriptAsset } from '../../project/models/project';
import { createId } from '../../utils/id';
import { scopeWidgetCss } from '../widgets/UIWidgetOverlayLayer';

interface CodeStudioPanelProps {
  scripts: NexusScriptAsset[];
  activeScene?: SceneData;
  objects?: GameObjectData[];
  selectedObject?: GameObjectData | null;
  variables?: ProjectVariable[];
  dataTables?: DataTableDef[];
  i18n?: I18nConfig;
  dialogues?: DialogueGraph[];
  onChangeScripts: (next: NexusScriptAsset[]) => void;
  onAttachScriptToScene?: (scriptId: string) => void;
  onDetachScriptFromScene?: (scriptId: string) => void;
  onAttachScriptToObject?: (objectId: string, scriptId: string) => void;
  onDetachScriptFromObject?: (objectId: string, scriptId: string) => void;
  onInsertInterfaceIntoScene?: (script: NexusScriptAsset) => void;
}

interface ScriptTemplateDef {
  id: string;
  kind: 'script' | 'interface';
  name: string;
  description: string;
  code?: string;
  html?: string;
  css?: string;
  js?: string;
}

const CODE_TEMPLATES: ScriptTemplateDef[] = [
  {
    id: 'tpl_nexus_module',
    kind: 'script',
    name: 'Mecanica_NexusScript.js',
    description: 'Plantilla oficial NexusScript (export default + params + onStart/onUpdate/onCollisionEnter).',
    code: `export default {
  params: {
    velocidad: 120,
    puntosAlTocar: 10
  },

  onStart(self, nexus) {
    self.data.tiempo = 0;
  },

  onUpdate(self, dt, nexus) {
    self.data.tiempo += dt;
    self.x += self.params.velocidad * dt;
  },

  onCollisionEnter(self, otro, nexus) {
    if (otro.hasTag('Player')) {
      nexus.vars.add('puntos', self.params.puntosAlTocar);
      nexus.audio.play('coin', 0.9);
      nexus.particles.burst(self.x, self.y, '#fbbf24', 18);
      self.destroy();
    }
  }
};
`,
  },
  {
    id: 'tpl_chase_script',
    kind: 'script',
    name: 'Perseguidor_IA.js',
    description: 'Sigue suavemente al jugador y dispara destello o daño al acercarse.',
    code: `// @param speed:number=140
// @param chaseRange:number=420
function onStart(self, nexus) {
  self.data.cooldown = 0;
}

function onUpdate(self, dt, nexus) {
  const players = nexus.findByTag('Player');
  const player = players[0] || nexus.findByName('Jugador') || nexus.findByName('Jugador_3D');
  if (!player) return;

  const dx = player.x - self.x;
  const dy = player.y - self.y;
  const dist = Math.hypot(dx, dy);
  const range = Number(self.params.chaseRange || 420);
  const spd = Number(self.params.speed || 140);

  if (dist > 8 && dist < range) {
    self.x += (dx / dist) * spd * dt;
    self.y += (dy / dist) * spd * dt;
  }
}
`,
  },
  {
    id: 'tpl_orbit_fx',
    kind: 'script',
    name: 'Flotacion_Orbital.js',
    description: 'Animación matemática sinusoidal para gemas, plataformas o enemigos.',
    code: `// @param amplitude:number=14
// @param frequency:number=2.5
function onStart(self) {
  self.data.baseY = self.y;
  self.data.t = 0;
}

function onUpdate(self, dt) {
  self.data.t += dt;
  const amp = Number(self.params.amplitude || 14);
  const freq = Number(self.params.frequency || 2.5);
  self.y = self.data.baseY + Math.sin(self.data.t * freq) * amp;
  self.rotation += 25 * dt;
}
`,
  },
  {
    id: 'tpl_boss_script',
    kind: 'script',
    name: 'Jefe_Fases.js',
    description: 'Controla fases de jefe final, audio y evento personalizado al ser derrotado.',
    code: `// @param hp:number=100
function onStart(self, nexus) {
  nexus.vars.set('boss_hp', Number(self.params.hp || 100));
  self.data.phase = 1;
}

function recibirDanio(self, amount, nexus) {
  const dmg = Number(amount || 10);
  const next = Math.max(0, Number(nexus.vars.get('boss_hp') || 0) - dmg);
  nexus.vars.set('boss_hp', next);
  nexus.audio.playSfx('hit', 1);
  if (next <= 40 && self.data.phase === 1) {
    self.data.phase = 2;
    nexus.emitEvent('jefe_furia');
  }
  if (next <= 0) {
    self.visible = false;
    nexus.emitEvent('jefe_derrotado');
  }
}
`,
  },
  {
    id: 'tpl_hud_anim',
    kind: 'interface',
    name: 'HUD_Puntuacion_Animado',
    description: 'HUD animado vinculado a variables puntos y vida + botón de pausa.',
    html: `<div class="hud-card">
  <div class="hud-row">
    <div class="stat">
      <span class="label">PUNTOS</span>
      <span class="value" data-nexus-var="puntos">0</span>
    </div>
    <div class="stat">
      <span class="label">VIDA</span>
      <div class="bar-wrap">
        <div class="bar-fill" data-nexus-progress="vida" data-nexus-max="100" style="width:100%"></div>
      </div>
    </div>
    <button type="button" class="pause-btn" data-nexus-action="pause.toggle">PAUSA</button>
  </div>
</div>`,
    css: `.hud-card {
  height: 100%;
  background: linear-gradient(135deg, rgba(16, 22, 36, 0.92), rgba(28, 39, 62, 0.88));
  border: 1px solid rgba(56, 189, 248, 0.45);
  border-radius: 12px;
  padding: 10px 14px;
  color: #f8fafc;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
  animation: hudEnter 0.45s ease-out;
}
@keyframes hudEnter {
  from { transform: translateY(-10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.hud-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; height: 100%; }
.stat { display: flex; flex-direction: column; gap: 3px; }
.label { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: #7dd3fc; }
.value { font-size: 20px; font-weight: 800; font-family: monospace; color: #ffffff; }
.bar-wrap { width: 110px; height: 10px; background: #0f172a; border-radius: 99px; overflow: hidden; border: 1px solid #334155; }
.bar-fill { height: 100%; background: linear-gradient(90deg, #10b981, #34d399); transition: width 0.25s ease; }
.pause-btn {
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}
.pause-btn:hover { background: #3b82f6; transform: scale(1.05); }`,
    js: `// Puedes manipular el DOM o disparar efectos al montar esta interfaz
console.debug('HUD animado listo', api.objectId);`,
  },
  {
    id: 'tpl_audio_panel',
    kind: 'interface',
    name: 'Panel_Audio_Interactivo',
    description: 'Panel con sliders reales vinculados al mezclador de Música y SFX + botón cerrar.',
    html: `<div class="audio-panel">
  <div class="header">
    <span>CONTROL DE AUDIO</span>
    <button type="button" class="close-btn" data-nexus-action="ui.closeSelf">✕</button>
  </div>
  <label class="slider-row">
    <span>Música</span>
    <input type="range" min="0" max="1" step="0.05" value="0.8" data-nexus-audio-bus="music" />
  </label>
  <label class="slider-row">
    <span>Efectos SFX</span>
    <input type="range" min="0" max="1" step="0.05" value="0.9" data-nexus-audio-bus="sfx" />
  </label>
  <div class="actions">
    <button type="button" data-nexus-action="audio.play" data-nexus-param="click">Probar sonido</button>
    <button type="button" data-nexus-action="scene.restart">Reiniciar nivel</button>
  </div>
</div>`,
    css: `.audio-panel {
  height: 100%;
  background: rgba(20, 22, 30, 0.95);
  border: 1px solid rgba(99, 102, 241, 0.55);
  border-radius: 12px;
  padding: 12px;
  color: #e4e4e7;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 12px;
  animation: popPanel 0.28s ease-out;
}
@keyframes popPanel {
  from { transform: scale(0.94); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
.header { display: flex; justify-content: space-between; align-items: center; font-weight: 800; color: #a5b4fc; font-size: 11px; letter-spacing: 0.06em; }
.close-btn { background: #27272a; color: #e4e4e7; border: none; border-radius: 6px; padding: 2px 7px; cursor: pointer; }
.slider-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; }
.slider-row span { white-space: nowrap; min-width: 78px; }
.slider-row input { flex: 1; accent-color: #38bdf8; cursor: pointer; }
.actions { display: flex; gap: 6px; }
.actions button { flex: 1; background: #312e81; color: #fff; border: 1px solid #4f46e5; border-radius: 6px; padding: 6px 8px; font-size: 11px; font-weight: 600; cursor: pointer; }
.actions button:hover { background: #4338ca; }`,
    js: ``,
  },
];

const API_CHIPS = [
  { label: 'nexus.vars.get()', snippet: `nexus.vars.get('puntos')` },
  { label: 'nexus.vars.set()', snippet: `nexus.vars.set('puntos', 10)` },
  { label: 'nexus.audio.playSfx()', snippet: `nexus.audio.playSfx('coin', 1)` },
  { label: 'nexus.vfx.emit()', snippet: `nexus.vfx.emit('magic', self.x, self.y, 18, self.z)` },
  { label: 'nexus.ui.showToast()', snippet: `nexus.ui.showToast('¡Nivel completado!', 'info', 2.5)` },
  { label: 'nexus.spawn.primitive()', snippet: `nexus.spawn.primitive('box', { x: self.x + 2, y: 2, z: self.z })` },
  { label: 'nexus.world.raycast()', snippet: `nexus.world.raycast({ x: self.x, y: self.y, z: self.z }, { x: 0, y: 0, z: -1 }, 30)` },
  { label: 'nexus.camera.blendTo()', snippet: `nexus.camera.blendTo({ mode: 'third_person', distance: 9, fov: 65 }, 0.6)` },
  { label: 'nexus.lights.setSun()', snippet: `nexus.lights.setSun({ intensity: 1.4, color: '#fde68a' })` },
  { label: 'nexus.emitEvent()', snippet: `nexus.emitEvent('mi_evento')` },
  { label: 'nexus.findByName()', snippet: `nexus.findByName('Jugador')` },
  { label: 'nexus.scene.load()', snippet: `nexus.scene.load('Nivel 2')` },
];

interface AutocompleteSuggestion {
  insertText: string;
  label: string;
  detail: string;
}

const ScriptCodeEditorWithAutocomplete: React.FC<{
  code: string;
  variables?: ProjectVariable[];
  dataTables?: DataTableDef[];
  i18n?: I18nConfig;
  dialogues?: DialogueGraph[];
  objects?: GameObjectData[];
  onChange: (nextCode: string) => void;
  footerExtra: React.ReactNode;
}> = ({
  code,
  variables = [],
  dataTables = [],
  i18n,
  dialogues = [],
  objects = [],
  onChange,
  footerExtra,
}) => {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const allSuggestions = useMemo<AutocompleteSuggestion[]>(() => {
    const base: AutocompleteSuggestion[] = [
      { insertText: `nexus.vars.get('')`, label: 'nexus.vars.get(nombre)', detail: 'Lee variable global' },
      { insertText: `nexus.vars.set('', 0)`, label: 'nexus.vars.set(nombre, valor)', detail: 'Asigna variable global' },
      { insertText: `nexus.vars.add('', 1)`, label: 'nexus.vars.add(nombre, delta)', detail: 'Suma a variable' },
      { insertText: `nexus.dialogue.start('')`, label: 'nexus.dialogue.start(idONombre)', detail: 'Inicia diálogo ramificado' },
      { insertText: `nexus.data.get('', '')`, label: 'nexus.data.get(tabla, fila)', detail: 'Consulta tabla de datos' },
      { insertText: `nexus.i18n.t('')`, label: 'nexus.i18n.t(clave)', detail: 'Traduce clave i18n' },
      { insertText: `nexus.i18n.setLocale('en')`, label: 'nexus.i18n.setLocale(locale)', detail: 'Cambia idioma (es|en|pt)' },
      { insertText: `nexus.audio.playSfx('', 1, { x: self.x, y: self.y, z: self.z })`, label: 'nexus.audio.playSfx(id, vol, pos?)', detail: 'Audio espacial 2D/3D' },
      { insertText: `nexus.audio.playMusic('')`, label: 'nexus.audio.playMusic(id)', detail: 'Música con crossfade 1.5s' },
      { insertText: `nexus.vfx.emit('explosion', self.x, self.y, 18, self.z)`, label: 'nexus.vfx.emit(preset, x, y, n, z)', detail: 'Emite partículas' },
      { insertText: `nexus.ui.showToast('Mensaje', 'info', 2)`, label: 'nexus.ui.showToast(msg, tipo, seg)', detail: 'Muestra toast HUD' },
      { insertText: `nexus.scene.load('')`, label: 'nexus.scene.load(nombre)', detail: 'Cambia de escena' },
      { insertText: `nexus.emitEvent('')`, label: 'nexus.emitEvent(evento)', detail: 'Emite evento global' },
      { insertText: `nexus.findByName('')`, label: 'nexus.findByName(nombre)', detail: 'Busca objeto en escena' },
      { insertText: `nexus.findByTag('Enemy')`, label: 'nexus.findByTag(etiqueta)', detail: 'Lista objetos por tag' },
      { insertText: `self.getImagePoint('arma')`, label: 'self.getImagePoint(nombre)', detail: 'Coordenadas de ImagePoint 2D' },
      { insertText: `self.anim.play('')`, label: 'self.anim.play(estado)', detail: 'Fuerza estado de animación' },
      { insertText: `self.move(vx, vy, vz)`, label: 'self.move(vx, vy, vz)', detail: 'Mueve objeto' },
    ];
    for (const v of variables) {
      base.push({ insertText: `'${v.name}'`, label: `var: ${v.name}`, detail: `Variable (${v.type})` });
    }
    for (const dt of dataTables) {
      base.push({ insertText: `nexus.data.get('${dt.name}')`, label: `tabla: ${dt.name}`, detail: `${dt.rows.length} filas` });
    }
    for (const dg of dialogues) {
      base.push({ insertText: `nexus.dialogue.start('${dg.id}')`, label: `diálogo: ${dg.name}`, detail: `${dg.nodes.length} nodos` });
    }
    for (const k of Object.keys(i18n?.entries ?? {})) {
      base.push({ insertText: `nexus.i18n.t('${k}')`, label: `@t(${k})`, detail: 'Clave traducción i18n' });
    }
    for (const o of objects.slice(0, 20)) {
      base.push({ insertText: `nexus.findByName('${o.name}')`, label: `obj: ${o.name}`, detail: o.type });
    }
    return base;
  }, [variables, dataTables, i18n, dialogues, objects]);

  const filtered = useMemo(() => {
    const q = prefix.trim().toLowerCase();
    if (!q) return allSuggestions.slice(0, 12);
    return allSuggestions
      .filter((s) => s.label.toLowerCase().includes(q) || s.insertText.toLowerCase().includes(q))
      .slice(0, 12);
  }, [allSuggestions, prefix]);

  const extractPrefixAtCursor = (text: string, pos: number): string => {
    const slice = text.slice(Math.max(0, pos - 40), pos);
    const m = slice.match(/([a-zA-Z0-9_.]+)$/);
    return m ? m[1] : '';
  };

  const applySuggestion = (sug: AutocompleteSuggestion) => {
    const ta = taRef.current;
    const pos = ta?.selectionStart ?? code.length;
    const pfx = extractPrefixAtCursor(code, pos);
    const start = pos - pfx.length;
    const next = code.slice(0, start) + sug.insertText + code.slice(pos);
    onChange(next);
    setMenuOpen(false);
    setTimeout(() => {
      if (taRef.current) {
        const caret = start + sug.insertText.length;
        taRef.current.focus();
        taRef.current.setSelectionRange(caret, caret);
      }
    }, 0);
  };

  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      <textarea
        ref={taRef}
        aria-label="Editor de código JavaScript"
        spellCheck={false}
        value={code}
        onChange={(e) => {
          const val = e.target.value;
          const pos = e.target.selectionStart ?? val.length;
          onChange(val);
          const pfx = extractPrefixAtCursor(val, pos);
          if (pfx.endsWith('nexus.') || pfx.endsWith('self.') || (menuOpen && pfx.length > 0)) {
            setPrefix(pfx);
            setActiveIdx(0);
            setMenuOpen(true);
          } else if (menuOpen && pfx.length === 0) {
            setMenuOpen(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.ctrlKey && e.code === 'Space') {
            e.preventDefault();
            const pos = e.currentTarget.selectionStart ?? code.length;
            setPrefix(extractPrefixAtCursor(code, pos));
            setActiveIdx(0);
            setMenuOpen(true);
            return;
          }
          if (!menuOpen || filtered.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx((i) => (i + 1) % filtered.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            applySuggestion(filtered[Math.min(activeIdx, filtered.length - 1)]);
          } else if (e.key === 'Escape') {
            setMenuOpen(false);
          }
        }}
        className="min-h-0 flex-1 resize-none bg-[#101014] p-3 font-mono text-xs leading-relaxed text-zinc-100 focus:outline-none"
      />

      {menuOpen && filtered.length > 0 && (
        <div
          role="listbox"
          aria-label="Sugerencias de autocompletado"
          className="absolute bottom-10 left-4 z-30 max-h-48 w-96 overflow-y-auto rounded-md border border-indigo-500/50 bg-[#181822]/98 p-1 shadow-2xl"
        >
          <div className="flex items-center justify-between px-2 py-0.5 text-[9.5px] text-zinc-400 border-b border-[#2a2a38] mb-1">
            <span>Autocompletado Nexus API</span>
            <span>Enter/Tab inserta · Esc cierra</span>
          </div>
          {filtered.map((item, idx) => (
            <button
              key={`${item.label}-${idx}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applySuggestion(item);
              }}
              className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-[11px] ${
                idx === activeIdx
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-200 hover:bg-[#242434]'
              }`}
            >
              <span className="truncate font-mono">{item.label}</span>
              <span className={`shrink-0 text-[9.5px] ${idx === activeIdx ? 'text-indigo-100' : 'text-zinc-400'}`}>
                {item.detail}
              </span>
            </button>
          ))}
        </div>
      )}

      {footerExtra}
    </div>
  );
};

export const CodeStudioPanel: React.FC<CodeStudioPanelProps> = ({
  scripts,
  activeScene,
  objects = [],
  selectedObject,
  variables = [],
  dataTables = [],
  i18n,
  dialogues = [],
  onChangeScripts,
  onAttachScriptToScene,
  onDetachScriptFromScene,
  onAttachScriptToObject,
  onDetachScriptFromObject,
  onInsertInterfaceIntoScene,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(scripts[0]?.id ?? null);
  const [filterKind, setFilterKind] = useState<'all' | 'script' | 'interface'>('all');
  const [ifaceTab, setIfaceTab] = useState<'html' | 'css' | 'js' | 'preview'>('html');
  const [newFileName, setNewFileName] = useState<string>('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const sceneObjects = objects.length > 0 ? objects : activeScene?.objects ?? [];
  const [targetObjectId, setTargetObjectId] = useState<string>(
    selectedObject?.id ?? sceneObjects[0]?.id ?? ''
  );

  useEffect(() => {
    if (selectedObject?.id) {
      setTargetObjectId(selectedObject.id);
    }
  }, [selectedObject?.id]);

  const resolvedTargetObj =
    selectedObject ??
    sceneObjects.find((o) => o.id === targetObjectId) ??
    sceneObjects[0] ??
    null;

  const activeScript =
    scripts.find((s) => s.id === selectedId) ?? scripts[0] ?? null;

  const filteredList = useMemo(
    () =>
      scripts.filter((s) => (filterKind === 'all' ? true : s.kind === filterKind)),
    [scripts, filterKind]
  );

  const syntaxStatus = useMemo(() => {
    if (!activeScript) return { valid: true as const };
    if (activeScript.kind === 'interface') {
      if (!activeScript.js?.trim()) return { valid: true as const };
      return validateScriptSyntax(activeScript.js);
    }
    return validateScriptSyntax(activeScript.code);
  }, [activeScript]);

  const parsedParams = useMemo(() => {
    if (!activeScript || activeScript.kind !== 'script') return [];
    return extractScriptParamsSchema(activeScript.code);
  }, [activeScript]);

  const updateActive = (patch: Partial<NexusScriptAsset>) => {
    if (!activeScript) return;
    onChangeScripts(
      scripts.map((s) =>
        s.id === activeScript.id
          ? { ...s, ...patch, updatedAt: Date.now() }
          : s
      )
    );
  };

  const handleCreateEmpty = (kind: 'script' | 'interface') => {
    const idx = scripts.filter((s) => s.kind === kind).length + 1;
    const rawCustom = newFileName.trim();
    const resolvedScriptName = rawCustom
      ? rawCustom.endsWith('.js')
        ? rawCustom
        : `${rawCustom}.js`
      : `Mecanica_${idx}.js`;
    const resolvedIfaceName = rawCustom || `Interfaz_${idx}`;

    const item: NexusScriptAsset =
      kind === 'script'
        ? {
            id: createId('scr'),
            name: resolvedScriptName,
            kind: 'script',
            code: `// @param speed:number=120\nfunction onStart(self, nexus) {\n  // Inicialización\n}\n\nfunction onUpdate(self, dt, nexus) {\n  // Lógica cada fotograma\n}\n`,
            updatedAt: Date.now(),
          }
        : {
            id: createId('ui'),
            name: resolvedIfaceName,
            kind: 'interface',
            code: `<div class="panel-box">\n  <h3>Panel Interactivo</h3>\n  <button type="button" data-nexus-action="event.emit" data-nexus-param="boton_pulsado">Accionar</button>\n</div>`,
            css: `.panel-box {\n  height: 100%;\n  background: rgba(20, 24, 34, 0.94);\n  border: 1px solid #38bdf8;\n  border-radius: 10px;\n  padding: 12px;\n  color: #fff;\n  display: flex;\n  flex-direction: column;\n  justify-content: space-between;\n}\n.panel-box button {\n  background: #0284c7;\n  color: #fff;\n  border: none;\n  border-radius: 6px;\n  padding: 6px 10px;\n  cursor: pointer;\n}`,
            js: '',
            updatedAt: Date.now(),
          };
    onChangeScripts([...scripts, item]);
    setSelectedId(item.id);
    setNewFileName('');
    if (kind === 'interface') setIfaceTab('html');
  };

  const handleCreateFromTemplate = (tpl: ScriptTemplateDef) => {
    const item: NexusScriptAsset = {
      id: createId(tpl.kind === 'script' ? 'scr' : 'ui'),
      name: tpl.name,
      kind: tpl.kind,
      code: tpl.kind === 'interface' ? (tpl.html ?? tpl.code ?? '') : (tpl.code ?? ''),
      css: tpl.css,
      js: tpl.js,
      updatedAt: Date.now(),
    };
    onChangeScripts([...scripts, item]);
    setSelectedId(item.id);
    if (tpl.kind === 'interface') setIfaceTab('html');
  };

  const handleDelete = (id: string) => {
    const next = scripts.filter((s) => s.id !== id);
    onChangeScripts(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const isAttachedToScene = Boolean(
    activeScript && activeScene?.scriptIds?.includes(activeScript.id)
  );
  const isAttachedToObject = Boolean(
    activeScript &&
      resolvedTargetObj?.scriptBindings?.some((b) => b.scriptId === activeScript.id)
  );
  const objectsUsingActiveScript = useMemo(
    () =>
      activeScript
        ? sceneObjects.filter((o) =>
            (o.scriptBindings ?? []).some((b) => b.scriptId === activeScript.id)
          )
        : [],
    [activeScript, sceneObjects]
  );

  return (
    <div className="flex h-full min-h-0">
      {/* Columna izquierda: archivos JS e Interfaces */}
      <div className="flex w-64 shrink-0 flex-col border-r border-[#2b2b33] bg-[#16161a]">
        <div className="space-y-1.5 border-b border-[#2b2b33] p-2">
          <input
            type="text"
            aria-label="Nombre para nuevo script o interfaz"
            placeholder="Nombre opcional (ej. Jefe.js)"
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            className="w-full rounded border border-[#2f2f39] bg-[#111115] px-2 py-1 font-mono text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => handleCreateEmpty('script')}
              className="inline-flex items-center justify-center gap-1 rounded bg-indigo-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500 whitespace-nowrap"
            >
              <Plus className="h-3 w-3" />
              <span>Script JS</span>
            </button>
            <button
              type="button"
              onClick={() => handleCreateEmpty('interface')}
              className="inline-flex items-center justify-center gap-1 rounded bg-cyan-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500 whitespace-nowrap"
            >
              <Layout className="h-3 w-3" />
              <span>+ Interfaz</span>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-0.5 rounded bg-[#111114] p-0.5 text-[10px]">
            {(
              [
                ['all', `Todos (${scripts.length})`],
                ['script', 'JS'],
                ['interface', 'UI HTML'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilterKind(k)}
                className={`rounded py-0.5 font-medium ${
                  filterKind === k
                    ? 'bg-[#262630] text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {filteredList.length === 0 ? (
            <div className="space-y-2 p-2">
              <p className="text-[11px] text-zinc-400">
                Crea scripts JavaScript o interfaces HTML/CSS animadas desde una plantilla:
              </p>
              {CODE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleCreateFromTemplate(tpl)}
                  className="w-full rounded border border-[#2d2d37] bg-[#1e1e25] p-1.5 text-left hover:border-cyan-500/60"
                >
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-100">
                    <Sparkles className="h-3 w-3 text-cyan-400 shrink-0" />
                    <span className="truncate">{tpl.name}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-400 line-clamp-2">
                    {tpl.description}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <>
              {filteredList.map((item) => {
                const isSelected = activeScript?.id === item.id;
                const isRenaming = renamingId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-1 rounded border px-2 py-1.5 text-xs ${
                      isSelected
                        ? 'border-cyan-500/60 bg-cyan-500/15 text-white'
                        : 'border-[#272730] bg-[#1c1c21] text-zinc-300 hover:border-zinc-600'
                    }`}
                  >
                    {isRenaming ? (
                      <input
                        type="text"
                        autoFocus
                        aria-label={`Renombrar ${item.name}`}
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={() => {
                          const clean = renameDraft.trim();
                          if (clean) {
                            onChangeScripts(
                              scripts.map((s) =>
                                s.id === item.id ? { ...s, name: clean, updatedAt: Date.now() } : s
                              )
                            );
                          }
                          setRenamingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        className="min-w-0 flex-1 rounded border border-cyan-500 bg-[#111115] px-1.5 py-0.5 font-mono text-[11px] text-white outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        {item.kind === 'interface' ? (
                          <Layout className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                        ) : (
                          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                        )}
                        <span className="truncate font-mono text-[11px]">{item.name}</span>
                      </button>
                    )}
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(item.id);
                          setRenameDraft(item.name);
                        }}
                        aria-label={`Renombrar archivo ${item.name}`}
                        className="rounded p-1 text-zinc-500 hover:bg-cyan-500/15 hover:text-cyan-300"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        aria-label={`Eliminar archivo ${item.name}`}
                        className="rounded p-1 text-zinc-500 hover:bg-red-500/15 hover:text-red-400"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="pt-2 border-t border-[#26262f]">
                <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Plantillas listas
                </div>
                <div className="space-y-1">
                  {CODE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleCreateFromTemplate(tpl)}
                      className="flex w-full items-center gap-1.5 rounded border border-[#292932] bg-[#1a1a20] px-2 py-1 text-left text-[10px] text-zinc-300 hover:border-cyan-500/50 hover:text-white"
                    >
                      <Sparkles className="h-3 w-3 shrink-0 text-amber-400" />
                      <span className="truncate">+ {tpl.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Columna derecha: editor de código + acciones de vinculación */}
      <div className="flex min-w-0 flex-1 flex-col bg-[#131317]">
        {!activeScript ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-zinc-400">
            <Code2 className="h-7 w-7 text-indigo-400" />
            <p className="max-w-md">
              Crea scripts JavaScript para dar comportamientos ilimitados a escenas y objetos, o diseña interfaces HTML/CSS/JS animadas e insértalas como gráficos interactivos seleccionables en el escenario.
            </p>
          </div>
        ) : (
          <>
            {/* Cabecera del archivo */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#282832] bg-[#17171d] px-3 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  type="text"
                  aria-label="Nombre del archivo de código"
                  value={activeScript.name}
                  onChange={(e) => updateActive({ name: e.target.value })}
                  className="w-48 rounded border border-[#32323c] bg-[#121216] px-2 py-1 font-mono text-xs text-zinc-100 focus:border-cyan-500 focus:outline-none"
                />

                {syntaxStatus.valid ? (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    Sintaxis OK
                  </span>
                ) : (
                  <span
                    title={syntaxStatus.error}
                    className="inline-flex max-w-xs items-center gap-1 truncate rounded bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300"
                  >
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{syntaxStatus.error}</span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {activeScript.kind === 'script' ? (
                  <>
                    {onAttachScriptToScene && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isAttachedToScene) {
                            onDetachScriptFromScene?.(activeScript.id);
                          } else {
                            onAttachScriptToScene(activeScript.id);
                          }
                        }}
                        title={
                          isAttachedToScene
                            ? 'Clic para desvincular de la escena actual'
                            : 'Adjuntar este script al ciclo de la escena actual'
                        }
                        className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
                          isAttachedToScene
                            ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/35'
                            : 'bg-[#262632] text-zinc-200 hover:bg-[#323242]'
                        }`}
                      >
                        <Link2 className="h-3 w-3" />
                        <span>
                          {isAttachedToScene ? 'Adjunto a Escena ✓' : 'Adjuntar a Escena'}
                        </span>
                      </button>
                    )}
                    {onAttachScriptToObject && (
                      <div className="flex items-center gap-1">
                        {sceneObjects.length > 0 && (
                          <select
                            aria-label="Objeto destino para script"
                            value={resolvedTargetObj?.id ?? ''}
                            onChange={(e) => setTargetObjectId(e.target.value)}
                            className="max-w-[140px] rounded border border-[#32323c] bg-[#121216] px-1.5 py-1 text-[11px] text-zinc-100"
                          >
                            {sceneObjects.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          disabled={!resolvedTargetObj}
                          onClick={() => {
                            if (!resolvedTargetObj) return;
                            if (isAttachedToObject && onDetachScriptFromObject) {
                              onDetachScriptFromObject(resolvedTargetObj.id, activeScript.id);
                            } else {
                              onAttachScriptToObject(resolvedTargetObj.id, activeScript.id);
                            }
                          }}
                          title={
                            resolvedTargetObj
                              ? isAttachedToObject
                                ? `Quitar de "${resolvedTargetObj.name}"`
                                : `Adjuntar a "${resolvedTargetObj.name}"`
                              : 'Crea o selecciona un objeto en el escenario'
                          }
                          className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap disabled:opacity-40 ${
                            isAttachedToObject
                              ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                              : 'bg-indigo-600/80 text-white hover:bg-indigo-500'
                          }`}
                        >
                          <Link2 className="h-3 w-3" />
                          <span>
                            {resolvedTargetObj
                              ? isAttachedToObject
                                ? `Adjunto a ${resolvedTargetObj.name} ✓`
                                : `Adjuntar a ${resolvedTargetObj.name}`
                              : 'Sin objetos'}
                          </span>
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex rounded bg-[#111115] p-0.5 text-[10px]">
                      {(
                        [
                          ['html', 'HTML'],
                          ['css', 'CSS Animado'],
                          ['js', 'JS Eventos'],
                          ['preview', 'Vista'],
                        ] as const
                      ).map(([tabId, label]) => (
                        <button
                          key={tabId}
                          type="button"
                          onClick={() => setIfaceTab(tabId)}
                          className={`rounded px-2 py-0.5 font-semibold ${
                            ifaceTab === tabId
                              ? 'bg-cyan-600 text-white'
                              : 'text-zinc-400 hover:text-zinc-100'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {onInsertInterfaceIntoScene && (
                      <button
                        type="button"
                        onClick={() => onInsertInterfaceIntoScene(activeScript)}
                        className="inline-flex items-center gap-1 rounded bg-cyan-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500 whitespace-nowrap"
                      >
                        <Play className="h-3 w-3" />
                        <span>Insertar en escena como gráfico seleccionable</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Área principal de edición */}
            <div className="flex min-h-0 flex-1 overflow-hidden">
              {activeScript.kind === 'script' ? (
                <ScriptCodeEditorWithAutocomplete
                  code={activeScript.code}
                  variables={variables}
                  dataTables={dataTables}
                  i18n={i18n}
                  dialogues={dialogues}
                  objects={objects}
                  onChange={(nextCode) => updateActive({ code: nextCode })}
                  footerExtra={
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#25252f] bg-[#15151a] px-3 py-1">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-zinc-500 mr-1">API rápida (Ctrl+Espacio autocompleta):</span>
                        {API_CHIPS.map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() =>
                              updateActive({
                                code: `${activeScript.code}\n// ${chip.snippet}`,
                              })
                            }
                            className="rounded border border-[#2d2d37] bg-[#1e1e26] px-1.5 py-0.5 font-mono text-[10px] text-indigo-300 hover:border-indigo-500"
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                      {(isAttachedToScene || objectsUsingActiveScript.length > 0) && (
                        <div className="flex flex-wrap items-center gap-1 text-[10px]">
                          <span className="text-zinc-500">Asociado a:</span>
                          {isAttachedToScene && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300 border border-emerald-500/30">
                              Escena ({activeScene?.name})
                              {onDetachScriptFromScene && (
                                <button
                                  type="button"
                                  aria-label="Quitar de escena"
                                  onClick={() => onDetachScriptFromScene(activeScript.id)}
                                  className="hover:text-white"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              )}
                            </span>
                          )}
                          {objectsUsingActiveScript.map((objItem) => (
                            <span
                              key={objItem.id}
                              className="inline-flex items-center gap-1 rounded bg-indigo-500/20 px-1.5 py-0.5 text-indigo-200 border border-indigo-500/35"
                            >
                              {objItem.name}
                              {onDetachScriptFromObject && (
                                <button
                                  type="button"
                                  aria-label={`Quitar de ${objItem.name}`}
                                  onClick={() => onDetachScriptFromObject(objItem.id, activeScript.id)}
                                  className="hover:text-white"
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                      {parsedParams.length > 0 && (
                        <span className="text-[10px] text-emerald-300">
                          Params: {parsedParams.map((p) => p.name).join(', ')}
                        </span>
                      )}
                      </div>
                    </div>
                  }
                />
              ) : ifaceTab === 'preview' ? (
                <div className="flex flex-1 items-center justify-center bg-[#0d0e12] p-4 overflow-auto">
                  <div
                    data-nx-widget="code-studio-preview"
                    className="h-44 w-96 max-w-full rounded"
                  >
                    <style>{scopeWidgetCss(activeScript.css ?? '', 'code-studio-preview')}</style>
                    <div
                      className="h-full w-full"
                      dangerouslySetInnerHTML={{ __html: activeScript.code ?? '' }}
                    />
                  </div>
                </div>
              ) : (
                <textarea
                  aria-label={`Editor de interfaz ${ifaceTab.toUpperCase()}`}
                  spellCheck={false}
                  value={
                    ifaceTab === 'html'
                      ? activeScript.code ?? ''
                      : ifaceTab === 'css'
                        ? activeScript.css ?? ''
                        : activeScript.js ?? ''
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (ifaceTab === 'html') updateActive({ code: val });
                    else if (ifaceTab === 'css') updateActive({ css: val });
                    else updateActive({ js: val });
                  }}
                  className="min-h-0 flex-1 resize-none bg-[#101014] p-3 font-mono text-xs leading-relaxed text-zinc-100 focus:outline-none"
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
