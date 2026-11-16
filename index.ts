// NetEase Cloud Music for MyGo Music. Talks to NetEase's eapi directly, with
// no server in between.

// What the app gives a plugin.
interface Host {
  crypto: { md5(text: string): string; aesEcbEncrypt(key: string, text: string): string };
  storage: { get(key: string): unknown; set(key: string, value: unknown): void; remove(key: string): void };
  setting(key: string): string;
  signInPrompt(prompt: { qr: string; text: string }): void;
  t(text: string): string;
}
declare const host: Host;

// The app's shapes, as internal/music/music.go names them in JSON. What's
// optional the app reads as empty when left out.
type Artist = { id: string; name: string };
type AlbumRef = { id?: string; name?: string; imageUrl?: string };
type Album = { id: string; name?: string; imageUrl?: string; artists?: Artist[]; released?: string; saved?: boolean };
type Track = {
  id: string;
  name?: string;
  artists?: Artist[];
  album: AlbumRef;
  duration: number;
  unavailable?: boolean;
  showId?: string;
  description?: string;
  published?: string;
};
type Playlist = {
  id: string;
  name?: string;
  owner?: string;
  trackCount?: number;
  imageUrl?: string;
  description?: string;
  mine?: boolean;
  saved?: boolean;
  fixed?: boolean;
  tracks?: Track[];
};
type Show = { id: string; name?: string; imageUrl?: string; description?: string; publisher?: string; episodeCount?: number; subscribed: boolean };
type Comment = { id: string; author?: string; avatarUrl?: string; text?: string; time?: number; likes?: number; liked: boolean };
type Account = { id: string; name?: string; imageUrl?: string };
type Stream = { url: string; type: string; quality: string; bitRate: number; size: number; headers: Record<string, string> };
type Section = { title?: string; tracks?: Track[]; albums?: Album[]; playlists?: Playlist[]; shows?: Show[] };
type Browse = { title?: string; sections: Section[] };

// What NetEase sends. It may leave out any field, so all are optional, and
// the mappers below check what they read.
type NId = number | string;
type NArtist = { id?: NId; name?: string; picUrl?: string; img1v1Url?: string };
type NAlbum = { id?: NId; name?: string; picUrl?: string; blurPicUrl?: string; artists?: NArtist[]; artist?: NArtist; publishTime?: number };
type NPrivilege = { id?: NId; st?: number; pl?: number };
type NSong = { id?: NId; name?: string; ar?: NArtist[]; artists?: NArtist[]; al?: NAlbum; album?: NAlbum; dt?: number; duration?: number; privilege?: NPrivilege };
type NPlaylist = {
  id?: NId;
  name?: string;
  creator?: { nickname?: string; userId?: NId };
  trackCount?: number;
  coverImgUrl?: string;
  picUrl?: string;
  description?: string;
  specialType?: number;
  subscribed?: boolean;
  tracks?: NSong[];
  trackIds?: { id: NId }[];
  updateFrequency?: string;
};
type NRadio = { id?: NId; name?: string; picUrl?: string; desc?: string; dj?: { nickname?: string }; programCount?: number; subed?: boolean };
type NProgram = {
  id?: NId;
  name?: string;
  mainSong?: { id?: NId };
  radio?: { id?: NId; name?: string };
  coverUrl?: string;
  duration?: number;
  description?: string;
  createTime?: number;
};
type NComment = { commentId?: NId; user?: { nickname?: string; avatarUrl?: string }; content?: string; time?: number; likedCount?: number; liked?: boolean };
type NSongUrl = { id?: NId; code?: number; url?: string | null; type?: string; level?: string; br?: number; size?: number; freeTrialInfo?: unknown };
type NSearch = {
  songs?: NSong[];
  songCount?: number;
  albums?: NAlbum[];
  albumCount?: number;
  artists?: NArtist[];
  artistCount?: number;
  playlists?: NPlaylist[];
  playlistCount?: number;
  djRadios?: NRadio[];
  djRadiosCount?: number;
};
// What every answer may carry.
type NBody = { code?: number; message?: string; msg?: string };

const EAPI_KEY = "e82ckenh8dichen8";

