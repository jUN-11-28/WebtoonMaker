"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CharacterManager } from "./character-manager";
import { LocationManager } from "./location-manager";
import { PropsManager } from "./props-manager";
import { ExtractFromText } from "./extract-from-text";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Users, MapPin, Package, Wand2 } from "lucide-react";

interface Character {
  id: string; char_key: string; name: string;
  bible: Record<string, string> | null;
  reference_image_url: string | null; locked: boolean;
}
interface Location {
  id: string; loc_key: string; name: string;
  reference_image_url: string | null; locked: boolean;
}

interface Prop {
  id: string; prop_key: string; name: string;
  description: string | null; visual_core: string | null;
  reference_image_url: string | null; locked: boolean;
}

interface SetupClientProps {
  webtoonId: string;
  projectStyle: string;
  initialCharacters: Character[];
  initialLocations: Location[];
  initialProps: Prop[];
}

export function SetupClient({ webtoonId, projectStyle, initialCharacters, initialLocations, initialProps }: SetupClientProps) {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>(initialCharacters as Character[]);
  const [locations, setLocations] = useState<Location[]>(initialLocations as Location[]);
  const [propsList, setPropsList] = useState<Prop[]>(initialProps as Prop[]);

  const withImage = {
    chars: characters.filter((c) => c.reference_image_url).length,
    locs: locations.filter((l) => l.reference_image_url).length,
    props: propsList.filter((p) => p.reference_image_url).length,
  };

  return (
    <div className="space-y-6">
      {/* 진행 상황 요약 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{characters.length}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <Users className="h-3 w-3" />캐릭터
            {withImage.chars > 0 && (
              <span className="text-green-600 font-medium">({withImage.chars}이미지)</span>
            )}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{locations.length}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <MapPin className="h-3 w-3" />장소
            {withImage.locs > 0 && (
              <span className="text-green-600 font-medium">({withImage.locs}이미지)</span>
            )}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 text-center">
          <p className="text-2xl font-bold">{propsList.length}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <Package className="h-3 w-3" />소품
            {withImage.props > 0 && (
              <span className="text-green-600 font-medium">({withImage.props}이미지)</span>
            )}
          </p>
        </div>
      </div>

      <Tabs defaultValue="characters">
        <TabsList className="mb-4">
          <TabsTrigger value="characters" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            캐릭터 ({characters.length})
          </TabsTrigger>
          <TabsTrigger value="locations" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            장소 ({locations.length})
          </TabsTrigger>
          <TabsTrigger value="props" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            소품 ({propsList.length})
          </TabsTrigger>
          <TabsTrigger value="extract" className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            AI 추출
          </TabsTrigger>
        </TabsList>

        <TabsContent value="characters">
          <CharacterManager
            webtoonId={webtoonId}
            projectStyle={projectStyle}
            characters={characters}
            onChange={setCharacters}
          />
        </TabsContent>
        <TabsContent value="locations">
          <LocationManager
            webtoonId={webtoonId}
            projectStyle={projectStyle}
            locations={locations}
            onChange={setLocations}
          />
        </TabsContent>
        <TabsContent value="props">
          <PropsManager
            webtoonId={webtoonId}
            projectStyle={projectStyle}
            props={propsList}
            onChange={setPropsList}
          />
        </TabsContent>
        <TabsContent value="extract">
          <ExtractFromText
            webtoonId={webtoonId}
            onExtracted={(newChars, newLocs) => {
              // extract-from-text에서 DB 저장 후 실제 id가 포함된 객체를 전달
              setCharacters((prev) => {
                const keys = new Set(prev.map((c) => c.char_key));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const toAdd = (newChars as any[]).filter((c) => !keys.has(c.char_key)) as Character[];
                return [...prev, ...toAdd];
              });
              setLocations((prev) => {
                const keys = new Set(prev.map((l) => l.loc_key));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const toAdd = (newLocs as any[]).filter((l) => !keys.has(l.loc_key)) as Location[];
                return [...prev, ...toAdd];
              });
            }}
          />
        </TabsContent>
      </Tabs>

      {/* 대시보드로 */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={() => router.push(`/studio/${webtoonId}`)} size="lg">
          대시보드로 →
        </Button>
      </div>
    </div>
  );
}
