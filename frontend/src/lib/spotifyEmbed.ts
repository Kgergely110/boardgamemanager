const spotifyContentTypes = new Set(["album", "artist", "episode", "playlist", "show", "track"]);

export function getSpotifyEmbed(uri: string): { src: string; height: number } | null {
  const uriMatch = /^spotify:(album|artist|episode|playlist|show|track):([A-Za-z0-9]+)$/i.exec(uri.trim());
  let type: string | undefined;
  let id: string | undefined;

  if (uriMatch) {
    [, type, id] = uriMatch;
  } else {
    try {
      const url = new URL(uri);
      if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
      const path = url.pathname.split("/").filter(Boolean);
      if (path[0]?.startsWith("intl-")) path.shift();
      if (path[0] === "embed") path.shift();
      [type, id] = path;
    } catch {
      return null;
    }
  }

  const normalizedType = type?.toLowerCase();
  if (
    !normalizedType ||
    !spotifyContentTypes.has(normalizedType) ||
    !id ||
    !/^[A-Za-z0-9]+$/.test(id)
  ) return null;

  return {
    src: `https://open.spotify.com/embed/${normalizedType}/${id}`,
    height: normalizedType === "track" ? 152 : 352,
  };
}
