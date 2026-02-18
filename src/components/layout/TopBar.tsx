"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, RefreshCw, BookOpen } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Repo {
  name: string;
  type: string;
  defaultBranch: string;
  docsDir: string;
}

interface Props {
  currentRepo: string;
  currentBranch: string;
  onSync?: () => void;
}

export function TopBar({ currentRepo, currentBranch, onSync }: Props) {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [branches, setBranches] = useState<{ name: string }[]>([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((d) => setRepos(d.repos ?? []));
  }, []);

  useEffect(() => {
    if (!currentRepo) return;
    fetch(`/api/repos/${encodeURIComponent(currentRepo)}/branches`)
      .then((r) => r.json())
      .then((d) => setBranches(d.branches ?? []));
  }, [currentRepo]);

  const handleRepoChange = (name: string) => {
    const repo = repos.find((r) => r.name === name);
    router.push(
      `/docs/${encodeURIComponent(name)}/${repo?.defaultBranch ?? "main"}`
    );
  };

  const handleBranchChange = (branch: string) => {
    router.push(
      `/docs/${encodeURIComponent(currentRepo)}/${encodeURIComponent(branch)}`
    );
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`/api/repos/${encodeURIComponent(currentRepo)}/sync`, {
        method: "POST",
      });
      onSync?.();
    } finally {
      setSyncing(false);
    }
  };

  return (
    <header className="h-14 border-b flex items-center px-4 gap-3 bg-background sticky top-0 z-30">
      <div className="flex items-center gap-2 text-primary font-bold text-lg mr-4">
        <BookOpen className="h-5 w-5" />
        <span>docsHub</span>
      </div>

      {/* Repo selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground hidden sm:inline">Repo</span>
        <Select value={currentRepo} onValueChange={handleRepoChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select repository…" />
          </SelectTrigger>
          <SelectContent>
            {repos.map((repo) => (
              <SelectItem key={repo.name} value={repo.name}>
                {repo.name}
                <span className="ml-2 text-xs text-muted-foreground">
                  ({repo.type})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Branch selector */}
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <Select value={currentBranch} onValueChange={handleBranchChange}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select branch…" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.name} value={b.name}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="gap-1"
        >
          <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          <span className="hidden sm:inline">Sync</span>
        </Button>
      </div>
    </header>
  );
}
