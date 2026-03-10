export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_CURRENT_PLAYBACK_URL =
  "https://api.spotify.com/v1/me/player/currently-playing";

export interface SpotifyTokenRecord {
	accessToken: string;
	expiresAt: number;
}

export type SpotifySimpleArtist = {
  external_urls: {
    spotify: string;
  };
  href: string;
  id: string;
  name: string;
  type: "artist";
  uri: string;
};

export type SpotifyAlbum = {
  album_type: "album" | "single" | "compilation";
  total_tracks: number;
  available_markets: string[];
  external_urls: {
    spotify: string;
  };
  href: string;
  id: string;
  images: {
    height: number;
    url: string;
    width: number;
  }[];
  name: string;
  release_date: string;
  release_date_precision: "year" | "month" | "day";
  restrictions?: {
    reason: "market" | "product" | "explicit";
  };
  type: "album";
  uri: string;
  artists: SpotifySimpleArtist[];
};

export type SpotifyShow = {
  available_markets: string[];
  copyrights: {
    text: string;
    type: string;
  }[];
  description: string;
  html_description: string;
  explicit: boolean;
  external_urls: {
    spotify: string;
  };
  href: string;
  id: string;
  images: {
    height: number;
    url: string;
    width: number;
  }[];
  is_externally_hosted: boolean;
  languages: string[];
  media_type: string;
  name: string;
  publisher: string;
  type: "show";
  uri: string;
  total_episodes: number;
};

export type SpotifyTrack = {
  album: SpotifyAlbum;
  artists: SpotifySimpleArtist[];
  available_markets: string[];
  disc_number: number;
  duration_ms: number;
  explicit: boolean;
  external_ids: {
    isrc?: string;
    ean?: string;
    upc?: string;
  };
  external_urls: {
    spotify: string;
  };
  id: string;
  is_playable: boolean;
  linked_from?: {};
  restrictions?: {
    reason: "market" | "product" | "explicit" | (string & {});
  };
  name: string;
  popularity: number;
  preview_url: string | null;
  track_number: number;
  type: "track";
  uri: string;
  is_local: boolean;
};

export type SpotifyEpisode = {
  audio_preview_url: string | null;
  description: string;
  html_description: string;
  duration_ms: number;
  explicit: boolean;
  external_urls: {
    spotify: string;
  };
  href: string;
  id: string;
  images: {
    height: number;
    url: string;
    width: number;
  }[];
  is_externally_hosted: boolean;
  is_playable: boolean;
  language: string;
  languages: string[];
  name: string;
  release_date: string;
  release_date_precision: "year" | "month" | "day";
  resume_point: {
    fully_played: boolean;
    resume_position_ms: number;
  };
  type: "episode";
  uri: string;
  restrictions?: {
    reason: "market" | "product" | "explicit" | (string & {});
  };
};

export type CurrentlyPlayingResponse = {
  device: {
    id: string | null;
    is_active: boolean;
    is_private_session: boolean;
    is_restricted: boolean;
    name: string;
    type: string;
    volume_percent: number;
  };
  repeat_state: "off" | "track" | "context";
  shuffle_state: boolean;
  context: {
    type: string;
    href: string;
    external_urls: {
      spotify: string;
    };
    uri: string;
  };
  timestamp: number;
  progress_ms: number;
  item: SpotifyTrack | SpotifyEpisode | null;
  currently_playing_type: "track" | "episode" | "ad" | "unknown";
  actions: {
    interrupting_playback: boolean;
    pausing: boolean;
    resuming: boolean;
    seeking: boolean;
    skipping_next: boolean;
    skipping_prev: boolean;
    toggline_repeat_context: boolean;
    toggline_repeat_track: boolean;
    toggline_shuffle: boolean;
    transferring_playback: boolean;
  };
};

export type EcholotlSpotifyPlayback = Omit<CurrentlyPlayingResponse, "actions" | "device" | "repeat_state" | "shuffle_state" | "context">;