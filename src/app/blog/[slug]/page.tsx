import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: slug,
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold">{slug}</h1>
      <p className="mt-4 text-muted-foreground">Article content coming soon.</p>
    </main>
  );
}
