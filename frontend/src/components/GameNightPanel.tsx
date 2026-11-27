import { Button, Eyebrow, FeedbackMessage, Panel } from "./ui";
import { Crown } from "lucide-react";
import { useEffect, useState } from "react";
import { api, getErrorMessage } from "../lib/api";
import { GameNight, GameNightStanding } from "../types";
import { downloadGameNightCertificate } from "../lib/gameNightCertificate";

type NightBoardMetric = "wins" | "points";

function nightDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
  });
}

function GameNightBoard({ items, metric }: { items: GameNightStanding[]; metric: NightBoardMetric }) {
  const scoreOf = (item: GameNightStanding) => item[metric];
  const firstItem = items[0];
  const leaderScore = firstItem ? scoreOf(firstItem) : 0;
  const leadersCount = items.filter((item) => scoreOf(item) === leaderScore && leaderScore > 0).length;
  let previousScore = -1;
  let rank = 0;

  return (
    <section className={`game-night-board game-night-board--${metric}`} aria-label={metric === "wins" ? "Most wins standings" : "Placement points standings"}>
      <header className="game-night-board__heading">
        <div>
          <Eyebrow>{metric === "wins" ? "FIRST-PLACE FINISHES" : "3 · 2 · 1 SCORING"}</Eyebrow>
          <h3>{metric === "wins" ? "Most wins" : "Placement points"}</h3>
        </div>
        <span>{metric === "wins" ? "wins" : "points"}</span>
      </header>
      {items.length ? (
        <ol className="game-night-board__list">
          {items.map((item, index) => {
            const score = scoreOf(item);
            if (score !== previousScore) rank = index + 1;
            previousScore = score;
            const isLeader = score > 0 && score === leaderScore;
            return (
              <li
                aria-label={`${item.name}, ${isLeader && leadersCount > 1 ? "tied leader" : isLeader ? "leader" : `rank ${rank}`}, ${score} ${metric}`}
                className={`game-night-board__row${isLeader ? " game-night-board__row--leader" : ""}`}
                key={`${item.playerId ?? item.name}-${index}`}
              >
                <span className="game-night-board__rank" aria-hidden="true">
                  {isLeader ? <Crown /> : String(rank).padStart(2, "0")}
                </span>
                <span className="game-night-board__player">
                  <strong>{item.name}</strong>
                  <small>{item.gamesPlayed} {item.gamesPlayed === 1 ? "game" : "games"} played</small>
                </span>
                <span className="game-night-board__score">
                  <strong>{score}</strong>
                  <small>{metric}</small>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="game-night-board__empty">Finish a game to see the standings.</p>
      )}
      {items.length > 0 && leaderScore === 0 && (
        <p className="game-night-board__empty">No {metric === "wins" ? "first-place finishes" : "ranked finishes"} yet.</p>
      )}
    </section>
  );
}

export function GameNightPanel({ onActiveNightChange }: { onActiveNightChange: (id: string | null) => void }) {
  const [nights, setNights] = useState<GameNight[]>([]);
  const [selectedNightId, setSelectedNightId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [recap, setRecap] = useState<GameNight | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [certificateError, setCertificateError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadNights() {
      setLoading(true);
      setLoadError("");
      try {
        const { data } = await api.get<{ data: GameNight[] }>("/game-nights");
        if (active) {
          setNights(data.data);
          const activeNight = data.data.find((night) => night.endedAt === null);
          onActiveNightChange(activeNight?.id ?? null);
          setSelectedNightId((current) =>
            current && data.data.some((night) => night.id === current)
              ? current
              : activeNight?.id ?? data.data[0]?.id ?? null,
          );
        }
      } catch (requestError) {
        if (active) {
          setLoadError(getErrorMessage(requestError));
          if (revision === 0) onActiveNightChange(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadNights();
    return () => { active = false; };
  }, [onActiveNightChange, revision]);

  const activeNight = nights.find((night) => night.endedAt === null) ?? null;
  const selectedNight = nights.find((night) => night.id === selectedNightId) ?? activeNight ?? nights[0] ?? null;

  useEffect(() => {
    let active = true;
    setRecap(null);
    if (!selectedNight?.endedAt) return () => { active = false; };

    setLoadError("");
    setRecapLoading(true);
    api.get<{ data: GameNight }>(`/game-nights/${selectedNight.id}`)
      .then(({ data }) => {
        if (active) setRecap(data.data);
      })
      .catch((requestError: unknown) => {
        if (active) setLoadError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setRecapLoading(false);
      });
    return () => { active = false; };
  }, [selectedNight?.endedAt, selectedNight?.id]);

  async function startNight() {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post<{ data: GameNight }>("/game-nights", {});
      onActiveNightChange(data.data.id);
      setSelectedNightId(data.data.id);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function closeNight() {
    if (!activeNight || activeNight.ongoingGameCount > 0) return;
    setSaving(true);
    setError("");
    setCertificateError("");
    try {
      await api.post(`/game-nights/${activeNight.id}/close`, {});
      onActiveNightChange(null);
      setSelectedNightId(activeNight.id);
      setConfirmClose(false);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel as="section" className="game-night-panel" aria-labelledby="game-night-panel-title">
      <header className="game-night-panel__heading">
        <div>
          <Eyebrow>THE EVENING’S SCOREBOOK</Eyebrow>
          <h2 id="game-night-panel-title">Game night</h2>
          <p>{activeNight ? "Games started from this page will join tonight’s standings." : "Group several games together and see who leads the night."}</p>
        </div>
        {activeNight ? (
          confirmClose ? (
            <div className="game-night-panel__confirm">
              <span>Close this game night?</span>
              <Button className="button button--quiet" disabled={saving} onClick={() => setConfirmClose(false)} type="button">Keep open</Button>
              <Button className="button button--primary" disabled={saving || activeNight.ongoingGameCount > 0} onClick={() => void closeNight()} type="button">
                {saving ? "Closing…" : "Close night"}
              </Button>
            </div>
          ) : (
            <Button className="button button--quiet" disabled={saving || activeNight.ongoingGameCount > 0} onClick={() => setConfirmClose(true)} type="button">
              {activeNight.ongoingGameCount > 0 ? "Finish active games first" : "Close game night"}
            </Button>
          )
        ) : (
          <Button className="button button--primary" disabled={loading || saving} onClick={() => void startNight()} type="button">
            {saving ? "Starting…" : "Start a game night"}
          </Button>
        )}
      </header>

      {error && (
        <FeedbackMessage
          className="game-night-panel__error"
          message={error}
          onDismiss={() => setError("")}
        />
      )}
      {loadError && (
        <FeedbackMessage
          className="game-night-panel__error"
          message={loadError}
          onDismiss={() => setLoadError("")}
          onRetry={() => setRevision((value) => value + 1)}
        />
      )}
      {certificateError && (
        <FeedbackMessage
          className="game-night-panel__error"
          message={certificateError}
          onDismiss={() => setCertificateError("")}
        />
      )}
      {loading && nights.length === 0 ? (
        <p className="game-night-panel__empty">Opening the scorebook…</p>
      ) : selectedNight ? (
        <>
          <div className="game-night-panel__meta">
            <span className={selectedNight.endedAt ? "game-night-panel__status is-closed" : "game-night-panel__status"}>
              {selectedNight.endedAt ? "CLOSED" : "IN PROGRESS"}
            </span>
            <strong>{nightDate(selectedNight.startedAt)}</strong>
            <span>{selectedNight.gameCount} {selectedNight.gameCount === 1 ? "game finished" : "games finished"}</span>
            {!selectedNight.endedAt && selectedNight.ongoingGameCount > 0 && (
              <span>{selectedNight.ongoingGameCount} still in progress</span>
            )}
          </div>
          <div className="game-night-panel__boards">
            <GameNightBoard items={selectedNight.standings.byWins} metric="wins" />
            <GameNightBoard items={selectedNight.standings.byPoints} metric="points" />
          </div>
          {selectedNight.endedAt && (
            <section className="game-night-recap" aria-labelledby="game-night-recap-title">
              <header className="game-night-recap__heading">
                <div>
                  <Eyebrow>THE EVENING’S CHRONICLE</Eyebrow>
                  <h3 id="game-night-recap-title">Game night recap</h3>
                </div>
                {recap?.games?.length ? <span>{recap.games.length} {recap.games.length === 1 ? "game" : "games"} played</span> : null}
              </header>
              {recapLoading ? (
                <p className="game-night-recap__empty" role="status">Gathering the evening’s stories…</p>
              ) : recap?.games?.length ? (
                <ol className="game-night-recap__games">
                  {recap.games.map((game) => (
                    <li key={game.id}>
                      <strong>{game.name}</strong>
                      <span>
                        {new Date(game.playedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        {game.duration !== null ? ` · ${game.duration} min` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                !recapLoading && <p className="game-night-recap__empty">No games were recorded for this night.</p>
              )}
              {(() => {
                const leaders = selectedNight.standings.byWins;
                const winCount = leaders[0]?.wins ?? 0;
                const winners = winCount > 0 ? leaders.filter((player) => player.wins === winCount) : [];
                return winners.length ? (
                  <div className="game-night-recap__certificates">
                    <p>{winners.length > 1 ? "A shared crown deserves a certificate for each champion." : "Honor the night’s most victorious player."}</p>
                    {winners.map((winner, index) => (
                      <Button
                        className="button button--primary"
                        key={`${winner.playerId ?? winner.name}-${index}`}
                        onClick={async () => {
                          setCertificateError("");
                          try {
                            await downloadGameNightCertificate({
                              playerName: winner.name,
                              date: selectedNight.startedAt,
                              wins: winner.wins,
                              gamesPlayed: selectedNight.gameCount,
                            });
                          } catch (requestError) {
                            setCertificateError(getErrorMessage(requestError));
                          }
                        }}
                        type="button"
                      >
                        <Crown aria-hidden="true" size={15} />
                        Download {winner.name}’s certificate
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="game-night-recap__empty">No first-place finishes were recorded, so this night has no certificate recipient.</p>
                );
              })()}
            </section>
          )}
        </>
      ) : (
        <p className="game-night-panel__empty">Start a game night, then each finished game will add to its standings.</p>
      )}

      {nights.length > 1 && (
        <details className="game-night-panel__history">
          <summary>Recent game nights</summary>
          <div>
            {nights.filter((night) => night.id !== selectedNight?.id).map((night) => (
              <Button key={night.id} onClick={() => setSelectedNightId(night.id)} type="button">
                <span>{nightDate(night.startedAt)}</span>
                <small>{night.gameCount} {night.gameCount === 1 ? "game" : "games"}</small>
              </Button>
            ))}
          </div>
        </details>
      )}
    </Panel>
  );
}
