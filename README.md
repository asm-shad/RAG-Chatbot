# 🏎️ F1GPT — Formula One RAG Chatbot

**F1GPT** is an AI-powered Formula One chatbot that uses **Retrieval-Augmented Generation (RAG)** to answer questions about Formula One racing.

Users can ask questions about F1 drivers, championships, teams, races, history, and other Formula One topics. The application retrieves relevant information from a collection of Formula One web sources stored in **Astra DB**, then provides the retrieved context to **Google Gemini** to generate the answer.

## 🚀 Live Demo

Try F1GPT here:

**https://formula1race.vercel.app/**

---

## ✨ Features

- 🏎️ Formula One-focused AI chatbot
- 🔎 Retrieval-Augmented Generation (RAG)
- 🗄️ Astra DB vector database
- 🧠 Hugging Face embeddings
- 🤖 Google Gemini for answer generation
- ⚡ Streaming AI responses
- 💬 Conversational chat interface
- 💡 Suggested questions for new users
- 📚 Multiple Formula One information sources
- 📱 Responsive UI
- 🎨 Formula One-inspired dark interface
- ☁️ Ready for Vercel deployment

---

## 🧠 How It Works

F1GPT follows a simple RAG pipeline:

```text
                    User Question
                         │
                         ▼
                 Next.js Frontend
                         │
                         ▼
                  /api/chat Route
                         │
                         ▼
              Generate Query Embedding
                         │
                         ▼
                   Astra DB
                 Vector Search
                         │
                         ▼
              Retrieve Relevant Chunks
                         │
                         ▼
             Build System + Context
                         │
                         ▼
                 Google Gemini
                         │
                         ▼
                Stream AI Response
                         │
                         ▼
                  Chat Interface
```

The application separates the process into two major stages:

### 1. Data Ingestion

Formula One webpages are scraped, cleaned, split into smaller chunks, converted into embeddings, and stored in Astra DB.

### 2. Question Answering

When the user asks a question, the question is converted into an embedding. Astra DB finds the most relevant stored chunks, and those chunks are provided to Gemini as context.

---

# 🏗️ Architecture

F1GPT is a **Next.js full-stack application**.

There is no separate Express or Node.js backend.

The backend functionality is handled by the Next.js API Route Handler:

```text
app/api/chat/route.ts
```

### Application architecture

```text
┌─────────────────────────────┐
│          Browser            │
│                             │
│       F1GPT Chat UI         │
│                             │
│       useChat()             │
└──────────────┬──────────────┘
               │
               │ POST /api/chat
               ▼
┌─────────────────────────────┐
│       Next.js Server        │
│                             │
│       route.ts              │
└──────────────┬──────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
┌──────────────┐  ┌──────────────┐
│   Embedding  │  │   Gemini     │
│   Model      │  │     LLM      │
└──────┬───────┘  └──────▲───────┘
       │                 │
       ▼                 │
┌──────────────┐         │
│   Astra DB   │─────────┘
│ Vector Search│  Retrieved Context
└──────────────┘
```

---

# 🔄 RAG Pipeline

## Step 1 — Collect F1 sources

The project uses Formula One-related webpages from sources such as:

- Formula 1
- Wikipedia
- Autosport
- Forbes
- Sky Sports

Examples include Formula One championship pages, driver information, race results, and F1 news.

---

## Step 2 — Scrape webpages

`loadDb.ts` uses Puppeteer to load webpages.

```text
URL
 ↓
Puppeteer
 ↓
HTML
 ↓
Page content
```

Puppeteer is useful for pages that require browser rendering.

The scraper extracts the HTML body and removes HTML tags before storing the content.

---

## Step 3 — Split content into chunks

Large webpages are split into smaller pieces using:

```ts
RecursiveCharacterTextSplitter;
```

Current configuration:

```text
Chunk size:     512
Chunk overlap:  100
```

Chunking makes it possible to retrieve only the relevant parts of a webpage instead of sending an entire webpage to the LLM.

---

## Step 4 — Generate embeddings

Each text chunk is converted into a numerical vector using:

```text
Xenova/all-MiniLM-L6-v2
```

The model produces:

```text
384-dimensional vectors
```

These vectors represent the semantic meaning of the text.

For example:

```text
"Who won the 2024 F1 championship?"
```

and:

```text
"Max Verstappen secured the 2024 World Drivers' Championship..."
```

would have similar semantic representations even though the wording is different.

---

## Step 5 — Store vectors in Astra DB

