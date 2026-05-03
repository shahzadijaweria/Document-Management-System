"use client";

// Modal for editing a document's metadata (name, description, category).

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import axios from "axios";

import { api } from "@/lib/api";
import { markOwnAction } from "@/lib/socket";
import type { DocumentItem } from "./DocumentList";

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(255),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().optional(),
});

type UpdateInput = z.infer<typeof updateSchema>;
type Category = { id: string; name: string; color: string };

type Props = {
  doc: DocumentItem;
  onClose: () => void;
  onSaved: () => void;
};

export function EditDocumentModal({ doc, onClose, onSaved }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<UpdateInput>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      name: doc.name,
      description: doc.description ?? "",
      categoryId: doc.categoryId ?? "",
    },
  });

  useEffect(() => {
    const fetchCategories = () => {
      api
        .get<{ categories: Category[] }>("/api/categories")
        .then(({ data }) => {
          setCategories(data.categories);
          // Re-sync the <select> to the doc's current category once the
          // <option> for it actually exists in the DOM. Without this, the
          // select shows the first option ("No category") even though the
          // form's stored value is correct.
          setValue("categoryId", doc.categoryId ?? "");
        })
        .catch(() => {
          /* silent */
        });
    };
    fetchCategories();
    window.addEventListener("categories-changed", fetchCategories);
    return () =>
      window.removeEventListener("categories-changed", fetchCategories);
  }, [doc.categoryId, setValue]);

  async function onSubmit(data: UpdateInput) {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (data.name && data.name !== doc.name) payload.name = data.name;
      if ((data.description ?? "") !== (doc.description ?? "")) {
        payload.description = data.description ?? "";
      }
      if ((data.categoryId ?? "") !== (doc.categoryId ?? "")) {
        // Empty string from "No category" -> send null to clear it server-side.
        // Real id -> send as-is.
        payload.categoryId = data.categoryId ? data.categoryId : null;
      }

      if (Object.keys(payload).length === 0) {
        toast("No changes to save");
        onClose();
        return;
      }

      markOwnAction();
      await api.put(`/api/documents/${doc.id}`, payload);
      toast.success("Document updated");
      onSaved();
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? "Update failed"
        : "Update failed";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Edit document
          </h3>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label
                htmlFor="edit-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Name
              </label>
              <input
                id="edit-name"
                {...register("name")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="edit-description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Description
              </label>
              <textarea
                id="edit-description"
                {...register("description")}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="edit-category"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Category
              </label>
              <select
                id="edit-category"
                {...register("categoryId")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
