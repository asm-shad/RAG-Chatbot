import PromptSuggestionButton from "./PromptSuggestionButton"

type PromptSuggestionsRowProps = {
  onPromptClick: (prompt: string) => void
}

const PromptSuggestionsRow = ({ onPromptClick }: PromptSuggestionsRowProps) => {
  const prompts = [
    "Who is head of racing for Aston Martin's F1 Academy team?",
    "Who is the highest paid F1 driver?",
    "Who will be the newest driver for Ferrari?",
    "Who is the current Formula One World Drivers' Champion?",
  ]

  return (
    <div className="prompt-suggestion-row">
      {prompts.map((prompt, index) => (
        <PromptSuggestionButton
          key={`suggestion-${index}`}
          text={prompt}
          onClick={() => onPromptClick(prompt)}
        />
      ))}
    </div>
  )
}

export default PromptSuggestionsRow