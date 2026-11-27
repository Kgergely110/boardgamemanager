import { Crown } from "lucide-react";
import { PlayLog } from "../types";

interface PlayLogCardProps {
  log: PlayLog;
  showGame?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

function ordinal(place: number): string {
  const suffix = place % 100 >= 11 && place % 100 <= 13
    ? "th"
    : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[place % 10] ?? "th";
  return `${place}${suffix}`;
}

export function PlayLogCard({ log, showGame = true, onEdit, onDelete }: PlayLogCardProps) {
  const gameName = log.game?.name ?? log.guestGame?.name ?? "Unknown game";
  const orderedParticipants = [...log.participants].sort(
    (left, right) => (left.placement ?? Number.MAX_SAFE_INTEGER) -
      (right.placement ?? Number.MAX_SAFE_INTEGER),
  );
  const champions = orderedParticipants.filter((participant) => participant.placement === 1);
  const standings = orderedParticipants.filter((participant) => participant.placement !== 1);

  return (
    <article className="play-log-card">
      <header className="play-log-card__header">
        <div>
          <span className="eyebrow">{new Date(log.playedAt).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}</span>
          {showGame && (
            <h3>
              {gameName}
              {log.guestGame && <span className="play-log-card__guest">Guest game</span>}
            </h3>
          )}
        </div>
        {(onEdit || onDelete) && (
          <div className="play-log-card__actions">
            {onEdit && (
              <button className="button button--quiet" onClick={onEdit} type="button">Edit</button>
            )}
            {onDelete && (
              <button className="button button--quiet play-log-card__delete" onClick={onDelete} type="button">
                Delete
              </button>
            )}
          </div>
        )}
      </header>
      <div className="play-log-card__details">
        {log.duration !== null && <span>◷ {log.duration} min</span>}
        {log.location && <span>⌖ {log.location}</span>}
        {log.game?.tags.map((tag) => <span className="play-log-card__tag" key={tag.id}>#{tag.name}</span>)}
      </div>
      <section className="play-log-results" aria-labelledby={`results-${log.id}`}>
        <div className="play-log-results__heading">
          <div>
            <span className="eyebrow">THE FINAL TABLE</span>
            <h4 id={`results-${log.id}`}>Game results</h4>
          </div>
          <span>{log.participants.length} {log.participants.length === 1 ? "player" : "players"}</span>
        </div>
        {champions.length > 0 && (
          <div className="play-log-champions" aria-label={champions.length > 1 ? "Tied winners" : "Winner"}>
            <div className="play-log-champions__seal">
              <Crown aria-hidden="true" />
              <span>1</span>
            </div>
            <div className="play-log-champions__content">
              <span className="eyebrow">{champions.length > 1 ? "SHARED VICTORY" : "AT THE CROWN"}</span>
              <ul>
                {champions.map((participant) => (
                  <li key={participant.id}>
                    <strong>{participant.displayName}</strong>
                    <span>
                      {participant.score !== null
                        ? <>{participant.score.toLocaleString()} <small>pts</small></>
                        : "1st place"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {standings.length > 0 && (
          <div className="play-log-standings">
            <div className="play-log-standings__labels" aria-hidden="true">
              <span>Place</span><span>Player</span><span>Score</span>
            </div>
            <ol className="play-log-results__list">
              {standings.map((participant) => (
                <li
                  aria-label={`${participant.displayName}, ${participant.placement ? `${ordinal(participant.placement)} place` : "unranked"}${participant.score !== null ? `, ${participant.score} points` : ", no score"}`}
                  className="play-log-result"
                  key={participant.id}
                >
                  <span className="play-log-result__rank" aria-hidden="true">
                    {participant.placement ?? "—"}
                  </span>
                  <span className="play-log-result__player">
                    <strong>{participant.displayName}</strong>
                    <small>{participant.placement ? `${ordinal(participant.placement)} place` : "Unranked"}</small>
                  </span>
                  <span className="play-log-result__score">
                    {participant.score !== null
                      ? <><strong>{participant.score.toLocaleString()}</strong><small>pts</small></>
                      : <span aria-hidden="true">—</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
      {log.notes && <p className="play-log-card__notes">{log.notes}</p>}
    </article>
  );
}
