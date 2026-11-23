import React, { useEffect, useMemo, useRef } from 'react';
import {
  AudioBusSettings,
  CameraState,
  DataTableDef,
  GameObjectData,
  I18nConfig,
  I18nLocale,
  StageResolution,
} from '../../engine/core/types';
import { queryDataTable, resolveI18nText } from '../../engine/data/dataTableI18n';
import {
  compileInterfaceWidgetScript,
  executeDeclarativeWidgetAction,
  type WidgetBridgeCallbacks,
} from '../../engine/scripting/scriptRuntime';

interface UIWidgetOverlayLayerProps {
  mode: 'editor' | 'preview';
  projectMode: '2d' | '3d';
  objects: GameObjectData[];
  stage: StageResolution;
  camera?: CameraState;
  viewportWidth: number;
  viewportHeight: number;
  selectedIds?: string[];
  variables?: Map<string, unknown>;
  audioBuses?: AudioBusSettings;
  hiddenWidgetIds?: Set<string>;
  dataTables?: DataTableDef[];
  i18n?: I18nConfig;
  locale?: I18nLocale;
  onSelectObject?: (id: string, additive: boolean) => void;
  onMoveWidget?: (id: string, nextX: number, nextY: number, commit: boolean) => void;
  onWidgetBridge?: WidgetBridgeCallbacks;
}

/**
 * Aisla selectores CSS simples bajo el atributo data-nx-widget="id" para evitar
 * contaminación con los estilos del editor mientras conserva @keyframes y @media.
 */
export function scopeWidgetCss(rawCss: string, scopeAttr: string): string {
  if (!rawCss || !rawCss.trim()) return '';
  const scopePrefix = `[data-nx-widget="${scopeAttr}"]`;
  return rawCss.replace(/(^|\})\s*([^{}@]+)\{/g, (_m, brace, selectorGroup: string) => {
    const trimmed = selectorGroup.trim();
    if (!trimmed) return `${brace} {`;
    if (/^(from|to|\d+%)$/.test(trimmed)) {
      return `${brace}\n${trimmed} {`;
    }
    const scopedSelectors = trimmed
      .split(',')
      .map((s) => {
        const part = s.trim();
        if (!part) return '';
        if (part === ':host' || part === ':root' || part === 'body') {
          return scopePrefix;
        }
        if (part.includes(scopePrefix)) return part;
        return `${scopePrefix} ${part}`;
      })
      .filter(Boolean)
      .join(', ');
    return `${brace}\n${scopedSelectors} {`;
  });
}

interface WidgetRuntimeMountProps {
  widget: GameObjectData;
  mode: 'editor' | 'preview';
  variables?: Map<string, unknown>;
  audioBuses?: AudioBusSettings;
  dataTables?: DataTableDef[];
  i18n?: I18nConfig;
  locale?: I18nLocale;
  bridge?: WidgetBridgeCallbacks;
}

