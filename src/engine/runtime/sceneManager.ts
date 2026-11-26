import type { NexusPluginPackage, NexusScriptAsset, PrefabDefinition } from '../../project/models/project';
import type {
  ProjectVariable,
  SceneData,
  SceneTransitionType,
  StageResolution,
} from '../core/types';
import {
  createSimulationState,
  stepSimulationFixed,
  type InputState,
  type PendingSoundEvent,
  type SimulationState,
} from './stepGameSimulation';

export interface SceneTransitionEffect {
  type: SceneTransitionType;
  progress: number; // 0..1
  duration: number;
}

import type { LeaderboardEntry, StorageAdapter } from './stepGameSimulation';

export class RuntimeSceneManager {
  private scenes: SceneData[];
  private projectVariables: ProjectVariable[];
  private prefabs: PrefabDefinition[];
  private scripts: NexusScriptAsset[];
  private plugins: NexusPluginPackage[];
  private stage: StageResolution;
  private storageAdapter?: StorageAdapter;

  public baseState: SimulationState;
  public overlays: SimulationState[] = [];
  public persistentVars = new Map<string, number | boolean | string>();
  public unlockedScenes = new Set<string>();
  public transition: SceneTransitionEffect | null = null;
  public sceneChangeCount = 0;

  constructor(params: {
    scenes: SceneData[];
    initialSceneId?: string;
    variables?: ProjectVariable[];
    prefabs?: PrefabDefinition[];
    scripts?: NexusScriptAsset[];
    plugins?: NexusPluginPackage[];
    stage: StageResolution;
    storageAdapter?: StorageAdapter;
    leaderboard?: LeaderboardEntry[];
  }) {
    this.scenes = params.scenes;
    this.projectVariables = params.variables ?? [];
    this.prefabs = params.prefabs ?? [];
    this.scripts = params.scripts ?? [];
    this.plugins = params.plugins ?? [];
    this.stage = params.stage;
    this.storageAdapter = params.storageAdapter;

    for (const v of this.projectVariables) {
      if (v.scope === 'global' || v.scope === 'match') {
        this.persistentVars.set(v.name, v.initialValue);
      }
    }
    if (!this.persistentVars.has('puntos')) {
      this.persistentVars.set('puntos', 0);
    }

    const startScene =
      this.scenes.find((s) => s.id === params.initialSceneId) ?? this.scenes[0];
    this.unlockedScenes.add(startScene.id);

    this.baseState = createSimulationState(startScene, this.projectVariables, {
      prefabs: this.prefabs,
      scripts: this.scripts,
      plugins: this.plugins,
      stage: this.stage,
      preservedVariables: this.persistentVars,
      storageAdapter: this.storageAdapter,
      leaderboard: params.leaderboard,
    });
    this.queueSceneMusic(this.baseState, false);
  }

  private queueSceneMusic(state: SimulationState, isOverlay: boolean): void {
    const bgm = state.scene.backgroundMusic;
    if (bgm?.assetId && bgm.autoPlay !== false) {
      state.soundQueue.push({
        kind: 'musicPlay',
        assetId: bgm.assetId,
        channel: 'music',
        volume: bgm.volume ?? 0.8,
        loop: bgm.loop !== false,
        keepIfSame: bgm.keepPlayingIfSameTrack !== false,
      });
    } else if (!isOverlay && !bgm?.keepPlayingIfSameTrack) {
      state.soundQueue.push({
        kind: 'musicStop',
        channel: 'music',
      });
    }
  }

  get activeTopState(): SimulationState {
    return this.overlays.length > 0
      ? this.overlays[this.overlays.length - 1]
      : this.baseState;
  }

  private syncPersistentVarsFrom(state: SimulationState): void {
    const persistentNames = new Set(
      this.projectVariables
        .filter((v) => v.scope === 'global' || v.scope === 'match')
        .map((v) => v.name)
    );
    persistentNames.add('puntos');
    persistentNames.add('salud');

    for (const name of persistentNames) {
      if (state.variables.has(name)) {
        this.persistentVars.set(name, state.variables.get(name)!);
      }
    }
  }

  private syncPersistentVarsInto(state: SimulationState): void {
    for (const [k, v] of this.persistentVars.entries()) {
      state.variables.set(k, v);
    }
    state.score = Number(state.variables.get('puntos') ?? 0) || 0;
  }

