import React, { useEffect, useRef, useState } from 'react';
import { Grid3X3, Magnet, Maximize2, Minus, Plus, Scan } from 'lucide-react';
import {
  degToRad,
  getWorldTransform,
  normalizeDegrees,
  radToDeg,
  screenToStage,
  snapValue,
  stageDeltaToParentLocal,
} from '../../engine/core/math';
import { buildObjectMap, updateObjectById } from '../../engine/core/sceneGraph';
import type {
  CameraState,
  EditorTool,
  GameObjectData,
  SceneData,
  StageResolution,
} from '../../engine/core/types';
import { fitCameraToViewport, zoomCameraAtPoint } from '../../engine/camera/camera2d';
import { createDefaultColliderForObject } from '../../engine/physics/collision2d';
import {
  applyAutotile4Bit,
  floodFillTilemap,
  paintRectTilemap,
} from '../../engine/tilemap/autotile2d';
import {
  computeColliderHandles,
  computeGizmoHandles,
  hitTestColliderHandle,
  hitTestGizmoHandle,
  pickTopObjectAt,
  type ColliderHandleType,
  type GizmoHandleType,
} from '../../engine/renderer2d/hitTest';
import { PixiStageRenderer } from '../../engine/renderer2d/PixiStageRenderer';
import { roundTo } from '../../utils/format';
import { StageRulers } from './StageRulers';
import { UIWidgetOverlayLayer } from '../widgets/UIWidgetOverlayLayer';

interface CanvasViewportProps {
  scene: SceneData;
  stage: StageResolution;
  backgroundColor: string;
  selectedIds: string[];
  activeTool: EditorTool;
  camera: CameraState;
  assetBlobs: Map<string, Blob>;
  fitRequestTick: number;
  onCameraChange: (camera: CameraState) => void;
  onSelectObjects: (ids: string[]) => void;
  onPreviewObjectsChange: (objects: GameObjectData[]) => void;
  onCommitObjectsChange: (objects: GameObjectData[]) => void;
  onUpdateScene: (updater: (scene: SceneData) => SceneData) => void;
  onDropAssetAt: (assetId: string, stageX: number, stageY: number) => void;
  onPointerCoordsChange: (coords: { x: number; y: number } | null) => void;
}

