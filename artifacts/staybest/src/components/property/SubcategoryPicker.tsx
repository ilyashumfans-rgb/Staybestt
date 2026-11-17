import { useListPropertyCategories } from "@workspace/api-client-react";

export function SubcategoryPicker({ category, value, onChange }: {
  category: string; value: string[]; onChange: (value: string[]) => void;
}) {
  const { data, isLoading, isError } = useListPropertyCategories();
  const options = data?.find(parent => parent.slug === category)?.subcategories ?? [];
  return <fieldset className="col-span-full space-y-2 rounded-xl border p-4">
    <legend className="px-1 text-sm font-semibold">Subcategories</legend>
    {isLoading ? <p className="text-sm">Loading subcategories…</p> : isError ?
      <p className="text-sm text-destructive">Cannot load subcategories. Please retry before changing selections.</p> :
      !options.length ? <p className="text-sm text-muted-foreground">{category ? "No subcategories configured for this category." : "Select a category first."}</p> :
      <div className="grid gap-3 sm:grid-cols-2">{options.map(name =>
        <label key={name} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={value.includes(name)}
            onChange={event => onChange(event.target.checked ? [...value, name] : value.filter(item => item !== name))} />
          {name}
        </label>)}</div>}
    {value.filter(name => !options.includes(name)).map(name => <label className="flex items-center gap-2 text-sm" key={name}>
      <input type="checkbox" checked onChange={() => onChange(value.filter(item => item !== name))} />{name} (existing selection)
    </label>)}
    <p className="text-xs text-muted-foreground">Select all that apply. Existing listings are not automatically classified.</p>
  </fieldset>;
}
