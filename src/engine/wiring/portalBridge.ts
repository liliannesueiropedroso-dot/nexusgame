import type { PortalTargetId } from '../../export/html5/portalSdks';
import { EventBus } from './eventBus';

interface PortalGlobalWindow extends Window {
  PokiSDK?: {
    init?: () => Promise<void>;
    gameLoadingFinished?: () => void;
    gameplayStart?: () => void;
    gameplayStop?: () => void;
    commercialBreak?: () => Promise<void>;
    rewardedBreak?: () => Promise<boolean>;
  };
  CrazyGames?: {
    SDK?: {
      init?: () => Promise<void>;
      game?: {
        loadingStart?: () => void;
        loadingStop?: () => void;
        gameplayStart?: () => void;
        gameplayStop?: () => void;
      };
      ad?: {
        requestAd?: (
          type: 'midgame' | 'rewarded',
          callbacks: { adFinished?: () => void; adError?: () => void; adDismissed?: () => void }
        ) => void;
      };
      data?: {
        getItem?: (key: string) => Promise<string | null> | string | null;
        setItem?: (key: string, val: string) => Promise<void> | void;
      };
    };
  };
  bridge?: {
    initialize?: () => Promise<void>;
    platform?: { sendMessage?: (msg: string) => void };
    advertisement?: {
      showInterstitial?: () => Promise<void>;
      showRewarded?: () => Promise<boolean>;
    };
    storage?: {
      get?: (keys: string[]) => Promise<Array<string | null>>;
      set?: (keys: string[], values: string[]) => Promise<void>;
    };
  };
}

/**
 * Adaptador unificado para Poki, CrazyGames, Playgama y Web estándar.
 * Funciona de manera segura tanto en editor/preview local como en exportaciones HTML5.
 */
export class PortalBridge {
  portal: PortalTargetId;
  bus: EventBus;
  gameplayActive = false;
  muted = false;
  initialized = false;

  constructor(portal: PortalTargetId | 'auto' | null = 'auto', bus = new EventBus()) {
    this.bus = bus;
    this.portal = portal && portal !== 'auto' ? portal : this.detectPortal();
  }

  private getWin(): PortalGlobalWindow | null {
    return typeof window !== 'undefined' ? (window as PortalGlobalWindow) : null;
  }

  detectPortal(): PortalTargetId {
    const w = this.getWin();
    if (!w) return 'web';
    if (w.PokiSDK) return 'poki';
    if (w.CrazyGames?.SDK) return 'crazygames';
    if (w.bridge) return 'playgama';
    return 'web';
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const w = this.getWin();
    try {
      if (this.portal === 'poki' && w?.PokiSDK?.init) {
        await w.PokiSDK.init();
      } else if (this.portal === 'crazygames' && w?.CrazyGames?.SDK?.init) {
        await w.CrazyGames.SDK.init();
      } else if (this.portal === 'playgama' && w?.bridge?.initialize) {
        await w.bridge.initialize();
      }
    } catch {
      // Tolerante a bloqueadores de anuncios / entorno local
    }
    this.initialized = true;
    this.bus.emit('portal:initialized', { portal: this.portal });
  }

  loadingFinished(): void {
    const w = this.getWin();
    try {
      if (this.portal === 'poki') w?.PokiSDK?.gameLoadingFinished?.();
      else if (this.portal === 'crazygames') w?.CrazyGames?.SDK?.game?.loadingStop?.();
      else if (this.portal === 'playgama') w?.bridge?.platform?.sendMessage?.('game_ready');
    } catch {
      // No bloquear arranque
    }
    this.bus.emit('portal:loadingFinished', { portal: this.portal });
  }

  gameplayStart(): void {
    if (this.gameplayActive) return;
    this.gameplayActive = true;
    const w = this.getWin();
    try {
      if (this.portal === 'poki') w?.PokiSDK?.gameplayStart?.();
      else if (this.portal === 'crazygames') w?.CrazyGames?.SDK?.game?.gameplayStart?.();
    } catch {
      // Safe fallback
    }
    this.bus.emit('portal:gameplayStart', { portal: this.portal });
  }

