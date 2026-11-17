import { AddItemForm } from './components/AddItemForm';
import { AskPanel } from './components/AskPanel';
import { ItemList } from './components/ItemList';
import { useAskQuestion } from './hooks/useAskQuestion';
import { useItems } from './hooks/useItems';

export default function App() {
  const { items, loading, error, refresh } = useItems();
  const ask = useAskQuestion();

  return (
    <main className="layout">
      <header>
        <h1>AI Knowledge Inbox</h1>
        <p className="muted">Save notes and links, then ask questions across them.</p>
      </header>

      <div className="columns">
        <div className="column">
          <AddItemForm onAdded={refresh} />
          <ItemList items={items} loading={loading} error={error} />
        </div>
        <div className="column">
          <AskPanel
            question={ask.question}
            onQuestionChange={ask.setQuestion}
            onAsk={ask.ask}
            submitting={ask.submitting}
            error={ask.error}
            result={ask.result}
          />
        </div>
      </div>
    </main>
  );
}
