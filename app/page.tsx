"use client"

import Image from "next/image"
import { useChat } from "@ai-sdk/react"
import LoadingBubble from "./components/LoadingBubble"
import Bubble from "./components/Bubble"
import PromptSuggestionsRow from "./components/PromptSuggestionsRow"

const Home = () => {
  const { messages, sendMessage, status } = useChat()

  const noMessages = messages.length === 0
  const isLoading = status === "submitted" || status === "streaming"

  const handlePrompt = (promptText: string) => {
    sendMessage({ text: promptText })
  }

  return (
    <main>
      <Image src="/logo.png" width={250} height={250} alt="RAG Chatbot Logo" />

      <section className={noMessages ? "" : "populated"}>
        {noMessages ? (
          <>
            <p className="starter-text">
              The Ultimate place for Formula One super fans! Ask F1GPT
              anything about the fantastic topic of F1 racing and it will
              come back with the most up-to-date answers. We hope you enjoy!
            </p>
            <br />
            <PromptSuggestionsRow onPromptClick={handlePrompt} />
          </>
        ) : (
          <>
            {messages.map((message) => (
              <Bubble key={message.id} message={message} />
            ))}
            {isLoading && <LoadingBubble />}
          </>
        )}
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const form = e.currentTarget
          const input = form.elements.namedItem("prompt") as HTMLInputElement
          if (!input.value.trim()) return
          sendMessage({ text: input.value })
          input.value = ""
        }}
      >
        <input
          className="qustion-box"
          name="prompt"
          placeholder="Ask me something..."
        />
        <button type="submit" disabled={status !== "ready"}>
          {status === "submitted" ? "Thinking..." : "Send"}
        </button>
      </form>
    </main>
  )
}

export default Home