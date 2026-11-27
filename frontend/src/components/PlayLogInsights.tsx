import { Crown } from "lucide-react";
import { Eyebrow, List, Panel } from "./ui";

export interface PlayLogChartItem {
  label: string;
  value: number;
  detail?: string;
}

export function PlayLogChart({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: PlayLogChartItem[];
}) {
  const maximum = Math.max(1, ...items.map((item) => item.value));
  return (
    <Panel as="section" className="play-log-chart">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="play-log-chart__empty">{emptyText}</p>
      ) : (
        <div className="play-log-chart__bars">
          {items.map((item) => (
            <div className="play-log-chart__row" aria-label={`${item.label}: ${item.value}`} key={item.label} role="group">
              <div className="play-log-chart__label">
                <span>{item.label}{item.detail && <small>{item.detail}</small>}</span>
                <b>{item.value}</b>
              </div>
              <div className="play-log-chart__track">
                <span style={{ width: `${item.value === 0 ? 0 : Math.max(3, (item.value / maximum) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function PlayLogLeaderboard({
  items,
  emptyText,
}: {
  items: { label: string; value: number }[];
  emptyText: string;
}) {
  const maximum = Math.max(1, ...items.map((item) => item.value));
  const leadersCount = items.filter((item) => item.value === maximum).length;
  let previousWins = -1;
  let rank = 0;

  return (
    <Panel as="section" className="play-log-leaderboard" aria-labelledby="play-log-leaderboard-title">
      <header className="play-log-leaderboard__heading">
        <div>
          <Eyebrow>THE HOUSEHOLD STANDINGS</Eyebrow>
          <h3 id="play-log-leaderboard-title">Table champions</h3>
        </div>
        {items.length > 0 && <span>{items.length} ranked</span>}
      </header>
      {items.length === 0 ? (
        <p className="play-log-chart__empty">{emptyText}</p>
      ) : (
        <List as="ol" className="play-log-leaderboard__list">
          {items.map((item, index) => {
            if (item.value !== previousWins) rank = index + 1;
            previousWins = item.value;
            const isWinner = item.value === maximum;
            const placement = isWinner
              ? leadersCount > 1 ? "tied for first place" : "first place"
              : `rank ${rank}`;
            return (
              <li
                aria-label={`${item.label}, ${placement}, ${item.value} ${item.value === 1 ? "win" : "wins"}`}
                className={`play-log-leaderboard__row${isWinner ? " play-log-leaderboard__row--winner" : ""}`}
                key={`${item.label}-${index}`}
              >
                <span className="play-log-leaderboard__rank" aria-hidden="true">
                  {isWinner ? <Crown /> : String(rank).padStart(2, "0")}
                </span>
                <div className="play-log-leaderboard__player">
                  <div className="play-log-leaderboard__player-name">
                    <strong>{item.label}</strong>
                    {isWinner && <span>{leadersCount > 1 ? "Co-champion" : "Table champion"}</span>}
                  </div>
                  <div className="play-log-leaderboard__track" aria-hidden="true">
                    <span style={{ width: `${Math.max(4, (item.value / maximum) * 100)}%` }} />
                  </div>
                </div>
                <div className="play-log-leaderboard__wins">
                  <strong>{item.value}</strong>
                  <span>{item.value === 1 ? "win" : "wins"}</span>
                </div>
              </li>
            );
          })}
        </List>
      )}
    </Panel>
  );
}
