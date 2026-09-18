import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
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
// Gemini LLM
// ============================================================

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-3.6-flash",
  apiKey: GOOGLE_API_KEY,
});

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
// Hugging Face embeddings
// ============================================================

const embeddings = new HuggingFaceTransformersEmbeddings({
  model: "Xenova/all-MiniLM-L6-v2",
});

// all-MiniLM-L6-v2 produces 384-dimensional vectors
const EMBEDDING_DIMENSION = 384;

// ============================================================
// Similarity metric
// ============================================================

type SimilarityMetric =
  | "dot_product"
  | "cosine"
  | "euclidean";

// ============================================================
// Create Astra DB collection
// ============================================================

const createCollection = async (
  similarityMetric: SimilarityMetric = "dot_product",
) => {
  const res = await db.createCollection(ASTRA_DB_COLLECTION, {
    vector: {
      dimension: EMBEDDING_DIMENSION,
      metric: similarityMetric,
    },
  });

  console.log("Collection created:", res);
};

// ============================================================
// Scrape webpage
// ============================================================

const scrapePage = async (url: string) => {
  console.log(`Scraping: ${url}`);

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

  const content = docs
    .map((doc) => doc.pageContent)
    .join("\n");

  // Remove HTML tags
  const cleanContent = content.replace(/<[^>]*>/g, " ");

  return cleanContent.replace(/\s+/g, " ").trim();
};

// ============================================================
// Load data into Astra DB
// ============================================================

const loadSampleData = async () => {
  const collection = db.collection(ASTRA_DB_COLLECTION);

  for (const url of rag_chatbot) {
    try {
      const content = await scrapePage(url);

      console.log(`Content length: ${content.length}`);

      // Split webpage into chunks
      const chunks = await splitter.splitText(content);

      console.log(`Created ${chunks.length} chunks`);

      for (const chunk of chunks) {
        // Generate embedding using Hugging Face
        const vector = await embeddings.embedQuery(chunk);

        // Store vector + text in Astra DB
        const res = await collection.insertOne({
          $vector: vector,
          text: chunk,
          source: url,
        });

        console.log(`Inserted chunk: ${res.insertedId}`);
      }

      console.log(`Finished: ${url}`);
    } catch (error) {
      console.error(`Failed to process: ${url}`);
      console.error(error);
    }
  }
};

// ============================================================
// Main
// ============================================================

const main = async () => {
  try {
    await createCollection();

    await loadSampleData();

    console.log("F1 data ingestion completed.");
  } catch (error) {
    console.error("Error:", error);
  }
};

main();