// What eapi wants posted as params for a request to path with text as its body.
function eapiParams(path: string, text: string): string {
  const digest = host.crypto.md5(`nobody${path}use${text}md5forencrypt`);
  const message = `${path}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return host.crypto.aesEcbEncrypt(EAPI_KEY, message).toUpperCase();
}

// NetEase's Quality Levels, lowest first.
const LEVELS = ["standard", "higher", "exhigh", "lossless", "hires"];
const LEVEL_FOR_QUALITY: Record<string, string> = { standard: "standard", high: "exhigh", lossless: "lossless" };

// The levels to try for the app's quality, best first: the one asked for, then
// each below it. Prefer Hi-Res puts Hi-Res above Lossless.
function levelsFor(quality: string, preferHiRes: boolean): string[] {
  let top = LEVEL_FOR_QUALITY[quality] ?? "exhigh";
  if (top === "lossless" && preferHiRes) top = "hires";
  return LEVELS.slice(0, LEVELS.indexOf(top) + 1).reverse();
}

// What an id the app hands back names: a song, or an Episode, which is a
// programme playing a song of its own.
// An Episode NetEase has no song for has none: it can't be played.
type Ref = { kind: "song"; id: string } | { kind: "episode"; programId: string; songId: string | null };

function episodeId(programId: string, songId: string | null): string {
  return songId ? `program:${programId}:${songId}` : `program:${programId}`;
}

function refOf(id: string): Ref {
  const [kind, programId, songId] = String(id).split(":");
  return kind === "program" ? { kind: "episode", programId, songId: songId || null } : { kind: "song", id };
}

// Where a song's or an Episode's comments are: its thread, and its id in it.
function commentsOf(ref: Ref): { thread: string; rid: string } {
  return ref.kind === "song"
    ? { thread: `R_SO_4_${ref.id}`, rid: ref.id }
    : { thread: `A_DJ_1_${ref.programId}`, rid: ref.programId };
}

// An image the app asks for at the size it shows it, from NetEase's CDN.
function imageOf(url?: string): string | undefined {
  if (!url) return undefined;
  return `${url.replace(/^http:/, "https:")}?param={size}y{size}`;
}

// A list NetEase sent, or none when it left it out.
function list<T>(x: T[] | undefined): T[];
function list(x: unknown): unknown[];
function list(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

// Text NetEase sent, or none when it left it out.
function text(x: unknown): string {
  return typeof x === "string" ? x : "";
}

// The id of an artist, album or show NetEase names, or none when it doesn't
// know it: NetEase gives those id 0, and there's no page to open for them.
function idOf(x: NId | undefined): string {
  return x ? String(x) : "";
}

function toArtistRef(a: NArtist): Artist {
  return { id: idOf(a.id), name: text(a.name) };
}

// A Track from a song in either of NetEase's shapes, with the privilege that
// says whether the listener can play it, if NetEase sent one.
function toTrack(song: NSong, privilege: NPrivilege | undefined = song.privilege): Track {
  const track: Track = {
    id: String(song.id),
    name: text(song.name),
    artists: list(song.ar ?? song.artists).map(toArtistRef),
    album: albumRefOf(song.al ?? song.album ?? {}),
    duration: song.dt ?? song.duration ?? 0,
  };
  if (!playable(privilege) && !otherSources()) track.unavailable = true;
  return track;
}

// The album a song is on, as the song names it.
function albumRefOf(al: NAlbum): AlbumRef {
  return compact({ id: idOf(al.id), name: text(al.name), imageUrl: imageOf(al.picUrl) });
}

// Whether a privilege lets the listener play the song: one that's delisted, or
// that the account can't play at any level, is Unavailable. No privilege says
// nothing either way.
function playable(privilege: NPrivilege | undefined): boolean {
  return !privilege || ((privilege.st ?? -1) >= 0 && privilege.pl !== 0);
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 NeteaseMusicDesktop/3.1.17.204416";

// What NetEase expects of every request, the app's for audio as well.
const WEB_HEADERS = { "user-agent": UA, referer: "https://music.163.com/" };

// An error the app knows what to do with, by its code.
function fail(code: string, message: string): Error {
  return Object.assign(new Error(host.t(message)), { code });
}

const APP_QUALITY: Record<string, string> = { hires: "lossless", lossless: "lossless", exhigh: "high" };

// What the app plays for one item of NetEase's song URLs, or null when there's
// no whole song at this level: no URL, or only a Trial Clip.
function streamOf(item: NSongUrl | undefined): Stream | null {
  if (!item?.url || item.freeTrialInfo) return null;
  return {
    url: String(item.url),
    type: String(item.type || "mp3").toLowerCase(),
    quality: APP_QUALITY[text(item.level)] ?? "standard",
    bitRate: Number(item.br) || 0,
    size: Number(item.size) || 0,
    headers: { ...WEB_HEADERS },
  };
}

// The date, in China, of a time NetEase gives in milliseconds.
function dateOf(ms?: number): string | undefined {
  if (!ms) return undefined;
  return new Date(ms + 8 * 3600000).toISOString().slice(0, 10);
}

// o without what's empty, which the app reads as left out.
function compact<T extends object>(o: T): Partial<T> {
  const out: Partial<T> = { ...o };
  for (const k of Object.keys(out) as (keyof T)[]) if (out[k] == null || out[k] === "") delete out[k];
  return out;
}

function toAlbum(a: NAlbum): Album {
  return {
    id: String(a.id),
    ...compact({
      name: text(a.name),
      imageUrl: imageOf(a.picUrl ?? a.blurPicUrl),
      artists: (a.artists ?? (a.artist ? [a.artist] : [])).map(toArtistRef),
      released: dateOf(a.publishTime),
    }),
  };
}

function toArtist(a: NArtist) {
  return { id: String(a.id), ...compact({ name: text(a.name), imageUrl: imageOf(a.picUrl ?? a.img1v1Url) }) };
}

function toPlaylist(p: NPlaylist): Playlist {
  return {
    id: String(p.id),
    ...compact({
      name: text(p.name),
      owner: p.creator?.nickname,
      trackCount: p.trackCount,
      imageUrl: imageOf(p.coverImgUrl ?? p.picUrl),
      description: p.description,
    }),
  };
}

// A Podcast from a NetEase show.
function toShow(r: NRadio): Show {
  return {
    id: String(r.id),
    subscribed: !!r.subed,
    ...compact({
      name: text(r.name),
      imageUrl: imageOf(r.picUrl),
      description: r.desc,
      publisher: r.dj?.nickname,
      episodeCount: r.programCount,
    }),
  };
}

// An Episode from a NetEase programme. It isn't a Track, but the app takes it
// in a Track's shape, of its Podcast, playing the programme's own song.
function toEpisode(p: NProgram): Track {
  const song = p.mainSong?.id ? String(p.mainSong.id) : null;
  const radio = p.radio ?? {};
  return {
    id: episodeId(String(p.id), song),
    duration: p.duration ?? 0,
    album: albumRefOf({ id: radio.id, name: radio.name, picUrl: p.coverUrl }),
    ...compact({
      name: text(p.name),
      showId: idOf(radio.id),
      description: p.description,
      published: dateOf(p.createTime),
      unavailable: song ? undefined : true,
    }),
  };
}

// Liked Songs is NetEase's playlist of special type 5.
const isLikedSongs = (p: NPlaylist) => p.specialType === 5;

// Whose playlist p is to the listener me: theirs, or saved if they saved it.
// Liked Songs is theirs, but kept by NetEase.
function ownership(p: NPlaylist, me: string, saved: boolean): { mine?: true; fixed?: true; saved?: true } {
  if (!me || String(p.creator?.userId) !== me) return saved ? { saved: true } : {};
  return isLikedSongs(p) ? { mine: true, fixed: true } : { mine: true };
}

// The listener's playlists: every one listed that isn't theirs, they saved.
function myPlaylists(list: NPlaylist[], me: string): Playlist[] {
  return list.map((p) => ({ ...toPlaylist(p), ...ownership(p, me, true) }));
}

// ---- Talking to NetEase ----

const API = "https://interface.music.163.com";
const PAGE = 30;
const TIMEOUT = 15000;

function cookieMap(text = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(/;\s*/)) {
    const at = part.indexOf("=");
    if (at > 0) out[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return out;
}

function cookieText(map: Record<string, string>): string {
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

// The cookies a response sets, as name=value pairs.
function setCookies(headers: Headers): string {
  return headers.getSetCookie().map((r) => r.split(";", 1)[0]).join("; ");
}

function deviceId(): string {
  let id = text(host.storage.get("deviceId"));
  if (!id) {
    id = host.crypto.md5(`mygo-music-netease:${Date.now()}:${Math.random()}`);
    host.storage.set("deviceId", id);
  }
  return id;
}

type Session = { cookie: string; account: Account };
// The plugin's own record, so as it wrote it.
const session = () => (host.storage.get("session") as Session | undefined) ?? null;

function forget() {
  host.storage.remove("session");
  likedSongs.forget();
}

type Options = { cookie?: string; codes?: number[]; signedIn?: boolean };

// For the listener's own things, which need a Session.
const SIGNED_IN: Options = { signedIn: true };
const signInFirst = () => fail("signIn", "Sign in to NetEase Cloud Music first.");

// Whose cookies a request goes with: the Session's, which NetEase may renew or
// end, or those of a sign-in still under way, which belong to no Session yet.
function cookiesFor(options: Options): { cookies: Record<string, string>; session: Session | null } {
  if (options.cookie !== undefined) return { cookies: cookieMap(options.cookie), session: null };
  const s = session();
  if (options.signedIn && !s) throw signInFirst();
  return { cookies: cookieMap(s?.cookie), session: s };
}

// The header eapi wants inside each request, as NetEase's desktop client sends it.
function eapiHeaderOf(cookies: Record<string, string>): Record<string, string> {
  const header: Record<string, string> = {
    os: "pc",
    osver: "Microsoft-Windows-10-Professional-build-19045-64bit",
    appver: "3.1.17.204416",
    deviceId: deviceId(),
    channel: "netease",
    requestId: `${Date.now()}_${String(Math.floor(Math.random() * 1000)).padStart(4, "0")}`,
  };
  for (const k of ["MUSIC_U", "MUSIC_A", "__csrf"]) if (cookies[k]) header[k] = cookies[k];
  return header;
}

// Posts an eapi request, giving up after TIMEOUT.
async function post(path: string, data: Record<string, unknown>, cookies: Record<string, string>): Promise<Response> {
  const header = eapiHeaderOf(cookies);
  const text = JSON.stringify({ ...data, header, e_r: false });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(`${API}/eapi/${path.slice("/api/".length)}`, {
      method: "POST",
      headers: {
        ...WEB_HEADERS,
        "content-type": "application/x-www-form-urlencoded",
        cookie: cookieText({ ...cookies, ...header }),
      },
      body: `params=${eapiParams(path, text)}`,
      signal: controller.signal,
    });
  } catch (e) {
    throw controller.signal.aborted ? new Error(host.t("NetEase took too long to answer.")) : e;
  } finally {
    clearTimeout(timer);
  }
}

// Throws for an answer that isn't one the caller can use. A Session NetEase no
// longer accepts is forgotten, and the listener asked to sign in again.
function check(body: NBody, options: Options, s: Session | null) {
  const code = Number(body.code ?? 200);
  if (SIGNED_OUT.includes(code)) {
    if (s) forget();
    throw fail("signIn", "Your NetEase sign-in has expired. Sign in again.");
  }
  if (code === 200 || options.codes?.includes(code)) return;
  throw new Error(`${messageOf(body)} (${code})`);
}

// The codes NetEase answers when it no longer accepts a Session.
const SIGNED_OUT = [301, 401];

function messageOf(body: NBody): string {
  return body.message ?? body.msg ?? host.t("NetEase answered with an error.");
}

// NetEase renews the Session's cookies as it goes; keep what it sends.
function renew(s: Session | null, cookie: string) {
  if (!s || !cookie) return;
  host.storage.set("session", { ...s, cookie: cookieText({ ...cookieMap(s.cookie), ...cookieMap(cookie) }) });
}

// One eapi request, answering its JSON, in the shape T NetEase sends for path,
// and the cookies NetEase set with it.
async function call<T = unknown>(path: string, data: Record<string, unknown> = {}, options: Options = {}) {
  const { cookies, session: s } = cookiesFor(options);
  const res = await post(path, data, cookies);
  if (!res.ok) throw new Error(`${host.t("NetEase couldn't answer.")} (HTTP ${res.status})`);
  // Where NetEase's answers come in: T's fields are all optional, and checked
  // as they're read.
  const body = (await res.json()) as T & NBody;
  check(body, options, s);
  const cookie = setCookies(res.headers);
  renew(s, cookie);
  return { body, cookie };
}

const api = async <T = unknown>(path: string, data?: Record<string, unknown>, options?: Options) =>
  (await call<T>(path, data, options)).body;

const me = () => text(session()?.account.id);

// The privileges NetEase sent beside songs, by song id.
function privilegesOf(list: NPrivilege[] = []): Map<string, NPrivilege> {
  return new Map(list.map((p) => [String(p.id), p]));
}

// Tracks for songs, each with its privilege from beside it or inside it.
function tracksFrom(songs: NSong[] = [], privileges: NPrivilege[] = []): Track[] {
  const byId = privilegesOf(privileges);
  return songs.map((s) => toTrack(s, byId.get(String(s.id)) ?? s.privilege));
}

// What NetEase says of one song, or nothing when it knows no such song.
async function songDetail(id: string): Promise<NSong> {
  return list((await api<{ songs?: NSong[] }>("/api/v3/song/detail", { c: JSON.stringify([{ id }]) })).songs)[0] ?? {};
}

// The most songs NetEase details in one request.
const DETAIL_BATCH = 500;

// Tracks for song ids, with their privileges, a batch at a time.
async function tracksOf(ids: string[]): Promise<Track[]> {
  const out: Track[] = [];
  for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
    const batch = ids.slice(i, i + DETAIL_BATCH);
    const body = await api<{ songs?: NSong[]; privileges?: NPrivilege[] }>("/api/v3/song/detail", { c: JSON.stringify(batch.map((id) => ({ id }))) });
    out.push(...tracksFrom(body.songs, body.privileges));
  }
  return out;
}

// ---- Account ----

export async function signIn() {
  const unikey = (await api<{ unikey?: string }>("/api/login/qrcode/unikey", { type: 3 }, { cookie: "" })).unikey;
  if (!unikey) throw new Error(host.t("NetEase didn't give a sign-in code. Try again."));
  const qr = `https://music.163.com/login?codekey=${encodeURIComponent(unikey)}`;
  host.signInPrompt({ qr, text: host.t("Scan with the NetEase Cloud Music app, then confirm on your phone.") });
  return startSession(await waitForScan(unikey, qr));
}

