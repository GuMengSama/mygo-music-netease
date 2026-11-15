// NetEase Cloud Music for MyGo Music. Talks to NetEase's eapi directly, with
// no server in between.

declare const host: any;

// The app's shapes, as internal/music/music.go names them in JSON.
type Section = {
  title?: string;
  tracks?: any[];
  albums?: any[];
  playlists?: any[];
  shows?: any[];
  stations?: any[];
  morePage?: string;
  empty?: string;
};
type Browse = { title?: string; subtitle?: string; sections: Section[] };

const EAPI_KEY = "e82ckenh8dichen8";

// What eapi wants posted as params for a request to path with text as its body.
export function eapiParams(path: string, text: string): string {
  const digest = host.crypto.md5(`nobody${path}use${text}md5forencrypt`);
  const message = `${path}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return String(host.crypto.aesEcbEncrypt(EAPI_KEY, message)).toUpperCase();
}

// NetEase's Quality Levels, lowest first.
const LEVELS = ["standard", "higher", "exhigh", "lossless", "hires"];
const LEVEL_FOR_QUALITY: Record<string, string> = { standard: "standard", high: "exhigh", lossless: "lossless" };

// The levels to try for the app's quality, best first: the one asked for, then
// each below it. Prefer Hi-Res puts Hi-Res above Lossless.
export function levelsFor(quality: string, preferHiRes: boolean): string[] {
  let top = LEVEL_FOR_QUALITY[quality] ?? "exhigh";
  if (top === "lossless" && preferHiRes) top = "hires";
  return LEVELS.slice(0, LEVELS.indexOf(top) + 1).reverse();
}

// An image the app asks for at the size it shows it, from NetEase's CDN.
export function imageOf(url?: string): string | undefined {
  if (!url) return undefined;
  return `${url.replace(/^http:/, "https:")}?param={size}y{size}`;
}

// A list NetEase sent, or none when it left it out.
export function list(x: any): any[] {
  return Array.isArray(x) ? x : [];
}

// Text NetEase sent, or none when it left it out.
export function text(x: any): string {
  return typeof x === "string" ? x : "";
}

function toArtistRef(a: any) {
  return { id: String(a.id), name: text(a.name) };
}

// A Track from a song in either of NetEase's shapes, with the privilege that
// says whether the listener can play it, if NetEase sent one.
export function toTrack(song: any, privilege: any = song.privilege) {
  const track: any = {
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
function albumRefOf(al: any) {
  return compact({ id: String(al.id ?? ""), name: text(al.name), imageUrl: imageOf(al.picUrl) });
}

// Whether a privilege lets the listener play the song: one that's delisted, or
// that the account can't play at any level, is Unavailable. No privilege says
// nothing either way.
function playable(privilege: any): boolean {
  return !privilege || (privilege.st >= 0 && privilege.pl !== 0);
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 NeteaseMusicDesktop/3.1.17.204416";

// What NetEase expects of every request, the app's for audio as well.
const WEB_HEADERS = { "user-agent": UA, referer: "https://music.163.com/" };

// An error the app knows what to do with, by its code.
function fail(code: string, message: string): Error {
  const error: any = new Error(host.t(message));
  error.code = code;
  return error;
}

const APP_QUALITY: Record<string, string> = { hires: "lossless", lossless: "lossless", exhigh: "high" };

// What the app plays for one item of NetEase's song URLs, or null when there's
// no whole song at this level: no URL, or only a Trial Clip.
export function streamOf(item: any) {
  if (!item?.url || item.freeTrialInfo) return null;
  return {
    url: String(item.url),
    type: String(item.type || "mp3").toLowerCase(),
    quality: APP_QUALITY[item.level] ?? "standard",
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

function compact<T extends Record<string, any>>(o: T): Partial<T> {
  for (const k of Object.keys(o)) if (o[k] == null || o[k] === "") delete o[k];
  return o;
}

export function toAlbum(a: any) {
  return compact({
    id: String(a.id),
    name: text(a.name),
    imageUrl: imageOf(a.picUrl ?? a.blurPicUrl),
    artists: (a.artists ?? (a.artist ? [a.artist] : [])).map(toArtistRef),
    released: dateOf(a.publishTime),
  });
}

export function toArtist(a: any) {
  return compact({ id: String(a.id), name: text(a.name), imageUrl: imageOf(a.picUrl ?? a.img1v1Url) });
}

export function toPlaylist(p: any) {
  return compact({
    id: String(p.id),
    name: text(p.name),
    owner: p.creator?.nickname,
    trackCount: p.trackCount,
    imageUrl: imageOf(p.coverImgUrl ?? p.picUrl),
    description: p.description,
  });
}

// Liked Songs is NetEase's playlist of special type 5.
const isLikedSongs = (p: any) => p.specialType === 5;

// The listener's playlists, theirs or saved. Liked Songs is theirs, but kept
// by NetEase.
export function myPlaylists(list: any[], me: string) {
  return list.map((p) => {
    const pl: any = toPlaylist(p);
    if (String(p.creator?.userId) === me) {
      pl.mine = true;
      if (isLikedSongs(p)) pl.fixed = true;
    } else pl.saved = true;
    return pl;
  });
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
  let id = host.storage.get("deviceId");
  if (!id) {
    id = host.crypto.md5(`mygo-music-netease:${Date.now()}:${Math.random()}`);
    host.storage.set("deviceId", id);
  }
  return id;
}

type Session = { cookie: string; account: { id: string; name: string; imageUrl?: string } };
const session = (): Session | null => host.storage.get("session") ?? null;
let likedIds: Set<string> | null = null;

function forget() {
  host.storage.remove("session");
  likedIds = null;
}

type Options = { cookie?: string; codes?: number[]; signedIn?: boolean };

// Whose cookies a request goes with: the Session's, which NetEase may renew or
// end, or those of a sign-in still under way, which belong to no Session yet.
function cookiesFor(options: Options): { cookies: Record<string, string>; session: Session | null } {
  if (options.cookie !== undefined) return { cookies: cookieMap(options.cookie), session: null };
  const s = session();
  if (options.signedIn && !s) throw fail("signIn", "Sign in to NetEase Cloud Music first.");
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
async function post(path: string, data: Record<string, any>, cookies: Record<string, string>): Promise<Response> {
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
function check(body: any, options: Options, s: Session | null) {
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

function messageOf(body: any): string {
  return body.message ?? body.msg ?? host.t("NetEase answered with an error.");
}

// NetEase renews the Session's cookies as it goes; keep what it sends.
function renew(s: Session | null, cookie: string) {
  if (!s || !cookie) return;
  host.storage.set("session", { ...s, cookie: cookieText({ ...cookieMap(s.cookie), ...cookieMap(cookie) }) });
}

// One eapi request, answering its JSON and the cookies NetEase set with it.
async function call(path: string, data: Record<string, any> = {}, options: Options = {}) {
  const { cookies, session: s } = cookiesFor(options);
  const res = await post(path, data, cookies);
  if (!res.ok) throw new Error(`${host.t("NetEase couldn't answer.")} (HTTP ${res.status})`);
  const body: any = await res.json();
  check(body, options, s);
  const cookie = setCookies(res.headers);
  renew(s, cookie);
  return { body, cookie };
}

const api = async (path: string, data?: Record<string, any>, options?: Options) =>
  (await call(path, data, options)).body;

const me = () => text(session()?.account.id);

// The privileges NetEase sent beside songs, by song id.
function privilegesOf(list: any[] = []): Map<string, any> {
  return new Map(list.map((p) => [String(p.id), p]));
}

// Tracks for songs, each with its privilege from beside it or inside it.
function tracksFrom(songs: any[] = [], privileges: any[] = []) {
  const byId = privilegesOf(privileges);
  return songs.map((s) => toTrack(s, byId.get(String(s.id)) ?? s.privilege));
}

// Tracks for song ids, with their privileges, a few hundred at a time.
async function tracksOf(ids: string[]) {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500);
    const body = await api("/api/v3/song/detail", { c: JSON.stringify(batch.map((id) => ({ id }))) });
    out.push(...tracksFrom(body.songs, body.privileges));
  }
  return out;
}

// ---- Account ----

export async function signIn() {
  const unikey = (await api("/api/login/qrcode/unikey", { type: 3 }, { cookie: "" })).unikey;
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
    const { body, cookie } = await call(
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
  const profile = cookieMap(jar).MUSIC_U && (await api("/api/w/nuser/account/get", {}, { cookie: jar })).profile;
  if (!profile) throw fail("signIn", "NetEase didn't finish signing in. Try again.");
  const account = compact({ id: String(profile.userId), name: text(profile.nickname), imageUrl: imageOf(profile.avatarUrl) });
  host.storage.set("session", { cookie: jar, account });
  likedIds = null;
  return account;
}

export function signOut() {
  forget();
}

export function account() {
  return session()?.account ?? null;
}

// ---- Catalog ----

type SearchType = { code: number; field: string; countField: string; map: (x: any) => any };
const SEARCH_TYPES: Record<string, SearchType> = {
  tracks: { code: 1, field: "songs", countField: "songCount", map: (s) => toTrack(s) },
  albums: { code: 10, field: "albums", countField: "albumCount", map: toAlbum },
  artists: { code: 100, field: "artists", countField: "artistCount", map: toArtist },
  playlists: { code: 1000, field: "playlists", countField: "playlistCount", map: toPlaylist },
};

export async function search({ query, kind, offset = 0 }: { query: string; kind: string; offset?: number }) {
  const type = SEARCH_TYPES[kind];
  if (!type) throw fail("unsupported", "NetEase search doesn't do this.");
  const { code, field, countField, map } = type;
  const result = (await api("/api/cloudsearch/pc", { s: query, type: code, limit: PAGE, offset, total: true })).result ?? {};
  const items = list(result[field]).map(map);
  return { [kind]: items, more: offset + items.length < (result[countField] ?? 0) };
}

export async function album({ id }: { id: string }) {
  const body = await api(`/api/v1/album/${id}`);
  const songs = list(body.songs);
  // The album's songs are cut short of its cover; give them the album's.
  const cover = body.album?.picUrl;
  return {
    album: toAlbum(body.album ?? { id }),
    tracks: songs.map((s: any) => toTrack({ ...s, al: { ...(s.al ?? {}), picUrl: s.al?.picUrl ?? cover } })),
  };
}

export async function artist({ id }: { id: string }) {
  const [info, albums] = await Promise.all([
    api(`/api/v1/artist/${id}`),
    api(`/api/artist/albums/${id}`, { limit: 100 }),
  ]);
  return {
    artist: toArtist(info.artist ?? { id }),
    tracks: tracksFrom(info.hotSongs),
    albums: list(albums.hotAlbums).map(toAlbum),
  };
}

export async function playlist({ id }: { id: string }) {
  const body = await api("/api/v6/playlist/detail", { id, n: 100000, s: 8 });
  const p = body.playlist ?? {};
  const tracks = tracksFrom(p.tracks, body.privileges);
  // NetEase sends the first thousand or so songs whole, and only ids after.
  const ids = list(p.trackIds).map((t: any) => String(t.id));
  tracks.push(...(await tracksOf(ids.slice(tracks.length))));
  const out: any = { ...toPlaylist(p), tracks };
  if (me() && String(p.creator?.userId) === me()) {
    out.mine = true;
    if (isLikedSongs(p)) {
      out.fixed = true;
      // Opening Liked Songs picks up songs liked elsewhere, as on the phone.
      likedIds = new Set(ids);
    }
  } else if (p.subscribed) out.saved = true;
  return out;
}

export async function lyrics({ id }: { id: string }) {
  const body = await api("/api/song/lyric", { id, lv: -1, tv: -1 });
  return compact({ lrc: body.lrc?.lyric, translation: body.tlyric?.lyric });
}

export async function stream({ id, quality }: { id: string; quality: string }) {
  for (const level of levelsFor(quality, host.setting("preferHiRes") === "true")) {
    const body = await api("/api/song/enhance/player/url/v1", { ids: JSON.stringify([id]), level, encodeType: "flac" });
    const s = streamOf(list(body.data).find((x: any) => String(x.id) === String(id)));
    if (s) return s;
  }
  throw fail("unavailable", "NetEase won't play this song for this account here.");
}

// ---- Library ----

async function likedSet(): Promise<Set<string>> {
  if (!likedIds) {
    const body = await api("/api/song/like/get", { uid: me() }, { signedIn: true });
    likedIds = new Set(list(body.ids).map(String));
  }
  return likedIds;
}

export async function isLiked({ ids }: { ids: string[] }) {
  const set = await likedSet();
  return Object.fromEntries(ids.map((id) => [id, set.has(String(id))]));
}

export async function like({ id, on }: { id: string; on: boolean }) {
  await api("/api/radio/like", { trackId: id, like: on, alg: "itembased", time: "3" }, { signedIn: true });
  if (likedIds) {
    // NetEase lists the newest first.
    likedIds.delete(String(id));
    if (on) likedIds = new Set([String(id), ...likedIds]);
  }
}

export async function playlists() {
  const body = await api("/api/user/playlist", { uid: me(), limit: 1000 }, { signedIn: true });
  return myPlaylists(list(body.playlist), me());
}

export async function saveAlbum({ id, on }: { id: string; on: boolean }) {
  await api(`/api/album/${on ? "sub" : "unsub"}`, { id }, { signedIn: true });
}

export async function savedAlbums({ offset = 0 }: { offset?: number }) {
  const body = await api("/api/album/sublist", { offset, limit: PAGE }, { signedIn: true });
  return { albums: list(body.data).map((a: any) => ({ ...toAlbum(a), saved: true })), more: !!body.hasMore };
}

// ---- Pages ----

// NetEase's best-known Charts: 飙升, 新歌 and 热歌.
const TOP_CHARTS = ["19723756", "3779629", "3778678"];

async function newAlbums(): Promise<Section> {
  const body = await api("/api/album/new", { area: "ALL", limit: 12 });
  return { title: host.t("New Albums"), albums: list(body.albums).map(toAlbum) };
}

export async function home(): Promise<Browse> {
  if (session()) {
    const [daily, picks, albums] = await Promise.all([
      api("/api/v3/discovery/recommend/songs"),
      api("/api/v1/discovery/recommend/resource"),
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
      ...charts.map((c) => ({ title: c.name, tracks: c.tracks.slice(0, 20) })),
      await newAlbums(),
    ],
  };
}

export async function browse({ page }: { page: string }): Promise<Browse> {
  if (page !== "charts") throw fail("unsupported", "There's no such page.");
  const body = await api("/api/toplist");
  return {
    title: host.t("Charts"),
    sections: [{ playlists: list(body.list).map((p: any) => ({ ...toPlaylist(p), description: p.updateFrequency })) }],
  };
}
