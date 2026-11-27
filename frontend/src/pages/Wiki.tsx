import { Button, Eyebrow, FeedbackMessage } from "../components/ui";
import { LibraryNavigation, LibraryRail, LibraryTopbar } from "../components/LibraryChrome";
import { FormEvent, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import { api, getErrorMessage } from "../lib/api";
import { Game, Player, Tag, WikiCategory, WikiEntry } from "../types";

interface WikiProps {
  player: Player;
  onLogout: () => void;
}

interface WikiResponse {
  categories: WikiCategory[];
  entries: WikiEntry[];
}

interface CategoryDraft {
  id?: string;
  title: string;
}

interface EntryDraft {
  id?: string;
  title: string;
  content: string;
  categoryId: string;
  tagIds: string[];
  gameIds: string[];
  gameIdsChanged: boolean;
}

type DeleteTarget =
  | { kind: "category"; category: WikiCategory }
  | { kind: "entry"; entry: WikiEntry };

export function Wiki({ player, onLogout }: WikiProps) {
  const [wiki, setWiki] = useState<WikiResponse>({ categories: [], entries: [] });
  const [tags, setTags] = useState<Tag[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [query, setQuery] = useState("");
  const [gameQuery, setGameQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [resourceRevision, setResourceRevision] = useState(0);
  const [resourceError, setResourceError] = useState("");
  const [wikiError, setWikiError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalError, setModalError] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [entryDraft, setEntryDraft] = useState<EntryDraft | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setWikiError("");
      api.get<{ data: WikiResponse }>("/wiki", {
        params: query.trim() ? { search: query.trim() } : undefined,
      })
        .then(({ data }) => {
          if (active) setWiki(data.data);
        })
        .catch((requestError: unknown) => {
          if (active) setWikiError(getErrorMessage(requestError));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 160);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, revision]);

  useEffect(() => {
    let active = true;
    setResourceError("");
    Promise.allSettled([
      api.get<{ data: Tag[] }>("/tags"),
      api.get<{ data: Game[] }>("/games"),
    ])
      .then(([tagResult, gameResult]) => {
        if (!active) return;
        if (tagResult.status === "fulfilled") setTags(tagResult.value.data.data);
        else setResourceError(getErrorMessage(tagResult.reason));
        if (gameResult.status === "fulfilled") setGames(gameResult.value.data.data);
        else setResourceError(getErrorMessage(gameResult.reason));
      })
      .catch((requestError: unknown) => {
        if (active) setResourceError(getErrorMessage(requestError));
      });
    return () => {
      active = false;
    };
  }, [resourceRevision]);

  const entriesByCategory = useMemo(() => {
    const groups = new Map<string, WikiEntry[]>();
    for (const entry of wiki.entries) {
      const entries = groups.get(entry.categoryId) ?? [];
      entries.push(entry);
      groups.set(entry.categoryId, entries);
    }
    return groups;
  }, [wiki.entries]);

  const visibleCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return wiki.categories.filter((category) =>
      !normalizedQuery ||
      category.title.toLocaleLowerCase().includes(normalizedQuery) ||
      (entriesByCategory.get(category.id)?.length ?? 0) > 0,
    );
  }, [entriesByCategory, query, wiki.categories]);

  const filteredGames = useMemo(() => {
    const normalizedQuery = gameQuery.trim().toLocaleLowerCase();
    if (!normalizedQuery) return games;
    return games.filter((game) =>
      `${game.name} ${game.maker}`.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [gameQuery, games]);

  function openCategoryEditor(category?: WikiCategory) {
    setModalError("");
    setCategoryDraft(category ? { id: category.id, title: category.title } : { title: "" });
  }

  function openEntryEditor(entry?: WikiEntry) {
    setModalError("");
    setPreviewing(false);
    setGameQuery("");
    setEntryDraft(entry
      ? {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          categoryId: entry.categoryId,
          tagIds: entry.tags.map((tag) => tag.id),
          gameIds: entry.games.map((game) => game.id),
          gameIdsChanged: false,
        }
      : {
          title: "",
          content: "",
          categoryId: wiki.categories[0]?.id ?? "",
          tagIds: [],
          gameIds: [],
          gameIdsChanged: false,
        });
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryDraft) return;
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("title") ?? "");
    setSaving(true);
    setModalError("");
    try {
      if (categoryDraft.id) {
        await api.patch(`/wiki/categories/${categoryDraft.id}`, { title });
        setNotice(`“${title}” has been updated.`);
      } else {
        await api.post("/wiki/categories", { title });
        setNotice(`“${title}” is ready for its first entry.`);
      }
      setCategoryDraft(null);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setModalError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entryDraft) return;
    setSaving(true);
    setModalError("");
    const body: {
      title: string;
      content: string;
      categoryId: string;
      tagIds: string[];
      gameIds?: string[];
    } = {
      title: entryDraft.title,
      content: entryDraft.content,
      categoryId: entryDraft.categoryId,
      tagIds: entryDraft.tagIds,
    };
    if (!entryDraft.id || entryDraft.gameIdsChanged) body.gameIds = entryDraft.gameIds;
    try {
      if (entryDraft.id) {
        await api.patch(`/wiki/entries/${entryDraft.id}`, body);
        setNotice(`“${entryDraft.title}” has been updated.`);
      } else {
        await api.post("/wiki/entries", { ...body, gameIds: entryDraft.gameIds });
        setNotice(`“${entryDraft.title}” has been added to the wiki.`);
      }
      setEntryDraft(null);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setModalError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem() {
    if (!pendingDelete) return;
    setSaving(true);
    setError("");
    try {
      if (pendingDelete.kind === "category") {
        await api.delete(`/wiki/categories/${pendingDelete.category.id}`);
        setNotice(`“${pendingDelete.category.title}” has been removed.`);
      } else {
        await api.delete(`/wiki/entries/${pendingDelete.entry.id}`);
        setNotice(`“${pendingDelete.entry.title}” has been removed.`);
      }
      setPendingDelete(null);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setPendingDelete(null);
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(tagId: string, checked: boolean) {
    setEntryDraft((current) => {
      if (!current) return current;
      const tagIds = checked
        ? [...current.tagIds, tagId]
        : current.tagIds.filter((id) => id !== tagId);
      return { ...current, tagIds };
    });
  }

  function toggleGame(gameId: string, checked: boolean) {
    setEntryDraft((current) => {
      if (!current) return current;
      const gameIds = checked
        ? [...current.gameIds, gameId]
        : current.gameIds.filter((id) => id !== gameId);
      return { ...current, gameIds, gameIdsChanged: true };
    });
  }

  const entryTotal = wiki.entries.length;

  return (
    <div className="library-shell wiki-shell">
      <LibraryRail player={player} onLogout={onLogout}>
        <LibraryNavigation activePage="wiki" />
        
      </LibraryRail>

      <main className="library-main wiki-main">
        <LibraryTopbar section="REFERENCE" page="THE FIELD GUIDE" />

        <section className="wiki-heading">
          <div>
            <Eyebrow>A COMMONPLACE BOOK FOR GAME NIGHT</Eyebrow>
            <h1>The Field Guide</h1>
            <p>Keep the ideas, strategies, and language of your table close at hand.</p>
          </div>
          <div className="heading-actions">
            <Button className="button button--quiet" onClick={() => openCategoryEditor()} type="button">
              ＋ Category
            </Button>
            <Button
              className="button button--primary"
              disabled={wiki.categories.length === 0}
              onClick={() => openEntryEditor()}
              type="button"
            >
              ＋ Entry
            </Button>
          </div>
        </section>

        <section className="collection-tools wiki-tools">
          <div className="collection-count">
            <span className="collection-count__number">{loading ? "—" : entryTotal}</span>
            <span>{query.trim() ? "matching entries" : "field notes"}</span>
          </div>
          <label className="search-box wiki-search">
            <svg aria-hidden="true" className="search-box__icon" viewBox="0 0 24 24">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m15.5 15.5 5 5" />
            </svg>
            <input
              aria-label="Search wiki"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search concepts, strategies, tags, or games…"
              value={query}
            />
            <kbd>SEARCH</kbd>
          </label>
        </section>

        {error && (
          <FeedbackMessage className="notice notice--error" message={error} onDismiss={() => setError("")} />
        )}
        {wikiError && (
          <FeedbackMessage
            className="notice notice--error"
            message={wikiError}
            onDismiss={() => setWikiError("")}
            onRetry={() => setRevision((value) => value + 1)}
          />
        )}
        {resourceError && (
          <FeedbackMessage
            message={`Tag and game choices: ${resourceError}`}
            onDismiss={() => setResourceError("")}
            onRetry={() => setResourceRevision((value) => value + 1)}
          />
        )}
        {notice && (
          <FeedbackMessage className="notice" message={notice} onDismiss={() => setNotice("")} tone="success" />
        )}

        <section className="wiki-categories" aria-live="polite">
          {loading && wiki.categories.length === 0 ? (
            <div className="empty-state" role="status" aria-live="polite"><p>Opening the field guide…</p></div>
          ) : visibleCategories.length === 0 ? (
            <div className="wiki-empty">
              <Eyebrow>{query.trim() ? "NO MATCHING NOTES" : "A NEW CHAPTER"}</Eyebrow>
              <h2>{query.trim() ? "Nothing found in the field guide." : "Start with a category."}</h2>
              <p>
                {query.trim()
                  ? "Try another term, tag, or game title."
                  : "Create a heading such as Strategies, Game Types, or Concepts."}
              </p>
              {!query.trim() && (
                <Button className="button button--primary" onClick={() => openCategoryEditor()} type="button">
                  ＋ Create a category
                </Button>
              )}
            </div>
          ) : visibleCategories.map((category) => {
            const entries = entriesByCategory.get(category.id) ?? [];
            return (
              <section className="wiki-category" key={category.id}>
                <header className="wiki-category__heading">
                  <div>
                    <Eyebrow>FIELD NOTES · {entries.length} {entries.length === 1 ? "ENTRY" : "ENTRIES"}</Eyebrow>
                    <h2>{category.title}</h2>
                  </div>
                  <div className="wiki-category__actions">
                    <Button className="button button--quiet" onClick={() => openEntryEditor()} type="button">
                      ＋ Entry
                    </Button>
                    <Button className="button button--quiet" onClick={() => openCategoryEditor(category)} type="button">
                      Edit title
                    </Button>
                    <Button
                      aria-label={`Delete ${category.title} category`}
                      className="button button--danger"
                      disabled={category._count.entries > 0}
                      onClick={() => setPendingDelete({ kind: "category", category })}
                      title={category._count.entries > 0 ? "Move or delete its entries first" : "Delete this empty category"}
                      type="button"
                    >
                      Delete
                    </Button>
                  </div>
                </header>
                {entries.length ? (
                  <div className="wiki-category__entries">
                    {entries.map((entry) => (
                      <details className="wiki-entry" key={entry.id} open={Boolean(query.trim())}>
                        <summary className="wiki-entry__summary">
                          <span className="wiki-entry__title">{entry.title}</span>
                          {entry.tags.length > 0 && (
                            <span className="wiki-entry__tag-preview">
                              {entry.tags.slice(0, 3).map((tag) => <span key={tag.id}>#{tag.name}</span>)}
                              {entry.tags.length > 3 && <span>+{entry.tags.length - 3}</span>}
                            </span>
                          )}
                        </summary>
                        <div className="wiki-entry__body">
                          <div className="markdown-copy wiki-entry__markdown">
                            <ReactMarkdown>{entry.content}</ReactMarkdown>
                          </div>
                          {entry.tags.length > 0 && (
                            <div className="wiki-entry__related">
                              <span className="wiki-entry__related-label">RELATED TAGS</span>
                              <div>
                                {entry.tags.map((tag) => (
                                  <Button
                                    className="wiki-tag"
                                    key={tag.id}
                                    onClick={() => setQuery(tag.name)}
                                    type="button"
                                  >
                                    #{tag.name}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                          {entry.games.length > 0 && (
                            <div className="wiki-entry__related">
                              <span className="wiki-entry__related-label">EXAMPLES FROM THE LIBRARY</span>
                              <div className="wiki-game-links">
                                {entry.games.map((game) => (
                                  <Link key={game.id} to={`/games/${game.id}`}>
                                    {game.name}<small>{game.maker}</small>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="wiki-entry__actions">
                            <Button className="button button--quiet" onClick={() => openEntryEditor(entry)} type="button">
                              Edit entry
                            </Button>
                            <Button
                              className="button button--danger"
                              onClick={() => setPendingDelete({ kind: "entry", entry })}
                              type="button"
                            >
                              Delete entry
                            </Button>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="wiki-category__empty">
                    <p>{query.trim() ? "No entries in this category match your search." : "No entries here yet."}</p>
                    {!query.trim() && (
                      <Button className="button button--quiet" onClick={() => openEntryEditor()} type="button">
                        Write the first entry
                      </Button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </section>
      </main>

      {categoryDraft && (
        <div className="play-log-modal-backdrop">
          <form
            aria-labelledby="wiki-category-editor-title"
            aria-modal="true"
            className="play-log-editor wiki-modal"
            onSubmit={saveCategory}
            role="dialog"
          >
            <header className="play-log-editor__heading">
              <div>
                <Eyebrow>ORGANIZE THE FIELD GUIDE</Eyebrow>
                <h2 id="wiki-category-editor-title">{categoryDraft.id ? "Edit category" : "New category"}</h2>
              </div>
              <Button
                aria-label="Close category editor"
                className="play-log-editor__close"
                disabled={saving}
                onClick={() => setCategoryDraft(null)}
                type="button"
              >
                ×
              </Button>
            </header>
            <div className="play-log-editor__fields wiki-category-editor__fields">
              <label>
                <span className="field-label">Category title</span>
                <input autoFocus defaultValue={categoryDraft.title} maxLength={80} name="title" required />
              </label>
            </div>
            {modalError && (
              <FeedbackMessage className="form-error" message={modalError} onDismiss={() => setModalError("")} />
            )}
            <div className="play-log-editor__footer">
              <Button className="button button--quiet" disabled={saving} onClick={() => setCategoryDraft(null)} type="button">
                Cancel
              </Button>
              <Button className="button button--primary" disabled={saving} type="submit">
                {saving ? "Saving…" : categoryDraft.id ? "Save category" : "Create category"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {entryDraft && (
        <div className="play-log-modal-backdrop">
          <form
            aria-labelledby="wiki-entry-editor-title"
            aria-modal="true"
            className="play-log-editor wiki-modal wiki-entry-editor"
            onSubmit={saveEntry}
            role="dialog"
          >
            <header className="play-log-editor__heading">
              <div>
                <Eyebrow>A NOTE FOR THE TABLE</Eyebrow>
                <h2 id="wiki-entry-editor-title">{entryDraft.id ? "Edit wiki entry" : "New wiki entry"}</h2>
              </div>
              <Button
                aria-label="Close entry editor"
                className="play-log-editor__close"
                disabled={saving}
                onClick={() => setEntryDraft(null)}
                type="button"
              >
                ×
              </Button>
            </header>
            <div className="play-log-editor__fields wiki-entry-editor__fields">
              <label>
                <span className="field-label">Entry title</span>
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setEntryDraft({ ...entryDraft, title: event.target.value })}
                  required
                  value={entryDraft.title}
                />
              </label>
              <label>
                <span className="field-label">Category</span>
                <select
                  onChange={(event) => setEntryDraft({ ...entryDraft, categoryId: event.target.value })}
                  required
                  value={entryDraft.categoryId}
                >
                  {wiki.categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.title}</option>
                  ))}
                </select>
              </label>
            </div>

            <section className="wiki-markdown-editor">
              <div className="wiki-markdown-editor__heading">
                <span className="field-label">MARKDOWN</span>
                <div>
                  <Button
                    aria-pressed={!previewing}
                    className={!previewing ? "is-selected" : ""}
                    onClick={() => setPreviewing(false)}
                    type="button"
                  >
                    Write
                  </Button>
                  <Button
                    aria-pressed={previewing}
                    className={previewing ? "is-selected" : ""}
                    onClick={() => setPreviewing(true)}
                    type="button"
                  >
                    Preview
                  </Button>
                </div>
              </div>
              {previewing ? (
                <div className="markdown-copy wiki-markdown-editor__preview">
                  <ReactMarkdown>{entryDraft.content || "_Nothing to preview yet._"}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  aria-label="Markdown entry content"
                  maxLength={100_000}
                  onChange={(event) => setEntryDraft({ ...entryDraft, content: event.target.value })}
                  placeholder="Explain the idea, strategy, or language of the table…"
                  required
                  value={entryDraft.content}
                />
              )}
            </section>

            <div className="wiki-entry-editor__relations">
              <fieldset className="wiki-picker">
                <legend>Related game tags</legend>
                {tags.length ? (
                  <div className="wiki-picker__options">
                    {tags.map((tag) => (
                      <label className="wiki-picker__option" key={tag.id}>
                        <input
                          checked={entryDraft.tagIds.includes(tag.id)}
                          onChange={(event) => toggleTag(tag.id, event.target.checked)}
                          type="checkbox"
                        />
                        <span>#{tag.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="wiki-picker__empty">Add tags to games first to connect them here.</p>
                )}
              </fieldset>

              <fieldset className="wiki-picker wiki-game-picker">
                <legend>Example games</legend>
                <input
                  aria-label="Filter example games"
                  className="wiki-game-picker__search"
                  onChange={(event) => setGameQuery(event.target.value)}
                  placeholder="Find a game…"
                  value={gameQuery}
                />
                {filteredGames.length ? (
                  <div className="wiki-picker__options">
                    {filteredGames.map((game) => (
                      <label className="wiki-picker__option" key={game.id}>
                        <input
                          checked={entryDraft.gameIds.includes(game.id)}
                          onChange={(event) => toggleGame(game.id, event.target.checked)}
                          type="checkbox"
                        />
                        <span>{game.name}<small>{game.maker}</small></span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="wiki-picker__empty">No games match that search.</p>
                )}
              </fieldset>
            </div>

            {modalError && (
              <FeedbackMessage className="form-error" message={modalError} onDismiss={() => setModalError("")} />
            )}
            <div className="play-log-editor__footer">
              <Button className="button button--quiet" disabled={saving} onClick={() => setEntryDraft(null)} type="button">
                Cancel
              </Button>
              <Button className="button button--primary" disabled={saving} type="submit">
                {saving ? "Saving…" : entryDraft.id ? "Save entry" : "Create entry"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {pendingDelete && (
        <div className="sweet-alert-backdrop">
          <section
            aria-labelledby="wiki-delete-title"
            aria-modal="true"
            className="sweet-alert"
            role="alertdialog"
          >
            <span aria-hidden="true" className="sweet-alert__seal">⌫</span>
            <Eyebrow>REMOVE FROM THE FIELD GUIDE</Eyebrow>
            <h2 id="wiki-delete-title">
              Delete {pendingDelete.kind === "category" ? "category" : "entry"}?
            </h2>
            <p>
              “{pendingDelete.kind === "category"
                ? pendingDelete.category.title
                : pendingDelete.entry.title}” will be permanently removed.
              {pendingDelete.kind === "entry" && " Its links to tags and games will also be removed."}
            </p>
            <div className="sweet-alert__actions">
              <Button className="button button--quiet" disabled={saving} onClick={() => setPendingDelete(null)} type="button">
                Keep it
              </Button>
              <Button className="button sweet-alert__confirm" disabled={saving} onClick={() => void deleteItem()} type="button">
                {saving ? "Removing…" : "Delete"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