const WidgetHtmlMount: React.FC<WidgetRuntimeMountProps> = ({
  widget,
  mode,
  variables,
  audioBuses,
  dataTables,
  i18n,
  locale,
  bridge,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;

  const uiCfg = widget.uiWidget;
  const scopedCss = useMemo(
    () => scopeWidgetCss(uiCfg?.css ?? '', widget.id),
    [uiCfg?.css, widget.id]
  );
  const processedHtml = useMemo(() => {
    let raw = uiCfg?.html ?? '';
    if (i18n) {
      raw = raw.replace(/@t\(([^)]+)\)/g, (_m, k) =>
        resolveI18nText(i18n, String(k).trim(), locale)
      );
    }
    return raw;
  }, [uiCfg?.html, i18n, locale]);

  // Montar HTML y script JS en preview (en editor solo render visual + CSS animado seguro)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !uiCfg) return;

    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (mode !== 'preview') {
      return;
    }

    const onClick = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      const callEl = target?.closest<HTMLElement>('[data-nexus-call]');
      if (callEl) {
        const callSpec = callEl.getAttribute('data-nexus-call')?.trim();
        if (callSpec) {
          ev.stopPropagation();
          const dotIdx = callSpec.indexOf('.');
          if (dotIdx > 0) {
            const objRef = callSpec.slice(0, dotIdx).trim();
            const method = callSpec.slice(dotIdx + 1).trim();
            const rawArg = callEl.getAttribute('data-nexus-arg');
            const arg =
              rawArg !== null && rawArg !== '' && !Number.isNaN(Number(rawArg))
                ? Number(rawArg)
                : rawArg ?? undefined;
            executeDeclarativeWidgetAction(
              {
                action: 'script.call',
                param: `${objRef}:${method}`,
                value: arg !== undefined ? String(arg) : undefined,
                objectId: widget.id,
              },
              bridgeRef.current
            );
          }
          return;
        }
      }
      const actionEl = target?.closest<HTMLElement>('[data-nexus-action]');
      if (!actionEl) return;
      const act = actionEl.getAttribute('data-nexus-action');
      if (!act) return;
      ev.stopPropagation();
      const param = actionEl.getAttribute('data-nexus-param') ?? undefined;
      const value = actionEl.getAttribute('data-nexus-value') ?? undefined;
      executeDeclarativeWidgetAction(
        {
          action: act,
          param,
          value,
          objectId: widget.id,
        },
        bridgeRef.current
      );
    };

    const onInput = (ev: Event) => {
      const target = ev.target as HTMLInputElement | null;
      if (!target) return;
      const bus = target.getAttribute('data-nexus-audio-bus') as
        | 'master'
        | 'music'
        | 'sfx'
        | 'ui'
        | null;
      if (bus) {
        const val = Number(target.value);
        if (Number.isFinite(val)) {
          bridgeRef.current?.onAudioBusVolume?.(bus, val);
        }
        return;
      }
      const varName = target.getAttribute('data-nexus-bind-var');
      if (varName) {
        const num = Number(target.value);
        bridgeRef.current?.onSetVariable?.(
          varName,
          target.type === 'range' || target.type === 'number' ? num : target.value
        );
      }
    };

    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);

    // Ejecutar script propio del widget si existe
    if (uiCfg.js && uiCfg.js.trim()) {
      const apiBridge = {
        objectId: widget.id,
        setVar: (name: string, value: string | number | boolean) =>
          bridgeRef.current?.onSetVariable?.(name, value),
        addVar: (name: string, delta: number) =>
          bridgeRef.current?.onAddVariable?.(name, delta),
        getVar: (name: string) => bridgeRef.current?.onGetVariable?.(name),
        playAudio: (idOrPreset: string, channel?: 'sfx' | 'music' | 'ui') =>
          bridgeRef.current?.onPlayAudio?.(idOrPreset, channel),
        setBusVolume: (bus: 'master' | 'music' | 'sfx' | 'ui', vol: number) =>
          bridgeRef.current?.onAudioBusVolume?.(bus, vol),
        loadScene: (sceneNameOrId: string) =>
          bridgeRef.current?.onLoadScene?.(sceneNameOrId),
        restartScene: () => bridgeRef.current?.onRestartScene?.(),
        togglePause: () => bridgeRef.current?.onPauseToggle?.(),
        emit: (eventName: string) => bridgeRef.current?.onEmitEvent?.(eventName),
        close: () => bridgeRef.current?.onToggleInterface?.(widget.id, false),
      };
      const compiled = compileInterfaceWidgetScript(uiCfg.js);
      if (compiled.fn) {
        try {
          const maybeCleanup = compiled.fn(el, apiBridge);
          if (typeof maybeCleanup === 'function') {
            cleanupRef.current = maybeCleanup;
          }
        } catch {
          // Mantener preview estable ante errores en scripts de usuario
        }
      }
    }

    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('input', onInput);
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [mode, uiCfg, widget.id]);

  // Sincronización reactiva DOM de variables [data-nexus-var], barras, tablas repeat, i18n y sliders de audio
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (mode === 'preview' && typeof window !== 'undefined') {
      const wAny = window as unknown as Record<string, unknown>;
      wAny.NexusData = {
        getTable: (name: string) => queryDataTable(dataTables, name),
        getRow: (name: string, key: string | number) => queryDataTable(dataTables, name, key),
      };
      wAny.NexusI18n = {
        locale: locale ?? i18n?.defaultLocale ?? 'es',
        t: (key: string) => resolveI18nText(i18n, key, locale),
      };
    }

    if (dataTables && dataTables.length > 0) {
      el.querySelectorAll<HTMLElement>('[data-nexus-repeat]').forEach((host) => {
        const tblName = host.getAttribute('data-nexus-repeat');
        if (!tblName) return;
        const rows = queryDataTable(dataTables, tblName);
        if (!Array.isArray(rows)) return;
        let tplHtml = host.dataset.nexusRepeatTpl;
        if (!tplHtml) {
          const tplChild = host.querySelector<HTMLElement>('[data-nexus-row]') ?? (host.firstElementChild as HTMLElement | null);
          if (!tplChild) return;
          tplHtml = tplChild.outerHTML;
          host.dataset.nexusRepeatTpl = tplHtml;
        }
        host.innerHTML = rows
          .map((row: Record<string, unknown>) =>
            tplHtml!.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_m, col) =>
              row[col] !== undefined && row[col] !== null ? String(row[col]) : ''
            )
          )
          .join('');
      });
    }

    if (i18n) {
      el.querySelectorAll<HTMLElement>('[data-nexus-i18n]').forEach((node) => {
        const key = node.getAttribute('data-nexus-i18n');
        if (key) {
          node.textContent = resolveI18nText(i18n, key, locale);
        }
      });
    }

    if (variables) {
      el.querySelectorAll<HTMLElement>('[data-nexus-var]').forEach((node) => {
        const key = node.getAttribute('data-nexus-var');
        if (!key) return;
        const val = variables.get(key);
        if (val !== undefined) {
          node.textContent = String(val);
        }
      });

      el.querySelectorAll<HTMLElement>('[data-nexus-inv]').forEach((node) => {
        const itemId = node.getAttribute('data-nexus-inv');
        if (!itemId) return;
        const count = Number(variables.get(`inv_${itemId}`) ?? 0);
        node.textContent = String(Number.isFinite(count) ? count : 0);
      });

      el.querySelectorAll<HTMLElement>('[data-nexus-progress]').forEach((bar) => {
        const key = bar.getAttribute('data-nexus-progress');
        if (!key) return;
        const max = Number(bar.getAttribute('data-nexus-max') || 100);
        const cur = Number(variables.get(key) ?? 0);
        const pct = Math.max(0, Math.min(100, (cur / Math.max(1, max)) * 100));
        bar.style.width = `${pct}%`;
      });
    }

    if (audioBuses) {
      el.querySelectorAll<HTMLInputElement>('input[data-nexus-audio-bus]').forEach((slider) => {
        const bus = slider.getAttribute('data-nexus-audio-bus') as
          | 'master'
          | 'music'
          | 'sfx'
          | 'ui'
          | null;
        if (!bus) return;
        const busVol = audioBuses[bus];
        if (typeof busVol === 'number' && document.activeElement !== slider) {
          slider.value = String(busVol);
        }
      });
    }
  }, [variables, audioBuses, processedHtml, dataTables, i18n, locale, mode]);

  if (!uiCfg) return null;

  return (
    <div
      ref={containerRef}
      data-nx-widget={widget.id}
      className="h-full w-full overflow-hidden"
      style={{ opacity: widget.opacity }}
    >
      {scopedCss && <style>{scopedCss}</style>}
      <div
        className="h-full w-full"
        // Contenido HTML autogenerado por el creador dentro del editor del proyecto
        dangerouslySetInnerHTML={{ __html: processedHtml }}
      />
    </div>
  );
};

