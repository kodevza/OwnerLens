import { AzureComponent } from "./components/azure/AzureComponent";

export default function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>OwnerLens</h1>
          <p>Azure inventory</p>
        </div>
      </header>

      <AzureComponent />
    </main>
  );
}
