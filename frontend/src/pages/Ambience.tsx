import { Button, Eyebrow, FeedbackMessage } from "../components/ui";
import { LibraryNavigation, LibraryRail, LibraryTopbar } from "../components/LibraryChrome";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ExternalLink, Image as ImageIcon, Music2 } from "lucide-react";
import { api, getErrorMessage } from "../lib/api";
import { revealAndFocus } from "../lib/navigation";
import { getSpotifyEmbed } from "../lib/spotifyEmbed";
import { AmbienceSet, Game, Player, Tag } from "../types";

type LinkKind = "music" | "visual" | "both";
type AmbienceLinkDraft = { title: string; kind: LinkKind; uri: string; embed: boolean };
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
  links: [{ title: "", kind: "music", uri: "", embed: false }],
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
  const [loadError, setLoadError] = useState("");
  const [gamesError, setGamesError] = useState("");
  const [tagsError, setTagsError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const editorRef = useRef<HTMLFormElement>(null);
  const [editorRevealToken, setEditorRevealToken] = useState(0);

  useEffect(() => {
    revealAndFocus(editorRef.current);
  }, [editorRevealToken]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setLoadError("");
      setGamesError("");
      setTagsError("");
      try {
        const [setsResult, gamesResult, tagsResult] = await Promise.allSettled([
          api.get<{ data: AmbienceSet[] }>("/ambience"),
          api.get<{ data: Game[] }>("/games"),
          api.get<{ data: Tag[] }>("/tags"),
        ]);
        if (active) {
          if (setsResult.status === "fulfilled") setSets(setsResult.value.data.data);
          else setLoadError(getErrorMessage(setsResult.reason));
          if (gamesResult.status === "fulfilled") setGames(gamesResult.value.data.data);
          else setGamesError(getErrorMessage(gamesResult.reason));
          if (tagsResult.status === "fulfilled") setTags(tagsResult.value.data.data);
          else setTagsError(getErrorMessage(tagsResult.reason));
        }
      } catch (requestError) {
        if (active) setLoadError(getErrorMessage(requestError));
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
      links: set.links.map(({ title, kind, uri, embed }) => ({ title, kind, uri, embed })),
    });
    setEditorRevealToken((token) => token + 1);
  }

  function updateLink<Field extends keyof AmbienceLinkDraft>(
    index: number,
    field: Field,
    value: AmbienceLinkDraft[Field],
  ) {
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
    const invalidEmbed = draft.links.find((link) => link.embed && !getSpotifyEmbed(link.uri));
    if (invalidEmbed) {
      setFormError(`“${invalidEmbed.title || "Untitled link"}” needs a Spotify track, album, artist, playlist, show, or episode URL or URI to embed.`);
      return;
    }
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
      <LibraryRail player={player} onLogout={onLogout}>
        <LibraryNavigation activePage="ambience" />
        
      </LibraryRail>

      <main className="library-main ambience-main">
        <LibraryTopbar section="REFERENCE" page="AMBIENCE" />

        <section className="ambience-heading">
          <div>
            <Eyebrow>MUSIC, MOTION & MOOD</Eyebrow>
            <h1>Set the atmosphere.</h1>
            <p>Collect links that bring each game night to life.</p>
          </div>
          <Button className="button button--primary" onClick={() => {
            setNotice("");
            setFormError("");
            setDraft(emptyDraft());
            setEditorRevealToken((token) => token + 1);
          }} type="button">＋ New atmosphere</Button>
        </section>

        {error && (
          <FeedbackMessage className="notice notice--error" message={error} onDismiss={() => setError("")} />
        )}
        {loadError && (
          <FeedbackMessage
            className="notice notice--error"
            message={loadError}
            onDismiss={() => setLoadError("")}
            onRetry={() => setRevision((value) => value + 1)}
          />
        )}
        {gamesError && (
          <FeedbackMessage
            message={`Game choices: ${gamesError}`}
            onDismiss={() => setGamesError("")}
            onRetry={() => setRevision((value) => value + 1)}
          />
        )}
        {tagsError && (
          <FeedbackMessage
            message={`Tag choices: ${tagsError}`}
            onDismiss={() => setTagsError("")}
            onRetry={() => setRevision((value) => value + 1)}
          />
        )}
        {notice && (
          <FeedbackMessage className="notice" message={notice} onDismiss={() => setNotice("")} tone="success" />
        )}

        {draft && (
          <form className="ambience-editor" onSubmit={(event) => void saveSet(event)} ref={editorRef}>
            <header className="ambience-editor__heading">
              <div>
                <Eyebrow>{draft.id ? "REFINE AN ATMOSPHERE" : "CREATE AN ATMOSPHERE"}</Eyebrow>
                <h2>{draft.id ? "Edit this setup" : "A new scene"}</h2>
                <p>Link it to games, tags, or both to make it reusable.</p>
              </div>
              <Button className="ambience-editor__close" onClick={() => setDraft(null)} type="button" aria-label="Close editor">×</Button>
            </header>
            <div className="ambience-editor__fields">
              <label className="ambience-field">
                <span className="field-label">Name</span>
                <input autoFocus maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required value={draft.name} />
              </label>
              <label className="ambience-field">
                <span>Description</span>
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
                <div><Eyebrow>THE SOUND & THE SIGHT</Eyebrow><h3 id="ambience-links-title">Links in this setup</h3></div>
                <Button className="button button--quiet" disabled={draft.links.length >= 20} onClick={() => setDraft({
                  ...draft,
                  links: [...draft.links, { title: "", kind: "music", uri: "", embed: false }],
                })} type="button">＋ Add link</Button>
              </header>
              {draft.links.map((link, index) => (
                <div className="ambience-link-editor" key={index}>
                  <label className="ambience-field">
                    <span className="field-label">Link title</span>
                    <input maxLength={100} onChange={(event) => updateLink(index, "title", event.target.value)} placeholder="e.g. Tavern rain ambience" required value={link.title} />
                  </label>
                  <label className="ambience-field">
                    <span>Kind</span>
                    <select
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === "music" || value === "visual" || value === "both") {
                          updateLink(index, "kind", value);
                        }
                      }}
                      value={link.kind}
                    >
                      <option value="music">Music</option>
                      <option disabled={link.embed} value="visual">Visual</option>
                      <option value="both">Music & visual</option>
                    </select>
                  </label>
                  <label className="ambience-field">
                    <span>Playback</span>
                    <select
                      onChange={(event) => {
                        const embed = event.target.value === "embed";
                        updateLink(index, "embed", embed);
                        if (embed && link.kind === "visual") updateLink(index, "kind", "music");
                      }}
                      value={link.embed ? "embed" : "link"}
                    >
                      <option value="link">Open link</option>
                      <option value="embed">Spotify player</option>
                    </select>
                  </label>
                  <label className="ambience-field ambience-link-editor__uri">
                    <span className="field-label">{link.embed ? "Spotify URL or URI" : "Link or Spotify URI"}</span>
                    <input
                      maxLength={2048}
                      onChange={(event) => updateLink(index, "uri", event.target.value)}
                      placeholder={link.embed ? "https://open.spotify.com/playlist/… or spotify:track:…" : "https://… or spotify:playlist:…"}
                      required
                      value={link.uri}
                    />
                    {link.embed && <small className="ambience-link-editor__hint">Embeds supported Spotify tracks, albums, playlists, shows, episodes, and artists.</small>}
                  </label>
                  <Button
                    aria-label={`Remove ${link.title || "untitled link"}`}
                    className="ambience-link-editor__remove"
                    disabled={draft.links.length === 1}
                    onClick={() => setDraft({ ...draft, links: draft.links.filter((_, linkIndex) => linkIndex !== index) })}
                    type="button"
                  >Remove</Button>
                </div>
              ))}
            </section>
            <p className="ambience-editor__help">Links open in their service; Spotify player links can also be embedded on the ongoing game page.</p>
            {formError && (
              <FeedbackMessage
                className="ambience-editor__error"
                message={formError}
                onDismiss={() => setFormError("")}
              />
            )}
            <footer className="ambience-editor__footer">
              <Button className="button button--quiet" disabled={saving} onClick={() => setDraft(null)} type="button">Cancel</Button>
              <Button className="button button--primary" disabled={saving} type="submit">{saving ? "Saving…" : "Save atmosphere"}</Button>
            </footer>
          </form>
        )}

        <section className="ambience-library" aria-labelledby="ambience-library-title">
          <header className="ambience-library__heading">
            <div><Eyebrow>YOUR COLLECTION</Eyebrow><h2 id="ambience-library-title">Atmosphere setups</h2></div>
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
                    <div><Eyebrow>{set.links.length} {set.links.length === 1 ? "LINK" : "LINKS"}</Eyebrow><h3>{set.name}</h3></div>
                    <div className="ambience-card__actions">
                      <Button className="button button--quiet" onClick={() => editSet(set)} type="button">Edit</Button>
                      <Button className="ambience-card__delete" disabled={deletingId === set.id} onClick={() => void deleteSet(set)} type="button">
                        {deletingId === set.id ? "Removing…" : "Delete"}
                      </Button>
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
                      <a
                        aria-label={`${kindLabel(link.kind)}: ${link.title} (opens in a new tab)`}
                        className={`ambience-link ambience-link--${link.kind}`}
                        href={link.uri}
                        key={link.id}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <span className={`ambience-link__icon ambience-link__icon--${link.kind}`} aria-hidden="true">
                          {link.kind === "music" ? <Music2 /> : link.kind === "visual" ? <ImageIcon /> : <><Music2 /><ImageIcon /></>}
                        </span>
                        <span className="ambience-link__copy">
                          <span className="ambience-link__kind">{link.embed ? "Embedded Spotify player" : kindLabel(link.kind)}</span>
                          <strong title={link.title}>{link.title}</strong>
                        </span>
                        <ExternalLink className="ambience-link__external" aria-hidden="true" />
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
