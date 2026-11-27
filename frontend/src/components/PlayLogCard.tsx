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
      <div className="play-log-card__participants" aria-label="Participants and results">
        {orderedParticipants.map((participant) => (
          <div
            className={`play-log-person ${participant.placement === 1 ? "play-log-person--winner" : ""}`}
            key={participant.id}
          >
            <strong>{participant.displayName}</strong>
            <span>{participant.placement ? `${ordinal(participant.placement)} place` : "Unranked"}</span>
            {participant.score !== null && <span>{participant.score.toLocaleString()} pts</span>}
          </div>
        ))}
      </div>
      {log.notes && <p className="play-log-card__notes">{log.notes}</p>}
    </article>
  );
}
