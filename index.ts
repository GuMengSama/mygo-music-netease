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
type Section = { title?: string; tracks?: Track[]; albums?: Album[]; playlists?: Playlist[] };
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
  if (!playable(privilege)) track.unavailable = true;
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
  throw fail("unavailable", "NetEase won't play this song for this account here.");
}

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
  const body = await api<{ playlist?: NPlaylist[] }>("/api/user/playlist", { uid: me(), limit: 1000 }, SIGNED_IN);
  return myPlaylists(list(body.playlist), me());
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

export async function browse({ page }: { page: string }): Promise<Browse> {
  if (page !== "charts") throw fail("unsupported", "There's no such page.");
  const body = await api<{ list?: NPlaylist[] }>("/api/toplist");
  return {
    title: host.t("Charts"),
    sections: [{ playlists: list(body.list).map((p) => ({ ...toPlaylist(p), description: p.updateFrequency })) }],
  };
}
