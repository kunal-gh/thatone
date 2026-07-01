import { describe, expect, it } from "vitest";
import {
  CONTENT_URL_PATTERN,
  extractTitle,
  findCandidateCards,
  isLikelyContentUrl,
  resolveCardElement
} from "./adapter";

// ─── isLikelyContentUrl ───────────────────────────────────────────────────────

describe("isLikelyContentUrl", () => {
  it("accepts movie and show paths", () => {
    expect(isLikelyContentUrl("/in/movies/test/123/watch")).toBe(true);
    expect(isLikelyContentUrl("/in/shows/test/123")).toBe(true);
    expect(isLikelyContentUrl("https://hotstar.com/in/shows/the-agency/1271322011")).toBe(true);
  });

  it("accepts originals, episodes, series, sports paths", () => {
    expect(isLikelyContentUrl("/in/originals/panchayat/s3")).toBe(true);
    expect(isLikelyContentUrl("/in/episodes/mirzapur/s2e1")).toBe(true);
    expect(isLikelyContentUrl("/in/series/criminal-justice")).toBe(true);
    expect(isLikelyContentUrl("/in/sports/ipl/live")).toBe(true);
    expect(isLikelyContentUrl("/in/detail/kahaani/126001")).toBe(true);
  });

  it("rejects unrelated paths", () => {
    expect(isLikelyContentUrl("/in/login")).toBe(false);
    expect(isLikelyContentUrl("/in/about")).toBe(false);
    expect(isLikelyContentUrl("/in/search")).toBe(false);
    expect(isLikelyContentUrl("/in/settings")).toBe(false);
    expect(isLikelyContentUrl("/")).toBe(false);
  });

  it("CONTENT_URL_PATTERN export is the same pattern used internally", () => {
    expect(CONTENT_URL_PATTERN.test("/in/movies/test")).toBe(true);
    expect(CONTENT_URL_PATTERN.test("/in/login")).toBe(false);
  });
});

// ─── extractTitle ─────────────────────────────────────────────────────────────

describe("extractTitle", () => {
  function makeAnchor(html: string): HTMLAnchorElement {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.querySelector("a") as HTMLAnchorElement;
  }

  it("prefers aria-label over everything else", () => {
    const a = makeAnchor(`<a href="/in/movies/test" aria-label="Kahaani">
      <img alt="Wrong Alt" />
    </a>`);
    expect(extractTitle(a)).toBe("Kahaani");
  });

  it("uses data-title attribute as second priority", () => {
    const a = makeAnchor(`<a href="/in/movies/test" data-title="Dhurandhar">
      <img alt="Wrong Alt" />
    </a>`);
    expect(extractTitle(a)).toBe("Dhurandhar");
  });

  it("uses title attribute as third priority", () => {
    const a = makeAnchor(`<a href="/in/movies/test" title="Special Ops">
      <span>Something else</span>
    </a>`);
    expect(extractTitle(a)).toBe("Special Ops");
  });

  it("falls back to img[alt]", () => {
    const a = makeAnchor(`<a href="/in/movies/test">
      <img alt="Kahaani" src="poster.jpg" />
    </a>`);
    expect(extractTitle(a)).toBe("Kahaani");
  });

  it("falls back to anchor textContent", () => {
    const a = makeAnchor(`<a href="/in/shows/test">Panchayat</a>`);
    expect(extractTitle(a)).toBe("Panchayat");
  });

  it("returns null when no title is extractable", () => {
    const a = makeAnchor(`<a href="/in/movies/test"><img src="poster.jpg" /></a>`);
    expect(extractTitle(a)).toBeNull();
  });
});

// ─── findCandidateCards ───────────────────────────────────────────────────────

