import { Button, Eyebrow, FeedbackMessage } from "../components/ui";
import { LibraryNavigation, LibraryRail, LibraryTopbar } from "../components/LibraryChrome";
import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LibraryIcon } from "../components/LibraryIcon";
import { PlayLogCard } from "../components/PlayLogCard";
import { OngoingGamesList } from "../components/OngoingGamesList";
import { PlayLogChart, PlayLogLeaderboard } from "../components/PlayLogInsights";
import { api, getErrorMessage } from "../lib/api";
import { createLocalId } from "../lib/localId";
import { Game, PlayLog, PlayLogStatistics, Player as AppPlayer, Tag } from "../types";

interface PlayLogPageResponse {
  data: PlayLog[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  statistics: PlayLogStatistics;
}

interface PlayLogArchiveGroup {
  key: string;
  gameNight: PlayLog["gameNight"];
  logs: PlayLog[];
}

function groupPlayLogs(logs: PlayLog[]): PlayLogArchiveGroup[] {
  const groups: PlayLogArchiveGroup[] = [];
  const nightGroups = new Map<string, PlayLogArchiveGroup>();

  for (const log of logs) {
    if (!log.gameNight) {
      groups.push({ key: log.id, gameNight: null, logs: [log] });
      continue;
    }

    let group = nightGroups.get(log.gameNight.id);
    if (!group) {
      group = { key: log.gameNight.id, gameNight: log.gameNight, logs: [] };
      nightGroups.set(log.gameNight.id, group);
      groups.push(group);
    }
    group.logs.push(log);
  }
  return groups;
}

interface LogFilters {
  gameId: string;
  guestGame: string;
  tagId: string;
  winner: string;
  minDuration: string;
  maxDuration: string;
  from: string;
  to: string;
  location: string;
}

interface ParticipantDraft {
  key: string;
  kind: "account" | "guest";
  playerId: string;
  name: string;
  placement: string;
  score: string;
}

interface LogDraft {
  gameType: "library" | "guest";
  gameId: string;
  guestGameName: string;
  playedAt: string;
  duration: string;
  location: string;
  notes: string;
  participants: ParticipantDraft[];
}

const emptyFilters = (gameId = ""): LogFilters => ({
  gameId,
  guestGame: "",
  tagId: "",
  winner: "",
  minDuration: "",
  maxDuration: "",
  from: "",
  to: "",
  location: "",
});

function localDateTime(value = new Date()): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function emptyParticipant(): ParticipantDraft {
  return { key: createLocalId(), kind: "guest", playerId: "", name: "", placement: "", score: "" };
}

function emptyLogDraft(gameId = ""): LogDraft {
  return {
    gameType: "library",
    gameId,
    guestGameName: "",
    playedAt: localDateTime(),
    duration: "",
    location: "",
    notes: "",
    participants: [emptyParticipant()],
  };
}

function durationLabel(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

type InsightDimension = "games" | "tags" | "players" | "timeline";

export function PlayLogs({ player, onLogout }: { player: AppPlayer; onLogout: () => void }) {
  const [searchParams] = useSearchParams();
  const initialGameId = searchParams.get("gameId") ?? "";
  const [games, setGames] = useState<Game[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [players, setPlayers] = useState<{ id: string; fullName: string }[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourcesRevision, setResourcesRevision] = useState(0);
  const [resourceError, setResourceError] = useState("");
  const [filters, setFilters] = useState<LogFilters>(() => emptyFilters(initialGameId));
  const [filterDraft, setFilterDraft] = useState<LogFilters>(() => emptyFilters(initialGameId));
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<PlayLogPageResponse | null>(null);
  const [insightDimension, setInsightDimension] = useState<InsightDimension>("games");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<PlayLog | null>(null);
  const [draft, setDraft] = useState<LogDraft>(() => emptyLogDraft(initialGameId));
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PlayLog | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    setResourceError("");
    Promise.allSettled([
      api.get<{ data: Game[] }>("/games"),
      api.get<{ data: Tag[] }>("/tags"),
      api.get<{ data: { id: string; fullName: string }[] }>("/players"),
    ])
      .then(([gameResult, tagResult, playerResult]) => {
        if (!active) return;
        if (gameResult.status === "fulfilled") setGames(gameResult.value.data.data);
        else setResourceError(getErrorMessage(gameResult.reason));
        if (tagResult.status === "fulfilled") setTags(tagResult.value.data.data);
        else setResourceError(getErrorMessage(tagResult.reason));
        if (playerResult.status === "fulfilled") setPlayers(playerResult.value.data.data);
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
    const params = new URLSearchParams({ page: String(page) });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    setLoading(true);
    setPageError("");
    api.get<PlayLogPageResponse>(`/play-logs?${params.toString()}`)
      .then(({ data }) => {
        if (active) setPageData(data);
      })
      .catch((requestError: unknown) => {
        if (active) setPageError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [filters, page, revision]);

  useEffect(() => {
    if (!pageData) return;
    const lastPage = Math.max(pageData.pagination.totalPages, 1);
    if (page > lastPage) setPage(lastPage);
  }, [page, pageData]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ ...filterDraft });
    setPage(1);
  }

  function clearFilters() {
    const cleared = emptyFilters();
    setFilterDraft(cleared);
    setFilters(cleared);
    setPage(1);
  }

  function openNewLog() {
    setEditingLog(null);
    const newDraft = emptyLogDraft(filters.gameId || games[0]?.id || "");
    if (games.length === 0) newDraft.gameType = "guest";
    setDraft(newDraft);
    setEditorOpen(true);
    setError("");
    setNotice("");
  }

  function openEditLog(log: PlayLog) {
    setEditingLog(log);
    setDraft({
      gameType: log.guestGame ? "guest" : "library",
      gameId: log.gameId ?? "",
      guestGameName: log.guestGame?.name ?? "",
      playedAt: localDateTime(new Date(log.playedAt)),
      duration: log.duration?.toString() ?? "",
      location: log.location ?? "",
      notes: log.notes ?? "",
      participants: log.participants.map((participant) => ({
        key: createLocalId(),
        kind: participant.playerId ? "account" : "guest",
        playerId: participant.playerId ?? "",
        name: participant.playerId ? "" : participant.displayName,
        placement: participant.placement?.toString() ?? "",
        score: participant.score?.toString() ?? "",
      })),
    });
    setEditorOpen(true);
    setError("");
    setNotice("");
  }

  function updateParticipant(key: string, changes: Partial<ParticipantDraft>) {
    setDraft((current) => ({
      ...current,
      participants: current.participants.map((participant) =>
        participant.key === key ? { ...participant, ...changes } : participant,
      ),
    }));
  }

  async function saveLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      ...(draft.gameType === "library"
        ? { gameId: draft.gameId }
        : { guestGameName: draft.guestGameName.trim() }),
      playedAt: new Date(draft.playedAt).toISOString(),
      duration: draft.duration ? Number(draft.duration) : null,
      location: draft.location.trim() || null,
      notes: draft.notes.trim() || null,
      participants: draft.participants.map((participant) => ({
        ...(participant.kind === "account"
          ? { playerId: participant.playerId }
          : { name: participant.name.trim() }),
        placement: participant.placement ? Number(participant.placement) : null,
        score: participant.score ? Number(participant.score) : null,
      })),
    };
    try {
      if (editingLog) {
        await api.put(`/play-logs/${editingLog.id}`, payload);
        setNotice("Game log updated.");
      } else {
        await api.post("/play-logs", payload);
        setNotice("Game log added.");
      }
      setEditorOpen(false);
      setEditingLog(null);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteLog() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      await api.delete(`/play-logs/${pendingDelete.id}`);
      setNotice("Game log deleted.");
      setPendingDelete(null);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.max(pageData?.pagination.totalPages ?? 0, 1);
  const archiveGroups = groupPlayLogs(pageData?.data ?? []);
  const statistics = pageData?.statistics;
  const monthlyActivity = (() => {
    const activity = statistics?.monthlyActivity ?? [];
    const lastActivity = activity.at(-1);
    if (!lastActivity) return [];
    const byPeriod = new Map(activity.map((item) => [item.period, item]));
    const firstActivity = activity[Math.max(0, activity.length - 12)] ?? lastActivity;
    const lastDate = new Date(`${lastActivity.period}-01T00:00:00.000Z`);
    const firstDate = new Date(`${firstActivity.period}-01T00:00:00.000Z`);
    const months: { period: string; plays: number; wins: number }[] = [];
    for (const cursor = new Date(firstDate); cursor <= lastDate; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
      const period = cursor.toISOString().slice(0, 7);
      months.push(byPeriod.get(period) ?? { period, plays: 0, wins: 0 });
    }
    return months;
  })();
  const insightNames: Record<InsightDimension, { label: string; plays: string; wins: string }> = {
    games: { label: "Games", plays: "Most played games", wins: "First-place finishes by game" },
    tags: { label: "Tags", plays: "Most played game types", wins: "First-place finishes by type" },
    players: { label: "Players", plays: "Most active players", wins: "Player wins" },
    timeline: { label: "Over time", plays: "Sessions by month", wins: "First-place finishes by month" },
  };
  const insightItems: { label: string; plays: number; wins: number; detail?: string }[] = insightDimension === "games"
    ? (statistics?.mostPlayedGames ?? []).map((item) => ({ label: item.name, plays: item.plays, wins: item.wins }))
    : insightDimension === "tags"
      ? (statistics?.topTags ?? []).map((item) => ({ label: item.name, plays: item.plays, wins: item.wins }))
      : insightDimension === "players"
        ? (statistics?.topPlayers ?? []).map((item) => ({
            label: item.name,
            plays: item.plays,
            wins: item.wins,
            detail: `${item.winRate}% win rate`,
          }))
        : monthlyActivity.map((item) => ({
            label: new Date(`${item.period}-01T00:00:00.000Z`).toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
            plays: item.plays,
            wins: item.wins,
          }));

  return (
    <div className="library-shell play-log-shell">
      <LibraryRail player={player} onLogout={onLogout}>
        <LibraryNavigation activePage="logs" collectionNavClassName="play-log-nav" />
        
      </LibraryRail>

      <main className="library-main play-log-main">
        <LibraryTopbar section="Play history" page="Game logs" />
        <section className="play-log-heading">
          <div>
            <Eyebrow>EVERY TABLE HAS A STORY</Eyebrow>
            <h1>The Game Log</h1>
            <p>Record sessions, follow the standings, and see how your table plays.</p>
          </div>
          <Button className="button button--primary" disabled={resourcesLoading} onClick={openNewLog} type="button">
            ＋ Record a game
          </Button>
        </section>

        <OngoingGamesList />

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
        {pageError && (
          <FeedbackMessage
            className="notice notice--error"
            message={pageError}
            onDismiss={() => setPageError("")}
            onRetry={() => setRevision((value) => value + 1)}
          />
        )}
        {error && (
          <FeedbackMessage className="notice notice--error" message={error} onDismiss={() => setError("")} />
        )}
        {notice && (
          <FeedbackMessage className="notice" message={notice} onDismiss={() => setNotice("")} tone="success" />
        )}

        <section className="play-log-statistics" aria-label="Filtered play statistics">
          <div className="play-log-statistics__heading">
            <div><Eyebrow>THE TABLE, IN NUMBERS</Eyebrow><h2>Session statistics</h2></div>
            <span>{loading ? "Updating…" : `${statistics?.totalSessions ?? 0} matching sessions`}</span>
          </div>
          <div className="play-log-statistics__numbers">
            <article><span>Sessions</span><strong>{statistics?.totalSessions ?? "—"}</strong></article>
            <article><span>Players</span><strong>{statistics?.uniquePlayers ?? "—"}</strong></article>
            <article><span>Table time</span><strong>{statistics ? durationLabel(statistics.totalDurationMinutes) : "—"}</strong></article>
            <article><span>Average session</span><strong>{statistics ? durationLabel(statistics.averageDurationMinutes) : "—"}</strong></article>
          </div>
          <div className="play-log-insights">
            <div className="play-log-insights__controls" role="group" aria-label="Explore insights by">
              {(Object.keys(insightNames) as InsightDimension[]).map((dimension) => (
                <Button
                  aria-pressed={insightDimension === dimension}
                  className={insightDimension === dimension ? "is-selected" : ""}
                  key={dimension}
                  onClick={() => setInsightDimension(dimension)}
                  type="button"
                >
                  {insightNames[dimension].label}
                </Button>
              ))}
            </div>
            <div className="play-log-statistics__charts" aria-live="polite">
              <PlayLogChart
                emptyText={insightDimension === "timeline"
                  ? "Activity over time will appear as you record sessions."
                  : "No matching plays in this breakdown yet."}
                items={insightItems.map((item) => ({
                  label: item.label,
                  value: item.plays,
                  ...(item.detail === undefined ? {} : { detail: item.detail }),
                }))}
                title={insightNames[insightDimension].plays}
              />
              {insightDimension === "players" ? (
                <PlayLogLeaderboard
                  emptyText="Assign first place to track wins. Every player tied for first receives a win."
                  items={insightItems.map((item) => ({ label: item.label, value: item.wins }))}
                />
              ) : (
                <PlayLogChart
                  emptyText="Assign first place to participants to track wins. Tied first places count for everyone."
                  items={insightItems.map((item) => ({ label: item.label, value: item.wins }))}
                  title={insightNames[insightDimension].wins}
                />
              )}
            </div>
            <p className="play-log-insights__note">
              Wins count every first-place finisher, including everyone tied. Insights use the filters below.
            </p>
          </div>
        </section>

        <section className="play-log-filters" aria-labelledby="play-log-filter-title">
          <div className="play-log-filters__heading">
            <div><Eyebrow>FIND A SESSION</Eyebrow><h2 id="play-log-filter-title">Filter the archive</h2></div>
            <span>Statistics update with these filters</span>
          </div>
          <form onSubmit={applyFilters}>
            <label>
              Game
              <select value={filterDraft.gameId} onChange={(event) => setFilterDraft((value) => ({ ...value, gameId: event.target.value }))}>
                <option value="">All games</option>
                {games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
              </select>
            </label>
            <label>
              Guest game name
              <input maxLength={120} placeholder="Filter by guest game" value={filterDraft.guestGame} onChange={(event) => setFilterDraft((value) => ({ ...value, guestGame: event.target.value }))} />
            </label>
            <label>
              Game type
              <select value={filterDraft.tagId} onChange={(event) => setFilterDraft((value) => ({ ...value, tagId: event.target.value }))}>
                <option value="">All types</option>
                {tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
            </label>
            <label>
              Winner name
              <input maxLength={100} placeholder="App player or guest" value={filterDraft.winner} onChange={(event) => setFilterDraft((value) => ({ ...value, winner: event.target.value }))} />
            </label>
            <label>
              Playtime from (min)
              <input min="0" max="2147483647" type="number" value={filterDraft.minDuration} onChange={(event) => setFilterDraft((value) => ({ ...value, minDuration: event.target.value }))} />
            </label>
            <label>
              To (min)
              <input min="0" max="2147483647" type="number" value={filterDraft.maxDuration} onChange={(event) => setFilterDraft((value) => ({ ...value, maxDuration: event.target.value }))} />
            </label>
            <label>
              From
              <input type="date" value={filterDraft.from} onChange={(event) => setFilterDraft((value) => ({ ...value, from: event.target.value }))} />
            </label>
            <label>
              Through
              <input type="date" value={filterDraft.to} onChange={(event) => setFilterDraft((value) => ({ ...value, to: event.target.value }))} />
            </label>
            <label>
              Place played
              <input maxLength={120} placeholder="Home, club, convention…" value={filterDraft.location} onChange={(event) => setFilterDraft((value) => ({ ...value, location: event.target.value }))} />
            </label>
            <div className="play-log-filters__actions">
              <span className="play-log-filter-note">Winner names match first-place finishers; tied wins are included.</span>
              <Button className="button button--quiet" onClick={clearFilters} type="button">Clear filters</Button>
              <Button className="button button--primary" type="submit">Apply filters</Button>
            </div>
          </form>
        </section>

        <section className="play-log-archive" aria-labelledby="play-log-archive-title">
          <div className="play-log-archive__heading">
            <div><Eyebrow>THE CHRONICLE</Eyebrow><h2 id="play-log-archive-title">Recorded sessions</h2></div>
            <span>{pageData ? `${pageData.pagination.total.toLocaleString()} records` : "Loading records…"}</span>
          </div>
          {loading && !pageData ? (
            <div className="empty-state play-log-empty" role="status" aria-live="polite"><p>Opening the chronicle…</p></div>
          ) : pageData?.data.length ? (
            <div className={`play-log-list ${loading ? "is-loading" : ""}`} aria-busy={loading}>
              {archiveGroups.map((group) => {
                if (group.gameNight) return (
                  <section className="play-log-night-group" key={group.key} aria-label={`Games from game night ${new Date(group.gameNight.startedAt).toLocaleDateString()}`}>
                  <header className="play-log-night-group__heading">
                    <div>
                      <Eyebrow>ONE EVENING, MANY STORIES</Eyebrow>
                      <h3>Game night · {new Date(group.gameNight.startedAt).toLocaleDateString(undefined, { dateStyle: "long" })}</h3>
                    </div>
                    <span>
                      {group.logs.length === group.gameNight.gameCount
                        ? `${group.logs.length} ${group.logs.length === 1 ? "game" : "games"}`
                        : `Showing ${group.logs.length} of ${group.gameNight.gameCount} night records on this page`}
                    </span>
                  </header>
                  <div className="play-log-night-group__games">
                    {group.logs.map((log) => (
                      <PlayLogCard
                        key={log.id}
                        log={log}
                        onDelete={() => setPendingDelete(log)}
                        onEdit={() => openEditLog(log)}
                      />
                    ))}
                  </div>
                </section>
                );
                const log = group.logs[0];
                if (!log) return null;
                return (
                  <PlayLogCard
                    key={log.id}
                    log={log}
                    onDelete={() => setPendingDelete(log)}
                    onEdit={() => openEditLog(log)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="empty-state play-log-empty">
              <LibraryIcon name="chronicle" className="empty-state__ornament" />
              <h3>No sessions in these shelves yet</h3>
              <p>Record a game night or loosen the filters to find another story.</p>
            </div>
          )}
          <nav className="play-log-pagination" aria-label="Game log pages">
            <Button className="button button--quiet" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button">
              ← Newer
            </Button>
            <span>Page {page} of {totalPages} <i>·</i> 100 records per page</span>
            <Button className="button button--quiet" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} type="button">
              Older →
            </Button>
          </nav>
        </section>

        <footer className="library-footer"><span>Filed with care</span></footer>
      </main>

      {editorOpen && (
        <div className="play-log-modal-backdrop">
          <form className="play-log-editor" onSubmit={saveLog} role="dialog" aria-modal="true" aria-labelledby="play-log-editor-title">
            <header className="play-log-editor__heading">
              <div><Eyebrow>A MOMENT AT THE TABLE</Eyebrow><h2 id="play-log-editor-title">{editingLog ? "Edit game log" : "Record a game"}</h2></div>
              <Button aria-label="Close editor" className="play-log-editor__close" onClick={() => setEditorOpen(false)} type="button">×</Button>
            </header>
            <div className="play-log-editor__fields">
              <label className="play-log-editor__wide">
                Game source
                <select
                  value={draft.gameType}
                  onChange={(event) => setDraft((value) => ({
                    ...value,
                    gameType: event.target.value as LogDraft["gameType"],
                  }))}
                >
                  <option value="library">Game in my library</option>
                  <option value="guest">Guest game</option>
                </select>
              </label>
              {draft.gameType === "library" ? (
                <label className="play-log-editor__wide">
                  <span className="field-label">Library game</span>
                  <select required value={draft.gameId} onChange={(event) => setDraft((value) => ({ ...value, gameId: event.target.value }))}>
                    <option value="">Choose a game</option>
                    {games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
                  </select>
                </label>
              ) : (
                <label className="play-log-editor__wide">
                  <span className="field-label">Guest game name</span>
                  <input
                    autoComplete="off"
                    maxLength={120}
                    placeholder="The game you played away from your library"
                    required
                    value={draft.guestGameName}
                    onChange={(event) => setDraft((value) => ({ ...value, guestGameName: event.target.value }))}
                  />
                  <small className="play-log-editor__help">
                    Guest game names are saved and matching names are grouped in statistics.
                  </small>
                </label>
              )}
              <label>
                <span className="field-label">Played at</span>
                <input required type="datetime-local" value={draft.playedAt} onChange={(event) => setDraft((value) => ({ ...value, playedAt: event.target.value }))} />
              </label>
              <label>
                Actual playtime (minutes)
                <input min="1" max="2147483647" type="number" value={draft.duration} onChange={(event) => setDraft((value) => ({ ...value, duration: event.target.value }))} />
              </label>
              <label className="play-log-editor__wide">
                Place played
                <input maxLength={120} placeholder="Home, game club, convention…" value={draft.location} onChange={(event) => setDraft((value) => ({ ...value, location: event.target.value }))} />
              </label>
            </div>
            <div className="play-log-participants-editor">
              <div className="play-log-participants-editor__heading">
                <div><Eyebrow>THE TABLE</Eyebrow><h3>Players &amp; placements</h3></div>
                <Button className="button button--quiet" onClick={() => setDraft((value) => ({ ...value, participants: [...value.participants, emptyParticipant()] }))} type="button">
                  ＋ Add player
                </Button>
              </div>
              <p className="play-log-editor__hint">
                Ties are welcome: give tied players the same place. Leave placement blank for cooperative or unranked games; first place defines winner statistics.
              </p>
              {draft.participants.map((participant, index) => (
                <fieldset className="play-log-participant-editor" key={participant.key}>
                  <legend>Player {index + 1}</legend>
                  <label>
                    Player type
                    <select
                      value={participant.kind}
                      onChange={(event) => updateParticipant(participant.key, {
                        kind: event.target.value as ParticipantDraft["kind"],
                        playerId: "",
                        name: "",
                      })}
                    >
                      <option value="account">App user</option>
                      <option value="guest">Guest name</option>
                    </select>
                  </label>
                  {participant.kind === "account" ? (
                    <label>
                      <span className="field-label">App player</span>
                      <select required value={participant.playerId} onChange={(event) => updateParticipant(participant.key, { playerId: event.target.value })}>
                        <option value="">Choose a player</option>
                        {players.map((appPlayer) => <option key={appPlayer.id} value={appPlayer.id}>{appPlayer.fullName}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label>
                      <span className="field-label">Guest name</span>
                      <input maxLength={100} required value={participant.name} onChange={(event) => updateParticipant(participant.key, { name: event.target.value })} />
                    </label>
                  )}
                  <label>
                    Place
                    <input min="1" max="1000" type="number" placeholder="Unranked" value={participant.placement} onChange={(event) => updateParticipant(participant.key, { placement: event.target.value })} />
                  </label>
                  <label>
                    Score
                    <input type="number" value={participant.score} onChange={(event) => updateParticipant(participant.key, { score: event.target.value })} />
                  </label>
                  <Button
                    aria-label={`Remove player ${index + 1}`}
                    className="play-log-participant-editor__remove"
                    disabled={draft.participants.length === 1}
                    onClick={() => setDraft((value) => ({
                      ...value,
                      participants: value.participants.filter((item) => item.key !== participant.key),
                    }))}
                    type="button"
                  >
                    Remove
                  </Button>
                </fieldset>
              ))}
            </div>
            <label className="play-log-editor__notes">
              Session notes
              <textarea maxLength={5000} rows={3} value={draft.notes} onChange={(event) => setDraft((value) => ({ ...value, notes: event.target.value }))} />
            </label>
            {error && (
              <FeedbackMessage className="form-error" message={error} onDismiss={() => setError("")} />
            )}
            <div className="play-log-editor__footer">
              <Button className="button button--quiet" disabled={saving} onClick={() => setEditorOpen(false)} type="button">Cancel</Button>
              <Button className="button button--primary" disabled={saving} type="submit">{saving ? "Saving…" : editingLog ? "Save changes" : "Record session"}</Button>
            </div>
          </form>
        </div>
      )}

      {pendingDelete && (
        <div className="play-log-modal-backdrop">
          <section className="play-log-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="play-log-delete-title">
            <Eyebrow>REMOVE FROM THE CHRONICLE</Eyebrow>
            <h2 id="play-log-delete-title">Delete this session?</h2>
            <p>This will permanently remove the log and its participant results.</p>
            {error && (
              <FeedbackMessage className="form-error" message={error} onDismiss={() => setError("")} />
            )}
            <div className="play-log-editor__footer">
              <Button className="button button--quiet" disabled={deleting} onClick={() => { setPendingDelete(null); setError(""); }} type="button">Keep session</Button>
              <Button className="button button--danger" disabled={deleting} onClick={() => void deleteLog()} type="button">{deleting ? "Deleting…" : "Delete session"}</Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
