"use client";

// Drag-and-drop file upload with metadata form.
// Validates MIME/size client-side (matches backend rules) so we don't waste
// a network round trip on obviously-invalid files. Backend re-validates anyway.

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import toast from "react-hot-toast";
import axios from "axios";

import { api } from "@/lib/api";
import { markOwnAction } from "@/lib/socket";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "image/png",
  "image/jpeg",
];
const MAX_SIZE = 10 * 1024 * 1024;

const uploadSchema = z.object({
  name: z.string().trim().max(255).optional(),
  description: z.string().trim().max(2000).optional(),
  categoryId: z.string().optional(),
});

type UploadInput = z.infer<typeof uploadSchema>;
type Category = { id: string; name: string; color: string };

type Props = {
  onUploaded?: () => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function UploadZone({ onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
  } = useForm<UploadInput>({
    resolver: zodResolver(uploadSchema),
  });

  // Load categories for the dropdown. Refetch on the global "categories-changed"
  // event so newly-added categories (from CategoryManager) appear without a page refresh.
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

  function pickFile(f: File) {
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast.error(`File type "${f.type || "unknown"}" not allowed`);
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error(`File too large (max 10MB)`);
      return;
    }
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) pickFile(dropped);
  }

  function handleClear() {
    setFile(null);
    reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function onSubmit(data: UploadInput) {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    if (data.name) formData.append("name", data.name);
    if (data.description) formData.append("description", data.description);
    if (data.categoryId) formData.append("categoryId", data.categoryId);

    // Mark this action so the dashboard's notification:new listener
    // suppresses the duplicate 🔔 toast in this tab.
    markOwnAction();

    try {
      await api.post("/api/documents/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      });
      toast.success("Document uploaded!");
      handleClear();
      onUploaded?.();
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? "Upload failed"
        : "Upload failed";
      toast.error(message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Upload a document
      </h3>

      {/* Drop / click zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
          dragging
            ? "border-blue-500 bg-blue-50"
            : file
              ? "border-green-500 bg-green-50"
              : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
          }}
        />
        {file ? (
          <div>
            <p className="font-medium text-gray-900">{file.name}</p>
            <p className="text-sm text-gray-500 mt-1">
              {formatBytes(file.size)} · {file.type}
            </p>
          </div>
        ) : (
          <div className="text-gray-500">
            <p className="font-medium">Drop a file here, or click to browse</p>
            <p className="text-sm mt-1">
              PDF, DOC, DOCX, TXT, PNG, JPG, JPEG · max 10MB
            </p>
          </div>
        )}
      </div>

      {/* Metadata form — only when a file is selected */}
      {file && (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="upload-name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Name <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              id="upload-name"
              {...register("name")}
              placeholder={file.name}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="upload-description"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Description{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="upload-description"
              {...register("description")}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="upload-category"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Category{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              id="upload-category"
              {...register("categoryId")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Progress bar */}
          {uploading && (
            <div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={uploading}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {uploading ? `Uploading... ${progress}%` : "Upload"}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={uploading}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