describe("findCandidateCards", () => {
  it("extracts cards from anchor and image alt content", () => {
    document.body.innerHTML = `
      <section>
        <article>
          <a href="/in/movies/kahaani/126001">
            <img alt="Kahaani" src="poster.jpg" />
          </a>
        </article>
        <article>
          <a href="/in/shows/special-ops/126002">
            <span>Special Ops</span>
          </a>
        </article>
      </section>
    `;

    const cards = findCandidateCards(document);

    expect(cards).toHaveLength(2);
    expect(cards[0]?.title).toBe("Kahaani");
    expect(cards[1]?.title).toContain("Special Ops");
  });

  it("deduplicates anchors inside the same card", () => {
    document.body.innerHTML = `
      <article>
        <a href="/in/movies/kahaani/126001">
          <img alt="Kahaani" src="poster.jpg" />
        </a>
        <a href="/in/movies/kahaani/126001/watch">Watch now</a>
      </article>
    `;

    const cards = findCandidateCards(document);

    expect(cards).toHaveLength(1);
    expect(cards[0]?.title).toBe("Kahaani");
  });

  it("handles homepage carousel rail with data-card wrappers", () => {
    document.body.innerHTML = `
      <div class="rail">
        <div data-card="true">
          <a href="/in/movies/dhurandhar/1271641088" aria-label="Dhurandhar">
            <img src="poster1.jpg" />
          </a>
        </div>
        <div data-card="true">
          <a href="/in/movies/vaazha/1272000" aria-label="Vaazha II">
            <img src="poster2.jpg" />
          </a>
        </div>
        <div data-card="true">
          <a href="/in/movies/punisher/1272001">
            <img alt="The Punisher" src="poster3.jpg" />
          </a>
        </div>
      </div>
    `;

    const cards = findCandidateCards(document);

    expect(cards).toHaveLength(3);
    expect(cards[0]?.title).toBe("Dhurandhar");
    expect(cards[1]?.title).toBe("Vaazha II");
    expect(cards[2]?.title).toBe("The Punisher");
  });

  it("handles search result grid with aria-label on anchors", () => {
    document.body.innerHTML = `
      <ul>
        <li>
          <a href="/in/movies/kahaani/126001" aria-label="Kahaani 2012 Thriller">
            <img src="p1.jpg" />
          </a>
        </li>
        <li>
          <a href="/in/originals/panchayat/season3" aria-label="Panchayat Season 3">
            <img src="p2.jpg" />
          </a>
        </li>
      </ul>
    `;

    const cards = findCandidateCards(document);

    expect(cards).toHaveLength(2);
    expect(cards[0]?.title).toBe("Kahaani 2012 Thriller");
    expect(cards[1]?.title).toBe("Panchayat Season 3");
  });

  it("handles detail page 'More like this' rail", () => {
    document.body.innerHTML = `
      <section aria-label="More like this">
        <div class="card-item">
          <a href="/in/movies/mirzapur/123">
            <img alt="Mirzapur" src="p1.jpg" />
          </a>
        </div>
        <div class="card-item">
          <a href="/in/shows/criminal-justice/456">
            <img alt="Criminal Justice" src="p2.jpg" />
          </a>
        </div>
      </section>
    `;

    const cards = findCandidateCards(document);

    expect(cards).toHaveLength(2);
    expect(cards[0]?.title).toBe("Mirzapur");
    expect(cards[1]?.title).toBe("Criminal Justice");
  });

  it("extracts poster image cards even when JioHotstar uses click handlers instead of content links", () => {
    document.body.innerHTML = `
      <section>
        <div class="RailRail">
          <div class="TileRoot">
            <img alt="The Agency" src="agency.jpg" />
          </div>
          <div class="TileRoot">
            <img alt="The Bear" src="bear.jpg" />
          </div>
        </div>
      </section>
    `;

    const cards = findCandidateCards(document);

    expect(cards).toHaveLength(2);
    expect(cards[0]?.title).toBe("The Agency");
    expect(cards[0]?.canonicalKey).toMatch(/^title:/);
    expect(cards[1]?.title).toBe("The Bear");
  });

  it("uses the rail item as the card root when posters are nested in inner shells", () => {
    document.body.innerHTML = `
      <section>
        <div class="RailRail">
          <div class="rail-slot" data-testid="slot-a">
            <div class="poster-shell">
              <img alt="Shutter Island" src="shutter.jpg" />
            </div>
          </div>
          <div class="rail-slot" data-testid="slot-b">
            <div class="poster-shell">
              <img alt="Mad Max Fury Road" src="mad-max.jpg" />
            </div>
          </div>
        </div>
      </section>
    `;

    const cards = findCandidateCards(document);

    expect(cards).toHaveLength(2);
    expect(cards[0]?.title).toBe("Shutter Island");
    expect(cards[0]?.element.getAttribute("data-testid")).toBe("slot-a");
    expect(cards[1]?.element.getAttribute("data-testid")).toBe("slot-b");
  });

  it("rejects nav, footer, and login links", () => {
    document.body.innerHTML = `
      <nav>
        <a href="/in/login">Login</a>
        <a href="/in/about">About</a>
        <a href="/in/search">Search</a>
      </nav>
      <footer>
        <a href="/in/settings">Settings</a>
      </footer>
    `;

    const cards = findCandidateCards(document);

    expect(cards).toHaveLength(0);
  });

  it("assigns url-based canonicalKey when URL is a clean content path", () => {
    document.body.innerHTML = `
      <article>
        <a href="/in/movies/kahaani/126001">
          <img alt="Kahaani" src="poster.jpg" />
        </a>
      </article>
    `;

    const cards = findCandidateCards(document);

    expect(cards[0]?.canonicalKey).toMatch(/^url:/);
  });
});
