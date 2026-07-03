import { useState, useEffect, useCallback } from "react";
import { Home, Volume2, Lightbulb, Mic, Power, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Device {
  id: number;
  deviceKey: string;
  name: string;
  type: string;
  room: string;
  isOn: boolean;
  volume: number | null;
  brightness: number | null;
  meta: string | null;
  updatedAt: string;
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

const DEVICE_ICONS: Record<string, React.ReactNode> = {
  alexa: <Mic size={20} />,
  sonos: <Volume2 size={20} />,
  light: <Lightbulb size={20} />,
};

const TYPE_COLORS: Record<string, string> = {
  alexa: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  sonos: "text-green-400 border-green-400/30 bg-green-400/10",
  light: "text-primary border-primary/30 bg-primary/10",
};

export function SmartHomePanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/smarthome/devices`);
      const data = await res.json();
      setDevices(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 10000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  const updateDevice = async (key: string, updates: Partial<Device>) => {
    setUpdating(key);
    try {
      const res = await fetch(`${BASE_URL}/api/smarthome/devices/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const updated = await res.json();
      setDevices((prev) => prev.map((d) => (d.deviceKey === key ? updated : d)));
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(null);
    }
  };

  const roomGroups = devices.reduce((acc, device) => {
    if (!acc[device.room]) acc[device.room] = [];
    acc[device.room].push(device);
    return acc;
  }, {} as Record<string, Device[]>);

  const onlineCount = devices.filter((d) => d.isOn).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="h-12 w-12 border-2 border-primary/40 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground font-display uppercase tracking-widest">Loading Devices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Home className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-display font-bold text-primary tracking-widest uppercase">Smart Home</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              {onlineCount} of {devices.length} devices active
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-3">
            {Object.entries({ alexa: "Alexa", sonos: "Sonos", light: "Lights" }).map(([type, label]) => {
              const count = devices.filter((d) => d.type === type && d.isOn).length;
              const total = devices.filter((d) => d.type === type).length;
              return (
                <div key={type} className={`px-3 py-1 rounded-sm border text-xs font-display uppercase tracking-widest ${TYPE_COLORS[type]}`}>
                  {DEVICE_ICONS[type]} {count}/{total}
                </div>
              );
            })}
          </div>
          <button
            onClick={fetchDevices}
            className="p-2 text-muted-foreground hover:text-foreground border border-border rounded-sm hover:bg-secondary transition-colors"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <div className="p-8 space-y-8">
        {Object.entries(roomGroups).map(([room, roomDevices]) => (
          <section key={room}>
            <h2 className="text-xl font-display text-muted-foreground uppercase tracking-widest mb-4 border-b border-border/30 pb-2">
              {room}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {roomDevices.map((device) => (
                <DeviceCard
                  key={device.deviceKey}
                  device={device}
                  isUpdating={updating === device.deviceKey}
                  onToggle={() => updateDevice(device.deviceKey, { isOn: !device.isOn })}
                  onVolumeChange={(v) => updateDevice(device.deviceKey, { volume: v })}
                  onBrightnessChange={(v) => updateDevice(device.deviceKey, { brightness: v })}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function DeviceCard({
  device,
  isUpdating,
  onToggle,
  onVolumeChange,
  onBrightnessChange,
}: {
  device: Device;
  isUpdating: boolean;
  onToggle: () => void;
  onVolumeChange: (v: number) => void;
  onBrightnessChange: (v: number) => void;
}) {
  const colorClass = TYPE_COLORS[device.type] ?? "text-muted-foreground border-border bg-secondary";

  return (
    <Card className={`transition-all ${device.isOn ? `border-l-4 ${device.type === "alexa" ? "border-l-blue-400" : device.type === "sonos" ? "border-l-green-400" : "border-l-yellow-400"}` : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-sm border ${colorClass}`}>
              {DEVICE_ICONS[device.type] ?? <Power size={20} />}
            </div>
            <div>
              <CardTitle className="text-base font-display tracking-wider">{device.name}</CardTitle>
              <p className="text-xs text-muted-foreground uppercase tracking-widest">{device.type}</p>
            </div>
          </div>
          <button
            onClick={onToggle}
            disabled={isUpdating}
            className={`relative h-10 w-18 px-4 rounded-full border font-display text-xs uppercase tracking-widest transition-all font-bold ${
              device.isOn
                ? "bg-primary/20 border-primary text-primary"
                : "bg-secondary border-border text-muted-foreground hover:border-foreground/30"
            } disabled:opacity-50`}
          >
            {isUpdating ? (
              <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin mx-auto" />
            ) : (
              device.isOn ? "ON" : "OFF"
            )}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {device.volume !== null && (
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Volume</label>
              <span className="text-xs text-primary font-display font-bold">{device.volume}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={device.volume}
              onChange={(e) => onVolumeChange(parseInt(e.target.value))}
              className="w-full accent-primary"
              disabled={!device.isOn}
            />
          </div>
        )}
        {device.brightness !== null && (
          <div className="space-y-1">
            <div className="flex justify-between">
              <label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Brightness</label>
              <span className="text-xs text-primary font-display font-bold">{device.brightness}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={device.brightness}
              onChange={(e) => onBrightnessChange(parseInt(e.target.value))}
              className="w-full accent-primary"
              disabled={!device.isOn}
            />
          </div>
        )}
        {!device.volume && !device.brightness && (
          <p className="text-xs text-muted-foreground/40 font-display uppercase tracking-widest">
            {device.isOn ? "Active" : "Standby"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
