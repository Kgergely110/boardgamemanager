import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../lib/api";
import { OngoingGame } from "../types";

export function OngoingGamesList() {
  const [games, setGames] = useState<OngoingGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
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
        if (active) setLoading(false);
      }
    }

    void loadOngoingGames();
    const intervalId = window.setInterval(() => void loadOngoingGames(), 15_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  if (loading && games.length === 0 && !error) return null;
  if (games.length === 0 && !error) return null;

  return (
    <section className="ongoing-games" aria-labelledby="ongoing-games-title">
      <header className="ongoing-games__heading">
        <div><span className="eyebrow">AT THE TABLE NOW</span><h2 id="ongoing-games-title">Ongoing games</h2></div>
        <span>{games.length} in progress</span>
      </header>
      {error && <p className="ongoing-games__error" role="alert">{error}</p>}
      <div className="ongoing-games__list">
        {games.map((game) => (
          <Link className="ongoing-game-card" key={game.id} to={`/lets-play/ongoing/${game.id}`}>
            <span className={game.pausedAt ? "ongoing-game-card__status is-paused" : "ongoing-game-card__status"}>
              {game.pausedAt ? "PAUSED" : "IN PROGRESS"}
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
    </section>
  );
}
