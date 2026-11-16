import { MECHANICS_CATALOG, type MechanicCatalogEntry } from '../catalog/mechanicsCatalog';

const SPANISH_SYNONYMS: Record<string, string[]> = {
  seguir: ['perseguir', 'aproximarse', 'buscar', 'objetivo', 'ia', 'enemigo'],
  perseguir: ['seguir', 'enemigo', 'cazar', 'alcanzar'],
  caminar: ['andar', 'mover', 'correr', 'animacion', 'walk', 'spritesheet'],
  saltar: ['salto', 'brincar', 'plataforma', 'plataformas', 'gravedad'],
  moneda: ['gema', 'item', 'coleccionable', 'recoger', 'puntos', 'score'],
  sonido: ['audio', 'musica', 'sfx', 'efecto', 'ruido'],
  enemigo: ['patrulla', 'perseguir', 'dron', 'ia', 'peligro'],
  chocar: ['colision', 'tocar', 'solido', 'golpe', 'impacto'],
  temblar: ['sacudida', 'shake', 'camara', 'vibrar'],
};

export function normalizeSpanishText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface SearchCatalogMatch {
  entry: MechanicCatalogEntry;
  score: number;
  matchedTerms: string[];
}

export function searchMechanicsCatalog(query: string): SearchCatalogMatch[] {
  const normalized = normalizeSpanishText(query);
  if (!normalized) {
    return MECHANICS_CATALOG.map((entry) => ({
      entry,
      score: 1,
      matchedTerms: [],
    }));
  }

  const rawTokens = normalized.split(' ').filter((t) => t.length >= 2);
  const expandedTokens = new Set<string>(rawTokens);
  for (const tok of rawTokens) {
    const syns = SPANISH_SYNONYMS[tok];
    if (syns) {
      syns.forEach((s) => expandedTokens.add(s));
    }
  }

  const results: SearchCatalogMatch[] = [];
  for (const entry of MECHANICS_CATALOG) {
    const haystackName = normalizeSpanishText(entry.name);
    const haystackDesc = normalizeSpanishText(entry.description);
    const haystackFamily = normalizeSpanishText(entry.family);
    const keywords = entry.keywords.map(normalizeSpanishText);

    let score = 0;
    const matchedTerms: string[] = [];

    for (const tok of expandedTokens) {
      const isDirect = rawTokens.includes(tok);
      const weight = isDirect ? 3 : 1;

      if (haystackName.includes(tok)) {
        score += 4 * weight;
        matchedTerms.push(tok);
      } else if (keywords.some((k) => k === tok || k.includes(tok))) {
        score += 3 * weight;
        matchedTerms.push(tok);
      } else if (haystackDesc.includes(tok) || haystackFamily.includes(tok)) {
        score += 1.5 * weight;
        matchedTerms.push(tok);
      }
    }

    if (score > 0) {
      results.push({
        entry,
        score,
        matchedTerms: Array.from(new Set(matchedTerms)),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
