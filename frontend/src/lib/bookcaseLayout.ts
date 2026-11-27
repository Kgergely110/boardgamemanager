import type { Game, GameArrangementItem } from "../types";

export const STACK_PIECE_HEIGHT = 56;
export const STACK_LAYER_OFFSET = 20;

export function sortGames(left: Game, right: Game) {
  return left.position - right.position || left.id.localeCompare(right.id);
}

export function buildStackGroups(levelGames: Game[]): Game[][] {
  const gameById = new Map(levelGames.map((game) => [game.id, game]));
  const childrenByParent = new Map<string, Game[]>();
  for (const game of levelGames) {
    if (!game.stackedOnId || !gameById.has(game.stackedOnId)) continue;
    const children = childrenByParent.get(game.stackedOnId) ?? [];
    children.push(game);
    childrenByParent.set(game.stackedOnId, children);
  }
  for (const children of childrenByParent.values()) children.sort(sortGames);

  const visited = new Set<string>();
  const groups: Game[][] = [];
  const roots = levelGames
    .filter((game) => !game.stackedOnId || !gameById.has(game.stackedOnId))
    .sort(sortGames);

  function collect(game: Game, group: Game[]) {
    if (visited.has(game.id)) return;
    visited.add(game.id);
    group.push(game);
    for (const child of childrenByParent.get(game.id) ?? []) collect(child, group);
  }

  for (const root of roots) {
    const group: Game[] = [];
    collect(root, group);
    if (group.length) groups.push(group);
  }
  for (const game of [...levelGames].sort(sortGames)) {
    if (visited.has(game.id)) continue;
    const group: Game[] = [];
    collect(game, group);
    if (group.length) groups.push(group);
  }
  return groups;
}

export function arrangementItems(groups: Game[][]): GameArrangementItem[] {
  return groups.flatMap((group, groupIndex) =>
    group.map((game, stackIndex) => {
      const parent = stackIndex === 0 ? null : group[stackIndex - 1];
      return {
        id: game.id,
        order: groupIndex + 1,
        stackedOnId: parent?.id ?? null,
        ...(stackIndex === 0
          ? { orientation: game.orientation === "stacked" ? "vertical" : game.orientation }
          : {}),
      };
    }),
  );
}
