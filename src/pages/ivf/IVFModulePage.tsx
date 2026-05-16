import React, { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import EmbryologyTab from "@/components/ivf/EmbryologyTab";
import StimulationTab from "@/components/ivf/StimulationTab";
import AndrologyTab from "@/components/ivf/AndrologyTab";
import EmbryoBankTab from "@/components/ivf/EmbryoBankTab";
import { useHospitalId } from "@/hooks/useHospitalId";
import { supabase } from "@/integrations/supabase/client";

const IVFModulePage = () => {
    const { hospitalId, loading } = useHospitalId();
    const [userId, setUserId] = useState<string | null>(null);

    React.useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) setUserId(user.id);
        });
    }, []);

    const patientId = "patient-mock-uuid";
    const coupleId = "CPL-2026-8921";

    if (loading || !hospitalId) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );

    return (
        <div className="container py-6 h-screen max-h-screen overflow-hidden flex flex-col bg-background">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-hms-teal tracking-tight">IVF & ART Clinic</h1>
                    <span className="text-[14px] text-muted-foreground mt-1 block">
                        Patient ID: {patientId} <span className="mx-2">|</span> ICMR Couple ID: <span className="font-mono text-foreground font-medium">{coupleId}</span>
                    </span>
                </div>
            </div>

            <Card className="flex-1 p-4 overflow-hidden flex flex-col shadow-sm border-border">
                <Tabs defaultValue="embryology" className="w-full flex-1 flex flex-col">
                    <TabsList className="w-fit mb-4 grid grid-cols-4 h-auto p-1">
                        <TabsTrigger value="stimulation" className="text-[14px] py-2">Stimulation</TabsTrigger>
                        <TabsTrigger value="andrology" className="text-[14px] py-2">Andrology</TabsTrigger>
                        <TabsTrigger value="embryology" className="text-[14px] py-2">Embryology</TabsTrigger>
                        <TabsTrigger value="cryobank" className="text-[14px] py-2">Cryobank</TabsTrigger>
                    </TabsList>

                    <TabsContent value="stimulation" className="flex-1 overflow-auto m-0">
                        <StimulationTab />
                    </TabsContent>

                    <TabsContent value="andrology" className="flex-1 overflow-auto m-0">
                        <AndrologyTab />
                    </TabsContent>

                    <TabsContent value="embryology" className="flex-1 overflow-hidden m-0">
                        <EmbryologyTab patientId={patientId} hospitalId={hospitalId} userId={userId || ""} />
                    </TabsContent>

                    <TabsContent value="cryobank" className="flex-1 overflow-auto m-0">
                        <EmbryoBankTab onRefreshKPIs={() => {}} />
                    </TabsContent>
                </Tabs>
            </Card>
        </div>
    );
};

export default IVFModulePage;
