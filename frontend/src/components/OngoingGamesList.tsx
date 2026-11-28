import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eyebrow, FeedbackMessage, Panel } from "./ui";
import { api, getErrorMessage } from "../lib/api";
import { OngoingGame } from "../types";

const REFRESH_INTERVAL_MS = 15_000;

export function OngoingGamesList() {
  const [games, setGames] = useState<OngoingGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;
    async function loadOngoingGames() {
      try {
        const { data } = await api.get<{ data: OngoingGame[] }>("/ongoing-games");
        if (active) {
          setGames(data.data);
          setError("");
        }
      } catch (requestError) {
        if (active) setError(getErrorMessage(requestError));
      } finally {
        if (active) {
          setLoading(false);
          timeoutId = window.setTimeout(() => void loadOngoingGames(), REFRESH_INTERVAL_MS);
        }
      }
    }

    void loadOngoingGames();
    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [revision]);

  if (loading && games.length === 0 && !error) return null;
  if (games.length === 0 && !error) return null;

  return (
    <Panel as="section" className="ongoing-games" aria-labelledby="ongoing-games-title">
      <header className="ongoing-games__heading">
        <div><Eyebrow>AT THE TABLE NOW</Eyebrow><h2 id="ongoing-games-title">Ongoing games</h2></div>
        <span>{games.length} in progress</span>
      </header>
      {error && (
        <FeedbackMessage
          className="ongoing-games__error"
          message={error}
          onDismiss={() => setError("")}
          onRetry={() => {
            setLoading(true);
            setRevision((value) => value + 1);
          }}
        />
      )}
      <div className="ongoing-games__list">
        {games.map((game) => (
          <Link className="ongoing-game-card" key={game.id} to={`/lets-play/ongoing/${game.id}`}>
            <span className={game.pausedAt ? "ongoing-game-card__status is-paused" : "ongoing-game-card__status"}>
              {game.pausedAt ? "Paused" : "In progress"}
            </span>
            <span className="ongoing-game-card__details">
              <strong>{game.game?.name ?? game.guestGame?.name ?? "Unknown game"}</strong>
              <small>{game.participants.map((participant) => participant.displayName).join(", ")}</small>
              <small>
                Started {new Date(game.startedAt).toLocaleString()}
                {game.location ? ` · ${game.location}` : ""}
              </small>
            </span>
          </Link>
        ))}
      </div>
    </Panel>
  );
}
