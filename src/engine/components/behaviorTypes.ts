import { BEHAVIOR_REGISTRY, getBehaviorEntry } from './behaviorRegistry';

export type BehaviorType = string;

export interface BehaviorDefinition {
  type: BehaviorType;
  label: string;
  description: string;
  category: string;
  defaultConfig: Record<string, unknown>;
}

export const BEHAVIOR_DEFINITIONS: BehaviorDefinition[] = BEHAVIOR_REGISTRY.map((entry) => ({
  type: entry.type,
  label: entry.label,
  description: entry.description,
  category: entry.category,
  defaultConfig: { ...entry.defaultConfig },
}));

export function getBehaviorLabel(type: string): string {
  return getBehaviorEntry(type)?.label ?? type;
}
