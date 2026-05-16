import React, { useState } from "react";
import SettingsPageWrapper from "@/components/settings/SettingsPageWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Copy, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ApiKey { id: string; name: string; prefix: string; created: string; lastUsed: string; active: boolean; }

const mockKeys: ApiKey[] = [
  { id: "1", name: "Mobile App Integration", prefix: "hms_live_a8f3", created: "15 Jan 2026", lastUsed: "27 Mar 2026", active: true },
  { id: "2", name: "Lab Equipment API", prefix: "hms_live_b2c7", created: "01 Feb 2026", lastUsed: "26 Mar 2026", active: true },
];

const SettingsAPIKeysPage: React.FC = () => {
  const { toast } = useToast();
  const [keys, setKeys] = useState(mockKeys);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState("");

  const generate = () => {
    const key = `hms_live_${Math.random().toString(36).substring(2, 30)}`;
    setGeneratedKey(key);
    setKeys([...keys, { id: Date.now().toString(), name: newKeyName, prefix: key.substring(0, 13), created: "Today", lastUsed: "Never", active: true }]);
    setShowGenerate(false);
    setShowKey(true);
    setNewKeyName("");
  };

  const copyKey = () => {
    navigator.clipboard.writeText(generatedKey);
    toast({ title: "API key copied to clipboard" });
  };

  const revoke = (id: string) => {
    setKeys(keys.map((k) => k.id === id ? { ...k, active: false } : k));
    toast({ title: "API key revoked" });
  };

  return (
    <SettingsPageWrapper title="API Keys" hideSave>
      <p className="text-sm text-muted-foreground mb-4">API keys allow external systems to connect to your HMS. Each key is shown only once — store it securely.</p>

      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => setShowGenerate(true)} className="gap-1"><Plus size={14} /> Generate New Key</Button>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/50 text-left">
            <th className="px-4 py-2.5 font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-2.5 font-medium text-muted-foreground">Key</th>
            <th className="px-4 py-2.5 font-medium text-muted-foreground">Created</th>
            <th className="px-4 py-2.5 font-medium text-muted-foreground">Last Used</th>
            <th className="px-4 py-2.5 font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
          </tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-t border-border">
                <td className="px-4 py-2.5 font-medium text-foreground">{k.name}</td>
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{k.prefix}••••••••</td>
                <td className="px-4 py-2.5 text-muted-foreground">{k.created}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{k.lastUsed}</td>
                <td className="px-4 py-2.5"><Badge variant={k.active ? "default" : "destructive"}>{k.active ? "Active" : "Revoked"}</Badge></td>
                <td className="px-4 py-2.5">
                  {k.active && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => revoke(k.id)}>Revoke</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate New API Key</DialogTitle></DialogHeader>
          <div><Label>Key Name</Label><Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g., Mobile App Integration" className="mt-1" /></div>
          <DialogFooter><Button onClick={generate} disabled={!newKeyName.trim()}>Generate</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showKey} onOpenChange={setShowKey}>
        <DialogContent className="bg-slate-900 text-white border-slate-700">
          <DialogHeader><DialogTitle className="text-white">API Key Generated</DialogTitle></DialogHeader>
          <div className="flex items-start gap-2 bg-amber-500/20 border border-amber-500/30 rounded-lg p-3 mb-4">
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-200">Copy this key now — it won't be shown again</p>
          </div>
          <div className="bg-slate-800 rounded-lg p-4 font-mono text-sm text-green-400 break-all">{generatedKey}</div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={copyKey} className="gap-1 border-slate-600 text-white hover:bg-slate-800"><Copy size={14} /> Copy Key</Button>
            <Button onClick={() => setShowKey(false)} className="bg-white text-slate-900 hover:bg-slate-200">I've saved it — Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageWrapper>
  );
};

export default SettingsAPIKeysPage;
