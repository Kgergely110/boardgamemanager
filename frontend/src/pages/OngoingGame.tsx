import { Button, ButtonLink, Eyebrow, FeedbackMessage } from "../components/ui";
import { LibraryNavigation, LibraryRail, LibraryTopbar } from "../components/LibraryChrome";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, getErrorMessage } from "../lib/api";
import { getSpotifyEmbed } from "../lib/spotifyEmbed";
import { AmbienceSet, OngoingGame as OngoingGameRecord, Player as AppPlayer } from "../types";

type ClockAction = "pause" | "resume" | "finish";
type CloseoutResult = { placement: string; score: string };

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function OngoingGame({ player, onLogout }: { player: AppPlayer; onLogout: () => void }) {
  const { ongoingGameId } = useParams();
  const navigate = useNavigate();
  const [ongoingGame, setOngoingGame] = useState<OngoingGameRecord | null>(null);
  const [ambienceSets, setAmbienceSets] = useState<AmbienceSet[]>([]);
  const [ambienceLoading, setAmbienceLoading] = useState(false);
  const [ambienceError, setAmbienceError] = useState("");
  const [ambienceRetry, setAmbienceRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [clockAction, setClockAction] = useState<ClockAction | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [closeoutWasRunning, setCloseoutWasRunning] = useState(false);
  const [closeoutResults, setCloseoutResults] = useState<Record<string, CloseoutResult>>({});
  const [clockNow, setClockNow] = useState(() => performance.now());
  const [clockAnchor, setClockAnchor] = useState<{ elapsedSeconds: number; capturedAt: number } | null>(null);
  const refreshVersion = useRef(0);
  const hasLoadedGame = useRef(false);

  useEffect(() => {
    let active = true;
    const gameId = ongoingGame?.game?.id;
    if (!gameId) {
      setAmbienceSets([]);
      setAmbienceError("");
      setAmbienceLoading(false);
      return () => { active = false; };
    }

    setAmbienceLoading(true);
    setAmbienceError("");
    api.get<{ data: AmbienceSet[] }>(`/ambience/for-game/${gameId}`)
      .then(({ data }) => {
        if (active) setAmbienceSets(data.data);
      })
      .catch((requestError: unknown) => {
        if (active) setAmbienceError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setAmbienceLoading(false);
      });
    return () => { active = false; };
  }, [ambienceRetry, ongoingGame?.game?.id]);

  useEffect(() => {
    let active = true;
    hasLoadedGame.current = false;
    setOngoingGame(null);
    setLoadFailed(false);
    async function loadOngoingGame() {
      const version = refreshVersion.current;
      if (!ongoingGameId) {
        setError("Ongoing game not found.");
        setLoading(false);
        return;
      }
      try {
        const { data } = await api.get<{ data: OngoingGameRecord }>(`/ongoing-games/${ongoingGameId}`);
        if (active && refreshVersion.current === version) {
          const capturedAt = performance.now();
          hasLoadedGame.current = true;
          setOngoingGame(data.data);
          setLoadFailed(false);
          setClockAnchor({ elapsedSeconds: data.data.elapsedSeconds, capturedAt });
          setClockNow(capturedAt);
          setError("");
        }
      } catch (requestError) {
        if (active && refreshVersion.current === version) {
          if (!hasLoadedGame.current) {
            setOngoingGame(null);
            setLoadFailed(true);
          }
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    setLoading(true);
    void loadOngoingGame();
    const intervalId = window.setInterval(() => void loadOngoingGame(), 15_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [ongoingGameId]);

  useEffect(() => {
    if (!ongoingGame || ongoingGame.pausedAt) return;
    const intervalId = window.setInterval(() => setClockNow(performance.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [ongoingGame?.id, ongoingGame?.pausedAt]);

  const elapsedSeconds = ongoingGame && clockAnchor
    ? clockAnchor.elapsedSeconds + (ongoingGame.pausedAt ? 0 : Math.floor((clockNow - clockAnchor.capturedAt) / 1000))
    : 0;
  const gameName = ongoingGame?.game?.name ?? ongoingGame?.guestGame?.name ?? "Ongoing game";

  async function changeClock(action: Exclude<ClockAction, "finish">): Promise<boolean> {
    if (!ongoingGame) return false;
    refreshVersion.current += 1;
    setClockAction(action);
    setError("");
    try {
      const { data } = await api.post<{ data: OngoingGameRecord }>(`/ongoing-games/${ongoingGame.id}/${action}`);
      const capturedAt = performance.now();
      setOngoingGame(data.data);
      setClockAnchor({ elapsedSeconds: data.data.elapsedSeconds, capturedAt });
      setClockNow(capturedAt);
      refreshVersion.current += 1;
      return true;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return false;
    } finally {
      setClockAction(null);
    }
  }

  async function openFinishForm() {
    if (!ongoingGame || clockAction) return;
    const wasRunning = !ongoingGame.pausedAt;
    setCloseoutWasRunning(wasRunning);
    if (wasRunning && !(await changeClock("pause"))) {
      setCloseoutWasRunning(false);
      return;
    }
    setCloseoutResults(Object.fromEntries(ongoingGame.participants.map((participant) => [
      participant.id,
      { placement: "", score: "" },
    ])));
    setError("");
    setConfirmFinish(true);
  }

  async function cancelFinish() {
    setConfirmFinish(false);
    if (closeoutWasRunning) await changeClock("resume");
    setCloseoutWasRunning(false);
  }

  async function finishGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ongoingGame) return;
    setClockAction("finish");
    setError("");
    try {
      await api.post(`/ongoing-games/${ongoingGame.id}/finish`, {
        results: ongoingGame.participants.map((participant) => {
          const result = closeoutResults[participant.id] ?? { placement: "", score: "" };
          return {
            participantId: participant.id,
            placement: result.placement === "" ? null : Number(result.placement),
            score: result.score.trim() === "" ? null : Number(result.score),
          };
        }),
      });
      navigate("/logs", { replace: true });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setClockAction(null);
    }
  }

  return (
    <div className="library-shell ongoing-game-shell">
      <LibraryRail player={player} onLogout={onLogout}>
        <LibraryNavigation activePage="lets-play" />
        
      </LibraryRail>

      <main className="library-main ongoing-game-main">
        <LibraryTopbar section="GAME NIGHT" page="IN PROGRESS" />

        <Link className="ongoing-game-back" to="/lets-play">← All game choices</Link>
        {error && (
          <FeedbackMessage className="notice notice--error" message={error} onDismiss={() => setError("")} />
        )}
        {loading && !ongoingGame ? (
          <p className="ongoing-game-loading">Rejoining the table…</p>
        ) : !ongoingGame ? (
          <section className="ongoing-game-missing">
            <Eyebrow>{loadFailed ? "UNABLE TO REJOIN" : "TABLE NOT FOUND"}</Eyebrow>
            <h1>{loadFailed ? "Could not load this game." : "This game is no longer in progress."}</h1>
            <p>{loadFailed ? "The table may be temporarily unavailable." : "It may have been finished elsewhere."}</p>
            {loadFailed && (
              <Button className="button button--primary" onClick={() => window.location.reload()} type="button">
                Refresh page
              </Button>
            )}
            <ButtonLink to="/logs" variant="primary">Return to game logs</ButtonLink>
          </section>
        ) : (
          <>
            <section className="ongoing-game-heading">
              <div>
                <span className={ongoingGame.pausedAt ? "ongoing-game-status is-paused" : "ongoing-game-status"}>
                  {ongoingGame.pausedAt ? "PAUSED" : "IN PROGRESS"}
                </span>
                <h1>{gameName}</h1>
                <p>Started <time dateTime={ongoingGame.startedAt}>{new Date(ongoingGame.startedAt).toLocaleString()}</time></p>
              </div>
            </section>

            <div className="ongoing-game-layout">
              <section className="ongoing-game-clock" aria-label="Game timer">
                <Eyebrow>{ongoingGame.pausedAt ? "TIME PAUSED" : "TIME AT THE TABLE"}</Eyebrow>
                <output className="ongoing-game-clock__time" aria-label={`Elapsed time ${formatElapsed(elapsedSeconds)}`}>
                  {formatElapsed(elapsedSeconds)}
                </output>
                <p>{ongoingGame.pausedAt ? "The clock will stay still until you resume." : "This timer keeps running if you leave the page."}</p>
                <div className="ongoing-game-clock__actions">
                  {ongoingGame.pausedAt ? (
                    <Button className="button button--primary" disabled={clockAction !== null} onClick={() => void changeClock("resume")} type="button">
                      {clockAction === "resume" ? "Saving…" : "Resume clock"}
                    </Button>
                  ) : (
                    <Button className="button button--quiet" disabled={clockAction !== null} onClick={() => void changeClock("pause")} type="button">
                      {clockAction === "pause" ? "Saving…" : "Pause clock"}
                    </Button>
                  )}
                  <Button className="button button--finish" disabled={clockAction !== null} onClick={() => void openFinishForm()} type="button">
                    Finish game
                  </Button>
                </div>
                {clockAction && clockAction !== "finish" && <span className="ongoing-game-clock__saved" role="status">Saving clock state…</span>}
              </section>

              <aside className="ongoing-game-details" aria-label="Game and player details">
                {ongoingGame.game?.imageUrl && <img className="ongoing-game-details__image" src={ongoingGame.game.imageUrl} alt="" />}
                <Eyebrow>AT THIS TABLE</Eyebrow>
                {ongoingGame.game && (
                  <>
                    <h2>{ongoingGame.game.name} ({ongoingGame.game.maker})</h2>
                    <p>{ongoingGame.game.shelf.name} · shelf {ongoingGame.game.shelfNumber}</p>
                    <dl>
                      <div><dt>Players</dt><dd>{ongoingGame.game.minPlayers ?? 1}{ongoingGame.game.maxPlayers ? `–${ongoingGame.game.maxPlayers}` : "+"}</dd></div>
                      <div><dt>Typical playtime</dt><dd>{ongoingGame.game.playTime ? `${ongoingGame.game.playTime} min` : "Not listed"}</dd></div>
                    </dl>
                    {ongoingGame.game.tags.length > 0 && (
                      <div className="ongoing-game-details__tags">{ongoingGame.game.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}</div>
                    )}
                  </>
                )}
                {ongoingGame.location && <p className="ongoing-game-details__location">Playing at {ongoingGame.location}</p>}
                {ongoingGame.gameNightId && <p className="ongoing-game-details__night">Part of tonight’s scorebook</p>}
                <div className="ongoing-game-details__players">
                  <strong>Players ({ongoingGame.participants.length})</strong>
                  {ongoingGame.participants.map((participant) => <span key={participant.id}>{participant.displayName}</span>)}
                </div>
              </aside>
            </div>

            <section className="ongoing-game-ambience" aria-labelledby="ongoing-game-ambience-title">
              <header className="ongoing-game-ambience__heading">
                <div>
                  <Eyebrow>MUSIC, MOTION & MOOD</Eyebrow>
                  <h2 id="ongoing-game-ambience-title">Set the scene</h2>
                </div>
                <Link className="ongoing-game-ambience__manage" to="/ambience">Manage atmospheres ↗</Link>
              </header>
              {ambienceError && (
                <FeedbackMessage
                  className="ongoing-game-ambience__error"
                  message={ambienceError}
                  onDismiss={() => setAmbienceError("")}
                  onRetry={() => setAmbienceRetry((value) => value + 1)}
                />
              )}
              {ambienceLoading ? (
                <p className="ongoing-game-ambience__empty">Finding a fitting atmosphere…</p>
              ) : ambienceSets.length > 0 ? (
                <div className="ongoing-game-ambience__sets">
                  {ambienceSets.map((set) => {
                    const gameSpecific = set.games.some((game) => game.id === ongoingGame.game?.id);
                    const matchingTags = set.tags.filter((tag) =>
                      ongoingGame.game?.tags.some((gameTag) => gameTag.id === tag.id),
                    );
                    return (
                      <article className="ongoing-game-ambience__set" key={set.id}>
                        <div className="ongoing-game-ambience__set-heading">
                          <div><h3>{set.name}</h3>{set.description && <p>{set.description}</p>}</div>
                          <span>{gameSpecific ? "GAME SETUP" : `#${matchingTags.map((tag) => tag.name).join(" · #")}`}</span>
                        </div>
                        {matchingTags.length > 0 && gameSpecific && (
                          <div className="ongoing-game-ambience__tags">{matchingTags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}</div>
                        )}
                        <div className="ongoing-game-ambience__links">
                          {set.links.map((link) => {
                            const spotifyEmbed = link.embed ? getSpotifyEmbed(link.uri) : null;
                            return spotifyEmbed ? (
                              <div className="ongoing-game-ambience__embed" key={link.id}>
                                <span className="ongoing-game-ambience__embed-title">{link.title} · SPOTIFY</span>
                                <iframe
                                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                  height={spotifyEmbed.height}
                                  loading="lazy"
                                  referrerPolicy="strict-origin-when-cross-origin"
                                  src={spotifyEmbed.src}
                                  title={`Spotify player: ${link.title}`}
                                  width="100%"
                                />
                                <a href={link.uri} rel="noopener noreferrer" target="_blank">Open in Spotify ↗</a>
                              </div>
                            ) : (
                              <a href={link.uri} key={link.id} rel="noopener noreferrer" target="_blank">
                                <small>{link.kind === "music" ? "MUSIC" : link.kind === "visual" ? "VISUAL" : "MUSIC & VISUAL"}</small>
                                <strong>{link.title}</strong>
                                <span aria-hidden="true">↗</span>
                              </a>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="ongoing-game-ambience__empty">
                  {ongoingGame.game
                    ? "No atmosphere is linked to this game or its tags yet."
                    : "Guest games do not have library tags. Add a library game or its tags to an atmosphere to see it here."}
                </p>
              )}
            </section>
          </>
        )}
      </main>

      {confirmFinish && ongoingGame && (
        <div className="ongoing-game-confirm-backdrop">
          <form className="ongoing-game-confirm" onSubmit={(event) => void finishGame(event)} role="dialog" aria-modal="true" aria-labelledby="ongoing-game-confirm-title">
            <Eyebrow>SAVE THIS SESSION</Eyebrow>
            <h2 id="ongoing-game-confirm-title">How did the table finish?</h2>
            <p>The clock is paused while you enter results. Places are optional, ties are welcome, and placement points are 3 for first, 2 for second, and 1 for third.</p>
            {ongoingGame.gameNightId && <p className="ongoing-game-confirm__night">This log will count toward tonight’s game-night standings.</p>}
            <div className="ongoing-game-closeout__players">
              {ongoingGame.participants.map((participant) => {
                const result = closeoutResults[participant.id] ?? { placement: "", score: "" };
                return (
                  <fieldset className="ongoing-game-closeout__player" key={participant.id}>
                    <legend>{participant.displayName}</legend>
                    <label>
                      Place
                      <select
                        disabled={clockAction === "finish"}
                        onChange={(event) => setCloseoutResults((current) => ({
                          ...current,
                          [participant.id]: {
                            ...(current[participant.id] ?? { placement: "", score: "" }),
                            placement: event.target.value,
                          },
                        }))}
                        value={result.placement}
                      >
                        <option value="">Unranked</option>
                        {ongoingGame.participants.map((_, index) => {
                          const place = index + 1;
                          return <option key={place} value={place}>{place}{place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"} place</option>;
                        })}
                      </select>
                    </label>
                    <label>
                      Score <span>(optional)</span>
                      <input
                        disabled={clockAction === "finish"}
                        onChange={(event) => setCloseoutResults((current) => ({
                          ...current,
                          [participant.id]: {
                            ...(current[participant.id] ?? { placement: "", score: "" }),
                            score: event.target.value,
                          },
                        }))}
                        step="1"
                        type="number"
                        value={result.score}
                      />
                    </label>
                  </fieldset>
                );
              })}
            </div>
            {error && (
              <FeedbackMessage
                className="ongoing-game-confirm__error"
                message={error}
                onDismiss={() => setError("")}
              />
            )}
            <div className="ongoing-game-confirm__actions">
              <Button className="button button--quiet" disabled={clockAction === "finish"} onClick={() => void cancelFinish()} type="button">Keep playing</Button>
              <Button className="button button--finish" disabled={clockAction === "finish"} type="submit">
                {clockAction === "finish" ? "Saving log…" : "Finish & save log"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
