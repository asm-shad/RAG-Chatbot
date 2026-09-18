import { DataAPIClient } from "@datastax/astra-db-ts";
import { GoogleGenAI } from "@google/genai";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import "dotenv/config";

// ============================================================
// Environment variables
// ============================================================

const {
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  GOOGLE_API_KEY,
} = process.env;

// ============================================================
// Validate environment variables
// ============================================================

if (
  !ASTRA_DB_NAMESPACE ||
  !ASTRA_DB_COLLECTION ||
  !ASTRA_DB_API_ENDPOINT ||
  !ASTRA_DB_APPLICATION_TOKEN ||
  !GOOGLE_API_KEY
) {
  throw new Error(
    "Missing required environment variables. Check your .env file.",
  );
}

// ============================================================
// Google Gemini
// ============================================================

const googleAI = new GoogleGenAI({
  apiKey: GOOGLE_API_KEY,
});

// ============================================================
// Gemini Embedding configuration
// ============================================================

const EMBEDDING_MODEL = "gemini-embedding-001";

// We intentionally use 768 dimensions.
// The same dimension MUST be used in route.ts.
const EMBEDDING_DIMENSION = 768;

// ============================================================
// F1 data sources
// ============================================================

const rag_chatbot = [
  "https://www.autosport.com/f1/news/history-of-female-f1-drivers-including-grand-prix-starters-and-test-drivers/10584871/",
  "https://www.forbes.com/sites/brettknight/2023/11/29/formula-1s-highest-paid-drivers-2023/",
  "https://en.wikipedia.org/wiki/2023_Formula_One_World_Championship",
  "https://www.formula1.com/en/latest",
  "https://en.wikipedia.org/wiki/Formula_One",
  "https://www.skysports.com/f1/news/12433/13117256/lewis-hamilton-says-move-to-ferrari-from-mercedes-doesnt-need-vindicating-amid-irritation-at-coverage",
  "https://en.wikipedia.org/wiki/2022_Formula_One_World_Championship",
  "https://en.wikipedia.org/wiki/List_of_Formula_One_World_Drivers%27_Champions",
  "https://en.wikipedia.org/wiki/2024_Formula_One_World_Championship",
  "https://www.formula1.com/en/results/2024/races",
  "https://www.formula1.com/en/racing/2024",
];

// ============================================================
// Astra DB client
// ============================================================

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);

const db = client.db(ASTRA_DB_API_ENDPOINT, {
  namespace: ASTRA_DB_NAMESPACE,
});

// ============================================================
// Text splitter
// ============================================================

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,
  chunkOverlap: 100,
});

// ============================================================
// Generate Gemini embedding
// ============================================================

const generateEmbedding = async (text: string): Promise<number[]> => {
  const result = await googleAI.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSION,
    },
  });

  const vector = result.embeddings?.[0]?.values;

  if (!vector) {
    throw new Error("Failed to generate Gemini embedding.");
  }

  if (vector.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Unexpected embedding dimension. Expected ${EMBEDDING_DIMENSION}, got ${vector.length}.`,
    );
  }

  return vector;
};

// ============================================================
// Recreate Astra DB collection
// ============================================================

const recreateCollection = async () => {
  console.log("============================================");
  console.log("Recreating Astra DB collection");
  console.log("============================================");

  console.log(`Collection: ${ASTRA_DB_COLLECTION}`);
  console.log(`Embedding model: ${EMBEDDING_MODEL}`);
  console.log(`Embedding dimension: ${EMBEDDING_DIMENSION}`);
  console.log("Similarity metric: cosine");

  // ----------------------------------------------------------
  // Delete existing collection
  // ----------------------------------------------------------

  try {
    console.log("\nDeleting existing collection...");

    await db.dropCollection(ASTRA_DB_COLLECTION);

    console.log("Old collection deleted successfully.");
  } catch (error) {
    console.log(
      "Collection did not exist or could not be deleted. Continuing...",
    );
    console.error(error);
  }

  // ----------------------------------------------------------
  // Create new collection
  // ----------------------------------------------------------

  console.log("\nCreating new collection...");

  const collection = await db.createCollection(ASTRA_DB_COLLECTION, {
    vector: {
      dimension: EMBEDDING_DIMENSION,
      metric: "cosine",
    },
  });

  console.log("New collection created successfully.");
  console.log(collection);
};

// ============================================================
// Scrape webpage
// ============================================================

const scrapePage = async (url: string): Promise<string> => {
  console.log(`\nScraping: ${url}`);

  const loader = new PuppeteerWebBaseLoader(url, {
    launchOptions: {
      headless: true,
    },

    gotoOptions: {
      waitUntil: "domcontentloaded",
    },

    evaluate: async (page) => {
      return await page.evaluate(() => document.body.innerHTML);
    },
  });

  const docs = await loader.load();

  const content = docs.map((doc) => doc.pageContent).join("\n");

  // Remove HTML tags
  const cleanContent = content.replace(/<[^>]*>/g, " ");

  return cleanContent.replace(/\s+/g, " ").trim();
};

// ============================================================
// Load data into Astra DB
// ============================================================

const loadSampleData = async () => {
  const collection = db.collection(ASTRA_DB_COLLECTION);

  let totalChunks = 0;

  for (const url of rag_chatbot) {
    try {
      console.log("\n============================================");
      console.log(`Processing: ${url}`);
      console.log("============================================");

      // --------------------------------------------------------
      // Scrape webpage
      // --------------------------------------------------------

      const content = await scrapePage(url);

      console.log(`Content length: ${content.length}`);

      if (!content) {
        console.log("No content found. Skipping...");
        continue;
      }

      // --------------------------------------------------------
      // Split webpage into chunks
      // --------------------------------------------------------

      const chunks = await splitter.splitText(content);

      console.log(`Created ${chunks.length} chunks`);

      // --------------------------------------------------------
      // Generate embeddings and insert into Astra DB
      // --------------------------------------------------------

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        console.log(`Embedding chunk ${i + 1}/${chunks.length}...`);

        const vector = await generateEmbedding(chunk);

        const res = await collection.insertOne({
          $vector: vector,
          text: chunk,
          source: url,
        });

        totalChunks++;

        console.log(
          `Inserted chunk ${i + 1}/${chunks.length} - ID: ${res.insertedId}`,
        );
      }

      console.log(`Finished: ${url}`);
    } catch (error) {
      console.error(`\nFailed to process: ${url}`);
      console.error(error);
    }
  }

  console.log("\n============================================");
  console.log("Ingestion completed");
  console.log("============================================");
  console.log(`Total chunks inserted: ${totalChunks}`);
};

// ============================================================
// Main
// ============================================================

const main = async () => {
  try {
    await recreateCollection();

    await loadSampleData();

    console.log("\nF1 data ingestion completed successfully.");
  } catch (error) {
    console.error("\nError during ingestion:");
    console.error(error);

    process.exit(1);
  }
};

main();
