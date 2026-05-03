"use client";

// Document list with search, category filter, pagination, and per-row actions.
// Refetches when filters change OR when refreshKey bumps (parent triggers

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import toast from "react-hot-toast";
import axios from "axios";

import { api } from "@/lib/api";
import { markOwnAction } from "@/lib/socket";
import { EditDocumentModal } from "./EditDocumentModal";

export type DocumentItem = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  fileSize: number;
  fileType: string;
  createdAt: string;
  updatedAt: string;
  s3Url: string | null;
};

type Category = { id: string; name: string; color: string };

type ListResponse = {
  items: DocumentItem[];
  total: number;
  page: number;
  limit: number;
};

const PAGE_SIZE = 10;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatType(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "DOCX",
    "text/plain": "TXT",
    "image/png": "PNG",
    "image/jpeg": "JPEG",
  };
  return map[mime] ?? mime;
}

type Props = {
  refreshKey: number;
  onChanged: () => void;
};

export function DocumentList({ refreshKey, onChanged }: Props) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal/dialog state — null when nothing open.
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<DocumentItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    const fetchCategories = () => {
      api
        .get<{ categories: Category[] }>("/api/categories")
        .then(({ data }) => setCategories(data.categories))
        .catch(() => {
          /* silent */
        });
    };
    fetchCategories();
    window.addEventListener("categories-changed", fetchCategories);
    return () =>
      window.removeEventListener("categories-changed", fetchCategories);
  }, []);

  // Reset to page 1 whenever a filter changes
  useEffect(() => {
    setPage(1);
  }, [search, categoryId]);

  // Fetch documents (debounced)
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        if (search) params.append("search", search);
        if (categoryId) params.append("categoryId", categoryId);

        const { data } = await api.get<ListResponse>(
          `/api/documents?${params.toString()}`,
        );
        setDocs(data.items);
        setTotal(data.total);
      } catch (err) {
        const msg = axios.isAxiosError(err)
          ? err.response?.data?.error?.message ?? "Failed to load documents"
          : "Failed to load documents";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [page, search, categoryId, refreshKey]);

  function handleView(doc: DocumentItem) {
    if (!doc.s3Url) {
      toast.error("Download URL not available");
      return;
    }
    window.open(doc.s3Url, "_blank", "noopener");
  }

  async function handleDelete() {
    if (!deletingDoc) return;
    setDeleteBusy(true);
    markOwnAction();
    try {
      await api.delete(`/api/documents/${deletingDoc.id}`);
      toast.success("Document deleted");
      setDeletingDoc(null);
      onChanged();
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? "Delete failed"
        : "Delete failed";
      toast.error(msg);
    } finally {
      setDeleteBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">My documents</h3>
        <span className="text-sm text-gray-500">{total} total</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-8 text-center text-gray-500 text-sm">Loading...</div>
      ) : docs.length === 0 ? (
        <div className="py-8 text-center text-gray-500 text-sm">
          {search || categoryId
            ? "No documents match your filters."
            : "No documents yet. Upload your first one above!"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500 border-b border-gray-200">
              <tr>
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Category</th>
                <th className="py-2 font-medium">Size</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Uploaded</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => {
                const category = categories.find(
                  (c) => c.id === doc.categoryId,
                );
                return (
                  <tr
                    key={doc.id}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50"
                  >
                    <td className="py-3 font-medium text-gray-900">
                      {doc.name}
                    </td>
                    <td className="py-3">
                      {category ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${category.color}20`,
                            color: category.color,
                          }}
                        >
                          {category.name}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 text-gray-600">
                      {formatBytes(doc.fileSize)}
                    </td>
                    <td className="py-3 text-gray-600">
                      {formatType(doc.fileType)}
                    </td>
                    <td className="py-3 text-gray-600">
                      {formatDistanceToNow(new Date(doc.createdAt), {
                        addSuffix: true,
                      })}
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2 text-xs font-medium">
                        <button
                          onClick={() => handleView(doc)}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          View
                        </button>
                        <button
                          onClick={() => setEditingDoc(doc)}
                          className="text-gray-600 hover:text-gray-900 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeletingDoc(doc)}
                          className="text-red-600 hover:text-red-800 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Previous
          </button>
          <span className="text-gray-600">
            Showing{" "}
            <span className="font-medium text-gray-900">
              {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)}
            </span>{" "}
            of <span className="font-medium text-gray-900">{total}</span>
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Next
          </button>
        </div>
      )}

      {/* Edit modal */}
      {editingDoc && (
        <EditDocumentModal
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSaved={() => {
            setEditingDoc(null);
            onChanged();
          }}
        />
      )}

      {deletingDoc && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !deleteBusy && setDeletingDoc(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Delete document?
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete{" "}
              <span className="font-medium text-gray-900">
                {deletingDoc.name}
              </span>
              . This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleteBusy}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white font-medium hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {deleteBusy ? "Deleting..." : "Delete"}
              </button>
              <button
                onClick={() => setDeletingDoc(null)}
                disabled={deleteBusy}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
