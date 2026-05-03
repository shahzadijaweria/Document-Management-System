// Module-local types for the categories feature.

export type CategoryRecord = {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
};

// Spec response shape: { categories: [{ id, name, color }] }
export type ListCategoriesResponse = {
  categories: CategoryRecord[];
};
