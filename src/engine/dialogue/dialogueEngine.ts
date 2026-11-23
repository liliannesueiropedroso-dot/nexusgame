import type { DialogueChoice, DialogueGraph, DialogueNode } from '../core/types';

export interface ActiveDialogueState {
  graphId: string;
  nodeId: string;
  speaker: string;
  portraitAssetId: string | null;
  fullText: string;
  revealedChars: number;
  typewriterSpeed: number;
  finishedTyping: boolean;
  choices: DialogueChoice[];
  nextNodeId: string | null;
}

export function interpolateDialogueText(
  text: string,
  vars: Record<string, unknown>,
  translate?: (key: string) => string
): string {
  let out = String(text ?? '');
  if (translate) {
    out = out.replace(/@t\(([^)]+)\)/g, (_m, key) => translate(String(key).trim()));
  }
  out = out.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_m, varName) => {
    const val = vars[varName];
    return val === undefined || val === null ? '' : String(val);
  });
  return out;
}

export function evaluateDialogueCondition(
  expr: string | undefined,
  vars: Record<string, unknown>
): boolean {
  const raw = String(expr ?? '').trim();
  if (!raw) return true;
  const match = raw.match(/^([a-zA-Z0-9_.-]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
  if (!match) {
    // Boolean truthiness check for variable name
    const v = vars[raw];
    return Boolean(v);
  }
  const [, lhsKey, op, rhsRaw] = match;
  const lhsVal = vars[lhsKey];
  const rhsStr = rhsRaw.trim();
  let rhsVal: unknown = rhsStr;
  if (
    (rhsStr.startsWith('"') && rhsStr.endsWith('"')) ||
    (rhsStr.startsWith("'") && rhsStr.endsWith("'"))
  ) {
    rhsVal = rhsStr.slice(1, -1);
  } else if (rhsStr === 'true') {
    rhsVal = true;
  } else if (rhsStr === 'false') {
    rhsVal = false;
  } else if (!Number.isNaN(Number(rhsStr))) {
    rhsVal = Number(rhsStr);
  }

  const lNum = Number(lhsVal);
  const rNum = Number(rhsVal);
  const bothNumeric =
    typeof lhsVal === 'number' ||
    (typeof rhsVal === 'number' && !Number.isNaN(lNum) && String(lhsVal ?? '') !== '');

  switch (op) {
    case '==':
      return bothNumeric ? lNum === rNum : String(lhsVal ?? '') === String(rhsVal ?? '');
    case '!=':
      return bothNumeric ? lNum !== rNum : String(lhsVal ?? '') !== String(rhsVal ?? '');
    case '>':
      return lNum > rNum;
    case '>=':
      return lNum >= rNum;
    case '<':
      return lNum < rNum;
    case '<=':
      return lNum <= rNum;
    default:
      return true;
  }
}

export function getVisibleDialogueChoices(
  node: DialogueNode,
  vars: Record<string, unknown>,
  translate?: (key: string) => string
): DialogueChoice[] {
  return (node.choices ?? [])
    .filter((ch) => evaluateDialogueCondition(ch.conditionExpr, vars))
    .map((ch) => ({
      ...ch,
      text: interpolateDialogueText(ch.text, vars, translate),
    }));
}

export function createActiveDialogueState(
  graph: DialogueGraph,
  nodeId: string,
  vars: Record<string, unknown>,
  translate?: (key: string) => string
): ActiveDialogueState | null {
  const node =
    graph.nodes.find((n) => n.id === nodeId) ??
    graph.nodes.find((n) => n.id === graph.startNodeId) ??
    graph.nodes[0];
  if (!node) return null;
  const fullText = interpolateDialogueText(node.text, vars, translate);
  const speed = Math.max(5, Math.min(200, node.typewriterSpeed ?? 45));
  return {
    graphId: graph.id,
    nodeId: node.id,
    speaker: interpolateDialogueText(node.speaker, vars, translate),
    portraitAssetId: node.portraitAssetId ?? null,
    fullText,
    revealedChars: fullText.length === 0 ? 0 : 1,
    typewriterSpeed: speed,
    finishedTyping: fullText.length <= 1,
    choices: getVisibleDialogueChoices(node, vars, translate),
    nextNodeId: node.nextNodeId ?? null,
  };
}

export function stepDialogueTypewriter(
  state: ActiveDialogueState,
  dtSec: number
): ActiveDialogueState {
  if (state.finishedTyping) return state;
  const nextChars = Math.min(
    state.fullText.length,
    state.revealedChars + state.typewriterSpeed * Math.max(0, dtSec)
  );
  return {
    ...state,
    revealedChars: nextChars,
    finishedTyping: nextChars >= state.fullText.length,
  };
}

export function advanceDialogueChoice(
  graph: DialogueGraph,
  state: ActiveDialogueState,
  choiceIndex: number | null,
  vars: Record<string, unknown>,
  onEmitEvent?: (eventName: string) => void,
  translate?: (key: string) => string
): ActiveDialogueState | null {
  if (!state.finishedTyping) {
    return {
      ...state,
      revealedChars: state.fullText.length,
      finishedTyping: true,
    };
  }

  let nextId: string | null = state.nextNodeId ?? null;
  if (choiceIndex !== null && choiceIndex >= 0 && choiceIndex < state.choices.length) {
    const ch = state.choices[choiceIndex];
    if (ch.actionVar) {
      const current = vars[ch.actionVar];
      if (ch.actionOp === 'add') {
        vars[ch.actionVar] = Number(current ?? 0) + Number(ch.actionValue ?? 0);
      } else {
        vars[ch.actionVar] = ch.actionValue ?? true;
      }
    }
    if (ch.actionEvent && onEmitEvent) {
      onEmitEvent(ch.actionEvent);
    }
    nextId = ch.nextNodeId ?? null;
  } else if (state.choices.length > 0) {
    // Requires selecting a choice button
    return state;
  }

  if (!nextId) return null;
  const nextNode = graph.nodes.find((n) => n.id === nextId);
  if (!nextNode) return null;
  return createActiveDialogueState(graph, nextNode.id, vars, translate);
}
