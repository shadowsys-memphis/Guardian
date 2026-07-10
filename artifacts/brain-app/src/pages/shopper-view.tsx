import { ShopperTab } from "@/pages/admin-view";

export function ShopperView() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <ShopperTab />
      </div>
    </div>
  );
}
