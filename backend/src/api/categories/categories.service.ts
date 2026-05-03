// Categories business logic.
// Categories are global (not per-user), so the cache key is shared across all users.

import { prisma } from "../../db/prisma";
import * as cache from "../../utils/cache";
import { ConflictError } from "../../utils/errors";

import type { CreateCategoryInput } from "./categories.validation";
import type {
  CategoryRecord,
  ListCategoriesResponse,
} from "./categories.types";

const CACHE_KEY = "cats:all";
const TTL = 3600; // 1 hour per spec

export async function list(): Promise<ListCategoriesResponse> {
  const cached = await cache.get<CategoryRecord[]>(CACHE_KEY);
  if (cached) return { categories: cached };

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
  });

  await cache.set(CACHE_KEY, categories, TTL);
  return { categories };
}

export async function create(
  input: CreateCategoryInput,
): Promise<CategoryRecord> {
  const existing = await prisma.category.findUnique({
    where: { name: input.name },
  });
  if (existing) {
    throw new ConflictError("Category name already exists");
  }

  const category = await prisma.category.create({ data: input });

  // Invalidate the cached list so the next GET reflects the new category.
  await cache.del(CACHE_KEY);

  return category;
}
