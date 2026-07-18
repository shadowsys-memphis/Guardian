import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { pool } from "@workspace/db";
import { requireAnySession, requireLocalSession } from "../middlewares/tenant-auth";

const router: IRouter = Router();

function getStripe() {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Stripe = require("stripe") as typeof import("stripe").default;
  return new Stripe(key);
}

const PLAN_PRICE_MAP: Record<string, string | undefined> = {
  family: process.env["STRIPE_FAMILY_PRICE_ID"],
  multi_care: process.env["STRIPE_MULTI_CARE_PRICE_ID"],
};

// ─── PUBLIC: no auth required ──────────────────────────────────────────────

router.post("/billing/checkout", async (req: Request, res: Response) => {
  try {
    const body = z.object({
      plan: z.enum(["family", "multi_care"]),
      email: z.string().email(),
      family_name: z.string().optional(),
    }).parse(req.body);

    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Billing not configured. Contact support." });
      return;
    }

    const priceId = PLAN_PRICE_MAP[body.plan];
    if (!priceId) {
      res.status(503).json({ error: "Plan price not configured." });
      return;
    }

    const tenantResult = await pool.query(
      `INSERT INTO tenants (name, email, plan, status)
       VALUES ($1, $2, $3, 'pending_checkout')
       RETURNING id`,
      [body.family_name || body.email, body.email, body.plan]
    );
    const tenantId = tenantResult.rows[0].id as string;

    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const successUrl = process.env["STRIPE_CHECKOUT_SUCCESS_URL"]
      || `${proto}://${host}/guardian/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = process.env["STRIPE_CHECKOUT_CANCEL_URL"]
      || `${proto}://${host}/guardian`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: body.email,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { tenant_id: tenantId },
      },
      metadata: { tenant_id: tenantId },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.json({ url: session.url });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: err.errors });
      return;
    }
    req.log.error({ err }, "Checkout session creation failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

/**
 * POST /billing/webhook — Stripe calls this server-side.
 *
 * On checkout.session.completed:
 *   - Activates the tenant (status → trialing/active)
 *   - Generates a cryptographically random 64-char setup token
 *   - Stores its SHA-256 hash as setup_token_hash (for verification in /tenants/setup)
 *   - Stores the raw token in setup_token_pending (cleared after one retrieval)
 */
router.post("/billing/webhook", async (req: Request, res: Response) => {
  const stripe = getStripe();
  const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];

  if (!stripe || !webhookSecret) {
    res.status(200).json({ received: true });
    return;
  }

  let event: import("stripe").Stripe.Event;
  try {
    const sig = req.headers["stripe-signature"] as string;
    // req.body is a Buffer (from express.raw()) — required for Stripe signature verification
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      webhookSecret
    );
  } catch (err) {
    req.log.error({ err }, "Webhook signature verification failed");
    res.status(400).json({ error: "Invalid signature" });
    return;
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as import("stripe").Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenant_id;
      if (!tenantId) { res.json({ received: true }); return; }

      const sub = session.subscription as string | null;
      let trialEnd: Date | null = null;
      let periodEnd: Date | null = null;
      let status = "active";

      if (sub) {
        try {
          const subscription = await stripe.subscriptions.retrieve(sub);
          if (subscription.trial_end) {
            trialEnd = new Date(subscription.trial_end * 1000);
            status = "trialing";
          }
          if (subscription.current_period_end) {
            periodEnd = new Date(subscription.current_period_end * 1000);
          }
        } catch {}
      }

      // Generate the one-time setup token here in the webhook.
      // Raw token is stored temporarily in setup_token_pending for retrieval
      // by GET /billing/checkout-session. Hash is stored permanently for
      // verification by POST /tenants/setup. Both are cleared after setup.
      const rawToken = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");

      await pool.query(
        `UPDATE tenants
         SET stripe_customer_id = $1,
             stripe_subscription_id = $2,
             status = $3,
             trial_ends_at = $4,
             current_period_end = $5,
             setup_token_hash = $6,
             setup_token_pending = $7,
             updated_at = NOW()
         WHERE id = $8`,
        [session.customer, sub, status, trialEnd, periodEnd, tokenHash, rawToken, tenantId]
      );
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as import("stripe").Stripe.Subscription;
      await pool.query(
        `UPDATE tenants SET status = 'cancelled', updated_at = NOW()
         WHERE stripe_subscription_id = $1`,
        [subscription.id]
      );
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as import("stripe").Stripe.Invoice;
      if (invoice.subscription) {
        await pool.query(
          `UPDATE tenants SET status = 'past_due', updated_at = NOW()
           WHERE stripe_subscription_id = $1`,
          [invoice.subscription]
        );
      }
    } else if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as import("stripe").Stripe.Subscription;
      let status = "active";
      if (subscription.status === "trialing") status = "trialing";
      else if (subscription.status === "past_due") status = "past_due";
      else if (subscription.status === "canceled") status = "cancelled";
      await pool.query(
        `UPDATE tenants
         SET status = $1,
             trial_ends_at = $2,
             current_period_end = $3,
             updated_at = NOW()
         WHERE stripe_subscription_id = $4`,
        [
          status,
          subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
          subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null,
          subscription.id,
        ]
      );
    }

    res.json({ received: true });
  } catch (err) {
    req.log.error({ err }, "Webhook processing failed");
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

/**
 * GET /billing/checkout-session — retrieval only.
 * Verifies the Stripe session belongs to a real paid checkout, then returns
 * the raw setup token generated by the webhook. The token is cleared from the
 * DB immediately so it can only be retrieved once.
 */
router.get("/billing/checkout-session", async (req: Request, res: Response) => {
  try {
    const sessionId = z.string().min(1).parse(req.query["session_id"]);
    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Billing not configured" });
      return;
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const tenantId = session.metadata?.tenant_id;
    if (!tenantId) {
      res.status(400).json({ error: "Invalid session" });
      return;
    }

    const result = await pool.query(
      `SELECT id, name, status, setup_completed_at, setup_token_pending
       FROM tenants WHERE id = $1`,
      [tenantId]
    );
    const tenant = result.rows[0];
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    if (tenant.setup_completed_at) {
      res.status(400).json({ error: "Setup already completed. Please sign in." });
      return;
    }
    if (!["trialing", "active", "pending_checkout"].includes(tenant.status)) {
      res.status(400).json({ error: "Checkout not completed — webhook may still be processing." });
      return;
    }

    // Return the raw token generated by the webhook and clear it atomically.
    // If setup_token_pending is null (webhook hasn't fired yet), we still allow
    // the user to see the setup page — they'll get an invalid-token error when
    // they submit, at which point they can refresh and retry.
    const rawToken = tenant.setup_token_pending ?? null;
    if (rawToken) {
      await pool.query(
        `UPDATE tenants SET setup_token_pending = NULL, updated_at = NOW() WHERE id = $1`,
        [tenant.id]
      );
    }

    res.json({
      tenantId: tenant.id,
      tenantName: tenant.name,
      setupToken: rawToken,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to retrieve checkout session");
    res.status(500).json({ error: "Failed to retrieve session" });
  }
});

// ─── PRIVATE: require any valid session (local or tenant) ────────────────────

router.get("/billing/status", requireAnySession, async (req: Request, res: Response) => {
  const session = (req as any).tenantSession;
  if (session.type === "local") {
    res.json({ plan: "local", status: "active", type: "local" });
    return;
  }
  try {
    const result = await pool.query(
      `SELECT plan, status, trial_ends_at, current_period_end FROM tenants WHERE id = $1`,
      [session.sub]
    );
    const tenant = result.rows[0];
    if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }
    res.json({
      plan: tenant.plan,
      status: tenant.status,
      trialEndsAt: tenant.trial_ends_at,
      currentPeriodEnd: tenant.current_period_end,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch billing status");
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

router.post("/billing/customer-portal", requireAnySession, async (req: Request, res: Response) => {
  const session = (req as any).tenantSession;
  if (session.type === "local") {
    res.status(400).json({ error: "Local workspace has no Stripe subscription." });
    return;
  }
  try {
    const stripe = getStripe();
    if (!stripe) {
      res.status(503).json({ error: "Billing not configured" });
      return;
    }
    const result = await pool.query(
      `SELECT stripe_customer_id FROM tenants WHERE id = $1`,
      [session.sub]
    );
    const tenant = result.rows[0];
    if (!tenant?.stripe_customer_id) {
      res.status(400).json({ error: "No Stripe customer found" });
      return;
    }

    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const returnUrl = process.env["STRIPE_CUSTOMER_PORTAL_RETURN_URL"]
      || `${proto}://${host}/my-subscription`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: returnUrl,
    });
    res.json({ url: portalSession.url });
  } catch (err) {
    req.log.error({ err }, "Failed to create customer portal session");
    res.status(500).json({ error: "Failed to open billing portal" });
  }
});

/**
 * GET /billing/subscribers — Ray's admin-panel view of all tenants.
 * Local-only. Returns all tenant rows ordered by created_at desc.
 */
router.get("/billing/subscribers", requireLocalSession, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, plan, status, stripe_customer_id,
              trial_ends_at, current_period_end, setup_completed_at,
              created_at, updated_at,
              updated_at AS last_active_at
       FROM tenants
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list subscribers");
    res.status(500).json({ error: "Failed to list subscribers" });
  }
});

export default router;
