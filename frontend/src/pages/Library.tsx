import { Button, Eyebrow, FeedbackMessage } from "../components/ui";
import { LibraryNavigation, LibraryRail, LibraryTopbar } from "../components/LibraryChrome";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bookcase } from "../components/Bookcase";
import { CollectionPulse } from "../components/CollectionPulse";
import { LibraryIcon } from "../components/LibraryIcon";
import { api, getErrorMessage, setAuthToken } from "../lib/api";
import { matchesGameSearch } from "../lib/gameSearch";
import { revealAndFocus } from "../lib/navigation";
import { CollectionPulse as CollectionPulseData, DeletedGameMatch, Game, GameArrangementItem, Player, Shelf, Tag } from "../types";

interface LibraryProps {
  player: Player;
  onLogout: () => void
}

interface PendingGameCreation {
  body: Record<string, string | number | null | undefined>;
  imageFile: File | null;
}

const shelfTypes: Record<string, string> = {
  shelf: "Bookcase",
  cupboard: "Cupboard",
  desk: "Desk",
  cabinet: "Cabinet",
  other: "Other",
};

function optionalNumber(value: string): number | undefined {
  return value.trim() ? Number(value) : undefined;
}

function isGameOrientation(value: string): value is Game["orientation"] {
  return value === "vertical" || value === "horizontal" || value === "flat" || value === "stacked";
}