export const UIWidgetOverlayLayer: React.FC<UIWidgetOverlayLayerProps> = ({
  mode,
  projectMode,
  objects,
  stage,
  camera,
  viewportWidth,
  viewportHeight,
  selectedIds = [],
  variables,
  audioBuses,
  hiddenWidgetIds,
  dataTables,
  i18n,
  locale,
  onSelectObject,
  onMoveWidget,
  onWidgetBridge,
}) => {
  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    scaleX: number;
    scaleY: number;
    moved: boolean;
  } | null>(null);

  const widgets = useMemo(
    () =>
      objects.filter(
        (o) =>
          o.type === 'ui_widget' &&
          o.uiWidget &&
          o.visible &&
          !(mode === 'preview' && o.uiWidget.visibleAtStart === false && hiddenWidgetIds === undefined) &&
          !(hiddenWidgetIds?.has(o.id))
      ),
    [objects, mode, hiddenWidgetIds]
  );

  if (widgets.length === 0) return null;

  const selectedSet = new Set(selectedIds);

  const computeScreenBox = (obj: GameObjectData) => {
    const w = Math.max(24, obj.transform.width * Math.abs(obj.transform.scaleX));
    const h = Math.max(24, obj.transform.height * Math.abs(obj.transform.scaleY));
    const fixed = obj.uiWidget?.fixedToScreen || projectMode === '3d';

    if (fixed || !camera) {
      const sx = viewportWidth > 0 ? viewportWidth / Math.max(1, stage.width) : 1;
      const sy = viewportHeight > 0 ? viewportHeight / Math.max(1, stage.height) : 1;
      const uniform = Math.min(sx, sy);
      const offsetX = (viewportWidth - stage.width * uniform) * 0.5;
      const offsetY = (viewportHeight - stage.height * uniform) * 0.5;
      return {
        left: offsetX + (obj.transform.x - w * obj.transform.anchorX) * uniform,
        top: offsetY + (obj.transform.y - h * obj.transform.anchorY) * uniform,
        width: w * uniform,
        height: h * uniform,
        scaleFactor: uniform,
      };
    }

    const leftStage = obj.transform.x - w * obj.transform.anchorX;
    const topStage = obj.transform.y - h * obj.transform.anchorY;
    return {
      left: leftStage * camera.zoom + camera.x,
      top: topStage * camera.zoom + camera.y,
      width: w * camera.zoom,
      height: h * camera.zoom,
      scaleFactor: camera.zoom,
    };
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 25 }}
      data-testid="nexus-ui-widget-layer"
    >
      {widgets.map((widget) => {
        const box = computeScreenBox(widget);
        const isSelected = selectedSet.has(widget.id);
        const canInteract = mode === 'editor' || widget.uiWidget?.interactive !== false;
        const zOrder = widget.uiWidget?.zIndex ?? 10;

        return (
          <div
            key={widget.id}
            style={{
              position: 'absolute',
              left: `${box.left}px`,
              top: `${box.top}px`,
              width: `${box.width}px`,
              height: `${box.height}px`,
              transform: widget.transform.rotation
                ? `rotate(${widget.transform.rotation}deg)`
                : undefined,
              transformOrigin: `${widget.transform.anchorX * 100}% ${widget.transform.anchorY * 100}%`,
              zIndex: zOrder,
              pointerEvents: canInteract ? 'auto' : 'none',
            }}
            onPointerDown={(e) => {
              if (mode !== 'editor') return;
              if (e.button !== 0) return;
              e.stopPropagation();
              onSelectObject?.(widget.id, e.shiftKey || e.ctrlKey || e.metaKey);
              if (widget.locked) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              dragRef.current = {
                id: widget.id,
                startClientX: e.clientX,
                startClientY: e.clientY,
                startX: widget.transform.x,
                startY: widget.transform.y,
                scaleX: Math.max(0.05, box.scaleFactor),
                scaleY: Math.max(0.05, box.scaleFactor),
                moved: false,
              };
            }}
            onPointerMove={(e) => {
              if (mode !== 'editor') return;
              const d = dragRef.current;
              if (!d || d.id !== widget.id) return;
              const dx = (e.clientX - d.startClientX) / d.scaleX;
              const dy = (e.clientY - d.startClientY) / d.scaleY;
              if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true;
              if (d.moved) {
                onMoveWidget?.(widget.id, Math.round(d.startX + dx), Math.round(d.startY + dy), false);
              }
            }}
            onPointerUp={(e) => {
              if (mode !== 'editor') return;
              const d = dragRef.current;
              if (!d || d.id !== widget.id) return;
              dragRef.current = null;
              if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
              }
              if (d.moved) {
                const dx = (e.clientX - d.startClientX) / d.scaleX;
                const dy = (e.clientY - d.startClientY) / d.scaleY;
                onMoveWidget?.(widget.id, Math.round(d.startX + dx), Math.round(d.startY + dy), true);
              }
            }}
            className={`group rounded transition-shadow ${
              mode === 'editor'
                ? isSelected
                  ? 'ring-2 ring-cyan-400 shadow-lg cursor-move'
                  : 'ring-1 ring-white/20 hover:ring-cyan-400/70 cursor-pointer'
                : ''
            }`}
          >
            {mode === 'editor' && (
              <div
                className={`pointer-events-none absolute -top-5 left-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
                  isSelected
                    ? 'bg-cyan-500 text-zinc-950'
                    : 'bg-[#1a1a22]/90 text-cyan-300 opacity-0 group-hover:opacity-100'
                }`}
              >
                <span>{widget.name}</span>
              </div>
            )}

            <WidgetHtmlMount
              widget={widget}
              mode={mode}
              variables={variables}
              audioBuses={audioBuses}
              dataTables={dataTables}
              i18n={i18n}
              locale={locale}
              bridge={onWidgetBridge}
            />
          </div>
        );
      })}
    </div>
  );
};
