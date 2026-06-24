import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import * as cheerio from "cheerio";

const SOURCE_URL = "https://www.91mobiles.com/entertainment/best-jiohotstar-movies";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
const execFileAsync = promisify(execFile);

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function extractAgeRating(card) {
  const ratingText = cleanText(card.find("h3 span").first().text());
  const match = ratingText.match(/\(([^)]+)\)/);
  return match?.[1] ?? null;
}

function extractLabeledValues(card, $) {
  const result = {};
  const detailNode = card.find(".movi_det").first();
  const labels = detailNode.find("label");

  labels.each((_, label) => {
    const element = $(label);
    const key = cleanText(element.text()).toLowerCase();
    const valueNode = element.next();

    if (!valueNode.length) {
      return;
    }

    const textValue = cleanText(valueNode.text());
    if (textValue) {
      result[key] = textValue;
    }
  });

  return result;
}

function extractStreamProviders(card, $) {
  return card
    .find(".target_link_ext[data-href]")
    .toArray()
    .map((node) => {
      const element = $(node);
      return {
        provider: cleanText(element.text()),
        url: element.attr("data-href") ?? null
      };
    })
    .filter((item) => item.provider && item.url);
}

async function fetchHtml(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml"
      }
    });

    if (response.ok) {
      return response.text();
    }
  } catch {
    // Fall through to curl-based fetch below.
  }

  const { stdout } = await execFileAsync("curl.exe", [
    "-L",
    "-A",
    USER_AGENT,
    url
  ]);

  if (!stdout || !stdout.trim()) {
    throw new Error("Failed to fetch source page via fetch and curl fallback");
  }

  return stdout;
}

async function enrichWithTmdb(item) {
  const token = process.env.TMDB_BEARER_TOKEN;
  if (!token) {
    return item;
  }

  const searchUrl = new URL("https://api.themoviedb.org/3/search/multi");
  searchUrl.searchParams.set("query", item.title);
  searchUrl.searchParams.set("include_adult", "false");

  const response = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: "application/json"
    }
  });

  if (!response.ok) {
    return item;
  }

  const payload = await response.json();
  const top = payload.results?.[0];

  if (!top) {
    return item;
  }

  return {
    ...item,
    tmdb: {
      id: top.id ?? null,
      media_type: top.media_type ?? null,
      popularity: top.popularity ?? null,
      poster_path: top.poster_path ?? null,
      release_date: top.release_date ?? top.first_air_date ?? null,
      vote_average: top.vote_average ?? null
    }
  };
}

async function main() {
  const html = await fetchHtml(SOURCE_URL);
  const $ = cheerio.load(html);
  const cards = $(".result_items .pro_item").toArray();

  const parsed = [];

  for (const node of cards) {
    const card = $(node);
    const titleAnchor = card.find("h3 a[title]").first();
    const title = cleanText(titleAnchor.attr("title") ?? titleAnchor.text());

    if (!title) {
      continue;
    }

    const detailPath = card.find("[data-href]").first().attr("data-href") ?? null;
    const labels = extractLabeledValues(card, $);
    const streamProviders = extractStreamProviders(card, $);
    const hotstarStream = streamProviders.find((provider) => provider.provider === "JioHotstar") ?? null;
    const imdbText = cleanText(card.find(".imdb").first().text());

    const seedItem = {
      source: "91mobiles",
      source_url: SOURCE_URL,
      scraped_at: new Date().toISOString(),
      title,
      detail_path: detailPath,
      detail_url: detailPath ? new URL(detailPath, "https://www.91mobiles.com").toString() : null,
      age_rating: extractAgeRating(card),
      imdb_rating_text: imdbText || null,
      descriptors: labels,
      top_cast: labels["top cast"]?.split(",").map((entry) => cleanText(entry)).filter(Boolean) ?? [],
      genres: labels["genres"]?.split(",").map((entry) => cleanText(entry)).filter(Boolean) ?? [],
      stream_providers: streamProviders,
      jiohotstar_url: hotstarStream?.url ?? null
    };

    parsed.push(await enrichWithTmdb(seedItem));
  }

  const outputDir = resolve(process.cwd(), "data", "catalog");
  await mkdir(outputDir, { recursive: true });

  const payload = {
    generated_at: new Date().toISOString(),
    source_url: SOURCE_URL,
    item_count: parsed.length,
    items: parsed
  };

  const outputFile = resolve(outputDir, "91mobiles-jiohotstar-seed.json");
  await writeFile(outputFile, JSON.stringify(payload, null, 2), "utf8");

  console.log(`Wrote ${parsed.length} items to ${outputFile}`);
}

await main();
