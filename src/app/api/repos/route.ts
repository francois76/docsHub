import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

export async function GET() {
  try {
    const config = await getConfig();
    return NextResponse.json({
      repos: config.repos.map((r) => ({
        name: r.name,
        type: r.type,
        defaultBranch: r.defaultBranch ?? "main",
        docsDir: r.docsDir ?? "docs",
        authMode: r.authMode ?? "token",
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
