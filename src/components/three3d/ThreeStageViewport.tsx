import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  Box,
  Brush,
  Camera,
  Combine,
  Compass,
  Droplets,
  Eye,
  Fence,
  Grid3X3,
  Lightbulb,
  Maximize2,
  Minimize2,
  Mountain,
  Move,
  Paintbrush,
  RotateCw,
  Scan,
  Scissors,
  Sparkles,
  Sprout,
} from 'lucide-react';
import { buildNavMeshFromScene } from '../../engine/ai3d/navmesh';
import type {
  EditorTool,
  GameObjectData,
  GameObjectType,
  Mesh3DShape,
  SceneData,
  StageResolution,
} from '../../engine/core/types';
import { createGameObject } from '../../engine/objects/factory';
import { createSoftBodySimulation } from '../../engine/physics/softBodyPhysics';
import { buildWorldTrimeshData, extractWorldTrimeshFromObject3D } from '../../engine/physics3d/trimeshCollider';
import { performCsgOperation } from '../../engine/three3d/csgOperations';
import { buildModularGeometry } from '../../engine/three3d/geometryBuilders';
import {
  applyTerrainSculptBrush,
  computeDayNightLighting,
  computeMagneticFenceSnap,
  createSkyDomeMesh,
  createWaterSurfaceMesh,
  createWindFoliageInstancedMesh,
  generateProceduralTerrain,
  groundHeightAt,
  scatterFoliageInstances,
} from '../../engine/three3d/terrainSystem';
import {
  detectSoftwareWebGL,
  ResourceDisposer,
} from '../../engine/three3d/resourceDisposer';
import { loadModel3DFromBlob } from '../../engine/three3d/modelLoader';
import { UIWidgetOverlayLayer } from '../widgets/UIWidgetOverlayLayer';

interface ThreeStageViewportProps {
  scene: SceneData;
  stage: StageResolution;
  selectedIds: string[];
  activeTool: EditorTool;
  assetBlobs: Map<string, Blob>;
  fitRequestTick: number;
  onSelectTool: (tool: EditorTool) => void;
  onSelectObjects: (ids: string[]) => void;
  onPreviewObjectsChange: (objects: GameObjectData[]) => void;
  onCommitObjectsChange: (objects: GameObjectData[]) => void;
  onUpdateScene: (updater: (scene: SceneData) => SceneData) => void;
  onNotify?: (type: 'info' | 'success' | 'error', text: string) => void;
}

const DEFAULT_T3D = {
  x: 0,
  y: 0.5,
  z: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  sx: 1,
  sy: 1,
  sz: 1,
};

const _vec3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _groundHit = new THREE.Vector3();

type ViewportBrushMode =
  | 'gizmo'
  | 'sculpt_raise'
  | 'sculpt_lower'
  | 'sculpt_smooth'
  | 'sculpt_flatten'
  | 'sculpt_paint'
  | 'scatter'
  | 'fence';

interface FaceHandleDragState {
  objectId: string;
  axis: 'x' | 'y' | 'z';
  sign: 1 | -1;
  baseHalf: number;
  initPos: THREE.Vector3;
  initScale: THREE.Vector3;
  initQuat: THREE.Quaternion;
  worldAxisDir: THREE.Vector3;
  startTOnAxis: number;
  initialObjects: GameObjectData[];
  changed: boolean;
}

function closestParamOnAxisToRay(
  axisOrigin: THREE.Vector3,
  axisDir: THREE.Vector3,
  ray: THREE.Ray
): number {
  const w0 = _vec3.copy(axisOrigin).sub(ray.origin);
  const b = axisDir.dot(ray.direction);
  const denom = 1 - b * b;
  if (Math.abs(denom) < 1e-4) {
    return -axisDir.dot(w0);
  }
  const d = axisDir.dot(w0);
  const e = ray.direction.dot(w0);
  return (b * e - d) / denom;
}

function computeLocalVisualBounds(group: THREE.Object3D, obj: GameObjectData): { min: THREE.Vector3; max: THREE.Vector3 } {
  const mCfg = obj.mesh3d;
  if (mCfg?.shape === 'terrain' && mCfg.terrainData) {
    const td = mCfg.terrainData;
    let minH = -0.5;
    let maxH = 0.5;
    for (let i = 0; i < td.heights.length; i++) {
      if (td.heights[i] < minH) minH = td.heights[i];
      if (td.heights[i] > maxH) maxH = td.heights[i];
    }
    return {
      min: new THREE.Vector3(-td.width * 0.5, minH - 0.1, -td.depth * 0.5),
      max: new THREE.Vector3(td.width * 0.5, maxH + 0.1, td.depth * 0.5),
    };
  }
  if (mCfg?.shape === 'water' && mCfg.waterConfig) {
    const wc = mCfg.waterConfig;
    return {
      min: new THREE.Vector3(-wc.width * 0.5, -0.25, -wc.depth * 0.5),
      max: new THREE.Vector3(wc.width * 0.5, 0.25, wc.depth * 0.5),
    };
  }
  const savedPos = group.position.clone();
  const savedQuat = group.quaternion.clone();
  const savedScale = group.scale.clone();
  group.position.set(0, 0, 0);
  group.quaternion.identity();
  group.scale.set(1, 1, 1);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  group.traverse((child) => {
    if ((child as THREE.SkeletonHelper).isSkeletonHelper) return;
    if ((child as THREE.Mesh).isMesh || (child as THREE.LineSegments).isLineSegments) {
      box.expandByObject(child);
    }
  });
  group.position.copy(savedPos);
  group.quaternion.copy(savedQuat);
  group.scale.copy(savedScale);
  group.updateMatrixWorld(true);
  if (box.isEmpty()) {
    return { min: new THREE.Vector3(-0.5, -0.5, -0.5), max: new THREE.Vector3(0.5, 0.5, 0.5) };
  }
  return { min: box.min.clone(), max: box.max.clone() };
}

function mapToolToTransformMode(tool: EditorTool): 'translate' | 'rotate' | 'scale' {
  if (tool === 'rotate') return 'rotate';
  if (tool === 'scale') return 'scale';
  return 'translate';
}

