import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { smartHomeDevicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

const DEFAULT_DEVICES = [
  { deviceKey: "living_room_echo", name: "Living Room Echo", type: "alexa", room: "Living Room", isOn: true },
  { deviceKey: "bedroom_echo", name: "Bedroom Echo", type: "alexa", room: "Bedroom", isOn: false },
  { deviceKey: "kitchen_echo", name: "Kitchen Echo", type: "alexa", room: "Kitchen", isOn: false },
  { deviceKey: "sonos_living", name: "Sonos — Living Room", type: "sonos", room: "Living Room", isOn: false, volume: 30 },
  { deviceKey: "sonos_bedroom", name: "Sonos — Bedroom", type: "sonos", room: "Bedroom", isOn: false, volume: 20 },
  { deviceKey: "porch_light", name: "Porch Light", type: "light", room: "Exterior", isOn: false, brightness: 100 },
  { deviceKey: "kitchen_light", name: "Kitchen Light", type: "light", room: "Kitchen", isOn: true, brightness: 80 },
  { deviceKey: "living_room_light", name: "Living Room Light", type: "light", room: "Living Room", isOn: true, brightness: 60 },
];

async function ensureDevices() {
  const existing = await db.select().from(smartHomeDevicesTable);
  if (existing.length === 0) {
    await db.insert(smartHomeDevicesTable).values(DEFAULT_DEVICES);
    return db.select().from(smartHomeDevicesTable);
  }
  return existing;
}

function serializeDevice(d: typeof smartHomeDevicesTable.$inferSelect) {
  return {
    id: d.id,
    deviceKey: d.deviceKey,
    name: d.name,
    type: d.type,
    room: d.room,
    isOn: d.isOn,
    volume: d.volume ?? null,
    brightness: d.brightness ?? null,
    meta: d.meta ?? null,
    updatedAt: d.updatedAt.toISOString(),
  };
}

router.get("/smarthome/devices", async (req, res) => {
  try {
    const devices = await ensureDevices();
    res.json(devices.map(serializeDevice));
  } catch (err) {
    req.log.error({ err }, "Failed to get devices");
    res.status(500).json({ error: "Failed to get devices" });
  }
});

router.put("/smarthome/devices/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const body = z.object({
      isOn: z.boolean().optional(),
      volume: z.number().optional(),
      brightness: z.number().optional(),
      meta: z.string().optional(),
    }).parse(req.body);

    const [existing] = await db
      .select()
      .from(smartHomeDevicesTable)
      .where(eq(smartHomeDevicesTable.deviceKey, key));

    if (!existing) return res.status(404).json({ error: "Device not found" });

    const [updated] = await db
      .update(smartHomeDevicesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(smartHomeDevicesTable.deviceKey, key))
      .returning();

    res.json(serializeDevice(updated));
  } catch (err) {
    req.log.error({ err }, "Failed to update device");
    res.status(400).json({ error: "Failed to update device" });
  }
});

export default router;