// The cookies NetEase gives once the listener scans the code and confirms.
async function waitForScan(unikey: string, qr: string): Promise<string> {
  const deadline = Date.now() + 4 * 60000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const { body, cookie } = await call<{ cookie?: string }>(
      "/api/login/qrcode/client/login",
      { key: unikey, type: 3 },
      { cookie: "", codes: [800, 801, 802, 803] },
    );
    if (body.code === 803) return cookie || body.cookie || "";
    if (body.code === 800) break;
    if (body.code === 802) host.signInPrompt({ qr, text: host.t("Scanned. Confirm on your phone.") });
  }
  throw fail("signIn", "The sign-in code expired. Sign in again.");
}

// Keeps a Session for the cookies of a finished sign-in, as the account they're for.
async function startSession(jar: string) {
  const profile = cookieMap(jar).MUSIC_U && (await api<{ profile?: { userId?: NId; nickname?: string; avatarUrl?: string } }>("/api/w/nuser/account/get", {}, { cookie: jar })).profile;
  if (!profile) throw fail("signIn", "NetEase didn't finish signing in. Try again.");
  const account: Account = { id: String(profile.userId), ...compact({ name: text(profile.nickname), imageUrl: imageOf(profile.avatarUrl) }) };
  host.storage.set("session", { cookie: jar, account });
  likedSongs.forget();
  return account;
}

