import { useState } from "react";
import {
  pushToCalendar,
  makeShoppingEventDescription,
  makeUrgentItemDescription,
  handleCalendarError,
} from "@/lib/calendar";
import {
  ShoppingCart,
  X,
  RefreshCw,
  Flame,
  CheckCircle,
  Cloud,
  CalendarPlus,
  Wand2,
  AlertCircle,
  Plus,
  Trash2,
  Check,
  Upload,
  FileWarning,
  Shuffle,
  Repeat,
  Camera,
} from "lucide-react";
import {
  useListMeals,
  useCreateMeal,
  useDeleteMeal,
  useSyncFromSheets,
  useImportCookbook,
  type CookbookImportResult,
  useGetCart,
  useAddMealToCart,
  useRemoveMealFromCart,
  useAddCartItem,
  useScanCartItem,
  useRemoveCartItem,
  useShuffleCart,
  useSwapCartMeal,
  useApproveCart,
  useDismissCart,
  useListStaples,
  useCreateStaple,
  useDeleteStaple,
  useAddStaplesToCart,
  type StapleItem,
  useListCravings,
  useUpdateCraving,
  useRemixMealPlan,
  useSaveRemixMeal,
  type MealWithIngredients,
  type MealCraving,
  type RemixSuggestion,
} from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatPacificDateTime } from "@/lib/time";

const WORKSPACE_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const SKIP_REASON_LABELS: Record<string, string> = {
  "meal-plan-directive": "Meal plan / grocery list",
  "no-recipe-structure": "Not a recipe",
  "no-ingredients": "No ingredients listed",
  "unsupported-file": "Unsupported file type",
  unreadable: "Could not be read",
  duplicate: "Already in catalog",
};

