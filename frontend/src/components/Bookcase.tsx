import { DragEvent, Fragment, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LibraryIcon } from "./LibraryIcon";
import { matchesGameSearch, matchesTagSearch, textSearchTerm } from "../lib/gameSearch";
import { Game, GameArrangementItem, Shelf } from "../types";

const STACK_PIECE_HEIGHT = 56;
const STACK_LAYER_OFFSET = 20;

interface BookcaseProps {
  shelf: Shelf;
  games: Game[];
  query: string;
  hoveredGameId: string | null;
  arranging: boolean;
  arrangementSaving: boolean;
  deletingGameId: string | null;
  fallingGameIds: Set<string>;
  onGameHover: (gameId: string | null) => void;
  onViewGame: (game: Game) => void;
  onEditGame: (game: Game) => void;
  onDeleteGame: (game: Game) => void;
  onArrange: (shelfId: string, shelfNumber: number, items: GameArrangementItem[]) => Promise<void>;
}

interface PhysicalGameCardProps {
  game: Game;
  index: number;
  query: string;
  hoveredGameId: string | null;
  selectedGameId: string | null;
  arranging: boolean;
  isDragging: boolean;
  isStackDropTarget: boolean;
  isDeleting: boolean;
  isFalling: boolean;
  arrangementSaving: boolean;
  stackTargets: Game[];
  isStackBase: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  stackIndex?: number;
  stackCount?: number;
  onGameHover: (gameId: string | null) => void;
  onSelect: (gameId: string) => void;
  onDragStart: (gameId: string, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOverStack: (gameId: string, event: DragEvent<HTMLDivElement>) => void;
  onDropOnStack: (gameId: string, event: DragEvent<HTMLDivElement>) => void;
  onChangeOrientation: (
    gameId: string,
    orientation: "vertical" | "horizontal" | "flat",
  ) => void;
  onStackOn: (gameId: string, targetId: string) => void;
  onMoveStack: (gameId: string, direction: "left" | "right") => void;
  onViewGame: (game: Game) => void;
  onEditGame: (game: Game) => void;
  onDeleteGame: (game: Game) => void;
}

type DropTarget = { kind: "before" | "after" | "stack"; id: string };

function sortGames(left: Game, right: Game) {
  return left.position - right.position || left.id.localeCompare(right.id);
}

function buildStackGroups(levelGames: Game[]): Game[][] {
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

function arrangementItems(groups: Game[][]): GameArrangementItem[] {
  return groups.flatMap((group, groupIndex) =>
    group.map((game, stackIndex) => ({
      id: game.id,
      order: groupIndex + 1,
      stackedOnId: stackIndex === 0 ? null : group[stackIndex - 1].id,
      ...(stackIndex === 0
        ? { orientation: game.orientation === "stacked" ? "vertical" : game.orientation }
        : {}),
    })),
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const term = textSearchTerm(query);
  const index = term ? text.toLocaleLowerCase().indexOf(term) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="search-match">{text.slice(index, index + term.length)}</mark>
      {text.slice(index + term.length)}
    </>
  );
}

function PhysicalGameCard({
  game,
  index,
  query,
  hoveredGameId,
  selectedGameId,
  arranging,
  isDragging,
  isStackDropTarget,
  isDeleting,
  isFalling,
  arrangementSaving,
  stackTargets,
  isStackBase,
  canMoveLeft,
  canMoveRight,
  stackIndex,
  stackCount,
  onGameHover,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOverStack,
  onDropOnStack,
  onChangeOrientation,
  onStackOn,
  onMoveStack,
  onViewGame,
  onEditGame,
  onDeleteGame,
}: PhysicalGameCardProps) {
  const isHovered = hoveredGameId === game.id;
  const isSelected = selectedGameId === game.id;
  const isSearchMatch = matchesGameSearch(game, query);
  const isDimmed = hoveredGameId !== null
    ? !isHovered && !isSearchMatch
    : Boolean(query) && !isSearchMatch;
  const isStackPiece = stackIndex !== undefined;
  const stackPieceTop = isStackPiece && stackCount !== undefined
    ? (stackCount - stackIndex - 1) * STACK_LAYER_OFFSET
    : 0;

  return (
    <div
      className={`physical-game-slot physical-game-slot--${game.orientation} ${isStackPiece ? "physical-game-slot--stack-piece" : ""} ${isHovered ? "is-hovered" : ""} ${isSelected ? "is-selected" : ""} ${isDragging ? "is-dragging" : ""} ${isStackDropTarget ? "is-drop-target" : ""} ${isDeleting ? "is-vanishing" : ""} ${isFalling ? "is-falling" : ""}`}
      draggable={arranging}
      onDragEnd={onDragEnd}
      onDragOver={arranging ? (event) => onDragOverStack(game.id, event) : undefined}
      onDragStart={arranging ? (event) => onDragStart(game.id, event) : undefined}
      onDrop={arranging ? (event) => onDropOnStack(game.id, event) : undefined}
      onMouseEnter={() => onGameHover(game.id)}
      style={isStackPiece ? { top: `${stackPieceTop}px` } : undefined}
    >
      <article
        className={`physical-game physical-game--${game.orientation} physical-game--tone-${index % 5} ${isSearchMatch ? "is-search-match" : ""} ${isHovered ? "is-hovered" : ""} ${isDimmed ? "is-dimmed" : ""} ${isSelected ? "is-selected" : ""}`}
        title={`${game.name} by ${game.maker}`}
      >
        <button
          aria-expanded={isSelected}
          aria-label={`${game.name}, ${game.orientation}${arranging ? ", draggable" : ""}`}
          className="physical-game__select"
          onClick={() => onSelect(game.id)}
          type="button"
        >
          {game.imageUrl && <img alt="" loading="lazy" src={game.imageUrl} />}
          <div className="physical-game__face">
            <span><HighlightedText text={game.maker} query={query} /></span>
            <strong><HighlightedText text={game.name} query={query} /></strong>
          </div>
          {query && game.tags.some((tag) => matchesTagSearch(tag.name, query)) && (
            <span className="physical-game__match">MATCHING TAG</span>
          )}
        </button>
      </article>
      {isSelected && !arranging && (
        <div className="physical-game__actions" role="group" aria-label={`${game.name} actions`}>
          <button
            aria-label={`View details for ${game.name}`}
            className="physical-game__action physical-game__action--details"
            onClick={() => onViewGame(game)}
            type="button"
          >
            <LibraryIcon name="collection" className="physical-game__action-icon" />
            <span>Details</span>
          </button>
          <button
            aria-label={`Edit ${game.name}`}
            className="physical-game__action physical-game__action--edit"
            onClick={() => {
              onSelect(game.id);
              onEditGame(game);
            }}
            type="button"
          >
            <span className="physical-game__action-icon" aria-hidden="true">✎</span>
            <span>Edit</span>
          </button>
          <button
            aria-label={`Delete ${game.name}`}
            className="physical-game__action physical-game__action--delete"
            onClick={() => {
              onSelect(game.id);
              onGameHover(null);
              onDeleteGame(game);
            }}
            type="button"
          >
            <span className="physical-game__action-icon" aria-hidden="true">⌫</span>
            <span>Delete</span>
          </button>
        </div>
      )}
      {isSelected && arranging && (
        <div
          className="physical-game-arrange-panel"
          role="group"
          aria-label={`Arrange ${game.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="physical-game-arrange-panel__heading">
            <strong>Place this game</strong>
            {isStackBase && (
              <span className="physical-game-arrange-panel__moves">
                <button
                  aria-label={`Move ${game.name} left`}
                  disabled={!canMoveLeft || arrangementSaving}
                  onClick={() => onMoveStack(game.id, "left")}
                  type="button"
                >←</button>
                <button
                  aria-label={`Move ${game.name} right`}
                  disabled={!canMoveRight || arrangementSaving}
                  onClick={() => onMoveStack(game.id, "right")}
                  type="button"
                >→</button>
              </span>
            )}
          </div>
          <label>
            Orientation
            <select
              aria-label={`Orientation for ${game.name}`}
              disabled={arrangementSaving}
              onChange={(event) => {
                if (
                  event.target.value === "vertical" ||
                  event.target.value === "horizontal" ||
                  event.target.value === "flat"
                ) onChangeOrientation(game.id, event.target.value);
              }}
              value={game.stackedOnId ? "stacked" : game.orientation}
            >
              {game.stackedOnId && <option value="stacked">Stacked on another game</option>}
              <option value="vertical">Upright</option>
              <option value="horizontal">On its side</option>
              <option value="flat">Flat</option>
            </select>
          </label>
          <label>
            Stack on top of
            <select
              aria-label={`Stack ${game.name} on another game`}
              disabled={arrangementSaving || stackTargets.length === 0}
              onChange={(event) => {
                if (event.target.value) onStackOn(game.id, event.target.value);
              }}
              value=""
            >
              <option value="">Choose a stack</option>
              {stackTargets.map((target) => (
                <option key={target.id} value={target.id}>{target.name} · {target.maker}</option>
              ))}
            </select>
          </label>
          <span className="physical-game-arrange-panel__hint">
            Or drag this box to another position.
          </span>
        </div>
      )}
    </div>
  );
}

export function Bookcase({
  shelf,
  games,
  query,
  hoveredGameId,
  arranging,
  arrangementSaving,
  deletingGameId,
  fallingGameIds,
  onGameHover,
  onViewGame,
  onEditGame,
  onDeleteGame,
  onArrange,
}: BookcaseProps) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [draggedGameId, setDraggedGameId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const draggedGameIdRef = useRef<string | null>(null);
  const levels = Array.from(
    { length: shelf.shelfCount },
    (_, index) => shelf.shelfCount - index,
  );

  function onDragStart(gameId: string, event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", gameId);
    draggedGameIdRef.current = gameId;
    setDraggedGameId(gameId);
    setSelectedGameId(null);
    onGameHover(null);
  }

  function onDragEnd() {
    draggedGameIdRef.current = null;
    setDraggedGameId(null);
    setDropTarget(null);
  }

  function dragId(event: DragEvent<HTMLDivElement>) {
    return event.dataTransfer.getData("text/plain") || draggedGameIdRef.current || draggedGameId;
  }

  function onDragOverStack(gameId: string, event: DragEvent<HTMLDivElement>) {
    if (!arranging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget((current) =>
      current?.kind === "stack" && current.id === gameId
        ? current
        : { kind: "stack", id: gameId },
    );
  }

  function commitArrangement(level: number, groups: Game[][]) {
    void onArrange(shelf.id, level, arrangementItems(groups));
    setDropTarget(null);
    setDraggedGameId(null);
    draggedGameIdRef.current = null;
    setSelectedGameId(null);
  }

  function detachDraggedSuffix(groups: Game[][], draggedId: string) {
    const sourceIndex = groups.findIndex((group) => group.some((game) => game.id === draggedId));
    if (sourceIndex < 0) return null;
    const sourceGroup = groups[sourceIndex];
    const stackIndex = sourceGroup.findIndex((game) => game.id === draggedId);
    const draggedGroup = sourceGroup.slice(stackIndex);
    const remaining = groups.slice();
    const prefix = sourceGroup.slice(0, stackIndex);
    if (prefix.length) remaining[sourceIndex] = prefix;
    else remaining.splice(sourceIndex, 1);
    return { remaining, draggedGroup };
  }

  function stackGameOn(level: number, groups: Game[][], draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const detached = detachDraggedSuffix(groups, draggedId);
    if (!detached || detached.draggedGroup.some((game) => game.id === targetId)) {
      return;
    }
    const targetGroupIndex = detached.remaining.findIndex((group) => group.some((game) => game.id === targetId));
    if (targetGroupIndex < 0) return;
    const nextGroups = detached.remaining.slice();
    nextGroups[targetGroupIndex] = [
      ...nextGroups[targetGroupIndex],
      ...detached.draggedGroup,
    ];
    commitArrangement(level, nextGroups);
  }

  function dropOnStack(level: number, groups: Game[][], targetId: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const draggedId = dragId(event);
    if (!draggedId) {
      onDragEnd();
      return;
    }
    stackGameOn(level, groups, draggedId, targetId);
  }

  function changeOrientation(
    level: number,
    groups: Game[][],
    gameId: string,
    orientation: "vertical" | "horizontal" | "flat",
  ) {
    const groupIndex = groups.findIndex((group) => group.some((game) => game.id === gameId));
    if (groupIndex < 0) return;
    const gameIndex = groups[groupIndex].findIndex((game) => game.id === gameId);
    const group = groups[groupIndex];
    const nextGroups = groups.slice();
    if (group[gameIndex].stackedOnId) {
      const prefix = group.slice(0, gameIndex);
      const suffix = group.slice(gameIndex).map((item, index) =>
        index === 0 ? { ...item, orientation } : item,
      );
      if (prefix.length) {
        nextGroups[groupIndex] = prefix;
        nextGroups.splice(groupIndex + 1, 0, suffix);
      } else {
        nextGroups[groupIndex] = suffix;
      }
    } else {
      nextGroups[groupIndex] = group.map((item) =>
        item.id === gameId ? { ...item, orientation } : item,
      );
    }
    commitArrangement(level, nextGroups);
  }

  function moveStack(
    level: number,
    groups: Game[][],
    gameId: string,
    direction: "left" | "right",
  ) {
    const index = groups.findIndex((group) => group[0]?.id === gameId);
    const targetIndex = index + (direction === "left" ? -1 : 1);
    if (index < 0 || targetIndex < 0 || targetIndex >= groups.length) return;
    const nextGroups = groups.slice();
    const [group] = nextGroups.splice(index, 1);
    nextGroups.splice(targetIndex, 0, group);
    commitArrangement(level, nextGroups);
  }

  function dropAtPosition(
    level: number,
    groups: Game[][],
    targetRootId: string | null,
    placement: "before" | "after",
    event: DragEvent<HTMLDivElement>,
  ) {
    event.preventDefault();
    const draggedId = dragId(event);
    if (!draggedId) {
      onDragEnd();
      return;
    }
    const detached = detachDraggedSuffix(groups, draggedId);
    if (!detached) {
      onDragEnd();
      return;
    }
    const nextGroups = detached.remaining.slice();
    if (targetRootId) {
      const targetIndex = nextGroups.findIndex((group) => group[0]?.id === targetRootId);
      if (targetIndex < 0) {
        onDragEnd();
        return;
      }
      nextGroups.splice(targetIndex + (placement === "after" ? 1 : 0), 0, detached.draggedGroup);
    } else {
      nextGroups.push(detached.draggedGroup);
    }
    commitArrangement(level, nextGroups);
  }

  return (
    <section className={`bookcase ${arranging ? "bookcase--arranging" : ""}`} aria-label={`${shelf.name} bookcase`}>
      <header className="bookcase__header">
        <div className="bookcase__identity">
          <span className="eyebrow">{shelf.type.toUpperCase()} · CONTAINER</span>
          <h3>{shelf.name}</h3>
          {shelf.description?.trim() && (
            <p className="bookcase__description">{shelf.description}</p>
          )}
        </div>
        <span className="bookcase__volume">{games.length} {games.length === 1 ? "GAME" : "GAMES"}</span>
      </header>
      <div
        className={`bookcase__frame ${shelf.cabinetColor ? "bookcase__frame--customized" : ""}`}
        style={shelf.cabinetColor ? {
          borderColor: shelf.cabinetColor,
          backgroundColor: shelf.cabinetColor,
        } : undefined}
      >
        <div className="bookcase__inner">
          {levels.map((level) => {
            const levelGames = games.filter((game) => game.shelfNumber === level).sort(sortGames);
            const groups = buildStackGroups(levelGames);
            const levelIsHovered = levelGames.some((game) => game.id === hoveredGameId);
            const levelIsSelected = levelGames.some((game) => game.id === selectedGameId);
            const levelHasSearchMatch = levelGames.some((game) => matchesGameSearch(game, query));
            const levelStateClass = levelIsSelected
              ? "bookcase-level--selected"
              : levelIsHovered
                ? "bookcase-level--hovered"
                : levelHasSearchMatch
                  ? "bookcase-level--search"
                  : "";
            const stackGroups = groups.map((group, groupIndex) => {
              const baseGame = group[0];
              const stackedGames = group.slice(1);
              const groupSelected = group.some((game) => game.id === selectedGameId);
              const stackExtraHeight = stackedGames.length
                ? STACK_PIECE_HEIGHT + (stackedGames.length - 1) * STACK_LAYER_OFFSET
                : 0;
              const stackTargets = groups
                .filter((candidateGroup) => candidateGroup[0]?.id !== baseGame.id)
                .map((candidateGroup) => candidateGroup[candidateGroup.length - 1])
                .filter((candidate): candidate is Game => Boolean(candidate));
              return (
                <Fragment key={baseGame.id}>
                  {arranging && (
                    <div
                      aria-hidden="true"
                      className={`physical-game-arrange-zone physical-game-arrange-zone--before ${dropTarget?.kind === "before" && dropTarget.id === baseGame.id ? "is-drop-target" : ""}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDropTarget((current) =>
                          current?.kind === "before" && current.id === baseGame.id
                            ? current
                            : { kind: "before", id: baseGame.id },
                        );
                      }}
                      onDrop={(event) => dropAtPosition(level, groups, baseGame.id, "before", event)}
                    />
                  )}
                  <motion.div
                    className={`physical-game-stack physical-game-stack--${baseGame.orientation} ${stackedGames.length ? "physical-game-stack--has-stack" : ""} ${groupSelected ? "physical-game-stack--selected" : ""}`}
                    layout
                    key={`stack-${baseGame.id}`}
                    onMouseLeave={() => onGameHover(null)}
                    style={stackedGames.length ? {
                      height: `calc(var(--physical-game-base-height) + ${stackExtraHeight}px)`,
                    } : undefined}
                    transition={{ layout: { duration: 0.34, ease: [0.2, 0.8, 0.2, 1] } }}
                  >
                    {group.map((game, stackIndex) => {
                      const isStackPiece = stackIndex > 0;
                      const pieceIndex = stackIndex - 1;
                      const gameGroupIndex = groups.findIndex((candidate) =>
                        candidate.some((item) => item.id === game.id),
                      );
                      const gameStackIndex = groups[gameGroupIndex].findIndex((item) => item.id === game.id);
                      return (
                        <PhysicalGameCard
                          arrangementSaving={arrangementSaving}
                          canMoveLeft={gameStackIndex === 0 && gameGroupIndex > 0}
                          canMoveRight={gameStackIndex === 0 && gameGroupIndex < groups.length - 1}
                          game={game}
                          hoveredGameId={hoveredGameId}
                          index={groupIndex + stackIndex}
                          isDeleting={deletingGameId === game.id}
                          isFalling={fallingGameIds.has(game.id)}
                          isDragging={draggedGameId === game.id}
                          isStackBase={gameStackIndex === 0}
                          isStackDropTarget={dropTarget?.kind === "stack" && dropTarget.id === game.id}
                          key={game.id}
                          onChangeOrientation={(gameId, orientation) =>
                            changeOrientation(level, groups, gameId, orientation)}
                          onDeleteGame={onDeleteGame}
                          onDragEnd={onDragEnd}
                          onDragOverStack={onDragOverStack}
                          onDragStart={onDragStart}
                          onDropOnStack={(targetId, event) => dropOnStack(level, groups, targetId, event)}
                          onEditGame={onEditGame}
                          onGameHover={onGameHover}
                          onMoveStack={(gameId, direction) => moveStack(level, groups, gameId, direction)}
                          onSelect={(gameId) => setSelectedGameId((selected) => selected === gameId ? null : gameId)}
                          onStackOn={(gameId, targetId) => stackGameOn(level, groups, gameId, targetId)}
                          onViewGame={onViewGame}
                          query={query}
                          selectedGameId={selectedGameId}
                          stackCount={stackedGames.length}
                          stackIndex={isStackPiece ? pieceIndex : undefined}
                          stackTargets={stackTargets}
                          arranging={arranging}
                        />
                      );
                    })}
                  </motion.div>
                </Fragment>
              );
            });

            return (
              <div
                className={`bookcase-level ${levelStateClass} ${arranging ? "bookcase-level--arranging" : ""}`}
                key={level}
              >
                <span className="bookcase-level__number">LEVEL {level}</span>
                <div className="bookcase-level__contents">
                  {stackGroups.length ? (
                    <>
                      {stackGroups}
                      {arranging && (
                        <div
                          aria-hidden="true"
                          className={`physical-game-arrange-zone physical-game-arrange-zone--end ${dropTarget?.kind === "after" && dropTarget.id === "end" ? "is-drop-target" : ""}`}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            setDropTarget((current) =>
                              current?.kind === "after" && current.id === "end"
                                ? current
                                : { kind: "after", id: "end" },
                            );
                          }}
                          onDrop={(event) => dropAtPosition(level, groups, null, "after", event)}
                        />
                      )}
                    </>
                  ) : (
                    <span className="bookcase-level__empty">An open place for a new story</span>
                  )}
                </div>
                <div className="bookcase-level__plank" style={{ backgroundColor: shelf.color || undefined }} />
              </div>
            );
          })}
        </div>
      </div>
      {arranging && (
        <p className="bookcase__arrange-status" role="status">
          {arrangementSaving ? "Saving this arrangement…" : "Gold markers reorder games. Select a box to change its orientation or stack."}
        </p>
      )}
      {(shelf.width || shelf.height || shelf.depth) && (
        <p className="bookcase__dimensions">
          {shelf.width && shelf.height && shelf.depth
            ? `${shelf.width} × ${shelf.height} × ${shelf.depth} cm`
            : [shelf.width, shelf.height, shelf.depth].filter(Boolean).map((dimension) => `${dimension} cm`).join(" · ")}
        </p>
      )}
    </section>
  );
}
