import { Button, ButtonLink, Eyebrow, FeedbackMessage } from "../components/ui";
import { LibraryNavigation, LibraryRail, LibraryTopbar } from "../components/LibraryChrome";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { GameNightPanel } from "../components/GameNightPanel";
import { LibraryIcon } from "../components/LibraryIcon";
import { OngoingGamesList } from "../components/OngoingGamesList";
import { api, getErrorMessage } from "../lib/api";
import { matchesGameSearch } from "../lib/gameSearch";
import { revealAndFocus } from "../lib/navigation";
import { Game, Player as AppPlayer, Tag } from "../types";

interface GuestGameOption {
  id: string;
  name: string;
}

interface GuestGamePage {
  data: GuestGameOption[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

interface AppPlayerOption {
  id: string;
  fullName: string;
}

interface TableParticipant {
  id: string;
  kind: "app" | "guest";
  playerId: string | null;
  name: string;
}

type GameChoice =
  | { kind: "library"; game: Game }
  | { kind: "guest"; game: GuestGameOption };

function playerRange(game: Game): string {
  if (game.minPlayers !== null && game.maxPlayers !== null) {
    return `${game.minPlayers}–${game.maxPlayers} players`;
  }
  if (game.minPlayers !== null) return `${game.minPlayers}+ players`;
  if (game.maxPlayers !== null) return `Up to ${game.maxPlayers} players`;
  return "Player count unknown";
}

export function LetsPlay({ player, onLogout }: { player: AppPlayer; onLogout: () => void }) {
  const navigate = useNavigate();
  const [games, setGames] = useState<Game[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [appPlayers, setAppPlayers] = useState<AppPlayerOption[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourcesRevision, setResourcesRevision] = useState(0);
  const [resourceError, setResourceError] = useState("");
  const [choice, setChoice] = useState<GameChoice | null>(null);
  const [drawMessage, setDrawMessage] = useState("");
  const [playersAtTable, setPlayersAtTable] = useState("");
  const [maxPlayTime, setMaxPlayTime] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [explicitPlayersAtTable, setExplicitPlayersAtTable] = useState("");
  const [explicitMaxPlayTime, setExplicitMaxPlayTime] = useState("");
  const [choiceList, setChoiceList] = useState<"library" | "guest">("library");
  const [guestQuery, setGuestQuery] = useState("");
  const [guestPage, setGuestPage] = useState(1);
  const [guestGames, setGuestGames] = useState<GuestGamePage | null>(null);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState("");
  const [guestRevision, setGuestRevision] = useState(0);
  const [newGuestName, setNewGuestName] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [activeGameNightId, setActiveGameNightId] = useState<string | null>(null);
  const [gameNightReady, setGameNightReady] = useState(false);
  const [tableParticipants, setTableParticipants] = useState<TableParticipant[]>([]);
  const [participantKind, setParticipantKind] = useState<"app" | "guest">("app");
  const [selectedAppPlayerId, setSelectedAppPlayerId] = useState("");
  const [guestPlayerName, setGuestPlayerName] = useState("");
  const [playLocation, setPlayLocation] = useState("");
  const [setupError, setSetupError] = useState("");
  const choiceRef = useRef<HTMLElement>(null);
  const setupRef = useRef<HTMLElement>(null);
  const handleActiveNightChange = useCallback((id: string | null) => {
    setActiveGameNightId(id);
    setGameNightReady(true);
  }, []);

  useEffect(() => {
    if (choice) revealAndFocus(choiceRef.current, ".lets-play-choice__actions .button--primary");
  }, [choice]);

  useEffect(() => {
    if (setupOpen) {
      revealAndFocus(setupRef.current, ".lets-play-participant-add select[required], .lets-play-participant-add input[required]");
    }
  }, [setupOpen]);

  useEffect(() => {
    let active = true;
    setResourceError("");
    Promise.allSettled([
      api.get<{ data: Game[] }>("/games"),
      api.get<{ data: Tag[] }>("/tags"),
      api.get<{ data: AppPlayerOption[] }>("/players"),
    ])
      .then(([gameResult, tagResult, playerResult]) => {
        if (!active) return;
        if (gameResult.status === "fulfilled") setGames(gameResult.value.data.data);
        else setResourceError(getErrorMessage(gameResult.reason));
        if (tagResult.status === "fulfilled") setTags(tagResult.value.data.data);
        else setResourceError(getErrorMessage(tagResult.reason));
        if (playerResult.status === "fulfilled") setAppPlayers(playerResult.value.data.data);
        else setResourceError(getErrorMessage(playerResult.reason));
      })
      .catch((requestError: unknown) => {
        if (active) setResourceError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setResourcesLoading(false);
      });
    return () => { active = false; };
  }, [resourcesRevision]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ page: String(guestPage) });
      if (guestQuery.trim()) params.set("q", guestQuery.trim());
      setGuestLoading(true);
      setGuestError("");
      api.get<GuestGamePage>(`/play-logs/guest-games?${params.toString()}`)
        .then(({ data }) => {
          if (active) setGuestGames(data);
        })
        .catch((requestError: unknown) => {
          if (active) setGuestError(getErrorMessage(requestError));
        })
        .finally(() => {
          if (active) setGuestLoading(false);
        });
    }, guestQuery ? 250 : 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [guestPage, guestQuery, guestRevision]);