export const ThreeStageViewport: React.FC<ThreeStageViewportProps> = ({
  scene,
  stage,
  selectedIds,
  activeTool,
  assetBlobs,
  fitRequestTick,
  onSelectTool,
  onSelectObjects,
  onPreviewObjectsChange,
  onCommitObjectsChange,
  onUpdateScene,
  onNotify,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const [showGrid, setShowGrid] = useState(true);
  const [showNavMesh, setShowNavMesh] = useState(true);
  const [showColliders, setShowColliders] = useState(false);
  const [editColliderZone, setEditColliderZone] = useState(false);
  const [faceScaleEnabled, setFaceScaleEnabled] = useState(true);
  const [brushMode, setBrushMode] = useState<ViewportBrushMode>('gizmo');
  const [brushRadius, setBrushRadius] = useState(4);
  const [paintChannel, setPaintChannel] = useState<0 | 1 | 2 | 3>(0);

  const isDraggingGizmoRef = useRef(false);
  const justFinishedDragRef = useRef(false);
  const faceDragRef = useRef<FaceHandleDragState | null>(null);

  // Referencias imperativas de la escena Three.js
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    threeScene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    orbit: OrbitControls;
    transformControls: TransformControls;
    gridHelper: THREE.GridHelper;
    sunLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    ambientLight: THREE.AmbientLight;
    objectsRoot: THREE.Group;
    collidersRoot: THREE.Group;
    faceHandlesRoot: THREE.Group;
    facePickables: THREE.Object3D[];
    navMeshVisual: THREE.InstancedMesh | null;
    disposer: ResourceDisposer;
    objectMap: Map<string, THREE.Object3D>;
    pickables: THREE.Object3D[];
    glbCache: Map<string, { scene: THREE.Group; clipNames: string[] }>;
    texCache: Map<string, THREE.Texture>;
    animatedUniforms: Array<{ uTime: { value: number } }>;
    isSoftwareGl: boolean;
    requestRender: () => void;
  } | null>(null);

  const latestRef = useRef({
    scene,
    selectedIds,
    activeTool,
    assetBlobs,
    showGrid,
    showNavMesh,
    showColliders,
    editColliderZone,
    faceScaleEnabled,
    brushMode,
    brushRadius,
    paintChannel,
    onSelectObjects,
    onPreviewObjectsChange,
    onCommitObjectsChange,
    onUpdateScene,
    onNotify,
  });
  latestRef.current = {
    scene,
    selectedIds,
    activeTool,
    assetBlobs,
    showGrid,
    showNavMesh,
    showColliders,
    editColliderZone,
    faceScaleEnabled,
    brushMode,
    brushRadius,
    paintChannel,
    onSelectObjects,
    onPreviewObjectsChange,
    onCommitObjectsChange,
    onUpdateScene,
    onNotify,
  };

  // Inicialización única del WebGLRenderer y controles 3D
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    const isSoftwareGl = detectSoftwareWebGL(renderer);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const rect = host.getBoundingClientRect();
    const initW = Math.max(100, Math.round(rect.width || 960));
    const initH = Math.max(100, Math.round(rect.height || 540));
    renderer.setSize(initW, initH);
    setViewportSize({ width: initW, height: initH });
    host.innerHTML = '';
    host.appendChild(renderer.domElement);

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(scene.backgroundColor || '#131722');

    // Entorno HDRI procedural obligatorio para reflejos PBR reales
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    threeScene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(55, initW / initH, 0.1, 400);
    camera.position.set(12, 9.5, 13.5);
    camera.lookAt(0, 0.5, 0);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = !isSoftwareGl;
    orbit.dampingFactor = 0.08;
    orbit.target.set(0, 0.5, 0);

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode(mapToolToTransformMode(latestRef.current.activeTool));
    threeScene.add(transformControls.getHelper());

    // Rig de iluminación base con contraste cálido/frío + Rebote inteligente
    const hemiLight = new THREE.HemisphereLight('#a5c9ff', '#3d342d', 0.85);
    threeScene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight('#dbeafe', 0.25);
    threeScene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight('#fff1d6', 2.0);
    sunLight.position.set(14, 22, 10);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 80;
    sunLight.shadow.camera.left = -22;
    sunLight.shadow.camera.right = 22;
    sunLight.shadow.camera.top = 22;
    sunLight.shadow.camera.bottom = -22;
    sunLight.shadow.bias = -0.0005;
    threeScene.add(sunLight);

    const gridHelper = new THREE.GridHelper(60, 60, '#3b82f6', '#283044');
    gridHelper.position.y = 0.005;
    threeScene.add(gridHelper);

    const objectsRoot = new THREE.Group();
    threeScene.add(objectsRoot);

    const collidersRoot = new THREE.Group();
    threeScene.add(collidersRoot);

    const faceHandlesRoot = new THREE.Group();
    threeScene.add(faceHandlesRoot);

    const disposer = new ResourceDisposer();
    const glbCache = new Map<string, { scene: THREE.Group; clipNames: string[] }>();
    const texCache = new Map<string, THREE.Texture>();

    let mounted = true;
    let frameId = 0;
    let pollTimeoutId = 0;
    let renderBusy = false;
    let renderDirty = false;

    const afterDraw = (done: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync !== 'function') {
        pollTimeoutId = window.setTimeout(done, 45);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (!mounted) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          pollTimeoutId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          pollTimeoutId = window.setTimeout(done, 35);
        }
      };
      pollTimeoutId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (!mounted) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (!mounted) return;
        renderDirty = false;
        orbit.update();
        renderer.render(threeScene, camera);
        const finish = () => {
          renderBusy = false;
          if (renderDirty && mounted) requestRender();
        };
        if (isSoftwareGl) afterDraw(finish);
        else finish();
      });
    };

    orbit.addEventListener('change', requestRender);

    // Sincronización TransformControls <-> Objetos Nexus
    let dragBaseline: GameObjectData[] | null = null;
    let finishDragTimeout = 0;

    const applyTransformTargetFromProxy = (attached: THREE.Object3D, commit: boolean) => {
      const colliderTargetId = attached.userData?.nexusColliderTargetId as string | undefined;
      if (colliderTargetId) {
        const objPosArr = attached.userData.objPos as [number, number, number];
        const objQuatArr = attached.userData.objQuat as [number, number, number, number];
        const initHeArr = attached.userData.initHe as [number, number, number];
        const objPos = new THREE.Vector3(...objPosArr);
        const invQuat = new THREE.Quaternion(...objQuatArr).invert();
        const localOff = attached.position.clone().sub(objPos).applyQuaternion(invQuat);
        const nextHe = {
          x: Number(Math.max(0.05, initHeArr[0] * Math.abs(attached.scale.x)).toFixed(3)),
          y: Number(Math.max(0.05, initHeArr[1] * Math.abs(attached.scale.y)).toFixed(3)),
          z: Number(Math.max(0.05, initHeArr[2] * Math.abs(attached.scale.z)).toFixed(3)),
        };
        const nextRad = Number(Math.max(0.1, Math.max(nextHe.x, nextHe.y, nextHe.z)).toFixed(3));
        const nextObjects = latestRef.current.scene.objects.map((o) =>
          o.id === colliderTargetId
            ? {
                ...o,
                physics3d: {
                  enabled: o.physics3d?.enabled ?? true,
                  bodyType: o.physics3d?.bodyType ?? 'static',
                  shape: o.physics3d?.shape ?? 'box',
                  isTrigger: o.physics3d?.isTrigger,
                  mass: o.physics3d?.mass ?? 1,
                  gravityScale: o.physics3d?.gravityScale ?? 1,
                  restitution: o.physics3d?.restitution ?? 0.1,
                  friction: o.physics3d?.friction ?? 0.6,
                  offset: {
                    x: Number(localOff.x.toFixed(3)),
                    y: Number(localOff.y.toFixed(3)),
                    z: Number(localOff.z.toFixed(3)),
                  },
                  halfExtents: nextHe,
                  radius: o.physics3d?.shape === 'sphere' ? nextRad : o.physics3d?.radius,
                },
              }
            : o
        );
        if (commit) latestRef.current.onCommitObjectsChange(nextObjects);
        else latestRef.current.onPreviewObjectsChange(nextObjects);
        return;
      }

      const targetId = attached.userData?.nexusObjectId as string | undefined;
      if (!targetId) return;
      const nextObjects = latestRef.current.scene.objects.map((o) =>
        o.id === targetId
          ? {
              ...o,
              transform3d: {
                x: Number(attached.position.x.toFixed(3)),
                y: Number(attached.position.y.toFixed(3)),
                z: Number(attached.position.z.toFixed(3)),
                rx: Number(THREE.MathUtils.radToDeg(attached.rotation.x).toFixed(1)),
                ry: Number(THREE.MathUtils.radToDeg(attached.rotation.y).toFixed(1)),
                rz: Number(THREE.MathUtils.radToDeg(attached.rotation.z).toFixed(1)),
                sx: Number(Math.max(0.05, attached.scale.x).toFixed(3)),
                sy: Number(Math.max(0.05, attached.scale.y).toFixed(3)),
                sz: Number(Math.max(0.05, attached.scale.z).toFixed(3)),
              },
            }
          : o
      );
      if (commit) latestRef.current.onCommitObjectsChange(nextObjects);
      else latestRef.current.onPreviewObjectsChange(nextObjects);
    };

    transformControls.addEventListener('dragging-changed', (ev) => {
      const active = Boolean((ev as { value?: boolean }).value);
      orbit.enabled = !active;
      isDraggingGizmoRef.current = active;

      if (active) {
        clearTimeout(finishDragTimeout);
        justFinishedDragRef.current = false;
        dragBaseline = structuredClone(latestRef.current.scene.objects);
      } else {
        justFinishedDragRef.current = true;
        clearTimeout(finishDragTimeout);
        finishDragTimeout = window.setTimeout(() => {
          justFinishedDragRef.current = false;
        }, 90);

        if (dragBaseline) {
          const attached = transformControls.object;
          if (attached) {
            applyTransformTargetFromProxy(attached, true);
          }
          dragBaseline = null;
        }
      }
      requestRender();
    });

    transformControls.addEventListener('change', () => {
      if (!isDraggingGizmoRef.current) {
        requestRender();
        return;
      }
      const attached = transformControls.object;
      if (attached) {
        applyTransformTargetFromProxy(attached, false);
      }
      requestRender();
    });

    // Raycast de selección o aplicación de pincel 3D (Esculpir, Pintar, Scatter, Valla Magnética)
    let pointerDownPos = { x: 0, y: 0 };
    let isBrushPainting = false;
    let brushWorkingObjects: GameObjectData[] | null = null;
    let lastFencePos: { x: number; z: number } | null = null;

    const raycastWorldPoint = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const ctx = threeRef.current;
      if (!ctx) return null;
      const r = renderer.domElement.getBoundingClientRect();
      _ndc.x = ((clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      _ndc.y = -((clientY - r.top) / Math.max(1, r.height)) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      const hits = _raycaster.intersectObjects(ctx.pickables, true);
      if (hits.length > 0) return hits[0].point.clone();
      if (_raycaster.ray.intersectPlane(_groundPlane, _groundHit)) {
        return _groundHit.clone();
      }
      return null;
    };

    const applyBrushStrokeAt = (pt: THREE.Vector3, mode: ViewportBrushMode, isInitialClick: boolean) => {
      const curState = latestRef.current;
      const currentList = brushWorkingObjects ?? curState.scene.objects;

      if (
        mode === 'sculpt_raise' ||
        mode === 'sculpt_lower' ||
        mode === 'sculpt_smooth' ||
        mode === 'sculpt_flatten' ||
        mode === 'sculpt_paint'
      ) {
        const terrainObj = currentList.find(
          (o) => o.type === 'mesh_3d' && o.mesh3d?.shape === 'terrain'
        );
        if (!terrainObj) {
          if (isInitialClick) {
            const newTerrain = createGameObject('mesh_3d', currentList, {
              name: 'Terreno_Procedural',
              shape3d: 'terrain',
              x3d: 0,
              y3d: 0,
              z3d: 0,
            });
            const updated = [...currentList, newTerrain];
            brushWorkingObjects = updated;
            curState.onCommitObjectsChange(updated);
            curState.onSelectObjects([newTerrain.id]);
            curState.onNotify?.('info', 'Se creó Terreno_Procedural automáticamente. Vuelve a pasar el pincel para esculpirlo.');
          }
          return;
        }
        const tMode =
          mode === 'sculpt_raise'
            ? 'raise'
            : mode === 'sculpt_lower'
              ? 'lower'
              : mode === 'sculpt_smooth'
                ? 'smooth'
                : mode === 'sculpt_flatten'
                  ? 'flatten'
                  : 'paint';
        const nextTerrain = applyTerrainSculptBrush(
          terrainObj,
          pt.x,
          pt.z,
          tMode,
          curState.brushRadius,
          tMode === 'paint' ? 0.65 : 0.42,
          curState.paintChannel
        );
        if (!nextTerrain) return;
        const updated = currentList.map((o) =>
          o.id === terrainObj.id && o.mesh3d
            ? { ...o, mesh3d: { ...o.mesh3d, terrainData: nextTerrain } }
            : o
        );
        brushWorkingObjects = updated;
        curState.onPreviewObjectsChange(updated);
        return;
      }

      if (mode === 'scatter' && isInitialClick) {
        let foliageObj = currentList.find(
          (o) => o.type === 'mesh_3d' && o.mesh3d?.shape === 'grass_field'
        );
        let working = currentList;
        if (!foliageObj) {
          foliageObj = createGameObject('mesh_3d', currentList, {
            name: 'Campo_Hierba',
            shape3d: 'grass_field',
            x3d: 0,
            y3d: 0,
            z3d: 0,
          });
          working = [...currentList, foliageObj];
        }
        const existingInst = foliageObj.mesh3d?.foliageConfig?.instances ?? [];
        const nextInst = scatterFoliageInstances(
          { ...curState.scene, objects: working },
          existingInst,
          pt.x,
          pt.z,
          Math.max(1.5, curState.brushRadius),
          16
        );
        const updated = working.map((o) =>
          o.id === foliageObj!.id && o.mesh3d
            ? {
                ...o,
                mesh3d: {
                  ...o.mesh3d,
                  foliageConfig: {
                    kind: o.mesh3d.foliageConfig?.kind ?? 'grass',
                    windStrength: o.mesh3d.foliageConfig?.windStrength ?? 0.38,
                    windSpeed: o.mesh3d.foliageConfig?.windSpeed ?? 2.4,
                    interactionRadius: o.mesh3d.foliageConfig?.interactionRadius ?? 1.8,
                    colorBase: o.mesh3d.foliageConfig?.colorBase ?? '#15803d',
                    colorTip: o.mesh3d.foliageConfig?.colorTip ?? '#4ade80',
                    instances: nextInst,
                  },
                },
              }
            : o
        );
        curState.onCommitObjectsChange(updated);
        return;
      }

      if (mode === 'fence') {
        if (
          !isInitialClick &&
          lastFencePos &&
          Math.hypot(pt.x - lastFencePos.x, pt.z - lastFencePos.z) < 2.2
        ) {
          return;
        }
        const snap = computeMagneticFenceSnap(
          { ...curState.scene, objects: currentList },
          pt.x,
          pt.z,
          2.4,
          2.8
        );
        const fence = createGameObject('mesh_3d', currentList, {
          name: 'Valla',
          shape3d: 'box',
          x3d: snap.x,
          y3d: snap.y,
          z3d: snap.z,
        });
        fence.tags = ['valla'];
        if (fence.mesh3d) fence.mesh3d.color = '#92400e';
        if (fence.transform3d) {
          fence.transform3d.sx = 2.4;
          fence.transform3d.sy = 1.1;
          fence.transform3d.sz = 0.25;
          fence.transform3d.ry = snap.ry;
        }
        lastFencePos = { x: snap.x, z: snap.z };
        const updated = [...currentList, fence];
        brushWorkingObjects = updated;
        curState.onCommitObjectsChange(updated);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      const ctx = threeRef.current;
      const mode = latestRef.current.brushMode;

      // Comprobar primero si se pulsó una cara del sistema Roblox "Escalar por Caras"
      if (e.button === 0 && mode === 'gizmo' && ctx && ctx.facePickables.length > 0) {
        const r = renderer.domElement.getBoundingClientRect();
        _ndc.x = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
        _ndc.y = -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1;
        _raycaster.setFromCamera(_ndc, camera);
        const faceHits = _raycaster.intersectObjects(ctx.facePickables, false);
        if (faceHits.length > 0) {
          const meta = faceHits[0].object.userData?.nexusFaceHandle as
            | { objectId: string; axis: 'x' | 'y' | 'z'; sign: 1 | -1; baseHalf: number }
            | undefined;
          const targetObj = meta
            ? latestRef.current.scene.objects.find((o) => o.id === meta.objectId)
            : undefined;
          const objNode = meta ? ctx.objectMap.get(meta.objectId) : undefined;
          if (meta && targetObj && objNode && targetObj.transform3d) {
            e.stopPropagation();
            e.stopImmediatePropagation();
            const t = targetObj.transform3d;
            const initQuat = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(
                THREE.MathUtils.degToRad(t.rx),
                THREE.MathUtils.degToRad(t.ry),
                THREE.MathUtils.degToRad(t.rz)
              )
            );
            const localAxis = new THREE.Vector3(
              meta.axis === 'x' ? 1 : 0,
              meta.axis === 'y' ? 1 : 0,
              meta.axis === 'z' ? 1 : 0
            );
            const worldAxisDir = localAxis.applyQuaternion(initQuat).normalize();
            const initPos = new THREE.Vector3(t.x, t.y, t.z);
            const startTOnAxis = closestParamOnAxisToRay(initPos, worldAxisDir, _raycaster.ray);
            isDraggingGizmoRef.current = true;
            orbit.enabled = false;
            faceDragRef.current = {
              objectId: meta.objectId,
              axis: meta.axis,
              sign: meta.sign,
              baseHalf: Math.max(0.1, meta.baseHalf),
              initPos,
              initScale: new THREE.Vector3(
                Math.max(0.05, t.sx),
                Math.max(0.05, t.sy),
                Math.max(0.05, t.sz)
              ),
              initQuat,
              worldAxisDir,
              startTOnAxis,
              initialObjects: structuredClone(latestRef.current.scene.objects),
              changed: false,
            };
            requestRender();
            return;
          }
        }
      }

      if (e.button === 0 && mode !== 'gizmo') {
        isBrushPainting = true;
        brushWorkingObjects = null;
        lastFencePos = null;
        const pt = raycastWorldPoint(e.clientX, e.clientY);
        if (pt) applyBrushStrokeAt(pt, mode, true);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const fDrag = faceDragRef.current;
      const ctx = threeRef.current;
      if (fDrag && ctx) {
        const r = renderer.domElement.getBoundingClientRect();
        _ndc.x = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
        _ndc.y = -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1;
        _raycaster.setFromCamera(_ndc, camera);
        const curT = closestParamOnAxisToRay(fDrag.initPos, fDrag.worldAxisDir, _raycaster.ray);
        const deltaWorld = (curT - fDrag.startTOnAxis) * fDrag.sign;
        const fullScaleDenom = Math.max(0.1, fDrag.baseHalf * 2);
        const initS = fDrag.initScale[fDrag.axis];
        const nextS = Number(Math.max(0.08, initS + deltaWorld / fullScaleDenom).toFixed(3));
        const actualDeltaWorld = (nextS - initS) * fullScaleDenom;
        const nextPos = fDrag.initPos
          .clone()
          .addScaledVector(fDrag.worldAxisDir, fDrag.sign * actualDeltaWorld * 0.5);
        fDrag.changed = true;

        const grp = ctx.objectMap.get(fDrag.objectId);
        if (grp) {
          grp.position.copy(nextPos);
          grp.scale[fDrag.axis] = nextS;
        }
        const previewObjects = fDrag.initialObjects.map((o) =>
          o.id === fDrag.objectId && o.transform3d
            ? {
                ...o,
                transform3d: {
                  ...o.transform3d,
                  x: Number(nextPos.x.toFixed(3)),
                  y: Number(nextPos.y.toFixed(3)),
                  z: Number(nextPos.z.toFixed(3)),
                  [fDrag.axis === 'x' ? 'sx' : fDrag.axis === 'y' ? 'sy' : 'sz']: nextS,
                },
              }
            : o
        );
        latestRef.current.onPreviewObjectsChange(previewObjects);
        requestRender();
        return;
      }

      if (!isBrushPainting) return;
      const mode = latestRef.current.brushMode;
      if (mode === 'gizmo' || mode === 'scatter') return;
      const pt = raycastWorldPoint(e.clientX, e.clientY);
      if (pt) applyBrushStrokeAt(pt, mode, false);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (faceDragRef.current) {
        const finished = faceDragRef.current;
        faceDragRef.current = null;
        isDraggingGizmoRef.current = false;
        orbit.enabled = true;
        justFinishedDragRef.current = true;
        clearTimeout(finishDragTimeout);
        finishDragTimeout = window.setTimeout(() => {
          justFinishedDragRef.current = false;
        }, 90);
        if (finished.changed) {
          latestRef.current.onCommitObjectsChange(latestRef.current.scene.objects);
        }
        requestRender();
        return;
      }

      if (isBrushPainting) {
        isBrushPainting = false;
        if (brushWorkingObjects && latestRef.current.brushMode !== 'fence') {
          latestRef.current.onCommitObjectsChange(brushWorkingObjects);
        }
        brushWorkingObjects = null;
        return;
      }

      if (latestRef.current.brushMode !== 'gizmo') return;

      if (
        e.button !== 0 ||
        isDraggingGizmoRef.current ||
        justFinishedDragRef.current ||
        transformControls.axis !== null
      ) {
        return;
      }
      if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > 5) {
        return;
      }
      const ctx = threeRef.current;
      if (!ctx) return;
      const r = renderer.domElement.getBoundingClientRect();
      _ndc.x = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      _ndc.y = -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      const hits = _raycaster.intersectObjects(ctx.pickables, true);
      if (hits.length === 0) {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
          latestRef.current.onSelectObjects([]);
        }
        return;
      }
      let cur: THREE.Object3D | null = hits[0].object;
      let hitId: string | undefined;
      while (cur) {
        if (cur.userData?.nexusObjectId) {
          hitId = String(cur.userData.nexusObjectId);
          break;
        }
        cur = cur.parent;
      }
      if (!hitId) return;

      const prevSel = latestRef.current.selectedIds;
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        if (prevSel.includes(hitId)) {
          latestRef.current.onSelectObjects(prevSel.filter((id) => id !== hitId));
        } else {
          latestRef.current.onSelectObjects([...prevSel, hitId]);
        }
      } else {
        latestRef.current.onSelectObjects([hitId]);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(100, Math.round(entry.contentRect.width));
        const h = Math.max(100, Math.round(entry.contentRect.height));
        setViewportSize({ width: w, height: h });
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        orbit.update();
        renderer.render(threeScene, camera);
      }
    });
    ro.observe(host);

    threeRef.current = {
      renderer,
      threeScene,
      camera,
      orbit,
      transformControls,
      gridHelper,
      sunLight,
      hemiLight,
      ambientLight,
      objectsRoot,
      collidersRoot,
      faceHandlesRoot,
      facePickables: [],
      navMeshVisual: null,
      disposer,
      objectMap: new Map(),
      pickables: [],
      glbCache,
      texCache,
      animatedUniforms: [],
      isSoftwareGl,
      requestRender,
    };

    if (!isSoftwareGl) {
      renderer.compile(threeScene, camera);
    }
    requestRender();

    // Animar agua/nubes/hierba suavemente en GPU real (y en software bajo demanda para no saturar)
    let shaderTime = 0;
    const shaderTimerId = window.setInterval(() => {
      const ctx = threeRef.current;
      if (!ctx || ctx.isSoftwareGl || ctx.animatedUniforms.length === 0 || isDraggingGizmoRef.current) return;
      shaderTime += 0.033;
      for (const u of ctx.animatedUniforms) {
        u.uTime.value = shaderTime;
      }
      ctx.requestRender();
    }, 33);

    return () => {
      mounted = false;
      clearInterval(shaderTimerId);
      cancelAnimationFrame(frameId);
      clearTimeout(pollTimeoutId);
      clearTimeout(finishDragTimeout);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown, true);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      orbit.dispose();
      transformControls.dispose();
      disposer.disposeAll(renderer);
      for (const tex of texCache.values()) tex.dispose();
      texCache.clear();
      envTex.dispose();
      renderer.dispose();
      threeRef.current = null;
    };
  }, []);

  // Reconstruir objetos 3D, iluminación, NavMesh, colisiones y gizmo de TransformControls
  useEffect(() => {
    const ctx = threeRef.current;
    if (!ctx) return;
    // Evitar reconstruir la escena y desmontar el gizmo mientras el usuario arrastra un eje X/Y/Z
    if (isDraggingGizmoRef.current) return;

    const {
      threeScene,
      objectsRoot,
      collidersRoot,
      faceHandlesRoot,
      disposer,
      transformControls,
      gridHelper,
      sunLight,
      hemiLight,
      ambientLight,
      glbCache,
      texCache,
      requestRender,
    } = ctx;

    // Fondo, Niebla, Domo de Cielo Día/Noche e Iluminación inteligente con rebote
    const bgColor = scene.backgroundColor || '#131722';
    threeScene.background = new THREE.Color(bgColor);
    threeScene.environment = null;

    ctx.animatedUniforms = [];

    const lCfg = scene.lighting;
    if (lCfg) {
      if (lCfg.skyDomeAssetId) {
        const skyBlob = assetBlobs.get(lCfg.skyDomeAssetId);
        if (skyBlob) {
          const cachedSky = texCache.get(`sky_${lCfg.skyDomeAssetId}`);
          if (cachedSky) {
            threeScene.background = cachedSky;
            threeScene.environment = cachedSky;
          } else {
            const url = URL.createObjectURL(skyBlob);
            const loader = new THREE.TextureLoader();
            loader.load(url, (skyTex) => {
              skyTex.mapping = THREE.EquirectangularReflectionMapping;
              skyTex.colorSpace = THREE.SRGBColorSpace;
              texCache.set(`sky_${lCfg.skyDomeAssetId}`, skyTex);
              threeScene.background = skyTex;
              threeScene.environment = skyTex;
              URL.revokeObjectURL(url);
              requestRender();
            });
          }
        }
      }
      if (lCfg.dayNightEnabled) {
        const dn = computeDayNightLighting(lCfg);
        ambientLight.color.set(dn.ambientColor);
        ambientLight.intensity = dn.ambientIntensity;
        hemiLight.color.set(dn.zenithColor);
        hemiLight.groundColor.set(lCfg.groundColor);
        hemiLight.intensity = lCfg.smartBounce ? Math.max(0.45, lCfg.bounceIntensity * 1.15) : 0.4;
        sunLight.color.set(dn.sunColor);
        sunLight.intensity = dn.sunIntensity;
        sunLight.position.set(...dn.sunPosition);
        threeScene.fog = lCfg.fogEnabled
          ? new THREE.Fog(dn.fogColor, lCfg.fogNear, lCfg.fogFar)
          : null;
      } else {
        ambientLight.color.set(lCfg.ambientColor);
        ambientLight.intensity = lCfg.ambientIntensity;
        hemiLight.color.set(lCfg.skyColor);
        hemiLight.groundColor.set(lCfg.groundColor);
        hemiLight.intensity = lCfg.smartBounce ? Math.max(0.4, lCfg.bounceIntensity * 1.15) : 0.35;
        sunLight.color.set(lCfg.sunColor);
        sunLight.intensity = lCfg.sunIntensity;
        sunLight.position.set(14, 22, 10);
        threeScene.fog = lCfg.fogEnabled
          ? new THREE.Fog(lCfg.fogColor || bgColor, lCfg.fogNear, lCfg.fogFar)
          : null;
      }
    } else {
      threeScene.fog = new THREE.Fog(bgColor, 38, 120);
    }

    gridHelper.visible = showGrid && scene.gridVisible !== false;

    // Limpiar instancias previas sin destruir texturas/GLBs cacheados
    transformControls.detach();
    while (objectsRoot.children.length > 0) {
      objectsRoot.remove(objectsRoot.children[0]);
    }
    while (collidersRoot.children.length > 0) {
      collidersRoot.remove(collidersRoot.children[0]);
    }
    while (faceHandlesRoot.children.length > 0) {
      faceHandlesRoot.remove(faceHandlesRoot.children[0]);
    }
    ctx.facePickables = [];
    if (ctx.navMeshVisual) {
      threeScene.remove(ctx.navMeshVisual);
      ctx.navMeshVisual = null;
    }
    disposer.disposeAll(ctx.renderer);
    ctx.objectMap.clear();
    ctx.pickables = [];

    if (lCfg?.dayNightEnabled) {
      const dn = computeDayNightLighting(lCfg);
      const skyRes = createSkyDomeMesh(dn.zenithColor, dn.horizonColor, lCfg.cloudsEnabled !== false);
      disposer.trackGeometry(skyRes.mesh.geometry);
      disposer.trackMaterial(skyRes.mesh.material);
      objectsRoot.add(skyRes.mesh);
      ctx.animatedUniforms.push(skyRes.uniforms);
    }

    const obstaclePositions: THREE.Vector3[] = [];
    for (const o of scene.objects) {
      if (
        o.visible &&
        o.type === 'mesh_3d' &&
        o.mesh3d?.shape !== 'water' &&
        o.mesh3d?.shape !== 'terrain' &&
        o.mesh3d?.shape !== 'grass_field' &&
        o.mesh3d?.shape !== 'plane' &&
        o.transform3d
      ) {
        obstaclePositions.push(new THREE.Vector3(o.transform3d.x, o.transform3d.y, o.transform3d.z));
      }
    }

    const texLoader = new THREE.TextureLoader();
    const resolveTexture = (assetId?: string | null, isColor = true): THREE.Texture | null => {
      if (!assetId) return null;
      const cacheKey = `${assetId}_${isColor ? 'srgb' : 'lin'}`;
      const existing = texCache.get(cacheKey);
      if (existing) return existing;
      const blob = assetBlobs.get(assetId);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      const tex = texLoader.load(url, () => {
        URL.revokeObjectURL(url);
        requestRender();
      });
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
      texCache.set(cacheKey, tex);
      return tex;
    };

    // Construir cada objeto 3D de la escena
    for (const obj of scene.objects) {
      if (!obj.visible) continue;
      if (obj.type === 'ui_widget') continue;

      const t = obj.transform3d ?? DEFAULT_T3D;

      if (obj.type === 'mesh_3d') {
        const mCfg = obj.mesh3d ?? {
          shape: 'box',
          color: '#3b82f6',
          metalness: 0.25,
          roughness: 0.55,
          castShadow: true,
          receiveShadow: true,
        };

        const group = new THREE.Group();
        group.position.set(t.x, t.y, t.z);
        group.rotation.set(
          THREE.MathUtils.degToRad(t.rx),
          THREE.MathUtils.degToRad(t.ry),
          THREE.MathUtils.degToRad(t.rz)
        );
        group.scale.set(
          Math.max(0.05, t.sx),
          Math.max(0.05, t.sy),
          Math.max(0.05, t.sz)
        );
        group.userData = { nexusObjectId: obj.id };

        if (mCfg.shape === 'water') {
          const wCfg = mCfg.waterConfig ?? {
            width: 24,
            depth: 24,
            flowX: 0.6,
            flowZ: 0.2,
            waveAmplitude: 0.14,
            waveSpeed: 1.8,
            shallowColor: '#38bdf8',
            deepColor: '#0c4a6e',
            foamIntensity: 0.85,
          };
          const waterRes = createWaterSurfaceMesh(wCfg, obstaclePositions);
          disposer.trackGeometry(waterRes.mesh.geometry);
          disposer.trackMaterial(waterRes.mesh.material);
          group.add(waterRes.mesh);
          ctx.animatedUniforms.push(waterRes.uniforms);
        } else if (mCfg.shape === 'grass_field') {
          const fCfg = mCfg.foliageConfig ?? {
            kind: 'grass',
            instances: [],
            windStrength: 0.38,
            windSpeed: 2.4,
            interactionRadius: 1.8,
            colorBase: '#15803d',
            colorTip: '#4ade80',
          };
          if (fCfg.modelAssetId && fCfg.instances.length > 0) {
            const cachedScatter = glbCache.get(fCfg.modelAssetId);
            if (cachedScatter) {
              let protoMesh: THREE.Mesh | null = null;
              cachedScatter.scene.traverse((ch) => {
                if (!protoMesh && (ch as THREE.Mesh).isMesh) protoMesh = ch as THREE.Mesh;
              });
              if (protoMesh) {
                const srcMesh = protoMesh as THREE.Mesh;
                const instMesh = new THREE.InstancedMesh(srcMesh.geometry, srcMesh.material, fCfg.instances.length);
                instMesh.castShadow = mCfg.castShadow && !ctx.isSoftwareGl;
                instMesh.receiveShadow = mCfg.receiveShadow && !ctx.isSoftwareGl;
                const dummyMat = new THREE.Matrix4();
                const qTilt = new THREE.Quaternion();
                const qSpin = new THREE.Quaternion();
                const qTotal = new THREE.Quaternion();
                const upVec = new THREE.Vector3(0, 1, 0);
                const normVec = new THREE.Vector3(0, 1, 0);
                const posVec = new THREE.Vector3();
                const scVec = new THREE.Vector3();
                fCfg.instances.forEach((inst, idx) => {
                  posVec.set(inst.x, inst.y, inst.z);
                  qSpin.setFromAxisAngle(upVec, inst.rotY ?? 0);
                  if (fCfg.alignToNormal !== false) {
                    const hL = groundHeightAt(scene, inst.x - 0.35, inst.z);
                    const hR = groundHeightAt(scene, inst.x + 0.35, inst.z);
                    const hD = groundHeightAt(scene, inst.x, inst.z - 0.35);
                    const hU = groundHeightAt(scene, inst.x, inst.z + 0.35);
                    normVec.set(hL - hR, 0.7, hD - hU).normalize();
                    qTilt.setFromUnitVectors(upVec, normVec);
                    qTotal.multiplyQuaternions(qTilt, qSpin);
                  } else {
                    qTotal.copy(qSpin);
                  }
                  const s = Math.max(0.2, inst.scale ?? 1);
                  scVec.set(s, s, s);
                  dummyMat.compose(posVec, qTotal, scVec);
                  instMesh.setMatrixAt(idx, dummyMat);
                });
                instMesh.instanceMatrix.needsUpdate = true;
                group.add(instMesh);
              } else {
                const grassRes = createWindFoliageInstancedMesh(fCfg);
                disposer.trackGeometry(grassRes.mesh.geometry);
                disposer.trackMaterial(grassRes.mesh.material);
                group.add(grassRes.mesh);
                ctx.animatedUniforms.push(grassRes.uniforms);
              }
            } else {
              const grassRes = createWindFoliageInstancedMesh(fCfg);
              disposer.trackGeometry(grassRes.mesh.geometry);
              disposer.trackMaterial(grassRes.mesh.material);
              group.add(grassRes.mesh);
              ctx.animatedUniforms.push(grassRes.uniforms);
              const blob = assetBlobs.get(fCfg.modelAssetId);
              if (blob) {
                const targetId = fCfg.modelAssetId;
                void loadModel3DFromBlob(blob, undefined, { normalizeSize: 1.0 }).then((loaded) => {
                  glbCache.set(targetId, { scene: loaded.root, clipNames: loaded.clipNames });
                  requestRender();
                }).catch(() => {});
              }
            }
          } else {
            const grassRes = createWindFoliageInstancedMesh(fCfg);
            disposer.trackGeometry(grassRes.mesh.geometry);
            disposer.trackMaterial(grassRes.mesh.material);
            group.add(grassRes.mesh);
            ctx.animatedUniforms.push(grassRes.uniforms);
          }
        } else if (mCfg.shape === 'glb' && mCfg.glbAssetId) {
          const cached = glbCache.get(mCfg.glbAssetId);
          if (cached) {
            const clone = SkeletonUtils.clone(cached.scene);
            let meshCount = 0;
            let boneCount = 0;
            clone.traverse((child) => {
              if ((child as THREE.Bone).isBone) boneCount++;
              const cm = child as THREE.Mesh;
              if (cm.isMesh) {
                meshCount++;
                cm.castShadow = mCfg.castShadow && !ctx.isSoftwareGl;
                cm.receiveShadow = mCfg.receiveShadow && !ctx.isSoftwareGl;
              }
            });
            group.add(clone);
            if (boneCount > 0 && meshCount === 0) {
              group.add(new THREE.SkeletonHelper(clone));
            }
          } else {
            // Caja guía temporal mientras carga el modelo GLB/FBX desde IndexedDB
            const placeholderGeom = disposer.trackGeometry(new THREE.BoxGeometry(1, 1, 1));
            const placeholderMat = disposer.trackMaterial(
              new THREE.MeshStandardMaterial({
                color: mCfg.color || '#8b5cf6',
                wireframe: true,
              })
            );
            group.add(new THREE.Mesh(placeholderGeom, placeholderMat));

            const blob = assetBlobs.get(mCfg.glbAssetId);
            if (blob) {
              const targetAssetId = mCfg.glbAssetId;
              void loadModel3DFromBlob(blob, undefined, { normalizeSize: 1.0 })
                .then((loaded) => {
                  glbCache.set(targetAssetId, {
                    scene: loaded.root,
                    clipNames: loaded.clipNames,
                  });
                  if (
                    loaded.clipNames.length > 0 &&
                    (!mCfg.clipNames || mCfg.clipNames.length === 0)
                  ) {
                    const updated = latestRef.current.scene.objects.map((cand) =>
                      cand.id === obj.id && cand.mesh3d
                        ? { ...cand, mesh3d: { ...cand.mesh3d, clipNames: loaded.clipNames } }
                        : cand
                    );
                    latestRef.current.onPreviewObjectsChange(updated);
                  }
                  requestRender();
                })
                .catch(() => {
                  // Ignorar fallo silencioso en miniatura de carga
                });
            }
          }
        } else {
          const isTerrain = mCfg.shape === 'terrain';
          const geom = disposer.trackGeometry(buildModularGeometry(mCfg));
          const mapTex = resolveTexture(mCfg.textureAssetId, true);
          const normalTex = resolveTexture(mCfg.normalAssetId, false);
          const mat = disposer.trackMaterial(
            new THREE.MeshStandardMaterial({
              color: mapTex || isTerrain ? '#ffffff' : mCfg.color || '#3b82f6',
              vertexColors: isTerrain,
              metalness: isTerrain ? 0.04 : mCfg.metalness ?? 0.2,
              roughness: isTerrain ? 0.88 : mCfg.roughness ?? 0.6,
              emissive: new THREE.Color(mCfg.emissive || '#000000'),
              emissiveIntensity: mCfg.emissiveIntensity ?? 0,
              map: mapTex,
              normalMap: normalTex,
              transparent: obj.opacity < 1,
              opacity: obj.opacity,
            })
          );
          const mesh = new THREE.Mesh(geom, mat);
          mesh.castShadow = mCfg.castShadow && !ctx.isSoftwareGl;
          mesh.receiveShadow = mCfg.receiveShadow && !ctx.isSoftwareGl;
          group.add(mesh);
        }

        // Previsualización de Cuerdas / Puentes / Gel / Arena Soft-Body
        if (obj.softBody?.enabled) {
          const sb = createSoftBodySimulation(obj.softBody, 0, 0, 0);
          const nodeGeom = disposer.trackGeometry(new THREE.SphereGeometry(sb.radius, 8, 6));
          const nodeMat = disposer.trackMaterial(
            new THREE.MeshStandardMaterial({ color: sb.color, roughness: 0.55 })
          );
          for (const n of sb.nodes) {
            const nm = new THREE.Mesh(nodeGeom, nodeMat);
            nm.position.set(n.x, n.y, n.z);
            group.add(nm);
          }
          if (sb.constraints.length > 0) {
            const linePts: THREE.Vector3[] = [];
            for (const c of sb.constraints) {
              const a = sb.nodes[c.a];
              const b = sb.nodes[c.b];
              linePts.push(new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z));
            }
            const lGeo = disposer.trackGeometry(new THREE.BufferGeometry().setFromPoints(linePts));
            const lMat = disposer.trackMaterial(new THREE.LineBasicMaterial({ color: sb.color }));
            group.add(new THREE.LineSegments(lGeo, lMat));
          }
        }

        // Borde visual dinámico ajustado a las dimensiones reales (terreno, agua, GLB o primitiva)
        if (selectedIds.includes(obj.id)) {
          const lb = computeLocalVisualBounds(group, obj);
          const bw = Math.max(0.15, lb.max.x - lb.min.x) + 0.04;
          const bh = Math.max(0.15, lb.max.y - lb.min.y) + 0.04;
          const bd = Math.max(0.15, lb.max.z - lb.min.z) + 0.04;
          const cx = (lb.min.x + lb.max.x) * 0.5;
          const cy = (lb.min.y + lb.max.y) * 0.5;
          const cz = (lb.min.z + lb.max.z) * 0.5;
          const selBox = disposer.trackGeometry(new THREE.BoxGeometry(bw, bh, bd));
          const selEdges = disposer.trackGeometry(new THREE.EdgesGeometry(selBox));
          const selMat = disposer.trackMaterial(
            new THREE.LineBasicMaterial({ color: '#38bdf8' })
          );
          const selWire = new THREE.LineSegments(selEdges, selMat);
          selWire.position.set(cx, cy, cz);
          group.add(selWire);
        }

        objectsRoot.add(group);
        ctx.objectMap.set(obj.id, group);
        ctx.pickables.push(group);
      } else if (obj.type === 'light_3d') {
        const lc = obj.light3d ?? {
          lightType: 'point',
          color: '#fde68a',
          intensity: 3.5,
          distance: 18,
          decay: 1.5,
          angleDeg: 45,
          penumbra: 0.3,
          castShadow: false,
        };
        const holder = new THREE.Group();
        holder.position.set(t.x, t.y, t.z);
        holder.rotation.set(
          THREE.MathUtils.degToRad(t.rx),
          THREE.MathUtils.degToRad(t.ry),
          THREE.MathUtils.degToRad(t.rz)
        );
        holder.userData = { nexusObjectId: obj.id };

        if (lc.lightType === 'spot') {
          const spot = new THREE.SpotLight(
            lc.color,
            lc.intensity,
            lc.distance,
            THREE.MathUtils.degToRad(lc.angleDeg),
            lc.penumbra,
            lc.decay
          );
          spot.castShadow = lc.castShadow && !ctx.isSoftwareGl;
          spot.target.position.set(0, -1, 0);
          holder.add(spot);
          holder.add(spot.target);

          // Cono alámbrico direccional visible en el visor 3D (vértice en el foco, base hacia -Y)
          const coneLen = Math.min(12, Math.max(2.2, lc.distance * 0.45));
          const halfAngleRad = THREE.MathUtils.degToRad(Math.max(4, Math.min(82, lc.angleDeg)));
          const coneRadius = Math.max(0.25, Math.tan(halfAngleRad) * coneLen);
          const coneGeom = disposer.trackGeometry(new THREE.ConeGeometry(coneRadius, coneLen, 16, 1, true));
          coneGeom.translate(0, -coneLen * 0.5, 0);
          const coneWire = disposer.trackGeometry(new THREE.WireframeGeometry(coneGeom));
          const coneMat = disposer.trackMaterial(
            new THREE.LineBasicMaterial({
              color: lc.color || '#fde68a',
              transparent: true,
              opacity: selectedIds.includes(obj.id) ? 0.92 : 0.6,
            })
          );
          holder.add(new THREE.LineSegments(coneWire, coneMat));

          // Rayo central de dirección
          const rayGeom = disposer.trackGeometry(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(0, -coneLen * 1.15, 0),
            ])
          );
          holder.add(new THREE.Line(rayGeom, coneMat));
        } else if (lc.lightType === 'directional') {
          const dir = new THREE.DirectionalLight(lc.color, lc.intensity);
          dir.target.position.set(0, -1, 0);
          holder.add(dir);
          holder.add(dir.target);

          const dirRayGeom = disposer.trackGeometry(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(0, -3.2, 0),
              new THREE.Vector3(-0.35, -2.5, 0),
              new THREE.Vector3(0, -3.2, 0),
              new THREE.Vector3(0.35, -2.5, 0),
            ])
          );
          const dirMat = disposer.trackMaterial(
            new THREE.LineBasicMaterial({ color: lc.color || '#fde68a' })
          );
          holder.add(new THREE.LineSegments(dirRayGeom, dirMat));
        } else {
          const pt = new THREE.PointLight(lc.color, lc.intensity, lc.distance, lc.decay);
          holder.add(pt);
        }

        const bulbGeom = disposer.trackGeometry(new THREE.OctahedronGeometry(0.32, 0));
        const bulbMat = disposer.trackMaterial(
          new THREE.MeshBasicMaterial({ color: lc.color, wireframe: true })
        );
        holder.add(new THREE.Mesh(bulbGeom, bulbMat));

        objectsRoot.add(holder);
        ctx.objectMap.set(obj.id, holder);
        ctx.pickables.push(holder);
      } else if (obj.type === 'camera_3d') {
        const holder = new THREE.Group();
        holder.position.set(t.x, t.y, t.z);
        holder.rotation.set(
          THREE.MathUtils.degToRad(t.rx),
          THREE.MathUtils.degToRad(t.ry),
          THREE.MathUtils.degToRad(t.rz)
        );
        holder.userData = { nexusObjectId: obj.id };

        const camGeom = disposer.trackGeometry(new THREE.ConeGeometry(0.4, 0.75, 4));
        camGeom.rotateX(Math.PI / 2);
        const camMat = disposer.trackMaterial(
          new THREE.MeshBasicMaterial({
            color: obj.camera3d?.isMainCamera ? '#22d3ee' : '#94a3b8',
            wireframe: true,
          })
        );
        holder.add(new THREE.Mesh(camGeom, camMat));
        objectsRoot.add(holder);
        ctx.objectMap.set(obj.id, holder);
        ctx.pickables.push(holder);
      } else if (obj.type === 'container') {
        const folderGroup = new THREE.Group();
        folderGroup.position.set(t.x, t.y, t.z);
        folderGroup.rotation.set(
          THREE.MathUtils.degToRad(t.rx),
          THREE.MathUtils.degToRad(t.ry),
          THREE.MathUtils.degToRad(t.rz)
        );
        folderGroup.scale.set(
          Math.max(0.05, t.sx),
          Math.max(0.05, t.sy),
          Math.max(0.05, t.sz)
        );
        folderGroup.userData = { nexusObjectId: obj.id };
        objectsRoot.add(folderGroup);
        ctx.objectMap.set(obj.id, folderGroup);
      }
    }

    // Jerarquía Padre-Hijo 3D real dentro del visor
    for (const obj of scene.objects) {
      if (!obj.parentId || obj.parentId === obj.id) continue;
      const childNode = ctx.objectMap.get(obj.id);
      const parentNode = ctx.objectMap.get(obj.parentId);
      if (childNode && parentNode) {
        parentNode.add(childNode);
      }
    }

    // Visualización de colisionadores 3D inteligentes (`mesh_exact`) y estándar (`box`/`sphere`/`capsule`)
    let colliderEditProxy: THREE.Object3D | null = null;
    if (showColliders) {
      for (const obj of scene.objects) {
        if (!obj.visible || obj.type !== 'mesh_3d' || obj.physics3d?.enabled === false) continue;
        const t = obj.transform3d ?? DEFAULT_T3D;
        const shape = obj.physics3d?.shape ?? 'box';
        const isExactShape =
          shape === 'mesh_exact' ||
          obj.mesh3d?.shape === 'arch' ||
          obj.mesh3d?.shape === 'stairs';
        if (isExactShape) {
          let tri = buildWorldTrimeshData(obj);
          if (!tri && obj.mesh3d?.shape === 'glb') {
            const grp = ctx.objectMap.get(obj.id);
            if (grp) {
              grp.updateWorldMatrix(true, true);
              tri = extractWorldTrimeshFromObject3D(grp);
            }
          }
          if (tri && tri.triangles.length >= 9) {
            const wireGeom = disposer.trackGeometry(new THREE.BufferGeometry());
            wireGeom.setAttribute('position', new THREE.BufferAttribute(tri.triangles, 3));
            const wireMat = disposer.trackMaterial(
              new THREE.MeshBasicMaterial({
                color: '#06b6d4',
                wireframe: true,
                transparent: true,
                opacity: 0.72,
              })
            );
            collidersRoot.add(new THREE.Mesh(wireGeom, wireMat));
          }
        } else {
          const he = obj.physics3d?.halfExtents ?? {
            x: Math.max(0.2, Math.abs(t.sx) * 0.5),
            y: Math.max(0.1, Math.abs(t.sy) * 0.5),
            z: Math.max(0.2, Math.abs(t.sz) * 0.5),
          };
          const radSph = obj.physics3d?.radius ?? Math.max(he.x, he.y, he.z);
          const colGeom = disposer.trackGeometry(
            shape === 'sphere'
              ? new THREE.SphereGeometry(radSph, 12, 8)
              : shape === 'capsule'
                ? new THREE.CapsuleGeometry(Math.min(he.x, he.z), Math.max(0.2, he.y * 2 - Math.min(he.x, he.z) * 2), 6, 12)
                : new THREE.BoxGeometry(he.x * 2, he.y * 2, he.z * 2)
          );
          const colEdges = disposer.trackGeometry(new THREE.EdgesGeometry(colGeom));
          const colMat = disposer.trackMaterial(
            new THREE.LineBasicMaterial({
              color: obj.physics3d?.isTrigger ? '#f59e0b' : '#22c55e',
            })
          );
          const wire = new THREE.LineSegments(colEdges, colMat);
          const objQuat = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
              THREE.MathUtils.degToRad(t.rx),
              THREE.MathUtils.degToRad(t.ry),
              THREE.MathUtils.degToRad(t.rz)
            )
          );
          const off = obj.physics3d?.offset ?? { x: 0, y: 0, z: 0 };
          const worldOff = new THREE.Vector3(off.x, off.y, off.z).applyQuaternion(objQuat);
          wire.position.set(t.x + worldOff.x, t.y + worldOff.y, t.z + worldOff.z);
          wire.quaternion.copy(objQuat);
          collidersRoot.add(wire);

          if (editColliderZone && selectedIds.length === 1 && selectedIds[0] === obj.id) {
            const proxy = new THREE.Group();
            proxy.position.copy(wire.position);
            proxy.quaternion.copy(objQuat);
            proxy.scale.set(1, 1, 1);
            proxy.userData = {
              nexusColliderTargetId: obj.id,
              objPos: [t.x, t.y, t.z],
              objQuat: [objQuat.x, objQuat.y, objQuat.z, objQuat.w],
              initHe: [he.x, he.y, he.z],
              initRadius: radSph,
            };
            collidersRoot.add(proxy);
            colliderEditProxy = proxy;
          }
        }
      }
    }

    // Visualización de Cono de Visión IA 3D en el editor
    for (const obj of scene.objects) {
      if (!obj.visible) continue;
      const aiComp = obj.components.find(
        (c) => c.enabled && (c.type === 'chase_player' || c.type === 'ai.enemy_chaser')
      );
      const hasAi = Boolean(obj.aiAgent?.enabled || aiComp);
      if (!hasAi) continue;
      const isSelected = selectedIds.includes(obj.id);
      if (!isSelected && obj.aiAgent?.showVisionCone === false && !showColliders) continue;
      const t = obj.transform3d ?? DEFAULT_T3D;
      const fovDeg = Math.max(
        15,
        Math.min(360, Number(obj.aiAgent?.visionFovDeg ?? aiComp?.config?.visionFovDeg ?? 110))
      );
      const range = Math.max(
        2,
        Math.min(120, Number(obj.aiAgent?.visionRange ?? aiComp?.config?.visionRange ?? aiComp?.config?.detectRadius ?? 24))
      );
      const halfRad = THREE.MathUtils.degToRad(fovDeg * 0.5);
      const pts: THREE.Vector3[] = [];
      const steps = fovDeg >= 355 ? 24 : 12;
      for (let i = 0; i <= steps; i++) {
        const a = -halfRad + (i / steps) * (halfRad * 2);
        const px = Math.sin(a) * range;
        const pz = Math.cos(a) * range;
        if (i === 0 && fovDeg < 355) {
          pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(px, 0, pz));
        }
        if (i < steps) {
          const na = -halfRad + ((i + 1) / steps) * (halfRad * 2);
          pts.push(
            new THREE.Vector3(px, 0, pz),
            new THREE.Vector3(Math.sin(na) * range, 0, Math.cos(na) * range)
          );
        }
        if (i === steps && fovDeg < 355) {
          pts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(px, 0, pz));
        }
      }
      const coneGeo = disposer.trackGeometry(new THREE.BufferGeometry().setFromPoints(pts));
      const coneMat = disposer.trackMaterial(
        new THREE.LineBasicMaterial({
          color: isSelected ? '#f59e0b' : '#d97706',
          transparent: true,
          opacity: isSelected ? 0.92 : 0.45,
        })
      );
      const coneWire = new THREE.LineSegments(coneGeo, coneMat);
      coneWire.position.set(t.x, t.y + 0.12, t.z);
      coneWire.rotation.set(0, THREE.MathUtils.degToRad(t.ry), 0);
      collidersRoot.add(coneWire);
    }

    // Visualización de NavMesh mediante un único InstancedMesh
    if (showNavMesh && scene.navMesh) {
      const nav = scene.navMesh;
      let count = 0;
      for (let i = 0; i < nav.walkable.length; i++) {
        if (nav.walkable[i] === 1) count++;
      }
      if (count > 0) {
        const cellGeom = disposer.trackGeometry(
          new THREE.PlaneGeometry(nav.cellSize * 0.86, nav.cellSize * 0.86)
        );
        cellGeom.rotateX(-Math.PI / 2);
        const cellMat = disposer.trackMaterial(
          new THREE.MeshBasicMaterial({
            color: '#06b6d4',
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -1,
          })
        );
        const inst = new THREE.InstancedMesh(cellGeom, cellMat, count);
        let idx = 0;
        _scale.set(1, 1, 1);
        _quat.identity();
        for (let r = 0; r < nav.rows; r++) {
          for (let c = 0; c < nav.cols; c++) {
            const cellIdx = r * nav.cols + c;
            if (nav.walkable[cellIdx] !== 1) continue;
            _vec3.set(
              nav.originX + (c + 0.5) * nav.cellSize,
              (nav.heights[cellIdx] ?? 0) + 0.03,
              nav.originZ + (r + 0.5) * nav.cellSize
            );
            _mat4.compose(_vec3, _quat, _scale);
            inst.setMatrixAt(idx++, _mat4);
          }
        }
        inst.instanceMatrix.needsUpdate = true;
        inst.computeBoundingSphere();
        threeScene.add(inst);
        ctx.navMeshVisual = inst;
      }
    }

    // Adjuntar gizmo TransformControls o Handles Roblox "Por Caras" al objeto seleccionado
    if (selectedIds.length === 1 && brushMode === 'gizmo') {
      const primary = scene.objects.find((o) => o.id === selectedIds[0]);
      const obj3d = primary && !primary.locked ? ctx.objectMap.get(primary.id) : undefined;
      if (colliderEditProxy) {
        transformControls.attach(colliderEditProxy);
      } else if (
        primary &&
        obj3d &&
        activeTool === 'scale' &&
        faceScaleEnabled &&
        primary.type === 'mesh_3d' &&
        primary.mesh3d?.shape !== 'terrain' &&
        primary.mesh3d?.shape !== 'water' &&
        primary.mesh3d?.shape !== 'grass_field'
      ) {
        // Ocultar TransformControls genérico y dibujar los 6 tiradores por cara (+X/-X/+Y/-Y/+Z/-Z)
        const t = primary.transform3d ?? DEFAULT_T3D;
        const lb = computeLocalVisualBounds(obj3d, primary);
        const halfLocalX = Math.max(0.1, (lb.max.x - lb.min.x) * 0.5);
        const halfLocalY = Math.max(0.1, (lb.max.y - lb.min.y) * 0.5);
        const halfLocalZ = Math.max(0.1, (lb.max.z - lb.min.z) * 0.5);
        const localCenter = new THREE.Vector3(
          (lb.min.x + lb.max.x) * 0.5,
          (lb.min.y + lb.max.y) * 0.5,
          (lb.min.z + lb.max.z) * 0.5
        );
        const objQuat = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            THREE.MathUtils.degToRad(t.rx),
            THREE.MathUtils.degToRad(t.ry),
            THREE.MathUtils.degToRad(t.rz)
          )
        );
        const objPos = new THREE.Vector3(t.x, t.y, t.z);
        const faces: Array<{
          axis: 'x' | 'y' | 'z';
          sign: 1 | -1;
          baseHalf: number;
          localOffset: THREE.Vector3;
          color: string;
        }> = [
          { axis: 'x', sign: 1, baseHalf: halfLocalX, localOffset: new THREE.Vector3(halfLocalX * Math.max(0.05, t.sx), 0, 0), color: '#ef4444' },
          { axis: 'x', sign: -1, baseHalf: halfLocalX, localOffset: new THREE.Vector3(-halfLocalX * Math.max(0.05, t.sx), 0, 0), color: '#ef4444' },
          { axis: 'y', sign: 1, baseHalf: halfLocalY, localOffset: new THREE.Vector3(0, halfLocalY * Math.max(0.05, t.sy), 0), color: '#22c55e' },
          { axis: 'y', sign: -1, baseHalf: halfLocalY, localOffset: new THREE.Vector3(0, -halfLocalY * Math.max(0.05, t.sy), 0), color: '#22c55e' },
          { axis: 'z', sign: 1, baseHalf: halfLocalZ, localOffset: new THREE.Vector3(0, 0, halfLocalZ * Math.max(0.05, t.sz)), color: '#3b82f6' },
          { axis: 'z', sign: -1, baseHalf: halfLocalZ, localOffset: new THREE.Vector3(0, 0, -halfLocalZ * Math.max(0.05, t.sz)), color: '#3b82f6' },
        ];
        const handleGeo = disposer.trackGeometry(new THREE.BoxGeometry(0.24, 0.24, 0.24));
        for (const f of faces) {
          const mat = disposer.trackMaterial(
            new THREE.MeshBasicMaterial({ color: f.color, depthTest: false })
          );
          const mesh = new THREE.Mesh(handleGeo, mat);
          mesh.renderOrder = 999;
          const worldHandlePos = localCenter
            .clone()
            .multiply(new THREE.Vector3(Math.max(0.05, t.sx), Math.max(0.05, t.sy), Math.max(0.05, t.sz)))
            .add(f.localOffset)
            .applyQuaternion(objQuat)
            .add(objPos);
          mesh.position.copy(worldHandlePos);
          mesh.quaternion.copy(objQuat);
          mesh.userData = {
            nexusFaceHandle: {
              objectId: primary.id,
              axis: f.axis,
              sign: f.sign,
              baseHalf: f.baseHalf,
            },
          };
          faceHandlesRoot.add(mesh);
          ctx.facePickables.push(mesh);
        }
      } else if (obj3d) {
        transformControls.attach(obj3d);
      }
    }

    requestRender();
  }, [scene, selectedIds, assetBlobs, showGrid, showNavMesh, showColliders, editColliderZone, activeTool, faceScaleEnabled, brushMode]);

  // Cambiar modo de TransformControls / OrbitControls según herramienta o pincel activo
  useEffect(() => {
    const ctx = threeRef.current;
    if (!ctx) return;
    if (editColliderZone && activeTool === 'rotate') {
      ctx.transformControls.setMode('translate');
    } else {
      ctx.transformControls.setMode(mapToolToTransformMode(activeTool));
    }
    ctx.orbit.mouseButtons.LEFT =
      brushMode === 'gizmo' ? THREE.MOUSE.ROTATE : (null as unknown as THREE.MOUSE);
    ctx.requestRender();
  }, [activeTool, brushMode, editColliderZone]);

  // Encuadrar cámara cuando el usuario pulsa "Ajustar"
  useEffect(() => {
    if (fitRequestTick === 0) return;
    const ctx = threeRef.current;
    if (!ctx) return;
    ctx.camera.position.set(12, 9.5, 13.5);
    ctx.orbit.target.set(0, 0.5, 0);
    ctx.orbit.update();
    ctx.requestRender();
  }, [fitRequestTick]);

  // Creador modular rápido 3D
  const handleAddModular = (
    type: GameObjectType,
    shape3d?: Mesh3DShape,
    presetName?: string
  ) => {
    const count = scene.objects.length;
    const isWorldLayer = shape3d === 'plane' || shape3d === 'terrain' || shape3d === 'water' || shape3d === 'grass_field';
    const offset = isWorldLayer ? 0 : ((count % 5) - 2) * 1.4;
    const baseY =
      shape3d === 'terrain' || shape3d === 'grass_field' || shape3d === 'plane'
        ? 0
        : shape3d === 'water'
          ? -0.25
          : type === 'light_3d'
            ? 4
            : type === 'camera_3d'
              ? 2.5
              : groundHeightAt(scene, offset, 0) + (shape3d === 'glb' ? 0.5 : 1.0);
    const created = createGameObject(type, scene.objects, {
      name: presetName,
      shape3d,
      x3d: offset,
      y3d: Number(baseY.toFixed(3)),
      z3d: 0,
    });
    if (presetName === 'Valla') {
      created.tags = ['valla'];
      if (created.mesh3d) created.mesh3d.color = '#92400e';
      if (created.transform3d) {
        created.transform3d.sx = 2.4;
        created.transform3d.sy = 1.1;
        created.transform3d.sz = 0.25;
      }
    }
    onUpdateScene((s) => ({
      ...s,
      objects: [...s.objects, created],
    }));
    onSelectObjects([created.id]);
    setBrushMode('gizmo');
  };

  // Operaciones booleanas CSG reales (Unir / Perforar)
  const selectedMeshes = scene.objects.filter(
    (o) =>
      selectedIds.includes(o.id) &&
      o.type === 'mesh_3d' &&
      o.mesh3d &&
      o.mesh3d.shape !== 'glb'
  );

  const handleRunCsg = (mode: 'union' | 'subtract') => {
    if (selectedMeshes.length < 2) {
      onNotify?.(
        'info',
        'Selecciona 2 o más mallas 3D (usa Shift+clic) para aplicar Unión o Perforación CSG.'
      );
      return;
    }
    try {
      const [baseObj, ...toolObjects] = selectedMeshes;
      const result = performCsgOperation(baseObj, toolObjects, mode);
      const removeSet = new Set(selectedMeshes.map((m) => m.id));
      const newObj = createGameObject('mesh_3d', scene.objects, {
        name: `${baseObj.name}_${mode === 'union' ? 'CSG_Union' : 'CSG_Corte'}`,
        shape3d: 'csg',
        x3d: result.center.x,
        y3d: result.center.y,
        z3d: result.center.z,
      });
      newObj.mesh3d = {
        ...baseObj.mesh3d!,
        shape: 'csg',
        csgGeometryJson: result.geometryJson,
      };
      newObj.transform3d = {
        x: Number(result.center.x.toFixed(3)),
        y: Number(result.center.y.toFixed(3)),
        z: Number(result.center.z.toFixed(3)),
        rx: 0,
        ry: 0,
        rz: 0,
        sx: 1,
        sy: 1,
        sz: 1,
      };
      newObj.physics3d = baseObj.physics3d ? structuredClone(baseObj.physics3d) : undefined;

      onCommitObjectsChange([
        ...scene.objects.filter((o) => !removeSet.has(o.id)),
        newObj,
      ]);
      onSelectObjects([newObj.id]);
      onNotify?.(
        'success',
        `Operación CSG (${mode === 'union' ? 'Unión' : 'Perforación'}) completada (${result.vertexCount} vértices).`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error en operación CSG.';
      onNotify?.('error', msg);
    }
  };

  const handleBakeNavMesh = () => {
    const nav = buildNavMeshFromScene(scene, { cellSize: 1.2, maxSlopeDeg: 45 });
    const walkableCells = nav.walkable.reduce((acc, v) => acc + (v === 1 ? 1 : 0), 0);
    onUpdateScene((s) => ({ ...s, navMesh: nav }));
    setShowNavMesh(true);
    onNotify?.(
      'success',
      `Mapa IA (NavMesh) generado: ${walkableCells} celdas transitables (${nav.cols}×${nav.rows}).`
    );
  };

  return (
    <div className="relative flex-1 overflow-hidden bg-[#0e1118] select-none">
      {/* Contenedor aislado para WebGLRenderer */}
      <div
        ref={hostRef}
        data-testid="nexus-3d-stage-host"
        className="h-full w-full"
      />

      {/* Superposición editable de Interfaces HTML/CSS/JS sobre el 3D */}
      <UIWidgetOverlayLayer
        mode="editor"
        projectMode="3d"
        objects={scene.objects}
        stage={stage}
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

      {/* Barra superior compacta del Constructor Modular 3D + CSG + NavMesh (sin backdrop-blur) */}
      <div className="absolute left-3 right-3 top-3 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg border border-[#32384a] bg-[#151822]/95 px-2 py-1 shadow-lg">
          <span className="px-1 text-[10px] font-bold uppercase tracking-wider text-sky-400">
            Constructor 3D
          </span>
          {(
            [
              ['box', 'Cubo'],
              ['ramp', 'Rampa'],
              ['stairs', 'Escalera'],
              ['cylinder', 'Cilindro'],
              ['arch', 'Arco'],
              ['plane', 'Plano'],
              ['sphere', 'Esfera'],
            ] as Array<[Mesh3DShape, string]>
          ).map(([shape, label]) => (
            <button
              key={shape}
              type="button"
              onClick={() => handleAddModular('mesh_3d', shape, label)}
              className="inline-flex items-center gap-1 rounded border border-[#2c3142] bg-[#1e2330] px-2 py-1 text-[11px] font-medium text-zinc-200 hover:border-sky-500/60 hover:bg-[#272e40]"
            >
              <Box className="h-3 w-3 text-sky-400" />
              <span>{label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleAddModular('mesh_3d', 'terrain', 'Terreno')}
            className="inline-flex items-center gap-1 rounded border border-[#2c3142] bg-[#1e2330] px-2 py-1 text-[11px] font-medium text-emerald-200 hover:border-emerald-500/60"
          >
            <Mountain className="h-3 w-3 text-emerald-400" />
            <span>Terreno</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddModular('mesh_3d', 'water', 'Agua')}
            className="inline-flex items-center gap-1 rounded border border-[#2c3142] bg-[#1e2330] px-2 py-1 text-[11px] font-medium text-cyan-200 hover:border-cyan-500/60"
          >
            <Droplets className="h-3 w-3 text-cyan-400" />
            <span>Agua</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddModular('mesh_3d', 'grass_field', 'Hierba')}
            className="inline-flex items-center gap-1 rounded border border-[#2c3142] bg-[#1e2330] px-2 py-1 text-[11px] font-medium text-lime-200 hover:border-lime-500/60"
          >
            <Sprout className="h-3 w-3 text-lime-400" />
            <span>Hierba</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddModular('mesh_3d', 'box', 'Valla')}
            className="inline-flex items-center gap-1 rounded border border-[#2c3142] bg-[#1e2330] px-2 py-1 text-[11px] font-medium text-amber-200 hover:border-amber-500/60"
          >
            <Fence className="h-3 w-3 text-amber-400" />
            <span>Valla</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddModular('light_3d', undefined, 'Luz_3D')}
            className="inline-flex items-center gap-1 rounded border border-[#2c3142] bg-[#1e2330] px-2 py-1 text-[11px] font-medium text-amber-200 hover:border-amber-500/60"
          >
            <Lightbulb className="h-3 w-3 text-amber-400" />
            <span>Luz 3D</span>
          </button>
          <button
            type="button"
            onClick={() => handleAddModular('camera_3d', undefined, 'Camara_3D')}
            className="inline-flex items-center gap-1 rounded border border-[#2c3142] bg-[#1e2330] px-2 py-1 text-[11px] font-medium text-cyan-200 hover:border-cyan-500/60"
          >
            <Camera className="h-3 w-3 text-cyan-400" />
            <span>Cámara 3D</span>
          </button>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg border border-[#32384a] bg-[#151822]/95 px-2 py-1 shadow-lg">
          <button
            type="button"
            onClick={() => handleRunCsg('union')}
            disabled={selectedMeshes.length < 2}
            title="Unir las mallas 3D seleccionadas (Shift+clic)"
            className="inline-flex items-center gap-1 rounded bg-indigo-600/85 px-2 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
          >
            <Combine className="h-3 w-3" />
            <span>Unir CSG</span>
          </button>
          <button
            type="button"
            onClick={() => handleRunCsg('subtract')}
            disabled={selectedMeshes.length < 2}
            title="Perforar la 1ª malla usando las siguientes seleccionadas"
            className="inline-flex items-center gap-1 rounded bg-rose-600/85 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
          >
            <Scissors className="h-3 w-3" />
            <span>Perforar CSG</span>
          </button>
          <span className="mx-0.5 h-4 w-px bg-[#303647]" aria-hidden="true" />
          <button
            type="button"
            onClick={handleBakeNavMesh}
            title={
              scene.navMesh
                ? 'Recalcula las zonas transitables tras añadir obstáculos, rampas o terreno nuevo'
                : 'Genera el primer Mapa IA (NavMesh) para navegación de enemigos'
            }
            className="inline-flex items-center gap-1 rounded bg-cyan-600/85 px-2 py-1 text-[11px] font-semibold text-white hover:bg-cyan-500"
          >
            <Compass className="h-3 w-3" />
            <span>{scene.navMesh ? 'Actualizar Mapa IA' : 'Crear Mapa IA'}</span>
          </button>
        </div>
      </div>

      {/* Barra inferior compacta de Gizmo, Pinceles de Terreno/Scatter/Valla, Rejilla y NavMesh */}
      <div className="absolute bottom-3 left-3 right-3 z-30 flex flex-wrap items-center gap-1 rounded-md border border-[#32384a] bg-[#151822]/95 px-2 py-1 shadow-lg">
        {(
          [
            ['move', 'Mover (W)', Move],
            ['rotate', 'Rotar (E)', RotateCw],
            ['scale', 'Escalar (S)', Maximize2],
          ] as const
        ).map(([toolId, label, Icon]) => (
          <button
            key={toolId}
            type="button"
            onClick={() => {
              setBrushMode('gizmo');
              onSelectTool(toolId);
            }}
            title={label}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
              brushMode === 'gizmo' && (activeTool === toolId || (activeTool === 'select' && toolId === 'move'))
                ? 'bg-blue-600/30 text-blue-300'
                : 'text-zinc-400 hover:bg-[#232838] hover:text-zinc-100'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{label.split(' ')[0]}</span>
          </button>
        ))}

        {activeTool === 'scale' && (
          <button
            type="button"
            onClick={() => setFaceScaleEnabled((v) => !v)}
            aria-pressed={faceScaleEnabled}
            title="Escalar estirando cara a cara (estilo Roblox) sin deformar el lado opuesto"
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
              faceScaleEnabled ? 'bg-sky-600/30 text-sky-200 ring-1 ring-sky-500/50' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <span>Por Caras</span>
          </button>
        )}

        <span className="mx-0.5 h-4 w-px bg-[#303647]" aria-hidden="true" />

        {(
          [
            ['sculpt_raise', 'Elevar terreno', Mountain],
            ['sculpt_lower', 'Bajar terreno', Mountain],
            ['sculpt_smooth', 'Suavizar terreno', Brush],
            ['sculpt_flatten', 'Aplanar terreno', Minimize2],
            ['sculpt_paint', 'Pintar textura', Paintbrush],
            ['scatter', 'Esparcir hierba', Sprout],
            ['fence', 'Valla magnética', Fence],
          ] as Array<[ViewportBrushMode, string, typeof Mountain]>
        ).map(([bMode, bLabel, BIcon]) => (
          <button
            key={bMode}
            type="button"
            onClick={() => setBrushMode(brushMode === bMode ? 'gizmo' : bMode)}
            aria-pressed={brushMode === bMode}
            title={bLabel}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
              brushMode === bMode
                ? 'bg-emerald-600/30 text-emerald-200 ring-1 ring-emerald-500/60'
                : 'text-zinc-400 hover:bg-[#232838] hover:text-zinc-100'
            }`}
          >
            <BIcon className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">{bLabel}</span>
          </button>
        ))}

        {brushMode !== 'gizmo' && (
          <div className="flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
            <label className="flex items-center gap-1">
              <span>Radio</span>
              <input
                type="range"
                min={1}
                max={12}
                step={0.5}
                aria-label="Radio del pincel 3D"
                value={brushRadius}
                onChange={(e) => setBrushRadius(Number(e.target.value))}
                className="w-16 accent-emerald-400"
              />
              <span className="font-mono w-5">{brushRadius}</span>
            </label>
            {brushMode === 'sculpt_paint' && (
              <select
                aria-label="Textura de pincel"
                value={paintChannel}
                onChange={(e) => setPaintChannel(Number(e.target.value) as 0 | 1 | 2 | 3)}
                className="rounded border border-[#32384a] bg-[#141722] px-1.5 py-0.5 text-[11px] text-zinc-100"
              >
                <option value={0}>Hierba</option>
                <option value={1}>Tierra</option>
                <option value={2}>Roca</option>
                <option value={3}>Arena</option>
              </select>
            )}
          </div>
        )}

        <span className="mx-0.5 h-4 w-px bg-[#303647]" aria-hidden="true" />

        <button
          type="button"
          onClick={() => setShowGrid((g) => !g)}
          aria-pressed={showGrid}
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
            showGrid ? 'bg-blue-600/25 text-blue-300' : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          <Grid3X3 className="h-3.5 w-3.5" />
          <span>Rejilla</span>
        </button>

        <button
          type="button"
          onClick={() => setShowColliders((c) => {
            const next = !c;
            if (!next) setEditColliderZone(false);
            return next;
          })}
          aria-pressed={showColliders}
          title="Visualizar colisionadores 3D (verde: caja/esfera, cian: malla exacta)"
          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
            showColliders ? 'bg-emerald-600/25 text-emerald-300' : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          <Scan className="h-3.5 w-3.5" />
          <span>Colisiones</span>
        </button>

        {showColliders && (
          <button
            type="button"
            onClick={() => setEditColliderZone((e) => !e)}
            aria-pressed={editColliderZone}
            title="Editar posición y tamaño del colisionador del objeto seleccionado con el gizmo 3D"
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
              editColliderZone
                ? 'bg-amber-600/30 text-amber-200 ring-1 ring-amber-500/50'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <span>Editar Zona</span>
          </button>
        )}

        {scene.navMesh && (
          <button
            type="button"
            onClick={() => setShowNavMesh((n) => !n)}
            aria-pressed={showNavMesh}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium ${
              showNavMesh ? 'bg-cyan-600/25 text-cyan-300' : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Ver NavMesh</span>
          </button>
        )}

        <span className="hidden 2xl:inline-flex items-center gap-1 px-2 text-[10px] text-zinc-400">
          <Sparkles className="h-3 w-3 text-amber-400" />
          <span>
            {brushMode === 'gizmo'
              ? 'Clic izq: seleccionar · Arrastrar ejes X/Y/Z · Shift+clic: múltiple (CSG) · Der: orbitar'
              : 'Clic izq / arrastrar: aplicar pincel · Clic derecho: orbitar cámara'}
          </span>
        </span>
      </div>
    </div>
  );
};
