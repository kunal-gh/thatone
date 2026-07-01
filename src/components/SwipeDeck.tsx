import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogItem, ItemState } from "../shared/types";
import { DeckCard } from "./PosterCard";

type SwipeDirection = "left" | "right" | "up" | "none";

type SwipeDeckProps = {
  items: CatalogItem[];
  onAction: (item: CatalogItem, action: ItemState) => void;
  onSkip?: (item: CatalogItem) => void;
};

const SWIPE_THRESHOLD = 80;    // px — minimum drag to trigger
const THROW_VELOCITY = 0.4;    // px/ms — fast swipe triggers too
const ROTATION_FACTOR = 0.08;  // degrees per px of drag
const MAX_ROTATION = 12;       // clamp rotation

function getDirectionFromDelta(dx: number, dy: number): SwipeDirection {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) return "none";

  // Up swipe takes priority when vertical movement dominates
  if (dy < -SWIPE_THRESHOLD && absDy > absDx * 0.7) return "up";
  if (dx < -SWIPE_THRESHOLD) return "left";
  if (dx > SWIPE_THRESHOLD) return "right";

  return "none";
}

function getActionFromDirection(dir: SwipeDirection): ItemState | null {
  switch (dir) {
    case "left": return "hidden";
    case "right": return "watched";
    case "up": return "watch_later";
    default: return null;
  }
}

function getDirectionLabel(dir: SwipeDirection): string {
  switch (dir) {
    case "left": return "HIDE";
    case "right": return "WATCHED";
    case "up": return "SAVE";
    default: return "";
  }
}

function getDirectionColor(dir: SwipeDirection): string {
  switch (dir) {
    case "left": return "var(--danger)";
    case "right": return "var(--success)";
    case "up": return "var(--info)";
    default: return "transparent";
  }
}

/**
 * SwipeDeck — Tinder-style card stack with pointer drag gestures.
 *
 * - Drag left → Hide
 * - Drag right → Watched
 * - Drag up → Watch Later
 * - Spring-back animation on insufficient drag
 * - Throw-away animation on successful swipe
 */
