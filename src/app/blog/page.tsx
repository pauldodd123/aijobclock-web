import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description: "AI job market analysis and insights.",
};

export default function BlogPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">Blog</h1>
      <p className="mt-4 text-muted-foreground">Articles coming soon.</p>
    </main>
  );
}
