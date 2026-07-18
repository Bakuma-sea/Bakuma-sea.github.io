import type { CollectionEntry } from "astro:content";
import { BLOG_PATH } from "@/content.config";
import { postFilter } from "./postFilter";

export type CategoryStat = {
  category: string;
  categoryName: string;
  count: number;
};

const CATEGORY_NAMES: Record<string, string> = {
  agents: "Agent",
  llm: "LLM",
  notes: "其他笔记",
  rl: "强化学习",
};

function getFolderCategory(filePath: string | undefined): string {
  const segments = filePath?.replace(BLOG_PATH, "").split("/").filter(Boolean);

  return segments?.[0] ?? "notes";
}

export function getCategoryName(category: string): string {
  return CATEGORY_NAMES[category] ?? category;
}

export function getPostCategory(post: CollectionEntry<"posts">): {
  category: string;
  categoryName: string;
} {
  const category =
    post.data.category?.trim() || getFolderCategory(post.filePath);

  return {
    category,
    categoryName: getCategoryName(category),
  };
}

export function getCategoryCounts(
  posts: CollectionEntry<"posts">[]
): CategoryStat[] {
  const categoryMap = new Map<string, CategoryStat>();

  for (const post of posts.filter(postFilter)) {
    const { category, categoryName } = getPostCategory(post);
    const current = categoryMap.get(category);

    if (current) {
      current.count += 1;
    } else {
      categoryMap.set(category, { category, categoryName, count: 1 });
    }
  }

  return [...categoryMap.values()].sort(
    (a, b) =>
      b.count - a.count || a.categoryName.localeCompare(b.categoryName, "zh-CN")
  );
}
