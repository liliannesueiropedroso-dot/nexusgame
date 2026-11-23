/**
 * ResourceDisposer GPU para Three.js.
 * Limpia geometrías, materiales, texturas, AnimationMixers y render targets al cambiar de escena
 * o desmontar el viewport, evitando fugas de memoria VRAM.
 */

import * as THREE from 'three';

export class ResourceDisposer {
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly mixers = new Set<THREE.AnimationMixer>();
  private readonly renderTargets = new Set<THREE.WebGLRenderTarget>();

  trackGeometry<T extends THREE.BufferGeometry>(geom: T): T {
    this.geometries.add(geom);
    return geom;
  }

  trackMaterial<T extends THREE.Material | THREE.Material[]>(mat: T): T {
    if (Array.isArray(mat)) {
      for (const item of mat) {
        this.materials.add(item);
      }
    } else {
      this.materials.add(mat);
    }
    return mat;
  }

  trackTexture<T extends THREE.Texture>(tex: T): T {
    this.textures.add(tex);
    return tex;
  }

  trackMixer(mixer: THREE.AnimationMixer): THREE.AnimationMixer {
    this.mixers.add(mixer);
    return mixer;
  }

  trackRenderTarget(rt: THREE.WebGLRenderTarget): THREE.WebGLRenderTarget {
    this.renderTargets.add(rt);
    return rt;
  }

  trackObject3D(root: THREE.Object3D): void {
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.geometry) {
        this.geometries.add(mesh.geometry);
      }
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          this.materials.add(mat);
          const anyMat = mat as unknown as Record<string, unknown>;
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap']) {
            const tex = anyMat[key];
            if (tex && typeof (tex as THREE.Texture).dispose === 'function') {
              this.textures.add(tex as THREE.Texture);
            }
          }
        }
      }
    });
  }

  disposeAll(renderer?: THREE.WebGLRenderer | null): void {
    for (const mixer of this.mixers) {
      mixer.stopAllAction();
    }
    this.mixers.clear();

    for (const tex of this.textures) {
      tex.dispose();
    }
    this.textures.clear();

    for (const mat of this.materials) {
      mat.dispose();
    }
    this.materials.clear();

    for (const geom of this.geometries) {
      geom.dispose();
    }
    this.geometries.clear();

    for (const rt of this.renderTargets) {
      rt.dispose();
    }
    this.renderTargets.clear();

    if (renderer) {
      renderer.renderLists.dispose();
    }
  }
}

export function detectSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return false;
    const rendererStr = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? '').toLowerCase();
    return (
      rendererStr.includes('swiftshader') ||
      rendererStr.includes('llvmpipe') ||
      rendererStr.includes('software')
    );
  } catch {
    return false;
  }
}

export function afterThreeDraw(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
