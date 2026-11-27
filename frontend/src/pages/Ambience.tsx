import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DevelopmentUserMenu } from "../components/DevelopmentUserMenu";
import { LibraryIcon, LibraryMark } from "../components/LibraryIcon";
import { ThemePicker } from "../components/ThemePicker";
import { api, getErrorMessage } from "../lib/api";
import { AmbienceSet, Game, Player, Tag } from "../types";

type LinkKind = "music" | "visual" | "both";
type AmbienceLinkDraft = { title: string; kind: LinkKind; uri: string };
type AmbienceDraft = {
  id: string | null;
  name: string;
  description: string;
  gameIds: string[];
  tagIds: string[];
  links: AmbienceLinkDraft[];
};

const emptyDraft = (): AmbienceDraft => ({
  id: null,
  name: "",
  description: "",
  gameIds: [],
  tagIds: [],
  links: [{ title: "", kind: "music", uri: "" }],
});

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function kindLabel(kind: LinkKind): string {
  if (kind === "music") return "Music";
  if (kind === "visual") return "Visual";
  return "Music & visual";
}

export function Ambience({ player, onLogout }: { player: Player; onLogout: () => void }) {
  const [sets, setSets] = useState<AmbienceSet[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [draft, setDraft] = useState<AmbienceDraft | null>(null);
  const [gameSearch, setGameSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [ambienceResponse, gamesResponse, tagsResponse] = await Promise.all([
          api.get<{ data: AmbienceSet[] }>("/ambience"),
          api.get<{ data: Game[] }>("/games"),
          api.get<{ data: Tag[] }>("/tags"),
        ]);
        if (active) {
          setSets(ambienceResponse.data.data);
          setGames(gamesResponse.data.data);
          setTags(tagsResponse.data.data);
        }
      } catch (requestError) {
        if (active) setError(getErrorMessage(requestError));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [revision]);

  function editSet(set: AmbienceSet) {
    setNotice("");
    setFormError("");
    setGameSearch("");
    setDraft({
      id: set.id,
      name: set.name,
      description: set.description ?? "",
      gameIds: set.games.map((game) => game.id),
      tagIds: set.tags.map((tag) => tag.id),
      links: set.links.map(({ title, kind, uri }) => ({ title, kind, uri })),
    });
  }

  function updateLink(index: number, field: keyof AmbienceLinkDraft, value: string) {
    setDraft((current) => current && ({
      ...current,
      links: current.links.map((link, linkIndex) => linkIndex === index
        ? { ...link, [field]: value }
        : link),
    }));
  }

  async function saveSet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFormError("");
    setNotice("");
    const body = {
      name: draft.name,
      description: draft.description.trim() || null,
      gameIds: draft.gameIds,
      tagIds: draft.tagIds,
      links: draft.links,
    };
    try {
      if (draft.id) {
        await api.patch(`/ambience/${draft.id}`, body);
        setNotice(`“${draft.name}” has been updated.`);
      } else {
        await api.post("/ambience", body);
        setNotice(`“${draft.name}” has been added to your atmospheres.`);
      }
      setDraft(null);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setFormError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteSet(set: AmbienceSet) {
    if (!window.confirm(`Delete “${set.name}” and its links?`)) return;
    setDeletingId(set.id);
    setError("");
    setNotice("");
    try {
      await api.delete(`/ambience/${set.id}`);
      setNotice(`“${set.name}” has been removed.`);
      setRevision((value) => value + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDeletingId(null);
    }
  }

  const visibleGames = games.filter((game) =>
    `${game.name} ${game.maker}`.toLocaleLowerCase().includes(gameSearch.toLocaleLowerCase()),
  );

  return (
    <div className="library-shell ambience-shell">
      <aside className="library-rail">
        <Link className="brand-mark" to="/" aria-label="Board Game Library home">
          <LibraryMark className="brand-mark__symbol" />
          <span className="brand-mark__name">The Game<br />Library</span>
        </Link>
        <div className="rail-divider" />
        <span className="rail-label">YOUR COLLECTION</span>
        <nav className="shelf-nav" aria-label="Library navigation">
          <Link className="shelf-nav__item" to="/">
            <span className="shelf-nav__glyph"><LibraryIcon name="collection" /></span>
            <span>All games</span>
          </Link>
        </nav>
        <div className="rail-utility">
          <span className="rail-label">GAME NIGHT</span>
          <Link className="shelf-nav__item" to="/lets-play">
            <span className="shelf-nav__glyph"><LibraryIcon name="play" /></span>
            <span>Let’s play</span>
          </Link>
          <Link className="shelf-nav__item" to="/logs">
            <span className="shelf-nav__glyph"><LibraryIcon name="chronicle" /></span>
            <span>Game logs</span>
          </Link>
        </div>
        <div className="rail-utility">
          <span className="rail-label">REFERENCE</span>
          <Link className="shelf-nav__item" to="/wiki">
            <span className="shelf-nav__glyph"><LibraryIcon name="wiki" /></span>
            <span>Game wiki</span>
          </Link>
          <Link className="shelf-nav__item is-selected" to="/ambience" aria-current="page">
            <span className="shelf-nav__glyph"><LibraryIcon name="ambience" /></span>
            <span>Ambience</span>
          </Link>
        </div>
        {import.meta.env.DEV && player.isAdmin && <DevelopmentUserMenu player={player} />}
        <div className="rail-bottom">
          <span className="rail-bottom__avatar">{player.fullName.slice(0, 1).toUpperCase()}</span>
          <span className="rail-bottom__identity"><strong>{player.fullName}</strong><small>Keeper of the collection</small></span>
          <button className="logout-button" onClick={onLogout} title="Sign out" aria-label="Sign out">↗</button>
        </div>
      </aside>

      <main className="library-main ambience-main">
        <header className="library-topbar">
          <div className="breadcrumbs"><span>REFERENCE</span><b>/</b><strong>AMBIENCE</strong></div>
          <ThemePicker />
        </header>

        <section className="ambience-heading">
          <div>
            <span className="eyebrow">MUSIC, MOTION & MOOD</span>
            <h1>Set the atmosphere.</h1>
            <p>Collect links that bring each game night to life.</p>
          </div>
          <button className="button button--primary" onClick={() => {
            setNotice("");
            setFormError("");
            setDraft(emptyDraft());
          }} type="button">＋ New atmosphere</button>
        </section>

        {error && <div className="notice notice--error" role="alert">{error}</div>}
        {notice && <div className="notice" role="status">{notice}</div>}

        {draft && (
          <form className="ambience-editor" onSubmit={(event) => void saveSet(event)}>
            <header className="ambience-editor__heading">
              <div>
                <span className="eyebrow">{draft.id ? "REFINE AN ATMOSPHERE" : "CREATE AN ATMOSPHERE"}</span>
                <h2>{draft.id ? "Edit this setup" : "A new scene"}</h2>
                <p>Link it to games, tags, or both to make it reusable.</p>
              </div>
              <button className="ambience-editor__close" onClick={() => setDraft(null)} type="button" aria-label="Close editor">×</button>
            </header>
            <div className="ambience-editor__fields">
              <label className="ambience-field">
                <span>Name</span>
                <input autoFocus maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required value={draft.name} />
              </label>
              <label className="ambience-field">
                <span>Description <small>OPTIONAL</small></span>
                <input maxLength={500} onChange={(event) => setDraft({ ...draft, description: event.target.value })} value={draft.description} />
              </label>
            </div>

            <div className="ambience-editor__relations">
              <fieldset className="ambience-picker">
                <legend>Games <span>({draft.gameIds.length} selected)</span></legend>
                <input
                  aria-label="Search games"
                  className="ambience-picker__search"
                  onChange={(event) => setGameSearch(event.target.value)}
                  placeholder="Search your library"
                  value={gameSearch}
                />
                <div className="ambience-picker__options">
                  {visibleGames.map((game) => (
                    <label className="ambience-picker__option" key={game.id}>
                      <input checked={draft.gameIds.includes(game.id)} onChange={() => setDraft({
                        ...draft,
                        gameIds: toggleId(draft.gameIds, game.id),
                      })} type="checkbox" />
                      <span><strong>{game.name}</strong><small>{game.maker}</small></span>
                    </label>
                  ))}
                  {visibleGames.length === 0 && <p className="ambience-picker__empty">No matching games.</p>}
                </div>
              </fieldset>
              <fieldset className="ambience-picker">
                <legend>Tags <span>({draft.tagIds.length} selected)</span></legend>
                <div className="ambience-picker__options">
                  {tags.map((tag) => (
                    <label className="ambience-picker__option ambience-picker__tag" key={tag.id}>
                      <input checked={draft.tagIds.includes(tag.id)} onChange={() => setDraft({
                        ...draft,
                        tagIds: toggleId(draft.tagIds, tag.id),
                      })} type="checkbox" />
                      <span>#{tag.name}</span>
                    </label>
                  ))}
                  {tags.length === 0 && <p className="ambience-picker__empty">Add tags to games to use shared atmospheres.</p>}
                </div>
              </fieldset>
            </div>

            <section className="ambience-links-editor" aria-labelledby="ambience-links-title">
              <header className="ambience-links-editor__heading">
                <div><span className="eyebrow">THE SOUND & THE SIGHT</span><h3 id="ambience-links-title">Links in this setup</h3></div>
                <button className="button button--quiet" disabled={draft.links.length >= 20} onClick={() => setDraft({
                  ...draft,
                  links: [...draft.links, { title: "", kind: "music", uri: "" }],
                })} type="button">＋ Add link</button>
              </header>
              {draft.links.map((link, index) => (
                <div className="ambience-link-editor" key={index}>
                  <label className="ambience-field">
                    <span>Link title</span>
                    <input maxLength={100} onChange={(event) => updateLink(index, "title", event.target.value)} placeholder="e.g. Tavern rain ambience" required value={link.title} />
                  </label>
                  <label className="ambience-field">
                    <span>Kind</span>
                    <select onChange={(event) => updateLink(index, "kind", event.target.value)} value={link.kind}>
                      <option value="music">Music</option>
                      <option value="visual">Visual</option>
                      <option value="both">Music & visual</option>
                    </select>
                  </label>
                  <label className="ambience-field ambience-link-editor__uri">
                    <span>Link or Spotify URI</span>
                    <input maxLength={2048} onChange={(event) => updateLink(index, "uri", event.target.value)} placeholder="https://… or spotify:playlist:…" required value={link.uri} />
                  </label>
                  <button
                    aria-label={`Remove ${link.title || "untitled link"}`}
                    className="ambience-link-editor__remove"
                    disabled={draft.links.length === 1}
                    onClick={() => setDraft({ ...draft, links: draft.links.filter((_, linkIndex) => linkIndex !== index) })}
                    type="button"
                  >Remove</button>
                </div>
              ))}
            </section>
            <p className="ambience-editor__help">Links open in their service when selected; this library does not play or host media.</p>
            {formError && <p className="ambience-editor__error" role="alert">{formError}</p>}
            <footer className="ambience-editor__footer">
              <button className="button button--quiet" disabled={saving} onClick={() => setDraft(null)} type="button">Cancel</button>
              <button className="button button--primary" disabled={saving} type="submit">{saving ? "Saving…" : "Save atmosphere"}</button>
            </footer>
          </form>
        )}

        <section className="ambience-library" aria-labelledby="ambience-library-title">
          <header className="ambience-library__heading">
            <div><span className="eyebrow">YOUR COLLECTION</span><h2 id="ambience-library-title">Atmosphere setups</h2></div>
            <span>{sets.length} {sets.length === 1 ? "setup" : "setups"}</span>
          </header>
          {loading && sets.length === 0 ? (
            <p className="ambience-library__empty">Gathering your soundscapes…</p>
          ) : sets.length === 0 ? (
            <p className="ambience-library__empty">No atmospheres yet. Create one and connect it to a game, a tag, or both.</p>
          ) : (
            <div className="ambience-cards">
              {sets.map((set) => (
                <article className="ambience-card" key={set.id}>
                  <header className="ambience-card__heading">
                    <div><span className="eyebrow">{set.links.length} {set.links.length === 1 ? "LINK" : "LINKS"}</span><h3>{set.name}</h3></div>
                    <div className="ambience-card__actions">
                      <button className="button button--quiet" onClick={() => editSet(set)} type="button">Edit</button>
                      <button className="ambience-card__delete" disabled={deletingId === set.id} onClick={() => void deleteSet(set)} type="button">
                        {deletingId === set.id ? "Removing…" : "Delete"}
                      </button>
                    </div>
                  </header>
                  {set.description && <p className="ambience-card__description">{set.description}</p>}
                  <div className="ambience-card__associations">
                    {set.games.map((game) => <span className="ambience-chip" key={game.id}>{game.name}</span>)}
                    {set.tags.map((tag) => <span className="ambience-chip ambience-chip--tag" key={tag.id}>#{tag.name}</span>)}
                    {set.games.length + set.tags.length === 0 && <span className="ambience-card__unassigned">Not connected to a game or tag</span>}
                  </div>
                  <div className="ambience-card__links">
                    {set.links.map((link) => (
                      <a href={link.uri} key={link.id} rel="noopener noreferrer" target="_blank">
                        <span>{kindLabel(link.kind)}</span><strong>{link.title}</strong><span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