async function readFileAsBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Chunked so a multi-MB zip doesn't blow the argument limit on String.fromCharCode.
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function ShopperPage() {
  const { toast } = useToast();
  const [sheetId, setSheetId] = useState("");
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [newMealName, setNewMealName] = useState("");
  const [importResult, setImportResult] = useState<CookbookImportResult | null>(null);
  const [swappingCartMealId, setSwappingCartMealId] = useState<number | null>(null);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddQty, setQuickAddQty] = useState("");
  const [quickAddUnit, setQuickAddUnit] = useState("");

  const { data: meals, refetch: refetchMeals } = useListMeals();
  const { data: cart, refetch: refetchCart } = useGetCart();
  const { data: cravings, refetch: refetchCravings } = useListCravings();
  const { data: staples, refetch: refetchStaples } = useListStaples();
  const [newStapleName, setNewStapleName] = useState("");
  const [newStapleQty, setNewStapleQty] = useState("");
  const [newStapleUnit, setNewStapleUnit] = useState("");
  const [mealDriveExporting, setMealDriveExporting] = useState(false);
  const [remixInput, setRemixInput] = useState("");
  const [remixSuggestion, setRemixSuggestion] = useState<RemixSuggestion | null>(null);
  const [remixAddingToCart, setRemixAddingToCart] = useState(false);
  const [remixSavingToCatalog, setRemixSavingToCatalog] = useState(false);
  const [calPushingShop, setCalPushingShop] = useState(false);
  const [urgentItems, setUrgentItems] = useState<Set<string>>(new Set());
  const [urgentPushingKey, setUrgentPushingKey] = useState<string | null>(null);
  // A scan that came back medium/low confidence — held here so Ray can confirm
  // or fix the name before it ever touches the cart (Task #158). High-confidence
  // scans skip this and are added straight away.
  const [pendingScan, setPendingScan] = useState<{ name: string; confidence: "medium" | "low" } | null>(null);

  const handleMarkUrgent = async (item: any) => {
    const key = item.ingredientName as string;
    const nowUrgent = !urgentItems.has(key);
    setUrgentItems((prev) => {
      const next = new Set(prev);
      if (nowUrgent) next.add(key); else next.delete(key);
      return next;
    });
    if (!nowUrgent) return;
    setUrgentPushingKey(key);
    const today = new Date().toISOString().split("T")[0];
    const result = await pushToCalendar(
      {
        summary: `⚡ URGENT — Pick up: ${key}`,
        description: makeUrgentItemDescription({
          ingredientName: item.ingredientName,
          totalQuantity: item.totalQuantity,
          unit: item.unit,
          estimatedCostCents: item.estimatedCostCents,
        }),
        startTime: today,
        allDay: true,
      },
      "urgent"
    );
    setUrgentPushingKey(null);
    if (result.success) {
      toast({ title: `⚡ Urgent alert pushed!`, description: `"${key}" added to today's calendar.` });
    } else {
      handleCalendarError(result.error ?? "Unknown error", toast);
    }
  };

  const handlePushShoppingToCalendar = async () => {
    const items = (cart?.items ?? []) as any[];
    if (items.length === 0) {
      toast({ title: "No items in cart", description: "Add meals first, then push the shopping reminder.", variant: "destructive" });
      return;
    }
    const weekStart = cart?.weekStartDate ?? new Date().toISOString().split("T")[0];
    setCalPushingShop(true);
    const result = await pushToCalendar({
      summary: `🛒 Grocery Run — Week of ${weekStart}`,
      description: makeShoppingEventDescription({
        weekStartDate: weekStart,
        items: items.map((it: any) => ({
          ingredientName: it.ingredientName,
          totalQuantity: it.totalQuantity,
          unit: it.unit,
          estimatedCostCents: it.estimatedCostCents,
        })),
        totalCostCents: cart?.totalEstimatedCostCents ?? 0,
        budgetCents: cart?.budgetCents ?? 15000,
      }),
      startTime: weekStart,
      allDay: true,
    });
    setCalPushingShop(false);
    if (result.success) {
      toast({ title: "Shopping Reminder pushed!", description: `All-day event added to your calendar for ${weekStart}.` });
    } else {
      handleCalendarError(result.error ?? "Unknown error", toast);
    }
  };

  const handleExportMealPlan = async () => {
    const mealsInCart = (cart?.meals ?? []) as any[];
    if (mealsInCart.length === 0) {
      toast({ title: "No meals in cart", description: "Add meals to this week's cart before exporting.", variant: "destructive" });
      return;
    }
    const lines: string[] = [
      `Brain Guardian Weekly Meal Plan — Week of ${cart?.weekStartDate ?? new Date().toISOString().split("T")[0]}`,
      `Generated: ${formatPacificDateTime(new Date())}`,
      `Budget: $${((cart?.totalEstimatedCostCents ?? 0) / 100).toFixed(2)} of $${((cart?.budgetCents ?? 15000) / 100).toFixed(2)}`,
      `Status: ${(cart?.status ?? "pending").toUpperCase()}`,
      "",
      "== MEALS ==",
      ...mealsInCart.map((m: any, i: number) => [
        `${i + 1}. ${m.name} — $${(m.estimatedCostCents / 100).toFixed(2)}`,
        ...((m.ingredients ?? []) as any[]).map((ing: any) => `   • ${ing.name}: ${ing.quantity} ${ing.unit}`),
      ].join("\n")),
      "",
      "== SHOPPING LIST ==",
      ...((cart as any)?.items ?? []).map((item: any) =>
        `• ${item.ingredientName}: ${item.totalQuantity} ${item.unit} — $${(item.estimatedCostCents / 100).toFixed(2)}`
      ),
    ];
    const content = lines.join("\n");
    const filename = `meal-plan-${cart?.weekStartDate ?? new Date().toISOString().split("T")[0]}.txt`;
    setMealDriveExporting(true);
    try {
      const res = await fetch(`${WORKSPACE_BASE}/api/drive/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content, mimeType: "text/plain" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Drive export failed.");
      toast({ title: "Meal Plan exported!", description: data.link ? `Saved as "${data.filename}"` : "File saved to Google Drive." });
    } catch (err: any) {
      toast({ title: "Drive export failed", description: err?.message ?? "Drive export failed.", variant: "destructive" });
    } finally {
      setMealDriveExporting(false);
    }
  };

  const addMealToCart = useAddMealToCart({ mutation: { onSuccess: () => refetchCart() } });
  const removeMealFromCart = useRemoveMealFromCart({ mutation: { onSuccess: () => refetchCart() } });
  const addCartItem = useAddCartItem({ mutation: {
    onSuccess: (item: any) => {
      refetchCart();
      setQuickAddName("");
      setQuickAddQty("");
      setQuickAddUnit("");
      toast({
        title: item?.alreadyInCart ? "Already in cart" : "Added to cart",
        description: item?.ingredientName,
      });
    },
    onError: () => toast({ title: "Couldn't add item", variant: "destructive" }),
  } });
  // Separate mutation instance for confirming a scanned item so its pending
  // state and onSuccess don't cross-wire with the quick-add form above
  // (both hit the same POST /shopper/cart/items endpoint).
  const confirmScanItem = useAddCartItem({ mutation: {
    onSuccess: (_data: any, variables: any) => {
      refetchCart();
      setPendingScan(null);
      toast({
        title: _data?.alreadyInCart ? "Already in cart" : `Added "${variables?.data?.name}" to the cart`,
        description: _data?.alreadyInCart ? `"${variables?.data?.name}" was already on this week's list.` : undefined,
      });
    },
    onError: () => toast({ title: "Couldn't add item", variant: "destructive" }),
  } });
  const removeCartItem = useRemoveCartItem({ mutation: { onSuccess: () => refetchCart() } });
  const createStaple = useCreateStaple({ mutation: {
    onSuccess: () => { refetchStaples(); setNewStapleName(""); setNewStapleQty(""); setNewStapleUnit(""); },
    onError: (err: any) => toast({
      title: "Couldn't save staple",
      description: err?.response?.data?.error ?? "It may already be on the list.",
      variant: "destructive",
    }),
  } });
  const deleteStaple = useDeleteStaple({ mutation: { onSuccess: () => refetchStaples() } });
  const addStaplesToCart = useAddStaplesToCart({ mutation: {
    onSuccess: (data: any) => {
      refetchCart();
      toast({
        title: data.added > 0 ? `Added ${data.added} staple${data.added === 1 ? "" : "s"} to the cart.` : "Nothing to add",
        description: data.alreadyInCart > 0 ? `${data.alreadyInCart} already in this week's cart.` : undefined,
      });
    },
    onError: () => toast({ title: "Couldn't add staples", description: "The cart may be approved or dismissed.", variant: "destructive" }),
  } });
  const scanCartItem = useScanCartItem({ mutation: {
    onSuccess: (data: any) => {
      if (data.added) {
        refetchCart();
        toast({ title: `Added "${data.identifiedName}" to the cart` });
      } else {
        // Medium/low confidence — hold for Ray to confirm or fix before it's added.
        setPendingScan({ name: data.identifiedName, confidence: data.confidence });
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? "Couldn't identify the product. Try a clearer photo of the barcode or label.";
      toast({ title: "Scan failed", description: msg, variant: "destructive" });
    },
  } });

  const handleScanPhoto = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    try {
      const imageBase64 = await readFileAsBase64(file);
      scanCartItem.mutate({ data: { imageBase64, mimeType: file.type || "image/jpeg" } });
    } catch {
      toast({ title: "Could not read that photo", description: "Try taking the picture again.", variant: "destructive" });
    }
  };
  const approveCart = useApproveCart({ mutation: { onSuccess: () => { refetchCart(); toast({ title: "Cart approved!", description: "Order is ready." }); } } });
  const dismissCart = useDismissCart({ mutation: { onSuccess: () => { refetchCart(); toast({ title: "Cart dismissed." }); } } });
  const syncFromSheets = useSyncFromSheets({ mutation: {
    onSuccess: (data) => { refetchMeals(); toast({ title: `Synced! ${data.mealsImported} meal(s) imported, ${data.rowsProcessed} rows processed.` }); setSheetId(""); },
    onError: () => toast({ title: "Sync failed", description: "Make sure the sheet is publicly shared.", variant: "destructive" }),
  }});
  const shuffleCart = useShuffleCart({ mutation: {
    onSuccess: (data) => {
      refetchCart();
      setSwappingCartMealId(null);
      toast({
        title: `Picked ${data.mealsChosen} meal(s) from ${data.catalogSize} in the catalog.`,
        description: data.repeatsFromRecentWeeks > 0
          ? `${data.repeatsFromRecentWeeks} repeat(s) from recent weeks — the catalog ran out of fresh options.`
          : undefined,
      });
    },
    onError: () => toast({ title: "Shuffle failed", description: "Add meals to the catalog first.", variant: "destructive" }),
  }});
  const swapCartMeal = useSwapCartMeal({ mutation: {
    onSuccess: (data) => { refetchCart(); setSwappingCartMealId(null); toast({ title: `Swapped in ${data.name}.` }); },
    onError: () => toast({ title: "Swap failed", variant: "destructive" }),
  }});
  const importCookbook = useImportCookbook({ mutation: {
    onSuccess: (data) => {
      setImportResult(data);
      refetchMeals();
      toast({ title: `Imported ${data.mealsImported} meal(s)${data.mealsSkipped > 0 ? `, skipped ${data.mealsSkipped}` : ""}.` });
    },
    onError: () => toast({ title: "Import failed", description: "Upload a .zip of the cookbook folder, or the recipe documents themselves.", variant: "destructive" }),
  }});
  const createMeal = useCreateMeal({ mutation: { onSuccess: () => { refetchMeals(); setNewMealName(""); setShowAddMeal(false); toast({ title: "Meal added." }); } } });
  const deleteMeal = useDeleteMeal({ mutation: { onSuccess: () => { refetchMeals(); refetchCart(); } } });
  const updateCraving = useUpdateCraving({ mutation: { onSuccess: () => refetchCravings() } });
  const remixMealPlanMutation = useRemixMealPlan({ mutation: {
    onSuccess: (data) => {
      setRemixSuggestion((data as any).suggestion ?? null);
      setRemixInput("");
      toast({ title: "Meal remixed!", description: "Review the new meal below and add it to the cart." });
    },
    onError: () => toast({ title: "Remix failed", description: "Gemini could not remix the meal.", variant: "destructive" }),
  }});
  const saveRemixMeal = useSaveRemixMeal();

  const handleCookbookFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setImportResult(null);
    try {
      const files = await Promise.all(
        Array.from(fileList).map(async (file) => ({
          fileName: file.name,
          contentBase64: await readFileAsBase64(file),
        }))
      );
      importCookbook.mutate({ data: { files } });
    } catch {
      toast({ title: "Could not read those files", description: "Try re-downloading the folder from Drive.", variant: "destructive" });
    }
  };

  const currentPlanText = (() => {
    const mealsInCart = (cart?.meals ?? []) as any[];
    if (mealsInCart.length === 0) return "";
    return [
      `Weekly Meal Plan — Week of ${cart?.weekStartDate ?? "this week"}`,
      ...mealsInCart.map((m: any) => `• ${m.name} ($${(m.estimatedCostCents / 100).toFixed(2)})`),
      `Total: $${((cart?.totalEstimatedCostCents ?? 0) / 100).toFixed(2)} of $200 budget`,
    ].join("\n");
  })();

  const handleRemix = () => {
    if (!remixInput.trim()) return;
    // Server pools the ingredients of this week's selected recipes itself
    // (falling back to the full catalog when the cart is empty).
    remixMealPlanMutation.mutate({ data: { remixPrompt: remixInput.trim() } });
  };

  const handleAddRemixToCart = async () => {
    if (!remixSuggestion || remixAddingToCart) return;
    setRemixAddingToCart(true);
    try {
      for (const ing of remixSuggestion.ingredients) {
        await addCartItem.mutateAsync({ data: { name: ing.name, quantity: ing.quantity || "1", unit: ing.unit || "each" } });
      }
      refetchCart();
      toast({ title: `"${remixSuggestion.name}" added to cart`, description: `${remixSuggestion.ingredients.length} ingredient(s) added to the shopping list.` });
      setRemixSuggestion(null);
    } catch {
      refetchCart();
      toast({ title: "Couldn't add all ingredients", description: "Some items may not have made it into the cart — check the shopping list.", variant: "destructive" });
    } finally {
      setRemixAddingToCart(false);
    }
  };

  const handleSaveRemixToCatalog = async () => {
    if (!remixSuggestion || remixSavingToCatalog) return;
    setRemixSavingToCatalog(true);
    try {
      await saveRemixMeal.mutateAsync({ data: remixSuggestion });
      await refetchMeals();
      toast({ title: `"${remixSuggestion.name}" saved to catalog`, description: "You can add it to a cart any time from the Meal Catalog." });
      setRemixSuggestion(null);
    } catch (err: any) {
      toast({
        title: "Couldn't save meal",
        description: err?.response?.data?.error ?? "The remixed meal could not be saved.",
        variant: "destructive",
      });
    } finally {
      setRemixSavingToCatalog(false);
    }
  };

  const budget = cart?.budgetCents ?? 15000;
  const spent = cart?.totalEstimatedCostCents ?? 0;
  const budgetPct = Math.min(100, Math.round((spent / budget) * 100));
  const cartMealIds = new Set((cart?.meals ?? []).map((m: any) => m.id));
  const cartStatus = cart?.status ?? "pending";
  const cartIsLocked = cartStatus !== "pending";
  // Everything in the catalog that isn't already on this week's lineup — the
  // "what else could I have" list Ray wants when swapping a meal out.
  const swapChoices = ((meals ?? []) as MealWithIngredients[])
    .filter((m) => !cartMealIds.has(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const fmtDollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="min-h-screen bg-background p-4 space-y-6 max-w-2xl mx-auto">
      <header className="mb-6 border-b border-border/50 pb-4 flex justify-between items-end flex-wrap gap-4">
        <div>
          <h2 className="text-4xl font-display text-primary tracking-widest uppercase">Shopper</h2>
          <p className="text-sm text-muted-foreground mt-1">Weekly meal planning &amp; grocery cart for Pops</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handlePushShoppingToCalendar} disabled={calPushingShop} className="gap-2 shrink-0">
            <CalendarPlus size={14} /> {calPushingShop ? "Pushing…" : "Push to Calendar"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportMealPlan} disabled={mealDriveExporting} className="gap-2 shrink-0">
            <Cloud size={14} /> Export to Drive
          </Button>
        </div>
      </header>

      {/* Budget Rules */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <AlertCircle size={14} className="text-primary" /> Budget Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-sm border border-border/40 bg-secondary/20">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Weekly Cap</p>
              <p className="text-2xl font-display text-primary">$200</p>
            </div>
            <div className="p-3 rounded-sm border-2 border-primary/60 bg-primary/10 relative">
              <div className="absolute -top-2 left-2 px-1.5 py-0.5 bg-primary text-primary-foreground text-[10px] font-bold uppercase rounded-sm">⚠ Critical</div>
              <p className="text-xs font-bold text-primary uppercase tracking-widest">Pepsi Factor</p>
              <p className="text-lg font-display text-primary leading-tight">4× 2L bottles/wk</p>
              <p className="text-xs text-primary/70 mt-0.5">Non-negotiable. Always on list.</p>
            </div>
            <div className="p-3 rounded-sm border border-border/40 bg-secondary/20">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Snack Limit</p>
              <p className="text-xl font-display text-foreground">$25<span className="text-sm text-muted-foreground">/wk</span></p>
            </div>
            <div className="p-3 rounded-sm border border-border/40 bg-secondary/20">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Beverage Limit</p>
              <p className="text-xl font-display text-foreground">$20<span className="text-sm text-muted-foreground">/wk</span></p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Budget Bar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display uppercase tracking-widest">Weekly Budget</CardTitle>
            <div className="flex items-center gap-3">
              <span className={`text-lg font-bold font-display ${budgetPct >= 90 ? "text-destructive" : budgetPct >= 70 ? "text-accent" : "text-success"}`}>
                {fmtDollars(spent)}
              </span>
              <span className="text-muted-foreground text-sm">of {fmtDollars(budget)}</span>
              {cartStatus === "approved" && (
                <span className="px-2 py-0.5 rounded-sm bg-success/10 border border-success/40 text-success text-xs font-bold uppercase">✓ Approved</span>
              )}
              {cartStatus === "dismissed" && (
                <span className="px-2 py-0.5 rounded-sm bg-muted border border-border text-muted-foreground text-xs font-bold uppercase">Dismissed</span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-4 rounded-sm bg-secondary overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-sm ${budgetPct >= 90 ? "bg-destructive" : budgetPct >= 70 ? "bg-accent" : "bg-success"}`}
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{budgetPct}% of $150 budget used</p>
        </CardContent>
      </Card>

      {/* This Week's Cart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
              <ShoppingCart size={16} /> This Week's Meal Lineup
            </CardTitle>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Week of {cart?.weekStartDate ?? "..."}</span>
              {!cartIsLocked && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => shuffleCart.mutate({ data: {} })}
                  disabled={shuffleCart.isPending || (meals ?? []).length === 0}
                >
                  <Shuffle size={12} className={`mr-1 ${shuffleCart.isPending ? "animate-spin" : ""}`} />
                  {(cart?.meals ?? []).length > 0 ? "Reshuffle" : "Shuffle week"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {(cart?.dietaryRestrictions ?? []).length > 0 && (
            <div className="mb-3 flex items-start gap-2 rounded-sm border border-amber-500/30 bg-amber-500/10 p-2.5">
              <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs">
                <span className="font-bold uppercase tracking-wider text-amber-500">On file: </span>
                <span className="text-foreground">{(cart?.dietaryRestrictions ?? []).join(" · ")}</span>
                <span className="text-muted-foreground"> — check this week's meals against these before approving.</span>
              </p>
            </div>
          )}

          {(cart?.meals ?? []).length === 0 ? (
            <p className="text-muted-foreground italic text-sm text-center py-4">
              No meals picked yet. Hit <span className="font-semibold text-foreground">Shuffle week</span> to fill it from the catalog, or add meals by hand below.
            </p>
          ) : (
            <div className="space-y-2">
              {(cart?.meals ?? []).map((meal: any) => (
                <div key={meal.cartMealId ?? meal.id} className="flex items-start justify-between gap-3 p-3 bg-secondary/30 rounded-sm border border-border/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{meal.name}</span>
                      <span className="text-xs text-primary font-bold">{fmtDollars(meal.estimatedCostCents)}</span>
                    </div>
                    {meal.description && <p className="text-xs text-muted-foreground mt-0.5">{meal.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(meal.ingredients ?? []).slice(0, 4).map((ing: any) => (
                        <span key={ing.id} className="text-xs px-1.5 py-0.5 bg-primary/10 border border-primary/20 rounded-sm text-primary/80">
                          {ing.name}
                        </span>
                      ))}
                      {(meal.ingredients ?? []).length > 4 && (
                        <span className="text-xs text-muted-foreground">+{(meal.ingredients ?? []).length - 4} more</span>
                      )}
                    </div>
                  </div>
                  {!cartIsLocked && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-primary h-7 px-2 text-xs"
                        onClick={() => setSwappingCartMealId(swappingCartMealId === meal.cartMealId ? null : meal.cartMealId)}
                      >
                        <Repeat size={12} className="mr-1" /> Swap
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive h-7 w-7 p-0"
                        onClick={() => removeMealFromCart.mutate({ cartMealId: meal.cartMealId })}
                        disabled={removeMealFromCart.isPending}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {swappingCartMealId !== null && !cartIsLocked && (
            <div className="mt-3 rounded-sm border border-primary/30 bg-secondary/20 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Swap in — {swapChoices.length} other meal{swapChoices.length === 1 ? "" : "s"} available
                </p>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setSwappingCartMealId(null)}>
                  <X size={12} />
                </Button>
              </div>
              {swapChoices.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Every meal in the catalog is already in this week's lineup.</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {swapChoices.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      disabled={swapCartMeal.isPending}
                      onClick={() => swapCartMeal.mutate({ cartMealId: swappingCartMealId, data: { mealId: choice.id } })}
                      className="w-full text-left p-2 rounded-sm hover:bg-primary/10 border border-transparent hover:border-primary/30 disabled:opacity-50"
                    >
                      <span className="text-sm font-semibold">{choice.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {(choice.ingredients ?? []).length} ingredients
                      </span>
                      {choice.description && (
                        <p className="text-xs text-muted-foreground/80 truncate">{choice.description.split("\n")[0]}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!cartIsLocked && (cart?.meals ?? []).length > 0 && (
            <div className="flex gap-2 mt-4 pt-4 border-t border-border/30">
              <Button
                className="flex-1"
                onClick={() => approveCart.mutate()}
                disabled={approveCart.isPending}
              >
                <CheckCircle size={16} className="mr-2" />
                Approve Order — {fmtDollars(spent)}
              </Button>
              <Button
                variant="outline"
                onClick={() => dismissCart.mutate()}
                disabled={dismissCart.isPending}
              >
                Dismiss
              </Button>
            </div>
          )}

          {cartIsLocked && (
            <p className="text-xs text-muted-foreground italic mt-4 pt-3 border-t border-border/30">
              Cart is {cartStatus}. A new cart will be created next Monday.
            </p>
          )}

          {((cart?.items ?? []).length > 0 || !cartIsLocked) && (
            <div className="mt-4 pt-4 border-t border-border/30">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Shopping List</p>
              {!cartIsLocked && (
                <form
                  className="flex items-center gap-1.5 mb-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = quickAddName.trim();
                    if (!name || addCartItem.isPending) return;
                    addCartItem.mutate({ data: {
                      name,
                      ...(quickAddQty.trim() ? { quantity: quickAddQty.trim() } : {}),
                      ...(quickAddUnit.trim() ? { unit: quickAddUnit.trim() } : {}),
                    } });
                  }}
                >
                  <Input
                    value={quickAddName}
                    onChange={(e) => setQuickAddName(e.target.value)}
                    placeholder="Add an item (e.g. paper towels)"
                    className="h-8 text-xs flex-1"
                  />
                  <Input
                    value={quickAddQty}
                    onChange={(e) => setQuickAddQty(e.target.value)}
                    placeholder="Qty"
                    className="h-8 text-xs w-14"
                  />
                  <Input
                    value={quickAddUnit}
                    onChange={(e) => setQuickAddUnit(e.target.value)}
                    placeholder="Unit"
                    className="h-8 text-xs w-20"
                  />
                  <Button type="submit" size="sm" className="h-8 text-xs shrink-0" disabled={!quickAddName.trim() || addCartItem.isPending}>
                    <Plus size={12} className="mr-1" /> Add
                  </Button>
                </form>
              )}
              {!cartIsLocked && (
                <div className="mb-3">
                  <label
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border/50 text-xs font-medium cursor-pointer transition-colors ${
                      scanCartItem.isPending || !!pendingScan ? "opacity-50 pointer-events-none" : "hover:bg-secondary/40 hover:border-primary/40"
                    }`}
                  >
                    {scanCartItem.isPending ? <RefreshCw size={12} className="animate-spin" /> : <Camera size={12} />}
                    {scanCartItem.isPending ? "Identifying…" : "Scan barcode or photo"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={scanCartItem.isPending || !!pendingScan}
                      onChange={(e) => {
                        void handleScanPhoto(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <span className="ml-2 text-[11px] text-muted-foreground">Snap the product or its barcode — it's added by name.</span>
                </div>
              )}
              {pendingScan && (
                <div className="mb-3 p-3 rounded-sm border border-amber-500/40 bg-amber-500/5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Confirm scanned item</p>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-sm shrink-0 ${
                      pendingScan.confidence === "low" ? "bg-destructive/10 text-destructive" : "bg-amber-500/15 text-amber-600"
                    }`}>
                      {pendingScan.confidence} confidence
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">The scanner wasn't fully sure — check the name below, edit it if needed, then add it.</p>
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={pendingScan.name}
                      onChange={(e) => setPendingScan({ ...pendingScan, name: e.target.value })}
                      className="h-8 text-xs flex-1"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-8 text-xs shrink-0"
                      disabled={!pendingScan.name.trim() || confirmScanItem.isPending}
                      onClick={() => {
                        const name = pendingScan.name.trim();
                        if (!name) return;
                        confirmScanItem.mutate({ data: { name } });
                      }}
                    >
                      {confirmScanItem.isPending ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} className="mr-1" />}
                      Add
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs shrink-0" disabled={confirmScanItem.isPending} onClick={() => setPendingScan(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                {(cart?.items ?? []).map((item: any) => {
                  const isUrgent = urgentItems.has(item.ingredientName);
                  const isPushing = urgentPushingKey === item.ingredientName;
                  return (
                    <div key={item.id} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm text-xs transition-colors ${isUrgent ? "bg-accent/10 border border-accent/30" : "hover:bg-secondary/30"}`}>
                      <span className={`${isUrgent ? "text-accent font-bold" : "text-foreground/80"}`}>
                        {isUrgent && "⚡ "}{item.ingredientName} <span className="text-muted-foreground font-normal">×{item.totalQuantity} {item.unit}</span>
                        {item.source === "manual" && <span className="ml-1.5 text-[10px] uppercase font-bold text-primary/70">added</span>}
                        {item.source === "staple" && <span className="ml-1.5 text-[10px] uppercase font-bold text-primary/70">staple</span>}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground">{item.source !== "meal" ? "—" : fmtDollars(item.estimatedCostCents)}</span>
                        <button
                          onClick={() => handleMarkUrgent(item)}
                          disabled={isPushing}
                          title={isUrgent ? "Marked urgent — click to un-mark" : "Mark urgent & push calendar alert"}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50 ${
                            isUrgent
                              ? "bg-accent/20 border-accent/50 text-accent"
                              : "border-border/40 text-muted-foreground/60 hover:border-accent/40 hover:text-accent"
                          }`}
                        >
                          {isPushing ? <RefreshCw size={8} className="animate-spin" /> : <CalendarPlus size={8} />}
                          {isPushing ? "…" : isUrgent ? "Urgent" : "Urgent"}
                        </button>
                        {item.source !== "meal" && !cartIsLocked && (
                          <button
                            onClick={() => removeCartItem.mutate({ cartItemId: item.id })}
                            disabled={removeCartItem.isPending}
                            title="Remove this item"
                            className="p-1 rounded-sm text-muted-foreground/60 hover:text-destructive transition-colors disabled:opacity-50"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recurring Staples */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
              <Repeat size={16} className="text-primary" /> Recurring Staples
            </CardTitle>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => addStaplesToCart.mutate({ data: {} })}
              disabled={addStaplesToCart.isPending || (staples ?? []).length === 0 || cartIsLocked}
            >
              {addStaplesToCart.isPending
                ? <RefreshCw size={12} className="mr-1 animate-spin" />
                : <ShoppingCart size={12} className="mr-1" />}
              Add All to Cart
            </Button>
          </div>
          <CardDescription className="text-xs">
            The household's usuals — coffee, toilet paper, dish soap. One tap drops them into this week's cart.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex items-center gap-1.5 mb-3"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newStapleName.trim();
              if (!name || createStaple.isPending) return;
              createStaple.mutate({ data: {
                name,
                ...(newStapleQty.trim() ? { quantity: newStapleQty.trim() } : {}),
                ...(newStapleUnit.trim() ? { unit: newStapleUnit.trim() } : {}),
              } });
            }}
          >
            <Input
              value={newStapleName}
              onChange={(e) => setNewStapleName(e.target.value)}
              placeholder="Add a staple (e.g. coffee)"
              className="h-8 text-xs flex-1"
            />
            <Input value={newStapleQty} onChange={(e) => setNewStapleQty(e.target.value)} placeholder="Qty" className="h-8 text-xs w-14" />
            <Input value={newStapleUnit} onChange={(e) => setNewStapleUnit(e.target.value)} placeholder="Unit" className="h-8 text-xs w-20" />
            <Button type="submit" size="sm" className="h-8 text-xs shrink-0" disabled={!newStapleName.trim() || createStaple.isPending}>
              <Plus size={12} className="mr-1" /> Save
            </Button>
          </form>

          {(staples ?? []).length === 0 ? (
            <p className="text-muted-foreground italic text-sm text-center py-3">
              No staples saved yet. Add the items you buy every week above.
            </p>
          ) : (
            <div className="space-y-1.5">
              {(staples ?? []).map((staple: StapleItem) => {
                const inCart = (cart?.items ?? []).some(
                  (it: any) => it.ingredientName.trim().toLowerCase() === staple.name.trim().toLowerCase()
                );
                return (
                  <div key={staple.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-sm text-xs hover:bg-secondary/30">
                    <span className="text-foreground/80">
                      {staple.name} <span className="text-muted-foreground font-normal">×{staple.quantity} {staple.unit}</span>
                      {inCart && <span className="ml-1.5 text-[10px] uppercase font-bold text-primary/70">✓ in cart</span>}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {!cartIsLocked && !inCart && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2"
                          onClick={() => addStaplesToCart.mutate({ data: { stapleIds: [staple.id] } })}
                          disabled={addStaplesToCart.isPending}
                        >
                          <Plus size={10} className="mr-0.5" /> Add
                        </Button>
                      )}
                      <button
                        onClick={() => deleteStaple.mutate({ id: staple.id })}
                        disabled={deleteStaple.isPending}
                        title="Remove from staples list"
                        className="p-1 rounded-sm text-muted-foreground/60 hover:text-destructive transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Craving Suggestions */}
      {(cravings ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
              <Flame size={16} className="text-accent" /> Pops' Cravings
            </CardTitle>
            <CardDescription className="text-xs">Jessica captured these during check-ins — add to next week if you want</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(cravings ?? []).map((craving: MealCraving) => (
                <div key={craving.id} className="flex items-center justify-between gap-3 p-3 bg-accent/5 border border-accent/20 rounded-sm">
                  <div className="flex items-center gap-2">
                    <Flame size={14} className="text-accent shrink-0" />
                    <span className="text-sm font-semibold">{craving.mealName}</span>
                    <span className="text-xs text-muted-foreground">via {craving.source}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => updateCraving.mutate({ id: craving.id, data: { status: "added" } })}
                      disabled={updateCraving.isPending}
                    >
                      <Check size={12} className="mr-1" /> Add to List
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => updateCraving.mutate({ id: craving.id, data: { status: "dismissed" } })}
                      disabled={updateCraving.isPending}
                    >
                      <X size={12} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Meal Remix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Wand2 size={16} className="text-primary" /> AI Meal Remix
          </CardTitle>
          <CardDescription className="text-xs">Gemini recombines the ingredients of this week's recipes into a brand-new meal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 rounded-sm border border-border/40 bg-secondary/20 min-h-[80px] text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs leading-relaxed">
            {currentPlanText || "Cart is empty — Gemini will remix from the whole recipe catalog instead."}
          </div>
          <div className="flex gap-2">
            <Input
              value={remixInput}
              onChange={(e) => setRemixInput(e.target.value)}
              placeholder="e.g. Something low-sodium with the chicken and the fajita fixings"
              className="flex-1 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && remixInput.trim()) handleRemix(); }}
            />
            <Button size="sm" onClick={handleRemix} disabled={!remixInput.trim() || remixMealPlanMutation.isPending}>
              {remixMealPlanMutation.isPending ? <RefreshCw size={14} className="animate-spin mr-1" /> : <Wand2 size={14} className="mr-1" />}
              Remix
            </Button>
          </div>
          {remixSuggestion && (
            <div className="p-3 rounded-sm border border-primary/40 bg-primary/5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{remixSuggestion.name}</p>
                  {remixSuggestion.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{remixSuggestion.description}</p>
                  )}
                </div>
                <button onClick={() => setRemixSuggestion(null)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Dismiss</button>
              </div>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {remixSuggestion.ingredients.map((ing, i) => (
                  <li key={i}>• {ing.name} — {ing.quantity} {ing.unit}</li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleAddRemixToCart} disabled={remixAddingToCart || cartIsLocked}>
                  {remixAddingToCart ? <RefreshCw size={14} className="animate-spin mr-1" /> : <Plus size={14} className="mr-1" />}
                  Add ingredients to cart
                </Button>
                <Button size="sm" variant="outline" onClick={handleSaveRemixToCatalog} disabled={remixSavingToCatalog}>
                  {remixSavingToCatalog ? <RefreshCw size={14} className="animate-spin mr-1" /> : <CheckCircle size={14} className="mr-1" />}
                  Save to catalog
                </Button>
              </div>
              {cartIsLocked && (
                <p className="text-xs text-muted-foreground">This week's cart is {cartStatus} — reset it to add the remix.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meal Catalog */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-display uppercase tracking-widest">Meal Catalog</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowAddMeal(!showAddMeal)}>
              <Plus size={14} className="mr-1" /> New Meal
            </Button>
          </div>
          <CardDescription className="text-xs">Click a meal to add it to this week's cart</CardDescription>
        </CardHeader>
        <CardContent>
          {showAddMeal && (
            <form
              className="flex gap-2 mb-4 p-3 bg-secondary/30 rounded-sm border border-border/30"
              onSubmit={(e) => {
                e.preventDefault();
                if (newMealName.trim()) createMeal.mutate({ data: { name: newMealName.trim() } });
              }}
            >
              <Input
                value={newMealName}
                onChange={(e) => setNewMealName(e.target.value)}
                placeholder="Meal name..."
                className="flex-1 h-8 text-sm"
              />
              <Button type="submit" size="sm" disabled={createMeal.isPending || !newMealName.trim()} className="h-8">
                Add
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setShowAddMeal(false)}>
                <X size={14} />
              </Button>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(meals ?? []).map((meal: MealWithIngredients) => {
              const inCart = cartMealIds.has(meal.id);
              return (
                <div
                  key={meal.id}
                  className={`p-3 rounded-sm border transition-colors ${inCart ? "bg-primary/10 border-primary/40" : "bg-secondary/20 border-border/30 hover:border-primary/30 hover:bg-secondary/40"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{meal.name}</span>
                        <span className="text-xs text-primary font-bold">{fmtDollars(meal.estimatedCostCents)}</span>
                        {inCart && <span className="text-xs text-primary font-bold uppercase">✓ In Cart</span>}
                      </div>
                      {meal.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{meal.description}</p>}
                      <p className="text-xs text-muted-foreground/70 mt-0.5">{meal.ingredients?.length ?? 0} ingredients</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!cartIsLocked && !inCart && (
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => addMealToCart.mutate({ data: { mealId: meal.id } })}
                          disabled={addMealToCart.isPending}
                        >
                          <Plus size={12} className="mr-1" /> Add
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMeal.mutate({ id: meal.id })}
                        disabled={deleteMeal.isPending}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Drive Cookbook Import */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <Upload size={16} /> Import from Drive Cookbook
          </CardTitle>
          <CardDescription className="text-xs">
            Download your Drive "cookbook" folder (Drive → right-click the folder → Download) and drop the .zip here.
            Individual .docx / .md files work too. One recipe per document; the Koda-safe variant is skipped.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <input
            type="file"
            multiple
            accept=".zip,.docx,.md,.markdown,.txt"
            disabled={importCookbook.isPending}
            onChange={(e) => {
              void handleCookbookFiles(e.target.files);
              e.target.value = "";
            }}
            className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary-foreground hover:file:opacity-90 disabled:opacity-50"
          />

          {importCookbook.isPending && (
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
              <RefreshCw size={12} className="animate-spin" /> Reading documents…
            </p>
          )}

          {importResult && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="font-bold text-primary">{importResult.mealsImported} imported</span>
                <span className="text-muted-foreground">{importResult.mealsSkipped} skipped</span>
                <span className="text-muted-foreground/70">{importResult.filesScanned} file(s) scanned</span>
              </div>

              {importResult.imported.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Added to catalog</p>
                  <ul className="space-y-0.5 max-h-48 overflow-y-auto">
                    {importResult.imported.map((m) => (
                      <li key={m.fileName} className="text-xs flex items-start gap-2">
                        <Check size={12} className="text-primary mt-0.5 shrink-0" />
                        <span>
                          <span className="font-semibold">{m.name}</span>{" "}
                          <span className="text-muted-foreground">
                            — {m.ingredientCount} ingredient{m.ingredientCount === 1 ? "" : "s"}
                            {m.ingredientsMissingQuantity > 0 && `, ${m.ingredientsMissingQuantity} without a stated quantity`}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.skipped.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Skipped</p>
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {importResult.skipped.map((s) => (
                      <li key={s.fileName} className="text-xs flex items-start gap-2">
                        <FileWarning size={12} className="text-muted-foreground mt-0.5 shrink-0" />
                        <span>
                          <span className="font-semibold">{SKIP_REASON_LABELS[s.reason] ?? s.reason}</span>{" "}
                          <span className="text-muted-foreground">— {s.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importResult.imported.some((m) => m.ingredientsMissingQuantity > 0) && (
                <p className="text-xs text-muted-foreground/80 border-t border-border pt-2">
                  Quantities were left blank wherever the recipe document didn't state one — nothing was guessed.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Google Sheets Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-display uppercase tracking-widest flex items-center gap-2">
            <RefreshCw size={16} /> Sync from Google Sheets
          </CardTitle>
          <CardDescription className="text-xs">
            Paste the ID of a publicly-shared Google Sheet (File → Share → "Anyone with link" view access).
            Format: Column A = Meal Name, B = Ingredient, C = Quantity, D = Unit, E = Cost ($).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={sheetId}
              onChange={(e) => setSheetId(e.target.value)}
              placeholder="Sheet ID (from the URL: /spreadsheets/d/HERE/edit)"
              className="flex-1 text-sm font-mono"
            />
            <Button
              onClick={() => syncFromSheets.mutate({ data: { sheetId } })}
              disabled={!sheetId.trim() || syncFromSheets.isPending}
            >
              {syncFromSheets.isPending ? <RefreshCw size={14} className="animate-spin mr-2" /> : <RefreshCw size={14} className="mr-2" />}
              Sync
            </Button>
          </div>
          {syncFromSheets.isError && (
            <p className="text-xs text-destructive mt-2">Sync failed — make sure the sheet is shared publicly with view access.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