  loadScene(sceneId: string, transition: SceneTransitionType = 'fadeBlack'): boolean {
    const target = this.scenes.find((s) => s.id === sceneId);
    if (!target) return false;

    const lb = this.activeTopState.leaderboard;
    this.syncPersistentVarsFrom(this.activeTopState);
    this.overlays = [];
    this.unlockedScenes.add(target.id);
    this.baseState = createSimulationState(target, this.projectVariables, {
      prefabs: this.prefabs,
      scripts: this.scripts,
      plugins: this.plugins,
      stage: this.stage,
      preservedVariables: this.persistentVars,
      storageAdapter: this.storageAdapter,
      leaderboard: lb,
    });
    this.queueSceneMusic(this.baseState, false);
    this.sceneChangeCount += 1;
    if (transition !== 'none') {
      this.transition = { type: transition, progress: 0, duration: 0.3 };
    }
    return true;
  }

  pushOverlay(sceneId: string, transition: SceneTransitionType = 'none'): boolean {
    const target = this.scenes.find((s) => s.id === sceneId);
    if (!target) return false;

    const lb = this.activeTopState.leaderboard;
    this.syncPersistentVarsFrom(this.activeTopState);
    const overlayState = createSimulationState(target, this.projectVariables, {
      prefabs: this.prefabs,
      scripts: this.scripts,
      plugins: this.plugins,
      stage: this.stage,
      preservedVariables: this.persistentVars,
      storageAdapter: this.storageAdapter,
      leaderboard: lb,
    });
    this.queueSceneMusic(overlayState, true);
    this.overlays.push(overlayState);
    if (transition !== 'none') {
      this.transition = { type: transition, progress: 0, duration: 0.2 };
    }
    return true;
  }

  popOverlay(): boolean {
    if (this.overlays.length === 0) return false;
    const popped = this.overlays.pop()!;
    this.syncPersistentVarsFrom(popped);
    this.syncPersistentVarsInto(this.activeTopState);
    if (popped.scene.backgroundMusic?.assetId) {
      this.queueSceneMusic(this.activeTopState, this.overlays.length > 0);
    }
    return true;
  }

  restartCurrentScene(transition: SceneTransitionType = 'fadeBlack'): void {
    this.loadScene(this.baseState.scene.id, transition);
  }

  nextLevel(explicitNextId?: string, transition: SceneTransitionType = 'fadeBlack'): boolean {
    const current = this.baseState.scene;
    const candidateId = explicitNextId || current.nextSceneId;
    if (candidateId && this.loadScene(candidateId, transition)) {
      return true;
    }
    const idx = this.scenes.findIndex((s) => s.id === current.id);
    const levelsAfter = this.scenes
      .slice(idx + 1)
      .find((s) => (s.kind ?? 'level') === 'level');
    if (levelsAfter) {
      return this.loadScene(levelsAfter.id, transition);
    }
    const anyAfter = this.scenes[idx + 1];
    if (anyAfter) {
      return this.loadScene(anyAfter.id, transition);
    }
    return false;
  }

  dispatchClick(objectId: string): void {
    this.activeTopState.clickedObjectIds.push(objectId);
  }

  setHoveredObject(objectId: string | null): void {
    this.activeTopState.hoveredObjectId = objectId;
  }

  step(rawDt: number, input: InputState): PendingSoundEvent[] {
    if (this.transition) {
      this.transition.progress += rawDt / Math.max(0.05, this.transition.duration);
      if (this.transition.progress >= 1) {
        this.transition = null;
      }
    }

    const active = this.activeTopState;
    stepSimulationFixed(active, rawDt, input);
    const sounds = active.soundQueue.splice(0, active.soundQueue.length);

    if (active.pendingSceneCommand) {
      const cmd = active.pendingSceneCommand;
      active.pendingSceneCommand = null;
      if (cmd.kind === 'load' && cmd.sceneId) {
        this.loadScene(cmd.sceneId, cmd.transition ?? 'fadeBlack');
      } else if (cmd.kind === 'overlay' && cmd.sceneId) {
        this.pushOverlay(cmd.sceneId, cmd.transition ?? 'none');
      } else if (cmd.kind === 'pop') {
        this.popOverlay();
      } else if (cmd.kind === 'restart') {
        this.restartCurrentScene(cmd.transition ?? 'fadeBlack');
      } else if (cmd.kind === 'nextLevel') {
        this.nextLevel(cmd.sceneId, cmd.transition ?? 'fadeBlack');
      }
    }

    return sounds;
  }
}