  const filteredGames = useMemo(() => games.filter((game) => {
    if (selectedTagIds.some((tagId) => !game.tags.some((tag) => tag.id === tagId))) return false;
    if (playersAtTable) {
      const playerCount = Number(playersAtTable);
      if (game.minPlayers === null || game.maxPlayers === null) return false;
      if (playerCount < game.minPlayers || playerCount > game.maxPlayers) return false;
    }
    if (maxPlayTime) {
      if (game.playTime === null || game.playTime > Number(maxPlayTime)) return false;
    }
    return true;
  }), [games, maxPlayTime, playersAtTable, selectedTagIds]);

  const matchingLibraryGames = useMemo(() => {
    const query = libraryQuery.trim();
    return games.filter((game) => {
      if (explicitPlayersAtTable) {
        const playerCount = Number(explicitPlayersAtTable);
        if (game.minPlayers === null || game.maxPlayers === null) return false;
        if (playerCount < game.minPlayers || playerCount > game.maxPlayers) return false;
      }
      if (explicitMaxPlayTime && (game.playTime === null || game.playTime > Number(explicitMaxPlayTime))) {
        return false;
      }
      return !query || matchesGameSearch(game, query);
    });
  }, [explicitMaxPlayTime, explicitPlayersAtTable, games, libraryQuery]);
  const libraryOptions = matchingLibraryGames.slice(0, 40);
  const minimumPlayers = choice?.kind === "library" ? choice.game.minPlayers ?? 1 : 1;
  const maximumPlayers = choice?.kind === "library" ? choice.game.maxPlayers : null;
  const canAddParticipant = maximumPlayers === null || tableParticipants.length < maximumPlayers;
  const canStartSession = tableParticipants.length >= minimumPlayers &&
    (maximumPlayers === null || tableParticipants.length <= maximumPlayers);
  const availableAppPlayers = appPlayers.filter(
    (appPlayer) => !tableParticipants.some((participant) => participant.playerId === appPlayer.id),
  );

  function selectGame(nextChoice: GameChoice) {
    setChoice(nextChoice);
    setSetupOpen(false);
    setTableParticipants([]);
    setPlayLocation("");
    setSetupError("");
    setSelectedAppPlayerId("");
    setGuestPlayerName("");
  }

  function clearGameChoice() {
    setChoice(null);
    setSetupOpen(false);
    setTableParticipants([]);
    setPlayLocation("");
    setSetupError("");
  }

  function addTableParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSetupError("");
    if (!canAddParticipant) {
      setSetupError("This game has reached its maximum player count.");
      return;
    }

    if (participantKind === "app") {
      const appPlayer = availableAppPlayers.find(({ id }) => id === selectedAppPlayerId);
      if (!appPlayer) {
        setSetupError("Choose an available app user to add.");
        return;
      }
      setTableParticipants((current) => [
        ...current,
        { id: crypto.randomUUID(), kind: "app", playerId: appPlayer.id, name: appPlayer.fullName },
      ]);
      setSelectedAppPlayerId("");
      return;
    }

    const name = guestPlayerName.trim().replace(/\s+/g, " ");
    if (!name) {
      setSetupError("Enter a name for the guest player.");
      return;
    }
    if (tableParticipants.some((participant) => participant.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setSetupError("That player is already at the table.");
      return;
    }
    setTableParticipants((current) => [
      ...current,
      { id: crypto.randomUUID(), kind: "guest", playerId: null, name },
    ]);
    setGuestPlayerName("");
  }

