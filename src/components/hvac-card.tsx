"use client";
import { useApp, type HvacMode } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const MODES: { id: HvacMode; label: string; emoji: string }[] = [
  { id: "off", label: "Arrêt", emoji: "⏻" },
  { id: "heat", label: "Chauffage", emoji: "🔥" },
  { id: "cool", label: "Clim", emoji: "❄️" },
  { id: "auto", label: "Auto", emoji: "🔄" },
];

export function HvacCard() {
  const { hvac, status, setHvac } = useApp();
  const disabled = status !== "connected";

  return (
    <Card className={disabled ? "opacity-60" : ""}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          🌡️ Climat
          <Badge variant="outline" className="font-normal">simulé</Badge>
        </CardTitle>
        <span className="text-2xl font-semibold tabular-nums">{hvac.setpoint}°C</span>
      </CardHeader>
      <CardContent className="space-y-6">
        <Slider
          value={[hvac.setpoint]}
          min={16}
          max={28}
          step={0.5}
          disabled={disabled}
          onValueChange={(v) => setHvac({ setpoint: (v as number[])[0] })}
        />

        <div className="grid grid-cols-4 gap-2">
          {MODES.map((m) => (
            <Button
              key={m.id}
              variant={hvac.mode === m.id ? "default" : "outline"}
              size="sm"
              disabled={disabled}
              className="flex-col h-auto py-2"
              onClick={() => setHvac({ mode: m.id })}
            >
              <span className="text-base leading-none">{m.emoji}</span>
              <span className="mt-1 text-[11px]">{m.label}</span>
            </Button>
          ))}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Ventilation</span>
            <span className="font-medium">{["Arrêt", "Faible", "Moyen", "Fort"][hvac.fan]}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((f) => (
              <Button
                key={f}
                variant={hvac.fan === f ? "secondary" : "ghost"}
                size="sm"
                disabled={disabled}
                onClick={() => setHvac({ fan: f as 0 | 1 | 2 | 3 })}
              >
                {"›".repeat(f) || "○"}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