export function Library({ player, onLogout }: LibraryProps) {
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [collectionPulse, setCollectionPulse] = useState<CollectionPulseData | null>(null);
  const [collectionPulseLoading, setCollectionPulseLoading] = useState(true);
  const [collectionPulseError, setCollectionPulseError] = useState("");
  const [collectionPulseRevision, setCollectionPulseRevision] = useState(0);
  const [selectedShelfId, setSelectedShelfId] = useState("all");
  const [containersExpanded, setContainersExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [loadingShelves, setLoadingShelves] = useState(true);
  const [loadingGames, setLoadingGames] = useState(true);
  const [shelfFormOpen, setShelfFormOpen] = useState(false);
  const [gameFormOpen, setGameFormOpen] = useState(false);
  const [editingShelf, setEditingShelf] = useState<Shelf | null>(null);
  const [editingGame, setEditingGame] = useState<Game | null>(null);
  const [gameFormShelfId, setGameFormShelfId] = useState("");
  const [gameFormShelfNumber, setGameFormShelfNumber] = useState(1);
  const [gameOrientation, setGameOrientation] = useState<Game["orientation"]>("vertical");
  const [gameStackedOnId, setGameStackedOnId] = useState("");
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [containerMenuOpen, setContainerMenuOpen] = useState(false);
  const [hoveredGameId, setHoveredGameId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "game"; game: Game } | { kind: "shelf"; shelf: Shelf } | null
  >(null);
  const [deletedGameMatches, setDeletedGameMatches] = useState<DeletedGameMatch[]>([]);
  const [deletedMatchesTruncated, setDeletedMatchesTruncated] = useState(false);
  const [pendingGameCreation, setPendingGameCreation] = useState<PendingGameCreation | null>(null);
  const [restoringGame, setRestoringGame] = useState(false);
  const [arrangingGames, setArrangingGames] = useState(false);
  const [arrangementSaving, setArrangementSaving] = useState(false);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
  const [fallingGameIds, setFallingGameIds] = useState<Set<string>>(() => new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [catalogErrors, setCatalogErrors] = useState({ shelves: "", games: "", tags: "" });
  const [notice, setNotice] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const shelfFormRef = useRef<HTMLFormElement>(null);
  const gameFormRef = useRef<HTMLFormElement>(null);
  const [shelfRevealToken, setShelfRevealToken] = useState(0);
  const [gameRevealToken, setGameRevealToken] = useState(0);

  useEffect(() => {
    revealAndFocus(shelfFormRef.current);
  }, [shelfRevealToken]);

  useEffect(() => {
    revealAndFocus(gameFormRef.current);
  }, [gameRevealToken]);

  useEffect(() => {
    if (!pendingDelete) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isDeleting) setPendingDelete(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingDelete, isDeleting]);

  useEffect(() => {
    if (!pendingGameCreation) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !restoringGame) {
        setPendingGameCreation(null);
        setDeletedGameMatches([]);
        setDeletedMatchesTruncated(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingGameCreation, restoringGame]);

  useEffect(() => {
    let active = true;
    setCatalogErrors((current) => ({ ...current, shelves: "" }));
    api.get<{ data: Shelf[] }>("/shelves")
      .then(({ data }) => {
        if (active) setShelves(data.data);
      })
      .catch((requestError: unknown) => {
        if (active) setCatalogErrors((current) => ({ ...current, shelves: getErrorMessage(requestError) }));
      })
      .finally(() => {
        if (active) setLoadingShelves(false);
      });
    return () => { active = false; };
  }, [catalogRevision]);

  useEffect(() => {
    let active = true;
    setCatalogErrors((current) => ({ ...current, tags: "" }));
    api.get<{ data: Tag[] }>("/tags")
      .then(({ data }) => {
        if (active) setTags(data.data);
      })
      .catch((requestError: unknown) => {
        if (active) setCatalogErrors((current) => ({ ...current, tags: getErrorMessage(requestError) }));
      });
    return () => { active = false; };
  }, [catalogRevision]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoadingGames(true);
      setCatalogErrors((current) => ({ ...current, games: "" }));
      api.get<{ data: Game[] }>("/games")
        .then(({ data }) => {
          if (active) setGames(data.data);
        })
        .catch((requestError: unknown) => {
          if (active) setCatalogErrors((current) => ({ ...current, games: getErrorMessage(requestError) }));
        })
        .finally(() => {
          if (active) setLoadingGames(false);
        });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [catalogRevision]);

  useEffect(() => {
    let active = true;
    if (selectedShelfId !== "all") {
      setCollectionPulse(null);
      setCollectionPulseLoading(false);
      return () => { active = false; };
    }

    setCollectionPulseLoading(true);
    setCollectionPulseError("");
    api.get<{ data: CollectionPulseData }>("/games/collection-pulse")
      .then(({ data }) => {
        if (active) setCollectionPulse(data.data);
      })
      .catch((requestError: unknown) => {
        if (active) setCollectionPulseError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setCollectionPulseLoading(false);
      });
    return () => { active = false; };
  }, [catalogRevision, collectionPulseRevision, selectedShelfId]);

  async function saveShelf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    const body = {
      name: String(form.get("name") ?? ""),
      type: String(form.get("type") ?? "shelf"),
      color: String(form.get("color") ?? ""),
      cabinetColor: String(form.get("cabinetColor") ?? ""),
      shelfCount: Number(form.get("shelfCount")),
      width: optionalNumber(String(form.get("width") ?? "")),
      height: optionalNumber(String(form.get("height") ?? "")),
      depth: optionalNumber(String(form.get("depth") ?? "")),
      description: String(form.get("description") ?? ""),
    };
    try {
      const { data } = editingShelf
        ? await api.patch<{ data: Shelf }>(`/shelves/${editingShelf.id}`, body)
        : await api.post<{ data: Shelf }>("/shelves", body);
      if (editingShelf) {
        setShelves((current) => current.map((shelf) => shelf.id === data.data.id ? data.data : shelf));
        setNotice(`“${data.data.name}” has been updated.`);
      } else {
        setShelves((current) => [...current, data.data]);
        setSelectedShelfId(data.data.id);
        setNotice(`“${data.data.name}” is ready for its first games.`);
      }
      setEditingShelf(null);
      setShelfFormOpen(false);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function submitGame(
    body: PendingGameCreation["body"],
    imageFile: File | null,
    deletedGameId?: string,
  ) {
    setError("");
    const { data } = deletedGameId
      ? await api.post<{ data: Game }>("/games/restore", { ...body, deletedGameId })
      : editingGame
        ? await api.patch<{ data: Game }>(`/games/${editingGame.id}`, body)
        : await api.post<{ data: Game }>("/games", body);
    let savedGame = data.data;
    let imageUploadError = "";
    if (imageFile) {
      const upload = new FormData();
      upload.append("image", imageFile);
      try {
        const result = await api.post<{ data: Game }>(`/games/${savedGame.id}/image`, upload);
        savedGame = result.data.data;
      } catch (uploadError) {
        imageUploadError = getErrorMessage(uploadError);
      }
    }
    setCatalogRevision((revision) => revision + 1);
    setSelectedShelfId(savedGame.shelf.id);
    setGameFormOpen(false);
    setPendingGameCreation(null);
    setDeletedGameMatches([]);
    setDeletedMatchesTruncated(false);
    if (imageUploadError) {
      setError(`“${savedGame.name}” was saved, but its image could not be uploaded: ${imageUploadError}`);
    } else {
      setNotice(deletedGameId
        ? `“${savedGame.name}” is restored with its logs, documents, tags, and other history.`
        : editingGame
          ? `“${savedGame.name}” has been updated.`
          : `“${savedGame.name}” has found its place.`);
    }
    setEditingGame(null);
  }

  async function saveGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    const imageEntry = form.get("imageFile");
    const imageFile = imageEntry instanceof File && imageEntry.size > 0 ? imageEntry : null;
    const imageUrl = String(form.get("imageUrl") ?? "").trim();
    if (imageFile && imageUrl) {
      setError("Choose either an image file or an image URL, not both.");
      return;
    }

    const body: PendingGameCreation["body"] = {
      name: String(form.get("name") ?? ""),
      maker: String(form.get("maker") ?? ""),
      shelfId: String(form.get("shelfId") ?? ""),
      shelfNumber: Number(form.get("shelfNumber")),
      orientation: gameOrientation,
      stackedOnId: gameOrientation === "stacked" ? gameStackedOnId || null : null,
      releaseYear: optionalNumber(String(form.get("releaseYear") ?? "")),
      minPlayers: optionalNumber(String(form.get("minPlayers") ?? "")),
      maxPlayers: optionalNumber(String(form.get("maxPlayers") ?? "")),
      playTime: optionalNumber(String(form.get("playTime") ?? "")),
      ageLimit: optionalNumber(String(form.get("ageLimit") ?? "")),
    };
    if (imageUrl) body.imageUrl = imageUrl;
    else if (editingGame && !imageFile) body.imageUrl = null;

    try {
      if (!editingGame) {
        const params = new URLSearchParams({ name: String(body.name ?? "") });
        const { data } = await api.get<{
          data: DeletedGameMatch[];
          truncated: boolean;
        }>(`/games/deleted-matches?${params.toString()}`);
        if (data.data.length > 0) {
          setPendingGameCreation({ body, imageFile });
          setDeletedGameMatches(data.data);
          setDeletedMatchesTruncated(data.truncated);
          return;
        }
      }
      await submitGame(body, imageFile);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function chooseDeletedGame(deletedGameId?: string) {
    if (!pendingGameCreation) return;
    setRestoringGame(true);
    try {
      await submitGame(pendingGameCreation.body, pendingGameCreation.imageFile, deletedGameId);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setRestoringGame(false);
    }
  }

  async function saveArrangement(
    shelfId: string,
    shelfNumber: number,
    items: GameArrangementItem[],
  ) {
    if (arrangementSaving) return;
    const previousGames = games;
    const updates = new Map(items.map((item) => [item.id, item]));
    setArrangementSaving(true);
    setGames((current) => current.map((game) => {
      const item = updates.get(game.id);
      if (!item) return game;
      return {
        ...game,
        position: item.order,
        stackedOnId: item.stackedOnId,
        orientation: item.stackedOnId
          ? "stacked"
          : item.orientation ?? (game.orientation === "stacked" ? "vertical" : game.orientation),
      };
    }));
    setError("");
    try {
      const { data } = await api.put<{
        data: { id: string; position: number; stackedOnId: string | null; orientation: Game["orientation"] }[];
      }>("/games/arrangement", { shelfId, shelfNumber, items });
      const saved = new Map(data.data.map((item) => [item.id, item]));
      setGames((current) => current.map((game) => {
        const item = saved.get(game.id);
        return item
          ? { ...game, position: item.position, stackedOnId: item.stackedOnId, orientation: item.orientation }
          : game;
      }));
      setNotice("The shelf arrangement has been saved.");
    } catch (requestError) {
      setGames(previousGames);
      setError(getErrorMessage(requestError));
    } finally {
      setArrangementSaving(false);
    }
  }

  function requestDeleteShelf(shelf: Shelf) {
    setPendingDelete({ kind: "shelf", shelf });
  }

  function requestDeleteGame(game: Game) {
    setPendingDelete({ kind: "game", game });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setIsDeleting(true);
    setError("");
    try {
      if (target.kind === "shelf") {
        await api.delete(`/shelves/${target.shelf.id}`);
        setShelves((current) => current.filter((item) => item.id !== target.shelf.id));
        setSelectedShelfId("all");
        setNotice(`“${target.shelf.name}” has been removed.`);
      } else {
        setPendingDelete(null);
        setDeletingGameId(target.game.id);
        await new Promise((resolve) => window.setTimeout(resolve, 460));
        const { data } = await api.delete<{
          data: {
            fallingGameIds: string[];
            games: { id: string; position: number; stackedOnId: string | null; orientation: Game["orientation"] }[];
          };
        }>(`/games/${target.game.id}`);
        const updatedGames = new Map(data.data.games.map((game) => [game.id, game]));
        const fallingIds = new Set(data.data.fallingGameIds);
        setGames((current) => current
          .filter((game) => game.id !== target.game.id)
          .map((game) => {
            const updated = updatedGames.get(game.id);
            return updated
              ? { ...game, position: updated.position, stackedOnId: updated.stackedOnId, orientation: updated.orientation }
              : game;
          }));
        setFallingGameIds(fallingIds);
        window.setTimeout(() => setFallingGameIds(new Set()), 650);
        setCatalogRevision((revision) => revision + 1);
        setNotice(`“${target.game.name}” has been archived. Its history is safe.`);
      }
      setPendingDelete(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setPendingDelete(null);
    } finally {
      setDeletingGameId(null);
      setIsDeleting(false);
    }
  }

  function logout() {
    setAuthToken(null);
    onLogout();
  }

  function openNewShelf() {
    setEditingShelf(null);
    setShelfFormOpen(true);
    setShelfRevealToken((token) => token + 1);
  }

  function openEditShelf(shelf: Shelf) {
    setEditingShelf(shelf);
    setShelfFormOpen(true);
    setShelfRevealToken((token) => token + 1);
  }

  function openNewGame() {
    setEditingGame(null);
    setGameFormShelfId(selectedShelfId === "all" ? shelves[0]?.id ?? "" : selectedShelfId);
    setGameFormShelfNumber(1);
    setGameOrientation("vertical");
    setGameStackedOnId("");
    setGameFormOpen(true);
    setGameRevealToken((token) => token + 1);
  }

  function openEditGame(game: Game) {
    setEditingGame(game);
    setGameFormShelfId(game.shelfId);
    setGameFormShelfNumber(game.shelfNumber);
    setGameOrientation(game.orientation);
    setGameStackedOnId(game.stackedOnId ?? "");
    setGameFormOpen(true);
    setGameRevealToken((token) => token + 1);
  }

  const selectedShelf = shelves.find((shelf) => shelf.id === selectedShelfId);
  const visibleShelves = selectedShelf ? [selectedShelf] : shelves;
  const visibleGames = selectedShelf
    ? games.filter((game) => game.shelfId === selectedShelf.id)
    : games;
  const stackTargets = games.filter(
    (game) =>
      game.id !== editingGame?.id &&
      game.shelfId === gameFormShelfId &&
      game.shelfNumber === gameFormShelfNumber &&
      game.stackedOnId === null,
  );
  const matchingGameCount = visibleGames.filter((game) =>
    query.trim() ? matchesGameSearch(game, query.trim()) : true,
  ).length;

  return (
    <div className="library-shell">
      <LibraryRail player={player} onLogout={logout}>
        <LibraryNavigation
          activePage="library"
          collectionNavigation={
            <>
              <span className="rail-label">Your collection</span>
                      <nav className="shelf-nav" aria-label="Browse containers">
                        <div className="shelf-nav__branch-wrap">
                          <div className="shelf-nav__branch">
                            <Button
                              aria-pressed={selectedShelfId === "all"}
                              className={`shelf-nav__item ${selectedShelfId === "all" ? "is-selected" : ""}`}
                              onClick={() => {
                                setSelectedShelfId("all");
                                setContainerMenuOpen(false);
                              }}
                            >
                              <span className="shelf-nav__glyph"><LibraryIcon name="collection" /></span>
                              <span>All games</span>
                              <span className="shelf-nav__count">{shelves.reduce((n, shelf) => n + shelf._count.games, 0)}</span>
                            </Button>
                            <Button
                              aria-expanded={containersExpanded}
                              aria-label={`${containersExpanded ? "Hide" : "Show"} containers`}
                              className="shelf-nav__toggle"
                              onClick={() => setContainersExpanded((expanded) => !expanded)}
                              type="button"
                            >
                              <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" /></svg>
                            </Button>
                          </div>
                          {containersExpanded && (
                            <div className="shelf-nav__children" id="container-submenu" role="group" aria-label="Containers">
                              {shelves.map((shelf) => (
                                <Button
                                  aria-pressed={selectedShelfId === shelf.id}
                                  className={`shelf-nav__item shelf-nav__item--child ${selectedShelfId === shelf.id ? "is-selected" : ""}`}
                                  key={shelf.id}
                                  onClick={() => {
                                    setSelectedShelfId(shelf.id);
                                    setContainerMenuOpen(false);
                                  }}
                                >
                                  <span className="shelf-nav__glyph" style={{ color: shelf.color || undefined }}>
                                    <LibraryIcon name="shelf" />
                                  </span>
                                  <span className="shelf-nav__text">{shelf.name}</span>
                                  <span className="shelf-nav__count">{shelf._count.games}</span>
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                        {!loadingShelves && shelves.length === 0 && (
                          <p className="rail-empty">Your first shelf is waiting to be named.</p>
                        )}
                        <Button className="rail-add" onClick={openNewShelf}>
                          <span className="rail-add__icon" aria-hidden="true">＋</span>
                          Add a container
                        </Button>
                      </nav>
            </>
          }
        />
        
      </LibraryRail>

      <main className="library-main">
        <LibraryTopbar section="My collection" page="Games" />

        <section className="library-heading">
          <div>
            <Eyebrow>A PLACE FOR EVERY ADVENTURE</Eyebrow>
            <h1>{selectedShelf ? selectedShelf.name : "My games"}</h1>
            <p>
              {selectedShelf
                ? `${shelfTypes[selectedShelf.type] ?? selectedShelf.type} · ${selectedShelf.shelfCount} ${selectedShelf.shelfCount === 1 ? "level" : "levels"}`
                : "A living catalogue of the games around your table."}
            </p>
          </div>
          <div className="heading-actions">
            {selectedShelf && (
              <div className="container-manage">
                <Button
                  aria-expanded={containerMenuOpen}
                  aria-controls="container-actions-menu"
                  aria-label={`Container options for ${selectedShelf.name}`}
                  className="button button--quiet"
                  onClick={() => setContainerMenuOpen((open) => !open)}
                >
                  Container options
                </Button>
                {containerMenuOpen && (
                  <div aria-label="Container actions" className="container-manage__menu" id="container-actions-menu" role="group">
                    <Button
                      onClick={() => {
                        openEditShelf(selectedShelf);
                        setContainerMenuOpen(false);
                      }}
                    >
                      Edit container
                    </Button>
                    <Button
                      className="container-manage__delete"
                      onClick={() => {
                        setContainerMenuOpen(false);
                        requestDeleteShelf(selectedShelf);
                      }}
                    >
                      Delete container
                    </Button>
                  </div>
                )}
              </div>
            )}
            <Button
              className={`button ${arrangingGames ? "button--primary" : "button--quiet"}`}
              disabled={loadingGames || arrangementSaving || games.length === 0}
              onClick={() => setArrangingGames((arranging) => !arranging)}
              type="button"
            >
              {arrangingGames ? "Finish arranging" : "Arrange games"}
            </Button>
            <Button className="button button--quiet" onClick={openNewShelf}>Add container</Button>
            <Button
              className="button button--primary"
              disabled={shelves.length === 0}
              onClick={openNewGame}
            >
              <span>＋</span> Add a game
            </Button>
          </div>
        </section>

        <section aria-label="Library search" className="collection-tools" role="search">
          <div className="collection-count">
            <span className="collection-count__number">{loadingGames ? "—" : query.trim() ? matchingGameCount : games.length}</span>
            <span>
              {query.trim()
                ? matchingGameCount === 1 ? "matching game" : "matching games"
                : games.length === 1 ? "game in view" : "games in view"}
            </span>
          </div>
          <label className="search-box">
            <svg aria-hidden="true" className="search-box__icon" viewBox="0 0 24 24">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m15.5 15.5 5 5" />
            </svg>
            <input
              aria-label="Search games or publishers"
              list="game-tag-search-suggestions"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a game, publisher, or #tag..."
              value={query}
            />
            <kbd>Search</kbd>
          </label>
          <datalist id="game-tag-search-suggestions">
            {tags.map((tag) => <option key={tag.id} value={`#${tag.name}`} />)}
          </datalist>
        </section>

        {error && (
          <FeedbackMessage className="notice notice--error" message={error} onDismiss={() => setError("")} />
        )}
        {Object.entries(catalogErrors).map(([resource, message]) => message && (
          <FeedbackMessage
            className="notice notice--error"
            key={resource}
            message={`${resource === "shelves" ? "Containers" : resource === "games" ? "Games" : "Tags"}: ${message}`}
            onDismiss={() => setCatalogErrors((current) => ({ ...current, [resource]: "" }))}
            onRetry={() => setCatalogRevision((value) => value + 1)}
          />
        ))}
        {notice && (
          <FeedbackMessage className="notice" message={notice} onDismiss={() => setNotice("")} tone="success" />
        )}

        {selectedShelfId === "all" && (
          <CollectionPulse
            data={collectionPulse}
            error={collectionPulseError}
            loading={collectionPulseLoading}
            onDismiss={() => setCollectionPulseError("")}
            onRetry={() => setCollectionPulseRevision((revision) => revision + 1)}
          />
        )}

        {shelfFormOpen && (
          <form className="inline-form shelf-form" key={editingShelf?.id ?? "new-container"} onSubmit={saveShelf} ref={shelfFormRef}>
            <div className="form-heading">
              <Eyebrow>{editingShelf ? "REFINE THE COLLECTION" : "MAKE ROOM"}</Eyebrow>
              <h2>{editingShelf ? "Edit container" : "Add a container"}</h2>
            </div>
            <label><span className="field-label">Name</span><input name="name" maxLength={80} defaultValue={editingShelf?.name} placeholder="e.g. The old walnut bookcase" required /></label>
            <label>Kind
              <select name="type" defaultValue={editingShelf?.type ?? "shelf"}>
                <option value="shelf">Bookcase</option><option value="cupboard">Cupboard</option>
                <option value="desk">Desk</option><option value="cabinet">Cabinet</option><option value="other">Other</option>
              </select>
            </label>
            <label><span className="field-label">Levels</span><input name="shelfCount" type="number" min="1" max="100" defaultValue={editingShelf?.shelfCount ?? 4} required /></label>
            <label>Shelf accent<input name="color" type="color" defaultValue={editingShelf?.color ?? "#a66b42"} /></label>
            <label>Cabinet color<input name="cabinetColor" type="color" defaultValue={editingShelf?.cabinetColor ?? "#795638"} /></label>
            <label>Width (cm)<input name="width" type="number" min="1" defaultValue={editingShelf?.width ?? ""} /></label>
            <label>Height (cm)<input name="height" type="number" min="1" defaultValue={editingShelf?.height ?? ""} /></label>
            <label>Depth (cm)<input name="depth" type="number" min="1" defaultValue={editingShelf?.depth ?? ""} /></label>
            <label className="shelf-description">Description<input name="description" maxLength={500} defaultValue={editingShelf?.description ?? ""} /></label>
            <div className="form-actions"><Button className="button button--quiet" type="button" onClick={() => { setShelfFormOpen(false); setEditingShelf(null); }}>Cancel</Button><Button className="button button--primary">{editingShelf ? "Save container" : "Create container"}</Button></div>
          </form>
        )}

        {gameFormOpen && (
          <form className="inline-form game-form" key={editingGame?.id ?? "new-game"} onSubmit={saveGame} ref={gameFormRef}>
            <div className="form-heading">
              <Eyebrow>{editingGame ? "UPDATE ITS CATALOGUE ENTRY" : "GIVE IT A HOME"}</Eyebrow>
              <h2>{editingGame ? "Edit board game" : "Add a board game"}</h2>
            </div>
            <div className="form-grid">
              <label><span className="field-label">Game title</span><input name="name" maxLength={120} defaultValue={editingGame?.name} required placeholder="The name on the box" /></label>
              <label><span className="field-label">Publisher or designer</span><input name="maker" maxLength={120} defaultValue={editingGame?.maker} required /></label>
              <label><span className="field-label">Container</span>
                <select
                  name="shelfId"
                  onChange={(event) => {
                    setGameFormShelfId(event.target.value);
                    setGameStackedOnId("");
                  }}
                  required
                  value={gameFormShelfId}
                >
                  {shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}
                </select>
              </label>
              <label><span className="field-label">Level</span><input
                name="shelfNumber"
                type="number"
                min="1"
                max={shelves.find((shelf) => shelf.id === gameFormShelfId)?.shelfCount ?? 100}
                onChange={(event) => {
                  setGameFormShelfNumber(Number(event.target.value));
                  setGameStackedOnId("");
                }}
                value={gameFormShelfNumber}
                required
              /></label>
              <label>Stored orientation
                <select
                  name="orientation"
                  onChange={(event) => {
                    if (isGameOrientation(event.target.value)) setGameOrientation(event.target.value);
                  }}
                  value={gameOrientation}
                >
                  <option value="vertical">Upright</option>
                  <option value="horizontal">On its side</option>
                  <option value="flat">Flat</option>
                  <option value="stacked">Stacked on another game</option>
                </select>
              </label>
              {gameOrientation === "stacked" && (
                <label><span className="field-label">Stack on top of</span>
                  <select
                    name="stackedOnId"
                    onChange={(event) => setGameStackedOnId(event.target.value)}
                    required
                    value={gameStackedOnId}
                  >
                    <option value="">Choose a game on this level</option>
                    {stackTargets.map((game) => (
                      <option key={game.id} value={game.id}>{game.name} · {game.maker}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>Year<input name="releaseYear" type="number" min="1800" max="2200" defaultValue={editingGame?.releaseYear ?? ""} /></label>
              <label>Minimum players<input name="minPlayers" type="number" min="1" defaultValue={editingGame?.minPlayers ?? ""} /></label>
              <label>Maximum players<input name="maxPlayers" type="number" min="1" defaultValue={editingGame?.maxPlayers ?? ""} /></label>
              <label>Play time (minutes)<input name="playTime" type="number" min="1" defaultValue={editingGame?.playTime ?? ""} /></label>
              <label>Age recommendation<input name="ageLimit" type="number" min="0" defaultValue={editingGame?.ageLimit ?? ""} /></label>
              <label>Image URL<input name="imageUrl" type="url" defaultValue={editingGame?.imageUrl ?? ""} placeholder="https://…" /></label>
              <label>Or upload a cover<input name="imageFile" type="file" accept="image/jpeg,image/png,image/webp" /></label>
            </div>
            <p className="upload-note">JPEG, PNG, or WebP · maximum 8 MB. Choose a URL or upload a file.</p>
            <div className="form-actions"><Button className="button button--quiet" type="button" onClick={() => { setGameFormOpen(false); setEditingGame(null); }}>Cancel</Button><Button className="button button--primary" disabled={restoringGame}>{editingGame ? "Save game" : "Place on the shelf"}</Button></div>
          </form>
        )}

        {arrangingGames && (
          <p className="arrangement-hint" role="status">
            Drop games in the gold markers to reorder, or onto another box to stack. Select any game for reliable placement, orientation, and stack controls. Changes save as you go.
          </p>
        )}

        <section className="game-section" aria-live="polite">
          <div className="section-title">
            <div>
              <Eyebrow>{selectedShelf ? "ON THIS SHELF" : "READY WHEN YOU ARE"}</Eyebrow>
              <h2>{query.trim() ? "The full collection" : "In the collection"}</h2>
              {query.trim() && <p className="section-title__subtitle">Matching games are highlighted; all games remain on their shelves.</p>}
            </div>
            <span className="section-title__rule" />
          </div>

          {loadingGames ? (
            <div className="empty-state" role="status" aria-live="polite"><p>Turning the catalogue pages…</p></div>
          ) : shelves.length > 0 && (visibleGames.length > 0 || !query) ? (
            <div className={`bookcase-list ${selectedShelf ? "bookcase-list--single" : ""}`}>
              {visibleShelves.map((shelf) => (
                <Bookcase
                  games={visibleGames.filter((game) => game.shelf.id === shelf.id)}
                  hoveredGameId={hoveredGameId}
                  key={shelf.id}
                  onDeleteGame={requestDeleteGame}
                  onEditGame={openEditGame}
                  onGameHover={setHoveredGameId}
                  onArrange={saveArrangement}
                  onViewGame={(game) => navigate(`/games/${game.id}`, { state: { from: `${location.pathname}${location.search}` } })}
                  query={query.trim()}
                  shelf={shelf}
                  arranging={arrangingGames}
                  arrangementSaving={arrangementSaving}
                  deletingGameId={deletingGameId}
                  fallingGameIds={fallingGameIds}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <LibraryIcon name="collection" className="empty-state__ornament" />
              <h3>{query ? "No matching titles" : "Your shelves are waiting"}</h3>
              <p>{query ? "Try another title or publisher." : "Create a container to give your games a home."}</p>
              {!query && <Button className="button button--quiet" onClick={openNewShelf}>＋ Create your first container</Button>}
            </div>
          )}
          {!loadingGames && visibleGames.length === 0 && shelves.length > 0 && !query && (
            <div className="first-game-prompt">
              <p>The cases are ready. Add a game to see it placed at its level.</p>
              <Button className="button button--quiet" onClick={openNewGame}>＋ Add the first game</Button>
            </div>
          )}
        </section>

        <footer className="library-footer"><span>Catalogued with care</span></footer>
      </main>
      {pendingDelete && (
        <div className="sweet-alert-backdrop">
          <section
            aria-describedby="delete-alert-description"
            aria-labelledby="delete-alert-title"
            aria-modal="true"
            className="sweet-alert"
            role="alertdialog"
          >
            <span className="sweet-alert__seal"><LibraryIcon name="shelf" /></span>
            <Eyebrow>A MOMENT BEFORE THE SPELL</Eyebrow>
            <h2 id="delete-alert-title">
              {pendingDelete.kind === "game" ? "Let this game go?" : "Remove this container?"}
            </h2>
            <p id="delete-alert-description">
              {pendingDelete.kind === "game"
                ? `“${pendingDelete.game.name}” will be archived. Its play logs, documents, tags, and image will be kept and can return if you add this game again.`
                : `“${pendingDelete.shelf.name}” can only be removed when it is empty.`}
            </p>
            <div className="sweet-alert__actions">
              <Button
                autoFocus
                className="button button--quiet"
                disabled={isDeleting}
                onClick={() => setPendingDelete(null)}
                type="button"
              >
                Keep it
              </Button>
              <Button
                className="button sweet-alert__confirm"
                disabled={isDeleting}
                onClick={() => void confirmDelete()}
                type="button"
              >
                {isDeleting ? "Archiving…" : pendingDelete.kind === "game" ? "Archive game" : "Remove"}
              </Button>
            </div>
          </section>
        </div>
      )}
      {pendingGameCreation && (
        <div className="sweet-alert-backdrop">
          <section
            aria-describedby="restore-alert-description"
            aria-labelledby="restore-alert-title"
            aria-modal="true"
            className="sweet-alert restore-alert"
            role="alertdialog"
          >
            <span className="sweet-alert__seal"><LibraryIcon name="collection" /></span>
            <Eyebrow>A STORY ALREADY IN THE ARCHIVE</Eyebrow>
            <h2 id="restore-alert-title">Bring it back?</h2>
            <p id="restore-alert-description">
              A game with this title is archived. Restore it to bring back its play history, documents, and tags, or create a separate copy.
            </p>
            <div className="restore-match-list">
              {deletedGameMatches.map((match) => (
                <article className="restore-match" key={match.id}>
                  <div>
                    <strong>{match.name}</strong>
                    <span>{match.maker}{match.releaseYear ? ` · ${match.releaseYear}` : ""}</span>
                    <small>Archived {new Date(match.deletedAt).toLocaleDateString()}</small>
                  </div>
                  <Button
                    className="button button--primary"
                    disabled={restoringGame}
                    onClick={() => void chooseDeletedGame(match.id)}
                    type="button"
                  >
                    {restoringGame ? "Restoring…" : "Restore this"}
                  </Button>
                </article>
              ))}
            </div>
            {deletedMatchesTruncated && (
              <p className="restore-alert__note">More archived copies exist; the list shows the 20 most recently archived.</p>
            )}
            <div className="sweet-alert__actions restore-alert__actions">
              <Button
                autoFocus
                className="button button--quiet"
                disabled={restoringGame}
                onClick={() => {
                  setPendingGameCreation(null);
                  setDeletedGameMatches([]);
                  setDeletedMatchesTruncated(false);
                }}
                type="button"
              >
                Back to form
              </Button>
              <Button
                className="button sweet-alert__confirm"
                disabled={restoringGame}
                onClick={() => void chooseDeletedGame()}
                type="button"
              >
                Create a separate game
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
