# Preset character avatars

The default reuses `../../assets/logo.png`. Other images are original, unchanged
portraits from the studio's existing animation projects:

- Raccoon, Beaver, Seagull: `Drunk-Yeti-Series-Expansion-Godot.zip`,
  `Drunk-Yeti-Series-Studio/expansion/assets/{raccoon,beaver,gull}/00.png`.
- Fox, Otter, Owl: `Drunk-Yeti-Series-Studio-v2-Godot.zip`,
  `Drunk-Yeti-Series-Studio/expansion/assets/{fox,otter,owl}/00.png`.
- Fox was also verified against `3ichael7ambert/DrunkYetiBuddy/assets/fox-sheet.png`
  in `Drunk-Yeti-Buddy-v1.1-Preview4-Source-with-Git.zip`.

These are shared static website files, not per-player uploads. The database stores
only `avatar_id`. No Storage bucket or upload endpoint is used. The catalog in
`../src/avatars.js` and database constraint must be updated together when adding
characters. Unknown client-side values fall back to the studio logo; unknown
values are rejected by the database. Creative rights remain with their holders.

Apply `../migrations/20261025_preset_avatars.sql` before deploying the new client.
The old four-argument profile RPC remains compatible and preserves avatar choice.

Dark Yeti and Blush Yeti are paid character avatars; see `../CHARACTER-THEMES.md`. Their catalog is delivered by the backend manifest, not the free fallback list.
