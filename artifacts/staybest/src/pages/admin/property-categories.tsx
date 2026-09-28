import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminPropertyCategoriesQueryKey,
  getListPropertyCategoriesQueryKey,
  useCreatePropertyCategory,
  useDeletePropertyCategory,
  useListAdminPropertyCategories,
  useUpdatePropertyCategory,
  type PropertyCategory,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

const errorMessage = (error: any, fallback: string) =>
  error?.data?.message ?? error?.response?.data?.message ?? error?.message ?? fallback;

function CategoryRow({
  category,
  onSaved,
}: {
  category: PropertyCategory;
  onSaved: () => void;
}) {
  const updateCategory = useUpdatePropertyCategory();
  const deleteCategory = useDeletePropertyCategory();
  const [name, setName] = useState(category.name);
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder));

  useEffect(() => {
    setName(category.name);
    setSortOrder(String(category.sortOrder));
  }, [category.name, category.sortOrder]);

  const update = (patch: Partial<PropertyCategory>) => {
    updateCategory.mutate(
      {
        id: category.id,
        data: {
          name: patch.name ?? name.trim(),
          slug: category.slug,
          active: patch.active ?? category.active,
          sortOrder: patch.sortOrder ?? Number(sortOrder),
        },
      },
      {
        onSuccess: () => {
          toast.success("Category updated");
          onSaved();
        },
        onError: (error: any) =>
          toast.error(errorMessage(error, "Could not update category")),
      },
    );
  };

  return (
    <div className="grid gap-3 border-b p-4 last:border-0 md:grid-cols-[minmax(180px,1fr)_minmax(140px,0.8fr)_110px_130px_auto] md:items-end">
      <div>
        <label className="mb-1 block text-xs font-bold text-secondary">Display name</label>
        <Input value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-secondary">Slug</label>
        <Input value={category.slug} disabled />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-secondary">Sort order</label>
        <Input
          type="number"
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value)}
        />
      </div>
      <Button
        type="button"
        variant={category.active ? "outline" : "default"}
        onClick={() => update({ active: !category.active })}
        disabled={updateCategory.isPending}
      >
        {category.active ? "Deactivate" : "Activate"}
      </Button>
      <div className="flex gap-2">
        <Button
          type="button"
          size="icon"
          aria-label={`Save ${category.name}`}
          onClick={() => update({ name: name.trim(), sortOrder: Number(sortOrder) })}
          disabled={!name.trim() || !Number.isInteger(Number(sortOrder)) || updateCategory.isPending}
        >
          {updateCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Delete ${category.name}`}
          disabled={deleteCategory.isPending}
          onClick={() => {
            if (!confirm(`Delete "${category.name}"?`)) return;
            deleteCategory.mutate(
              { id: category.id },
              {
                onSuccess: (result) => {
                  toast.success(result.message);
                  onSaved();
                },
                onError: (error: any) =>
                  toast.error(errorMessage(error, "Could not delete category")),
              },
            );
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export default function AdminPropertyCategories() {
  const queryClient = useQueryClient();
  const { data: categories, isLoading } = useListAdminPropertyCategories();
  const createCategory = useCreatePropertyCategory();
  const [form, setForm] = useState({ name: "", slug: "", sortOrder: "" });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListAdminPropertyCategoriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListPropertyCategoriesQueryKey() });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    createCategory.mutate(
      {
        data: {
          name: form.name.trim(),
          slug: form.slug.trim().toLowerCase(),
          sortOrder: Number(form.sortOrder),
          active: true,
        },
      },
      {
        onSuccess: () => {
          toast.success("Category created");
          setForm({ name: "", slug: "", sortOrder: "" });
          refresh();
        },
        onError: (error: any) =>
          toast.error(errorMessage(error, "Could not create category")),
      },
    );
  };

  return (
    <AdminLayout title="Property Categories">
      <p className="mb-6 text-muted-foreground">
        Control the categories available when administrators create properties. Deactivated categories remain on existing properties.
      </p>
      <form
        onSubmit={submit}
        className="mb-6 grid gap-4 rounded-2xl border bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_140px_auto] md:items-end"
      >
        <div>
          <label className="mb-1 block text-xs font-bold text-secondary">Display name</label>
          <Input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Apartment"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-secondary">Slug</label>
          <Input
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            value={form.slug}
            onChange={(event) => setForm({ ...form, slug: event.target.value.toLowerCase().replace(/\s+/g, "-") })}
            placeholder="apartment"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-secondary">Sort order</label>
          <Input
            required
            type="number"
            value={form.sortOrder}
            onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
            placeholder="4"
          />
        </div>
        <Button type="submit" className="gap-2" disabled={createCategory.isPending}>
          {createCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add Category
        </Button>
      </form>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : categories?.length ? (
          categories.map((category) => (
            <CategoryRow key={category.id} category={category} onSaved={refresh} />
          ))
        ) : (
          <div className="py-16 text-center text-muted-foreground">No property categories.</div>
        )}
      </div>
    </AdminLayout>
  );
}