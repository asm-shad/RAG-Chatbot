type ChatMessage = {
  id: string
  role: string
  parts: { type: string; text?: string }[]
}

const Bubble = ({ message }: { message: ChatMessage }) => {
  const { role, parts } = message

  const text = parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("")

  return (
    <div className={`bubble ${role}`}>
      <span className="bubble-label">{role === "user" ? "You" : "F1GPT"}</span>
      <div className="bubble-text">{text}</div>
    </div>
  )
}

export default Bubble