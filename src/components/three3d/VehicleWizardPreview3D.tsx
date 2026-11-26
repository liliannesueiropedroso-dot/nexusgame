import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SkeletonUtils } from 'three/examples/jsm/Addons.js';
import type { VehicleKind3D } from '../../engine/core/types';
import { loadModel3DFromBlob } from '../../engine/three3d/modelLoader';

interface VehicleWizardPreview3DProps {
  kind: VehicleKind3D;
  boatSize: 'speedboat' | 'medium' | 'ship';
  planeStyle: 'fighter' | 'airliner';
  mountStyle?: 'inside' | 'saddle';
  wheelRadius: number;
  wheelWidth: number;
  suspensionRestLen: number;
  wheelBase: number;
  trackWidth: number;
  showWireframeOverlay: boolean;
  slotAssets: Record<string, string | 'primitive' | 'pending'>;
  assetBlobs?: Map<string, Blob>;
  activeSlot: string;
}

export const VehicleWizardPreview3D: React.FC<VehicleWizardPreview3DProps> = (props) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const [viewAngle, setViewAngle] = useState<'iso' | 'side' | 'top'>('iso');
  const [webglError, setWebglError] = useState(false);

  const controlsRef = useRef({
    yaw: 0.65,
    pitch: 0.34,
    dist: 5.4,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });
  const rebuildRef = useRef<(() => void) | null>(null);
  const renderNowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch {
      setWebglError(true);
      return;
    }

    const gl = renderer.getContext();
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    const glName = dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
    const isSoftware = /swiftshader|llvmpipe|mesa|software/i.test(glName);

    renderer.setPixelRatio(isSoftware ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c0e14');

    const camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 120);

    const hemi = new THREE.HemisphereLight('#bae6fd', '#1e293b', 1.15);
    scene.add(hemi);
    const key = new THREE.DirectionalLight('#fff7ed', 2.0);
    key.position.set(6, 10, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#38bdf8', 0.85);
    rim.position.set(-7, 4, -6);
    scene.add(rim);

    // Plano de suelo Y = 0 para verificar contacto exacto de las ruedas sin hundimiento
    const groundGeo = new THREE.PlaneGeometry(24, 24);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#121622',
      roughness: 0.92,
      metalness: 0.05,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.y = -0.002;
    scene.add(groundMesh);

    const grid = new THREE.GridHelper(20, 20, '#334155', '#1e293b');
    grid.position.y = 0;
    scene.add(grid);

    const previewRoot = new THREE.Group();
    scene.add(previewRoot);

    const modelCache = new Map<string, THREE.Group>();
    const loadingIds = new Set<string>();
    const trackedGeos: THREE.BufferGeometry[] = [];
    const trackedMats: THREE.Material[] = [];

    const clearPreviewGroup = () => {
      previewRoot.clear();
      while (trackedGeos.length > 0) trackedGeos.pop()?.dispose();
      while (trackedMats.length > 0) trackedMats.pop()?.dispose();
    };

    const trackG = <T extends THREE.BufferGeometry>(g: T): T => {
      trackedGeos.push(g);
      return g;
    };
    const trackM = <T extends THREE.Material>(m: T): T => {
      trackedMats.push(m);
      return m;
    };

    const syncCamera = () => {
      const w = Math.max(120, mount.clientWidth);
      const h = Math.max(120, mount.clientHeight);
      if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      const c = controlsRef.current;
      const targetY =
        propsRef.current.kind === 'car' || propsRef.current.kind === 'moto'
          ? Math.max(0.4, (propsRef.current.wheelRadius + propsRef.current.suspensionRestLen * 0.6) * 0.75)
          : 1.0;
      const cx = Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist;
      const cy = targetY + Math.sin(c.pitch) * c.dist;
      const cz = Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist;
      camera.position.set(cx, Math.max(0.15, cy), cz);
      camera.lookAt(0, targetY, 0);
    };

    let rafPending = 0;
    const renderNow = () => {
      if (rafPending) return;
      rafPending = requestAnimationFrame(() => {
        rafPending = 0;
        syncCamera();
        renderer.render(scene, camera);
      });
    };
    renderNowRef.current = renderNow;

    const ensureGlbLoaded = (assetId: string) => {
      if (modelCache.has(assetId) || loadingIds.has(assetId)) return;
      const blob = propsRef.current.assetBlobs?.get(assetId);
      if (!blob) return;
      loadingIds.add(assetId);
      void loadModel3DFromBlob(blob, undefined, { normalizeSize: 1.0 })
        .then((res) => {
          modelCache.set(assetId, res.root);
          rebuild();
        })
        .catch(() => {
          // Ignorar fallo silencioso en previsualización
        })
        .finally(() => {
          loadingIds.delete(assetId);
        });
    };

    const createPartNode = (
      slotKey: string,
      fallbackGeo: THREE.BufferGeometry,
      mat: THREE.Material,
      sx: number,
      sy: number,
      sz: number,
      rxDeg = 0,
      rzDeg = 0
    ): THREE.Object3D => {
      const val = propsRef.current.slotAssets[slotKey];
      if (val && val !== 'primitive' && val !== 'pending') {
        const cached = modelCache.get(val);
        if (cached) {
          const clone = SkeletonUtils.clone(cached);
          clone.scale.set(sx, sy, sz);
          return clone;
        }
        ensureGlbLoaded(val);
      }
      const mesh = new THREE.Mesh(trackG(fallbackGeo), trackM(mat));
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.set(THREE.MathUtils.degToRad(rxDeg), 0, THREE.MathUtils.degToRad(rzDeg));
      return mesh;
    };

    const rebuild = () => {
      clearPreviewGroup();
      const p = propsRef.current;
      const isMoto = p.kind === 'moto';
      const isBoat = p.kind === 'boat';
      const isPlane = p.kind === 'plane';
      const isHeli = p.kind === 'helicopter';
      const isShip = p.kind === 'spaceship';
      const isHorse = p.kind === 'horse';

      const wRad = Math.max(0.18, p.wheelRadius);
      const wWid = Math.max(0.12, p.wheelWidth);
      const restLen = Math.max(0.2, p.suspensionRestLen);
      const wBase = Math.max(1.0, p.wheelBase);
      const tWid = isMoto ? 0 : Math.max(0.8, p.trackWidth);
      const hw = isMoto ? 0 : tWid * 0.5;
      const hl = wBase * 0.5;
      const wy = -(restLen * 0.85);

      const boatScale =
        p.boatSize === 'ship'
          ? { sx: 4.8, sy: 1.8, sz: 12.0 }
          : p.boatSize === 'medium'
            ? { sx: 2.8, sy: 1.0, sz: 6.2 }
            : { sx: 2.1, sy: 0.75, sz: 4.4 };

      const bodyScale = isBoat
        ? boatScale
        : isPlane
          ? { sx: 1.4, sy: 1.0, sz: p.planeStyle === 'airliner' ? 6.8 : 4.6 }
          : isHeli
            ? { sx: 1.55, sy: 1.25, sz: 3.6 }
            : isShip
              ? { sx: 6.0, sy: 2.4, sz: 12.0 }
              : isHorse
                ? { sx: 0.78, sy: 0.74, sz: 2.1 }
                : isMoto
                  ? { sx: 0.65, sy: 0.68, sz: 2.1 }
                  : { sx: 1.85, sy: 0.72, sz: 3.8 };

      const vehicleGroup = new THREE.Group();
      const spawnY =
        p.kind === 'car' || p.kind === 'moto'
          ? wRad + restLen * 0.85
          : isHorse
            ? 1.35
            : isHeli
              ? 1.1
              : 1.0;
      vehicleGroup.position.set(0, spawnY, 0);

      const bodyColor = isBoat
        ? '#f8fafc'
        : isPlane
          ? '#38bdf8'
          : isHeli
            ? '#0ea5e9'
            : isShip
              ? '#6366f1'
              : isHorse
                ? '#78350f'
                : isMoto
                  ? '#f97316'
                  : '#dc2626';
      const bodyMat = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: isShip || isPlane || isHeli ? 0.7 : isHorse ? 0.08 : 0.45,
        roughness: isHorse ? 0.82 : 0.3,
      });
      const chassisNode = createPartNode(
        'body',
        new THREE.BoxGeometry(1, 1, 1),
        bodyMat,
        bodyScale.sx,
        bodyScale.sy,
        bodyScale.sz
      );
      vehicleGroup.add(chassisNode);

      if (p.showWireframeOverlay && p.activeSlot === 'body') {
        const bodyCageGeo = trackG(new THREE.EdgesGeometry(new THREE.BoxGeometry(bodyScale.sx, bodyScale.sy, bodyScale.sz)));
        const bodyCageMat = trackM(new THREE.LineBasicMaterial({ color: '#facc15', depthTest: false }));
        const bodyCage = new THREE.LineSegments(bodyCageGeo, bodyCageMat);
        bodyCage.renderOrder = 25;
        vehicleGroup.add(bodyCage);
      }

      if (p.kind === 'car' || p.kind === 'moto') {
        const defW = isMoto ? 0.22 : 0.3;
        const slots = isMoto
          ? [
              { key: 'wheelFL', ox: 0, oz: hl },
              { key: 'wheelRL', ox: 0, oz: -hl },
            ]
          : [
              { key: 'wheelFL', ox: -hw, oz: hl },
              { key: 'wheelFR', ox: hw, oz: hl },
              { key: 'wheelRL', ox: -hw, oz: -hl },
              { key: 'wheelRR', ox: hw, oz: -hl },
            ];

        const cylProto = new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
        const wireCyl = new THREE.CylinderGeometry(wRad, wRad, wWid, 20);
        wireCyl.rotateZ(Math.PI / 2);
        const wireEdgesGeo = trackG(new THREE.EdgesGeometry(wireCyl, 10));
        wireCyl.dispose();

        const contactRingGeo = trackG(new THREE.RingGeometry(wRad * 0.42, wRad * 0.62, 20));
        contactRingGeo.rotateX(-Math.PI / 2);
        const contactMat = trackM(
          new THREE.MeshBasicMaterial({ color: '#34d399', side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthTest: false })
        );

        const suspPts: THREE.Vector3[] = [];
        for (const s of slots) {
          const val = p.slotAssets[s.key];
          const isGlb = Boolean(val && val !== 'primitive' && val !== 'pending');
          const wMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.82, metalness: 0.18 });
          const wNode = createPartNode(
            s.key,
            cylProto.clone(),
            wMat,
            isGlb ? Math.max(0.14, (wRad * 2) * (wWid / defW)) : wRad * 2,
            isGlb ? wRad * 2 : wWid,
            wRad * 2,
            0,
            isGlb ? 0 : 90
          );
          wNode.position.set(s.ox, wy, s.oz);
          vehicleGroup.add(wNode);

          if (p.showWireframeOverlay) {
            const isActive = p.activeSlot === s.key;
            const cageMat = trackM(
              new THREE.LineBasicMaterial({
                color: isActive ? '#facc15' : '#22d3ee',
                depthTest: false,
                transparent: true,
                opacity: 0.96,
              })
            );
            const cage = new THREE.LineSegments(wireEdgesGeo, cageMat);
            cage.position.set(s.ox, wy, s.oz);
            cage.renderOrder = 22;
            vehicleGroup.add(cage);

            const ring = new THREE.Mesh(contactRingGeo, contactMat);
            ring.position.set(s.ox, wy - wRad, s.oz);
            ring.renderOrder = 21;
            vehicleGroup.add(ring);

            suspPts.push(new THREE.Vector3(s.ox, 0, s.oz), new THREE.Vector3(s.ox, wy, s.oz));
          }
        }
        cylProto.dispose();

        if (p.showWireframeOverlay && suspPts.length > 0) {
          const suspGeo = trackG(new THREE.BufferGeometry().setFromPoints(suspPts));
          const suspMat = trackM(new THREE.LineBasicMaterial({ color: '#34d399', depthTest: false }));
          const suspLines = new THREE.LineSegments(suspGeo, suspMat);
          suspLines.renderOrder = 20;
          vehicleGroup.add(suspLines);
        }
      } else if (isBoat) {
        const propMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', metalness: 0.8, roughness: 0.25 });
        const prop = createPartNode('propeller', new THREE.CylinderGeometry(0.5, 0.5, 1, 12), propMat, 0.55, 0.25, 0.55, 90, 0);
        prop.position.set(0, -0.35, -bodyScale.sz * 0.52);
        vehicleGroup.add(prop);
      } else if (isPlane) {
        const wingMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.5, roughness: 0.35 });
        const wings = createPartNode('wings', new THREE.BoxGeometry(1, 1, 1), wingMat, p.planeStyle === 'airliner' ? 8.2 : 5.4, 0.16, 1.5);
        wings.position.set(0, 0.05, 0.15);
        vehicleGroup.add(wings);

        const propMat = new THREE.MeshStandardMaterial({ color: '#fbbf24', metalness: 0.8, roughness: 0.2 });
        const prop = createPartNode('propeller', new THREE.CylinderGeometry(0.5, 0.5, 1, 14), propMat, 0.9, 0.2, 0.9, 90, 0);
        prop.position.set(0, 0, bodyScale.sz * 0.54);
        vehicleGroup.add(prop);
      } else if (isHeli) {
        const canopyMat = new THREE.MeshStandardMaterial({ color: '#bae6fd', metalness: 0.25, roughness: 0.15, transparent: true, opacity: 0.82 });
        const canopy = new THREE.Mesh(trackG(new THREE.BoxGeometry(1.3, 0.75, 1.35)), trackM(canopyMat));
        canopy.position.set(0, 0.15, 1.5);
        vehicleGroup.add(canopy);

        const tailMat = new THREE.MeshStandardMaterial({ color: '#0284c7', metalness: 0.5, roughness: 0.35 });
        const tailBoom = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.4, 0.42, 3.3)), trackM(tailMat));
        tailBoom.position.set(0, 0.22, -3.0);
        vehicleGroup.add(tailBoom);

        const rotorMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.85, roughness: 0.2 });
        const mainRotor = createPartNode('propeller', new THREE.BoxGeometry(1, 1, 1), rotorMat, 6.4, 0.08, 0.26);
        mainRotor.position.set(0, 1.02, 0.1);
        vehicleGroup.add(mainRotor);

        const tailRotorMat = new THREE.MeshStandardMaterial({ color: '#facc15', metalness: 0.6, roughness: 0.3 });
        const tailRotor = createPartNode('tailRotor', new THREE.BoxGeometry(1, 1, 1), tailRotorMat, 0.1, 1.15, 0.18);
        tailRotor.position.set(0.32, 0.45, -4.5);
        vehicleGroup.add(tailRotor);

        const skidMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.8, roughness: 0.4 });
        const skids = createPartNode('landingGear', new THREE.BoxGeometry(1, 1, 1), skidMat, 1.85, 0.14, 3.1);
        skids.position.set(0, -0.95, 0.1);
        vehicleGroup.add(skids);
      } else if (isShip) {
        const thrMat = new THREE.MeshStandardMaterial({ color: '#22d3ee', emissive: '#06b6d4', emissiveIntensity: 1.5 });
        const thr = createPartNode('propeller', new THREE.CylinderGeometry(0.5, 0.5, 1, 16), thrMat, 2.0, 0.8, 2.0, 90, 0);
        thr.position.set(0, 0, -bodyScale.sz * 0.53);
        vehicleGroup.add(thr);
      } else if (isHorse) {
        const coatMat = new THREE.MeshStandardMaterial({ color: '#92400e', roughness: 0.82 });
        const neck = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.46, 0.95, 0.55)), trackM(coatMat));
        neck.position.set(0, 0.55, 0.95);
        neck.rotation.x = THREE.MathUtils.degToRad(26);
        vehicleGroup.add(neck);

        const head = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.4, 0.44, 0.72)), trackM(coatMat));
        head.position.set(0, 0.95, 1.32);
        head.rotation.x = THREE.MathUtils.degToRad(16);
        vehicleGroup.add(head);

        const saddleMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.75 });
        const saddle = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.84, 0.16, 0.76)), trackM(saddleMat));
        saddle.position.set(0, 0.42, -0.05);
        vehicleGroup.add(saddle);

        const legMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.85 });
        for (const [lx, lz] of [
          [-0.24, 0.76],
          [0.24, 0.76],
          [-0.24, -0.76],
          [0.24, -0.76],
        ]) {
          const leg = new THREE.Mesh(trackG(new THREE.BoxGeometry(0.18, 0.92, 0.2)), trackM(legMat));
          leg.position.set(lx, -0.78, lz);
          vehicleGroup.add(leg);
        }
      }

      const showSaddleSilhouette =
        p.mountStyle === 'saddle' || (!p.mountStyle && (isMoto || isHorse));
      if (showSaddleSilhouette) {
        const riderMat = trackM(
          new THREE.MeshStandardMaterial({
            color: '#38bdf8',
            transparent: true,
            opacity: 0.45,
            roughness: 0.5,
          })
        );
        const rider = new THREE.Mesh(trackG(new THREE.CapsuleGeometry(0.24, 0.65, 6, 12)), riderMat);
        rider.position.set(0, isHorse ? 0.92 : 0.78, isHorse ? -0.06 : -0.14);
        vehicleGroup.add(rider);
      }

      previewRoot.add(vehicleGroup);
      renderNow();
    };
    rebuildRef.current = rebuild;

    const ro = new ResizeObserver(() => renderNow());
    ro.observe(mount);

    const onPointerDown = (e: PointerEvent) => {
      controlsRef.current.dragging = true;
      controlsRef.current.lastX = e.clientX;
      controlsRef.current.lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!controlsRef.current.dragging) return;
      const dx = e.clientX - controlsRef.current.lastX;
      const dy = e.clientY - controlsRef.current.lastY;
      controlsRef.current.lastX = e.clientX;
      controlsRef.current.lastY = e.clientY;
      controlsRef.current.yaw -= dx * 0.01;
      controlsRef.current.pitch = Math.max(0.03, Math.min(1.45, controlsRef.current.pitch + dy * 0.01));
      renderNow();
    };
    const onPointerUp = () => {
      controlsRef.current.dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      controlsRef.current.dist = Math.max(2.4, Math.min(22, controlsRef.current.dist + e.deltaY * 0.004));
      renderNow();
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    rebuild();

    return () => {
      if (rafPending) cancelAnimationFrame(rafPending);
      ro.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      clearPreviewGroup();
      groundGeo.dispose();
      groundMat.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const scaleDist =
      props.kind === 'boat' && props.boatSize === 'ship'
        ? 14
        : props.kind === 'spaceship'
          ? 15
          : Math.max(4.6, props.wheelBase * 1.45 + props.wheelRadius * 2.2);
    if (viewAngle === 'side') {
      controlsRef.current.yaw = Math.PI * 0.5;
      controlsRef.current.pitch = 0.08;
      controlsRef.current.dist = scaleDist;
    } else if (viewAngle === 'top') {
      controlsRef.current.yaw = 0;
      controlsRef.current.pitch = 1.42;
      controlsRef.current.dist = scaleDist * 1.15;
    } else {
      controlsRef.current.yaw = 0.65;
      controlsRef.current.pitch = 0.34;
      controlsRef.current.dist = scaleDist;
    }
    renderNowRef.current?.();
  }, [viewAngle, props.kind, props.boatSize]);

  useEffect(() => {
    rebuildRef.current?.();
  }, [
    props.kind,
    props.boatSize,
    props.planeStyle,
    props.mountStyle,
    props.wheelRadius,
    props.wheelWidth,
    props.suspensionRestLen,
    props.wheelBase,
    props.trackWidth,
    props.showWireframeOverlay,
    props.slotAssets,
    props.activeSlot,
  ]);

  if (webglError) {
    return (
      <div className="flex h-52 w-full items-center justify-center rounded-lg border border-[#22242e] bg-[#0e0f14] text-xs text-zinc-400">
        Vista previa 3D no disponible en este contexto (radio configurado: {props.wheelRadius.toFixed(2)}m)
      </div>
    );
  }

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-lg border border-[#22242e] bg-[#0c0e14]">
      <div
        ref={mountRef}
        data-testid="vehicle-wizard-preview-3d"
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />
      <div className="absolute left-2.5 top-2 flex items-center gap-1 rounded-md border border-[#2a2d3a] bg-[#141720]/90 p-0.5 text-[10px]">
        {(
          [
            ['iso', 'Vista 3D'],
            ['side', 'Lateral Ruedas'],
            ['top', 'Superior'],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewAngle(mode)}
            className={`rounded px-2 py-0.5 font-medium transition-colors ${
              viewAngle === mode
                ? 'bg-cyan-500/20 text-cyan-200'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {(props.kind === 'car' || props.kind === 'moto') && (
        <div className="pointer-events-none absolute bottom-2 left-2.5 rounded bg-[#141720]/85 px-2 py-0.5 text-[10px] text-cyan-300">
          Suelo Y=0 • Radio {props.wheelRadius.toFixed(2)}m • Ancho {props.wheelWidth.toFixed(2)}m
        </div>
      )}
    </div>
  );
};
