# Guardian.OS - Multimodal Phone Intake Protocol

## Objective
To allow Raymo (Admin) to manage household inventory, grocery lists, and budget audits entirely through the AI phone agent (via SMS, MMS, and Voice), minimizing the need to look at a visual dashboard.

## 1. Intake Methods for the Agent

### A. MMS / Image Processing (Visual Inventory)
Instead of manually typing out what is missing, the system will use Gemini's vision capabilities via the phone number:
*   **Pantry/Fridge Audits:** Raymo snaps a photo of the open fridge or pantry and texts it to the agent. The agent replies: *"I see we are low on milk and eggs. Adding them to the weekly Walmart cart."*
*   **Receipt Parsing:** Raymo snaps a photo of a receipt. The agent extracts item names, quantities, and exact prices to update the `$150/week` budget tracker and establish baseline pricing.

### B. Voice Dictation (On-the-go Updates)
*   **Quick Adds:** Raymo calls or sends an audio message: *"Jessica, add bulk toilet paper to the quarterly list, and we need taco seasoning for tonight."*
*   **Price Logging:** *"I just paid $9.50 for the 4-pack of Pepsi."* -> Agent updates the specific baseline price for the 'Pepsi Factor'.

## 2. Data Structure for Agent Parsing
When the agent receives an image or voice note, it will extract the data into this JSON structure before pushing it to the PostgreSQL database:

```json
{
  "intake_method": "mms_receipt",
  "timestamp": "2026-06-27T12:00:00Z",
  "items_detected": [
    {
      "name": "Pepsi 2L",
      "quantity": 4,
      "price_per_unit": 2.25,
      "category": "food",
      "replenishment_cycle": "weekly"
    },
    {
      "name": "Bounty Paper Towels 6-pack",
      "quantity": 1,
      "price_per_unit": 14.99,
      "category": "paper",
      "replenishment_cycle": "quarterly"
    }
  ],
  "budget_impact": 23.99
}
```

## 3. Today's Data Collection
While the Twilio/phone bridge to the new database is being built, **the AI Studio chat acts as the prototype phone receiver.** 

Raymo can upload images of receipts, pantries, or dictate lists directly into this chat to train the system on exact current prices and inventory levels.
