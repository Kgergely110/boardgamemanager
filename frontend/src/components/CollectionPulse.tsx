import { Activity, ChevronDown, Clock3, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { CollectionPulse as CollectionPulseData } from "../types";

interface CollectionPulseProps {
  data: CollectionPulseData | null;
  loading: boolean;
  error: string;
  onRetry: () => void;
}

function formattedDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

export function CollectionPulse({ data, loading, error, onRetry }: CollectionPulseProps) {
  const [expanded, setExpanded] = useState(true);
  const maxTagCount = Math.max(1, ...(data?.popularTags.map((tag) => tag.gameCount) ?? []));

  return (
    <section className="collection-pulse" aria-labelledby="collection-pulse-title">
      <details
        className="collection-pulse__details"
        onToggle={(event) => setExpanded(event.currentTarget.open)}
        open={expanded}
      >
        <summary className="collection-pulse__heading">
          <div>
            <span className="eyebrow"><Activity aria-hidden="true" /> COLLECTION PULSE</span>
            <h2 id="collection-pulse-title">A little life in the stacks</h2>
            <p>
              {data
                ? `${data.totalGames} titles · ${data.playedRecently} played lately · ${data.neverPlayed} never played`
                : "An inventory snapshot and a 90-day look at table activity."}
            </p>
          </div>
          <span className="collection-pulse__scope">
            ALL SHELVES <ChevronDown aria-hidden="true" />
          </span>
        </summary>
        {loading && !data ? (
          <p className="collection-pulse__status" role="status">Taking the pulse of your collection…</p>
        ) : data ? (
          <div className="collection-pulse__body">
          <div className="collection-pulse__stats">
            <article>
              <span>Played in the last {data.windowDays} days</span>
              <strong>{data.playedRecently}</strong>
              <small>of {data.totalGames} collection titles</small>
            </article>
            <article>
              <span>Never played</span>
              <strong>{data.neverPlayed}</strong>
              <small>{data.neverPlayed === 1 ? "title waiting for a first outing" : "titles waiting for a first outing"}</small>
            </article>
            <article>
              <span>Resting 90+ days</span>
              <strong>{data.restingGameCount}</strong>
              <small>played before, but not recently</small>
            </article>
          </div>

          <div className="collection-pulse__columns">
            <section className="collection-pulse__list" aria-labelledby="collection-pulse-recent-title">
              <header>
                <h3 id="collection-pulse-recent-title"><Activity aria-hidden="true" /> Most played lately</h3>
                <span>90 DAYS</span>
              </header>
              {data.recentGames.length ? (
                <ul>
                  {data.recentGames.map((game) => (
                    <li key={game.id}>
                      <Link to={`/games/${game.id}`}>{game.name}</Link>
                      <small>{game.plays} {game.plays === 1 ? "play" : "plays"}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="collection-pulse__empty">No library games were logged in this period.</p>
              )}
            </section>

            <section className="collection-pulse__list" aria-labelledby="collection-pulse-quiet-title">
              <header>
                <h3 id="collection-pulse-quiet-title"><Clock3 aria-hidden="true" /> Quiet corners</h3>
                <span>{data.restingGameCount + data.neverPlayed} TITLES</span>
              </header>
              {data.neverPlayedGames.length > 0 && (
                <div className="collection-pulse__quiet-group">
                  <h4>Waiting for a first play</h4>
                  <ul>
                    {data.neverPlayedGames.map((game) => (
                      <li key={game.id}><Link to={`/games/${game.id}`}>{game.name}</Link><small>Never played</small></li>
                    ))}
                  </ul>
                  {data.neverPlayed > data.neverPlayedGames.length && (
                    <small className="collection-pulse__more">and {data.neverPlayed - data.neverPlayedGames.length} more</small>
                  )}
                </div>
              )}
              {data.restingGames.length > 0 ? (
                <div className="collection-pulse__quiet-group">
                  <h4>Last played longest ago</h4>
                  <ul>
                    {data.restingGames.map((game) => (
                      <li key={game.id}>
                        <Link to={`/games/${game.id}`}>{game.name}</Link>
                        <small>Last played {formattedDate(game.lastPlayedAt)}</small>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : data.neverPlayedGames.length === 0 ? (
                <p className="collection-pulse__empty">Every title has seen recent table time.</p>
              ) : null}
            </section>

            <section className="collection-pulse__list collection-pulse__tags" aria-labelledby="collection-pulse-tags-title">
              <header>
                <h3 id="collection-pulse-tags-title"><Sparkles aria-hidden="true" /> Collection character</h3>
                <span>BY TAG</span>
              </header>
              {data.popularTags.length ? (
                <ul>
                  {data.popularTags.map((tag) => (
                    <li aria-label={`${tag.name}: ${tag.gameCount} games`} key={tag.id}>
                      <span className="collection-pulse__tag-name">#{tag.name}</span>
                      <span className="collection-pulse__tag-meter" aria-hidden="true">
                        <span
                          style={{
                            width: `${Math.max(4, (tag.gameCount / maxTagCount) * 100)}%`,
                            ...(tag.color ? { backgroundColor: tag.color } : {}),
                          }}
                        />
                      </span>
                      <small>{tag.gameCount}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="collection-pulse__empty">Add tags to games to see how your collection is shaped.</p>
              )}
              <small className="collection-pulse__note">Games can have several tags, so these counts overlap.</small>
            </section>
          </div>
          </div>
      ) : null}
      </details>
      {error && (
        <div className="collection-pulse__error" role="alert">
          <span>{error}</span>
          <button className="button button--quiet" onClick={onRetry} type="button">Try again</button>
        </div>
      )}
    </section>
  );
}
