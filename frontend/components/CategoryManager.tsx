"use client";

// Admin-only panel to list existing categories and add new ones.
// Renders nothing for non-admin users.
//
// On successful create, dispatches a global "categories-changed" window event
// so other open dropdowns (UploadZone, DocumentList, EditDocumentModal)
// refetch without needing a page refresh.

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import axios from "axios";

import { api } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";

const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex color"),
});

type CategoryInput = z.infer<typeof categorySchema>;
type Category = { id: string; name: string; color: string };

export function CategoryManager() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: { color: "#3b82f6" },
  });

  // Hide the entire panel for non-admin users.
  // Hooks above must run regardless to keep hook order stable.
  const isAdmin = user?.role === "ADMIN";

  // Always load existing categories so the admin sees what already exists.
  useEffect(() => {
    if (!isAdmin) return;
    api
      .get<{ categories: Category[] }>("/api/categories")
      .then(({ data }) => setCategories(data.categories))
      .catch(() => {
        /* silent */
      });
  }, [isAdmin]);

  if (!isAdmin) return null;

  async function onSubmit(data: CategoryInput) {
    setSubmitting(true);
    try {
      const { data: created } = await api.post<Category>(
        "/api/categories",
        data,
      );
      setCategories((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      toast.success("Category created");
      reset({ name: "", color: "#3b82f6" });

      // Tell other open dropdowns to refetch.
      window.dispatchEvent(new Event("categories-changed"));
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? "Failed to create category"
        : "Failed to create category";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Categories</h3>
        <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
          admin only
        </span>
      </div>

      {/* Existing categories */}
      {categories.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium"
              style={{ backgroundColor: `${c.color}20`, color: c.color }}
            >
              {c.name}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 mb-4">
          No categories yet — add one below.
        </p>
      )}

      {/* Add new */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col sm:flex-row gap-2 items-start"
      >
        <div className="flex-1 w-full">
          <input
            type="text"
            placeholder="New category name"
            {...register("name")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>
        <input
          type="color"
          {...register("color")}
          className="h-[42px] w-14 rounded-lg border border-gray-300 cursor-pointer p-1"
          title="Pick a color"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {submitting ? "Adding..." : "Add"}
        </button>
      </form>
    </section>
  );
}
