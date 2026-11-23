import type { AnimationStateMachineConfig, AnimStateNode } from '../core/types';
import { compareValues } from './expressionEvaluator';

export interface AnimFsmRuntimeContext {
  speed: number;
  vy: number;
  isGrounded: boolean;
  animFinished?: boolean;
  animProgress?: number;
  heldKeys?: Set<string> | string[];
  justPressedKeys?: Set<string> | string[];
  variables?: Map<string, number | boolean | string>;
}

export interface AnimFsmEvalResult {
  changed: boolean;
  stateName: string;
  clipName: string;
  assetId?: string | null;
  timeScale: number;
  loopMode: 'LoopRepeat' | 'LoopOnce' | 'LoopPingPong';
  blendDuration: number;
  node: AnimStateNode;
}

function hasKey(keys: Set<string> | string[] | undefined, code: string): boolean {
  if (!keys || !code) return false;
  if (keys instanceof Set) return keys.has(code);
  return keys.includes(code);
}

function evalAtomicCondition(raw: string, ctx: AnimFsmRuntimeContext): boolean {
  const cond = raw.trim();
  if (!cond || cond === 'manual') return false;

  if (cond === 'animFinished' || cond === 'animFinished == true') {
    return Boolean(ctx.animFinished || (ctx.animProgress !== undefined && ctx.animProgress >= 0.99));
  }
  if (cond === '!animFinished' || cond === 'animFinished == false') {
    return !(ctx.animFinished || (ctx.animProgress !== undefined && ctx.animProgress >= 0.99));
  }
  if (cond === 'falling' || cond === 'isFalling' || cond === 'isFalling == true') {
    return !ctx.isGrounded && ctx.vy <= 0.05;
  }
  if (cond === '!falling' || cond === 'isFalling == false') {
    return ctx.isGrounded || ctx.vy > 0.05;
  }
  if (cond === '!isGrounded') {
    return !ctx.isGrounded;
  }
  if (cond === 'isGrounded') {
    return Boolean(ctx.isGrounded);
  }
  if (cond.startsWith('!keyPressed:')) {
    const code = cond.slice('!keyPressed:'.length).trim();
    return code ? !hasKey(ctx.justPressedKeys, code) : false;
  }
  if (cond.startsWith('keyPressed:')) {
    const code = cond.slice('keyPressed:'.length).trim();
    return code ? hasKey(ctx.justPressedKeys, code) : false;
  }
  if (cond.startsWith('!keyHeld:')) {
    const code = cond.slice('!keyHeld:'.length).trim();
    return code ? !hasKey(ctx.heldKeys, code) : false;
  }
  if (cond.startsWith('keyHeld:')) {
    const code = cond.slice('keyHeld:'.length).trim();
    return code ? hasKey(ctx.heldKeys, code) : false;
  }
  if (cond.startsWith('speed')) {
    const m = cond.match(/^speed\s*(>=|<=|>|<|==|!=)\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return compareValues(ctx.speed, m[1] as '>', Number(m[2]));
  }
  if (cond.startsWith('vy')) {
    const m = cond.match(/^vy\s*(>=|<=|>|<|==|!=)\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return compareValues(ctx.vy, m[1] as '>', Number(m[2]));
  }
  if (cond.startsWith('isGrounded')) {
    const m = cond.match(/^isGrounded\s*(==|!=)\s*(true|false)$/);
    if (m) return compareValues(String(ctx.isGrounded), m[1] as '==', m[2]);
  }
  if (cond.startsWith('var:')) {
    const m = cond.slice(4).match(/^([a-zA-Z0-9_]+)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
    if (m) {
      return compareValues(ctx.variables?.get(m[1]) ?? 0, m[2] as '==', m[3].trim());
    }
  }
  return false;
}

export function evaluateAnimConditionExpr(
  expr: string,
  ctx: AnimFsmRuntimeContext
): boolean {
  const trimmed = expr.trim();
  if (!trimmed || trimmed === 'manual') return false;

  // Soporta OR (||) de nivel superior y AND (&&) interno
  const orGroups = trimmed.split('||');
  return orGroups.some((group) => {
    const andParts = group.split('&&');
    return andParts.length > 0 && andParts.every((part) => evalAtomicCondition(part, ctx));
  });
}

export function suggestInverseCondition(expr: string): string {
  const c = expr.trim();
  if (c === 'speed > 0.1') return 'speed <= 0.1';
  if (c === 'speed <= 0.1') return 'speed > 0.1';
  if (c === 'isGrounded == false') return 'isGrounded == true';
  if (c === 'isGrounded == true') return 'isGrounded == false';
  if (c === 'isGrounded == false && vy > 0') return 'isGrounded == false && vy <= 0';
  if (c === 'isGrounded == false && vy <= 0') return 'isGrounded == true';
  if (c === 'falling' || c === 'isFalling') return 'isGrounded == true';
  if (c === 'animFinished') return 'manual';
  if (c.startsWith('keyHeld:')) return `!${c}`;
  if (c.startsWith('!keyHeld:')) return c.slice(1);
  if (c.startsWith('keyPressed:')) return 'isGrounded == true';
  if (c === 'var:salud <= 0') return 'var:salud > 0';
  return 'manual';
}

function isTerminalStateNode(node: AnimStateNode): boolean {
  const label = `${node.name} ${node.clipName}`.toLowerCase();
  const cond = (node.conditionExpr ?? '').toLowerCase();
  return (
    cond.includes('var:') ||
    cond.includes('death') ||
    label.includes('death') ||
    label.includes('morir') ||
    label.includes('dead')
  );
}

function isLocomotionBaseNode(node: AnimStateNode, initialStateId: string): boolean {
  if (node.id === initialStateId) return true;
  const label = `${node.name} ${node.clipName}`.toLowerCase();
  return /(idle|reposo|quiet|stand|walk|camin|andar|run|corr|sprint|move|mover)/.test(label);
}

function nodeTriggerMatches(node: AnimStateNode, ctx: AnimFsmRuntimeContext): boolean {
  const key = (node.triggerKey ?? '').trim();
  const cond = (node.conditionExpr ?? '').trim();
  const hasCond = cond.length > 0 && cond !== 'manual';
  if (!key && !hasCond) return false;

  if (key) {
    const mode = node.triggerKeyMode ?? 'pressed';
    const keyMatched =
      mode === 'held'
        ? hasKey(ctx.heldKeys, key)
        : hasKey(ctx.justPressedKeys, key);
    if (!keyMatched) return false;
  }

  if (hasCond && !evaluateAnimConditionExpr(cond, ctx)) {
    return false;
  }

  return true;
}

function resolveSmartLocomotionTarget(
  fsm: AnimationStateMachineConfig,
  curNode: AnimStateNode,
  ctx: AnimFsmRuntimeContext
): AnimStateNode | null {
  const states = fsm.states.filter((s) => s.id !== curNode.id);
  if (states.length === 0) return null;

  const findByPattern = (re: RegExp) =>
    states.find((s) => re.test(`${s.name} ${s.clipName}`.toLowerCase()));

  const idleNode =
    findByPattern(/\b(idle|reposo|quieto|quieta|stand|espera)\b/) ??
    states.find((s) => s.id === fsm.initialStateId) ??
    states[0];
  const walkNode = findByPattern(/\b(walk|caminar|camina|andar|anda|trotar|move|mover)\b/);
  const runNode = findByPattern(/\b(run|correr|corre|sprint|dash_move)\b/);

  // Comprobar si hay condición explícita de Run en sus transiciones o en la tarjeta
  let runRuleMatched = false;
  if (runNode) {
    if (runNode.triggerKey) {
      const mode = runNode.triggerKeyMode ?? 'held';
      runRuleMatched = mode === 'held' ? hasKey(ctx.heldKeys, runNode.triggerKey) : hasKey(ctx.justPressedKeys, runNode.triggerKey);
    }
    if (!runRuleMatched && runNode.conditionExpr && runNode.conditionExpr !== 'manual') {
      runRuleMatched = evaluateAnimConditionExpr(runNode.conditionExpr, ctx);
    }
    if (!runRuleMatched) {
      const runTrs = (fsm.transitions ?? []).filter(
        (tr) => tr.toStateId === runNode.id && tr.conditionExpr && tr.conditionExpr !== 'manual'
      );
      runRuleMatched = runTrs.some((tr) => evaluateAnimConditionExpr(tr.conditionExpr, ctx));
    }
  }

  const sprintKeyHeld = hasKey(ctx.heldKeys, 'ShiftLeft') || hasKey(ctx.heldKeys, 'ShiftRight');
  const isMoving = ctx.speed > 0.1;

  if (!isMoving) {
    return idleNode ?? null;
  }

  if (runNode && (runRuleMatched || sprintKeyHeld || ctx.speed > 5.5 || !walkNode)) {
    return runNode;
  }

  if (walkNode) {
    return walkNode;
  }

  return runNode ?? idleNode ?? null;
}

function shouldNodeAutoReturn(node: AnimStateNode, ctx: AnimFsmRuntimeContext): boolean {
  const mode = node.returnMode ?? 'none';
  if (mode === 'none') return false;

  // Evitar auto-retorno en el mismo frame exacto en que la tecla activadora acaba de presionarse
  const trigKey = (node.triggerKey ?? '').trim();
  if (trigKey && (node.triggerKeyMode ?? 'pressed') !== 'held' && hasKey(ctx.justPressedKeys, trigKey)) {
    return false;
  }

  let on = node.returnOn ?? 'auto';
  if (on === 'auto') {
    if (trigKey && node.triggerKeyMode === 'held') {
      on = 'keyReleased';
    } else if (/jump|salt|fall|caer|aire|air/.test(`${node.name} ${node.clipName}`.toLowerCase())) {
      on = 'grounded';
    } else if (node.loopMode === 'LoopOnce') {
      on = 'animFinished';
    } else if (trigKey) {
      on = 'animFinished';
    } else {
      return false;
    }
  }

  if (on === 'grounded') {
    return Boolean(ctx.isGrounded && ctx.vy <= 0.15);
  }
  if (on === 'animFinished') {
    return Boolean(ctx.animFinished || (ctx.animProgress !== undefined && ctx.animProgress >= 0.99));
  }
  if (on === 'keyReleased') {
    return trigKey ? !hasKey(ctx.heldKeys, trigKey) : false;
  }
  return false;
}

export function stepAnimationFSM(
  fsm: AnimationStateMachineConfig,
  currentAnimState: string,
  ctx: AnimFsmRuntimeContext
): AnimFsmEvalResult | null {
  if (!fsm || !Array.isArray(fsm.states) || fsm.states.length === 0) return null;

  const findTarget = (id: string) => fsm.states.find((s) => s.id === id);
  const safeClip = (node: AnimStateNode) => (node.clipName || node.name || 'idle').trim();

  let curNode = fsm.states.find(
    (s) => s.name === currentAnimState || s.id === currentAnimState
  );
  if (!curNode) {
    curNode = fsm.states.find((s) => s.id === fsm.initialStateId) ?? fsm.states[0];
    return {
      changed: true,
      stateName: curNode.name,
      clipName: safeClip(curNode),
      assetId: curNode.assetId ?? null,
      timeScale: Math.max(0.1, curNode.timeScale || 1),
      loopMode: curNode.loopMode ?? 'LoopRepeat',
      blendDuration: 0.15,
      node: curNode,
    };
  }

  const makeTransitionResult = (nextNode: AnimStateNode, blendDuration = 0.18): AnimFsmEvalResult => ({
    changed: true,
    stateName: nextNode.name,
    clipName: safeClip(nextNode),
    assetId: nextNode.assetId ?? null,
    timeScale: Math.max(0.1, nextNode.timeScale || 1),
    loopMode: nextNode.loopMode ?? 'LoopRepeat',
    blendDuration: Math.max(0.05, blendDuration),
    node: nextNode,
  });

  const transitions = Array.isArray(fsm.transitions) ? fsm.transitions : [];
  const currentlyTerminal = isTerminalStateNode(curNode);

  // 1) Prioridad máxima: reglas terminales Any State (*) con variable/salud (ej. Morir) o tarjetas terminales fromAnyState
  const wildcardTerminal = transitions.filter(
    (tr) =>
      tr.fromStateId === '*' &&
      tr.toStateId !== curNode!.id &&
      (tr.conditionExpr.includes('var:') || tr.conditionExpr.toLowerCase().includes('death'))
  );
  for (const tr of wildcardTerminal) {
    if (!evaluateAnimConditionExpr(tr.conditionExpr, ctx)) continue;
    const nextNode = findTarget(tr.toStateId);
    if (nextNode && nextNode.id !== curNode.id) {
      return makeTransitionResult(nextNode, tr.blendDuration ?? 0.2);
    }
  }
  for (const node of fsm.states) {
    if (node.id === curNode.id || !node.fromAnyState || !isTerminalStateNode(node)) continue;
    if (nodeTriggerMatches(node, ctx)) {
      return makeTransitionResult(node, 0.15);
    }
  }

  // 2) Tarjetas con activación directa "Desde cualquier estado (Any State)" (salvo si el personaje ya está muerto)
  if (!currentlyTerminal) {
    for (const node of fsm.states) {
      if (node.id === curNode.id || !node.fromAnyState || isTerminalStateNode(node)) continue;
      if (nodeTriggerMatches(node, ctx)) {
        return makeTransitionResult(node, 0.12);
      }
    }
  }

  // 3) Transiciones específicas que salen del estado actual (flechas conectadas)
  const directOutgoing = transitions.filter(
    (tr) => tr.fromStateId === curNode!.id && tr.toStateId !== curNode!.id
  );
  for (const tr of directOutgoing) {
    if (!evaluateAnimConditionExpr(tr.conditionExpr, ctx)) continue;
    const nextNode = findTarget(tr.toStateId);
    if (nextNode && nextNode.id !== curNode.id) {
      return makeTransitionResult(nextNode, tr.blendDuration ?? 0.22);
    }
  }

  // 4) Tarjetas con tecla/condición propia sin flechas conectadas desde estados base (Idle / Walk / Run)
  if (!currentlyTerminal && isLocomotionBaseNode(curNode, fsm.initialStateId)) {
    for (const node of fsm.states) {
      if (node.id === curNode.id || node.fromAnyState) continue;
      if (nodeTriggerMatches(node, ctx)) {
        return makeTransitionResult(node, 0.12);
      }
    }
  }

  // 5) Resto de transiciones Any State (*) generales por flecha
  const wildcardGeneral = transitions.filter(
    (tr) =>
      tr.fromStateId === '*' &&
      tr.toStateId !== curNode!.id &&
      !wildcardTerminal.includes(tr)
  );
  for (const tr of wildcardGeneral) {
    if (!evaluateAnimConditionExpr(tr.conditionExpr, ctx)) continue;
    const nextNode = findTarget(tr.toStateId);
    if (nextNode && nextNode.id !== curNode.id) {
      return makeTransitionResult(nextNode, tr.blendDuration ?? 0.2);
    }
  }

  // 6) Retorno inteligente configurado directamente en la tarjeta (ej. Saltar -> aterrizando en Run / Walk / Idle)
  if (shouldNodeAutoReturn(curNode, ctx)) {
    let returnTarget: AnimStateNode | null = null;
    if (curNode.returnMode === 'state' && curNode.returnStateId) {
      returnTarget = findTarget(curNode.returnStateId) ?? null;
    } else if (curNode.returnMode === 'idle') {
      returnTarget =
        fsm.states.find((s) => /\b(idle|reposo|quieto|quieta|stand)\b/i.test(`${s.name} ${s.clipName}`)) ??
        findTarget(fsm.initialStateId) ??
        fsm.states[0] ??
        null;
    } else if (curNode.returnMode === 'smart_locomotion') {
      returnTarget = resolveSmartLocomotionTarget(fsm, curNode, ctx);
    }
    if (returnTarget && returnTarget.id !== curNode.id) {
      return makeTransitionResult(returnTarget, 0.15);
    }
  }

  return {
    changed: false,
    stateName: curNode.name,
    clipName: safeClip(curNode),
    assetId: curNode.assetId ?? null,
    timeScale: Math.max(0.1, curNode.timeScale || 1),
    loopMode: curNode.loopMode ?? 'LoopRepeat',
    blendDuration: 0.25,
    node: curNode,
  };
}
