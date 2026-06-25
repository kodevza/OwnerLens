import { AzureComponent } from "./components/azure/AzureComponent";
import { AzureInventoryStats } from "./components/azure/AzureInventoryStats";
import { ownerLensVersion } from "./core/buildInfo";

export default function App() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full min-w-0 max-w-none flex-col gap-4 py-4 min-[1920px]:w-[80vw]">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="shrink-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">OwnerLens</h1>
              <span
                aria-label={`OwnerLens version ${ownerLensVersion}`}
                className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground"
                title={`OwnerLens version ${ownerLensVersion}`}
              >
                {ownerLensVersion}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Azure inventory</p>
          </div>
          <div className="ml-auto min-w-0 max-w-full">
            <AzureInventoryStats />
          </div>
        </header>

        <div className="p-[5px]">
          <AzureComponent />
        </div>
      </div>
    </main>
  );
}
