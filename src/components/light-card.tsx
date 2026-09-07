"use client";
import { useApp } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function kelvinToRgb(k: number): string {
  // Simple warm->cool approximation for the swatch.
  const t = Math.max(0, Math.min(1, (k - 2200) / (6500 - 2200)));
  const r = Math.round(255 - t * 40);
  const g = Math.round(180 + t * 55);
  const b = Math.round(120 + t * 135);
  return `rgb(${r},${g},${b})`;
}

export function LightCard() {
  const { light, status, setPower, setLevel, setCct, identify } = useApp();
  const disabled = status !== "connected";

  return (
    <Card className={disabled ? "opacity-60" : ""}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          💡 Éclairage
          <Badge variant="secondary" className="font-normal">réel</Badge>
        </CardTitle>
        <Switch checked={light.on} disabled={disabled} onCheckedChange={(v) => setPower(v)} />
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Intensité</span>
            <span className="tabular-nums font-medium">{light.level}%</span>
          </div>
          <Slider
            value={[light.level]}
            min={0}
            max={100}
            step={1}
            disabled={disabled}
            onValueChange={(v) => setLevel((v as number[])[0])}
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Température de couleur</span>
            <span className="flex items-center gap-2 tabular-nums font-medium">
              <span className="inline-block h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: kelvinToRgb(light.cct) }} />
              {light.cct} K
            </span>
          </div>
          <Slider
            value={[light.cct]}
            min={2200}
            max={6500}
            step={50}
            disabled={disabled}
            onValueChange={(v) => setCct((v as number[])[0])}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Commande KLV · CurrentDimLevel / CCT</span>
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => identify()}>
            Identifier
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
