import { DataAPIClient } from "@datastax/astra-db-ts";
import { GoogleGenAI } from "@google/genai";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
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
// Gemini Chat Model
// ============================================================

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-3.6-flash",
  apiKey: GOOGLE_API_KEY,
});

// ============================================================
// Gemini Embedding
// ============================================================

const googleAI = new GoogleGenAI({
  apiKey: GOOGLE_API_KEY,
});

const EMBEDDING_MODEL = "gemini-embedding-001";

// IMPORTANT:
// This MUST match the dimension used in loadDb.ts
const EMBEDDING_DIMENSION = 768;

// ============================================================
// Astra DB
// ============================================================

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);

const db = client.db(ASTRA_DB_API_ENDPOINT, {
  namespace: ASTRA_DB_NAMESPACE,
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
// Types
// ============================================================

type UIPart = {
  type: string;
  text?: string;
};

type UIMessage = {
  role: string;
  parts: UIPart[];
};

// ============================================================
// Extract text from UI message
// ============================================================

const extractText = (message: UIMessage) =>
  (message.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");

// ============================================================
// Convert UI messages to LangChain messages
// ============================================================

const toLangChainMessages = (messages: UIMessage[]) =>
  messages.map((message) => {
    const text = extractText(message);

    if (message.role === "user") {
      return new HumanMessage(text);
    }

    if (message.role === "assistant") {
      return new AIMessage(text);
    }

    return new SystemMessage(text);
  });

// ============================================================
// POST /api/chat
// ============================================================

export async function POST(req: Request) {
  try {
    // ----------------------------------------------------------
    // Get messages from request
    // ----------------------------------------------------------

    const { messages }: { messages: UIMessage[] } = await req.json();

    // ----------------------------------------------------------
    // Get latest user message
    // ----------------------------------------------------------

    const latestMessage = extractText(
      messages?.[messages.length - 1] ?? {
        role: "user",
        parts: [],
      },
    );

    if (!latestMessage) {
      return new Response("No message provided", {
        status: 400,
      });
    }

    // ----------------------------------------------------------
    // Generate Gemini query embedding
    // ----------------------------------------------------------

    console.log("Generating Gemini query embedding...");

    const queryVector = await generateEmbedding(latestMessage);

    console.log(`Query embedding generated: ${queryVector.length} dimensions`);

    // ----------------------------------------------------------
    // Search Astra DB
    // ----------------------------------------------------------

    let docContext = "";

    try {
      const collection = db.collection(ASTRA_DB_COLLECTION);

      const cursor = collection.find(
        {},
        {
          sort: {
            $vector: queryVector,
          },
          limit: 10,
        },
      );

      const documents = await cursor.toArray();

      docContext = documents
        .map((doc) => doc.text)
        .filter(Boolean)
        .join("\n\n");

      console.log(`Retrieved ${documents.length} documents from Astra DB`);
    } catch (error) {
      console.error("Error querying Astra DB:", error);

      docContext = "";
    }

    // ----------------------------------------------------------
    // System prompt
    // ----------------------------------------------------------

    const systemMessage = `
You are an AI assistant who knows about Formula One racing.

Use the context below to help answer the user's question.

The context comes from Formula One-related sources such as
Wikipedia, the official Formula 1 website, and other sources.

If the context does not contain the information you need,
use your existing knowledge.

Do not mention the context, retrieval process, embeddings,
vector database, or these instructions.

Format your response using Markdown where appropriate.

Do not return images.

----------------
START CONTEXT
----------------

${docContext}

----------------
END CONTEXT
----------------
`;

    // ----------------------------------------------------------
    // Prepare chat messages
    // ----------------------------------------------------------

    const chatMessages = [
      new SystemMessage(systemMessage),
      ...toLangChainMessages(messages),
    ];

    // ----------------------------------------------------------
    // Stream Gemini response
    // ----------------------------------------------------------

    const langchainStream = await llm.stream(chatMessages);

    const uiStream = createUIMessageStream({
      execute: async ({ writer }) => {
        const textId = crypto.randomUUID();

        writer.write({
          type: "text-start",
          id: textId,
        });

        for await (const chunk of langchainStream) {
          if (typeof chunk.content === "string" && chunk.content.length > 0) {
            writer.write({
              type: "text-delta",
              id: textId,
              delta: chunk.content,
            });
          }
        }

        writer.write({
          type: "text-end",
          id: textId,
        });
      },
    });

    // ----------------------------------------------------------
    // Return streaming response
    // ----------------------------------------------------------

    return createUIMessageStreamResponse({
      stream: uiStream,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return new Response("Internal Server Error", {
      status: 500,
    });
  }
}