type DragSession =
  | {
      kind: 'pan';
      startScreenX: number;
      startScreenY: number;
      startCamX: number;
      startCamY: number;
    }
  | {
      kind: 'move';
      startStageX: number;
      startStageY: number;
      axisLock: 'free' | 'x' | 'y';
      initialObjects: GameObjectData[];
      movedIds: string[];
      changed: boolean;
    }
  | {
      kind: 'scale';
      handleType: GizmoHandleType;
      targetId: string;
      startStageX: number;
      startStageY: number;
      initialObjects: GameObjectData[];
      initialObj: GameObjectData;
      changed: boolean;
    }
  | {
      kind: 'rotate';
      targetId: string;
      centerStageX: number;
      centerStageY: number;
      startPointerAngle: number;
      initialRotation: number;
      initialObjects: GameObjectData[];
      changed: boolean;
    }
  | {
      kind: 'tilepaint';
      targetId: string;
      erase: boolean;
      changed: boolean;
      lastCellKey: string | null;
      brushMode: 'single' | 'rect' | 'bucket' | 'autotile';
      startCol: number;
      startRow: number;
      curCol: number;
      curRow: number;
    }
  | {
      kind: 'collider';
      handleType: ColliderHandleType;
      targetId: string;
      startStageX: number;
      startStageY: number;
      initialObjects: GameObjectData[];
      initialObj: GameObjectData;
      changed: boolean;
    };

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  scene,
  stage,
  backgroundColor,
  selectedIds,
  activeTool,
  camera,
  assetBlobs,
  fitRequestTick,
  onCameraChange,
  onSelectObjects,
  onPreviewObjectsChange,
  onCommitObjectsChange,
  onUpdateScene,
  onDropAssetAt,
  onPointerCoordsChange,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiStageRenderer | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const spaceHeldRef = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [tileRectOverlay, setTileRectOverlay] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    erase: boolean;
  } | null>(null);
  const [isDragAssetOver, setIsDragAssetOver] = useState(false);
  const [showDebugColliders, setShowDebugColliders] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  // Refs para acceder siempre al estado más reciente dentro de handlers nativos
  const latestRef = useRef({
    scene,
    stage,
    backgroundColor,
    selectedIds,
    activeTool,
    camera,
    assetBlobs,
    onCameraChange,
    onSelectObjects,
    onPreviewObjectsChange,
    onCommitObjectsChange,
  });
  latestRef.current = {
    scene,
    stage,
    backgroundColor,
    selectedIds,
    activeTool,
    camera,
    assetBlobs,
    onCameraChange,
    onSelectObjects,
    onPreviewObjectsChange,
    onCommitObjectsChange,
  };

  // Inicializar PixiJS v8 una única vez y observar tamaño del contenedor
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let mounted = true;
    const renderer = new PixiStageRenderer(host, 'editor');
    rendererRef.current = renderer;

    renderer.init().then(() => {
      if (!mounted) return;
      const rect = host.getBoundingClientRect();
      const initialCam = fitCameraToViewport(rect.width, rect.height, latestRef.current.stage);
      latestRef.current.onCameraChange(initialCam);
      renderer.updateState({
        scene: latestRef.current.scene,
        stage: latestRef.current.stage,
        backgroundColor: latestRef.current.backgroundColor,
        camera: initialCam,
        selectedIds: latestRef.current.selectedIds,
        tool: latestRef.current.activeTool,
        assetBlobs: latestRef.current.assetBlobs,
      });
    });

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setViewportSize({ width, height });
        renderer.resize(width, height);
      }
    });
    ro.observe(host);

    return () => {
      mounted = false;
      ro.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Sincronizar estado hacia PixiJS en cada cambio
  useEffect(() => {
    rendererRef.current?.updateState({
      scene,
      stage,
      backgroundColor,
      camera,
      selectedIds,
      tool: activeTool,
      assetBlobs,
      showDebugColliders,
    });
  }, [scene, stage, backgroundColor, camera, selectedIds, activeTool, assetBlobs, showDebugColliders]);

  // Ajustar cámara al escenario cuando el usuario pulsa "Ajustar"
  useEffect(() => {
    if (fitRequestTick === 0) return;
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    onCameraChange(fitCameraToViewport(rect.width, rect.height, stage));
  }, [fitRequestTick, stage, onCameraChange]);

  // Barra espaciadora para paneo temporal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.code === 'Space' && !spaceHeldRef.current) {
        spaceHeldRef.current = true;
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const getLocalScreenCoords = (clientX: number, clientY: number) => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const pt = getLocalScreenCoords(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    onCameraChange(zoomCameraAtPoint(camera, camera.zoom * factor, pt.x, pt.y));
  };

  const getTilemapCellCoords = (
    stageX: number,
    stageY: number,
    target: GameObjectData,
    objectMap: Map<string, GameObjectData>
  ): { col: number; row: number; cellKey: string } | null => {
    if (target.type !== 'tilemap' || !target.tilemap || target.locked) return null;
    const world = getWorldTransform(target, objectMap);
    const rad = -degToRad(world.rotation);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = stageX - world.x;
    const dy = stageY - world.y;
    const sx = Math.abs(world.scaleX) < 0.0001 ? 1 : world.scaleX;
    const sy = Math.abs(world.scaleY) < 0.0001 ? 1 : world.scaleY;
    const localX = (dx * cos - dy * sin) / sx;
    const localY = (dx * sin + dy * cos) / sy;

    const tm = target.tilemap;
    const mapW = tm.cols * tm.tileWidth;
    const mapH = tm.rows * tm.tileHeight;
    const ox = -mapW * target.transform.anchorX;
    const oy = -mapH * target.transform.anchorY;

    const col = Math.floor((localX - ox) / Math.max(1, tm.tileWidth));
    const row = Math.floor((localY - oy) / Math.max(1, tm.tileHeight));
    if (col < 0 || row < 0 || col >= tm.cols || row >= tm.rows) return null;
    return { col, row, cellKey: `${col},${row}` };
  };

  const paintTileAt = (
    stageX: number,
    stageY: number,
    targetId: string,
    erase: boolean,
    objects: GameObjectData[],
    modeOverride?: 'single' | 'bucket' | 'autotile'
  ): { nextObjects: GameObjectData[]; changed: boolean; cellKey: string | null; col: number; row: number } => {
    const objectMap = buildObjectMap(objects);
    const target = objectMap.get(targetId);
    if (!target || target.type !== 'tilemap' || !target.tilemap || target.locked) {
      return { nextObjects: objects, changed: false, cellKey: null, col: -1, row: -1 };
    }
    const coords = getTilemapCellCoords(stageX, stageY, target, objectMap);
    if (!coords) {
      return { nextObjects: objects, changed: false, cellKey: null, col: -1, row: -1 };
    }

    const tm = target.tilemap;
    const { col, row, cellKey } = coords;
    const useAutotile = modeOverride === 'autotile' || Boolean(tm.autotileEnabled);
    const effMode = modeOverride ?? (useAutotile ? 'autotile' : 'single');

    if (effMode === 'bucket') {
      const nextCells = floodFillTilemap(tm, col, row, erase, useAutotile);
      const nextObjects = updateObjectById(objects, targetId, (prev) =>
        prev.tilemap ? { ...prev, tilemap: { ...prev.tilemap, cells: nextCells } } : prev
      );
      return { nextObjects, changed: true, cellKey, col, row };
    }

    if (useAutotile) {
      const nextCells = applyAutotile4Bit(tm, col, row, erase);
      const nextObjects = updateObjectById(objects, targetId, (prev) =>
        prev.tilemap ? { ...prev, tilemap: { ...prev.tilemap, cells: nextCells } } : prev
      );
      return { nextObjects, changed: true, cellKey, col, row };
    }

    const existing = tm.cells[cellKey];
    if (erase) {
      if (existing === undefined) {
        return { nextObjects: objects, changed: false, cellKey, col, row };
      }
      const nextObjects = updateObjectById(objects, targetId, (prev) => {
        if (!prev.tilemap) return prev;
        const nextCells = { ...prev.tilemap.cells };
        delete nextCells[cellKey];
        return {
          ...prev,
          tilemap: { ...prev.tilemap, cells: nextCells },
        };
      });
      return { nextObjects, changed: true, cellKey, col, row };
    }

    const tileIdx = tm.selectedTileIndex ?? 0;
    if (existing === tileIdx) {
      return { nextObjects: objects, changed: false, cellKey, col, row };
    }
    const nextObjects = updateObjectById(objects, targetId, (prev) => {
      if (!prev.tilemap) return prev;
      return {
        ...prev,
        tilemap: {
          ...prev.tilemap,
          cells: { ...prev.tilemap.cells, [cellKey]: tileIdx },
        },
      };
    });
    return { nextObjects, changed: true, cellKey, col, row };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (!host) return;
    host.setPointerCapture(e.pointerId);

    const screenPt = getLocalScreenCoords(e.clientX, e.clientY);

    // Paneo con botón central, herramienta Navegar o Space + clic izquierdo
    if (e.button === 1 || activeTool === 'pan' || (e.button === 0 && spaceHeldRef.current)) {
      dragRef.current = {
        kind: 'pan',
        startScreenX: screenPt.x,
        startScreenY: screenPt.y,
        startCamX: camera.x,
        startCamY: camera.y,
      };
      return;
    }

    const stagePt = screenToStage(screenPt.x, screenPt.y, camera);
    const objectMap = buildObjectMap(scene.objects);

    // Modo Pincel Tiles (clic izquierdo pinta, clic derecho o Alt+clic borra)
    if (activeTool === 'tilebrush' && (e.button === 0 || e.button === 2)) {
      let tilemapTarget = selectedIds
        .map((id) => objectMap.get(id))
        .find((o): o is GameObjectData => Boolean(o && o.type === 'tilemap'));

      if (!tilemapTarget) {
        const picked = pickTopObjectAt(stagePt.x, stagePt.y, scene.objects);
        if (picked?.type === 'tilemap') {
          tilemapTarget = picked;
          onSelectObjects([picked.id]);
        } else {
          const firstTilemap = scene.objects.find((o) => o.type === 'tilemap');
          if (firstTilemap) {
            tilemapTarget = firstTilemap;
            onSelectObjects([firstTilemap.id]);
          }
        }
      }

      if (tilemapTarget && tilemapTarget.tilemap && !tilemapTarget.locked) {
        const erase = e.button === 2 || e.altKey;
        const brushMode = tilemapTarget.tilemap.brushMode ?? (tilemapTarget.tilemap.autotileEnabled ? 'autotile' : 'single');
        const coords = getTilemapCellCoords(stagePt.x, stagePt.y, tilemapTarget, objectMap);
        if (brushMode === 'rect' && coords) {
          dragRef.current = {
            kind: 'tilepaint',
            targetId: tilemapTarget.id,
            erase,
            changed: false,
            lastCellKey: coords.cellKey,
            brushMode: 'rect',
            startCol: coords.col,
            startRow: coords.row,
            curCol: coords.col,
            curRow: coords.row,
          };
          return;
        }
        const result = paintTileAt(
          stagePt.x,
          stagePt.y,
          tilemapTarget.id,
          erase,
          scene.objects,
          brushMode === 'bucket' ? 'bucket' : brushMode === 'autotile' ? 'autotile' : 'single'
        );
        if (result.changed) {
          onPreviewObjectsChange(result.nextObjects);
        }
        dragRef.current = {
          kind: 'tilepaint',
          targetId: tilemapTarget.id,
          erase,
          changed: result.changed,
          lastCellKey: result.cellKey,
          brushMode,
          startCol: result.col,
          startRow: result.row,
          curCol: result.col,
          curRow: result.row,
        };
      }
      return;
    }

    if (e.button !== 0) return;

    // 1. Verificar primero handles de zona de colisión si "Colisiones" está visible
    if (selectedIds.length === 1 && showDebugColliders) {
      const primary = objectMap.get(selectedIds[0]);
      if (primary && primary.visible && !primary.locked && primary.type !== 'tilemap') {
        const colHandles = computeColliderHandles(primary, objectMap);
        const hitCol = hitTestColliderHandle(stagePt.x, stagePt.y, colHandles, camera.zoom);
        if (hitCol) {
          dragRef.current = {
            kind: 'collider',
            handleType: hitCol.type,
            targetId: primary.id,
            startStageX: stagePt.x,
            startStageY: stagePt.y,
            initialObjects: structuredClone(scene.objects),
            initialObj: structuredClone(primary),
            changed: false,
          };
          return;
        }
      }
    }

    // 1b. Verificar si se hizo clic en un handle de transformación de la selección actual
    if (selectedIds.length === 1) {
      const primary = objectMap.get(selectedIds[0]);
      if (primary && primary.visible && !primary.locked) {
        const handles = computeGizmoHandles(primary, objectMap, activeTool, camera.zoom);
        const hitHandle = hitTestGizmoHandle(stagePt.x, stagePt.y, handles, camera.zoom);

        if (hitHandle) {
          if (hitHandle.type === 'rotate') {
            const world = getWorldTransform(primary, objectMap);
            const startAngle = Math.atan2(stagePt.y - world.y, stagePt.x - world.x);
            dragRef.current = {
              kind: 'rotate',
              targetId: primary.id,
              centerStageX: world.x,
              centerStageY: world.y,
              startPointerAngle: startAngle,
              initialRotation: primary.transform.rotation,
              initialObjects: structuredClone(scene.objects),
              changed: false,
            };
            return;
          }

          if (hitHandle.type.startsWith('scale-')) {
            dragRef.current = {
              kind: 'scale',
              handleType: hitHandle.type,
              targetId: primary.id,
              startStageX: stagePt.x,
              startStageY: stagePt.y,
              initialObjects: structuredClone(scene.objects),
              initialObj: structuredClone(primary),
              changed: false,
            };
            return;
          }

          if (hitHandle.type.startsWith('move-')) {
            const axisLock =
              hitHandle.type === 'move-x'
                ? 'x'
                : hitHandle.type === 'move-y'
                  ? 'y'
                  : 'free';
            dragRef.current = {
              kind: 'move',
              startStageX: stagePt.x,
              startStageY: stagePt.y,
              axisLock,
              initialObjects: structuredClone(scene.objects),
              movedIds: [primary.id],
              changed: false,
            };
            return;
          }
        }
      }
    }

    // 2. Verificar si se hizo clic sobre un objeto del escenario
    const picked = pickTopObjectAt(stagePt.x, stagePt.y, scene.objects);
    if (!picked) {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        onSelectObjects([]);
      }
      return;
    }

    let nextSelected: string[];
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (selectedIds.includes(picked.id)) {
        nextSelected = selectedIds.filter((id) => id !== picked.id);
      } else {
        nextSelected = [...selectedIds, picked.id];
      }
      onSelectObjects(nextSelected);
    } else {
      nextSelected = selectedIds.includes(picked.id) ? selectedIds : [picked.id];
      onSelectObjects(nextSelected);
    }

    // Iniciar arrastre de movimiento si el usuario usa Seleccionar o Mover
    if ((activeTool === 'select' || activeTool === 'move') && nextSelected.length > 0) {
      dragRef.current = {
        kind: 'move',
        startStageX: stagePt.x,
        startStageY: stagePt.y,
        axisLock: 'free',
        initialObjects: structuredClone(scene.objects),
        movedIds: nextSelected,
        changed: false,
      };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const screenPt = getLocalScreenCoords(e.clientX, e.clientY);
    const stagePt = screenToStage(screenPt.x, screenPt.y, camera);
    onPointerCoordsChange({ x: stagePt.x, y: stagePt.y });

    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'pan') {
      const dx = screenPt.x - drag.startScreenX;
      const dy = screenPt.y - drag.startScreenY;
      onCameraChange({
        ...camera,
        x: drag.startCamX + dx,
        y: drag.startCamY + dy,
      });
      return;
    }

    if (drag.kind === 'tilepaint') {
      if (drag.brushMode === 'bucket') return;
      const curObjs = latestRef.current.scene.objects;
      const objMap = buildObjectMap(curObjs);
      const target = objMap.get(drag.targetId);
      if (drag.brushMode === 'rect' && target?.tilemap) {
        const coords = getTilemapCellCoords(stagePt.x, stagePt.y, target, objMap);
        if (coords) {
          drag.curCol = coords.col;
          drag.curRow = coords.row;
          const tm = target.tilemap;
          const world = getWorldTransform(target, objMap);
          const ox = -(tm.cols * tm.tileWidth) * target.transform.anchorX;
          const oy = -(tm.rows * tm.tileHeight) * target.transform.anchorY;
          const minC = Math.min(drag.startCol, coords.col);
          const maxC = Math.max(drag.startCol, coords.col);
          const minR = Math.min(drag.startRow, coords.row);
          const maxR = Math.max(drag.startRow, coords.row);
          const stageLeft = world.x + (ox + minC * tm.tileWidth) * world.scaleX;
          const stageTop = world.y + (oy + minR * tm.tileHeight) * world.scaleY;
          const stageW = (maxC - minC + 1) * tm.tileWidth * Math.abs(world.scaleX);
          const stageH = (maxR - minR + 1) * tm.tileHeight * Math.abs(world.scaleY);
          setTileRectOverlay({
            left: stageLeft * camera.zoom + camera.x,
            top: stageTop * camera.zoom + camera.y,
            width: stageW * camera.zoom,
            height: stageH * camera.zoom,
            erase: drag.erase,
          });
        }
        return;
      }
      const result = paintTileAt(
        stagePt.x,
        stagePt.y,
        drag.targetId,
        drag.erase,
        curObjs,
        drag.brushMode === 'autotile' ? 'autotile' : 'single'
      );
      if (result.cellKey && result.cellKey !== drag.lastCellKey) {
        drag.lastCellKey = result.cellKey;
      }
      if (result.changed) {
        drag.changed = true;
        onPreviewObjectsChange(result.nextObjects);
      }
      return;
    }

    if (drag.kind === 'move') {
      const dxStage = drag.axisLock === 'y' ? 0 : stagePt.x - drag.startStageX;
      const dyStage = drag.axisLock === 'x' ? 0 : stagePt.y - drag.startStageY;
      if (Math.abs(dxStage) > 0.2 || Math.abs(dyStage) > 0.2) {
        drag.changed = true;
      }

      const initialMap = buildObjectMap(drag.initialObjects);
      const movedSet = new Set(drag.movedIds);

      const updated = drag.initialObjects.map((obj) => {
        if (!movedSet.has(obj.id) || obj.locked) return obj;
        // Evitar mover doble si también se está moviendo su padre
        if (obj.parentId && movedSet.has(obj.parentId)) return obj;

        const localDelta = stageDeltaToParentLocal(
          dxStage,
          dyStage,
          obj.parentId,
          initialMap
        );
        const rawX = obj.transform.x + localDelta.x;
        const rawY = obj.transform.y + localDelta.y;
        return {
          ...obj,
          transform: {
            ...obj.transform,
            x: roundTo(snapValue(rawX, scene.gridSize, scene.snapToGrid), 2),
            y: roundTo(snapValue(rawY, scene.gridSize, scene.snapToGrid), 2),
          },
        };
      });

      onPreviewObjectsChange(updated);
      return;
    }

    if (drag.kind === 'rotate') {
      const currentAngle = Math.atan2(
        stagePt.y - drag.centerStageY,
        stagePt.x - drag.centerStageX
      );
      const deltaDeg = radToDeg(currentAngle - drag.startPointerAngle);
      let nextRot = normalizeDegrees(drag.initialRotation + deltaDeg);
      if (e.shiftKey) {
        nextRot = Math.round(nextRot / 15) * 15;
      }
      drag.changed = true;
      const updated = drag.initialObjects.map((obj) =>
        obj.id === drag.targetId
          ? {
              ...obj,
              transform: {
                ...obj.transform,
                rotation: roundTo(nextRot, 1),
              },
            }
          : obj
      );
      onPreviewObjectsChange(updated);
      return;
    }

    if (drag.kind === 'scale') {
      const initialMap = buildObjectMap(drag.initialObjects);
      const world = getWorldTransform(drag.initialObj, initialMap);
      const rad = -degToRad(world.rotation);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const dx = stagePt.x - drag.startStageX;
      const dy = stagePt.y - drag.startStageY;
      const localDx = dx * cos - dy * sin;
      const localDy = dx * sin + dy * cos;

      const baseW = Math.max(1, drag.initialObj.transform.width);
      const baseH = Math.max(1, drag.initialObj.transform.height);

      let dirX = 0;
      let dirY = 0;
      if (drag.handleType.includes('e')) dirX = 1;
      if (drag.handleType.includes('w')) dirX = -1;
      if (drag.handleType.includes('s')) dirY = 1;
      if (drag.handleType.includes('n')) dirY = -1;

      const deltaScaleX = dirX !== 0 ? (localDx * dirX * 2) / baseW : 0;
      const deltaScaleY = dirY !== 0 ? (localDy * dirY * 2) / baseH : 0;

      let nextScaleX = drag.initialObj.transform.scaleX + deltaScaleX;
      let nextScaleY = drag.initialObj.transform.scaleY + deltaScaleY;

      if (e.shiftKey && dirX !== 0 && dirY !== 0) {
        const uniform = Math.abs(deltaScaleX) > Math.abs(deltaScaleY) ? deltaScaleX : deltaScaleY;
        nextScaleX = drag.initialObj.transform.scaleX + uniform;
        nextScaleY = drag.initialObj.transform.scaleY + uniform;
      }

      nextScaleX = Math.max(0.05, roundTo(nextScaleX, 3));
      nextScaleY = Math.max(0.05, roundTo(nextScaleY, 3));
      drag.changed = true;

      const updated = drag.initialObjects.map((obj) =>
        obj.id === drag.targetId
          ? {
              ...obj,
              transform: {
                ...obj.transform,
                scaleX: nextScaleX,
                scaleY: nextScaleY,
              },
            }
          : obj
      );
      onPreviewObjectsChange(updated);
      return;
    }

    if (drag.kind === 'collider') {
      const initialMap = buildObjectMap(drag.initialObjects);
      const world = getWorldTransform(drag.initialObj, initialMap);
      const sx = Math.abs(world.scaleX) < 0.05 ? 1 : world.scaleX;
      const sy = Math.abs(world.scaleY) < 0.05 ? 1 : world.scaleY;
      const ldx = (stagePt.x - drag.startStageX) / sx;
      const ldy = (stagePt.y - drag.startStageY) / sy;

      const baseCol =
        drag.initialObj.colliders && drag.initialObj.colliders.length > 0
          ? structuredClone(drag.initialObj.colliders[0])
          : createDefaultColliderForObject(drag.initialObj, false);

      if (drag.handleType === 'col-move') {
        baseCol.offsetX = roundTo((baseCol.offsetX ?? 0) + ldx, 1);
        baseCol.offsetY = roundTo((baseCol.offsetY ?? 0) + ldy, 1);
      } else if (drag.handleType === 'col-r') {
        baseCol.radius = Math.max(4, roundTo((baseCol.radius ?? 24) + ldx, 1));
      } else {
        const origW = Math.max(8, baseCol.width ?? drag.initialObj.transform.width);
        const origH = Math.max(8, baseCol.height ?? drag.initialObj.transform.height);
        const origOx = baseCol.offsetX ?? 0;
        const origOy = baseCol.offsetY ?? 0;
        if (drag.handleType === 'col-e') {
          const nw = Math.max(8, roundTo(origW + ldx, 1));
          baseCol.width = nw;
          baseCol.offsetX = roundTo(origOx + (nw - origW) * 0.5, 1);
        } else if (drag.handleType === 'col-w') {
          const nw = Math.max(8, roundTo(origW - ldx, 1));
          baseCol.width = nw;
          baseCol.offsetX = roundTo(origOx - (nw - origW) * 0.5, 1);
        } else if (drag.handleType === 'col-s') {
          const nh = Math.max(8, roundTo(origH + ldy, 1));
          baseCol.height = nh;
          baseCol.offsetY = roundTo(origOy + (nh - origH) * 0.5, 1);
        } else if (drag.handleType === 'col-n') {
          const nh = Math.max(8, roundTo(origH - ldy, 1));
          baseCol.height = nh;
          baseCol.offsetY = roundTo(origOy - (nh - origH) * 0.5, 1);
        }
      }

      drag.changed = true;
      const restCols = drag.initialObj.colliders ? drag.initialObj.colliders.slice(1) : [];
      const updated = drag.initialObjects.map((obj) =>
        obj.id === drag.targetId
          ? { ...obj, colliders: [baseCol, ...restCols] }
          : obj
      );
      onPreviewObjectsChange(updated);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (host && host.hasPointerCapture(e.pointerId)) {
      host.releasePointerCapture(e.pointerId);
    }

    const drag = dragRef.current;
    dragRef.current = null;
    setTileRectOverlay(null);
    if (!drag) return;

    if (drag.kind === 'tilepaint' && drag.brushMode === 'rect' && drag.startCol >= 0) {
      const target = latestRef.current.scene.objects.find((o) => o.id === drag.targetId);
      if (target?.tilemap) {
        const nextCells = paintRectTilemap(
          target.tilemap,
          drag.startCol,
          drag.startRow,
          drag.curCol,
          drag.curRow,
          drag.erase,
          Boolean(target.tilemap.autotileEnabled)
        );
        const nextObjs = updateObjectById(latestRef.current.scene.objects, drag.targetId, (prev) =>
          prev.tilemap ? { ...prev, tilemap: { ...prev.tilemap, cells: nextCells } } : prev
        );
        onCommitObjectsChange(nextObjs);
      }
      return;
    }

    if (drag.kind !== 'pan' && drag.changed) {
      // Confirmar en el historial de deshacer/rehacer una sola vez al finalizar el arrastre
      onCommitObjectsChange(latestRef.current.scene.objects);
    }
  };

  const selectedTilemap = scene.objects.find(
    (o) => selectedIds.includes(o.id) && o.type === 'tilemap'
  );

  const cursorClass =
    spaceHeld || activeTool === 'pan'
      ? 'cursor-grab active:cursor-grabbing'
      : activeTool === 'move'
        ? 'cursor-move'
        : activeTool === 'rotate' || activeTool === 'tilebrush'
          ? 'cursor-crosshair'
          : 'cursor-default';

  return (
    <div
      className="relative flex-1 overflow-hidden bg-[#141416] select-none"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-nexus-asset')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setIsDragAssetOver(true);
        }
      }}
      onDragLeave={() => setIsDragAssetOver(false)}
      onDrop={(e) => {
        setIsDragAssetOver(false);
        const assetId = e.dataTransfer.getData('application/x-nexus-asset');
        if (!assetId) return;
        e.preventDefault();
        const screenPt = getLocalScreenCoords(e.clientX, e.clientY);
        const stagePt = screenToStage(screenPt.x, screenPt.y, camera);
        onDropAssetAt(
          assetId,
          roundTo(snapValue(stagePt.x, scene.gridSize, scene.snapToGrid), 1),
          roundTo(snapValue(stagePt.y, scene.gridSize, scene.snapToGrid), 1)
        );
      }}
    >
      {/* Host dedicado exclusivamente a PixiJS */}
      <div
        ref={hostRef}
        data-testid="nexus-stage-canvas-host"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => onPointerCoordsChange(null)}
        onContextMenu={(e) => e.preventDefault()}
        className={`h-full w-full ${cursorClass}`}
      />

      <StageRulers
        camera={camera}
        viewportWidth={viewportSize.width}
        viewportHeight={viewportSize.height}
      />

      <UIWidgetOverlayLayer
        mode="editor"
        projectMode="2d"
        objects={scene.objects}
        stage={stage}
        camera={camera}
        viewportWidth={viewportSize.width}
        viewportHeight={viewportSize.height}
        selectedIds={selectedIds}
        onSelectObject={(id, additive) => {
          if (additive) {
            onSelectObjects(
              selectedIds.includes(id)
                ? selectedIds.filter((s) => s !== id)
                : [...selectedIds, id]
            );
          } else {
            onSelectObjects([id]);
          }
        }}
        onMoveWidget={(id, nextX, nextY, commit) => {
          const updated = scene.objects.map((o) =>
            o.id === id ? { ...o, transform: { ...o.transform, x: nextX, y: nextY } } : o
          );
          if (commit) onCommitObjectsChange(updated);
          else onPreviewObjectsChange(updated);
        }}
      />

      {tileRectOverlay && (
        <div
          className={`pointer-events-none absolute border-2 ${
            tileRectOverlay.erase
              ? 'border-red-400 bg-red-500/20'
              : 'border-cyan-400 bg-cyan-500/20'
          }`}
          style={{
            left: `${tileRectOverlay.left}px`,
            top: `${tileRectOverlay.top}px`,
            width: `${tileRectOverlay.width}px`,
            height: `${tileRectOverlay.height}px`,
          }}
        />
      )}

      {activeTool === 'tilebrush' && (
        <div className="pointer-events-none absolute top-7 left-1/2 -translate-x-1/2 rounded border border-blue-500/50 bg-[#18181d]/95 px-3 py-1 text-[11px] text-zinc-200 shadow-lg whitespace-nowrap">
          {selectedTilemap ? (
            <>
              <span className="font-semibold text-blue-300">
                Pincel Tiles ({selectedTilemap.tilemap?.brushMode ?? (selectedTilemap.tilemap?.autotileEnabled ? 'autotile' : 'single')}) · {selectedTilemap.name}
              </span>
              <span className="mx-1.5 text-zinc-500">|</span>
              <span>Clic izq. pinta tile #{(selectedTilemap.tilemap?.selectedTileIndex ?? 0) + 1} · Clic der. o Alt+clic borra</span>
            </>
          ) : (
            <span className="text-amber-300">
              Pincel Tiles · Crea o selecciona un objeto Mapa de Tiles para pintar celdas
            </span>
          )}
        </div>
      )}

      {isDragAssetOver && (
        <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-blue-500/70 bg-blue-500/5" />
      )}

      {/* Barra flotante de controles de lienzo (cuadrícula, snap, zoom) */}
      <div className="absolute bottom-3 left-8 flex items-center gap-1 rounded-md border border-[#32323c] bg-[#1a1a1f]/95 px-2 py-1 shadow-lg">
        <button
          type="button"
          onClick={() =>
            onUpdateScene((s) => ({ ...s, gridVisible: !s.gridVisible }))
          }
          title="Activar o desactivar cuadrícula"
          aria-pressed={scene.gridVisible}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            scene.gridVisible
              ? 'bg-blue-600/25 text-blue-300'
              : 'text-zinc-400 hover:bg-[#2a2a32] hover:text-zinc-100'
          }`}
        >
          <Grid3X3 className="h-3.5 w-3.5" />
          <span>Cuadrícula</span>
        </button>

        <button
          type="button"
          onClick={() =>
            onUpdateScene((s) => ({ ...s, snapToGrid: !s.snapToGrid }))
          }
          title="Ajustar movimiento a la cuadrícula"
          aria-pressed={scene.snapToGrid}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            scene.snapToGrid
              ? 'bg-blue-600/25 text-blue-300'
              : 'text-zinc-400 hover:bg-[#2a2a32] hover:text-zinc-100'
          }`}
        >
          <Magnet className="h-3.5 w-3.5" />
          <span>Imán</span>
        </button>

        <select
          aria-label="Tamaño de cuadrícula"
          value={scene.gridSize}
          onChange={(e) =>
            onUpdateScene((s) => ({ ...s, gridSize: Number(e.target.value) }))
          }
          className="rounded border border-[#32323c] bg-[#141416] px-1.5 py-0.5 font-mono text-[11px] text-zinc-300 focus:outline-none"
        >
          <option value={16}>16 px</option>
          <option value={32}>32 px</option>
          <option value={64}>64 px</option>
        </select>

        <button
          type="button"
          onClick={() => setShowDebugColliders((v) => !v)}
          title="Mostrar u ocultar colisionadores y sensores en el lienzo"
          aria-pressed={showDebugColliders}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            showDebugColliders
              ? 'bg-emerald-600/25 text-emerald-300'
              : 'text-zinc-400 hover:bg-[#2a2a32] hover:text-zinc-100'
          }`}
        >
          <Scan className="h-3.5 w-3.5" />
          <span>Colisiones</span>
        </button>

        <span className="mx-1 h-4 w-px bg-[#303038]" aria-hidden="true" />

        <button
          type="button"
          onClick={() => {
            const rect = hostRef.current?.getBoundingClientRect();
            const cx = (rect?.width ?? 800) / 2;
            const cy = (rect?.height ?? 600) / 2;
            onCameraChange(zoomCameraAtPoint(camera, camera.zoom / 1.2, cx, cy));
          }}
          title="Alejar zoom"
          aria-label="Alejar zoom"
          className="rounded p-1 text-zinc-300 hover:bg-[#2a2a32] hover:text-white"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <span className="w-11 text-center font-mono text-[11px] tabular-nums text-zinc-200">
          {Math.round(camera.zoom * 100)}%
        </span>

        <button
          type="button"
          onClick={() => {
            const rect = hostRef.current?.getBoundingClientRect();
            const cx = (rect?.width ?? 800) / 2;
            const cy = (rect?.height ?? 600) / 2;
            onCameraChange(zoomCameraAtPoint(camera, camera.zoom * 1.2, cx, cy));
          }}
          title="Acercar zoom"
          aria-label="Acercar zoom"
          className="rounded p-1 text-zinc-300 hover:bg-[#2a2a32] hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => {
            const rect = hostRef.current?.getBoundingClientRect();
            if (!rect) return;
            onCameraChange(fitCameraToViewport(rect.width, rect.height, stage));
          }}
          title="Ajustar escenario a la vista"
          aria-label="Ajustar escenario a la vista"
          className="rounded p-1 text-zinc-300 hover:bg-[#2a2a32] hover:text-white"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