The generated vector and text are stored in Astra DB.

Each record contains:

```text
$vector
text
source
```

Conceptually:

```json
{
  "$vector": [0.012, -0.043, 0.081, "..."],
  "text": "Formula One championship information...",
  "source": "https://en.wikipedia.org/..."
}
```

Astra DB then provides vector similarity search when users ask questions.

---

# 💬 Question Answering Pipeline

When a user asks:

```text
Who is the current Formula One World Drivers' Champion?
```

the following process happens.

### 1. Receive the question

The frontend sends the conversation to:

```text
POST /api/chat
```

---

### 2. Extract the latest user message

The API extracts the text from the latest message.

---

### 3. Generate a query embedding

The same Hugging Face embedding model converts the question into a vector.

```text
User Question
      ↓
all-MiniLM-L6-v2
      ↓
384-dimensional vector
```

---

### 4. Search Astra DB

The generated vector is used for vector similarity search.

The application retrieves up to:

```text
10 documents
```

from the Astra DB collection.

```ts
collection.find(
  {},
  {
    sort: { $vector: queryVector },
    limit: 10,
  },
);
```

---

### 5. Build the context

The retrieved document text is combined into a context block.

```text
START CONTEXT

Relevant F1 information...

More relevant information...

Another relevant document...

END CONTEXT
```

---

### 6. Send context to Gemini

The system prompt tells Gemini to:

- Answer Formula One questions
- Use the retrieved context
- Use its existing knowledge if the context is insufficient
- Avoid discussing the retrieval process
- Format responses using Markdown when appropriate

---

### 7. Stream the response

Gemini streams its response through the Next.js API.

The response is then converted into an AI SDK UI message stream.

```text
Gemini
   ↓
LangChain stream
   ↓
UI message stream
   ↓
Next.js
   ↓
useChat()
   ↓
F1GPT UI
```

This allows the answer to appear progressively instead of waiting for the entire response.

---

# 🗂️ Project Structure

A simplified project structure looks like this:

```text
f1-rag-chatbot/
│
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts
│   │
│   ├── components/
│   │   ├── Background.tsx
│   │   ├── Bubble.tsx
│   │   ├── LoadingBubble.tsx
│   │   ├── PromptSuggestionButton.tsx
│   │   └── PromptSuggestionsRow.tsx
│   │
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── loadDb.ts
│
├── public/
│   ├── logo.png
│   ├── backgroun1.jpg
│   ├── backgroun2.jpg
│   └── backgroun3.jpg
│
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

> Your exact folder structure may differ depending on where you keep the components and ingestion script.

---

# 📄 Main Files

## `loadDb.ts`

This is the **data ingestion script**.

Its responsibilities are:

```text
Scrape URLs
    ↓
Clean content
    ↓
Split into chunks
    ↓
Generate embeddings
    ↓
Store vectors in Astra DB
```

It is normally run when you want to populate or update the vector database.

---

## `app/api/chat/route.ts`

This is the application's **server-side RAG API**.

It handles:

- Receiving chat messages
- Creating query embeddings
- Searching Astra DB
- Building the context
- Calling Gemini
- Streaming the AI response

This is effectively the backend portion of the Next.js application.

---

## `app/page.tsx`

This is the main chatbot interface.

It uses:

```ts
useChat();
```

from the AI SDK to manage:

- Chat messages
- User input
- Streaming responses
- Loading state

---

## `Bubble.tsx`

Responsible for rendering individual chat messages.

It displays:

```text
You
```

for user messages and:

```text
F1GPT
```

for assistant messages.

---

## `LoadingBubble.tsx`

Displays the animated three-dot loading indicator while the AI response is being generated.

---

## `PromptSuggestionsRow.tsx`

Provides predefined questions to help users start a conversation.

Examples:

```text
Who is the highest paid F1 driver?

Who is the current Formula One World Drivers' Champion?

