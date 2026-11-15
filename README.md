# NetEase Cloud Music for MyGo Music

A NetEase Cloud Music plugin for [MyGo Music](https://github.com/egoist/mygo-music). It talks to NetEase directly: no API server or extra programs are needed.

## Install

[Install in MyGo Music](mygo-music://install-plugin?repo=GuMengSama/mygo-music-netease), or add this repository in **Settings > Plugins > +**:

```text
https://github.com/GuMengSama/mygo-music-netease
```

The minimum supported MyGo Music version is listed in [`plugin.json`](plugin.json) as `minAppVersion`.

## Use

- **Sign in:** scan the QR code with the NetEase Cloud Music app.
- **Browse and play:** search with suggestions, albums, artists, playlists, charts, podcasts, lyrics with translations, and comments with Hot Comments first. Signing in adds daily recommendations, your playlists and saved albums, likes, playlist editing, Personal FM and podcast subscriptions.
- **Quality:** follows the player's quality, falling back to lower levels. Turn on **Prefer Hi-Res** to ask for Hi-Res in place of Lossless.
- **Language:** follows MyGo Music's English or Simplified Chinese setting.

Subscription and purchase restrictions still apply. Trial previews are not played as full songs. Session cookies go only to `music.163.com` and `interface.music.163.com`.

## Development

Written in TypeScript, run by MyGo Music as is: there's nothing to build.

```sh
ln -s "$PWD" "<MyGo plugins folder>/netease"   # Settings > Plugins > + > Show Plugins Folder
bun install
bun test
bun run typecheck
```

## Disclaimer

Not affiliated with or endorsed by NetEase. This plugin uses private APIs that may change without notice.
