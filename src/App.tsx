import { AzureComponent } from "./components/azure/AzureComponent";

export default function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-[80vw] min-w-0 max-w-none flex-col gap-4 py-4 max-lg:w-[calc(100vw-2rem)]">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">OwnerLens</h1>
            <p className="mt-1 text-sm text-muted-foreground">Azure inventory</p>
          </div>
        </header>

        <AzureComponent />
      </div>
    </main>
  );
}