export function signOut() {
  forget();
}

export function account() {
  return session()?.account ?? null;
}

// ---- Catalog ----

// Each kind the app searches: NetEase's code for it, and where its answer has
// the items and how many there are in all.
type SearchType = { code: number; items: (r: NSearch) => unknown[]; count: (r: NSearch) => number | undefined };
const SEARCH_TYPES: Record<string, SearchType> = {
  tracks: { code: 1, items: (r) => list(r.songs).map((s) => toTrack(s)), count: (r) => r.songCount },
  albums: { code: 10, items: (r) => list(r.albums).map(toAlbum), count: (r) => r.albumCount },
  artists: { code: 100, items: (r) => list(r.artists).map(toArtist), count: (r) => r.artistCount },
  playlists: { code: 1000, items: (r) => list(r.playlists).map(toPlaylist), count: (r) => r.playlistCount },
  shows: { code: 1009, items: (r) => list(r.djRadios).map(toShow), count: (r) => r.djRadiosCount },
};

export async function search({ query, kind, offset = 0 }: { query: string; kind: string; offset?: number }) {
  const type = SEARCH_TYPES[kind];
  if (!type) throw fail("unsupported", "NetEase search doesn't do this.");
  const body = await api<{ result?: NSearch }>("/api/cloudsearch/pc", { s: query, type: type.code, limit: PAGE, offset, total: true });
  const result = body.result ?? {};
  const items = type.items(result);
  return { [kind]: items, more: offset + items.length < (type.count(result) ?? 0) };
}

export async function suggest({ query }: { query: string }): Promise<string[]> {
  const result = (await api<{ result?: { allMatch?: { keyword?: string }[] } }>("/api/search/suggest/keyword", { s: query })).result ?? {};
  return list(result.allMatch).map((m) => text(m.keyword));
}

export async function album({ id }: { id: string }) {
  const body = await api<{ songs?: NSong[]; album?: NAlbum }>(`/api/v1/album/${id}`);
  const songs = list(body.songs);
  // The album's songs are cut short of its cover; give them the album's.
  const cover = body.album?.picUrl;
  return {
    album: toAlbum(body.album ?? { id }),
    tracks: songs.map((s) => toTrack({ ...s, al: { ...(s.al ?? {}), picUrl: s.al?.picUrl ?? cover } })),
  };
}

export async function artist({ id }: { id: string }) {
  const [info, albums] = await Promise.all([
    api<{ artist?: NArtist; hotSongs?: NSong[] }>(`/api/v1/artist/${id}`),
    api<{ hotAlbums?: NAlbum[] }>(`/api/artist/albums/${id}`, { limit: 100 }),
  ]);
  return {
    artist: toArtist(info.artist ?? { id }),
    tracks: tracksFrom(info.hotSongs),
    albums: list(albums.hotAlbums).map(toAlbum),
  };
}

// A playlist as NetEase sends it, with the ids of all its songs in order.
async function playlistDetail(id: string) {
  const body = await api<{ playlist?: NPlaylist; privileges?: NPrivilege[] }>("/api/v6/playlist/detail", { id, n: 100000, s: 8 });
  const p = body.playlist ?? {};
  return { body, p, ids: list(p.trackIds).map((t) => String(t.id)) };
}

export async function playlist({ id }: { id: string }): Promise<Playlist & { tracks: Track[] }> {
  const { body, p, ids } = await playlistDetail(id);
  const tracks = tracksFrom(p.tracks, body.privileges);
  // NetEase sends the first thousand or so songs whole, and only ids after.
  tracks.push(...(await tracksOf(ids.slice(tracks.length))));
  const out = { ...toPlaylist(p), tracks, ...ownership(p, me(), !!p.subscribed) };
  // Opening Liked Songs picks up songs liked elsewhere, as on the phone.
  if (out.fixed) likedSongs.know(ids);
  return out;
}

export async function lyrics({ id }: { id: string }) {
  const body = await api<{ lrc?: { lyric?: string }; tlyric?: { lyric?: string } }>("/api/song/lyric", { id, lv: -1, tv: -1 });
  return compact({ lrc: body.lrc?.lyric, translation: body.tlyric?.lyric });
}

// The song an id plays: its own, or an Episode's programme's.
function songOf(id: string): string | null {
  const ref = refOf(id);
  return ref.kind === "song" ? ref.id : ref.songId;
}

export async function stream({ id, quality }: { id: string; quality: string }) {
  const song = songOf(id);
  for (const level of song ? levelsFor(quality, host.setting("preferHiRes") === "true") : []) {
    const body = await api<{ data?: NSongUrl[] }>("/api/song/enhance/player/url/v1", { ids: JSON.stringify([song]), level, encodeType: "flac" });
    const s = streamOf(list(body.data).find((x) => String(x.id) === song));
    if (s) return s;
  }
  const ref = refOf(id);
  if (ref.kind !== "song" || !otherSources()) throw fail("unavailable", "NetEase won't play this song for this account here.");
  const wanted = await wantedOf(ref.id).catch(() => null);
  const s = wanted && (await standIn(wanted, quality));
  if (s) return s;
  throw fail("unavailable", "NetEase won't play this song, and no other source has it.");
}

// ---- Stand-ins ----

// Whether the listener lets songs NetEase won't play come from other services.
const otherSources = () => host.setting("otherSources") === "true";

// The NetEase song a Stand-in has to be: its title, artists, and length in ms.
type Wanted = { title: string; artists: string[]; duration: number };

// A note in brackets on a NetEase title saying whose song it covers, which no
// other service names the song with.
const COVER_NOTE = /\s*[(（][^)）]*(cover|翻自)[^)）]*[)）]/gi;

async function wantedOf(id: string): Promise<Wanted> {
  const song = await songDetail(id);
  return {
    title: text(song.name).replace(COVER_NOTE, "").trim(),
    artists: list(song.ar).map((a) => text(a.name)),
    duration: song.dt ?? 0,
  };
}