Who will be the newest driver for Ferrari?
```

---

## `Background.tsx`

Randomly selects one of the available background images when the page loads.

```text
backgroun1.jpg
backgroun2.jpg
backgroun3.jpg
```

The selected image is assigned to the CSS custom property:

```text
--background-image
```

---

# 🛠️ Tech Stack

## Frontend

| Technology | Purpose                    |
| ---------- | -------------------------- |
| Next.js    | Full-stack React framework |
| React      | User interface             |
| TypeScript | Type safety                |
| AI SDK     | Chat and streaming UI      |
| CSS        | Custom F1-themed interface |

## AI / RAG

| Technology                | Purpose                                 |
| ------------------------- | --------------------------------------- |
| Google Gemini             | LLM / answer generation                 |
| Hugging Face Transformers | Text embeddings                         |
| LangChain                 | Document processing and LLM integration |
| Astra DB                  | Vector database                         |

## Data Collection

| Technology                        | Purpose                       |
| --------------------------------- | ----------------------------- |
| Puppeteer                         | Browser-based webpage loading |
| LangChain Web Loader              | Webpage loading               |
| Recursive Character Text Splitter | Text chunking                 |

## Deployment

| Technology | Purpose             |
| ---------- | ------------------- |
| Vercel     | Application hosting |

---

# 🔐 Environment Variables

Create a `.env` or `.env.local` file depending on your local setup.

```env
ASTRA_DB_NAMESPACE=your_namespace
ASTRA_DB_COLLECTION=your_collection
ASTRA_DB_API_ENDPOINT=your_astra_endpoint
ASTRA_DB_APPLICATION_TOKEN=your_application_token

GOOGLE_API_KEY=your_google_api_key
```

### Variable descriptions

| Variable                     | Purpose                       |
| ---------------------------- | ----------------------------- |
| `ASTRA_DB_NAMESPACE`         | Astra DB namespace            |
| `ASTRA_DB_COLLECTION`        | Vector collection name        |
| `ASTRA_DB_API_ENDPOINT`      | Astra DB API endpoint         |
| `ASTRA_DB_APPLICATION_TOKEN` | Astra DB authentication token |
| `GOOGLE_API_KEY`             | Google Gemini API key         |

### ⚠️ Security

Never commit API keys or database tokens to GitHub.

Add your environment files to `.gitignore`:

```gitignore
.env
.env.local
.env.*
```

For Vercel deployment, add the required environment variables in the project's Vercel environment settings.

---

# 📦 Installation

## 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
```

```bash
cd YOUR_REPOSITORY
```

---

## 2. Install dependencies

```bash
npm install
```

---

## 3. Configure environment variables

Create your environment file:

```text
.env.local
```

Add:

```env
ASTRA_DB_NAMESPACE=your_namespace
ASTRA_DB_COLLECTION=your_collection
ASTRA_DB_API_ENDPOINT=your_endpoint
ASTRA_DB_APPLICATION_TOKEN=your_token
GOOGLE_API_KEY=your_google_api_key
```

---

## 4. Start the development server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

---

# 🗄️ Loading Data into Astra DB

Before the chatbot can retrieve your custom F1 knowledge, the Astra DB collection needs to contain the embedded documents.

Run the ingestion script according to your TypeScript setup.

For example, if using `tsx`:

```bash
npx tsx loadDb.ts
```

The script will:

```text
Create Astra DB collection
        ↓
Scrape F1 webpages
        ↓
Clean webpage content
        ↓
Split content
        ↓
Generate embeddings
        ↓
Insert vectors into Astra DB
```

You should see logs similar to:

```text
Scraping: https://...
Content length: ...
Created ... chunks
Inserted chunk: ...
Finished: https://...
```

Finally:

```text
F1 data ingestion completed.
```

---

# 📊 Vector Configuration

The current vector configuration uses:

```text
Embedding model:
Xenova/all-MiniLM-L6-v2

Dimensions:
384

Similarity metric:
dot_product

Chunk size:
512

Chunk overlap:
100

Retrieved documents:
10
```

The embedding dimension in Astra DB must match the embedding model:

```text
all-MiniLM-L6-v2
        ↓
384 dimensions
        ↓
Astra DB vector dimension = 384
```

---

# 🤖 AI Model

The chatbot currently uses Google Gemini through:

```ts
ChatGoogleGenerativeAI;
```

Configured model:

```text
gemini-3.6-flash
```

Gemini receives:

```text
System instructions
        +
Retrieved Astra DB context
        +
Conversation history
        +
Latest user question
```

and generates the final response.

---

# ⚡ Streaming

F1GPT uses streaming so users don't have to wait for the complete answer.

The backend uses:

```ts
llm.stream(chatMessages);
```

The generated chunks are then written into an AI SDK UI message stream.

```text
Gemini
  ↓
LangChain stream
  ↓
text-start
  ↓
text-delta
  ↓
text-delta
  ↓
text-delta
  ↓
text-end
  ↓
Browser
```

The frontend consumes this stream through:

```ts
useChat();
```

---

