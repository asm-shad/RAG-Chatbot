import { DataAPIClient } from "@datastax/astra-db-ts";
import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { toUIMessageStream } from "@ai-sdk/langchain";
import { createUIMessageStreamResponse } from "ai";
import "dotenv/config";

const {
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  GOOGLE_API_KEY,
} = process.env;

// ----------------------------------------
// Gemini
// ----------------------------------------

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-3.6-flash",
  apiKey: GOOGLE_API_KEY,
});

// ----------------------------------------
// Astra DB
// ----------------------------------------

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);

const db = client.db(ASTRA_DB_API_ENDPOINT, {
  namespace: ASTRA_DB_NAMESPACE,
});

// ----------------------------------------
// Same embedding model used during ingestion
// ----------------------------------------

const embeddings = new HuggingFaceTransformersEmbeddings({
  model: "Xenova/all-MiniLM-L6-v2",
});

// ----------------------------------------
// Helpers: v5 UIMessage -> plain text / LangChain messages
// ----------------------------------------

type UIPart = { type: string; text?: string };
type UIMessage = { role: string; parts: UIPart[] };

const extractText = (message: UIMessage) =>
  (message.parts ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

const toLangChainMessages = (messages: UIMessage[]) =>
  messages.map((message) => {
    const text = extractText(message);
    if (message.role === "user") return new HumanMessage(text);
    if (message.role === "assistant") return new AIMessage(text);
    return new SystemMessage(text);
  });

// ----------------------------------------
// POST /api/chat
// ----------------------------------------

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const latestMessage = extractText(messages?.[messages.length - 1] ?? { role: "user", parts: [] });

    if (!latestMessage) {
      return new Response("No message provided", { status: 400 });
    }

    // ----------------------------------------
    // 1. Convert question into embedding
    // ----------------------------------------

    const queryVector = await embeddings.embedQuery(latestMessage);

    // ----------------------------------------
    // 2. Search Astra DB for similar chunks
    // ----------------------------------------

    let docContext = "";

    try {
      const collection = db.collection(ASTRA_DB_COLLECTION as string);

      const cursor = collection.find(
        {},
        {
          sort: { $vector: queryVector },
          limit: 10,
        },
      );

      const documents = await cursor.toArray();
      docContext = documents.map((doc) => doc.text).join("\n\n");
    } catch (error) {
      console.error("Error querying Astra DB:", error);
      docContext = "";
    }

    // ----------------------------------------
    // 3. Create RAG system message
    // ----------------------------------------

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

    // ----------------------------------------
    // 4. Build the LangChain message list
    // ----------------------------------------

    const chatMessages = [
      new SystemMessage(systemMessage),
      ...toLangChainMessages(messages),
    ];

    // ----------------------------------------
    // 5. Ask Gemini and stream back in the AI SDK v5 UI message protocol
    // ----------------------------------------

    const stream = await llm.stream(chatMessages);

    return createUIMessageStreamResponse({
      stream: toUIMessageStream(stream),
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}