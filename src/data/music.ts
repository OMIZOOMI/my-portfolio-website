/** Complete, licensed recordings. Playback duration comes from media metadata. */
export type MusicPlaylistId = "lofi" | "upbeat" | "jazz";
export type MusicView = "listen" | "browse" | MusicPlaylistId;
export interface MusicTrack {
  id: string; title: string; artist: string; album: string;
  durationSeconds: number; accent: string; src: string;
  sourceUrl: string; license: string; licenseUrl: string; credit: string;
  genre: "lo-fi" | "electronic" | "acoustic" | "jazz";
  playlist: MusicPlaylistId;
}
export const MUSIC_PLAYLISTS: {id: MusicPlaylistId; label: string; description: string; accent: string}[] = [
  {id:"lofi", label:"LOFI slow reverb beats", description:"Unhurried drums, warm textures, room to think.", accent:"#9c8caa"},
  {id:"upbeat", label:"Upbeat", description:"A little momentum. Bright instrumentals for an engaged mood.", accent:"#c49876"},
  {id:"jazz", label:"Saxophone / Jazz", description:"Sax melodies, easy grooves, a slower kind of evening.", accent:"#8d9fb1"},
];
export const TOP_TRACK_IDS = ["roof-tops", "night-in-venice", "cipher", "summer-felt-longer-then"];
export const MUSIC_TRACKS: MusicTrack[] = [
  {
    "id": "roof-tops",
    "title": "Roof Tops",
    "artist": "HoliznaCC0",
    "album": "Summer Air ( Lo-fi )",
    "durationSeconds": 214.440998,
    "accent": "#b48a75",
    "src": "/music/roof-tops.mp3",
    "sourceUrl": "https://freemusicarchive.org/music/holiznacc0/summer-air-lo-fi/roof-tops/",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "credit": "“Roof Tops” by HoliznaCC0. Licensed under CC0 1.0. Re-encoded for web playback with constant gain adjustment; complete instrumental recording, original speed.",
    "genre": "lo-fi",
    "playlist": "lofi"
  },
  {
    "id": "summer-felt-longer-then",
    "title": "Summer Felt Longer Then",
    "artist": "HoliznaCC0",
    "album": "Summer Air ( Lo-fi )",
    "durationSeconds": 227.952993,
    "accent": "#9c94b2",
    "src": "/music/summer-felt-longer-then.mp3",
    "sourceUrl": "https://freemusicarchive.org/music/holiznacc0/summer-air-lo-fi/summer-felt-longer-then/",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "credit": "“Summer Felt Longer Then” by HoliznaCC0. Licensed under CC0 1.0. Re-encoded for web playback with constant gain adjustment; complete instrumental recording, original speed.",
    "genre": "lo-fi",
    "playlist": "lofi"
  },
  {
    "id": "transformations-2",
    "title": "Transformations 2",
    "artist": "HoliznaCC0",
    "album": "Transformations",
    "durationSeconds": 235.104014,
    "accent": "#9aab9b",
    "src": "/music/transformations-2.mp3",
    "sourceUrl": "https://freemusicarchive.org/music/holiznacc0/transformations/transformations-2/",
    "license": "CC0 1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
    "credit": "“Transformations 2” by HoliznaCC0. Licensed under CC0 1.0. Re-encoded for web playback with constant gain adjustment; complete instrumental recording, original speed.",
    "genre": "lo-fi",
    "playlist": "lofi"
  },
  {
    "id": "cipher",
    "title": "Cipher",
    "artist": "Kevin MacLeod",
    "album": "Incompetech",
    "durationSeconds": 231.262041,
    "accent": "#c58e86",
    "src": "/music/cipher.mp3",
    "sourceUrl": "https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100844",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "“Cipher” by Kevin MacLeod (incompetech.com). Licensed under CC BY 4.0. Re-encoded for web playback with constant gain adjustment; complete instrumental recording, original speed.",
    "genre": "electronic",
    "playlist": "upbeat"
  },
  {
    "id": "electro-cabello",
    "title": "Electro Cabello",
    "artist": "Kevin MacLeod",
    "album": "Incompetech",
    "durationSeconds": 190.82449,
    "accent": "#cfaf73",
    "src": "/music/electro-cabello.mp3",
    "sourceUrl": "https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1400048",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "“Electro Cabello” by Kevin MacLeod (incompetech.com). Licensed under CC BY 4.0. Re-encoded for web playback with constant gain adjustment; complete instrumental recording, original speed.",
    "genre": "electronic",
    "playlist": "upbeat"
  },
  {
    "id": "life-of-riley",
    "title": "Life of Riley",
    "artist": "Kevin MacLeod",
    "album": "Incompetech",
    "durationSeconds": 235.363265,
    "accent": "#8aaa9d",
    "src": "/music/life-of-riley.mp3",
    "sourceUrl": "https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1400054",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "“Life of Riley” by Kevin MacLeod (incompetech.com). Licensed under CC BY 4.0. Re-encoded for web playback with constant gain adjustment; complete instrumental recording, original speed.",
    "genre": "acoustic",
    "playlist": "upbeat"
  },
  {
    "id": "night-in-venice",
    "title": "Night in Venice",
    "artist": "Kevin MacLeod",
    "album": "Incompetech",
    "durationSeconds": 218.148571,
    "accent": "#8a9bb5",
    "src": "/music/night-in-venice.mp3",
    "sourceUrl": "https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1900056",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "“Night in Venice” by Kevin MacLeod (incompetech.com). Licensed under CC BY 4.0. Re-encoded for web playback with constant gain adjustment; complete instrumental recording, original speed.",
    "genre": "jazz",
    "playlist": "jazz"
  },
  {
    "id": "study-and-relax",
    "title": "Study And Relax",
    "artist": "Kevin MacLeod",
    "album": "Incompetech",
    "durationSeconds": 223.399184,
    "accent": "#b4938f",
    "src": "/music/study-and-relax.mp3",
    "sourceUrl": "https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1900030",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "“Study And Relax” by Kevin MacLeod (incompetech.com). Licensed under CC BY 4.0. Re-encoded for web playback with constant gain adjustment; complete instrumental recording, original speed.",
    "genre": "jazz",
    "playlist": "jazz"
  },
  {
    "id": "just-as-soon",
    "title": "Just As Soon",
    "artist": "Kevin MacLeod",
    "album": "Incompetech",
    "durationSeconds": 228.101224,
    "accent": "#a6a17d",
    "src": "/music/just-as-soon.mp3",
    "sourceUrl": "https://incompetech.com/music/royalty-free/index.html?Search=Search&isrc=USUAN1100185",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    "credit": "“Just As Soon” by Kevin MacLeod (incompetech.com). Licensed under CC BY 4.0. Re-encoded for web playback with constant gain adjustment; complete instrumental recording, original speed.",
    "genre": "jazz",
    "playlist": "jazz"
  }
];

export function musicTracksForView(view: MusicView, query = "") {
  const collection = view === "listen" ? TOP_TRACK_IDS.map(id => MUSIC_TRACKS.find(track => track.id === id)!)
    : view === "browse" ? MUSIC_TRACKS : MUSIC_TRACKS.filter(track => track.playlist === view);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return collection.filter(track => {
    const text = `${track.title} ${track.artist} ${track.genre} ${MUSIC_PLAYLISTS.find(playlist => playlist.id === track.playlist)?.label}`.toLowerCase();
    return words.every(word => text.includes(word));
  });
}
