import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";

export default async function HomePage() {
  const config = await getConfig();
  if (config.repos.length > 0) {
    const first = config.repos[0];
    redirect(`/docs/${encodeURIComponent(first.name)}`);
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center max-w-md p-8">
        <h1 className="text-3xl font-bold mb-4">Welcome to docsHub</h1>
        <p className="text-muted-foreground mb-6">
          No repositories configured yet. Create a{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded">.docshub.yml</code>{" "}
          file at the root of your project to get started.
        </p>
        <pre className="text-left bg-muted p-4 rounded-lg text-sm">
          {`repos:
  - name: my-project
    type: local
    path: ./example
    docsDir: docs`}
        </pre>
      </div>
    </div>
  );
}