export function SwipeDeck({ items, onAction, onSkip }: SwipeDeckProps) {
  const [cursor, setCursor] = useState(0);
  const [dragState, setDragState] = useState({ x: 0, y: 0, active: false });
  const [exiting, setExiting] = useState(false);
  const [exitDir, setExitDir] = useState<SwipeDirection>("none");

  const startPos = useRef({ x: 0, y: 0, time: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const currentItem = items[cursor] ?? null;
  const nextItem = items[cursor + 1] ?? null;

  // Inferred direction while dragging
  const inferredDir = dragState.active
    ? getDirectionFromDelta(dragState.x, dragState.y)
    : "none";

  const handleAction = useCallback((item: CatalogItem, action: ItemState) => {
    onAction(item, action);
  }, [onAction]);

  const triggerSwipe = useCallback((direction: SwipeDirection) => {
    if (!currentItem || exiting) return;

    const action = getActionFromDirection(direction);
    if (!action) return;

    setExitDir(direction);
    setExiting(true);

    // Allow exit animation to play
    setTimeout(() => {
      handleAction(currentItem, action);
      setCursor((c) => c + 1);
      setExiting(false);
      setExitDir("none");
      setDragState({ x: 0, y: 0, active: false });
    }, 300);
  }, [currentItem, exiting, handleAction]);

  const handleSkip = useCallback(() => {
    if (!currentItem) return;
    onSkip?.(currentItem);
    setCursor((c) => c + 1);
  }, [currentItem, onSkip]);

  // ─── Pointer event handlers ────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (exiting) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    startPos.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    setDragState({ x: 0, y: 0, active: true });
  }, [exiting]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.active) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    setDragState({ x: dx, y: dy, active: true });
  }, [dragState.active]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragState.active) return;

    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    const dt = Date.now() - startPos.current.time;
    const velocity = Math.sqrt(dx * dx + dy * dy) / Math.max(dt, 1);

    let dir = getDirectionFromDelta(dx, dy);

    // Fast flick with lower threshold
    if (dir === "none" && velocity > THROW_VELOCITY) {
      if (Math.abs(dx) > 40) dir = dx < 0 ? "left" : "right";
      else if (dy < -40) dir = "up";
    }

    if (dir !== "none") {
      triggerSwipe(dir);
    } else {
      // Spring back
      setDragState({ x: 0, y: 0, active: false });
    }
  }, [dragState.active, triggerSwipe]);

  // Reset cursor when items change
  useEffect(() => {
    setCursor(0);
  }, [items.length]);

  if (!currentItem) {
    return (
      <div className="deck-empty">
        <div className="deck-empty__icon">🎬</div>
        <h3 className="deck-empty__title">All caught up!</h3>
        <p className="deck-empty__text">
          You've gone through all recommendations. Check back later for new suggestions.
        </p>
      </div>
    );
  }

  // Card transform while dragging
  const rotation = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, dragState.x * ROTATION_FACTOR));
  const cardTransform = dragState.active
    ? `translate(${dragState.x}px, ${Math.min(0, dragState.y)}px) rotate(${rotation}deg)`
    : exiting
      ? exitDir === "left"
        ? "translate(-150%, 0) rotate(-20deg)"
        : exitDir === "right"
          ? "translate(150%, 0) rotate(20deg)"
          : "translate(0, -150%) rotate(0)"
      : "translate(0, 0) rotate(0)";

  const cardOpacity = exiting ? 0 : 1;
  const cardTransition = dragState.active ? "none" : "transform 0.3s cubic-bezier(0.2, 0, 0, 1), opacity 0.3s ease";

  // Direction indicator opacity
  const dirIndicatorOpacity = dragState.active
    ? Math.min(1, Math.sqrt(dragState.x ** 2 + dragState.y ** 2) / SWIPE_THRESHOLD)
    : 0;

  return (
    <div className="deck-container">
      {/* Progress */}
      <div className="deck-progress">
        <span className="deck-progress__text">{cursor + 1} / {items.length}</span>
        <div className="deck-progress__bar">
          <div
            className="deck-progress__fill"
            style={{ width: `${((cursor + 1) / items.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Card stack */}
      <div className="deck-stack">
        {/* Next card (behind) */}
        {nextItem && (
          <div className="deck-stack__behind">
            <DeckCard item={nextItem} />
          </div>
        )}

        {/* Current card */}
        <div
          ref={cardRef}
          className="deck-stack__current"
          style={{
            transform: cardTransform,
            opacity: cardOpacity,
            transition: cardTransition,
            cursor: dragState.active ? "grabbing" : "grab",
            touchAction: "none"
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <DeckCard item={currentItem}>
            {/* Direction indicator overlay */}
            {inferredDir !== "none" && (
              <div
                className="deck-direction"
                style={{
                  opacity: dirIndicatorOpacity,
                  borderColor: getDirectionColor(inferredDir),
                  color: getDirectionColor(inferredDir)
                }}
              >
                {getDirectionLabel(inferredDir)}
              </div>
            )}
          </DeckCard>
        </div>
      </div>

      {/* Button controls (fallback for non-touch) */}
      <div className="deck-actions">
        <button
          className="btn btn-danger btn-lg deck-actions__btn"
          onClick={() => triggerSwipe("left")}
          title="Hide (swipe left)"
        >
          ✕ Hide
        </button>
        <button
          className="btn btn-ghost btn-lg deck-actions__btn"
          onClick={handleSkip}
          title="Skip"
        >
          Skip
        </button>
        <button
          className="btn btn-info btn-lg deck-actions__btn"
          onClick={() => triggerSwipe("up")}
          title="Save for later (swipe up)"
        >
          + Later
        </button>
        <button
          className="btn btn-success btn-lg deck-actions__btn"
          onClick={() => triggerSwipe("right")}
          title="Watched (swipe right)"
        >
          ✓ Watched
        </button>
      </div>

      {/* Gesture hints */}
      <div className="deck-hints">
        <span className="deck-hint deck-hint--left">← Hide</span>
        <span className="deck-hint deck-hint--up">↑ Save</span>
        <span className="deck-hint deck-hint--right">Watched →</span>
      </div>
    </div>
  );
}
