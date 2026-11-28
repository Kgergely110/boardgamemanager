import type { DragEvent } from "react";
import { Button } from "./ui";
import { LibraryIcon } from "./LibraryIcon";
import { matchesGameSearch, matchesTagSearch, textSearchTerm } from "../lib/gameSearch";
import { STACK_LAYER_OFFSET } from "../lib/bookcaseLayout";
import type { Game } from "../types";

export interface PhysicalGameCardProps {
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

export function PhysicalGameCard({
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
        <Button
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
            <span className="physical-game__match">Matching tag</span>
          )}
        </Button>
      </article>
      {isSelected && !arranging && (
        <div className="physical-game__actions" role="group" aria-label={`${game.name} actions`}>
          <Button
            aria-label={`View details for ${game.name}`}
            className="physical-game__action physical-game__action--details"
            onClick={() => onViewGame(game)}
            type="button"
          >
            <LibraryIcon name="collection" className="physical-game__action-icon" />
            <span>Details</span>
          </Button>
          <Button
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
          </Button>
          <Button
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
          </Button>
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
                <Button
                  aria-label={`Move ${game.name} left`}
                  disabled={!canMoveLeft || arrangementSaving}
                  onClick={() => onMoveStack(game.id, "left")}
                  type="button"
                >←</Button>
                <Button
                  aria-label={`Move ${game.name} right`}
                  disabled={!canMoveRight || arrangementSaving}
                  onClick={() => onMoveStack(game.id, "right")}
                  type="button"
                >→</Button>
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