# 💡 Example Questions

You can ask questions such as:

```text
Who is the current Formula One World Drivers' Champion?

Who is the highest paid F1 driver?

Who will be the newest driver for Ferrari?

Who is head of racing for Aston Martin's F1 Academy team?

What happened in the 2024 Formula One season?

Who are the Formula One World Drivers' Champions?

Tell me about Lewis Hamilton's move to Ferrari.
```

---

# 🎨 UI Design

The interface is inspired by the visual style of Formula One.

The design uses:

- Dark background
- F1 red
- Yellow accent color
- Compact message bubbles
- Monospace labels
- Racing-inspired visual elements
- Responsive layout
- Animated loading indicator
- Suggested questions

The application also respects the user's reduced-motion preference for supported animations.

---

# 🔒 Security Considerations

The application performs sensitive operations on the server side.

The following values should never be exposed to the client:

```text
ASTRA_DB_APPLICATION_TOKEN
GOOGLE_API_KEY
```

The client communicates with the Next.js API instead:

```text
Browser
   ↓
/api/chat
   ↓
Server
   ↓
Astra DB + Gemini
```

This keeps database credentials and API keys out of the browser.

---

# ⚠️ Current Limitations

The current implementation has several limitations:

- The knowledge base depends on the webpages loaded by `loadDb.ts`.
- Webpage content can change after ingestion.
- Some websites may block automated browser requests.
- Some sources may require JavaScript or authentication.
- The chatbot can use Gemini's existing knowledge when retrieved context is insufficient.
- The current ingestion script inserts individual chunks sequentially.
- There is currently no authentication or user account system.
- There is no conversation persistence database.
- Retrieved sources are not currently displayed as citations in the UI.
- The vector collection needs to be populated before custom RAG retrieval can work.

---

# 🔮 Future Improvements

Possible improvements include:

- [ ] Add source citations to chatbot answers
- [ ] Display retrieved webpages
- [ ] Add F1 driver profiles
- [ ] Add race and championship statistics
- [ ] Add current-season data updates
- [ ] Automatically refresh the knowledge base
- [ ] Add scheduled data ingestion
- [ ] Add authentication
- [ ] Store conversation history
- [ ] Add user-specific chat sessions
- [ ] Improve document metadata
- [ ] Add better webpage extraction
- [ ] Add hybrid keyword + vector search
- [ ] Add reranking
- [ ] Add evaluation tests for RAG answers
- [ ] Add streaming source references
- [ ] Add multiple F1 data providers

---

# 🧩 RAG vs Normal Chatbot

A normal AI chatbot mainly works like:

```text
User Question
     ↓
LLM
     ↓
Answer
```

F1GPT adds a retrieval layer:

```text
User Question
     ↓
Embedding
     ↓
Astra DB
     ↓
Relevant F1 Documents
     ↓
Gemini
     ↓
Answer
```

This allows the application to provide the model with information from its own Formula One knowledge base.

---

# 📚 Data Sources

The current ingestion script includes Formula One information from sources including:

- [Formula1.com](https://www.formula1.com/)
- [Wikipedia](https://www.wikipedia.org/)
- [Autosport](https://www.autosport.com/)
- [Forbes](https://www.forbes.com/)
- [Sky Sports](https://www.skysports.com/)

The specific URLs are defined inside `loadDb.ts`.

---

# 🚀 Deployment

The application can be deployed to Vercel as a Next.js application.

Before deploying, configure the required environment variables:

```text
ASTRA_DB_NAMESPACE
ASTRA_DB_COLLECTION
ASTRA_DB_API_ENDPOINT
ASTRA_DB_APPLICATION_TOKEN
GOOGLE_API_KEY
```

The application then handles:

```text
Frontend
+
Next.js API
+
RAG retrieval
+
Gemini streaming
```

as a single deployment.

---

# 🎯 Project Goal

The goal of F1GPT is to build a practical **Retrieval-Augmented Generation application** around a specific domain.

The project demonstrates how to combine:

```text
Web Scraping
      +
Text Chunking
      +
Embeddings
      +
Vector Database
      +
Semantic Search
      +
LLM
      +
Streaming
      =
RAG Chatbot
```

---

# 📄 License

This project is intended for learning, experimentation, and demonstration purposes.

If you plan to publish the project as open source, consider adding an appropriate license such as the MIT License.

---

# 👨‍💻 Author

**ASM Shad**

Built with ❤️ for Formula One fans and AI/RAG experimentation.
