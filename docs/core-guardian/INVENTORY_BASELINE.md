# Guardian.OS - Inventory & Replenishment Baseline

This document establishes the baseline inventory and replenishment cycles for the Shopper Engine. This ensures that essential household items (food, paper, toiletries) are tracked and restocked predictably, separating weekly perishables from bulk quarterly/yearly purchases.

## 1. Replenishment Cycles

### Weekly (The $150/week Budget)
*   **Focus:** Perishables, snacks, and strict routine items.
*   **Routine Critical:** Exactly 4x Pepsi (2L) bottles.
*   **Breakfast Staples:** Bacon, Eggs, Hash browns, Cinnamon Toast Crunch.
*   **Dinner Proteins/Veggies:** Ground beef, Steak, Chicken (Pollo Asada), California Veggies.
*   **Snacks/Treats:** Snack cakes, Orange creme ice cream bars (Max $25/week).
*   **Beverages:** (Max $20/week).

### Monthly Replenishment
*   **Focus:** Fast-moving non-perishables and regular cleaning supplies.
*   **Paper Products:** Paper plates, paper bowls, napkins.
*   **Cleaning:** Dish soap, kitchen sponges, laundry detergent (if heavy usage).
*   **Toiletries:** Toothpaste, body wash/soap.

### Quarterly Replenishment
*   **Focus:** Bulk household items and slow-moving toiletries.
*   **Paper Products:** Toilet paper (bulk pack), Paper towels (bulk pack), Tissues.
*   **Cleaning:** Trash bags (kitchen and bathroom), multi-surface cleaner, toilet bowl cleaner, laundry detergent (if bulk).
*   **Toiletries:** Shampoo/Conditioner, shaving cream, razors, deodorant.
*   **Pantry Staples:** Spices (Taco Bell seasoning), salt, pepper, cooking oil, rice/pasta (Spiral pasta) if bought in bulk.

### Yearly Replenishment
*   **Focus:** Maintenance and emergency items.
*   **Household:** HVAC Air filters, batteries (AA, AAA), lightbulbs.
*   **Medical/Hygiene:** First aid supplies (band-aids, ointment), seasonal allergy meds, replaced toothbrushes.

## 2. Integration with the Shopper Engine

To support this in Guardian.OS, the **Shopper Agent** will use a dual-mode approach:

1.  **Weekly Mode:** Focuses strictly on the $150/week grocery budget for meals and routine snacks.
2.  **Audit Mode (Monthly/Quarterly):** Prompts the Admin (Raymo) for a visual inventory check of the bulk categories. 
    *   *Example prompt from Jessica:* "Hey Ray, it's the start of the quarter. Do we need to add a bulk pack of toilet paper or paper towels to the Walmart order?"
    *   Bulk items will be separated from the strict $150/week food budget to prevent skewing the weekly meal planning.

## 3. Database Schema Concept (For `inventory_items`)
When we build this into the PostgreSQL database, it will look like this:
*   `id` (uuid)
*   `item_name` (e.g., "Toilet Paper - Bulk")
*   `category` (enum: 'food', 'paper', 'toiletry', 'cleaning', 'medical')
*   `replenishment_cycle` (enum: 'weekly', 'monthly', 'quarterly', 'yearly')
*   `last_restocked_date` (timestamp)
*   `estimated_run_out_date` (timestamp) - Calculated automatically