  async function startSession() {
    if (!canStartSession || !gameNightReady) return;
    if (!choice) return;
    setStarting(true);
    setSetupError("");
    try {
      const { data } = await api.post<{ data: { id: string } }>("/ongoing-games", {
        ...(choice.kind === "library" ? { gameId: choice.game.id } : { guestGameName: choice.game.name }),
        participants: tableParticipants.map((participant) => participant.playerId
          ? { playerId: participant.playerId }
          : { name: participant.name }),
        location: playLocation.trim() || null,
        gameNightId: activeGameNightId,
      });
      navigate(`/lets-play/ongoing/${data.data.id}`);
    } catch (requestError) {
      setSetupError(getErrorMessage(requestError));
    } finally {
      setStarting(false);
    }
  }

  function chooseRandom(candidates: Game[]) {
    setDrawMessage("");
    if (candidates.length === 0) {
      clearGameChoice();
      setDrawMessage("No games match those conditions. Try widening the filters.");
      return;
    }
    const game = candidates[Math.floor(Math.random() * candidates.length)];
    if (!game) return;
    selectGame({ kind: "library", game });
    setDrawMessage("");
  }

  function chooseGuestName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newGuestName.trim().replace(/\s+/g, " ");
    if (!name) return;
    selectGame({ kind: "guest", game: { id: `new:${name.toLocaleLowerCase()}`, name } });
    setNewGuestName("");
  }

  function chooseGuest(game: GuestGameOption) {
    selectGame({ kind: "guest", game });
    setDrawMessage("");
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((current) => current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId]);
  }

  return (
    <div className="library-shell lets-play-shell">
      <LibraryRail player={player} onLogout={onLogout}>
        <LibraryNavigation activePage="lets-play" />
        
      </LibraryRail>

      <main className="library-main lets-play-main">
        <LibraryTopbar section="GAME NIGHT" page="LET’S PLAY" />

        <section className="lets-play-heading">
          <div>
            <Eyebrow>GATHER ROUND THE TABLE</Eyebrow>
            <h1>{choice ? (setupOpen ? "Set the table." : "Your game is ready.") : "What shall we play?"}</h1>
            <p>{choice ? "Your game selection is ready for the group." : "Pick a familiar favorite, or let the shelves decide."}</p>
          </div>
        </section>

        <OngoingGamesList />
        <GameNightPanel onActiveNightChange={handleActiveNightChange} />

        {resourceError && (
          <FeedbackMessage
            className="notice notice--error"
            message={resourceError}
            onDismiss={() => setResourceError("")}
            onRetry={() => {
              setResourcesLoading(true);
              setResourcesRevision((value) => value + 1);
            }}
          />
        )}
        {drawMessage && (
          <FeedbackMessage
            className="lets-play-notice"
            message={drawMessage}
            onDismiss={() => setDrawMessage("")}
            tone="info"
          />
        )}

        {choice && (
          <section className="lets-play-choice" aria-live="polite" aria-label="Selected game" ref={choiceRef}>
            <div className="lets-play-choice__mark"><LibraryIcon name={choice.kind === "guest" ? "collection" : "play"} /></div>
            <div className="lets-play-choice__details">
              <Eyebrow>{choice.kind === "guest" ? "GUEST GAME" : "YOUR NEXT GAME"}</Eyebrow>
              <h2>{choice.game.name}</h2>
              {choice.kind === "library" ? (
                <>
                  <p>{choice.game.maker} · {choice.game.shelf.name}, shelf {choice.game.shelfNumber}</p>
                  <div className="lets-play-choice__facts">
                    <span>{playerRange(choice.game)}</span>
                    <span>{choice.game.playTime ? `${choice.game.playTime} min` : "Playtime unknown"}</span>
                    {choice.game.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}
                  </div>
                </>
              ) : (
                <p>This title is not in the library collection.</p>
              )}
              <p className="lets-play-choice__ready">
                {setupOpen ? "Add everyone at the table before starting." : "Your pick is ready."}
              </p>
            </div>
            <div className="lets-play-choice__actions">
              <Button className="button button--quiet" onClick={clearGameChoice} type="button">
                ← Back to choices
              </Button>
              {choice.kind === "library" && (
                <ButtonLink to={`/games/${choice.game.id}`} variant="quiet">
                  Open dossier
                </ButtonLink>
              )}
              {!setupOpen && (
                <Button className="button button--primary" onClick={() => { setSetupOpen(true); setSetupError(""); }} type="button">
                  Choose game
                </Button>
              )}
            </div>
          </section>
        )}

        {choice && setupOpen && (
          <section className="lets-play-session-setup" aria-labelledby="lets-play-session-title" ref={setupRef}>
            <header className="lets-play-session-setup__heading">
              <div>
                <Eyebrow>SET THE TABLE</Eyebrow>
                <h2 id="lets-play-session-title">Who’s playing?</h2>
                <p>
                  {choice.kind === "library" && choice.game.minPlayers
                    ? `Add at least ${choice.game.minPlayers} players for ${choice.game.name}.`
                    : "Add at least one player to start this game."}
                </p>
              </div>
              <span className="lets-play-session-setup__count">
                {tableParticipants.length}
                {maximumPlayers === null ? " added" : ` / ${maximumPlayers}`}
                <small>{tableParticipants.length === 1 ? "player" : "players"}</small>
              </span>
            </header>

            <form className="lets-play-participant-add" onSubmit={addTableParticipant}>
              <label>
                Player type
                <select
                  value={participantKind}
                  onChange={(event) => {
                    setParticipantKind(event.target.value === "guest" ? "guest" : "app");
                    setSetupError("");
                  }}
                >
                  <option value="app">App user</option>
                  <option value="guest">Guest player</option>
                </select>
              </label>
              {participantKind === "app" ? (
                <label>
                  <span className="field-label">App player</span>
                  <select required value={selectedAppPlayerId} onChange={(event) => setSelectedAppPlayerId(event.target.value)}>
                    <option value="">Choose an available user</option>
                    {availableAppPlayers.map((appPlayer) => <option key={appPlayer.id} value={appPlayer.id}>{appPlayer.fullName}</option>)}
                  </select>
                </label>
              ) : (
                <label>
                  <span className="field-label">Guest name</span>
                  <input autoComplete="off" maxLength={100} required value={guestPlayerName} onChange={(event) => setGuestPlayerName(event.target.value)} placeholder="Enter a player’s name" />
                </label>
              )}
              <Button
                className="button button--quiet"
                disabled={!canAddParticipant || (participantKind === "app" ? !selectedAppPlayerId : !guestPlayerName.trim())}
                type="submit"
              >
                {canAddParticipant ? "＋ Add player" : "Player limit reached"}
              </Button>
            </form>

            {setupError && (
              <FeedbackMessage
                className="lets-play-session-setup__error"
                message={setupError}
                onDismiss={() => setSetupError("")}
              />
            )}

            {tableParticipants.length ? (
              <ul className="lets-play-table-players" aria-label="Players at the table" aria-live="polite">
                {tableParticipants.map((participant, index) => (
                  <li className="lets-play-table-player" key={participant.id}>
                    <span className="lets-play-table-player__number" aria-hidden="true">{index + 1}</span>
                    <span className="lets-play-table-player__identity">
                      <span className="lets-play-table-player__name">{participant.name}</span>
                      <small className="lets-play-table-player__type">{participant.kind === "app" ? "App user" : "Guest"}</small>
                    </span>
                    <Button
                      aria-label={`Remove ${participant.name}`}
                      className="lets-play-table-player__remove"
                      onClick={() => {
                        setTableParticipants((current) => current.filter(({ id }) => id !== participant.id));
                        setSetupError("");
                      }}
                      type="button"
                    >
                      <X aria-hidden="true" size={15} />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lets-play-table-players__empty" aria-live="polite">No players added yet.</p>
            )}

            <label className="lets-play-location">
              Place to play
              <input maxLength={120} value={playLocation} onChange={(event) => setPlayLocation(event.target.value)} placeholder="Home, game club, convention…" />
            </label>

            <footer className="lets-play-session-setup__footer">
              <span role="status">
                {!gameNightReady
                  ? "Checking the game-night scorebook…"
                  : canStartSession
                  ? "The table has enough players to start."
                  : `${minimumPlayers - tableParticipants.length} more ${minimumPlayers - tableParticipants.length === 1 ? "player" : "players"} needed to start.`}
              </span>
              <Button className="button button--primary" disabled={!canStartSession || !gameNightReady || starting} onClick={() => void startSession()} type="button">
                {starting ? "Starting…" : "Start game"}
              </Button>
            </footer>
          </section>
        )}

        {!choice && (
          <>
        <div className="lets-play-methods">
          <section className="lets-play-panel lets-play-random">
            <div className="lets-play-panel__heading">
              <span className="lets-play-panel__number">01</span>
              <div><Eyebrow>THE FULL SHELF</Eyebrow><h2>Surprise us</h2></div>
            </div>
            <p>Draw one game at random from the whole library.</p>
            <span className="lets-play-panel__count">{resourcesLoading ? "Gathering the collection…" : `${games.length} games in the draw`}</span>
            <Button
              className="button button--primary"
              disabled={resourcesLoading || games.length === 0}
              onClick={() => chooseRandom(games)}
              type="button"
            >
              Pick a random game
            </Button>
          </section>

          <section className="lets-play-panel lets-play-filter">
            <div className="lets-play-panel__heading">
              <span className="lets-play-panel__number">02</span>
              <div><Eyebrow>SET THE TABLE</Eyebrow><h2>Find a fit</h2></div>
            </div>
            <p>Draw from games that suit the group and the evening.</p>
            <div className="lets-play-filter__fields">
              <label>
                Players at the table
                <input min="1" max="100" type="number" value={playersAtTable} onChange={(event) => setPlayersAtTable(event.target.value)} placeholder="Any number" />
              </label>
              <label>
                Maximum playtime (minutes)
                <input min="1" max="10000" type="number" value={maxPlayTime} onChange={(event) => setMaxPlayTime(event.target.value)} placeholder="Any length" />
              </label>
            </div>
            <fieldset className="lets-play-tags">
              <legend>Include every selected tag</legend>
              <div className="lets-play-tags__list">
                {tags.length ? tags.map((tag) => (
                  <label key={tag.id} className={selectedTagIds.includes(tag.id) ? "lets-play-tag is-selected" : "lets-play-tag"}>
                    <input checked={selectedTagIds.includes(tag.id)} onChange={() => toggleTag(tag.id)} type="checkbox" />
                    <span>#{tag.name}</span>
                  </label>
                )) : <span className="lets-play-tags__empty">No tags in the collection yet.</span>}
              </div>
            </fieldset>
            <div className="lets-play-filter__footer">
              <span>{resourcesLoading ? "Filtering…" : `${filteredGames.length} matching ${filteredGames.length === 1 ? "game" : "games"}`}</span>
              <Button
                className="button button--primary"
                disabled={resourcesLoading || filteredGames.length === 0}
                onClick={() => chooseRandom(filteredGames)}
                type="button"
              >
                Draw from matches
              </Button>
            </div>
            {(playersAtTable || maxPlayTime || selectedTagIds.length > 0) && (
              <Button
                className="lets-play-filter__reset"
                onClick={() => { setPlayersAtTable(""); setMaxPlayTime(""); setSelectedTagIds([]); }}
                type="button"
              >
                Clear filters
              </Button>
            )}
          </section>
        </div>

        <section className="lets-play-picker" aria-labelledby="lets-play-picker-title">
          <div className="lets-play-picker__heading">
            <div><Eyebrow>MAKE THE CALL</Eyebrow><h2 id="lets-play-picker-title">Choose a game</h2></div>
            <span>Pick from the shelves or choose a guest title.</span>
          </div>
          <div className="lets-play-picker__tabs" role="group" aria-label="Game source">
            <Button aria-pressed={choiceList === "library"} className={choiceList === "library" ? "is-selected" : ""} onClick={() => setChoiceList("library")} type="button">
              <LibraryIcon name="collection" /> Library games
            </Button>
            <Button aria-pressed={choiceList === "guest"} className={choiceList === "guest" ? "is-selected" : ""} onClick={() => setChoiceList("guest")} type="button">
              <LibraryIcon name="play" /> Guest games
            </Button>
          </div>

          {choiceList === "library" ? (
            <>
              <div className="lets-play-explicit-filters">
                <Eyebrow>REFINE THIS LIST</Eyebrow>
                <div className="lets-play-explicit-filters__fields">
                  <label>
                    Players at the table
                    <input min="1" max="100" type="number" value={explicitPlayersAtTable} onChange={(event) => setExplicitPlayersAtTable(event.target.value)} placeholder="Any number" />
                  </label>
                  <label>
                    Maximum playtime (minutes)
                    <input min="1" max="10000" type="number" value={explicitMaxPlayTime} onChange={(event) => setExplicitMaxPlayTime(event.target.value)} placeholder="Any length" />
                  </label>
                </div>
                <p>Search titles or makers, or start with <strong>#</strong> to search game tags.</p>
                {(explicitPlayersAtTable || explicitMaxPlayTime || libraryQuery) && (
                  <Button
                    className="lets-play-explicit-filters__reset"
                    onClick={() => {
                      setExplicitPlayersAtTable("");
                      setExplicitMaxPlayTime("");
                      setLibraryQuery("");
                    }}
                    type="button"
                  >
                    Clear filters
                  </Button>
                )}
              </div>
              <label className="lets-play-search">
                <span className="lets-play-search__field">
                  <span className="sr-only">Search library games</span>
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <path d="m15.5 15.5 5 5" />
                  </svg>
                  <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Search title, maker, or #tag…" />
                </span>
                <span className="lets-play-search__count">{matchingLibraryGames.length} found</span>
              </label>
              {resourcesLoading ? <p className="lets-play-empty">Opening the shelves…</p> : libraryOptions.length ? (
                <div className="lets-play-options">
                  {libraryOptions.map((game) => (
                    <Button className="lets-play-option" key={game.id} onClick={() => selectGame({ kind: "library", game })} type="button">
                      <span className="lets-play-option__cover">{game.imageUrl ? <img alt="" src={game.imageUrl} /> : <LibraryIcon name="collection" />}</span>
                      <span className="lets-play-option__details">
                        <strong>{game.name}</strong><small>{game.maker} · {game.shelf.name} · LEVEL {game.shelfNumber} · {playerRange(game)}</small>
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="lets-play-empty">{games.length ? "No games match this search and the selected filters." : "The shelves are empty for now."}</p>
              )}
              {!resourcesLoading && libraryQuery.trim() && matchingLibraryGames.length > libraryOptions.length && (
                <p className="lets-play-picker__hint">Showing the first {libraryOptions.length} matches. Refine your search to see other titles.</p>
              )}
            </>
          ) : (
            <div className="lets-play-guests">
              <form className="lets-play-search" onSubmit={(event) => { event.preventDefault(); setGuestPage(1); }}>
                <label className="lets-play-search__field" htmlFor="guest-game-search">
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <path d="m15.5 15.5 5 5" />
                  </svg>
                  <input id="guest-game-search" value={guestQuery} onChange={(event) => { setGuestQuery(event.target.value); setGuestPage(1); }} placeholder="Search saved guest games…" />
                </label>
                <span className="lets-play-search__count">{guestGames?.pagination.total ?? "—"} saved</span>
              </form>
              {guestError && (
                <FeedbackMessage
                  className="notice notice--error"
                  message={guestError}
                  onDismiss={() => setGuestError("")}
                  onRetry={() => {
                    setGuestLoading(true);
                    setGuestRevision((value) => value + 1);
                  }}
                />
              )}
              {guestLoading ? <p className="lets-play-empty">Searching guest games…</p> : guestGames?.data.length ? (
                <div className="lets-play-options">
                  {guestGames.data.map((game) => (
                    <Button className="lets-play-option" key={game.id} onClick={() => chooseGuest(game)} type="button">
                      <span className="lets-play-option__cover lets-play-option__cover--guest"><LibraryIcon name="play" /></span>
                      <span className="lets-play-option__details"><strong>{game.name}</strong><small>Saved guest game · not in the collection</small></span>
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="lets-play-empty">{guestQuery ? "No saved guest games match this search." : "No guest games have been logged yet."}</p>
              )}
              {guestGames && guestGames.pagination.totalPages > 1 && (
                <div className="lets-play-guest-pagination">
                  <Button className="button button--quiet" disabled={guestPage <= 1 || guestLoading} onClick={() => setGuestPage((page) => page - 1)} type="button">Previous</Button>
                  <span>Page {guestPage} of {guestGames.pagination.totalPages}</span>
                  <Button className="button button--quiet" disabled={guestPage >= guestGames.pagination.totalPages || guestLoading} onClick={() => setGuestPage((page) => page + 1)} type="button">Next</Button>
                </div>
              )}
              <form className="lets-play-new-guest" onSubmit={chooseGuestName}>
                <label htmlFor="new-guest-game-name">Or choose a guest game by name</label>
                <div>
                  <input id="new-guest-game-name" maxLength={120} value={newGuestName} onChange={(event) => setNewGuestName(event.target.value)} placeholder="Enter a game title…" />
                  <Button className="button button--quiet" disabled={!newGuestName.trim()} type="submit">Choose title</Button>
                </div>
                <small>This is only a selection for now; it won’t be saved to your history.</small>
              </form>
            </div>
          )}
        </section>
          </>
        )}
      </main>
    </div>
  );
}
