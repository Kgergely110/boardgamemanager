import { Eyebrow } from "./ui";
import { DragEvent, Fragment, useRef, useState } from "react";
import { motion } from "framer-motion";
import { matchesGameSearch } from "../lib/gameSearch";
import { Game, GameArrangementItem, Shelf } from "../types";
import { PhysicalGameCard } from "./PhysicalGameCard";
import { arrangementItems, buildStackGroups, sortGames, STACK_LAYER_OFFSET, STACK_PIECE_HEIGHT } from "../lib/bookcaseLayout";

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

type DropTarget = { kind: "before" | "after" | "stack"; id: string };

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
    if (!sourceGroup) return null;
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
    const targetGroup = detached.remaining[targetGroupIndex];
    if (!targetGroup) return;
    const nextGroups = detached.remaining.slice();
    nextGroups[targetGroupIndex] = [...targetGroup, ...detached.draggedGroup];
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
    const group = groups[groupIndex];
    if (!group) return;
    const gameIndex = group.findIndex((game) => game.id === gameId);
    if (gameIndex < 0) return;
    const targetGame = group[gameIndex];
    if (!targetGame) return;
    const nextGroups = groups.slice();
    if (targetGame.stackedOnId) {
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
    if (!group) return;
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
          <Eyebrow>{`${shelf.type.toLocaleLowerCase().replace(/^./, (letter) => letter.toLocaleUpperCase())} · container`}</Eyebrow>
          <h3>{shelf.name}</h3>
          {shelf.description?.trim() && (
            <p className="bookcase__description">{shelf.description}</p>
          )}
        </div>
        <span className="bookcase__volume">{games.length} {games.length === 1 ? "game" : "games"}</span>
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
              if (!baseGame) return null;
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
                    style={{
                      ...(stackedGames.length
                        ? { height: `calc(var(--physical-game-base-height) + ${stackExtraHeight}px)` }
                        : {}),
                    }}
                    transition={{ layout: { duration: 0.34, ease: [0.2, 0.8, 0.2, 1] } }}
                  >
                    {group.map((game, stackIndex) => {
                      const isStackPiece = stackIndex > 0;
                      const pieceIndex = stackIndex - 1;
                      const gameGroupIndex = groups.findIndex((candidate) =>
                        candidate.some((item) => item.id === game.id),
                      );
                      const gameGroup = groups[gameGroupIndex];
                      if (!gameGroup) return null;
                      const gameStackIndex = gameGroup.findIndex((item) => item.id === game.id);
                      if (gameStackIndex < 0) return null;
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
                          {...(isStackPiece ? { stackIndex: pieceIndex } : {})}
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
                <span className="bookcase-level__number">Level {level}</span>
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