// The Stand-in for wanted at the app's quality, or null when there's none.
//
// Every source looks at once, but SOURCES' order picks: a better source's
// Stand-in wins even when it comes later. Once STAND_IN_TIME passes, the best
// that has come plays, and what's still being asked is let go.
async function standIn(wanted: Wanted, quality: string): Promise<Stream | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STAND_IN_TIME);
  const timeUp = new Promise<null>((done) => controller.signal.addEventListener("abort", () => done(null)));
  const came: (Stream | null)[] = SOURCES.map(() => null);
  const looks = SOURCES.map((source, i) => standInOn(source, wanted, quality, controller.signal).then((s) => (came[i] = s)));
  try {
    for (const look of looks) {
      const s = await Promise.race([look, timeUp]);
      if (controller.signal.aborted) return came.find((s) => s) ?? null;
      if (s) return s;
    }
    return null;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

const STAND_IN_TIME = 8000;

// The first of source's Matches whose audio comes. A source that fails or
// answers what it shouldn't has none.
async function standInOn(source: Source, wanted: Wanted, quality: string, signal: AbortSignal): Promise<Stream | null> {
  const found = await source.search(wanted, signal).catch((): Found[] => []);
  for (const f of found.filter((f) => source.matches(wanted, f))) {
    const s = await f.stream(quality).catch(() => null);
    if (s && (await comes(s, signal))) return s;
  }
  return null;
}

// A Stand-in Source: how to find songs on it, and which of them are Matches.
// What it finds plays with the signal it was found with.
type Source = { search(wanted: Wanted, signal: AbortSignal): Promise<Found[]>; matches(wanted: Wanted, found: Found): boolean };

// Whether a Stand-in's audio comes: its first 8 KB, asked for as the player would.
async function comes(s: Stream, signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(s.url, { headers: { ...s.headers, range: `bytes=0-${CHECK_BYTES - 1}` }, signal });
    return res.status === 206 && (await res.arrayBuffer()).byteLength === CHECK_BYTES;
  } catch {
    return false;
  }
}

const CHECK_BYTES = 8192;

// Whether a song found elsewhere is the same recording as wanted: the same
// title and version, a shared artist, and as long, give or take tolerance ms,
// when both lengths are known.
function isMatch(wanted: Wanted, found: Found, tolerance: number): boolean {
  if (plain(found.title) !== plain(wanted.title)) return false;
  const artists = new Set(wanted.artists.map(plain));
  return found.artists.some((a) => artists.has(plain(a))) && closeInLength(wanted, found, tolerance);
}

// Whether two songs are as long, give or take tolerance ms, or either length is unknown.
function closeInLength(wanted: Wanted, found: Found, tolerance: number): boolean {
  return !wanted.duration || !found.duration || Math.abs(wanted.duration - found.duration) <= tolerance;
}

// A name as compared across services: no case, spaces or bracket marks.
function plain(name: string): string {
  return name.toLowerCase().replace(/[\s()（）\[\]【】]/g, "");
}

// What a Stand-in Source is asked for: FLAC, 320k or 128k.
type Tier = "flac" | "320" | "128";

// The Tiers to ask for at the app's quality, best first: FLAC for Lossless,
// else 320k, then each below.
function tiersFor(quality: string): Tier[] {
  return quality === "lossless" ? ["flac", "320", "128"] : ["320", "128"];
}

// The app's quality for audio a Stand-in Source gave.
function qualityOf(type: string, bitRate: number): string {
  if (type === "flac") return "lossless";
  return bitRate >= 320000 ? "high" : "standard";
}

// A song a Stand-in Source found, as it names it, and how to play it.
type Found = { title: string; artists: string[]; duration: number; stream(quality: string): Promise<Stream | null> };

// ---- Kugou ----

const KUGOU: Source = { search: kugouSearch, matches: (w, f) => isMatch(w, f, 5000) };

// What a service sent in a list where it should be an object, and is.
const isObject = <T,>(x: T): x is T & object => typeof x === "object" && x !== null;

type KSong = { songname?: string; singername?: string; duration?: number; hash?: string; "320hash"?: string; sqhash?: string; album_id?: string };
type KFile = { status?: number; url?: string[]; extName?: string; bitRate?: number; fileSize?: number };

async function kugouSearch(wanted: Wanted, signal: AbortSignal): Promise<Found[]> {
  const keyword = encodeURIComponent([wanted.title, ...wanted.artists].join(" "));
  const res = await fetch(`http://mobilecdn.kugou.com/api/v3/search/song?keyword=${keyword}&page=1&pagesize=10`, { signal });
  const body = (await res.json()) as { data?: { info?: KSong[] } };
  return list(body.data?.info).filter(isObject).map((k) => ({
    title: text(k.songname),
    artists: text(k.singername).split("、"),
    duration: (Number(k.duration) || 0) * 1000,
    stream: async (quality) => {
      const hashes: Record<Tier, string> = { flac: text(k.sqhash), "320": text(k["320hash"]), "128": text(k.hash) };
      for (const tier of tiersFor(quality)) {
        const s = hashes[tier] ? await kugouFile(hashes[tier], text(k.album_id), signal) : null;
        if (s) return s;
      }
      return null;
    },
  }));
}

async function kugouFile(hash: string, album: string, signal: AbortSignal): Promise<Stream | null> {
  const key = host.crypto.md5(`${hash}kgcloudv2`);
  const res = await fetch(`http://trackercdn.kugou.com/i/v2/?key=${key}&hash=${hash}&appid=1005&pid=2&cmd=25&behavior=play&album_id=${album}`, { signal });
  const f = (await res.json()) as KFile;
  const url = list(f.url)[0];
  if (!url) return null;
  const type = text(f.extName).toLowerCase();
  const bitRate = Number(f.bitRate) || 0;
  return { url, type, quality: qualityOf(type, bitRate), bitRate, size: Number(f.fileSize) || 0, headers: {} };
}

// ---- Bodian (Kuwo's 波点 app) ----

const BODIAN: Source = { search: bodianSearch, matches: (w, f) => isMatch(w, f, 5000) };

type BSong = { MUSICRID?: string; SONGNAME?: string; ARTIST?: string; DURATION?: string };
type BAudio = { code?: number; data?: { audioUrl?: string; format?: string; bitrate?: number } };

const BODIAN_BR: Record<Tier, string> = { flac: "2000kflac", "320": "320kmp3", "128": "128kmp3" };

// What Bodian's app sends with each request, as one device for as long as the
// plugin runs.
const BODIAN_HEADERS = {
  "user-agent": "Dart/2.19 (dart:io)",
  plat: "ar",
  channel: "aliopen",
  devid: String(Math.floor(Math.random() * 1e11)),
  ver: "3.9.0",
};

async function bodianSearch(wanted: Wanted, signal: AbortSignal): Promise<Found[]> {
  const all = encodeURIComponent([wanted.title, ...wanted.artists].join(" "));
  const res = await fetch(`http://search.kuwo.cn/r.s?&correct=1&vipver=1&stype=comprehensive&encoding=utf8&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=${all}`, { signal });
  const body = (await res.json()) as { content?: { musicpage?: { abslist?: BSong[] } }[] };
  return list(list(body.content)[1]?.musicpage?.abslist).filter(isObject).map((b) => ({
    title: text(b.SONGNAME),
    artists: text(b.ARTIST).split("&"),
    duration: (Number(b.DURATION) || 0) * 1000,
    stream: (quality) => bodianAudio(text(b.MUSICRID).split("_").pop() ?? "", quality, signal),
  }));
}

