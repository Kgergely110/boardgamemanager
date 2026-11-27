import { Game } from "../types";

interface ParsedGameSearch {
  term: string;
  tagsOnly: boolean;
}

function parseGameSearch(query: string): ParsedGameSearch {
  const trimmed = query.trim();
  const tagsOnly = trimmed.startsWith("#");
  return {
    term: (tagsOnly ? trimmed.slice(1) : trimmed).trim().toLocaleLowerCase(),
    tagsOnly,
  };
}

export function matchesTagSearch(tagName: string, query: string): boolean {
  const { term } = parseGameSearch(query);
  return Boolean(term) && tagName.toLocaleLowerCase().includes(term);
}

export function matchesGameSearch(game: Game, query: string): boolean {
  const { term, tagsOnly } = parseGameSearch(query);
  if (!term) return false;

  if (tagsOnly) {
    return game.tags.some((tag) => tag.name.toLocaleLowerCase().includes(term));
  }
  return (
    game.name.toLocaleLowerCase().includes(term) ||
    game.maker.toLocaleLowerCase().includes(term) ||
    game.tags.some((tag) => tag.name.toLocaleLowerCase().includes(term))
  );
}

export function textSearchTerm(query: string): string {
  const parsed = parseGameSearch(query);
  return parsed.tagsOnly ? "" : parsed.term;
}
