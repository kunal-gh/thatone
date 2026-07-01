import { useCallback, useRef, useState } from "react";
import type { CatalogItem } from "../shared/types";

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/";

type PosterSize = "w92" | "w154" | "w185" | "w342" | "w500" | "w780" | "original";

type PosterCardProps = {
  /** Catalog item to display */
  item: CatalogItem;
  /** Poster image size (default: w342) */
  size?: PosterSize;
  /** Score percentage (0-100) to display as badge */
  score?: number;
  /** Whether the card is in a compact layout */
  compact?: boolean;
  /** Callback when the card poster area is clicked */
  onClick?: (item: CatalogItem) => void;
  /** Action buttons to render in the hover overlay */
  actions?: React.ReactNode;
  /** Additional class names */
  className?: string;
};

function getPosterUrl(posterPath: string | null | undefined, size: PosterSize): string | null {
  if (!posterPath) return null;
  return `${TMDB_IMAGE_BASE}${size}${posterPath}`;
}

function getScoreColor(score: number): string {
  if (score >= 75) return "var(--success)";
  if (score >= 55) return "var(--warning)";
  return "var(--danger)";
}

function getScoreLabel(score: number): string {
  if (score >= 75) return "Strong";
  if (score >= 55) return "Good";
  return "Explore";
}

/**
 * PosterCard — reusable card component with TMDB poster image,
 * lazy loading, error fallback, score badge, and hover action overlay.
 */
export function PosterCard({
  item,
  size = "w342",
  score,
  compact = false,
  onClick,
  actions,
  className = ""
}: PosterCardProps) {
  const [imageState, setImageState] = useState<"loading" | "loaded" | "error">("loading");
  const imgRef = useRef<HTMLImageElement>(null);
  const posterUrl = getPosterUrl(item.poster_path, size);

  const handleLoad = useCallback(() => setImageState("loaded"), []);
  const handleError = useCallback(() => setImageState("error"), []);
  const handleClick = useCallback(() => onClick?.(item), [onClick, item]);

  const year = item.year ?? item.release_date?.slice(0, 4) ?? "";
  const rating = item.vote_average ?? item.imdb_rating;
  const genres = item.genres?.slice(0, compact ? 2 : 3) ?? [];

  return (
    <div
      className={`poster-card ${compact ? "poster-card--compact" : ""} ${className}`}
      onClick={handleClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* Poster Image */}
      <div className="poster-card__image-wrap">
        {imageState === "loading" && (
          <div className="poster-card__skeleton skeleton" />
        )}

        {posterUrl && imageState !== "error" ? (
          <img
            ref={imgRef}
            src={posterUrl}
            alt={item.title}
            className={`poster-card__img ${imageState === "loaded" ? "poster-card__img--loaded" : ""}`}
            loading="lazy"
            decoding="async"
            onLoad={handleLoad}
            onError={handleError}
          />
        ) : (
          <div className="poster-card__fallback">
            <span className="poster-card__fallback-icon">🎬</span>
            <span className="poster-card__fallback-title">{item.title}</span>
          </div>
        )}

        {/* Gradient overlay for text readability */}
        <div className="poster-card__gradient" />

        {/* Score badge */}
        {typeof score === "number" && (
          <div
            className="score-badge"
            style={{
              "--score-color": getScoreColor(score)
            } as React.CSSProperties}
            title={`${getScoreLabel(score)} match (${score}%)`}
          >
            <svg className="score-badge__ring" viewBox="0 0 36 36">
              <circle
                className="score-badge__ring-bg"
                cx="18" cy="18" r="15.5"
                fill="none"
                strokeWidth="3"
              />
              <circle
                className="score-badge__ring-fill"
                cx="18" cy="18" r="15.5"
                fill="none"
                strokeWidth="3"
                strokeDasharray={`${score} ${100 - score}`}
                strokeDashoffset="25"
                strokeLinecap="round"
              />
            </svg>
            <span className="score-badge__value">{score}</span>
          </div>
        )}

        {/* Rating star (from TMDB/IMDb) */}
        {typeof rating === "number" && rating > 0 && (
          <div className="poster-card__rating">
            ★ {rating.toFixed(1)}
          </div>
        )}

        {/* Hover actions overlay */}
        {actions && (
          <div className="poster-card__actions">
            {actions}
          </div>
        )}
      </div>

      {/* Card info below poster */}
      <div className="poster-card__info">
        <h3 className="poster-card__title" title={item.title}>{item.title}</h3>
        <div className="poster-card__meta">
          {year && <span>{year}</span>}
          {item.type && <span className="poster-card__type">{item.type}</span>}
          {item.language && <span>{item.language.toUpperCase()}</span>}
        </div>
        {genres.length > 0 && (
          <div className="poster-card__genres">
            {genres.map((genre) => (
              <span key={genre} className="genre-tag">{genre}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * PosterCardActions — preset action button layout for poster cards.
 */
export function PosterCardActions({
  onHide,
  onWatched,
  onLater,
  onOpen,
  showOpen = true
}: {
  onHide?: () => void;
  onWatched?: () => void;
  onLater?: () => void;
  onOpen?: () => void;
  showOpen?: boolean;
}) {
  return (
    <div className="poster-card__action-buttons">
      {showOpen && onOpen && (
        <button className="btn btn-icon btn-ghost" onClick={(e) => { e.stopPropagation(); onOpen(); }} title="Open on JioHotstar">
          ▶
        </button>
      )}
      {onLater && (
        <button className="btn btn-icon btn-later" onClick={(e) => { e.stopPropagation(); onLater(); }} title="Watch Later">
          +
        </button>
      )}
      {onWatched && (
        <button className="btn btn-icon btn-watched" onClick={(e) => { e.stopPropagation(); onWatched(); }} title="Mark as Watched">
          ✓
        </button>
      )}
      {onHide && (
        <button className="btn btn-icon btn-hide" onClick={(e) => { e.stopPropagation(); onHide(); }} title="Hide">
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * DeckCard — large format card for the swipe deck with poster background.
 */
export function DeckCard({
  item,
  style,
  children
}: {
  item: CatalogItem;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const posterUrl = getPosterUrl(item.poster_path, "w500");
  const year = item.year ?? item.release_date?.slice(0, 4) ?? "";
  const rating = item.vote_average ?? item.imdb_rating;
  const overview = item.overview?.slice(0, 280) ?? "";
  const genres = item.genres?.slice(0, 4) ?? [];
  const cast = item.cast?.slice(0, 4) ?? [];

  return (
    <div className="deck-card" style={style}>
      {posterUrl && (
        <img
          className="deck-card__poster"
          src={posterUrl}
          alt={item.title}
          loading="eager"
          decoding="async"
        />
      )}
      <div className="deck-card__overlay" />
      <div className="deck-card__content">
        <div className="deck-card__meta-top">
          {item.type && <span className="genre-tag genre-tag--accent">{item.type}</span>}
          {year && <span className="genre-tag">{year}</span>}
          {item.language && <span className="genre-tag">{item.language.toUpperCase()}</span>}
          {typeof rating === "number" && rating > 0 && (
            <span className="genre-tag genre-tag--gold">★ {rating.toFixed(1)}</span>
          )}
        </div>
        <h2 className="deck-card__title">{item.title}</h2>
        {overview && <p className="deck-card__overview">{overview}</p>}
        {genres.length > 0 && (
          <div className="deck-card__genres">
            {genres.map((g) => <span key={g} className="genre-tag">{g}</span>)}
          </div>
        )}
        {cast.length > 0 && (
          <div className="deck-card__cast">
            {cast.join(" · ")}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