  gameplayStop(): void {
    if (!this.gameplayActive) return;
    this.gameplayActive = false;
    const w = this.getWin();
    try {
      if (this.portal === 'poki') w?.PokiSDK?.gameplayStop?.();
      else if (this.portal === 'crazygames') w?.CrazyGames?.SDK?.game?.gameplayStop?.();
    } catch {
      // Safe fallback
    }
    this.bus.emit('portal:gameplayStop', { portal: this.portal });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.bus.emit('portal:muteChanged', { muted });
  }

  async showMidrollAd(): Promise<boolean> {
    const wasActive = this.gameplayActive;
    this.gameplayStop();
    this.setMuted(true);
    const w = this.getWin();
    let shown = true;
    try {
      if (this.portal === 'poki' && w?.PokiSDK?.commercialBreak) {
        await w.PokiSDK.commercialBreak();
      } else if (this.portal === 'crazygames' && w?.CrazyGames?.SDK?.ad?.requestAd) {
        await new Promise<void>((resolve) => {
          w.CrazyGames!.SDK!.ad!.requestAd!('midgame', {
            adFinished: () => resolve(),
            adError: () => resolve(),
            adDismissed: () => resolve(),
          });
        });
      } else if (this.portal === 'playgama' && w?.bridge?.advertisement?.showInterstitial) {
        await w.bridge.advertisement.showInterstitial();
      }
    } catch {
      shown = false;
    }
    this.setMuted(false);
    if (wasActive) this.gameplayStart();
    this.bus.emit('portal:midrollClosed', { shown });
    return shown;
  }

  async showRewardedAd(onReward?: () => void): Promise<boolean> {
    const wasActive = this.gameplayActive;
    this.gameplayStop();
    this.setMuted(true);
    const w = this.getWin();
    let granted = false;
    try {
      if (this.portal === 'poki' && w?.PokiSDK?.rewardedBreak) {
        granted = Boolean(await w.PokiSDK.rewardedBreak());
      } else if (this.portal === 'crazygames' && w?.CrazyGames?.SDK?.ad?.requestAd) {
        await new Promise<void>((resolve) => {
          w.CrazyGames!.SDK!.ad!.requestAd!('rewarded', {
            adFinished: () => {
              granted = true;
              resolve();
            },
            adError: () => resolve(),
            adDismissed: () => resolve(),
          });
        });
      } else if (this.portal === 'playgama' && w?.bridge?.advertisement?.showRewarded) {
        granted = Boolean(await w.bridge.advertisement.showRewarded());
      } else {
        granted = true;
      }
    } catch {
      granted = false;
    }
    this.setMuted(false);
    if (granted && onReward) onReward();
    if (wasActive) this.gameplayStart();
    this.bus.emit('portal:rewardedResult', { granted });
    return granted;
  }

  async saveHybrid(key: string, value: string): Promise<void> {
    const w = this.getWin();
    try {
      w?.localStorage?.setItem(`nx_portal_${key}`, value);
    } catch {
      // Ignore quota errors
    }
    try {
      if (this.portal === 'crazygames' && w?.CrazyGames?.SDK?.data?.setItem) {
        await w.CrazyGames.SDK.data.setItem(key, value);
      } else if (this.portal === 'playgama' && w?.bridge?.storage?.set) {
        await w.bridge.storage.set([key], [value]);
      }
    } catch {
      // Hybrid fallback stays intact in localStorage
    }
  }

  async loadHybrid(key: string): Promise<string | null> {
    const w = this.getWin();
    try {
      if (this.portal === 'crazygames' && w?.CrazyGames?.SDK?.data?.getItem) {
        const remote = await w.CrazyGames.SDK.data.getItem(key);
        if (remote != null) return remote;
      } else if (this.portal === 'playgama' && w?.bridge?.storage?.get) {
        const res = await w.bridge.storage.get([key]);
        if (Array.isArray(res) && res[0] != null) return res[0];
      }
    } catch {
      // Fallback to local
    }
    try {
      return w?.localStorage?.getItem(`nx_portal_${key}`) ?? null;
    } catch {
      return null;
    }
  }
}