// Bodian plays paid songs to a device that has watched its ad, so it watches
// one first.
async function bodianAudio(id: string, quality: string, signal: AbortSignal): Promise<Stream | null> {
  await fetch("http://bd-api.kuwo.cn/api/service/advert/watch?uid=-1&token=&timestamp=1724306124436&sign=15a676d66285117ad714e8c8371691da", {
    method: "POST",
    headers: { ...BODIAN_HEADERS, qimei36: "1e9970cbcdc20a031dee9f37100017e1840e", "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ type: 5, subType: 5, musicId: 0, adToken: "" }),
    signal,
  });
  for (const tier of tiersFor(quality)) {
    const res = await fetch(bodianSigned(`http://bd-api.kuwo.cn/api/play/music/v2/audioUrl?&br=${BODIAN_BR[tier]}&musicId=${id}`), { headers: BODIAN_HEADERS, signal });
    const body = (await res.json()) as BAudio;
    const url = text(body.data?.audioUrl);
    if (body.code !== 200 || !url) continue;
    const type = text(body.data?.format).toLowerCase();
    const bitRate = (Number(body.data?.bitrate) || 0) * 1000;
    return { url, type, quality: qualityOf(type, bitRate), bitRate, size: 0, headers: {} };
  }
  return null;
}

// url with the time and the signature Bodian's app adds: md5 of a salt, the
// query's letters and digits sorted, and the path.
function bodianSigned(url: string): string {
  const timed = `${url}&timestamp=${Date.now()}`;
  const chars = timed.slice(timed.indexOf("?")).replace(/[^a-zA-Z0-9]/g, "").split("").sort().join("");
  return `${timed}&sign=${host.crypto.md5(`kuwotest${chars}${new URL(url).pathname}`)}`;
}

// ---- Bilibili videos ----

const BILIBILI: Source = { search: bilibiliSearch, matches: isVideoMatch };

// Whether a video an uploader titled is wanted: named for the song and one of
// its artists, not a cover or a backing track, of the same version, and as
// long, give or take 10s.
function isVideoMatch(wanted: Wanted, found: Found): boolean {
  const title = plain(found.title);
  if (!title.includes(plain(wanted.title)) || !wanted.artists.some((a) => title.includes(plain(a)))) return false;
  // Marker words count only as whole words outside the song's and artists' names.
  const rest = [wanted.title, ...wanted.artists]
    .filter(Boolean)
    .reduce((t, name) => t.split(name.toLowerCase()).join(" "), found.title.toLowerCase());
  if (COVER.test(rest)) return false;
  const own = wanted.title.toLowerCase();
  if (VERSIONS.some((v) => v.test(rest) && !v.test(own))) return false;
  return closeInLength(wanted, found, 10000);
}

// Words marking a cover or a backing track.
const COVER = /\bcover\b|翻唱|翻自|伴奏/;

// Words naming a version of a song other than the one first released.
const VERSIONS = [/\blive\b/, /现场/, /\bremix\b/, /\binstrumental\b/, /\bacoustic\b/, /\bdemo\b/, /\bdj\b/];

type BVideo = { title?: string; duration?: string; bvid?: string };
type BDash = { data?: { dash?: { audio?: { base_url?: string; bandwidth?: number }[] } } };

const BILIBILI_HEADERS = { "user-agent": WEB_HEADERS["user-agent"], referer: "https://www.bilibili.com/" };

async function bilibiliSearch(wanted: Wanted, signal: AbortSignal): Promise<Found[]> {
  const get = <T,>(path: string) => bilibiliGet<T>(path, signal);
  const sign = await wbiSigner(get);
  const keyword = [wanted.title, ...wanted.artists].join(" ");
  const body = await get<{ data?: { result?: BVideo[] } }>(`/x/web-interface/wbi/search/type?${sign({ search_type: "video", keyword })}`);
  return list(body.data?.result).filter(isObject).map((v) => ({
    // Bilibili marks the words searched for in titles.
    title: text(v.title).replace(/<[^>]*>/g, ""),
    artists: [],
    duration: secondsOf(text(v.duration)) * 1000,
    stream: () => bilibiliAudio(text(v.bvid), sign, get),
  }));
}

// A length Bilibili gives as m:ss or h:mm:ss, in seconds.
function secondsOf(clock: string): number {
  return clock.split(":").reduce((total, part) => total * 60 + (Number(part) || 0), 0);
}

// A video's best audio: of its first page, its DASH audio with the most bits.
async function bilibiliAudio(bvid: string, sign: WbiSign, get: BilibiliGet): Promise<Stream | null> {
  const view = await get<{ data?: { cid?: number } }>(`/x/web-interface/wbi/view?${sign({ bvid })}`);
  const play = await get<BDash>(`/x/player/wbi/playurl?${sign({ bvid, cid: Number(view.data?.cid), fnval: 16, platform: "pc" })}`);
  const [best] = list(play.data?.dash?.audio).filter(isObject).sort((a, b) => (Number(b.bandwidth) || 0) - (Number(a.bandwidth) || 0));
  if (!best?.base_url) return null;
  const bitRate = Number(best.bandwidth) || 0;
  return { url: best.base_url, type: "m4a", quality: qualityOf("m4a", bitRate), bitRate, size: 0, headers: { ...BILIBILI_HEADERS } };
}

type BilibiliGet = <T>(path: string) => Promise<T>;

async function bilibiliGet<T>(path: string, signal: AbortSignal): Promise<T> {
  return (await (await fetch(`https://api.bilibili.com${path}`, { headers: BILIBILI_HEADERS, signal })).json()) as T;
}

// Signs a query as Bilibili's web player does (WBI): the time, then md5 of the
// sorted query and a key mixed from the two Bilibili hands out each day.
type WbiSign = (params: Record<string, string | number>) => string;

const WBI_MIXIN = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

async function wbiSigner(get: BilibiliGet): Promise<WbiSign> {
  const nav = await get<{ data?: { wbi_img?: { img_url?: string; sub_url?: string } } }>("/x/web-interface/nav");
  const keyOf = (url: unknown) => text(url).slice(text(url).lastIndexOf("/") + 1, text(url).lastIndexOf("."));
  const keys = keyOf(nav.data?.wbi_img?.img_url) + keyOf(nav.data?.wbi_img?.sub_url);
  const mixin = WBI_MIXIN.map((n) => keys[n] ?? "").join("").slice(0, 32);
  return (params) => {
    const all: Record<string, string | number> = { ...params, wts: Math.round(Date.now() / 1000) };
    const query = Object.keys(all)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(all[k]).replace(/[!'()*]/g, ""))}`)
      .join("&");
    return `${query}&w_rid=${host.crypto.md5(query + mixin)}`;
  };
}

// The Stand-in Sources, best first.
const SOURCES: Source[] = [BODIAN, KUGOU, BILIBILI];

// ---- Personal FM ----

export async function stations() {
  if (!session()) throw signInFirst();
  return [{ id: "fm", name: host.t("Personal FM"), description: host.t("Songs NetEase picks for you, one after another") }];
}

export async function stationNext(_: { id: string }) {
  return tracksFrom((await api<{ data?: NSong[] }>("/api/v1/radio/get", {}, SIGNED_IN)).data);
}

// ---- Podcasts ----

export async function shows() {
  return list((await api<{ djRadios?: NRadio[] }>("/api/djradio/get/subed", { limit: 1000 }, SIGNED_IN)).djRadios).map(toShow);
}

export async function show({ id, offset = 0 }: { id: string; offset?: number }) {
  const [info, episodes] = await Promise.all([
    api<{ data?: NRadio }>("/api/djradio/v2/get", { id }),
    api<{ programs?: NProgram[]; more?: boolean }>("/api/dj/program/byradio", { radioId: id, offset, limit: PAGE, asc: false }),
  ]);
  return { show: toShow(info.data ?? { id }), episodes: list(episodes.programs).map(toEpisode), more: !!episodes.more };
}

export async function subscribeShow({ id, on }: { id: string; on: boolean }) {
  await api(`/api/djradio/${on ? "sub" : "unsub"}`, { id }, SIGNED_IN);
}

export async function likeEpisode({ id, on }: { id: string; on: boolean }) {
  const { thread } = commentsOf(refOf(id));
  await api(`/api/resource/${on ? "like" : "unlike"}`, { threadId: thread }, SIGNED_IN);
  const liked = likedEpisodes();
  if (on) liked.add(id);
  else liked.delete(id);
  host.storage.set(likedEpisodesKey(), [...liked]);
}

// NetEase doesn't say which Episodes a listener likes, so the plugin keeps
// those they liked here, for each listener.
const likedEpisodesKey = () => `likedEpisodes:${me()}`;
const likedEpisodes = () => new Set(list(host.storage.get(likedEpisodesKey())).map(String));

// ---- Comments ----

function toComment(c: NComment): Comment {
  const extras = compact({
    author: text(c.user?.nickname),
    avatarUrl: imageOf(c.user?.avatarUrl),
    text: text(c.content),
    time: c.time,
    likes: c.likedCount,
  });
  return { id: String(c.commentId), liked: !!c.liked, ...extras };
}

// Hot Comments, then the newest, each once.
function hotThenNewest(hot: NComment[], newest: NComment[]): Comment[] {
  const seen = new Set<string>();
  return [...hot, ...newest].map(toComment).filter((c) => !seen.has(c.id) && !!seen.add(c.id));
}

const COMMENT_PAGE = 20;
// The most Hot Comments NetEase puts on a first page.
const HOT_MAX = 15;

export async function comments({ trackId, offset = 0 }: { trackId: string; offset?: number }) {
  const { thread, rid } = commentsOf(refOf(trackId));
  // The app counts the Hot Comments it has as if they were newest: ask from
  // as far back as they could have taken, and let it pass over repeats.
  const newestOffset = offset && Math.max(0, offset - HOT_MAX);
  const body = await api<{ hotComments?: NComment[]; comments?: NComment[]; total?: number; more?: boolean }>(`/api/v1/resource/comments/${thread}`, { rid, offset: newestOffset, limit: COMMENT_PAGE });
  const page = offset === 0 ? hotThenNewest(list(body.hotComments), list(body.comments)) : list(body.comments).map(toComment);
  return { comments: page, total: body.total, more: !!body.more };
}

export async function likeComment({ trackId, commentId, on }: { trackId: string; commentId: string; on: boolean }) {
  const { thread } = commentsOf(refOf(trackId));
  await api(`/api/v1/comment/${on ? "like" : "unlike"}`, { threadId: thread, commentId }, SIGNED_IN);
}

export async function postComment({ trackId, text: content }: { trackId: string; text: string }) {
  const { thread } = commentsOf(refOf(trackId));
  const body = await api<{ comment?: NComment }>("/api/resource/comments/add", { threadId: thread, content }, SIGNED_IN);
  if (!body.comment) throw new Error(host.t("NetEase didn't keep the comment."));
  return toComment(body.comment);
}

// ---- Library ----

// The songs the signed-in listener likes, asked of NetEase once and kept for
// them alone. Only these change what's kept: a like made while NetEase is
// still answering applies after its answer.
const likedSongs = (() => {
  let kept: { uid: string; ids: Promise<Set<string>> } | null = null;
  const ask = (uid: string) =>
    api<{ ids?: NId[] }>("/api/song/like/get", { uid }, SIGNED_IN).then(
      (body) => new Set(list(body.ids).map(String)),
      (e) => {
        if (kept?.uid === uid) kept = null;
        throw e;
      },
    );
  return {
    get(): Promise<Set<string>> {
      const uid = me();
      if (kept?.uid !== uid) kept = { uid, ids: ask(uid) };
      return kept.ids;
    },
    know(ids: string[]) {
      kept = { uid: me(), ids: Promise.resolve(new Set(ids)) };
    },
    change(id: string, on: boolean) {
      if (kept?.uid !== me()) return;
      kept.ids = kept.ids.then((ids) => (on ? ids.add(id) : ids.delete(id), ids));
    },
    forget() {
      kept = null;
    },
  };
})();

export async function isLiked({ ids }: { ids: string[] }) {
  const songs = await likedSongs.get();
  const episodes = likedEpisodes();
  return Object.fromEntries(ids.map((id) => [id, songs.has(id) || episodes.has(id)]));
}

export async function like({ id, on }: { id: string; on: boolean }) {
  await api("/api/radio/like", { trackId: id, like: on, alg: "itembased", time: "3" }, SIGNED_IN);
  likedSongs.change(String(id), on);
}

export async function playlists() {
  return myPlaylists(await userPlaylists(), me());
}

// The playlists the signed-in listener made or saved, as NetEase lists them.
async function userPlaylists(): Promise<NPlaylist[]> {
  return list((await api<{ playlist?: NPlaylist[] }>("/api/user/playlist", { uid: me(), limit: 1000 }, SIGNED_IN)).playlist);
}

// ---- Play Reports ----

// Play Reports wait for the listener to turn them on.
const reportPlays = () => host.setting("reportPlays") === "true";

// Sends NetEase a Play Report for a song the app started playing. The app
// doesn't say how long it was heard, so it counts as heard whole.
export async function played({ id }: { id: string }) {
  if (!session() || refOf(id).kind !== "song" || !reportPlays()) return;
  const time = Math.round(((await songDetail(id)).dt ?? 0) / 1000);
  // The Play Report, as one of NetEase's weblog logs.
  const log = { action: "play", json: { id, type: "song", time, end: "playend", source: "list", sourceId: "", download: 0, wifi: 0 } };
  await api("/api/feedback/weblog", { logs: JSON.stringify([log]) }, SIGNED_IN);
}

// ---- Playlist editing ----

export async function createPlaylist({ name }: { name: string }) {
  const body = await api<{ playlist?: NPlaylist }>("/api/playlist/create", { name, privacy: "0", type: "NORMAL" }, SIGNED_IN);
  if (!body.playlist) throw new Error(host.t("NetEase didn't make the playlist."));
  return { ...toPlaylist(body.playlist), mine: true };
}

export async function renamePlaylist({ id, name }: { id: string; name: string }) {
  await api("/api/playlist/update/name", { id, name }, SIGNED_IN);
}

export async function deletePlaylist({ id }: { id: string }) {
  await api("/api/playlist/remove", { ids: JSON.stringify([id]) }, SIGNED_IN);
}

// Changes the songs of playlist id. op is NetEase's: add or del.
async function changeTracks(op: string, id: string, trackIds: string[], options: Options = SIGNED_IN) {
  await api("/api/playlist/manipulate/tracks", { op, pid: id, trackIds: JSON.stringify(trackIds), imme: "true" }, options);
}

// NetEase answers 502 to adding a song the playlist already has.
const ALREADY_THERE = 502;

export async function addToPlaylist({ id, trackIds }: { id: string; trackIds: string[] }) {
  await changeTracks("add", id, trackIds, { ...SIGNED_IN, codes: [ALREADY_THERE] });
}

export async function removeFromPlaylist({ id, trackIds }: { id: string; trackIds: string[] }) {
  await changeTracks("del", id, trackIds);
}

// items with the one at from taken out and put back in at to.
function moved<T>(items: T[], from: number, to: number): T[] {
  const out = items.slice();
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

export async function movePlaylistTrack({ id, from, to }: { id: string; from: number; to: number }) {
  const { ids } = await playlistDetail(id);
  await changeTracks("update", id, moved(ids, from, to));
}

export async function savePlaylist({ id, on }: { id: string; on: boolean }) {
  await api(`/api/playlist/${on ? "subscribe" : "unsubscribe"}`, { id }, SIGNED_IN);
}

export async function saveAlbum({ id, on }: { id: string; on: boolean }) {
  await api(`/api/album/${on ? "sub" : "unsub"}`, { id }, SIGNED_IN);
}

export async function savedAlbums({ offset = 0 }: { offset?: number }) {
  const body = await api<{ data?: NAlbum[]; hasMore?: boolean }>("/api/album/sublist", { offset, limit: PAGE }, SIGNED_IN);
  return { albums: list(body.data).map((a) => ({ ...toAlbum(a), saved: true })), more: !!body.hasMore };
}

// ---- Pages ----

// NetEase's best-known Charts: 飙升, 新歌 and 热歌, and how many songs of each Home shows.
const TOP_CHARTS = ["19723756", "3779629", "3778678"];
const CHART_SONGS = 20;
const NEW_ALBUMS = 12;

async function newAlbums(): Promise<Section> {
  const body = await api<{ albums?: NAlbum[] }>("/api/album/new", { area: "ALL", limit: NEW_ALBUMS });
  return { title: host.t("New Albums"), albums: list(body.albums).map(toAlbum) };
}

export async function home(): Promise<Browse> {
  if (session()) {
    const [daily, picks, albums] = await Promise.all([
      api<{ data?: { dailySongs?: NSong[]; privileges?: NPrivilege[] } }>("/api/v3/discovery/recommend/songs"),
      api<{ recommend?: NPlaylist[] }>("/api/v1/discovery/recommend/resource"),
      newAlbums(),
    ]);
    return {
      title: host.t("Home"),
      sections: [
        { title: host.t("Daily Recommendations"), tracks: tracksFrom(daily.data?.dailySongs, daily.data?.privileges) },
        { title: host.t("Recommended Playlists"), playlists: list(picks.recommend).map(toPlaylist) },
        albums,
      ],
    };
  }
  const charts = await Promise.all(TOP_CHARTS.map((id) => playlist({ id })));
  return {
    title: host.t("Home"),
    sections: [
      ...charts.map((c) => ({ title: c.name, tracks: c.tracks.slice(0, CHART_SONGS) })),
      await newAlbums(),
    ],
  };
}

async function charts(): Promise<Browse> {
  const body = await api<{ list?: NPlaylist[] }>("/api/toplist");
  return {
    title: host.t("Charts"),
    sections: [{ playlists: list(body.list).map((p) => ({ ...toPlaylist(p), description: p.updateFrequency })) }],
  };
}

async function showsAt(path: string, data: Record<string, unknown> = {}): Promise<Show[]> {
  return list((await api<{ djRadios?: NRadio[] }>(path, data)).djRadios).map(toShow);
}

type Shelf = { title: string; load: () => Promise<Show[]> };

// The Podcasts page: the listener's own, when signed in, then NetEase's picks,
// then what's popular. A shelf that's empty or fails is left out; the page
// fails only when every shelf does, or when the sign-in has expired, so the
// app asks for it again.
async function podcasts(): Promise<Browse> {
  const shelves: Shelf[] = [
    ...(session() ? [{ title: "My Subscriptions", load: shows }] : []),
    { title: "Recommended Podcasts", load: () => showsAt("/api/djradio/recommend/v1") },
    { title: "Popular Podcasts", load: () => showsAt("/api/djradio/hot/v1", { offset: 0, limit: PAGE }) },
  ];
  const results = await Promise.allSettled(shelves.map((s) => s.load()));
  const failed = results.filter((r) => r.status === "rejected").map((r) => r.reason);
  const signIn = failed.find((e) => e?.code === "signIn");
  if (signIn) throw signIn;
  if (failed.length === results.length) throw failed[0];
  return {
    title: host.t("Podcasts"),
    sections: results.flatMap((r, i) =>
      r.status === "fulfilled" && r.value.length ? [{ title: host.t(shelves[i].title), shows: r.value }] : [],
    ),
  };
}

const PAGES = new Map<string, () => Promise<Browse>>([
  ["charts", charts],
  ["podcasts", podcasts],
]);

export async function browse({ page }: { page: string }): Promise<Browse> {
  const make = PAGES.get(page);
  if (!make) throw fail("unsupported", "There's no such page.");
  return make();
}
