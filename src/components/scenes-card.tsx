"use client";
import { useApp } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ScenesCard() {
  const { scenes, activeScene, status, recallScene } = useApp();
  const disabled = status !== "connected";

  return (
    <Card className={disabled ? "opacity-60" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          🎬 Scènes
          <Badge variant="outline" className="font-normal">éclairage réel · climat simulé</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {scenes.map((s) => {
            const active = activeScene === s.id;
            return (
              <button
                key={s.id}
                disabled={disabled}
                onClick={() => recallScene(s.id)}
                className={`group flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors disabled:cursor-not-allowed ${
                  active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
                }`}
              >
                <span className="text-3xl transition-transform group-hover:scale-110">{s.emoji}</span>
                <span className="text-sm font-medium">{s.name}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
